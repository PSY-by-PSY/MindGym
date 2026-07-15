-- ============================================================
-- MindGym — 我的日程（Daily Schedule）Schema
-- 可重複執行（冪等）：CREATE IF NOT EXISTS + DROP POLICY IF EXISTS
-- 在 Supabase Dashboard > SQL Editor 執行此檔案
--
-- 使用者在「健心訓練中心 → 我的日程」用週曆挑選某一天，按 + 勾選當天要做的
-- 練習（practice_key），存成一列。是否「已完成」不額外存欄位，前端即時查
-- gratitude_entries / focus_logs 判斷（避免兩處資料不同步）。
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_schedule (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  schedule_date  date NOT NULL,
  practice_key   text NOT NULL,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (user_id, schedule_date, practice_key)
);

CREATE INDEX IF NOT EXISTS daily_schedule_user_date_idx ON daily_schedule (user_id, schedule_date);

ALTER TABLE daily_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_schedule: 本人可讀"   ON daily_schedule;
DROP POLICY IF EXISTS "daily_schedule: 本人可建立" ON daily_schedule;
DROP POLICY IF EXISTS "daily_schedule: 本人可刪除" ON daily_schedule;

CREATE POLICY "daily_schedule: 本人可讀"   ON daily_schedule FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "daily_schedule: 本人可建立" ON daily_schedule FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "daily_schedule: 本人可刪除" ON daily_schedule FOR DELETE USING (auth.uid() = user_id);
