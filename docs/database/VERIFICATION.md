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
