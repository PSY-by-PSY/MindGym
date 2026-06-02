-- ============================================================
-- MindGym — Supabase Schema
-- 可重複執行（idempotent）：CREATE IF NOT EXISTS + DROP POLICY IF EXISTS
-- 在 Supabase Dashboard > SQL Editor 執行此檔案
-- ============================================================

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_streak integer DEFAULT 0;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: 本人可讀"         ON profiles;
DROP POLICY IF EXISTS "profiles: 已登入可讀所有人"  ON profiles;
DROP POLICY IF EXISTS "profiles: 本人可建立"        ON profiles;
DROP POLICY IF EXISTS "profiles: 本人可更新"        ON profiles;

CREATE POLICY "profiles: 已登入可讀所有人" ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "profiles: 本人可建立"       ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles: 本人可更新"       ON profiles FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- perma_scores
-- ============================================================
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

DROP POLICY IF EXISTS "perma_scores: 本人可讀" ON perma_scores;
CREATE POLICY "perma_scores: 本人可讀" ON perma_scores
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- gratitude_entries
-- ============================================================
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
  ai_feedback text,
  is_shared   bool DEFAULT true,
  anon_name   text,
  created_at  timestamptz DEFAULT now()
);

-- 補欄位（冪等）
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS target_1    text;
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS target_2    text;
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS target_3    text;
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS avatar      text;
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS use_real_name bool;

ALTER TABLE gratitude_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gratitude_entries: 本人可讀"             ON gratitude_entries;
DROP POLICY IF EXISTS "gratitude_entries: is_shared 資料公開可讀" ON gratitude_entries;
DROP POLICY IF EXISTS "gratitude_entries: 本人可建立"           ON gratitude_entries;
DROP POLICY IF EXISTS "gratitude_entries: 本人可更新"           ON gratitude_entries;

CREATE POLICY "gratitude_entries: 本人可讀" ON gratitude_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "gratitude_entries: is_shared 資料公開可讀" ON gratitude_entries
  FOR SELECT USING (is_shared = true);

-- 前端直接寫入（不再依賴後端 service_role）
CREATE POLICY "gratitude_entries: 本人可建立" ON gratitude_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gratitude_entries: 本人可更新" ON gratitude_entries
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- likes（社群按讚）
-- ============================================================
CREATE TABLE IF NOT EXISTS likes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    uuid REFERENCES gratitude_entries(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (entry_id, user_id)
);

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "likes: 所有人可讀" ON likes;
DROP POLICY IF EXISTS "likes: 本人可建立" ON likes;
DROP POLICY IF EXISTS "likes: 本人可刪除" ON likes;

CREATE POLICY "likes: 所有人可讀" ON likes FOR SELECT USING (true);
CREATE POLICY "likes: 本人可建立" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes: 本人可刪除" ON likes FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- comments（社群留言）
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    uuid REFERENCES gratitude_entries(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  anon_name   text,
  content     text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments: 所有人可讀" ON comments;
DROP POLICY IF EXISTS "comments: 本人可建立" ON comments;
DROP POLICY IF EXISTS "comments: 本人可刪除" ON comments;

CREATE POLICY "comments: 所有人可讀" ON comments FOR SELECT USING (true);
CREATE POLICY "comments: 本人可建立" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments: 本人可刪除" ON comments FOR DELETE USING (auth.uid() = user_id);
