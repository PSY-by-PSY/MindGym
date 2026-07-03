-- ============================================================
-- MindGym — 專業模組區（Professional Modules）Schema
-- 助人工作者（UI 稱「專業夥伴」）自訂練習模組 → 送審 → 邀請碼 → 個案同意解鎖
-- → 打卡追蹤 + 危機警示。設計文件見 docs/plans/pro_modules_plan.md。
--
-- 可重複執行（idempotent）：CREATE IF NOT EXISTS + DROP POLICY IF EXISTS +
-- CREATE OR REPLACE FUNCTION。在 Supabase Dashboard > SQL Editor 手動執行此檔案。
--
-- 安全原則：
--   * 每張表 ENABLE ROW LEVEL SECURITY；沒有寫到的操作＝沒有 policy＝預設拒絕（刻意）。
--   * 所有 SECURITY DEFINER function 一律 SET search_path = public。
--   * 敏感／原子操作走 SECURITY DEFINER RPC；pro_modules 沒有任何直接 UPDATE policy，
--     杜絕專業夥伴自行把 draft 塞進 published_content 繞過審核。
--   * 角色獨立成 user_roles 表（不放 profiles，避免「本人可更新」policy 被自改提權）。
--
-- 檔案順序有意義：helper functions 早於引用它們的 policy；資料表早於讀它的 SQL function。
-- ============================================================

-- ============================================================
-- 4.1 user_roles（角色 — 安全核心）
-- 第一位 admin 由使用者手動 SQL 建立（見 pro_modules_result.md 啟用清單）。
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role       text NOT NULL CHECK (role IN ('practitioner', 'admin')),
  granted_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Helper functions：SECURITY DEFINER 以繞過 user_roles 自身的 RLS，避免 policy 遞迴。
CREATE OR REPLACE FUNCTION is_admin(uid uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = uid AND role = 'admin') $$;

CREATE OR REPLACE FUNCTION is_practitioner(uid uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = uid AND role = 'practitioner') $$;

DROP POLICY IF EXISTS "user_roles: 本人可讀自己的"        ON user_roles;
DROP POLICY IF EXISTS "user_roles: admin 可讀全部"         ON user_roles;
DROP POLICY IF EXISTS "user_roles: admin 可授予 practitioner" ON user_roles;
DROP POLICY IF EXISTS "user_roles: admin 可移除 practitioner" ON user_roles;

CREATE POLICY "user_roles: 本人可讀自己的" ON user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_roles: admin 可讀全部"  ON user_roles FOR SELECT USING (is_admin(auth.uid()));
-- admin 只能透過前端授予 practitioner，不能授予 admin（第一位 admin 手動 SQL 建立）。
CREATE POLICY "user_roles: admin 可授予 practitioner" ON user_roles
  FOR INSERT WITH CHECK (is_admin(auth.uid()) AND role = 'practitioner');
CREATE POLICY "user_roles: admin 可移除 practitioner" ON user_roles
  FOR DELETE USING (is_admin(auth.uid()) AND role = 'practitioner');

-- ============================================================
-- 4.2 practitioner_applications（專業夥伴申請）
-- ============================================================
CREATE TABLE IF NOT EXISTS practitioner_applications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name         text NOT NULL,
  title        text,
  organization text,
  license_info text,
  motivation   text,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note   text,
  created_at   timestamptz DEFAULT now(),
  reviewed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS practitioner_applications_status_idx ON practitioner_applications (status);

ALTER TABLE practitioner_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "practitioner_applications: 本人可建立"     ON practitioner_applications;
DROP POLICY IF EXISTS "practitioner_applications: 本人可讀自己的" ON practitioner_applications;
DROP POLICY IF EXISTS "practitioner_applications: admin 可讀全部"  ON practitioner_applications;
DROP POLICY IF EXISTS "practitioner_applications: 本人可重新送出" ON practitioner_applications;

CREATE POLICY "practitioner_applications: 本人可建立" ON practitioner_applications
  FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "practitioner_applications: 本人可讀自己的" ON practitioner_applications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "practitioner_applications: admin 可讀全部" ON practitioner_applications
  FOR SELECT USING (is_admin(auth.uid()));
