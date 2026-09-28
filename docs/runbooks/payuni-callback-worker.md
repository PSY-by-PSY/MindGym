# PAYUNi callback worker：部署與 dead-letter runbook

> 狀態：設計完成；尚未部署。此 runbook 對應付款規格 P2 的營運驗收。
> 最後更新：2026-09-28

## 目的

FastAPI API service 只接收 PAYUNi callback、驗簽並寫入 outbox；它**不**在 web process
內自行跑 cron。另一個受控 scheduler 每分鐘呼叫一次有限量的 worker：

```text
PAYUNi -> FastAPI callback -> Supabase billing.outbox_events
                                      ^
Scheduler / Cron -> run_billing_callback_worker.py --limit 20
```

分離的原因是 API 可水平擴容或重啟；若每個 API instance 都跑排程，會造成重複執行與不可控
的營運責任。DB lease／dedupe 是第二層保護，不能當成把 cron 塞進 FastAPI lifespan 的理由。

## 建議部署（過渡期）

1. 保持既有 Render FastAPI service 接收 HTTPS callback。
2. 新增**獨立** Render Cron Job（或等效平台 scheduler），使用同一個已審核的 commit/image，
   command 為 `python scripts/run_billing_callback_worker.py --limit 20`，每分鐘最多一個並行執行。
3. Cron Job 使用獨立 service identity 與 secret injection；僅授予本機 Supabase service-role
   所需權限，不能暴露給 React/iOS。
4. P2 initial callback worker 不主動連 PAYUNi，因此沒有固定 egress IP 的前提。P4 一旦呼叫
   `/api/credit`，應改至可固定 egress 的 worker（建議 AWS private subnet → NAT Gateway → Elastic IP），
   並由 PAYUNi allowlist 該 IP；不要把此責任交給 Vercel frontend。

## scheduler 必備設定

由部署平台的 secret manager 注入，不得放入 git、frontend build 或資料表：

- `BILLING_OPERATIONS_ENABLED=1`
- `SUPABASE_URL`
- `BILLING_SERVICE_ROLE_KEY`
- `PAYUNI_TOKEN_CONTRACT_APPROVED=1`
- `PAYUNI_INITIAL_PAYMENT_OUTCOME_SANDBOX_ENABLED=1`
- `BILLING_CALLBACK_MAX_ATTEMPTS`（營運決定，預設 20）

若要驗收約定卡成功 callback，另需 API service 有 `PAYUNI_GENERIC_UPP_SANDBOX_ENABLED=1`、
`PAYUNI_INITIAL_CARD_AGREEMENT_SANDBOX_ENABLED=1` 與 `BILLING_TOKEN_ENCRYPTION_KEY`。所有旗標
在 PAYUNi 核准前必須保持關閉。

## 監控與 dead-letter

- 每分鐘／每 5 分鐘以受控 job 執行 `python scripts/billing_outbox_report.py`，將 pending 最久時間、
  dead-letter 數與 job exit code 送到既有告警平台。
- pending 超過 15 分鐘、任何 dead-letter、scheduler 連續兩次失敗都應告警。
- 人工處理先比對 PAYUNi 後台／交易查詢與 `billing.provider_events`，不得直接改 order 或 entitlement。
- 修正原因後，以新的人工稽核動作重送；不可直接刪除 dead-letter 或重複呼叫扣款。

## CI/CD 邊界

CI 應持續跑 unit tests、Local Supabase migration suite 與 callback simulator tests；**不得**放入
PAYUNi merchant key、service-role key 或真的扣款。CD 則先部署 API，確認 health 後再部署／啟用
scheduler。scheduler 的 production secret、排程頻率與告警整合依甲方的 Render/AWS 帳號設定，
現階段尚不能在 repository 宣稱已啟用。

付款規格中的架構、驗收門檻與進度留在
[PAYUNI 定期扣款規格](../specs/payments/payuni-recurring-subscription.md)；本檔只記載
operator 如何部署、觀測與處理異常。
