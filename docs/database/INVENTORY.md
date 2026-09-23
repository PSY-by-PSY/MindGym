# 基準來源與管理清單

Code commit：`74cb947e8134b73d6a2e8931ff90fe88d105acda`。
Catalog 擷取時間：`2026-09-23T02:29:55.750175+00:00`。
原始 CSV SHA-256：`bc0cf82c6bdd2af1bf319fd004ef02bebe24d87ed66e86e356be185841a3f040`。

原始檔由使用者匯出，未提交 repo；manifest 和版本資產固定。沒有在本次存取正式 Supabase。

## Tables

| 表 | 欄位 | 約束 | 額外索引 |
|---|---:|---:|---:|
| ai_usage_log | 12 | 1 | 2 |
| app_config | 5 | 2 | 0 |
| blocks | 5 | 4 | 1 |
| bot_like_queue | 5 | 2 | 0 |
| comment_likes | 4 | 4 | 0 |
| comments | 10 | 4 | 0 |
| crisis_alerts | 10 | 7 | 1 |
| daily_schedule | 5 | 3 | 1 |
| device_tokens | 4 | 2 | 1 |
| first_feedback | 6 | 2 | 0 |
| focus_logs | 18 | 2 | 2 |
| gratitude_entries | 23 | 2 | 2 |
| immersion_map | 14 | 3 | 0 |
| invite_codes | 6 | 3 | 1 |
| likes | 5 | 4 | 0 |
| moderation_rules | 7 | 4 | 0 |
| morning_logs | 7 | 2 | 1 |
| paywall_config | 6 | 3 | 0 |
| paywall_intents | 6 | 2 | 2 |
| perma_scores | 9 | 7 | 0 |
| practitioner_applications | 11 | 4 | 1 |
| pricing_config | 8 | 2 | 0 |
| pro_assessment_results | 9 | 4 | 1 |
| pro_enrollments | 9 | 6 | 2 |
| pro_entries | 7 | 3 | 1 |
| pro_module_review_log | 8 | 4 | 1 |
| pro_modules | 15 | 4 | 3 |
| pro_reviews | 10 | 5 | 1 |
| profiles | 13 | 2 | 0 |
| reports | 15 | 9 | 6 |
| subscriptions | 10 | 5 | 1 |
| usage_snapshots | 10 | 2 | 1 |
| user_intake | 14 | 2 | 0 |
| user_roles | 4 | 4 | 0 |
| user_suspensions | 5 | 3 | 0 |

## Functions

所有 owner 為 postgres；48 支為 SECURITY DEFINER。精確 owner/ACL/signature/definition 見 snapshot.json。

- `admin_list_paywall_intents(p_limit integer)`
- `admin_pending_intent_count()`
- `admin_pending_report_count()`
- `admin_resolve_reports(p_target_type text, p_target_id uuid, p_action text, p_note text)`
- `admin_review_queue(p_status text, p_limit integer)`
- `admin_search_subscriptions(p_query text)`
- `admin_suspend_user(p_user_id uuid, p_days integer, p_reason text)`
- `admin_unsuspend_user(p_user_id uuid)`
- `ai_usage_summary()`
- `approve_module(p_module_id uuid, p_note text)`
- `approve_practitioner_application(p_app_id uuid)`
- `autoflag_content()`
- `autohide_reported_content()`
- `community_shared_total()`
- `community_unlocked(uid uuid)`
- `enforce_content_moderation()`
- `founding_member_user_ids()`
- `founding_seats_remaining()`
- `get_community_preview()`
- `get_db_size_bytes()`
- `get_my_assessment_results(p_module_id uuid)`
- `get_my_entitlements()`
- `get_my_modules()`
- `handle_new_user()`
- `increment_perma_xp(p_user_id uuid, p_delta_p integer, p_delta_e integer, p_delta_r integer, p_delta_m integer, p_delta_a integer)`
- `is_admin(uid uuid)`
- `is_practitioner(uid uuid)`
- `is_pro(uid uuid)`
- `is_suspended(uid uuid)`
- `moderation_normalize(txt text)`
- `moderation_verdict(txt text)`
- `notify_push_on_interaction()` — 環境化、預設不通知
- `preview_invite_code(p_code text)`
- `process_bot_likes()`
- `redeem_invite_code(p_code text, p_share_perma boolean)`
- `regenerate_invite_code(p_module_id uuid)`
- `reject_module(p_module_id uuid, p_note text)`
- `reject_practitioner_application(p_app_id uuid, p_note text)`
- `release_assessment_result(p_result_id uuid)`
- `schedule_bot_likes(p_entry_id uuid)`
- `set_user_subscription(p_user_id uuid, p_tier text, p_status text, p_is_founding boolean, p_price_plan_code text, p_expires_at timestamp with time zone, p_note text)`
- `takedown_module(p_module_id uuid, p_note text)`
- `update_app_config(p_platform text, p_min_version text, p_update_url text, p_update_message text)`
- `update_module_draft(p_module_id uuid, p_title text, p_description text, p_est_minutes integer, p_draft_content jsonb)`
- `update_paywall_config(p_founding_quota_total integer, p_founding_enabled boolean, p_variant text)`
- `update_paywall_config(p_founding_quota_total integer, p_founding_enabled boolean, p_variant text, p_free_view_limit integer)`
- `update_pricing_config(p_plan_code text, p_amount_cents integer, p_founding_amount_cents integer, p_is_active boolean)`
- `weekly_analysis_period_start(uid uuid)`
- `weekly_analysis_used(uid uuid)`

## Triggers

| Schema／表 | Trigger | 快照狀態 |
|---|---|---|
| auth.users | on_auth_user_created | O |
| public.comments | comments_push | D |
| public.comments | trg_autoflag_comments | O |
| public.comments | trg_moderate_comments | O |
| public.gratitude_entries | trg_autoflag_entries | O |
| public.gratitude_entries | trg_moderate_entries | O |
| public.likes | likes_push | D |
| public.reports | trg_autohide_reported | O |
| public.subscriptions | subscriptions_founding_insert_push | O |
| public.subscriptions | subscriptions_founding_update_push | O |

## 不在 Alembic baseline 安裝範圍

- auth/storage/realtime 等平台物件與平台 roles。
- public schema ACL 和 default privileges：只記錄，正式採用前逐項核對；不是整批套用。
- process-bot-likes、woop-launch-notify-20260802 排程：記錄現況，不複製指令內的 secret、不建立測試排程。
- Auth/OAuth/SMTP/Edge Functions/APNs 與環境秘密。
- 營運設定資料与會員紀錄。

## Repo 與快照差異

- 本次 fork 沒有既有 Alembic 草稿；本次是新建 local-only baseline。
- user_intake 在 9/23 快照存在，初始 fork 的 src/supabase 搜尋未出現，仍納入現況基準。
- supabase/*.sql 不是可證明的執行歷史，不依其檔名重播。
- 先前唯讀盤點記錄的 Edge model 差異未在本次變更。
- 9/30 收斂快照後再決定正式接管；不把歷史快照當作永遠最新。