-- 被退件後本人可把自己的申請改回 pending 重新送出（只能 rejected → pending，只能本人）。
CREATE POLICY "practitioner_applications: 本人可重新送出" ON practitioner_applications
  FOR UPDATE USING (auth.uid() = user_id AND status = 'rejected')
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- 核准／退件走 RPC（原子性：改狀態＋授予角色一起）。
CREATE OR REPLACE FUNCTION approve_practitioner_application(p_app_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  UPDATE practitioner_applications SET status = 'approved', reviewed_at = now() WHERE id = p_app_id;
  INSERT INTO user_roles (user_id, role, granted_by)
    SELECT user_id, 'practitioner', auth.uid() FROM practitioner_applications WHERE id = p_app_id
    ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION reject_practitioner_application(p_app_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  UPDATE practitioner_applications
    SET status = 'rejected', admin_note = p_note, reviewed_at = now()
    WHERE id = p_app_id;
END; $$;

-- ============================================================
-- 4.3 pro_modules（模組本體 — 雙槽設計）
-- 可用判斷式（全站統一）：published_content IS NOT NULL AND status <> 'archived'。
-- 沒有任何直接 UPDATE policy：所有寫入走 RPC。
-- ============================================================
CREATE TABLE IF NOT EXISTS pro_modules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title             text NOT NULL,
  description       text,
  est_minutes       int,
  draft_content     jsonb,          -- 編輯中/送審中的內容
  published_content jsonb,          -- 個案實際使用的已核准內容
  status            text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','approved','rejected','archived')),
  ai_review         jsonb,          -- 最近一次送審的 AI 標籤（僅供管理員參考）
  admin_note        text,           -- 退件/下架理由（專業夥伴可見）
  submitted_at      timestamptz,
  published_at      timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pro_modules_owner_idx  ON pro_modules (owner_id);
CREATE INDEX IF NOT EXISTS pro_modules_status_idx ON pro_modules (status);

ALTER TABLE pro_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pro_modules: owner 可讀自己的"       ON pro_modules;
DROP POLICY IF EXISTS "pro_modules: admin 可讀全部"          ON pro_modules;
DROP POLICY IF EXISTS "pro_modules: owner 可建立草稿"        ON pro_modules;
DROP POLICY IF EXISTS "pro_modules: owner 可刪除未上架草稿"  ON pro_modules;

CREATE POLICY "pro_modules: owner 可讀自己的" ON pro_modules FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "pro_modules: admin 可讀全部"    ON pro_modules FOR SELECT USING (is_admin(auth.uid()));
-- 直接 INSERT 允許，但 WITH CHECK 鎖死初始狀態（不能一建立就自帶 published_content）。
CREATE POLICY "pro_modules: owner 可建立草稿" ON pro_modules FOR INSERT WITH CHECK (
  owner_id = auth.uid() AND is_practitioner(auth.uid()) AND status = 'draft'
  AND published_content IS NULL AND published_at IS NULL
  AND ai_review IS NULL AND admin_note IS NULL
);
-- 草稿可刪；上過架（有 published_content）只能由 admin takedown 封存。
CREATE POLICY "pro_modules: owner 可刪除未上架草稿" ON pro_modules FOR DELETE USING (
  owner_id = auth.uid() AND status = 'draft' AND published_content IS NULL
);
-- 刻意「沒有 UPDATE policy」：更新只能走 update_module_draft / approve_module /
-- reject_module / takedown_module 這些 SECURITY DEFINER RPC（見下）。
-- 個案不直接讀這張表（避免暴露 draft_content/ai_review），一律走 get_my_modules()（4.6）。

-- ============================================================
-- 4.4 pro_module_review_log（審核軌跡）
-- INSERT 無 policy：只由 SECURITY DEFINER RPC 與後端 service key 寫入。
-- ============================================================
CREATE TABLE IF NOT EXISTS pro_module_review_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id        uuid REFERENCES pro_modules(id) ON DELETE CASCADE NOT NULL,
  action           text NOT NULL CHECK (action IN ('submitted','approved','rejected','takedown')),
  actor_id         uuid REFERENCES profiles(id),
  note             text,
  content_snapshot jsonb,
  ai_review        jsonb,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pro_module_review_log_module_idx ON pro_module_review_log (module_id, created_at DESC);

ALTER TABLE pro_module_review_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pro_module_review_log: admin 可讀全部"      ON pro_module_review_log;
DROP POLICY IF EXISTS "pro_module_review_log: owner 可讀自己模組的" ON pro_module_review_log;

CREATE POLICY "pro_module_review_log: admin 可讀全部" ON pro_module_review_log
  FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "pro_module_review_log: owner 可讀自己模組的" ON pro_module_review_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pro_modules m WHERE m.id = pro_module_review_log.module_id AND m.owner_id = auth.uid())
  );

