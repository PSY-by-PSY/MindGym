-- ============================================================
-- 一週回顧頁的 AI 情緒分析（review_type='weekly_digest'）
-- 沿用既有 pro_reviews 表，只需放寬 review_type 的 CHECK 約束。
-- 可重複執行（冪等）：DROP CONSTRAINT IF EXISTS + 重建。
-- ============================================================
ALTER TABLE pro_reviews DROP CONSTRAINT IF EXISTS pro_reviews_review_type_check;
ALTER TABLE pro_reviews ADD CONSTRAINT pro_reviews_review_type_check
  CHECK (review_type IN ('overall', 'weekly', 'gratitude_weekly', 'weekly_digest'));
