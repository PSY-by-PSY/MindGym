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
- ⚠️ **這句話曾經是錯的，害推播壞了整整三個月**：插件**不會**自動接 AppDelegate 的
  token 回呼，原生碼一定要改 —— 見下面步驟 2.5。

> ⚠️ **entitlements 已拆成兩份**（2026-09-07）。Xcode 加 capability 時只會產生一份
> `aps-environment = development` 的 `App.entitlements`，拿它 archive 上架，
> 使用者的裝置拿到的是 sandbox token，正式 APNs 一律回 `BadDeviceToken`——
> **不會有任何錯誤畫面，推播就是不會來**。所以：
>
> | 設定 | CODE_SIGN_ENTITLEMENTS | aps-environment |
> |---|---|---|
> | Debug（Xcode 跑實機） | `App/App.entitlements` | `development` |
> | Release（Archive／TestFlight／App Store） | `App/AppRelease.entitlements` | `production` |
>
> 兩份檔案除了這一行完全相同；**之後在 Xcode 加任何 capability，記得兩份都要加**
> （Xcode 只會改當前 scheme 設定所指的那一份）。

## 2.5 AppDelegate 必須轉發 APNs token（2026-09-22 修）

`PushNotifications.register()` 只呼叫 `UIApplication.shared.registerForRemoteNotifications()`；
device token 是 iOS 回呼到 **AppDelegate** 的，插件靠 NotificationCenter 接。
`ios/App/App/AppDelegate.swift` 少了這兩個方法時，token 沒人轉發 →
JS 的 `registration` / `registrationError` **都不會觸發**、`device_tokens` 永遠空的，
而且完全不報錯，推播就是靜默地永遠不來（Debug、TestFlight、App Store 一律如此）。

```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}
func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```

⚠️ 重建殼或升級 Capacitor 時最容易弄丟這段——改完 AppDelegate 後務必回來確認還在。

## 3. 設定 Edge Function secrets
```bash
supabase secrets set \
  APNS_KEY_ID=你的KeyID \
  APNS_TEAM_ID=你的TeamID \
  APNS_BUNDLE_ID=com.psybypsy.app \
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

## 7. 送審前必做：正式環境（production）推播驗證

模擬器與 Xcode Debug build **驗證不到這件事**——模擬器根本拿不到真的 APNs token，
Debug build 拿到的是 sandbox token。上架前唯一算數的驗證是下面這一輪：

1. Xcode → **Product → Archive**（Release 設定，會吃 `AppRelease.entitlements`）。
2. Organizer → **Distribute App → TestFlight (Internal Only) 或 App Store Connect**，
   用 **Distribution provisioning profile** 簽。
3. 從 **TestFlight** 安裝到**實機**（不要用 Xcode 直接 run，那又變回 Debug）。
4. App 內「選單 🔔 通知 → 開啟通知」授權，確認 Supabase `device_tokens` 多出一筆
   **新的** token（production token 與先前 Debug 那筆不同，舊的留著會 `BadDeviceToken`，
   Edge Function 會自動清掉）。
5. 確認 secret 是 `APNS_HOST=api.push.apple.com`（見步驟 3）。
6. 用**另一個帳號**對你的貼文按讚／留言 → 把 App 滑掉 → 幾秒內應收到推播。
7. `supabase functions logs push-notify` 應看到該次為 200，沒有 `BadDeviceToken`。

第 6 步收到推播，才算「正式環境推播已驗證」。這一輪沒跑過就不要送審。

---

## 排查
- **沒收到**：先看 Edge Function logs（`supabase functions logs push-notify`）。
  - `BadDeviceToken` → APNS_HOST 環境不對（見步驟 3）。
  - `403` → WEBHOOK_SECRET 對不上。
  - `no tokens` → `device_tokens` 沒存到（確認步驟 6-1、6-2）。
  - **完全沒有 log、`device_tokens` 一筆都沒有** → 八成是 AppDelegate 少了 token
    轉發（見步驟 2.5）。判準：授權後 `device_tokens` 依然是空表，且 Safari Web
    Inspector 的 console 連 `[push] registrationError` 都沒印出來。
- **想先本機假測**（不經 APNs，僅驗證 UI）：實機/模擬器
  `xcrun simctl push booted com.psybypsy.app payload.json`（payload 內含 `aps.alert`）。

## 之後可優化（非必要）
- **機器人按讚不推播**：已處理 ✓ —— 觸發器加了 `WHEN (NEW.is_bot IS NOT TRUE)`，
  Edge Function 也再保險一次，機器人讚不會推。
- **節流／合併**：短時間多個讚合併成一則（目前每個互動各一則）。
- **App 關閉時收不到 → 完整版已具備**；之後若要「靜默推播更新角標」可再加 silent push。