-- 專業夥伴儲存草稿（只更新這五個欄位＋updated_at）。送審不在這裡（走後端 §5.1，要先跑 AI）。
CREATE OR REPLACE FUNCTION update_module_draft(
  p_module_id uuid, p_title text, p_description text, p_est_minutes int, p_draft_content jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pro_modules WHERE id = p_module_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION '僅限模組擁有者操作';
  END IF;
  UPDATE pro_modules
    SET title = p_title, description = p_description, est_minutes = p_est_minutes,
        draft_content = p_draft_content, updated_at = now()
    WHERE id = p_module_id;
END; $$;

-- Admin RPC：核准（draft → published）、退回修改、下架（已上架但違規）。三者都寫一筆審核軌跡。
CREATE OR REPLACE FUNCTION approve_module(p_module_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  UPDATE pro_modules
    SET published_content = draft_content, status = 'approved',
        published_at = now(), admin_note = p_note, updated_at = now()
    WHERE id = p_module_id;
  INSERT INTO pro_module_review_log (module_id, action, actor_id, note, content_snapshot, ai_review)
    SELECT id, 'approved', auth.uid(), p_note, draft_content, ai_review
    FROM pro_modules WHERE id = p_module_id;
END; $$;

CREATE OR REPLACE FUNCTION reject_module(p_module_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  UPDATE pro_modules SET status = 'rejected', admin_note = p_note, updated_at = now()
    WHERE id = p_module_id;
  INSERT INTO pro_module_review_log (module_id, action, actor_id, note, content_snapshot, ai_review)
    SELECT id, 'rejected', auth.uid(), p_note, draft_content, ai_review
    FROM pro_modules WHERE id = p_module_id;
END; $$;

CREATE OR REPLACE FUNCTION takedown_module(p_module_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  UPDATE pro_modules SET status = 'archived', admin_note = p_note, updated_at = now()
    WHERE id = p_module_id;
  INSERT INTO pro_module_review_log (module_id, action, actor_id, note, content_snapshot, ai_review)
    SELECT id, 'takedown', auth.uid(), p_note, published_content, ai_review
    FROM pro_modules WHERE id = p_module_id;
END; $$;

-- ============================================================
-- 4.5 invite_codes（邀請碼 — 私密金鑰）
-- 個案端沒有任何 SELECT policy（不可枚舉）；owner 可讀自己模組的碼。
-- ============================================================
CREATE TABLE IF NOT EXISTS invite_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id  uuid REFERENCES pro_modules(id) ON DELETE CASCADE NOT NULL,
  code       text UNIQUE NOT NULL,
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS invite_codes_module_idx ON invite_codes (module_id);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invite_codes: owner 可讀自己模組的" ON invite_codes;
CREATE POLICY "invite_codes: owner 可讀自己模組的" ON invite_codes FOR SELECT USING (
  EXISTS (SELECT 1 FROM pro_modules m WHERE m.id = invite_codes.module_id AND m.owner_id = auth.uid())
);

-- 產生/作廢（原子）：舊碼立即作廢、產生一組新碼並回傳。
CREATE OR REPLACE FUNCTION regenerate_invite_code(p_module_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pro_modules WHERE id = p_module_id AND owner_id = auth.uid())
    THEN RAISE EXCEPTION '僅限模組擁有者操作'; END IF;
  UPDATE invite_codes SET is_active = false, revoked_at = now()
    WHERE module_id = p_module_id AND is_active;
  -- 8 碼、排除易混淆字元（0O1IL），約 31^8 ≈ 8500 億組合，足以抵擋暴力猜測
  SELECT string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
    (floor(random() * 31) + 1)::int, 1), '') INTO v_code FROM generate_series(1, 8);
  INSERT INTO invite_codes (module_id, code) VALUES (p_module_id, v_code);
  RETURN v_code;
END; $$;

-- 兌換前預覽（給同意視窗用，只回安全欄位）。查無 → NULL（前端顯示「邀請碼無效」）。
CREATE OR REPLACE FUNCTION preview_invite_code(p_code text)
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT json_build_object(
    'module_id', m.id,
    'title', m.title,
    'description', m.description,
    'est_minutes', m.est_minutes,
    'practitioner_name', (SELECT name FROM profiles WHERE id = m.owner_id)
  )
  FROM invite_codes c
  JOIN pro_modules m ON m.id = c.module_id
  WHERE c.code = upper(trim(p_code))
    AND c.is_active
    AND m.published_content IS NOT NULL
    AND m.status <> 'archived'
  LIMIT 1;
$$;

-- ============================================================
-- 4.6 pro_enrollments（追蹤關係 — 同意的載體）
-- 建立只能走 redeem_invite_code RPC（沒有 INSERT policy）。
-- ============================================================
CREATE TABLE IF NOT EXISTS pro_enrollments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id       uuid REFERENCES pro_modules(id) ON DELETE CASCADE NOT NULL,
  user_id         uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  practitioner_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL, -- 兌換當下的模組 owner
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','stopped')),
  share_perma     boolean DEFAULT false,   -- 同意視窗中的選擇性勾選
  consented_at    timestamptz DEFAULT now(),
  stopped_at      timestamptz,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (module_id, user_id)
);

CREATE INDEX IF NOT EXISTS pro_enrollments_user_idx         ON pro_enrollments (user_id);
CREATE INDEX IF NOT EXISTS pro_enrollments_practitioner_idx ON pro_enrollments (practitioner_id);

ALTER TABLE pro_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pro_enrollments: 本人可讀自己的" ON pro_enrollments;
DROP POLICY IF EXISTS "pro_enrollments: 專業夥伴可讀"   ON pro_enrollments;
DROP POLICY IF EXISTS "pro_enrollments: 本人可停止"     ON pro_enrollments;

CREATE POLICY "pro_enrollments: 本人可讀自己的" ON pro_enrollments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pro_enrollments: 專業夥伴可讀"   ON pro_enrollments FOR SELECT USING (practitioner_id = auth.uid());
-- 本人可更新但 WITH CHECK 鎖 status='stopped'：個案只能單向停止，恢復＝重新輸入邀請碼。
CREATE POLICY "pro_enrollments: 本人可停止" ON pro_enrollments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'stopped');

