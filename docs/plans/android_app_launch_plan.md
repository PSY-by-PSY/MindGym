# MindGym（PSY by PSY）Android App 上架計劃

> 撰寫日期：2026-06-19
> 目的：把現有 Web App 以 **Capacitor 殼 + 載入線上網頁** 的方式包成 Android App
> 上架 Google Play，同時保留「改 web → push → 即時更新、免送審」的高速迭代工作流。
>
> **使用方式**：新開一個 session 後，請 Claude 讀這份文件，再依「執行順序」逐項進行。
> 標 🧑 的是**你（人類）必須手動做**的事；標 🤖 的是 **Claude 可以代勞**的事。
>
> 與 iOS 共用同一個 Capacitor 專案（同一份 web、同一個 `capacitor.config.ts`），
> 只是多 `npx cap add android`。建議搭配 `docs/plans/ios_app_launch_plan.md` 一起看。

---

## 0. 專案現況快照（給 Claude 的背景）

- **前端**：Vite + React 18 + TanStack Router + Tailwind，純 SPA。
- **部署**：前端在 **Vercel**；後端 FastAPI 在 **Render**；DB/Auth 用 **Supabase**。
- **AI 計量計費**：`backend/usage_metering.py`（與上架抽成議題有關，見 §7）。
- **已有 PWA 基礎**：`vite-plugin-pwa` 已設定，manifest、icon、`display: standalone` 皆就緒。
- **Node**：v20 / npm 10。Git `origin` = github.com/DennisJHou/MindGym.git，主分支 `main`。

**核心架構決策**：同 iOS，採 **Capacitor + `server.url` 指向 Vercel 線上網址**。
→ 內容、UI、文案、練習模組改 web 即時生效，**免重新送審**。
→ 只有「殼」本身（icon、權限、推播、Capacitor 版本、原生 plugin）改動才需重新打包送審。

---

## Android vs iOS 的關鍵差異（先讀這段）

| 項目 | iOS | Android |
|------|-----|---------|
| 開發者帳號 | Apple，**年費 US$99** | Google Play，**一次性 US$25** |
| 開發環境 | 必須 Mac + Xcode | **Android Studio，Mac/Win/Linux 皆可** |
| 審核嚴格度 | 嚴（4.2 最低功能、IAP 抓很緊） | 相對寬鬆，但首次審核近年變久（可能數天～兩週） |
| 「只包網站」風險 | 高，需原生價值點 | 較低，但仍建議加推播 |
| 上架產物 | `.ipa`（Archive 上傳） | **`.aab`（Android App Bundle）** |
| 商店後台 | App Store Connect | **Google Play Console** |
| 抽成 | 15～30% | 15～30%（同樣有 Google Play Billing 強制議題） |
| 簽章 | Apple 簽章流程 | **自管 keystore（.jks）＋ Play App Signing**，keystore 遺失＝無法更新，務必備份 |
| 內測 | TestFlight | **Internal testing / Closed testing 軌道** |

---

## 1. 前置準備

| # | 事項 | 誰做 | 說明 |
|---|------|------|------|
| 1.1 | **Google Play 開發者帳號** | 🧑 | 一次性 US$25。個人帳號近年需身分驗證，且**新個人帳號上架前需先做封閉測試（約 12 名測試者 / 14 天）**——這條很重要，越早開帳號越好。 |
| 1.2 | 安裝 **Android Studio**（含 SDK、Platform Tools） | 🧑 | Mac 可裝，免 Xcode。Claude 可給安裝指引。 |
| 1.3 | 安裝 **JDK 17**（Android Studio 通常內建 JBR，可沿用） | 🧑 | Capacitor Android 需要。 |
| 1.4 | 確認 **Vercel 正式網域穩定**（最好自訂網域） | 🧑 | App 載入此 URL；換平台不用重送審。與 iOS 共用同一網域。 |
| 1.5 | **App 名稱 / Application ID 決定** | 🧑 | 例如 `com.mindgym.app`，建議與 iOS Bundle ID 一致。上架後不可改。 |
| 1.6 | App 圖示原始檔（1024×1024 PNG） | 🧑 | 可沿用 iOS 母檔。Android 另需 adaptive icon（前景+背景），Claude 可協助產生。 |

