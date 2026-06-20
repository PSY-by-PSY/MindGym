# 遠端推播（APNs）設定步驟

> 目標：有人按讚／留言時，**即使 App 關閉**也收到通知。
> 程式碼已寫好（前端註冊 token、Edge Function 送 APNs、SQL 觸發器）。以下是只有你能做的設定。

架構：`likes/comments INSERT` → SQL 觸發器(pg_net) → Edge Function `push-notify` → 簽 APNs JWT → 推到貼文主人的裝置。

---

## 1. 建立 APNs Auth Key（.p8）— Apple Developer
1. https://developer.apple.com → Certificates, IDs & Profiles → **Keys** → ＋
2. 勾選 **Apple Push Notifications service (APNs)**，命名後 Continue → Register。
3. **下載 `.p8`（只能下載一次！）**，記下 **Key ID**。
4. 順手記下 **Team ID**（右上角帳號／Membership 頁）。

## 2. Xcode 開啟 Push 能力
- `npx cap open ios` → 選 **App** target → **Signing & Capabilities**
- **＋ Capability → Push Notifications**（會自動產生 `App.entitlements` 的 `aps-environment`）
- （Capacitor 的 push 插件會自動接 AppDelegate 的 token 回呼，不用改原生碼。）

## 3. 設定 Edge Function secrets
```bash
supabase secrets set \
  APNS_KEY_ID=你的KeyID \
  APNS_TEAM_ID=你的TeamID \
  APNS_BUNDLE_ID=com.mindgym.app \
  APNS_HOST=api.sandbox.push.apple.com \
  WEBHOOK_SECRET=自訂一組隨機字串
# .p8 內容（含 BEGIN/END 整段）：
supabase secrets set APNS_PRIVATE_KEY="$(cat AuthKey_XXXX.p8)"
```
> ⚠️ **APNS_HOST 環境別搞錯**：
> - 用 **Xcode 直接跑到實機（Development build）** → `api.sandbox.push.apple.com`
> - **TestFlight / App Store** → `api.push.apple.com`
> 環境不符會回 `BadDeviceToken`。換 host 重設 secret 即可，不用改碼。
> （`SUPABASE_URL`／`SUPABASE_SERVICE_ROLE_KEY` Edge Function 預設就有，免設。）

## 4. 部署 Edge Function
```bash
supabase functions deploy push-notify --no-verify-jwt
```
拿到網址：`https://<project-ref>.supabase.co/functions/v1/push-notify`

## 5. 跑 SQL（建表＋觸發器）
打開 `supabase/push_notifications.sql`，把檔內兩個佔位字串換掉：
- `<FUNCTION_URL>` = 上一步的網址
- `<WEBHOOK_SECRET>` = 跟步驟 3 一樣那串
然後整份貼到 **Supabase SQL Editor** 執行。

## 6. 重建殼 + 實機測試
```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx cap sync ios   # 已加 push-notifications pod
```
Xcode 跑到**實機**（⚠️ 模擬器收不到真正的 APNs）：
1. App 內到「選單 🔔 通知 → 開啟通知」授權（會一併註冊 token）。
2. 確認 Supabase `device_tokens` 出現一筆你的 token。
3. 用**另一個帳號**對你的貼文按讚／留言。
4. 把 App 滑掉（關閉）→ 應該幾秒內收到推播。

---

## 排查
- **沒收到**：先看 Edge Function logs（`supabase functions logs push-notify`）。
  - `BadDeviceToken` → APNS_HOST 環境不對（見步驟 3）。
  - `403` → WEBHOOK_SECRET 對不上。
  - `no tokens` → `device_tokens` 沒存到（確認步驟 6-1、6-2）。
- **想先本機假測**（不經 APNs，僅驗證 UI）：實機/模擬器
  `xcrun simctl push booted com.mindgym.app payload.json`（payload 內含 `aps.alert`）。

## 之後可優化（非必要）
- **機器人按讚不推播**：已處理 ✓ —— 觸發器加了 `WHEN (NEW.is_bot IS NOT TRUE)`，
  Edge Function 也再保險一次，機器人讚不會推。
- **節流／合併**：短時間多個讚合併成一則（目前每個互動各一則）。
- **App 關閉時收不到 → 完整版已具備**；之後若要「靜默推播更新角標」可再加 silent push。
