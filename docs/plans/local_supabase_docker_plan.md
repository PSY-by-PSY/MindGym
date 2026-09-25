# 本機 Supabase（Docker）開發環境計畫

建立日期：2026-09-23
狀態：規劃中（尚未實作）
建議實作分支：`feat/local-supabase-dev`（與 `research/cloudflare-frontend-migration` 分開）

## 1. 目標與範圍

目標：本機開發（`npm run dev`、本機後端、Edge Functions）全部連到本機 Docker 裡的 Supabase，不再碰正式資料庫。

範圍內：

- 用 Supabase CLI（`supabase start`）在 Docker 跑完整 Supabase（Postgres、Auth、REST、Studio、Edge Functions、Mailpit）
- 從正式資料庫匯出「只有結構」的基準 migration，讓本機可一鍵重建
- 測試用 seed 資料（測試帳號、`app_config` 等）
- 前端、後端、Edge Functions 的本機環境變數分流
- npm 指令與團隊文件

範圍外（之後另開議題）：

- 正式環境改用 migration 部署（`supabase db push`）的流程變更
- Cloudflare 預覽環境要連哪個資料庫
- 本機 Google / Apple OAuth（本機用 email + 密碼登入即可）
- 任何正式資料（使用者資料一律不匯出）

## 2. 現況盤點（2026-09-23）

| 項目 | 現況 | 對本機環境的影響 |
|---|---|---|
| Supabase CLI | 未安裝；`supabase/.temp/linked-project.json` 顯示曾 link 過 `atnyozyfsqweiayujlfn` | 需先安裝 |
| Docker | 已安裝並執行中（29.4.0） | 可直接用 |
| `supabase/config.toml` | 不存在 | 需 `supabase init` |
| `supabase/migrations/` | 不存在 | 需從正式資料庫匯出基準 |
| 零散 SQL | `supabase/*.sql` 共 17 個、約 2,790 行，手動貼 SQL Editor 執行，無順序、可能與正式資料庫不一致 | 不能直接拿來重建，只當參考 |
| Extensions | `pg_net`、`pg_cron` | 本機 Supabase 都有，需在 migration 啟用 |
| 資料庫呼叫 Edge Function | `push_notifications.sql`、`broadcast_notify.sql`、`founding_member_backfill_notify.sql` 用 `net.http_post` 打「寫死的正式 Function URL」並帶 `x-webhook-secret` | **高風險**，見第 4 節 |
| pg_cron 排程 | `bot_likes_cron.sql`、`bot_likes_6am.sql`、`daily_schedule.sql` 等 | 排程存在 `cron.job` 表（資料，不是結構），匯出 schema 不會帶過來 → 本機預設不跑，符合需求 |
| Edge Functions | 6 支：`broadcast-notify`、`delete-account`、`extract-keywords`、`gratitude-summary`、`push-notify`、`translate-post` | 用 `supabase functions serve` 跑 |
| Function 密鑰 | `ANTHROPIC_API_KEY`、`APNS_*`（5 個）、`WEBHOOK_SECRET`、`SUPABASE_*` | 本機用獨立的 `.env`，APNs 不設 |
| 登入方式 | Google、Apple OAuth + email/密碼（`src/routes/login.tsx:150` 的 `signInWithPassword`） | 本機用 email/密碼，不需要 OAuth |
| 後端（FastAPI） | `SUPABASE_URL`、`SUPABASE_KEY`、`ANTHROPIC_API_KEY` | 改讀本機值 |
| Storage | 程式碼沒有使用 `storage.from()` | 不用處理 bucket |

## 3. 目標架構

```
npm run dev (Vite :5173) ──┐
                           ├──> 本機 Supabase API :54321 ──> Postgres :54322
backend uvicorn :8000 ─────┘         │
                                     ├── Edge Functions（supabase functions serve）
                                     ├── Studio :54323（看資料、下 SQL）
                                     └── Mailpit :54324（收本機寄出的信）
```

環境變數分流（利用 Vite 的 mode 優先順序）：

