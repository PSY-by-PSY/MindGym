-- ════════════════════════════════════════════════════════════════════════
-- crisis_alerts 的「團隊人工確認」
--
-- 後台原本沿用 acknowledged_at（「已知悉」），但那個欄位是專業夥伴在用的：
-- 專業模組的警示，諮商師在 /therapist 也按同一個欄位，團隊在後台按了，
-- 那筆警示就會從諮商師的待處理清單消失。所以團隊另外有自己的欄位，
-- acknowledged_at 留給諮商師專用。
--
-- 只能透過 admin_review_crisis_alert() 寫入：確認人（reviewed_by）與確認時間
-- 由資料庫依登入身分填入，前端改不了，不會被冒用。
--
-- 手動在 Supabase SQL Editor 執行，可重複執行。
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS review_status text;
ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS review_note   text;
ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS reviewed_by   uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS reviewed_at   timestamptz;

DO $$ BEGIN
  ALTER TABLE crisis_alerts ADD CONSTRAINT crisis_alerts_review_status_check
    CHECK (review_status IN ('needs_attention', 'handled', 'false_positive'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 後台的「未確認」篩選用。
CREATE INDEX IF NOT EXISTS crisis_alerts_review_status_idx ON crisis_alerts (review_status, entry_created_at DESC NULLS LAST);

-- 寫入一律走這支：可以重複呼叫來改結果或備註，每次都更新確認人與時間。
CREATE OR REPLACE FUNCTION admin_review_crisis_alert(p_alert_id uuid, p_status text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  IF p_status NOT IN ('needs_attention', 'handled', 'false_positive') THEN
    RAISE EXCEPTION '確認結果只能是 needs_attention、handled 或 false_positive';
  END IF;
  UPDATE crisis_alerts
    SET review_status = p_status,
        review_note   = NULLIF(btrim(p_note), ''),
        reviewed_by   = auth.uid(),
        reviewed_at   = now()
    WHERE id = p_alert_id;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到這筆警示'; END IF;
END; $$;

REVOKE ALL ON FUNCTION admin_review_crisis_alert(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_review_crisis_alert(uuid, text, text) TO authenticated;

-- 後台不再直接更新 crisis_alerts（原本是為了「標記已知悉」），收回這條 policy，
-- 避免 admin 從前端直接改到諮商師的 acknowledged_at 或其他欄位。
DROP POLICY IF EXISTS "crisis_alerts: admin 可更新" ON crisis_alerts;
