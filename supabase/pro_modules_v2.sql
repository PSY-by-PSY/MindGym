-- ============================================================
-- MindGym — 專業模組區 v2：日記模組建構器 × 量表轉譯質性評估
-- 在既有 pro_modules.sql 基礎上「純新增」擴充：kind 分流出 practice/diary/assessment
-- 三種模組型態，審核、邀請碼、enrollment、危機判讀、停止追蹤機制三種 kind 完全共用。
-- 設計文件見 docs/plans/diary_scale_modules_plan.md。
--
-- 可重複執行（idempotent）：ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS +
-- DROP POLICY IF EXISTS + CREATE OR REPLACE FUNCTION。
-- 在 Supabase Dashboard > SQL Editor 手動執行此檔案（本專案慣例，需先執行過 pro_modules.sql）。
--
-- 安全原則沿用 pro_modules.sql：
--   * 每張表 ENABLE ROW LEVEL SECURITY；所有 SECURITY DEFINER function 一律 SET search_path = public。
--   * pro_modules 仍然沒有任何直接 UPDATE policy；kind 只在建立當下由前端 INSERT 指定，之後不變。
--   * 個案永遠只透過 RPC 讀取跨人資料；pro_reviews/pro_assessment_results 的 INSERT/報告寫入
--     只由後端 service key 負責（無 INSERT policy）。
-- ============================================================

-- ============================================================
-- 3.1 pro_modules 加 kind：一張表承載三種模組型態
-- ============================================================
ALTER TABLE pro_modules ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'practice'
  CHECK (kind IN ('practice','diary','assessment'));

CREATE INDEX IF NOT EXISTS pro_modules_kind_idx ON pro_modules (kind);

-- ============================================================
-- 3.2 pro_entries 加每日 AI 回饋槽（由後端 service key 寫入；本人無 UPDATE policy，不可竄改）
-- ============================================================
ALTER TABLE pro_entries ADD COLUMN IF NOT EXISTS ai_feedback jsonb;

-- ============================================================
-- 3.3 pro_reviews（整體回饋 / 週報 / 內建感恩日記週回顧 共用）
-- INSERT 只由後端 service key（無 policy）；本人可讀、可標已讀（UPDATE 僅允許透過 WITH CHECK 鎖 user_id 不變）。
-- ============================================================
CREATE TABLE IF NOT EXISTS pro_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  module_id    uuid REFERENCES pro_modules(id) ON DELETE CASCADE,  -- NULL = 內建感恩日記
  review_type  text NOT NULL CHECK (review_type IN ('overall','weekly','gratitude_weekly')),
  period_start date NOT NULL,
  period_end   date NOT NULL,
  entry_count  int  NOT NULL DEFAULT 0,
  content      jsonb NOT NULL,     -- 報告 schema，見計畫書 §4.3
  created_at   timestamptz DEFAULT now(),
  read_at      timestamptz,
  UNIQUE (user_id, module_id, review_type, period_start)  -- 防重複生成
);
CREATE INDEX IF NOT EXISTS pro_reviews_user_idx ON pro_reviews (user_id, created_at DESC);
ALTER TABLE pro_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pro_reviews: 本人可讀"           ON pro_reviews;
DROP POLICY IF EXISTS "pro_reviews: 本人可標已讀"        ON pro_reviews;
DROP POLICY IF EXISTS "pro_reviews: 專業夥伴可讀已同意週報" ON pro_reviews;

CREATE POLICY "pro_reviews: 本人可讀" ON pro_reviews FOR SELECT USING (auth.uid() = user_id);
-- 本人可更新但 WITH CHECK 鎖 user_id 不變（實務上只用來寫 read_at，前端直接 UPDATE 該欄位即可，不需 RPC）。
CREATE POLICY "pro_reviews: 本人可標已讀" ON pro_reviews FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- 專業夥伴可讀：僅 weekly、且該模組 feedback.weekly.sync_to_practitioner=true、且 enrollment active。
CREATE POLICY "pro_reviews: 專業夥伴可讀已同意週報" ON pro_reviews FOR SELECT USING (
  review_type = 'weekly' AND EXISTS (
    SELECT 1 FROM pro_enrollments e JOIN pro_modules m ON m.id = e.module_id
    WHERE e.module_id = pro_reviews.module_id AND e.user_id = pro_reviews.user_id
      AND e.practitioner_id = auth.uid() AND e.status = 'active'
      AND COALESCE((m.published_content->'feedback'->'weekly'->>'sync_to_practitioner')::boolean, false)
  )
);