| 指令 | Vite mode | 讀取的檔案 | 連到 |
|---|---|---|---|
| `npm run dev` | development | `.env.development.local` 優先於 `.env.local` | 本機 Supabase + 本機後端 |
| `npm run build` / `npm run cf:dev` | production | `.env.local` | 正式 Supabase（只用來驗證正式建置） |

這樣日常開發預設就是本機資料庫，不必每次手動切換。

## 4. 關鍵風險：資料庫 trigger 裡的正式 URL 與密鑰

正式資料庫裡的推播 trigger function 在建立時，已經把 `<FUNCTION_URL>` 和 `<WEBHOOK_SECRET>` 換成實際值。所以：

1. `supabase db pull` 匯出的 migration 會包含**正式的 `WEBHOOK_SECRET` 明碼**，一旦 commit 就會外洩。
2. 本機照原樣跑的話，本機 trigger 會打**正式的** `push-notify`，可能對真實使用者發推播。

處理方式（實作時二選一，建議 A）：

- A. **把 URL 和密鑰改成從設定讀取**：trigger function 不再寫死，改讀 Supabase Vault（`vault.decrypted_secrets`）裡的 `push_function_url`、`webhook_secret`。正式環境在 Vault 存正式值，本機在 `seed.sql` 存本機值（`http://host.docker.internal:54321/functions/v1/...` 加上本機假密鑰）。這需要同步修改正式資料庫的 function，要另外排時間套用。
- B. **只改本機**：匯出後手動把 migration 裡的 URL 和密鑰換成佔位字串，再由 `seed.sql` 用 `CREATE OR REPLACE FUNCTION` 覆蓋成本機版本。正式資料庫不用動，但以後每次重新匯出都要記得清理，容易出錯。

不管選哪個，**commit 前都要掃一次**：`grep -nE "supabase\.co|x-webhook-secret" supabase/migrations/*.sql`，確認沒有正式 URL 和密鑰。

## 5. 實作步驟

### 階段 0：前置（約 0.5 小時）

1. 安裝 Supabase CLI：`npm install -D supabase`（跟著專案鎖版本，團隊一致；用 `npx supabase` 執行）
2. 確認 Docker Desktop 至少分配 4GB 記憶體
3. 取得正式資料庫密碼（`db pull` 需要；由專案擁有者提供，不寫進任何檔案）

### 階段 1：初始化（約 0.5 小時）

1. `npx supabase init` 產生 `supabase/config.toml`
2. 調整 `config.toml`：
   - `project_id = "mindgym"`
   - `[auth] site_url = "http://localhost:5173"`
   - `[auth] additional_redirect_urls = ["http://localhost:5173/**", "http://127.0.0.1:8787/**"]`
   - `[auth.email] enable_confirmations = false`（本機註冊不用收驗證信）
   - Google、Apple provider 維持關閉
3. `.gitignore` 加上 `supabase/.branches`、`supabase/.temp`、`supabase/functions/.env`

### 階段 2：基準 migration（約 1–2 小時，含清理）

1. `npx supabase login`，再執行 `npx supabase link --project-ref atnyozyfsqweiayujlfn`
2. `npx supabase db pull`：產生 `supabase/migrations/<時間戳>_remote_schema.sql`（只有結構、不含資料）
3. 依第 4 節處理 trigger 裡的 URL 與密鑰，並跑 grep 檢查
4. 確認 migration 有啟用 `pg_net`、`pg_cron`
5. 零散的 17 個 `.sql` 移到 `supabase/legacy/`，加一份 README 註明「只當歷史參考，實際結構以 migrations 為準」
6. `npx supabase db reset`：確認可以從零重建、沒有錯誤

### 階段 3：seed 資料（約 1 小時）

建立 `supabase/seed.sql`（`db reset` 時會自動執行）：

- 2–3 個測試帳號寫進 `auth.users`（email/密碼，例如 `dev1@local.test` / `password123`），以及對應的 `profiles`
- `app_config` 的必要設定值（參考 `legacy/app_config.sql`）
- 各功能最少一筆示範資料（社群貼文、感恩紀錄、測驗等），讓主要頁面不是空的
- 如果選第 4 節的方案 A：把本機的 Function URL 和假 `WEBHOOK_SECRET` 寫進 Vault
- 不建立任何 pg_cron 排程

