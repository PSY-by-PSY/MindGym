# MindGym 本機端對端金流與訂閱操作手冊 (Local E2E Testing Runbook)

> **版本**：v2.0（2026-09-28）  
> **適用範圍**：本地 Supabase (Docker)、FastAPI 後端、React 前端與 PAYUNi Sandbox 端對端業務閉環驗證。

---

## 一、架構與環境拓撲

MindGym 採用「三層分離」的標準化架構，不使用任何 Mock 替代真實業務：

```text
[React 前端 SPA] (Port 5173)
       │
       ▼ (REST API / JWT Bearer)
[FastAPI 後端 API] (Port 8000)
       │
       ├─► [PAYUNi UPP Sandbox] (https://sandbox-api.payuni.com.tw/api/upp)
       │
       ▼ (PostgREST / Auth Gateway)
[Supabase Stack (Kong Gateway)] (Port 54321)
       │
       ├─► [GoTrue Auth] (Port 54321/auth/v1)
       ├─► [PostgREST]   (Port 54321/rest/v1)
       └─► [PostgreSQL]  (Port 54322, Container: supabase_db_MindGym)
              ▲
              │ (Lease / Lock)
       [Callback & Renewal Workers] (CLI 獨立排程處理程序)
```

- **統一資料庫環境**：使用官方 Supabase CLI (`npx supabase start`) 或專案標準 `docker-compose.yml` 進行管理。**嚴格禁止使用散落的臨時 container（如 `supabase-p2-rebuild` 等）濫竽充數**。
- **資料庫遷移管理**：由 Alembic (`.venv-migrations/bin/alembic`) 統一管理資料表版本遷移（`mg_0001_baseline` 至 `mg_0007_billing_renewal`）。
- **真實業務交易**：訂單建立（`billing.orders`）、金流回呼（`billing.provider_events`）、Pro 權益開通（`billing.subscriptions`）100% 透過 PostgreSQL Stored Procedures 與 RLS 運行。

---

## 二、環境設定檔 (`.env`)

專案根目錄 `.env` 需包含以下正式 Sandbox 與 Local Supabase 設定：

```bash
# MindGym Environment Configuration
BILLING_OPERATIONS_ENABLED=1
PAYUNI_GENERIC_UPP_SANDBOX_ENABLED=1
PAYUNI_TOKEN_CONTRACT_APPROVED=1
PAYUNI_INITIAL_CARD_AGREEMENT_SANDBOX_ENABLED=1
PAYUNI_INITIAL_PAYMENT_OUTCOME_SANDBOX_ENABLED=1
PAYUNI_BACKEND_TOKEN_CHARGE_SANDBOX_ENABLED=1

# PAYUNi Sandbox 特約商店資訊
PAYUNI_MERCHANT_ID=S019523016
PAYUNI_HASH_KEY=wx436Ml789Pnq3mzeyBc5TN6dEaw2nzn
PAYUNI_HASH_IV=v6uC83L3hVRpGQ7T
PAYUNI_RETURN_URL=http://localhost:5173/billing/result

# Token 加密金鑰
BILLING_TOKEN_ENCRYPTION_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=

# Local Supabase 服務端點與金鑰
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# Vite 前端 Supabase 連線資訊
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

---

## 三、服務啟動步驟

### 步驟 1：啟動 Local Supabase
1. 確認已啟動 Docker Desktop。
2. 於 `MindGym/` 目錄執行：
   ```bash
   npx supabase start
   ```
3. 確認各服務健康狀態：
   - **Kong API 閘道**：`http://127.0.0.1:54321`
   - **PostgreSQL 資料庫**：`postgresql://postgres:postgres@127.0.0.1:54322/postgres`
   - **Supabase Studio 後台**：`http://127.0.0.1:54323`

### 步驟 2：執行資料庫遷移 (Alembic)
如需初始化或重設最新資料庫結構：
```bash
MINDGYM_LOCAL_TEST=1 MIGRATION_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" .venv-migrations/bin/alembic upgrade head
```

### 步驟 3：建立本機測試帳號（兩種方式）

#### 方式 A：透過網頁端直接登入（登入即註冊，推薦）
1. 開啟瀏覽器進入：`http://localhost:5173/login`
2. 勾選底部的 **「我已閱讀並同意使用者條款與隱私政策」**。
3. 點選 **「用 email 登入」**。
4. 輸入欲測試的 Email 與密碼（至少 6 碼），點擊 **「登入」**。
5. 首次登入之新帳號，前端會自動於後端 Supabase 完成建立並寫入 `auth.users`，無須手動切換註冊分頁，並立即完成登入跳轉至首頁！

#### 方式 B：透過 Supabase Admin API 建立
```bash
curl -s -X POST "http://127.0.0.1:54321/auth/v1/admin/users" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com", "password":"Password123!", "email_confirm":true}'
```

