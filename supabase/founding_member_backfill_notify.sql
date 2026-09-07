-- ════════════════════════════════════════════════════════════════════════
-- 一次性補發：把「創始成員審核通過」推播，補寄給*現在已經是*創始成員的人。
--
-- 背景：subscriptions.sql 新增的 subscriptions_founding_insert_push /
-- subscriptions_founding_update_push 這兩支 trigger 只會在「之後」核准時
-- 自動觸發（is_founding_member 從非 true 變成 true 的那個當下）。已經核准過、
-- 資料庫裡本來就是 is_founding_member = true 的人不會被 trigger 追到，
-- 所以這份要手動貼到 Supabase SQL Editor 執行一次。
--
-- 前提：
--   1. supabase/subscriptions.sql 的兩支 trigger 已建立
--   2. supabase/functions/push-notify/index.ts 已經部署新版（含 subscriptions 分支）：
--        supabase functions deploy push-notify --no-verify-jwt
--   3. 下面的 <FUNCTION_URL> / <WEBHOOK_SECRET> 換成跟 push_notifications.sql
--      部署時同一組值
--
-- 這支只發一次性 http_post，跟 trigger 呼叫的是同一支 Edge Function、
-- 走同一套 device_tokens／APNs，收到的推播文字完全一樣。
-- 沒有裝置 token 的人（沒登入過 App／沒授權推播）Edge Function 會自己跳過，不會報錯。
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT user_id FROM subscriptions WHERE is_founding_member = true LOOP
    PERFORM net.http_post(
      url     := '<FUNCTION_URL>',            -- https://<project-ref>.supabase.co/functions/v1/push-notify
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-webhook-secret', '<WEBHOOK_SECRET>'
                 ),
      body    := jsonb_build_object(
                   'type', 'BACKFILL',
                   'table', 'subscriptions',
                   'record', jsonb_build_object('user_id', r.user_id, 'is_founding_member', true)
                 )
    );
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 執行前想先看看會發給誰、發幾個人：
--   SELECT user_id FROM subscriptions WHERE is_founding_member = true;
--
-- 想先只測一個人（例如自己的帳號）而不是全部發出去，把 DO 區塊換成：
--   SELECT net.http_post(
--     url := '<FUNCTION_URL>',
--     headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret','<WEBHOOK_SECRET>'),
--     body := jsonb_build_object('type','BACKFILL','table','subscriptions',
--               'record', jsonb_build_object('user_id','<某個創始成員的 user_id>','is_founding_member',true))
--   );
-- ────────────────────────────────────────────────────────────────────────