---

## 2. Capacitor 加 Android 平台（🤖 Claude 主導，🧑 跑 GUI/簽章）

> 若 iOS 已接過 Capacitor，這裡只需加 Android 平台；若還沒，先做 §2 共用步驟。

- [ ] 🤖 （若尚未接 Capacitor）安裝 `@capacitor/core @capacitor/cli`、`npx cap init`、設 `capacitor.config.ts`
      （`server.url` 指向正式網域、`webDir: dist`）
- [ ] 🤖 安裝 `npm i @capacitor/android`
- [ ] 🧑 `npx cap add android`（建立 `android/` 原生專案）
- [ ] 🤖 把 `android/` 的建置產物（`build/`、`.gradle`、`local.properties` 等）加進 `.gitignore`，
      保留原生專案原始碼進版控
- [ ] 🧑 `npx cap open android` → Android Studio 開啟，等 Gradle sync 完成
- [ ] 🧑 選模擬器（AVD）或實機 → Run，確認 App 開起來並載入線上網站
- [ ] 🤖 **明文流量**：確認 `server.url` 為 https；若有任何 http 需求要設 `android:usesCleartextTraffic`
      （預設關閉，建議維持關閉）

---

## 3. Android 體驗修整（🤖 Claude 改 code，🧑 實機驗收）

- [ ] 🤖 **系統返回鍵（Back button）**：Android 有實體/手勢返回鍵，需處理
      （`@capacitor/app` 的 `backButton` 事件接 TanStack Router 的上一頁，避免一按就退出 App）
- [ ] 🤖 **Safe Area / 狀態列**：用 `env(safe-area-inset-*)`；設定狀態列顏色（`@capacitor/status-bar`）
      搭配 theme color `#4f7cd4`
- [ ] 🤖 **html2canvas / html-to-image 下載圖片**：在 Android WebView 中驗證；
      若無法直接下載，改用 `@capacitor/filesystem` + `@capacitor/share`
- [ ] 🤖 **Supabase OAuth 登入**：WebView 內第三方登入可能需 `@capacitor/browser` 或 deep link（App Links）
- [ ] 🤖 鍵盤行為（`@capacitor/keyboard`）：輸入框被鍵盤遮擋的調整
- [ ] 🧑 實機逐頁驗收：登入、首頁、感恩、社群、專注模組、四個工作坊、profile，**特別測返回鍵**

---

## 4. 加「原生價值點」——推播（🤖+🧑，建議納入）

> Android 雖比 iOS 寬鬆，仍建議加推播以提升留存，契合習慣養成屬性。

- [ ] 🤖 方案：`@capacitor/push-notifications` + **Firebase Cloud Messaging（FCM）**
- [ ] 🧑 建立 Firebase 專案、下載 `google-services.json` 放進 `android/app/`
- [ ] 🤖 前端接收 FCM token、寫進 Supabase（`device_tokens` 表，可與 iOS 共用，加 `platform` 欄位）
- [ ] 🤖 後端 / pg_cron 發送每日提醒推播邏輯（你已有 pg_cron 經驗）
- [ ] 🧑 實機測試收到推播
- [ ] 🤖 **Android 13+ 通知權限**：執行期需請求 `POST_NOTIFICATIONS` 權限，加對應流程

---

## 5. Google Play 上架素材（🧑 主導，🤖 協助產生）

