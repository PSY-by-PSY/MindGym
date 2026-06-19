# iOS App 進度交接（早安 ☀️）

> 完成於：2026-06-20 凌晨（你睡覺時）
> 分支：**`ios-app`**（所有改動都在這裡，`main` 沒被動，Vercel 線上版沒被影響）

---

## ✅ TL;DR — 現在已經有什麼

**一個能在 iPhone 模擬器啟動、並載入你線上網站的 iOS App 已經跑起來了。**

我用 Capacitor 把網站包成 iOS 殼，採「`server.url` 指向 Vercel」方案：
→ 之後改 web → push，App 內容即時更新、**免重新送審**。

我已經：建好原生專案、裝好 plugins、做好 App 圖示、設好 Info.plist、
**實際在模擬器 build & run 成功並截圖驗證**（登入頁、吉祥物、狀態列、safe-area 都正常）。

下面有一件關於「登入」的重要事項，請務必看 §2。

---

## 1. 我做了哪些事

| 項目 | 狀態 | 說明 |
|------|------|------|
| Capacitor 接入（core/ios + 5 plugins） | ✅ | 用 v7（你的 Node 20 不支援 v8） |
| `capacitor.config.ts`（指向 Vercel） | ✅ | `server.url = https://mind-gym-kappa.vercel.app` |
| `npx cap add ios` + `pod install` | ✅ | 撞到 CocoaPods 編碼 bug，已用 `LANG=en_US.UTF-8` 解掉 |
| **模擬器 build & run** | ✅ | BUILD SUCCEEDED，App 成功載入線上站 |
| App 圖示（1024，吉祥物舉槓鈴） | ✅ | 母檔在 `resources/icon.png`，已套進 AppIcon |
| Info.plist（鎖直向／深色狀態列／麥克風權限／OAuth URL scheme） | ✅ | 見 §5 |
| 原生 Google 登入流程（程式碼） | ✅ 待部署 | 見 §2 ⚠️ |
| 「更像原生」CSS（去點擊高亮、關回彈） | ✅ | 只作用在 App 內，網頁版不受影響 |
| 隱私政策頁 `/privacy`（App Store 必需） | ✅ | 已驗證渲染正常 |
| App Store 上架文案（中英） | ✅ | 見 `docs/reports/ios_app_store_listing.md` |
| 網頁 `npm run build` 仍通過 | ✅ | 我的改動沒弄壞網頁版 |

---

## 2. ⚠️ 最重要：App 內的「Google 登入」還需要兩步才會動

**為什麼：** Google 會封鎖「嵌入式 WebView」裡的 OAuth 登入（`disallowed_useragent`）。
Capacitor 的 WebView 正是嵌入式，所以網頁那套「直接導去 Google」在 App 裡會失敗。

**我已經做了什麼：** 寫好了正解——用系統瀏覽器（Safari View Controller）開登入頁、
再用 deep link（`com.mindgym.app://login-callback`）導回 App。
程式碼在 `src/lib/nativeAuth.ts`，並已接進 `login.tsx`、`main.tsx`。
**全部用 `isNativeApp()` 把關，所以網頁版完全不受影響。**

**還差你做兩步（程式碼才會在 App 內生效）：**

1. **部署這個分支到 Vercel**（因為 App 載入的是線上版，不是本地）。
   - 你可以先把 `ios-app` 合併進 `main`（或開 PR）讓 Vercel 部署。
   - ⚠️ 這會一併把「隱私頁、原生登入、native CSS」上到線上——這些對網頁版都是安全的（無行為變化）。

2. **在 Supabase 後台加一條 Redirect URL**（只需一次）：
   - Supabase → Authentication → URL Configuration → **Redirect URLs**
   - 新增：`com.mindgym.app://login-callback`
   - （Google Cloud Console 不用改，OAuth client 仍是 Supabase。）

做完這兩步後，重開 App 點「用 Google 登入」就會走系統瀏覽器、成功登入。

