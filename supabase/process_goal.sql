-- ============================================================
-- MindGym — 過程目標覺察（Process Goal Awareness）Schema
-- 可重複執行（idempotent）：CREATE IF NOT EXISTS + DROP POLICY IF EXISTS
-- 在 Supabase Dashboard > SQL Editor 執行此檔案
--
-- 設計沿用最新慣例：前端以 anon key + RLS 直接寫入（auth.uid() = user_id），
-- 後端只負責 AI 呼叫，不碰這些資料表。
-- ============================================================

-- ============================================================
-- immersion_map（沈浸地圖）— 每位使用者一份，可更新
-- user_id 設 UNIQUE，前端用 upsert(onConflict: user_id) 覆寫。
-- ============================================================
CREATE TABLE IF NOT EXISTS immersion_map (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  scene_description text,           -- 那件事的一句話描述（Step 1）
  who               text,           -- 人
  what              text,           -- 事（取自 Step 1 場景）
  when_time         text,           -- 時
  where_place       text,           -- 地
  with_what         text,           -- 物
  feelings          text[] DEFAULT '{}',  -- 感受標籤
  why_summary       text,           -- why 收斂句
  one_sentence      text,           -- 收斂的一句話
  condition_tags    text[] DEFAULT '{}',  -- 條件標籤（供 AI 檢索）
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE immersion_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "immersion_map: 本人可讀"   ON immersion_map;
DROP POLICY IF EXISTS "immersion_map: 本人可建立" ON immersion_map;
DROP POLICY IF EXISTS "immersion_map: 本人可更新" ON immersion_map;

CREATE POLICY "immersion_map: 本人可讀"   ON immersion_map FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "immersion_map: 本人可建立" ON immersion_map FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "immersion_map: 本人可更新" ON immersion_map FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- focus_logs（晚間回顧 / 每日專注記錄）— 可累積多筆
-- ============================================================
CREATE TABLE IF NOT EXISTS focus_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  log_date          date DEFAULT CURRENT_DATE,
  had_focus_moment  boolean DEFAULT false,
  focus_description text,
  focus_conditions  text[] DEFAULT '{}',
  focus_feelings    text[] DEFAULT '{}',
  difficult_task    text,
  obstacle          text,
  if_then_plan      text,           -- AI 產生的 if-then 計畫（使用者可編輯）
  ai_feedback       text,           -- 當天 AI 給的回饋句
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS focus_logs_user_date_idx ON focus_logs (user_id, log_date DESC);

ALTER TABLE focus_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "focus_logs: 本人可讀"   ON focus_logs;
DROP POLICY IF EXISTS "focus_logs: 本人可建立" ON focus_logs;
DROP POLICY IF EXISTS "focus_logs: 本人可更新" ON focus_logs;

CREATE POLICY "focus_logs: 本人可讀"   ON focus_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "focus_logs: 本人可建立" ON focus_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "focus_logs: 本人可更新" ON focus_logs FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- morning_logs（早晨啟動記錄）— 可累積多筆
-- ============================================================
CREATE TABLE IF NOT EXISTS morning_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  log_date        date DEFAULT CURRENT_DATE,
  today_task      text,
  ai_suggestion   text,
  user_confirmed  boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS morning_logs_user_date_idx ON morning_logs (user_id, log_date DESC);

ALTER TABLE morning_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "morning_logs: 本人可讀"   ON morning_logs;
DROP POLICY IF EXISTS "morning_logs: 本人可建立" ON morning_logs;
DROP POLICY IF EXISTS "morning_logs: 本人可更新" ON morning_logs;

CREATE POLICY "morning_logs: 本人可讀"   ON morning_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "morning_logs: 本人可建立" ON morning_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "morning_logs: 本人可更新" ON morning_logs FOR UPDATE USING (auth.uid() = user_id);