### 步驟 4：啟動 FastAPI 後端 (Port 8000)
```bash
cd /Users/chaoalbert/Projects/playground/MindGym
uvicorn backend.app:app --reload --port 8000
```
- API Docs：http://localhost:8000/docs
- 方案列表：http://localhost:8000/v1/billing/plans

### 步驟 5：啟動 React 前端 (Port 5173)
```bash
cd /Users/chaoalbert/Projects/playground/MindGym
npm run dev
```
- 前端定價首頁：http://localhost:5173/pricing

---

## 四、真實端對端測試操作流程 (7 步驟閉環)

### 步驟 1：選取方案並確認條款
1. 開啟方案頁面：`http://localhost:5173/pricing`。
2. 點擊 **「Pro 年繳訂閱」**（或月繳方案）。
3. 系統將開啟結帳確認視窗（`CheckoutModal`），勾選「我同意自動續約服務條款」。

### 步驟 2：建立待付款訂單與加密跳轉
1. 點擊 **「前往付款 (PAYUNi)」**。
2. 前端呼叫 `POST /v1/billing/checkout-sessions`：
   - 後端使用服務角色權限於資料庫寫入一筆 `pending` 訂單。
   - 後端使用 Hash Key & IV Key 進行 AES-256-GCM 加密，產出 `EncryptInfo` 與 `HashInfo`。
3. 前端動態建立隱藏 Form 表單並自動 POST 導向至 `https://sandbox-api.payuni.com.tw/api/upp`。

### 步驟 3：在 PAYUNi Sandbox 官方刷卡頁完成付款
1. 進入 PAYUNi 官方測試收銀台，金額顯示 NT$ 1,188（年繳）或 NT$ 150（月繳）。
2. 輸入 PAYUNi 測試信用卡資訊：
   - 卡號：`4000-2211-1111-1111`（或 PAYUNi 測試卡號）
   - 有效年月：任一未來月份（如 `12/30`）
   - 安全碼 (CVC)：`123`
   - 手機簡訊 OTP：輸入任意 6 碼（如 `123456`）確認付款。

### 步驟 4：返回商店與結果展示
1. 刷卡完成後，PAYUNi 會將瀏覽器以 POST 導向回 `http://localhost:5173/billing/result?order_id=MG-xxxx`。
2. Vite 中介層自動攔截 POST 轉交 SPA 處理。
3. 前端載入訂單結果頁面，顯示「確認付款結果中…」。

### 步驟 5：執行 Callback Worker 開通 Pro 權益
在真實營運中，PAYUNi 會送出 Signed Webhook 到後端；在本機手動驗收時，可執行以下指令模擬金流回呼並觸發背景處理：

```bash
# 模擬 PAYUNi 付款成功通知
python scripts/simulate_payuni_callback.py --merchant-order-no "您的MG訂單號" --amount-twd 1188 --outcome success

# 執行 Callback Worker 開通權益 (結算訂單、開通 Pro、建立訂閱記錄)
python scripts/run_billing_callback_worker.py --limit 10
```

### 步驟 6：驗證結果頁與會員管理中心
1. 回到瀏覽器 `http://localhost:5173/billing/result`：
   - 付款狀態轉為 **「✓ 付款成功，恭喜升級 MindGym Pro！」**。
2. 進入訂閱管理中心：`http://localhost:5173/settings/billing`：
   - 會員等級顯示為 **Pro 會員**。
   - 訂閱狀態顯示 **active（有效）**。
   - 歷史清單中可見該筆 `MG-xxxx` 的付款紀錄。

### 步驟 7：驗證自動續約排程與對帳報表
```bash
# 測試定時續約檢查 Worker
python scripts/run_billing_renewal_worker.py --lookahead-hours 24

# 執行每日財務對帳報告
python scripts/billing_reconciliation.py
```

---

## 五、自動化端對端驗收測試 (E2E Suite)

專案已配備完整全鏈路自動化驗證腳本：
```bash
.venv-migrations/bin/python scripts/verify_p2_e2e.py
```
該腳本會依序完成 8 大驗收項目：
1. `GET /v1/billing/plans` 查詢真實資料庫方案。
2. `POST /v1/billing/checkout-sessions` 建立真實待付款訂單與加密信封。
3. `GET /v1/billing/orders/{order_id}` 查詢訂單狀態。
4. 產生帶有正確 HMAC-SHA256 簽章之 PAYUNi 回呼。
5. 寫入 `billing.provider_events` 與 Outbox。
6. 執行 `BillingCallbackWorker` 處理原子交易。
7. 驗證資料庫狀態：訂單標記 `paid`、訂閱啟用 `active`、CreditHash 密文封裝入庫、投影到 `public.subscriptions` 為 Pro、`GET /v1/billing/me` 呈現 Pro 狀態。
8. 測試 Idempotency 冪等性（重複回呼不重複扣款或重複開通）。