> 💡 替代方案（若想今天先在 App 內登入測試）：專案裡其實已寫好 Email 驗證碼登入，
> 只是被 `SHOW_EMAIL_LOGIN = false` 關掉（你們團隊先前決定暫時隱藏）。
> Email 登入在 WebView 裡可正常運作。要不要開，是產品決策，我沒擅自改。

---

## 3. 你接下來的 TODO（建議順序）

### A. 先親眼看到 App（5 分鐘）
App 已經裝在模擬器了。若要自己重跑：
```bash
# 開 Xcode（設定簽章團隊、之後 archive 都在這）
npx cap open ios
```
在 Xcode 左上選一台 iPhone 模擬器 → 按 ▶︎ Run。
（或用指令：模擬器已開機，App 已安裝，直接 `xcrun simctl launch booted com.mindgym.app`）

### B. 設定簽章（要上實機／TestFlight 才需要）
Xcode → 選 `App` target → **Signing & Capabilities** → Team 選你的 Apple Developer 帳號。
Bundle ID 已是 `com.mindgym.app`，不用改。

### C. 讓登入在 App 內生效
做 §2 的兩步（部署 + Supabase Redirect URL）。

### D. 處理送審風險（見 §4），再 archive 送 TestFlight。

---

## 4. ⚠️ 送審前必須處理的風險

1. **社群 UGC（Guideline 1.2）— 最可能被打回**
   你的「社群打卡牆」讓使用者發貼文／留言＝使用者生成內容。Apple 要求必須有：
   **檢舉內容、封鎖使用者** 的功能（目前看起來缺）。
   → 建議首版在社群貼文加上「檢舉／封鎖」入口，否則容易被退件。
   （這需要一點開發，醒來我們可以一起做。）

2. **「只是包網站」（Guideline 4.2）**
   有原生推播或夠好的原生體驗較能過。目前殼體驗 OK，但未含推播。
   推播是計劃 §4 的下一步（需要 APNs Key，要你在 Apple 後台開）。

3. **付費／抽成** — 你已決定 App 內不收費 ✅，這題沒風險。

4. **麥克風用途字串** — 已加 `NSMicrophoneUsageDescription`（語音輸入會用到，否則會 crash）。

---

## 5. 我改了哪些檔案（給你 review）

**新增：**
- `capacitor.config.ts` — Capacitor 設定（指向 Vercel）
- `ios/` — 整個 iOS 原生專案（Pods/build 已在 `.gitignore`）
- `src/lib/nativeAuth.ts` — 原生 Google 登入（系統瀏覽器 + deep link）
- `src/routes/privacy.tsx` — 隱私政策頁 `/privacy`
- `resources/icon.png` — App 圖示母檔（1024）
- `docs/reports/ios_app_store_listing.md` — 上架文案
- `docs/reports/ios_app_handoff_0620.md` — 本文件

**修改（都很小、且網頁版安全）：**
- `src/routes/login.tsx` — 原生時改走 `signInWithGoogleNative()`（網頁路徑不變）
- `src/main.tsx` — 啟動時掛 deep link listener、加 `native-app` class（都只在原生生效）
- `src/index.css` — `html.native-app` 下的原生質感 CSS（網頁不受影響）
- `src/lib/analytics.ts` — 多兩個事件型別 `login_started` / `login_error`
- `package.json` — 多了 Capacitor 套件

**重要指令備忘（CocoaPods 編碼 bug）：**
任何 `pod` / `npx cap sync` 前都要帶 locale，否則會報 `ASCII-8BIT` 錯：
```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx cap sync ios
```

---

## 6. 下一步我可以幫你做的（醒來告訴我）

- [ ] 社群加「檢舉／封鎖」功能（過審關鍵）
- [ ] 推播（Local Notifications 先做，不需後端；或 APNs 完整版）
- [ ] 用模擬器把 6 張上架截圖截好
- [ ] 啟動畫面（Splash）換成品牌版（目前是白底）
- [ ] 逐頁實機體驗微調（下載圖片在 WebView 的行為等）
