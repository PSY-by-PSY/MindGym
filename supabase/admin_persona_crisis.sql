-- ════════════════════════════════════════════════════════════════════════
-- 後台「使用者 Persona」＋ 每日練習的危機偵測與通知信
--
--   1. user_personas、persona_refresh_runs：後台 persona 分頁的資料（只有 admin 讀得到）
--   2. crisis_alerts 擴充成也能記錄每日練習（gratitude_entries）的警示
--   3. gratitude_entries 新增／修改 → 用 pg_net 呼叫後端 /api/diary/safety-check
--
-- 手動在 Supabase SQL Editor 執行（沿用本專案慣例：SQL 不自動部署）。可重複執行。
-- 執行前先把第 3 節的 <DIARY_WEBHOOK_SECRET> 換成一組隨機字串，
-- 並在 Render 後端設定同名環境變數 DIARY_WEBHOOK_SECRET（見檔尾說明）。
-- ════════════════════════════════════════════════════════════════════════


-- 1) persona ───────────────────────────────────────────────────────────────
-- 由後端用 service key 寫入；前端只有 admin 能讀。只用公開日記產生（見 backend/persona_builder.py）。
CREATE TABLE IF NOT EXISTS user_personas (
  user_id       uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  data          jsonb NOT NULL,
  entry_count   integer NOT NULL DEFAULT 0,   -- 產生時的公開日記篇數
  entries_used  integer NOT NULL DEFAULT 0,   -- 實際送進模型的篇數（太長時只取最近的）
  restricted    boolean NOT NULL DEFAULT false, -- 疑似未成年或近期有自傷內容：不做自動化個人化
  model         text,
  version       integer NOT NULL DEFAULT 1,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS persona_refresh_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  min_entries  integer NOT NULL DEFAULT 40,
  total        integer,
  done         integer NOT NULL DEFAULT 0,
  failed       integer NOT NULL DEFAULT 0,
  error        text,
  started_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX IF NOT EXISTS persona_refresh_runs_started_idx ON persona_refresh_runs (started_at DESC);

ALTER TABLE user_personas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_refresh_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_personas: admin 可讀"        ON user_personas;
DROP POLICY IF EXISTS "persona_refresh_runs: admin 可讀" ON persona_refresh_runs;
CREATE POLICY "user_personas: admin 可讀"        ON user_personas        FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "persona_refresh_runs: admin 可讀" ON persona_refresh_runs FOR SELECT USING (is_admin(auth.uid()));
-- 刻意不開 INSERT/UPDATE policy：只有後端（service key）寫得進去。


-- 2) crisis_alerts 擴充 ─────────────────────────────────────────────────────
-- 原本只給專業模組用：practitioner_id NOT NULL、entry_id 指向 pro_entries。
-- 每日練習沒有專業夥伴，所以 practitioner_id 改成可空，另開 diary_entry_id。
-- 專業夥伴的 RLS 是 practitioner_id = auth.uid()，NULL 的列他們本來就看不到，不受影響。
ALTER TABLE crisis_alerts ALTER COLUMN practitioner_id DROP NOT NULL;
ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT 'pro';
ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS diary_entry_id uuid REFERENCES gratitude_entries(id) ON DELETE CASCADE;
ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS notified_at timestamptz;