- [ ] 🤖 產生 App 圖示（512×512 商店圖示 + adaptive icon）
- [ ] 🧑 **Play Console** 建立 App（需 §1.1 帳號）
- [ ] 🧑 **截圖**：手機（至少 2 張）、可選平板。🤖 規劃截哪幾頁、配文案
- [ ] 🤖 撰寫 **App 說明（短/長）、宣傳文案**（中英）
- [ ] 🧑 **Feature graphic 1024×500**（商店橫幅）。🤖 可出設計稿建議
- [ ] 🧑 **隱私政策 URL**（強制）。🤖 可幫你寫頁面放進 web app（與 iOS 共用）
- [ ] 🤖 填寫 **Data safety 表單**草稿（收集 Email、使用數據、PostHog 分析等）
- [ ] 🧑 內容分級問卷、目標客群、廣告聲明

---

## 6. 簽章、送審與發布（🧑 主導）

- [ ] 🧑 **產生 upload keystore（.jks）並安全備份**（遺失＝永遠無法更新此 App，務必雲端+本地雙備份）
- [ ] 🤖 設定 `android/app/build.gradle` 的 signing config（讀環境變數，**keystore 與密碼絕不進版控**）
- [ ] 🧑 啟用 **Play App Signing**（Google 代管正式簽章金鑰，建議開）
- [ ] 🤖/🧑 建置 release **`.aab`**：`./gradlew bundleRelease`（或 Android Studio → Generate Signed Bundle）
- [ ] 🧑 **Internal testing 軌道**先上（最快，數分鐘可發給自己）
- [ ] 🧑 **Closed testing**：新個人帳號需 ~12 名測試者測 14 天才能申請正式發布（§1.1）
- [ ] 🧑 提交正式審核 → 通過後 Production 發布

---

## 7. ⚠️ 必須先想清楚的風險（🧑 決策）

1. **AI 計費 / 訂閱與 Google Play Billing 抽成**
   - 同 iOS：App 內賣「AI 額度 / 訂閱」等數位內容，Google 要求走 **Play Billing，抽 15～30%**。
   - **首版建議**：iOS / Android 首版都不含 App 內付費點，純功能上架，商業模式想清楚再加。
   - 需你拍板，Claude 無法替你決定。

2. **新個人開發者帳號的封閉測試門檻（§1.1）**：這是目前 Google 對新帳號的硬性規定，
   會拖慢首次上架時程，**越早開帳號、越早湊測試者越好**。

3. **keystore 遺失風險**：見 §6，務必雙備份。

4. **自訂網域**：用自己的網域當 `server.url`，換部署平台不用重送審。

---

## 8. 建議執行順序（給新 session 的 TODO）

```
階段 A（你先手動）：1.1 Play 帳號（並開始湊測試者）→ 1.2 Android Studio → 1.4 網域 → 1.5 Application ID
階段 B（Claude 主導）：§2 加 Android 平台  →  你跑 cap add/open android
階段 C（Claude 改 code）：§3 體驗修整（重點：返回鍵）  →  你實機驗收
階段 D（Claude+你）：§4 推播（FCM）
階段 E：§5 素材 → §6 簽章/內測/送審
決策卡點：§7.1 商業模式（與 iOS 一致決定）
```

> **效率建議**：iOS 與 Android 共用同一個 Capacitor 專案與同一份 web。
> §3、§4、§5 的多數工作（safe-area、推播後端、隱私政策、文案、圖示母檔）兩平台共用，
> 建議**先把 Capacitor 接好 + web 體驗修整一次到位**，再分別 `cap add ios` / `cap add android` 各自打包。

---

## 9. 新 Session 啟動提示語（複製貼上用）

> 「請讀 `docs/plans/android_app_launch_plan.md`，我們要開始執行 Android 上架。
> 我已完成 ▢ Play 帳號 ▢ Android Studio ▢ 正式網域（是：______）▢ Application ID（是：______）。
> 請從 §2 加 Android 平台開始，凡是需要我手動跑簽章 / 開 Android Studio 的步驟請明確標出並給我指令。」
