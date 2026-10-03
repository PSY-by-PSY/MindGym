-- ════════════════════════════════════════════════════════════════════════
-- register_device_token：App 登記／轉移 APNs device token
--
-- 為什麼不能直接 upsert：
--   device_tokens 以 token 為主鍵，RLS UPDATE 規則是 auth.uid() = user_id。
--   同一台 iPhone 先登入 A 帳號、登出後改登 B 帳號，token 不變——B 的 upsert 撞到
--   A 那一列，UPDATE 被 RLS 擋下（42501），token 永遠留在 A 名下：
--   B 收不到推播，A 反而收到 B 的通知。以前前端沒檢查 {error}，所以完全靜默。
--
-- 這支 SECURITY DEFINER 函式只做一件事：把「這個 token」歸給「目前登入的人」。
-- user_id 一律取 auth.uid()，不接受參數，無法替別人登記。
--
-- 手動在 Supabase SQL Editor 執行（沿用本專案慣例：SQL 不自動部署）。
-- 需先執行過 push_notifications.sql（建立 device_tokens）。
-- 前端在此函式不存在時會退回舊的 upsert（見 src/lib/pushNotifications.ts），
-- 所以先上 App、後跑 SQL 也不會壞；但跑之前換帳號的情境仍會失敗。
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.register_device_token(p_token text, p_platform text DEFAULT 'ios')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9A-Fa-f]{32,200}$' THEN
    RAISE EXCEPTION 'invalid device token' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.device_tokens (token, user_id, platform, updated_at)
  VALUES (lower(p_token), v_uid, coalesce(p_platform, 'ios'), now())
  ON CONFLICT (token) DO UPDATE
    SET user_id    = EXCLUDED.user_id,
        platform   = EXCLUDED.platform,
        updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text) TO authenticated;

-- 讓 PostgREST 立刻看到新函式（否則前端可能短暫收到 PGRST202）
NOTIFY pgrst, 'reload schema';
