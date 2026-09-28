# PAYUNI 官網與付款資訊呈現：功能規格

> 狀態：Active Specification (Web & iOS Frontend Integration)  
> 最後更新：2026-09-28  
> 來源：[PAYUNi 申請用｜官網與付款流程內容初稿](../../../../PAYUNi申請_官網內容初稿.docx.pdf)  
> 相依規格：[PAYUNI 定期扣款訂閱](payuni-recurring-subscription.md)

## 1. 目的與本次邊界

本規格將 PAYUNi 審核與使用者需要理解的服務、方案、取消與退款資訊，整理成可在
Web 與 iOS 正確呈現的前端交付項目。目標是讓未登入的 PAYUNi 審核人員可完整閱讀
公開資訊，也讓已登入使用者在付款前了解方案與自動續訂規則。

### API 對接與階段更新（2026-09-28）

因 `payuni-recurring-subscription.md` 後端 **P1（資料基礎）、P2（初始付款 API 與 Callback）與 P3（Canonical Entitlement Cutover、取消續扣 API、管理員退款 API）已全數驗收通過**，前端串接前置阻擋已解除：

- **現已可直接串接後端 API**：
  - 建單與 PAYUNi 導向表單：`POST /v1/billing/checkout-sessions`
  - 查詢個人訂閱與歷史：`GET /v1/billing/me`
  - 查詢特定訂單狀態與 Resume 導轉：`GET /v1/billing/orders/{id}` & `POST /v1/billing/orders/{id}/resume`
  - 使用者取消自動續扣：`POST /v1/billing/subscription/cancel`
- 本階段工作包含：C3 付款前 UI 與 PAYUNi 表單自動導轉、C4 付款結果頁與 `/settings/billing` 訂閱管理頁、C5 前端 Playwright 全鏈路 E2E 測試套件。

## 2. 產品呈現原則與平台邊界

| 平台 | 可見內容 | 不應出現的內容 |
| --- | --- | --- |
| Web（未登入亦可） | `/pricing`、退款、條款、隱私、客服與商家資訊 | 無 |
| Web（登入後） | 上述內容；結帳確認頁、PAYUNi 刷卡導向、`/settings/billing` 訂閱管理 | 虛假或未處理的安全憑證 |
| iOS App | 服務條款、隱私、客服、既有權益與訂閱狀態 (`GET /v1/billing/me`) | PAYUNi Web 結帳 CTA、外連 `/pricing` 的導購入口 |

目前 iOS 是 Capacitor WebView，技術上能載入 Web 路由；本規格的限制是**產品路由與導覽
策略**，不是單純用 CSS 隱藏。iOS 使用者若在 Web 已購買 Pro，仍可用同一帳號使用該
權益；付款來源與取消方式必須依未來的 Web PAYUNi 或 Apple IAP 來源個別呈現。

## 3. 資訊架構與頁面範圍

```mermaid
flowchart TD
  A[公開 Footer] --> B[/pricing 方案與價格]
  A --> C[/refund 退款政策]
  A --> D[/terms 服務條款]
  A --> E[/privacy 隱私權政策]
  A --> F[/support 客服中心]
  B --> G[登入／註冊]
  G --> H[結帳確認頁 - 後續金流階段]
  H --> I[PAYUNi 付款頁 - 不屬本次]
  J[iOS App] --> D
  J --> E
  J --> F
  J -. 不導購 .-> B
```

| 路由／區塊 | 存取條件 | 本次交付 |
| --- | --- | --- |
| `/pricing` | 公開、免登入 | 新增公開方案頁、FAQ、完整法律與客服連結 |
| `/refund` | 公開 | 新增退款政策頁 |
| `/terms` | 公開 | 以現有條款為基礎，補訂閱、付款、取消、退款與停權條文 |
| `/privacy` | 公開 | 以現有政策為基礎，補付款資料與 Token 資料處理條文 |
| `/support` | 公開 | 補齊商家與客服資訊；提供法律頁連結 |
| 全站 Footer | 公開 | 統一顯示法律頁、客服、非醫療聲明與商家資料 |
| 結帳確認頁 | 登入後 | 僅定義 UI 與文案；實作必須等真實 checkout contract |
| 訂閱與付款紀錄 | 登入後 | 僅定義未來畫面需求；不在本次實作 |

## 4. 頁面內容契約

### 4.1 `/pricing`：方案與價格

