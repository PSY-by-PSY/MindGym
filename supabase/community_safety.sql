-- ============================================================
-- MindGym — 社群安全（檢舉 reports / 封鎖 blocks）
-- App Store 審查指南 1.2（UGC）要求：① 檢舉冒犯內容 ② 封鎖騷擾使用者。
-- 可重複執行（idempotent）：CREATE IF NOT EXISTS + DROP POLICY IF EXISTS。
-- 在 Supabase Dashboard > SQL Editor 執行此檔案。
--
-- 設計沿用最新慣例：前端以 anon key + RLS 直接寫入（auth.uid() = xxx_id），
-- 後端不碰這些資料表。
-- ============================================================

-- ============================================================
-- reports（檢舉貼文 / 留言）
-- 一筆檢舉指向一則貼文（entry_id）或一則留言（comment_id），擇一。
-- reported_user_id 記下被檢舉內容的作者（後台審核用，不回傳給前端顯示，
-- 因此不會破壞匿名貼文的匿名性）。reasons 存原因 code 陣列。
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  target_type      text NOT NULL CHECK (target_type IN ('entry', 'comment')),
  entry_id         uuid REFERENCES gratitude_entries(id) ON DELETE CASCADE,
  comment_id       uuid REFERENCES comments(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reasons          text[] NOT NULL DEFAULT '{}',
  note             text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_created_idx ON reports (created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports: 本人可建立"     ON reports;
DROP POLICY IF EXISTS "reports: 本人可讀自己的" ON reports;

-- 只允許已登入者檢舉自己送出的紀錄；不開放讀別人的檢舉。
CREATE POLICY "reports: 本人可建立"     ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports: 本人可讀自己的" ON reports FOR SELECT USING (auth.uid() = reporter_id);

-- ============================================================
-- blocks（封鎖使用者）
-- blocker 封鎖 blocked 後，前端載入封鎖名單並過濾掉對方的貼文與留言。
-- blocked_label 記下封鎖當下畫面上顯示的名稱（匿名代號或實名），供
-- 個人檔案「封鎖名單」顯示 —— 避免直接撈對方 profiles.name 而外洩匿名貼文背後的真名。
-- ============================================================
CREATE TABLE IF NOT EXISTS blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id    uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  blocked_id    uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  blocked_label text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS blocks_blocker_idx ON blocks (blocker_id);

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks: 本人可讀"   ON blocks;
DROP POLICY IF EXISTS "blocks: 本人可建立" ON blocks;
DROP POLICY IF EXISTS "blocks: 本人可刪除" ON blocks;

CREATE POLICY "blocks: 本人可讀"   ON blocks FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "blocks: 本人可建立" ON blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocks: 本人可刪除" ON blocks FOR DELETE USING (auth.uid() = blocker_id);