### 階段 4：Edge Functions（約 1 小時）

1. 建立 `supabase/functions/.env`（加進 gitignore）和 `supabase/functions/.env.example`（commit 進 git）：
   - `WEBHOOK_SECRET=local-dev-secret`
   - `ANTHROPIC_API_KEY=`（選填；要測 AI 功能才填，會產生實際費用）
   - `APNS_*` 全部留空
2. `npx supabase functions serve --env-file supabase/functions/.env`
3. 確認 `push-notify` 在沒有 `APNS_*` 時會安全失敗、不會崩潰；如果會崩潰，加上「缺少 APNs 設定就略過並記 log」的判斷（小改動，另開 commit）

### 階段 5：前端與後端接線（約 0.5 小時）

1. 前端新增 `.env.development.local`（已被 `.env.*` 規則排除）：
   ```
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=<npx supabase status 顯示的 anon key>
   VITE_API_URL=http://localhost:8000
   ```
2. 在 `.env.example` 補上本機開發的說明
3. 後端新增 `backend/.env.example`，本機填入：
   - `SUPABASE_URL=http://127.0.0.1:54321`
   - `SUPABASE_KEY=<本機 service_role key>`（依後端現在的用法）
   - `ANTHROPIC_API_KEY=`（選填）

### 階段 6：npm 指令與文件（約 0.5 小時）

`package.json` 新增：

```json
"db:start": "supabase start",
"db:stop": "supabase stop",
"db:reset": "supabase db reset",
"db:status": "supabase status",
"fn:serve": "supabase functions serve --env-file supabase/functions/.env"
```

更新 `README.md` 和 `docs/team-guide.md`，加入「本機開發三步驟」：`npm run db:start`，再 `npm run dev`，然後用測試帳號登入。

## 6. 驗收標準

- [ ] 全新 clone 後，只要 `npm install`、`npm run db:start`、`npm run dev`，就能用 seed 裡的測試帳號登入
- [ ] `npm run db:reset` 可以從零重建，而且沒有錯誤
- [ ] `grep -rnE "atnyozyfsqweiayujlfn|x-webhook-secret'[^<]" supabase/migrations supabase/seed.sql` 沒有找到任何正式 URL 或密鑰
- [ ] 本機發文、按讚等會觸發 trigger 的操作，只會打到本機的 Edge Function（看 `fn:serve` 的 log 確認），正式推播沒有收到任何請求
- [ ] 本機後端呼叫 Supabase 時，寫入的是本機資料庫（在 Studio :54323 確認）
- [ ] `npm test`、`npm run lint`、`npm run build` 都通過（CI 不受影響）
- [ ] 本機 Supabase 停止時，`npm run build` 仍然使用正式設定（mode 分流正確）

## 7. 風險與後續

| 風險 | 說明 | 處理 |
|---|---|---|
| 正式資料庫和 migration 對不上 | 之後有人直接在 Dashboard 改正式結構，本機就會落後 | 短期：定期 `npx supabase db diff --linked` 檢查差異。長期：規定正式結構只能透過 migration 修改（另開議題） |
| `db pull` 匯出不完整 | RLS policy、trigger、function 通常會帶到；`cron.job` 和 Vault 內容不會帶到 | 用 seed 補；階段 2 的 `db reset` 驗證時要逐一點過主要功能 |
| 本機誤用 AI 金鑰 | 本機填了 `ANTHROPIC_API_KEY` 就會產生實際費用 | 預設留空；有需要才填 |
| Docker 資源 | 本機 Supabase 約 10 個容器，大約需要 2–4GB 記憶體 | 不用時執行 `npm run db:stop` |

總工時估計：約 5–7 小時，可以分成 3 個 commit：
1. CLI、`config.toml` 與基準 migration
2. seed 與 Edge Functions 本機設定
3. 環境變數分流、npm 指令與文件