- 必須免登入可讀，且每個方案價格由 `pricing_config` 或後續等效的單一設定來源讀取，不能散落寫死。
- 顯示服務內容：每日練習、PERMA 追蹤、AI 週報、社群；以及「非醫療服務」聲明與 1925／119 危機資訊。
- 顯示月繳、季繳、年繳的價格、計費週期、自動續訂、扣款日與取消規則。
- 顯示 Free／Pro 功能比較、付款方式、含稅說明、發票說明、自動續訂說明與 FAQ。
- 包含退款、條款、隱私與客服的明確連結。

> 待確認：來源初稿的方案表將「月繳」標成每三個月續訂、將「季繳」標成每月續訂，
> 與方案名稱衝突。本項未確認前不得將該文字實作成正式文案。

### 4.2 `/refund`：退款政策

- 說明 7 天退款、系統錯誤重複／錯誤扣款、服務終止按比例退款等情境。
- 清楚區分「取消自動續訂」與「申請退款」：前者保留至本期結束，後者成功後立即終止該期權益。
- 說明申請管道、訂單編號需求、回覆時間、退款入帳時間與 Apple 購買例外。
- 本頁的消保、稅務與「每 12 個月一次」等文字必須在上線前經商務／法務確認。

### 4.3 `/terms` 與 `/privacy`

- 保留既有非付費條款，新增或替換初稿標示的訂閱、付款、取消、退款、停權與服務終止段落。
- 隱私政策需說明：不保存完整卡號／安全碼；僅在必要範圍保存付款結果、訂單、發票與 PAYUNi Token。
- Token 必須聲明為伺服器端受控資料，使用者端與一般管理介面不可讀。
- 所有法律頁要有「最後更新」日期，且 Footer 與結帳確認頁使用相同版本連結。

### 4.4 Footer、客服與商家資訊

- Footer 必須連至方案與價格、條款、隱私、退款與客服中心。
- 顯示非醫療服務與危機求助聲明。
- `/support`、Footer 與 `/pricing` 底部共用相同商家資訊元件，避免資料不一致。
- 商號、統編、負責人、地址、電話與客服時間在未取得正式資料前以明確的待填欄位管理，不能以虛構資料上線。

### 4.5 結帳確認頁：串接 FastAPI Checkout Session API

使用者在導向 PAYUNi 前必須看到：方案名稱、當次金額、下一次扣款日、自動續訂與取消規則、7 天退款摘要。
使用者必須勾選服務條款、隱私權政策與退款政策，並以**獨立、不可預先勾選**的控制項
明確同意「依所選週期自動續扣，直到取消為止」，才可進入付款。

#### API 對接契約 (`POST /v1/billing/checkout-sessions`)
- **請求參數**：
  ```json
  {
    "plan_code": "pro_monthly",
    "terms_version": "2026-09-28",
    "recurring_consent": true,
    "recurring_consent_version": "2026-09-28"
  }
  ```
- **表單自動提交機制**：
  後端回傳 `provider_action` 內包含 `form_url` (`https://upp.payuni.com.tw/api/upp`) 與 `form_fields` (`MerID`, `EncryptInfo`, `HashInfo`, `Version`)。前端需在記憶體動態建立 DOM `<form method="POST" action="...">` 並自動呼叫 `submit()`，無縫跳轉至 PAYUNi UPP 刷卡頁。
- 前端不得顯示、接收或保存 `CreditHash` 或敏感卡號資料。

### 4.6 付款結果與訂閱管理頁面：串接 P3 Overview 與 Cancel API

1. **付款結果著陸頁 (`/billing/result`)**：
   - 接收 PAYUNi 刷卡完成後導回的 URL 參數（含 `order_id`）。
   - 呼叫 `GET /v1/billing/orders/{id}` 輪詢訂單狀態（`paid` / `pending` / `failed`）。
   - 當狀態為 `paid` 時顯示成功畫面，並呼叫前端權益 Context 重新整理 (`fetchEntitlements(true)`)，讓用戶免重新整理即刻享有 Pro 權益。
2. **訂閱管理頁面 (`/settings/billing`)**：
   - 呼叫 `GET /v1/billing/me` 讀取 Canonical Entitlement (`tier`, `is_pro`)、訂閱狀態 (`status`：`active` / `cancel_scheduled` / `canceled`)、到期時間 (`current_period_ends_at`) 與繳費紀錄 (`orders`)。
   - 當 `status == 'active'` 時，呈現「取消自動續扣」按鈕；點擊後彈出二次確認 Modal。
   - 確認取消時打 `POST /v1/billing/subscription/cancel`，成功後畫面即時更新為 `cancel_scheduled`，並顯示提醒「您的 Pro 權益將保留至 到期日 止，之後將自動停止扣款」。

