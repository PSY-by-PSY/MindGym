# MindGym（PSY by PSY）iOS App 上架計劃

> 撰寫日期：2026-06-19
> 目的：把現有 Web App 以 **Capacitor 殼 + 載入線上網頁** 的方式包成 iOS App 上架，
> 同時保留「改 web → push → 即時更新、免送審」的高速迭代工作流。
>
> **使用方式**：新開一個 session 後，請 Claude 讀這份文件，再依「執行順序」逐項進行。
> 標 🧑 的是**你（人類）必須手動做**的事；標 🤖 的是 **Claude 可以代勞**的事。

---

## 0. 專案現況快照（給 Claude 的背景）

- **前端**：Vite + React 18 + TanStack Router + Tailwind，純 SPA。
- **部署**：前端在 **Vercel**（`vercel.json` 把所有路徑 rewrite 到 `/index.html`）。
- **後端**：FastAPI（Python），部署在 **Render**（根目錄 `app.py` 是 shim，真正在 `backend/app.py`）。
- **資料庫 / Auth**：Supabase。
- **AI 計量計費**：`backend/usage_metering.py`（與上架抽成議題有關，見 §7）。
- **已有 PWA 基礎**：`vite-plugin-pwa` 已設定，manifest、icon、`display: standalone`、
  iOS meta（`apple-mobile-web-app-capable`、`viewport-fit=cover`）皆已就緒。
  注意 `vite.config.ts` 中 PWA 為 `selfDestroying: true`（刻意自毀 SW），
  Capacitor 殼方案下這反而符合「永遠載入最新線上版」的精神，**先不要動**。
- **Node**：v20 / npm 10。
- **Git**：`origin` = https://github.com/DennisJHou/MindGym.git，主分支 `main`，前端直推 main 由 Vercel 自動部署。

**核心架構決策**：採 **Capacitor + `server.url` 指向 Vercel 線上網址** 的混合方案。
→ 99% 的更新（內容、練習模組、UI、文案）改 web 即時生效，**不需重新送審**。
→ 只有「殼」本身改動（icon、權限、推播、Capacitor 版本、原生 plugin）才需重新打包送審。

---

## 1. 前置準備（大多 🧑，無法代勞）

| # | 事項 | 誰做 | 說明 |
|---|------|------|------|
| 1.1 | **Apple Developer Program 帳號** | 🧑 | 年費 US$99。註冊需要 1～2 天驗證。**這是整條路的硬前提，先辦。** |
| 1.2 | **一台 Mac** | 🧑 | 你已是 macOS（Darwin），✅。 |
| 1.3 | **安裝 Xcode**（最新版）+ Command Line Tools | 🧑 | 從 App Store 裝，約 10GB。裝完跑一次開啟同意授權。 |
| 1.4 | 安裝 **CocoaPods**（`sudo gem install cocoapods`） | 🧑 | Capacitor iOS 依賴它。Claude 可提供指令但需要你輸密碼。 |
| 1.5 | 確認 **Vercel 正式網域穩定** | 🧑 | App 會載入這個 URL。最好用自訂網域（如 `app.mindgym.xxx`）而非 `*.vercel.app`，未來搬家不用重新送審。 |
| 1.6 | **App 名稱 / Bundle ID 決定** | 🧑 | 例如 `com.mindgym.app`。一旦上架不可改，先想好。 |
| 1.7 | App 圖示原始檔（1024×1024 PNG，無透明、無圓角） | 🧑 | 可沿用現有品牌 icon 放大。Claude 可協助產生各尺寸。 |

---

## 2. Capacitor 接入專案（🤖 Claude 主導，🧑 跑需要密碼/GUI 的指令）

> Claude 可直接改檔、裝 npm 套件；凡是 `sudo`、開 Xcode GUI、簽章的步驟由你手動。

- [ ] 🤖 安裝套件：`npm i @capacitor/core @capacitor/cli @capacitor/ios`
- [ ] 🤖 `npx cap init "PSY by PSY" "com.mindgym.app"`（名稱/ID 用 §1.6 決定的）
- [ ] 🤖 建立 / 設定 `capacitor.config.ts`：
  - `webDir` 指向 `dist`
  - **關鍵**：`server.url = "https://<你的正式網域>"`、`server.cleartext = false`
    （這就是「載入線上版、免送審更新」的開關）
  - 設 `ios.contentInset = "always"` 等行為
- [ ] 🧑 `npx cap add ios`（會建立 `ios/` 原生專案；若報 CocoaPods 錯，先做 1.4）
- [ ] 🤖 把 `ios/` 適當項目加進 `.gitignore`（Pods 等），保留原生專案原始碼進版控
- [ ] 🧑 `npx cap open ios` → 在 Xcode 設定 Signing Team（你的 Apple 帳號）、確認 Bundle ID
- [ ] 🧑 Xcode 選模擬器或實機 → Run，確認 App 能開起來並載入線上網站

---

## 3. iOS 體驗修整（🤖 Claude 改 code，🧑 實機驗收）

- [ ] 🤖 **Safe Area**：全面套用 `env(safe-area-inset-*)`，避免內容被瀏海 / 底部 home bar 蓋住
      （已有 `viewport-fit=cover`，但 CSS 需補 padding）。重點掃固定頂欄 / 底部導覽列。
