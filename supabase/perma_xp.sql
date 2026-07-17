-- ============================================================
-- PERMA 幸福力經驗值累加（跨練習共用欄位；自我慈悲是第一個接上的練習，
-- 感恩日記／過程目標覺察等其他練習之後要參與累加，比照 app.self-compassion.tsx
-- 呼叫 increment_perma_xp() 的方式接上即可）。
-- 在 Supabase Dashboard > SQL Editor 執行此檔案（可重複執行）。
--
-- 命名刻意跟 perma_scores 表（onboarding 心理測驗的 1-5 分結果）區隔開，
-- 這裡是「練習累積的經驗值」，跟測驗分數是兩回事，不要混用。
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perma_p_xp integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perma_e_xp integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perma_r_xp integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perma_m_xp integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perma_a_xp integer DEFAULT 0;

-- 原子累加：避免 client 端「先讀、再加、再寫」在連續操作／多裝置下遺失更新。
-- SECURITY DEFINER 是因為 profiles 沒有給 client 直接用的「累加」語法，
-- function 內用 auth.uid() = p_user_id 擋掉幫別人加分。
CREATE OR REPLACE FUNCTION increment_perma_xp(
  p_user_id uuid,
  p_delta_p integer DEFAULT 0,
  p_delta_e integer DEFAULT 0,
  p_delta_r integer DEFAULT 0,
  p_delta_m integer DEFAULT 0,
  p_delta_a integer DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE profiles SET
    perma_p_xp = COALESCE(perma_p_xp, 0) + p_delta_p,
    perma_e_xp = COALESCE(perma_e_xp, 0) + p_delta_e,
    perma_r_xp = COALESCE(perma_r_xp, 0) + p_delta_r,
    perma_m_xp = COALESCE(perma_m_xp, 0) + p_delta_m,
    perma_a_xp = COALESCE(perma_a_xp, 0) + p_delta_a
  WHERE id = p_user_id;
END;
$$;
