-- ============================================================
-- 機器人按讚 — pg_cron 排程設定
-- 執行步驟：
--   1. Supabase Dashboard > Database > Extensions，啟用 pg_cron
--   2. 在 SQL Editor 執行此檔案（只需執行一次）
-- ============================================================

-- 每 2 分鐘執行一次，把到期的機器人按讚寫入 likes 表
SELECT cron.schedule(
  'process-bot-likes',
  '*/2 * * * *',
  $$SELECT process_bot_likes()$$
);
