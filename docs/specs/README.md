# 功能規格（Feature Specs）

本目錄放置跨前後端、資料庫與外部服務的**可實作規格**。它不是歷史提案或
交接紀錄；每份規格都要明確說明範圍、流程、資料真相來源、API 邊界與驗收條件。

| 規格 | 狀態 | 說明 |
| --- | --- | --- |
| [PAYUNI 定期扣款訂閱](payments/payuni-recurring-subscription.md) | Draft／P1 schema implemented | 保留 Supabase 的過渡期金流垂直切片；尚未串 PAYUNI sandbox |

與此目錄的關係：

- `docs/plans/`：產品構想、時程、已完成或討論中的計畫；不保證是目前工程契約。
- `docs/database/`：Alembic baseline 的納管範圍、重建與驗證說明。
- `docs/specs/`：新功能動工前的工程契約；實作與測試應能逐條回鏈。