-- ============================================================
-- 3.4 pro_assessment_results（質性測驗結果：雙報告）
-- 個案不直讀此表（避免看到 practitioner_report），走 RPC get_my_assessment_results()。
-- INSERT/報告寫入由後端 service key（無 policy）。
-- ============================================================
CREATE TABLE IF NOT EXISTS pro_assessment_results (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id           uuid REFERENCES pro_modules(id) ON DELETE CASCADE NOT NULL,
  user_id             uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  answers             jsonb NOT NULL,          -- { question_id: string }
  practitioner_report jsonb,                   -- 僅專業夥伴/後端可見
  client_report       jsonb,                   -- 發布後個案可見
  status              text NOT NULL DEFAULT 'released'
    CHECK (status IN ('pending_release','released')),
  created_at          timestamptz DEFAULT now(),
  released_at         timestamptz
);
CREATE INDEX IF NOT EXISTS pro_assessment_results_module_user_idx
  ON pro_assessment_results (module_id, user_id, created_at DESC);
ALTER TABLE pro_assessment_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pro_assessment_results: 專業夥伴可讀已同意個案的" ON pro_assessment_results;
CREATE POLICY "pro_assessment_results: 專業夥伴可讀已同意個案的" ON pro_assessment_results
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM pro_enrollments e
    WHERE e.module_id = pro_assessment_results.module_id
      AND e.user_id = pro_assessment_results.user_id
      AND e.practitioner_id = auth.uid() AND e.status = 'active'));

-- 專業夥伴發布個案版：驗證 auth.uid() 是該 enrollment 的 practitioner 才能放行。
CREATE OR REPLACE FUNCTION release_assessment_result(p_result_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pro_assessment_results r
    JOIN pro_enrollments e ON e.module_id = r.module_id AND e.user_id = r.user_id
    WHERE r.id = p_result_id AND e.practitioner_id = auth.uid() AND e.status = 'active'
  ) THEN
    RAISE EXCEPTION '僅限該個案的專業夥伴操作';
  END IF;
  UPDATE pro_assessment_results SET status = 'released', released_at = now() WHERE id = p_result_id;
END; $$;

-- 個案讀自己測驗結果的唯一入口：pending_release 時 client_report 一律回 NULL（尚未發布不可見）。
CREATE OR REPLACE FUNCTION get_my_assessment_results(p_module_id uuid)
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(json_agg(json_build_object(
    'id', r.id,
    'created_at', r.created_at,
    'status', r.status,
    'client_report', CASE WHEN r.status = 'released' THEN r.client_report ELSE NULL END
  ) ORDER BY r.created_at DESC), '[]'::json)
  FROM pro_assessment_results r
  WHERE r.module_id = p_module_id AND r.user_id = auth.uid();
$$;

-- ============================================================
-- 3.5 get_my_modules() / preview_invite_code() / redeem_invite_code()
-- CREATE OR REPLACE：純新增回傳欄位 'kind'，其餘邏輯不變。
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_modules()
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(json_agg(json_build_object(
    'module_id', m.id,
    'title', m.title,
    'description', m.description,
    'est_minutes', m.est_minutes,
    'kind', m.kind,
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

CREATE OR REPLACE FUNCTION preview_invite_code(p_code text)
RETURNS json LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT json_build_object(
    'module_id', m.id,
    'title', m.title,
    'description', m.description,
    'est_minutes', m.est_minutes,
    'kind', m.kind,
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
      'est_minutes', m.est_minutes, 'kind', m.kind,
      'practitioner_name', (SELECT name FROM profiles WHERE id = m.owner_id)
    ) FROM pro_modules m WHERE m.id = v_module_id
  );
END; $$;

-- ============================================================
-- 3.7 mark_review_read：不需 RPC，前端直接 UPDATE pro_reviews SET read_at = now()
-- （3.3 的「本人可標已讀」policy 已允許）。
-- ============================================================
