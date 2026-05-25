-- ============================================================
-- MindGym — Supabase Schema
-- 在 Supabase Dashboard > SQL Editor 執行此檔案
-- ============================================================

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: 本人可讀" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles: 本人可建立" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles: 本人可更新" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- perma_scores
CREATE TABLE IF NOT EXISTS perma_scores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  p_score     int CHECK (p_score BETWEEN 1 AND 5),
  e_score     int CHECK (e_score BETWEEN 1 AND 5),
  r_score     int CHECK (r_score BETWEEN 1 AND 5),
  m_score     int CHECK (m_score BETWEEN 1 AND 5),
  a_score     int CHECK (a_score BETWEEN 1 AND 5),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE perma_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perma_scores: 本人可讀" ON perma_scores
  FOR SELECT USING (auth.uid() = user_id);

-- Backend 使用 service_role key，自動繞過 RLS，可直接寫入

-- gratitude_entries
CREATE TABLE IF NOT EXISTS gratitude_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  entry_date  date DEFAULT CURRENT_DATE,
  item_1      text,
  item_2      text,
  item_3      text,
  tag_1       text,
  tag_2       text,
  tag_3       text,
  target_1    text, -- AI-tagged target code: others/self/environment/experience/custom
  target_2    text,
  target_3    text,
  ai_feedback text,
  is_shared   bool DEFAULT true,
  anon_name   text,
  created_at  timestamptz DEFAULT now()
);

-- Migration for existing databases (Step 5D)
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS target_1 text;
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS target_2 text;
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS target_3 text;

ALTER TABLE gratitude_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gratitude_entries: 本人可讀" ON gratitude_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "gratitude_entries: is_shared 資料公開可讀" ON gratitude_entries
  FOR SELECT USING (is_shared = true);

-- Migration for Step 12: avatar
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS avatar text;

-- use_real_name 欄位（Step 6 新增，若尚未存在）
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS use_real_name bool;