## 5. 使用者流程與文案狀態

```mermaid
flowchart TD
  A[訪客瀏覽 /pricing] --> B[閱讀方案、續訂、退款與 FAQ]
  B --> C[登入或註冊]
  C --> D[結帳確認：方案、金額、下次扣款日]
  D --> E{已同意三份政策\n與自動續扣？}
  E -->|否| F[付款按鈕不可用]
  E -->|是| G[呼叫 POST /checkout-sessions\n自動 submit 表單前往 PAYUNi UPP]
  G --> H{PAYUNi 付款結果}
  H -->|成功導回| I[GET /orders/{id} 輪詢 -> 成功頁 -> 自動解鎖 Pro 權益]
  H -->|取消/失敗| J[提示付款失敗或未完成，提供重試按鈕]
  I --> K[前往 /settings/billing 查看訂閱與取消自動續約]
```

## 6. 設計、工程與測試方式

### 6.1 實作原則

- 使用 TanStack file routes 新增公開路由；公開頁不得要求 Supabase session。
- 抽出可重用的 `LegalFooter`／`MerchantContact` 類元件，避免每頁複製商家資料。
- 價格與方案內容由一個可追溯的設定來源供應。
- iOS 導覽必須根據 Capacitor runtime 控制，不只依賴畫面隱藏，避免外連導購遺漏。

### 6.2 驗收層次

| 層次 | 工具／方式 | 主要驗收 |
| --- | --- | --- |
| Web 視覺與內容 | 手動啟動 `npm run dev` | 路由、文案、RWD、連結、公開可讀性 |
| 結帳與表單導轉 | Playwright / 手動測試 | `POST /checkout-sessions` 參數、同意閘門、隱藏表單自動提交 |
| 訂閱管理與取消 | Playwright / 手動測試 | `/settings/billing` 狀態顯示、`POST /subscription/cancel` 取消流程 |
| iOS 真機感受 | Xcode iOS Simulator 手動驗收 | safe area、WebView 捲動、iOS 不出現 PAYUNi 導購入口 |

### 6.3 本機 iOS 預覽（不影響發布設定）

正式 `capacitor.config.ts` 預設固定載入 `https://app.psybypsy.com`。若要以 iOS Simulator
查看尚未部署的 React 畫面：

1. 執行 `npm run dev -- --host 127.0.0.1`。
2. 在專案根目錄建立**不提交**的 `.capacitor-preview.local`：
   ```json
   { "serverUrl": "http://127.0.0.1:5173" }
   ```
3. 執行 `npm run ios:sync:local-preview`，再用 Xcode 開啟 `ios/App/App.xcworkspace` 並執行
   Simulator。
4. 驗收後以一般 `npx cap sync ios` 重新同步，或刪除 iOS 產生的本機 config；不要提交產物。

## 7. 待確認事項與交付順序

### 7.1 必要商務確認

1. 實際收款商號、統編、負責人、地址、電話與客服時間。
2. 正式月／季／年方案、價格、試用價、計費週期、價格調整規則與收費日。
3. PAYUNi 的 Token／定期扣款開通資格，以及固定對外 IP 的部署方案。
4. 電子發票的實際開立服務與責任方。
5. Web PAYUNi、Apple IAP 是否同時提供，以及跨平台權益與取消／退款規則。
6. 退款與資料保存條款之商務、會計與法務確認。

### 7.2 建議交付階段

- **C1：公開資訊頁** — 分段實作 `/pricing`、`/refund`、更新 `/terms`、`/privacy`、`/support` 與 Footer。
- **C2：前端驗收** — Web 手動／RWD 測試、iOS Simulator 導覽驗收；Playwright 公開頁回歸。
- **C3：結帳確認與 PAYUNi 導轉** — 實作結帳確認頁、獨立自動續扣同意控制項，對接 `POST /v1/billing/checkout-sessions` 並實作 PAYUNi UPP 自動提交表單。
- **C4：付款結果與訂閱管理** — 實作付款結果著陸頁 (`/billing/result`) 輪詢，以及 `/settings/billing` 訂閱管理頁對接 `GET /v1/billing/me` 與 `POST /v1/billing/subscription/cancel`。
- **C5：前端全鏈路 E2E 測試** — 建立 Playwright 端到端整合測試套件，涵蓋完整方案選取 -> 結帳 -> 模擬金流導回 -> 權益即時生效 -> `/settings/billing` 查看與取消續扣流程。