-- 兌換邀請碼（唯一建立入口）：驗證 active 碼＋模組可用 → upsert enrollment → 回傳模組 json。
-- 停止後想恢復＝重新走一次同意（ON CONFLICT DO UPDATE 重置 active、清 stopped_at）。
CREATE OR REPLACE FUNCTION redeem_invite_code(p_code text, p_share_perma boolean)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_module_id uuid;
  v_owner_id  uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '需要登入'; END IF;
  SELECT m.id, m.owner_id INTO v_module_id, v_owner_id
  FROM invite_codes c JOIN pro_modules m ON m.id = c.module_id
  WHERE c.code = upper(trim(p_code)) AND c.is_active
    AND m.published_content IS NOT NULL AND m.status <> 'archived'
  LIMIT 1;
  IF v_module_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO pro_enrollments (module_id, user_id, practitioner_id, status, share_perma, consented_at, stopped_at)
  VALUES (v_module_id, auth.uid(), v_owner_id, 'active', COALESCE(p_share_perma, false), now(), NULL)
  ON CONFLICT (module_id, user_id) DO UPDATE
    SET status = 'active', share_perma = EXCLUDED.share_perma,
        practitioner_id = EXCLUDED.practitioner_id, consented_at = now(), stopped_at = NULL;

  RETURN (
    SELECT json_build_object(
      'module_id', m.id, 'title', m.title, 'description', m.description,
      'est_minutes', m.est_minutes,
      'practitioner_name', (SELECT name FROM profiles WHERE id = m.owner_id)
    ) FROM pro_modules m WHERE m.id = v_module_id
  );
END; $$;

-- 個案看模組內容的唯一入口：回傳 auth.uid() 所有 active enrollment 的可用模組（含 published_content）。
CREATE OR REPLACE FUNCTION get_my_modules()
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(json_agg(json_build_object(
    'module_id', m.id,
    'title', m.title,
    'description', m.description,
    'est_minutes', m.est_minutes,
    'published_content', m.published_content,
    'published_at', m.published_at,
    'practitioner_name', p.name,
    'enrolled_at', e.consented_at
  ) ORDER BY e.consented_at DESC), '[]'::json)
  FROM pro_enrollments e
  JOIN pro_modules m ON m.id = e.module_id
  LEFT JOIN profiles p ON p.id = e.practitioner_id
  WHERE e.user_id = auth.uid() AND e.status = 'active'
    AND m.published_content IS NOT NULL AND m.status <> 'archived';
