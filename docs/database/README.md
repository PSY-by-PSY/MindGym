# 資料庫重建草稿（本機限定）

本次來源是 fork commit `74cb947e8134b73d6a2e8931ff90fe88d105acda` 與 2026-09-23 10:29 台灣時間的 catalog CSV。原始 CSV 含敏感函式內容，不放進 repo；來源 SHA-256、範圍與每個版本資產 hash 見 `migrations/baseline/manifest.json`。

## 本次交付

- 一個 Alembic revision：`mg_0001_baseline`。
- 35 張表、315 欄、122 個表級約束、32 個額外索引、2 個 identity sequences。
- 49 支 public 函式（包含 overload）、98 條 RLS 政策、9 個 public triggers 及 1 個 auth.users 自訂 trigger。
- 應用物件的 owner、ACL、RLS enabled／force 狀態，以及 sequence 選項。
- 35 個可查詢的 SQLAlchemy ORM classes；auth.users 僅為外鍵參照，不由此系統建立。
- 版本資產固定；models 可隨未來 migration 演進，baseline 不 import models。
- 現有 FastAPI 與前端資料存取未改，沒有接金流或改會員權益。

## 明確的邊界與差異

這不是整個 Supabase 的備份，也尚未核准正式接管。

1. `notify_push_on_interaction()` 原有正式網址與秘密不入庫。測試版改讀 `mindgym.push_url`、`mindgym.webhook_secret`，且 `mindgym.notifications_enabled` 未明確為 on 時直接返回。此函式是已記錄的環境差異，不能聲稱與正式函式完全相同。
2. 原快照的 `comments_push`／`likes_push` 已停用，重建亦保持停用。沒有排程會被建立或啟用。
3. Supabase 平台 schema、roles、extension 內建物件、public schema ACL 與平台 default privileges 不由 baseline 修改。平台 ACL 已在 snapshot 中保留供核對；baseline 為自己的物件明確設定 ACL。正式採用需另外確認平台權限前置條件。
4. 無業務／會員資料，也未匯入 app_config 等設定資料。測試使用合成資料，完整 App 能否運作仍需 seed 與外部服務配置。
5. 不建置 Edge Functions、OAuth、SMTP、APNs 或 Cron。Storage 0 buckets 為使用者回報，不把原有的存在檢查 CSV 當空清單。
6. 49 個函式中 48 個 SECURITY DEFINER 的現況保留；沒有混入權限收緊或業務修正。
7. 表欄位均使用此快照的預設 collation；資料庫 locale／collation provider 的跨環境行為需接管前再核對。

## 本機驗證

先安裝 Python 3.11+、Docker 與 Supabase CLI。全部操作在 repo 根目錄執行。不要 link 正式專案。

```bash
python3 -m venv .venv-migrations
.venv-migrations/bin/python -m pip install -r migrations/requirements.txt
.venv-migrations/bin/python -m unittest discover -s migrations/tests -p test_static.py -v
.venv-migrations/bin/alembic upgrade head --sql > /tmp/mindgym-baseline.sql

mkdir -p .local-db/supabase-test
supabase init --workdir .local-db/supabase-test
supabase start --workdir .local-db/supabase-test -x studio,imgproxy,mailpit,realtime,storage-api,edge-runtime,logflare,vector,supavisor,kong,postgrest,postgres-meta
```

若該目錄已有 config，不重跑 init。資料庫需要 PostgreSQL 17+；本機 Supabase 的實際 port 以它的輸出為準。以下憑證是本機測試預設值，不是正式憑證：

```bash
export MIGRATION_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
export MINDGYM_LOCAL_TEST=1
.venv-migrations/bin/alembic upgrade head
.venv-migrations/bin/alembic check
.venv-migrations/bin/python scripts/db/verify_baseline.py
export MIGRATION_TEST_DATABASE_URL="$MIGRATION_DATABASE_URL"
.venv-migrations/bin/python -m unittest discover -s migrations/tests -v
```

只容許 loopback DSN，禁止 host／service 等 query override，無 production override。`stamp` 永久封鎖在這份草稿中；baseline downgrade 拒絕執行。`current`、`check`、`revision` 的 online 路徑使用唯讀交易，不自動建立 schema。

offline SQL 仍有寫入能力，要求預先設定 `mindgym.local_test=baseline-v1` 才能執行；這是防誤用標記，不是不可繞過的權限沙箱。不得貼到正式庫。

`verify_baseline.py` 是額外語義核對，涵蓋約束名稱、RLS、函式、ACL、trigger 狀態等，不只依賴 autogenerate。它對照的是 0001 的固定期望；新增 revision 後須另增對應 head 的期望與驗證，不能直接更改 0001 資產。

## 接下來的工作順序

1. Review 本次 baseline 與明確差異，補必要的測試 seed／平台設定清單。
2. 9/30 或正式接管前更新快照、確認團隊持續開發的差異。
3. 對全新測試專案完成 API／Auth 代表性驗證；不得只憑 ORM check 宣稱全部功能等價。
4. 定義新的 runtime DB role、JWT 上下文與 transaction/session 邊界，再選一個唯讀 API 導入 ORM。本次沒有建立正式 runtime role 或替換 API。
5. 正式接管另行授權；先核對物件與明確基準一致，再設計 version stamp。接管會寫版本紀錄，不能在唯讀盤點中執行。
6. 採用後，table models 變更用 `alembic revision --autogenerate` 產生候選並 review；函式／政策／trigger 使用新的版本專屬 SQL。只有 Alembic 作應用 schema 的部署入口，supabase/*.sql 保留歷史參考。

第一次接管不是追溯當年的 SQL 執行順序，而是固定已核對的現況。不要用 `create_all()`、反射正式 DB、或 import 最新 models 來動態產生舊 migration。
