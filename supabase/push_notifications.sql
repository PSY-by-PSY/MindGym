-- ════════════════════════════════════════════════════════════════════════
-- 遠端推播（APNs）所需的資料表與觸發器
--   1. device_tokens：每台裝置的 APNs token ←→ user_id
--   2. likes / comments 新增時 → 用 pg_net 打 Edge Function `push-notify`
--
-- 手動在 Supabase SQL Editor 執行（沿用本專案慣例：SQL 不自動部署）。
-- 執行前先把下方兩個 <...> 佔位字串換成你的值（見檔尾說明）。
-- ════════════════════════════════════════════════════════════════════════

-- 1) 裝置 token 表 ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_tokens (
  token       text PRIMARY KEY,                                   -- APNs device token（同一台裝置唯一）
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform    text NOT NULL DEFAULT 'ios',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens(user_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- 使用者只能管理自己的 token（後端 Edge Function 用 service_role 讀全部、繞過 RLS）
DROP POLICY IF EXISTS "device_tokens: 本人可讀"   ON device_tokens;
DROP POLICY IF EXISTS "device_tokens: 本人可寫"   ON device_tokens;
DROP POLICY IF EXISTS "device_tokens: 本人可更新" ON device_tokens;
DROP POLICY IF EXISTS "device_tokens: 本人可刪除" ON device_tokens;
CREATE POLICY "device_tokens: 本人可讀"   ON device_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "device_tokens: 本人可寫"   ON device_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "device_tokens: 本人可更新" ON device_tokens FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "device_tokens: 本人可刪除" ON device_tokens FOR DELETE USING (auth.uid() = user_id);


-- 2) 觸發器：按讚／留言新增 → 呼叫 Edge Function ─────────────────────────────
-- 用 pg_net 非同步 POST（pg_cron 已在用，pg_net 通常一併可用）。
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_push_on_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- ⚠️ 整段包在 EXCEPTION 裡：推播失敗「絕對不可以」讓使用者的留言或按讚消失。
  --
  --    這是 AFTER INSERT trigger，在同一筆交易裡執行。只要這裡拋出例外，
  --    Postgres 會把整筆交易回滾——使用者的留言就這樣被吞掉，而且前端收到的
  --    是一個看起來與留言無關的錯誤。
  --
  --    最容易踩到的情況：下面的 <FUNCTION_URL> 佔位字串沒有換成真實網址就執行
  --    這支檔案。那樣每一次留言與按讚都會失敗，症狀是「所有人都留不了言」，
  --    但錯誤訊息完全不會提到推播。
  --
  --    推播送不出去只是少一則通知，可以容忍；留言寫不進去不行。
  BEGIN
    PERFORM net.http_post(
      url     := '<FUNCTION_URL>',            -- 例：https://<project-ref>.supabase.co/functions/v1/push-notify
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-webhook-secret', '<WEBHOOK_SECRET>'  -- 與 Edge Function 的 WEBHOOK_SECRET 相同
                 ),
      body    := jsonb_build_object(
                   'type',  'INSERT',
                   'table', TG_TABLE_NAME,
                   'record', to_jsonb(NEW)
                 )
    );
  EXCEPTION WHEN OTHERS THEN
    -- 留一筆 WARNING 到 Postgres log，方便事後查為什麼沒收到推播。
    RAISE WARNING '[notify_push_on_interaction] 推播送出失敗，已略過：% (%)', SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

-- 機器人讚（is_bot=true，schedule/backfill 灌的）不推播，免得洗版。
ALTER TABLE likes ADD COLUMN IF NOT EXISTS is_bot boolean DEFAULT false;

DROP TRIGGER IF EXISTS likes_push    ON likes;
DROP TRIGGER IF EXISTS comments_push ON comments;
CREATE TRIGGER likes_push    AFTER INSERT ON likes    FOR EACH ROW WHEN (NEW.is_bot IS NOT TRUE) EXECUTE FUNCTION notify_push_on_interaction();
CREATE TRIGGER comments_push AFTER INSERT ON comments FOR EACH ROW EXECUTE FUNCTION notify_push_on_interaction();

-- ────────────────────────────────────────────────────────────────────────
-- 執行前要換掉的兩個值：
--   <FUNCTION_URL>     = https://<你的 project ref>.supabase.co/functions/v1/push-notify
--   <WEBHOOK_SECRET>   = 自訂一組隨機字串；同一組也要設到 Edge Function 的 WEBHOOK_SECRET secret
-- 詳細部署步驟見 docs/reports/push_setup.md
-- ────────────────────────────────────────────────────────────────────────