- [ ] 🤖 **響應式補強**：目前僅約 15 個 `.tsx` 用到 `sm:/md:/max-w`，逐頁檢查 iPhone 視窗下的排版。
- [ ] 🤖 **html2canvas / html-to-image 下載圖片功能** 在 WebView 中行為驗證（社群發圖、工作坊下載圖片）。
      若 WebView 無法直接觸發下載，可能要改用 Capacitor 的 Share/Filesystem plugin。
- [ ] 🤖 **外部連結 / OAuth 登入**：確認 Supabase 登入流程在 WebView / Capacitor 內正常
      （第三方登入可能需要 `@capacitor/browser` 或 deep link 處理）。
- [ ] 🤖 禁用不需要的縮放 / 過度滾動回彈（overscroll）讓它更像原生。
- [ ] 🧑 實機（真 iPhone）逐頁走一遍：登入、首頁、感恩、社群、專注模組、四個工作坊、profile。

---

## 4. 加一個「原生價值點」——推播（🤖+🧑，過審關鍵）

> Apple Guideline 4.2：純粹包網站的 App 容易被以「最低功能不足」打回。
> 加推播既能過審，又最契合 MindGym 的習慣養成屬性。**強烈建議納入首版。**

- [ ] 🤖 評估方案：`@capacitor/push-notifications`（APNs）或接第三方（如 OneSignal）
- [ ] 🧑 Apple Developer 後台開啟 **Push Notifications** capability、產生 APNs Key
- [ ] 🤖 前端接收 device token、寫進 Supabase（新表 `device_tokens`，附 SQL）
- [ ] 🤖 後端 / 排程（你已有 pg_cron 經驗）發送每日提醒推播的邏輯
- [ ] 🧑 在 Xcode 啟用 Push capability、上傳 APNs Key
- [ ] 🧑 實機測試收到推播（模擬器收不到 APNs）

> 若首版想簡化，至少先做「本地通知」（Local Notifications，不需後端），仍算原生功能。

---

## 5. App Store 上架素材（🧑 主導，🤖 協助產生）

- [ ] 🤖 產生 App 圖示各尺寸（從 1024 母檔）
- [ ] 🧑 **App Store Connect** 建立 App 紀錄（需 §1.1 帳號）
- [ ] 🧑 **螢幕截圖**：6.7" / 6.5" 等尺寸（用模擬器截）。🤖 可幫你規劃要截哪幾頁、配什麼文案
- [ ] 🤖 撰寫 **App 描述、關鍵字、宣傳文案**（中英）
- [ ] 🧑 **隱私政策 URL**（Apple 強制要求）。🤖 可幫你寫一份隱私政策頁放進 web app
- [ ] 🤖 填寫 **App 隱私營養標籤**內容草稿（你們收集了哪些資料：Email、使用數據、PostHog 分析等）
- [ ] 🧑 年齡分級、分類（健康健身 / 醫療？建議「健康健身」較不嚴格）

---

## 6. 送審與發布（🧑）

- [ ] 🧑 Xcode → Product → Archive → 上傳到 App Store Connect
- [ ] 🧑 在 App Store Connect 提交審核（首次審核常 1～3 天，可能有問答往返）
- [ ] 🧑 **TestFlight 內測**（建議！先邀自己 + 幾位朋友裝，抓 WebView 體驗問題再正式送）
- [ ] 🧑 審核通過後發布

---

## 7. ⚠️ 必須先想清楚的風險（🧑 決策）

1. **AI 計費 / 訂閱與 Apple 抽成**
   - 你有 `usage_metering.py`。若 App 內販售「AI 額度 / 訂閱」等**數位內容**，
     Apple 要求走 **App 內購買（IAP），抽 15～30%**，不能只用自己金流，否則下架。
   - **首版建議**：先不要在 iOS 內開放購買 AI 額度（或做成「請至網頁版升級」但要小心，
     Apple 也禁止在 App 內明示導去外部購買）。最乾淨的做法是首版 iOS 不含付費點，純功能。
   - 這題需要你決定商業模式，Claude 無法替你拍板。

2. **「只是包網站」被打回**：靠 §4 推播 + 良好原生體驗化解。

3. **遠端內容不可偷改核心功能 / 商業模式**：載入遠端網頁 OK，但別透過遠端內容繞過審核加入
   付費繞道。內容、文案、練習模組隨便改沒問題。

4. **自訂網域**：務必用自己的網域當 `server.url`（§1.5），否則未來換部署平台＝重新送審。

---

## 8. 建議執行順序（給新 session 的 TODO）

```
階段 A（你先手動，無法代勞）：1.1 Apple 帳號 → 1.3 Xcode → 1.4 CocoaPods → 1.5 網域 → 1.6 Bundle ID
階段 B（Claude 主導接入）：§2 Capacitor 接入  →  你跑 cap add ios / open ios
階段 C（Claude 改 code）：§3 iOS 體驗修整  →  你實機驗收
階段 D（Claude+你）：§4 推播
階段 E（素材與送審）：§5 → §6（含 TestFlight 內測）
決策卡點：§7.1 商業模式，建議在階段 A 就想好
```

---

## 9. 新 Session 啟動提示語（複製貼上用）

> 「請讀 `docs/plans/ios_app_launch_plan.md`，我們要開始執行 iOS 上架。
> 我已完成 ▢ Apple 帳號 ▢ Xcode ▢ CocoaPods ▢ 正式網域（是：______）▢ Bundle ID（是：______）。
> 請從 §2 Capacitor 接入開始，凡是需要我手動跑 sudo / 開 Xcode 的步驟請明確標出並給我指令。」