DO $$ BEGIN
  ALTER TABLE crisis_alerts ADD CONSTRAINT crisis_alerts_context_check CHECK (context IN ('pro', 'diary'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 同一篇日記只會有一筆警示：使用者之後編輯同一篇，不會重複寄信。
-- 用完整 UNIQUE（不是 partial index），後端 upsert 的 on_conflict=diary_entry_id 才能用。
-- NULL 不互相衝突，所以不影響專業模組的舊資料。
DO $$ BEGIN
  ALTER TABLE crisis_alerts ADD CONSTRAINT crisis_alerts_diary_entry_unique UNIQUE (diary_entry_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- 後台可以按「已知悉」。
DROP POLICY IF EXISTS "crisis_alerts: admin 可更新" ON crisis_alerts;
CREATE POLICY "crisis_alerts: admin 可更新" ON crisis_alerts FOR UPDATE USING (is_admin(auth.uid()));


-- 3) 每日練習寫入 → 後端危機判讀 ─────────────────────────────────────────────
-- 放在資料庫層，才能涵蓋所有寫入路徑（感恩日記、過程目標覺察、自我慈悲、WOOP、工作坊，
-- 以及直接打 PostgREST 的寫入），包含私密日記。
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_diary_safety_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ⚠️ 整段包在 EXCEPTION 裡：判讀服務掛掉「絕對不可以」讓使用者的日記存不進去
  --    （同 push_notifications.sql 的理由：AFTER trigger 拋例外會回滾整筆交易）。
  BEGIN
    PERFORM net.http_post(
      url     := 'https://mindgym-api-aj7z.onrender.com/api/diary/safety-check',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-webhook-secret', '<DIARY_WEBHOOK_SECRET>'  -- 與 Render 的 DIARY_WEBHOOK_SECRET 相同
                 ),
      body    := jsonb_build_object('entry_id', NEW.id),
      -- Render 冷啟動可能要數十秒；pg_net 是非同步的，這裡只影響它等回應多久。
      timeout_milliseconds := 60000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[notify_diary_safety_check] 危機判讀請求送出失敗，已略過：% (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gratitude_entries_safety_check        ON gratitude_entries;
DROP TRIGGER IF EXISTS gratitude_entries_safety_check_update ON gratitude_entries;
CREATE TRIGGER gratitude_entries_safety_check
  AFTER INSERT ON gratitude_entries
  FOR EACH ROW EXECUTE FUNCTION notify_diary_safety_check();
-- 修改時只在內容真的變了才判讀（例如切換公開／私密、按讚數變動都不會觸發）。
CREATE TRIGGER gratitude_entries_safety_check_update
  AFTER UPDATE OF item_1, item_2, item_3, payload ON gratitude_entries
  FOR EACH ROW
  WHEN (OLD.item_1  IS DISTINCT FROM NEW.item_1
     OR OLD.item_2  IS DISTINCT FROM NEW.item_2
     OR OLD.item_3  IS DISTINCT FROM NEW.item_3
     OR OLD.payload IS DISTINCT FROM NEW.payload)
  EXECUTE FUNCTION notify_diary_safety_check();


-- ════════════════════════════════════════════════════════════════════════
-- 部署說明
--
-- A. Render（mindgym-api）新增環境變數：
--      DIARY_WEBHOOK_SECRET  隨機長字串，與上面第 3 節的 <DIARY_WEBHOOK_SECRET> 相同
--      RESEND_API_KEY        用 psybypsy01@gmail.com 註冊 Resend 後產生的 API key
--      （選填）CRISIS_EMAIL_TO    預設 psybypsy01@gmail.com
--      （選填）CRISIS_EMAIL_FROM  預設 "PsyByPsy 危機警示 <onboarding@resend.dev>"；
--              沒有驗證自己的網域時，Resend 只允許寄給註冊帳號本人，所以收件人必須是
--              註冊 Resend 用的那個信箱。
--      （選填）ADMIN_URL          預設 https://mind-gym-kappa.vercel.app/admin
--    先部署後端，再執行這支 SQL，否則觸發器打過去會拿到 401（不影響存檔，只是那段時間的日記不會被判讀）。
--
-- B. 執行這支 SQL。
--
-- C. 測試：用測試帳號寫一篇私密感恩日記，內容含「想消失」，1 分鐘內：
--      - 後台「危機警示總覽」出現一筆「每日練習」警示
--      - psybypsy01@gmail.com 收到通知信
--    查 pg_net 的送出紀錄：SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;
-- ════════════════════════════════════════════════════════════════════════