$$;

-- ============================================================
-- 4.7 pro_entries（個案練習紀錄）
-- 停止追蹤瞬間，專業夥伴連歷史紀錄一併看不到（拍板的隱私設計）。
-- ============================================================
CREATE TABLE IF NOT EXISTS pro_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id  uuid REFERENCES pro_modules(id) ON DELETE CASCADE NOT NULL,
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  answers    jsonb NOT NULL,        -- { block_id: 回答 }
  entry_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pro_entries_module_user_idx ON pro_entries (module_id, user_id, created_at DESC);

ALTER TABLE pro_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pro_entries: 本人可建立"                 ON pro_entries;
DROP POLICY IF EXISTS "pro_entries: 本人可讀自己的"             ON pro_entries;
DROP POLICY IF EXISTS "pro_entries: 專業夥伴可讀已同意個案的"   ON pro_entries;

CREATE POLICY "pro_entries: 本人可建立" ON pro_entries FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM pro_enrollments e
    WHERE e.module_id = pro_entries.module_id AND e.user_id = auth.uid() AND e.status = 'active'
  )
);
CREATE POLICY "pro_entries: 本人可讀自己的" ON pro_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pro_entries: 專業夥伴可讀已同意個案的" ON pro_entries FOR SELECT USING (
  EXISTS (SELECT 1 FROM pro_enrollments e
    WHERE e.module_id = pro_entries.module_id AND e.user_id = pro_entries.user_id
      AND e.practitioner_id = auth.uid() AND e.status = 'active')
);

-- ============================================================
-- 4.8 crisis_alerts（危機警示）
-- 後端主路徑用 service key 寫入；本人可建立是前端 fallback（自舉警示無濫用價值）。
-- ============================================================
CREATE TABLE IF NOT EXISTS crisis_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  practitioner_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  module_id       uuid REFERENCES pro_modules(id) ON DELETE CASCADE,
  entry_id        uuid REFERENCES pro_entries(id) ON DELETE CASCADE,
  source          text CHECK (source IN ('keyword','ai')),
  severity        text CHECK (severity IN ('medium','high')) DEFAULT 'high',
  matched_terms   text[] DEFAULT '{}',
  acknowledged_at timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crisis_alerts_practitioner_idx ON crisis_alerts (practitioner_id, created_at DESC);

ALTER TABLE crisis_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crisis_alerts: 專業夥伴可讀"   ON crisis_alerts;
DROP POLICY IF EXISTS "crisis_alerts: 專業夥伴可更新" ON crisis_alerts;
DROP POLICY IF EXISTS "crisis_alerts: admin 可讀全部"  ON crisis_alerts;
DROP POLICY IF EXISTS "crisis_alerts: 本人可建立"     ON crisis_alerts;

CREATE POLICY "crisis_alerts: 專業夥伴可讀"   ON crisis_alerts FOR SELECT USING (practitioner_id = auth.uid());
CREATE POLICY "crisis_alerts: 專業夥伴可更新" ON crisis_alerts FOR UPDATE USING (practitioner_id = auth.uid());
CREATE POLICY "crisis_alerts: admin 可讀全部"  ON crisis_alerts FOR SELECT USING (is_admin(auth.uid()));
-- 前端關鍵字 fallback 寫入：本人 + 對應的 active enrollment 存在才允許。
CREATE POLICY "crisis_alerts: 本人可建立" ON crisis_alerts FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM pro_enrollments e
    WHERE e.user_id = auth.uid()
      AND e.practitioner_id = crisis_alerts.practitioner_id
      AND e.module_id = crisis_alerts.module_id
      AND e.status = 'active'
  )
);

-- ============================================================
-- 4.9 perma_scores：新增一條 policy（唯一動到既有表的地方，純新增）
-- 專業夥伴可讀「已同意且勾選分享 PERMA」的個案分數。
-- ============================================================
DROP POLICY IF EXISTS "perma_scores: 專業夥伴可讀已同意個案" ON perma_scores;
CREATE POLICY "perma_scores: 專業夥伴可讀已同意個案" ON perma_scores FOR SELECT USING (
  EXISTS (SELECT 1 FROM pro_enrollments e
          WHERE e.user_id = perma_scores.user_id AND e.practitioner_id = auth.uid()
            AND e.status = 'active' AND e.share_perma)
);
