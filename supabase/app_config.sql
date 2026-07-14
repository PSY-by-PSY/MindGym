-- ─────────────────────────────────────────────────────────────────────────
-- App 強制更新設定
--
-- 背景：capacitor.config.ts 用 server.url 載入遠端 Vercel 網頁，網頁內容改動
-- 不需重新送審即可生效；只有「原生殼」本身（icon、權限、plugin、App 版本號）
-- 改動才需要重新打包、送 App Store 審核。
--
-- 這張表讓我們在「殼改了、舊版本殼已經跑不動新的網頁邏輯」時，逼舊版本使用者
-- 更新，而不用等所有人自然升級：
--   1. 原生殼版本號（Info.plist 的 MARKETING_VERSION）出新版時，把該平台的
--      min_version 提高到新版本號。
--   2. App 啟動時（src/lib/appVersion.ts）比對目前殼版本 vs. 這裡的
--      min_version，低於門檻就全螢幕擋下、導去 App Store 更新。
--   3. 純網頁使用者不受影響（沒有原生殼版本，checkForceUpdate 直接跳過）。
--
-- 寫入只走下面的 update_app_config() SECURITY DEFINER RPC（沿用 pro_modules.sql
-- 的 is_admin() 檢查），/admin 後台「App 版本控管」分頁即呼叫此 RPC——不開放
-- 任何直接 UPDATE policy，避免 anon/authenticated 角色意外寫入這張影響全體
-- 使用者的表。
--
-- ⚠️ 這份檔案依賴 pro_modules.sql 已先建立的 is_admin(uid) function，
--    請確認該檔案已在 Supabase 執行過。
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_config (
  platform text PRIMARY KEY CHECK (platform IN ('ios', 'android')),
  min_version text NOT NULL,       -- 低於此版本（含）強制更新，格式 x.y 或 x.y.z
  update_url text,                 -- App Store / Play Store 連結；未設定時畫面只顯示訊息、不顯示按鈕
  update_message text,             -- 給使用者看的說明；未設定時用前端預設文案
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- App 啟動時（含未登入）都要能查詢，所以開放給 anon + authenticated 讀取。
DROP POLICY IF EXISTS "app_config_public_read" ON app_config;
CREATE POLICY "app_config_public_read" ON app_config
  FOR SELECT
  USING (true);

-- 初始值：目前殼版本是 1.0（見 ios/App/App.xcodeproj MARKETING_VERSION），
-- 先設 min_version = 1.0（等於目前版本 → 不會擋任何人）。
-- 之後每次因為殼變動需要強制升級，手動把 min_version 改成新版本號即可。
INSERT INTO app_config (platform, min_version)
VALUES ('ios', '1.0')
ON CONFLICT (platform) DO NOTHING;

-- Admin RPC：新增或更新一個平台的強制更新設定（/admin →「App 版本控管」呼叫）。
CREATE OR REPLACE FUNCTION update_app_config(
  p_platform text, p_min_version text, p_update_url text, p_update_message text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  INSERT INTO app_config (platform, min_version, update_url, update_message, updated_at)
    VALUES (p_platform, p_min_version, p_update_url, p_update_message, now())
  ON CONFLICT (platform) DO UPDATE
    SET min_version = EXCLUDED.min_version,
        update_url = EXCLUDED.update_url,
        update_message = EXCLUDED.update_message,
        updated_at = now();
END; $$;
