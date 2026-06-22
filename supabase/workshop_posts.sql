-- ============================================================
-- MindGym — 工作坊貼文聚合（規格 [2]）
-- 可重複執行（idempotent）。在 Supabase Dashboard > SQL Editor 執行此檔案。
--
-- 背景：工作坊貼文（找尋真實自我 / 生命最後一天 / WOOP）改為依「工作坊（日期）」
-- 聚合成區塊。每則貼文以 payload.workshop_id 記錄所屬工作坊：
--   - 新貼文：前端在發佈時寫入（YYYYMMDD，例如 "20260620"）。
--   - 歷史貼文：沒有 workshop_id，一律先 Append 至 "0619意義感工作坊" 區塊。
--
-- 依賴：gratitude_entries.payload(jsonb) 欄位（process_goal.sql 已建立）。
-- 前端在 payload 缺 workshop_id 時也會退回 "0619意義感工作坊"，因此即使此腳本
-- 尚未執行，畫面仍會正確分組；執行後資料層也保持一致。
-- ============================================================

-- 保險起見：payload 欄位若不存在則補上（與 process_goal.sql 一致，冪等）。
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS payload jsonb;

-- 把所有「尚未標記 workshop_id」的歷史工作坊貼文歸入 "0619意義感工作坊"。
UPDATE gratitude_entries
SET payload = jsonb_set(
  COALESCE(payload, '{}'::jsonb),
  '{workshop_id}',
  '"0619意義感工作坊"',
  true
)
WHERE practice_type IN ('workshop_authentic_self', 'workshop_last_day', 'workshop_woop')
  AND (payload IS NULL OR payload->>'workshop_id' IS NULL);

-- 加速依 workshop_id 的查詢（社群「工作坊貼文」分頁分組用）。
CREATE INDEX IF NOT EXISTS gratitude_entries_workshop_id_idx
  ON gratitude_entries ((payload->>'workshop_id'));
