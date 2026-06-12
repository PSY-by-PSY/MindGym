-- ============================================================
-- 用量／成本監測（usage_monitor.py 使用）
--
-- 兩個物件：
--   1. usage_snapshots  ── 每天一次的用量快照，後續用來算趨勢與容量。
--   2. get_db_size_bytes() ── 讓監測腳本用 service_role key 經由
--      PostgREST RPC 取得目前資料庫大小（免費方案上限 500 MB）。
--
-- 套用方式（任選一）：
--   • Supabase Dashboard → SQL Editor 貼上整段執行。
--   • psql "$DATABASE_URL" -f supabase/usage_monitor.sql
-- ============================================================

-- ── 1. 快照表 ────────────────────────────────────────────────
-- 每個來源的每個指標，每天寫一列。value/limit/pct 為通用欄位；
-- AI 兩家額外帶 cost_usd；raw 保留原始回應方便日後除錯。
CREATE TABLE IF NOT EXISTS usage_snapshots (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at  timestamptz NOT NULL DEFAULT now(),
  source       text NOT NULL,          -- anthropic / openai / supabase / vercel / render / posthog
  metric       text NOT NULL,          -- 例：cost_usd_today / db_mb / events_month
  value        double precision,       -- 當前用量
  unit         text,                   -- usd / mb / gb / count / hours …
  limit_value  double precision,       -- 免費上限（無上限則 NULL，例如 AI 花費）
  pct          double precision,       -- value / limit_value * 100（無上限則 NULL）
  cost_usd     double precision,       -- 該指標對應的花費（僅 AI 兩家有值）
  raw          jsonb,                  -- 原始 API 回應片段
  CONSTRAINT usage_snapshots_unique UNIQUE (captured_at, source, metric)
);

CREATE INDEX IF NOT EXISTS usage_snapshots_source_time
  ON usage_snapshots (source, captured_at DESC);

-- 這張表只有後端（service_role）會寫入；前端不需存取。
-- 開啟 RLS 但不建任何 policy，等於只有 service_role 能讀寫。
ALTER TABLE usage_snapshots ENABLE ROW LEVEL SECURITY;

-- ── 2. 資料庫大小查詢函式 ────────────────────────────────────
-- security definer：以函式擁有者權限執行 pg_database_size，
-- 讓監測腳本不必連 psql 也能拿到 DB 大小。
CREATE OR REPLACE FUNCTION public.get_db_size_bytes()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT pg_database_size(current_database());
$$;

-- 僅允許 service_role 呼叫（匿名／登入使用者不該看到 DB 大小）。
REVOKE ALL ON FUNCTION public.get_db_size_bytes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_db_size_bytes() TO service_role;

-- ── 3. AI 用量記帳表（軌道一：自行計量）────────────────────────
-- 後端每次呼叫 Claude / Whisper 後，把該次的 token 數與換算金額寫一列。
-- 這條路線只需一般 API key（不需 Anthropic 個人帳戶拿不到的 Admin Key），
-- 且帶有 source / user_id，方便日後算「每功能、每使用者」的成本（容量規劃）。
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  provider      text NOT NULL,              -- anthropic / openai
  source        text NOT NULL,              -- 哪個功能：gratitude / report / whisper …
  model         text NOT NULL,              -- claude-sonnet-4-6 / whisper-1 …
  user_id       uuid,                       -- 觸發者（可為 NULL）；做 per-user 成本用
  input_tokens          integer,
  output_tokens         integer,
  cache_write_tokens    integer,            -- cache_creation_input_tokens
  cache_read_tokens     integer,            -- cache_read_input_tokens
  audio_seconds         numeric,            -- 僅 Whisper 有值
  cost_usd      numeric NOT NULL DEFAULT 0  -- 後端依價目表當場換算
);

CREATE INDEX IF NOT EXISTS ai_usage_log_created_at ON ai_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_log_source     ON ai_usage_log (source, created_at DESC);

-- 只有後端（service_role）寫入，前端不需存取。開 RLS 不建 policy = 僅 service_role。
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

-- ── 4. AI 花費彙總函式（usage_monitor.py 讀取）────────────────
-- 一次回傳今日／本月總花費、依 provider 拆分、以及本月各功能（source）明細。
-- 時間以 UTC 為準（Supabase 預設時區），與 usage_monitor.py 的 UTC 邏輯一致。
CREATE OR REPLACE FUNCTION public.ai_usage_summary()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'today_usd', COALESCE((SELECT sum(cost_usd) FROM ai_usage_log
        WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')), 0),
    'month_usd', COALESCE((SELECT sum(cost_usd) FROM ai_usage_log
        WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')), 0),
    'by_provider', COALESCE((
        SELECT jsonb_object_agg(provider, totals) FROM (
          SELECT provider, jsonb_build_object(
            'today', COALESCE(sum(cost_usd) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')), 0),
            'month', COALESCE(sum(cost_usd) FILTER (WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')), 0)
          ) AS totals
          FROM ai_usage_log
          WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')
          GROUP BY provider
        ) p
    ), '{}'::jsonb),
    'month_by_source', COALESCE((
        SELECT jsonb_object_agg(source, s) FROM (
          SELECT source, round(sum(cost_usd), 4) AS s FROM ai_usage_log
          WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')
          GROUP BY source
        ) t
    ), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.ai_usage_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_usage_summary() TO service_role;
