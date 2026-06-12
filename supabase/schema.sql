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

ALTER TABLE perma_scores ADD COLUMN IF NOT EXISTS report_json jsonb;

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

DROP POLICY IF EXISTS "likes: 所有人可讀"   ON likes;
DROP POLICY IF EXISTS "likes: 已登入可讀"   ON likes;
DROP POLICY IF EXISTS "likes: 本人可建立"   ON likes;
DROP POLICY IF EXISTS "likes: 本人可刪除"   ON likes;

-- 只開放給已登入者讀取（anon key 撈不到），社群是登入後才能互動的功能。
CREATE POLICY "likes: 已登入可讀" ON likes FOR SELECT USING (auth.uid() IS NOT NULL);
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

-- 巢狀回覆用（冪等補欄位；正式庫已有此欄，schema 檔同步記載）
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES comments(id) ON DELETE CASCADE;

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments: 所有人可讀" ON comments;
DROP POLICY IF EXISTS "comments: 已登入可讀" ON comments;
DROP POLICY IF EXISTS "comments: 本人可建立" ON comments;
DROP POLICY IF EXISTS "comments: 本人可刪除" ON comments;

-- 只開放給已登入者讀取（anon key 撈不到留言內容）。
CREATE POLICY "comments: 已登入可讀" ON comments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "comments: 本人可建立" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments: 本人可刪除" ON comments FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- comment_likes（留言按讚）
-- 把原本只存在前端 state（重新整理就歸零）的留言愛心改為持久化。
-- ============================================================
CREATE TABLE IF NOT EXISTS comment_likes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  uuid REFERENCES comments(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comment_likes: 已登入可讀" ON comment_likes;
DROP POLICY IF EXISTS "comment_likes: 本人可建立" ON comment_likes;
DROP POLICY IF EXISTS "comment_likes: 本人可刪除" ON comment_likes;

CREATE POLICY "comment_likes: 已登入可讀" ON comment_likes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "comment_likes: 本人可建立" ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comment_likes: 本人可刪除" ON comment_likes FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- first_feedback（首次完成練習後的三題回饋）
-- 一人一列（user_id 為主鍵），用來確保問卷只在第一次出現、之後不再顯示。
-- ============================================================
CREATE TABLE IF NOT EXISTS first_feedback (
  user_id     uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  impression  text,   -- 哪個環節讓你印象最深？
  moment      text,   -- 如果這變成 App，你希望它出現在你生活的什麼時刻？
  friend      text,   -- 你會想帶哪個朋友來？為什麼？
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE first_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "first_feedback: 本人可讀"   ON first_feedback;
DROP POLICY IF EXISTS "first_feedback: 本人可建立" ON first_feedback;
DROP POLICY IF EXISTS "first_feedback: 本人可更新" ON first_feedback;

CREATE POLICY "first_feedback: 本人可讀"   ON first_feedback FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "first_feedback: 本人可建立" ON first_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "first_feedback: 本人可更新" ON first_feedback FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- bot_like_queue（機器人按讚排程佇列）
-- ============================================================
ALTER TABLE likes ADD COLUMN IF NOT EXISTS is_bot boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS bot_like_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id     uuid REFERENCES gratitude_entries(id) ON DELETE CASCADE NOT NULL,
  scheduled_at timestamptz NOT NULL,
  processed_at timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- 安排機器人按讚：新貼文建立後由前端呼叫，隨機安排 5~10 個讚分散在 1~90 分鐘後
CREATE OR REPLACE FUNCTION schedule_bot_likes(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already int;
  v_count   int;
  i         int;
  v_delay   int;
BEGIN
  -- 避免同一則貼文重複安排
  SELECT count(*) INTO v_already FROM bot_like_queue WHERE entry_id = p_entry_id;
  IF v_already > 0 THEN RETURN; END IF;

  v_count := 5 + floor(random() * 6)::int; -- 5 到 10 個讚
  FOR i IN 1..v_count LOOP
    v_delay := 60 + floor(random() * 5340)::int; -- 1~90 分鐘（秒數）
    INSERT INTO bot_like_queue (entry_id, scheduled_at)
    VALUES (p_entry_id, now() + (v_delay || ' seconds')::interval);
  END LOOP;
END;
$$;

-- 執行到期的機器人按讚：由 pg_cron 每 2 分鐘呼叫
CREATE OR REPLACE FUNCTION process_bot_likes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, entry_id
    FROM bot_like_queue
    WHERE scheduled_at <= now()
      AND processed_at IS NULL
    LIMIT 50
  LOOP
    BEGIN
      -- user_id 為 NULL（FK 不檢查 NULL），UNIQUE(entry_id, user_id) 允許多個 NULL
      INSERT INTO likes (entry_id, is_bot) VALUES (rec.entry_id, true);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- entry 已刪除或其他錯誤，略過
    END;

    UPDATE bot_like_queue SET processed_at = now() WHERE id = rec.id;
  END LOOP;
END;
$$;