## 8. 實作追蹤

> 接手規則：只有程式碼與相應驗收完成後才能勾選；商務、PAYUNi 或法務確認必須
> 取得可追溯的書面來源後才能勾選。未勾選項目不得對外宣稱已上線。

### C0：規格與輸入

- [x] 建立本功能 spec，定義 Web／iOS 邊界、內容與驗收方式。
- [x] 核對現有 `pricing_config`：目前僅有月繳與年繳，沒有季繳。
- [x] 更新 Web & iOS 前端規格，對接已完成之 P2/P3 金流 API 契約 (2026-09-28)。
- [ ] 確認正式商家身分、客服資料與營業資訊。
- [ ] 確認正式方案、價格、計費週期與收費啟用日期。
- [ ] 確認退款、發票、資料保存及跨平台購買文字。

### C1：公開資訊頁

- [x] C1.1 建立共用公開法律 Footer 與商家資訊呈現元件。
- [x] C1.2 新增公開 `/pricing`：讀取啟用的 `pricing_config`，不含付款 CTA。
- [x] C1.3 新增公開 `/refund`：先呈現審核中的退款政策版本。
- [x] C1.4 更新 `/terms` 的付費、取消、退款、停權段落；同步登入同意閘門。
- [x] C1.5 更新 `/privacy` 的 PAYUNi、付款資料與 Token 段落；同步登入同意閘門。
- [x] C1.6 更新 `/support`、Footer 的商家／客服資訊與付款 FAQ。
- [x] C1.7 Web 手動驗收公開路由、RWD、法律連結及無付款 CTA。
- [x] C1.8 無 `.env` 的本機公開頁預覽不再白畫面；價格區明確提示未連接 Supabase。

### C2：iOS 與 Web 回歸

- [x] C2.1 建立不提交的 Capacitor 本機預覽設定，讓 iOS Simulator 可載入本機 Vite。
- [ ] C2.2 iOS Simulator 驗收 safe area、捲動與「不出現 PAYUNi 導購入口」。
  - 目前阻礙：開發機未安裝 Xcode／`simctl`，故尚未以原生 WebView 實測；Playwright 的
    iPhone viewport 只覆蓋 Web RWD，不可替代此項。
- [x] C2.3 加入 Playwright，覆蓋公開路由、手機 viewport、Footer 連結與無付款 CTA。

### C3：付款前 UI 與 PAYUNi 導轉（對接 P2 API）

- [x] C3.1 實作結帳確認頁 (`CheckoutModal.tsx`) 與條款／隱私／退款同意 Checkbox（不可預勾）(2026-09-28)。
- [x] C3.2 實作獨立的自動續扣同意 Checkbox（不可預勾），並顯示方案金額、計費週期與取消方式說明 (2026-09-28)。
- [x] C3.3 串接 `POST /v1/billing/checkout-sessions` API (`billing.ts` / `createCheckoutSession`)，帶入 `terms_version` 與 `recurring_consent` 參數 (2026-09-28)。
- [x] C3.4 實作隱藏 DOM 表單自動 `.submit()` (`submitPayuniForm`) 導向 PAYUNi UPP 刷卡頁 (2026-09-28)。


### C4：付款後畫面與訂閱管理（對接 P3 API）

- [ ] C4.1 實作 `/billing/result` 付款結果著陸頁，呼叫 `GET /v1/billing/orders/{id}` 輪詢狀態並更新權益 Context。
- [ ] C4.2 實作 `/settings/billing` 訂閱管理頁面，對接 `GET /v1/billing/me` 渲染當前 Pro/Free 權益、訂閱狀態與繳費紀錄。
- [ ] C4.3 實作「取消自動續扣」二次確認 Modal 與 `POST /v1/billing/subscription/cancel` API 呼叫，即時更新訂閱狀態為 `cancel_scheduled`。

### C5：前端全鏈路 E2E 測試

- [ ] C5.1 建立 Playwright 結帳導轉測試：驗證未勾選同意控制項時付款按鈕為 Disabled。
- [ ] C5.2 建立 Playwright API Mock / 整合測試：模擬建單、導轉與回跳成功頁。
- [ ] C5.3 建立 Playwright 訂閱管理測試：驗證 `/settings/billing` 正確顯示 `is_pro` 與執行取消續約流程。
