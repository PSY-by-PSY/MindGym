-- ============================================================
-- 機器人按讚 — 每天 06:00（台北時間）保底補按
--
-- 背景：原本的 schedule_bot_likes()/process_bot_likes() 仰賴後端或 pg_cron
-- 每 2 分鐘執行；若後端無法持續運行、或 */2 排程沒跑成功，貼文就可能完全沒有讚。
-- 這支保底機制每天清晨把「昨晚（近 30 小時）所有已分享貼文」補到 5~10 個機器人讚，
-- 確保每位打卡的人早上起來都會看到自己的貼文有互動。
--
-- 執行步驟：
--   1. 確認已啟用 pg_cron（Dashboard > Database > Extensions）
--   2. 在 SQL Editor 執行此檔案（只需執行一次）
-- ============================================================

-- 把近 30 小時內的已分享貼文補到 5~10 個機器人讚（已有的算進去，不會無限累積）
CREATE OR REPLACE FUNCTION backfill_overnight_bot_likes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec      RECORD;
  v_target int;
  v_have   int;
  i        int;
BEGIN
  FOR rec IN
    SELECT id
    FROM gratitude_entries
    WHERE is_shared = true
      AND created_at >= (now() - interval '30 hours')
  LOOP
    -- 目前已有的機器人讚數
    SELECT count(*) INTO v_have
    FROM likes
    WHERE entry_id = rec.id AND is_bot = true;

    v_target := 5 + floor(random() * 6)::int; -- 5 到 10 個讚

    IF v_have < v_target THEN
      FOR i IN 1..(v_target - v_have) LOOP
        BEGIN
          -- user_id 為 NULL（UNIQUE(entry_id, user_id) 允許多個 NULL）
          INSERT INTO likes (entry_id, is_bot) VALUES (rec.id, true);
        EXCEPTION WHEN OTHERS THEN
          NULL; -- 貼文已刪除或其他錯誤，略過
        END;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

-- 排程：pg_cron 以 UTC 計時，台北（UTC+8）06:00 = 前一日 22:00 UTC。
-- 先移除舊的同名排程再建立，避免重複。
SELECT cron.unschedule('overnight-bot-likes')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'overnight-bot-likes');

SELECT cron.schedule(
  'overnight-bot-likes',
  '0 22 * * *',                       -- 06:00 Asia/Taipei
  $$SELECT backfill_overnight_bot_likes()$$
);
