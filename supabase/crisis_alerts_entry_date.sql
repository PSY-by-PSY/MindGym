-- ════════════════════════════════════════════════════════════════════════
-- crisis_alerts.entry_created_at：警示對應那篇日記的發文時間
--
-- 後台「危機警示總覽」原本顯示警示的 created_at，那是判讀的時間；補判舊日記時
-- 全部會是同一天，看不出使用者是哪天寫的。後端寫入警示時會一併記下發文時間
-- （backend/app.py 的 /api/diary/safety-check）。
--
-- 為什麼另存一欄、不在前端 join gratitude_entries：私密日記受 RLS 保護，
-- admin 不該因為這個需求就能讀所有私密日記。
--
-- ⚠️ 要在部署新版後端「之前」執行：新版後端寫入時會帶這個欄位，欄位不存在會寫入失敗。
-- 手動在 Supabase SQL Editor 執行，可重複執行。
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS entry_created_at timestamptz;

-- 補上既有警示的發文時間
UPDATE crisis_alerts a
SET entry_created_at = g.created_at
FROM gratitude_entries g
WHERE g.id = a.diary_entry_id
  AND a.entry_created_at IS NULL;

CREATE INDEX IF NOT EXISTS crisis_alerts_entry_created_idx ON crisis_alerts (entry_created_at DESC NULLS LAST);
