# 本機驗證紀錄

2026-09-23，對 `mg_0001_baseline` 執行本機驗證。正式 Supabase 沒有任何連線、部署或變更。

## 環境

- Python 3.11；SQLAlchemy 2.0.54；Alembic 1.20.0；psycopg 3.3.6。
- Supabase CLI 2.117.0。
- 本機 Docker Supabase PostgreSQL `17.6.1.167`、GoTrue `v2.196.0`、PostgREST `v16.2`。
- 專用本機目錄 `.local-db/supabase-test`，DB 端點 `127.0.0.1:54322`，未 link 正式專案。

## 已驗證

- baseline 從新本機 Supabase 重建成功；失敗嘗試的 DDL 交易完整回滾後重跑。
- 35 表、315 欄、122 約束、32 額外索引、2 sequences、49 函式、98 政策、10 自訂 triggers。
- ORM `alembic check` 無待產生的變更。
- 自訂語義比對包含欄位、約束名称與定義、索引、owner／ACL、RLS、函式定義、trigger 狀態與 identity sequence 選項。
- 17 項測試：8 靜態／防誤用，9 本機 Supabase 整合測試。
- Auth 表插入合成使用者後，真實平台上的自訂 Trigger 建立 profile。
- 本人讀寫、他人不可讀、匿名不可讀、跨使用者寫入被拒絕；同一连接切換使用者亦驗證。
- ORM Session 可讀到本人 user_intake；identity 能產生值，check constraint 拒絕非法值。
- 既有 get_my_entitlements／is_pro 行為及非管理員 set_user_subscription 拒絕行為。
- comments_push 與 likes_push 保持 disabled；未新增 Cron，通知環境開關未啟用。
- 重跑 upgrade 不改結構；current／check 使用唯讀路徑。
- 比對器確實能抓出測試交易內刻意改動的 RLS policy；交易結束後回滾。
- 改動版本資產會被 hash 檢查拒絕；remote DSN／host override／stamp／baseline downgrade 被拒絕。

## 過程中修正

- 不對預設 enabled 的 auth.users 自訂 Trigger 另執行 ALTER TABLE ENABLE，避免平台 owner 權限要求。disabled 的 public triggers 仍明確設為 disabled。
- ORM 的 public schema 使用 SQLAlchemy 預設 schema 表示法，避免反射結果與明確 public FK 被誤判成大量 remove/add。
- 推播函式替換正式端點／secret，並預設停用；這是明確的環境差異，沒有修改正式版。

## 尚未驗證／不屬於本次

- 非當日快照的最新正式狀態、正式接管、正式 stamp。
- 完整 Web／iOS、OAuth、郵件註冊端到端流程，以及所有 49 函式的全部分支。Auth 測試為真實平台表上的合成 INSERT，不等同 OAuth 登入測試。
- 正式設定 seed、Edge Functions 部署、排程與對外通知、AI 外部呼叫。
- Supabase 平台 defaults／schema ACL 的完整等價、跨 locale/collation 行為與 production runtime role 設計。
- 新增 CI job 已寫入，尚未推送到 GitHub，沒有宣稱遠端 Actions 已跑過。

詳見 README.md；通過本機驗證不會把 baseline 狀態改成 production-ready。

## 2026-09-24：billing migrations（收斂後）

本次新增 10 張 `billing` 表、私有 schema 權限、RLS、outbox claim RPC、ORM metadata
與 head verifier。已完成 9 項靜態測試、Python compile、offline `upgrade head` SQL 生成
及 whitespace 檢查。offline SQL 已確認包含 billing schema、orders 與 claim RPC。

2026-09-25 已以 Supabase CLI 2.117.0、Docker 與隔離本機 Supabase PostgreSQL 17.6
實際執行 PostgreSQL upgrade、`alembic check`、兩個 verifier 與 migration integration suite。
從空白本機 DB 升至 `mg_0003_billing_workflow` 成功，後續於 2026-09-26 重跑後共 22 項
migration tests 全數通過；其中 `apply_initial_payment_outcome` integration cases 驗證 initial
payment 成功、冪等，以及失敗時不建立 entitlement 的 transaction 邊界。
這不代表正式 Supabase 採用或 PAYUNi sandbox／production 交易已驗收。重現步驟如下：

```bash
export MIGRATION_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
export MIGRATION_TEST_DATABASE_URL="$MIGRATION_DATABASE_URL"
export MINDGYM_LOCAL_TEST=1
.venv-migrations/bin/alembic upgrade head
.venv-migrations/bin/alembic check
.venv-migrations/bin/python scripts/db/verify_baseline.py
.venv-migrations/bin/python scripts/db/verify_billing_head.py
.venv-migrations/bin/python -m unittest discover -s migrations/tests -v
```

`mg_0002_billing_foundation` 建立 billing schema；
`mg_0003_billing_workflow` 以 SECURITY DEFINER RPC 將 pending
subscription、不可變 order snapshot 與 checkout outbox event 寫在同一 DB transaction，
並包含 callback receipt/outbox 與 owner-scoped read RPC。原本尚未套用至共享環境的
`mg_0002`～`mg_0008` 已收斂，禁止對已套用環境使用此收斂方式。
FastAPI 的 billing router／service／repository 已有單元測試；PAYUNI provider 預設停用，
不會建立可對外付款的 checkout。

另以假設定驗證 `backend.app` 可載入且 OpenAPI 包含 billing plans、checkout 與 callback
三條路由；此驗證不帶真實 credential、沒有呼叫 Supabase 或 PAYUNI。

PAYUNi 公開 SDK 所描述的 generic sandbox UPP envelope 已有 AES-256-GCM round-trip、
HashInfo 與 form field 測試；沒有使用真實商店資料、沒有送出 Sandbox 交易。
