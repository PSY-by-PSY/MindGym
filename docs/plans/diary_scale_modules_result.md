# 日記模組建構器 × 量表轉譯質性評估 實作結果報告

> 對應計劃書：[`diary_scale_modules_plan.md`](./diary_scale_modules_plan.md)。在分支 `feat/diary-scale-modules`
> 上依 §10 的 Phase 1–5 分段實作並 commit，每個 commit 前 `npm run build`（tsc + vite）、`npm run lint`、
> `python3 -m py_compile backend/app.py` 皆為綠燈。**未執行任何 SQL、未部署、未新增 npm 套件、未建 .env。**

---

## 1. 做了什麼（對照計劃書章節）

### §1 / §3 資料庫 — `supabase/pro_modules_v2.sql`（新檔，疊加在既有 `pro_modules.sql` 上）
- `pro_modules` 新增 `kind`（practice/diary/assessment，DEFAULT practice）＋索引。
- `pro_entries` 新增 `ai_feedback` jsonb（後端 service key 寫入，本人無 UPDATE policy）。
- 新表 `pro_reviews`（整體回饋／週報／內建感恩日記週回顧共用；UNIQUE 防重複生成；本人可讀可標已讀；
  專業夥伴僅可讀已同意分享的週報）。
- 新表 `pro_assessment_results`（雙報告；個案不可直讀，走 RPC）＋ `release_assessment_result` / `get_my_assessment_results` RPC。
- `get_my_modules` / `preview_invite_code` / `redeem_invite_code` 三個既有 RPC `CREATE OR REPLACE` 補上 `kind` 欄位（純新增，行為不變）。
- 全表 ENABLE RLS；新 SECURITY DEFINER function 皆 `SET search_path = public`。

### §2 Part A — 日記模組建構器 ＋ 個案端播放器
- `src/lib/proModules.ts`：`ProModuleKind`、`DiaryModuleContent`/`DiaryFeedbackConfig`、`AssessmentModuleContent` 等型別；
  `ProBlock` 新增 `voice?: boolean`；`DIARY_TEMPLATES`（16 個分類模板 + 1 個空白，每個 2–4 題預設 blocks）；
  `COMMON_SCALE_PRESETS`（4 組，僅帶名稱與骨架提示，不內建受版權保護題目）。
- `src/components/pro/DiaryBuilder.tsx`：四步驟精靈（選類型／記錄格式／AI 回饋／預覽），新建從 step 1 起、編輯既有模組從 step 2 起。
- `src/components/pro/DiaryPlayer.tsx`：週打卡條＋「第 N 天」標頭＋逐題作答＋送出後每日 AI 回饋卡／整體回饋卡／週報卡（或鎖定卡）；
  危機判讀沿用既有 `entrySafetyCheck` → `localCrisisCheck` fallback，零改動。
- `BlockRenderer.tsx` 的 `short_text`/`long_text` 掛既有 `VoiceInput`（`block.voice !== false` 時顯示，對 practice 模組也生效，向下相容不破壞）；
  `BlockEditor.tsx` 補語音開關。
- `src/routes/app.pro-module.$moduleId.tsx` 依 `module.kind` 分流到 `DiaryPlayer`/`AssessmentPlayer`，共用頁首/同意視窗/停止追蹤 chrome。
- `src/routes/therapist.tsx`：「建立新模組」改先選類型（`KindPicker`）；個案追蹤區塊依 kind 顯示連續天數／最近 7 天打卡點／最新週報摘要（diary）
  或測驗次數／結果列表 + `AssessmentReportView`（assessment）。

### §3 後端 — `backend/app.py`
- `POST /api/pro/diary-feedback`：驗證 entry 屬本人＋active enrollment＋kind='diary'＋`feedback.daily.enabled`；
  五風格 system prompt；AI 失敗回固定 fallback（仍寫回 `pro_entries.ai_feedback`）。
- `POST /api/pro/diary-review`：`review_type` overall/weekly，後端自行重算門檻與期間（不信前端）；未達門檻回 409；
  撞 UNIQUE 回既有列；`_pg_claude_json` 擴充 `model` 參數以支援 Sonnet。
- `POST /api/reviews/gratitude-weekly`：驗證該週 `gratitude_entries`（`practice_type='gratitude'`）≥ 3 筆。
- `POST /api/pro/scale-transform`：量表全文 → dimensions + questions（限 practitioner）。
- `POST /api/pro/assessment-report`：危機兩層判讀（複用 `CRISIS_KEYWORDS` 與 `_insert_crisis_alert`，`entry_id=None`）＋
  單次 AI 呼叫同時產出雙報告；依 `review_before_send` 決定 `pending_release`/`released`。
- `_PRO_REVIEW_SYSTEM` 依 kind 附加審核指示（diary 檢查回饋設定是否誘發依賴；assessment 額外輸出
  `copyright_note`/`clinical_risk_note`）；`pro_submit_module` 取模組時多 select `kind` 並傳入。

### §4 Part B — 定期回顧
- `src/lib/reviews.ts`：`checkAndGenerateReviews`（lazy on-open，每人每天節流一次，用 `getMyModules()` 取 diary
  enrollment 的 feedback 設定，前端算門檻決定要不要呼叫，後端仍會再驗證一次）、`fetchMyReviews`、`markReviewRead`。
- `app.home.tsx` / `app.profile.tsx` mount 時呼叫 `checkAndGenerateReviews`（不 await、不阻塞畫面）。
- `src/components/ReviewsSection.tsx`：≥2 筆才顯現；橫向卡片列 + 全屏 bottom-sheet（summary/trend polyline/themes/quote/challenge）。
- `src/lib/notifications.ts`：`fetchNotifications` 第三來源 `pro_reviews`（`read_at IS NULL`）；`app.tsx` 的 `NotificationBell`
  點擊 review 類型導向 `/app/profile`。
- `src/lib/localNotifications.ts`：新增 `scheduleDiaryReminder`/`cancelDiaryReminder`（id `2000+hash(moduleId)%1000`）與
  `scheduleWeeklyReviewReminder`（固定 id `1002`，每週日 21:00），沿用既有 1001 打卡提醒的重排/取消模式。
- `app.gratitude.tsx`：INTRO 加本週打卡條（`WeeklyCheckinStrip`）；SUMMARY 的 AI 回饋改分層卡片（mint「AI 即時回饋」／
  peach「共鳴故事」）＋底部「回顧預告」鎖定卡（`ReviewPreviewCard`）。

### §5 Part C — 量表上傳與轉化
- `src/components/pro/AssessmentBuilder.tsx`：上傳量表（textarea/檔案上傳/常用量表 chips）→ AI 轉譯 → 編修（維度列表 +
  原題/轉譯題對照卡）→ 設定（intro/`review_before_send`/知情同意唯讀展示）→ 預覽；送審沿用既有 `/api/pro/submit-module`。
- `src/components/pro/AssessmentPlayer.tsx`：intro + 固定知情同意卡 → 一題一畫面（維度色點/hints 摺疊/VoiceInput/進度條）→
  送出等待畫面 → 結果（`released` 顯示個案版；`pending_release` 顯示等待卡＋可重新測驗）。
- `src/components/pro/AssessmentReportView.tsx`：量化側寫（分數 bar/信心度 badge/原文證據）＋需要人工確認區（標注個案版不顯示）＋
  反思方向；`review_before_send` 時顯示個案版預覽＋「確認並發送」→ `release_assessment_result` RPC。

### §7 管理員端
- `src/routes/admin.tsx`：kind badge（練習=muted／日記=mint／測驗=peach）；`ModuleReviewTab` 對 diary 顯示回饋設定摘要表，
  對 assessment 顯示維度列表＋原題/轉譯題對照全文；`AiReviewPanel` 補 `copyright_note`/`clinical_risk_note` 高亮；
  `PublishedModulesTab` 加篩選 chips（全部/練習/日記/測驗）；`CrisisOverviewTab` 新增「情境」欄
  （`entry_id` 為 null → 「測驗作答」，否則「一般練習」）。

### §8 i18n / analytics
- 新增 `src/lib/i18n/dict/diary-assessment.ts`，涵蓋所有新 UI 字串的 zh-CN/en；用腳本比對「所有 `t('...')` 呼叫」與
  「字典既有 key」確認零遺漏（含間接的 `t(variable.label)` 資料驅動標籤，逐一人工核對 DIARY_TEMPLATES/KIND_META/
  DAILY_STYLES/OVERALL_FOCUS_OPTIONS/CONFIDENCE_META 等來源）。
- `src/lib/analytics.ts` 補齊 §8 列出的全部事件名稱並在對應位置呼叫。

---

## 2. 與計劃書的差異／取捨（誠實記錄）

1. **Phase 2/3 合併執行**：計劃書把「日記播放器」（Phase 2）與「整體/週報生成端點＋`reviews.ts`」（Phase 3）分開，
   但 `DiaryPlayer` 完成頁需要立即顯示整體/週報卡，兩者強耦合，因此在同一輪把 `/api/pro/diary-review`、
   `/api/reviews/gratitude-weekly`、`reviews.ts` 一併做完，才把 Phase 3 剩下的 `ReviewsSection`/通知/感恩日記 UI 精修
   歸類為獨立一輪。行為與計劃書規格一致，只是實作順序更貼近真實依賴關係。
2. **PublishedModulesTab 篩選預設**：計劃書只說「篩選 chips」，未指定預設值；實作預設 `全部`。
3. **CrisisOverviewTab 情境判斷**：計劃書描述用「`module_id` 對應 kind='assessment'」判斷，實作簡化為
   「`entry_id IS NULL` → 測驗作答」——因為目前系統中只有 assessment 觸發的危機警示會缺 `entry_id`
   （diary/practice 一律先寫 `pro_entries` 才觸發判讀），效果等價、少一次 join。
4. **常用量表快速帶入的 label/hint 不走 `t()`**：`COMMON_SCALE_PRESETS` 的量表名稱（如 `PERMA-Profiler`）與骨架提示
   會被直接寫入 `scale_name`/textarea（資料值，非純 UI chrome），比照既有 `ANON_NAMES` 慣例不翻譯。
5. **`Co-Authored-By` 署名**：依執行環境指示署名 `Claude Sonnet 5`。
6. **未做/延後**（皆已在計劃書 §11 明確排除，非本次遺漏）：照片上傳題型、量表深度對話版作答模式、
   個案版報告發送前逐字編輯、名人比對區塊、PDF/圖片量表 OCR、報告生成失敗自動重試佇列、App 完全關閉時的遠端推播。

## 3. `TODO(diary-scale-modules)` 清單
- **無。** 本次未於程式碼留任何相關 TODO 標記；計劃書範圍內項目均已實作。

## 4. 驗證狀態（誠實記錄）
- 每個 commit 前 `npm run build`（tsc + vite）、`npm run lint`（0 error，僅既有 2 個 `react-refresh` warning）、
  `python3 -m py_compile backend/app.py` 皆綠燈。
- 語言切換（zh-TW/zh-CN/en）在瀏覽器內手動驗證無 console error；`npm run dev` 乾淨啟動、登入頁渲染正常。
- **未能於本次會話驗證**（需使用者環境，沒有登入憑證/尚未套用新 schema，無法在此沙盒內完成）：
  - 實際跑 `supabase/pro_modules_v2.sql`。
  - 登入後端到端流程：建立日記模組 → 送審 → 核准 → 兌換 → 逐日填寫 → 觸發整體/週報 → 個人頁回顧集；
    量表上傳 → AI 轉譯 → 編修 → 送審 → 個案作答 → 雙報告；危機判讀觸發告警。
  - 後端連 Supabase/Anthropic 的實際 AI 呼叫（`diary-feedback`/`diary-review`/`scale-transform`/`assessment-report`）。
  - 請依下方第 5 節清單於正式環境完成冒煙測試。

## 5. 隔天早上的啟用清單

1. 在 **Supabase Dashboard > SQL Editor** 依序執行（若尚未執行過 `pro_modules.sql` 需先執行該檔）：
   ```sql
   -- 貼上 supabase/pro_modules_v2.sql 全文並執行
   ```
2. 後端環境變數沿用既有 `SUPABASE_KEY`（service key）與 `ANTHROPIC_API_KEY`，無需新增。
3. Review 分支後 merge `feat/diary-scale-modules` → `main`（自動部署前後端）。
4. 冒煙測試（日記）：`/therapist` 建立新模組 → 選「日記模組」→ 選「感恩日記」模板 → 記錄格式微調 → AI 回饋維持預設
   （整體門檻 3、週報開）→ 預覽 → 送審 → `/admin` 核准 → 產生邀請碼 → 第二帳號兌換、同意、連續填寫 3 次
   → 確認出現整體回饋卡；填滿 7 個不同日期後確認週報卡解鎖 → `/therapist` 個案追蹤確認看到打卡點與週報摘要
   （需該模組 `sync_to_practitioner` 開啟）→ 個人頁面確認「回顧集」在累積 ≥2 筆回顧後出現。
5. 冒煙測試（量表）：`/therapist` 建立新模組 → 選「質性測驗」→ 貼上一份含兩個維度、每維度 3 題的量表全文 → AI 轉譯
   → 編修檢查原題/轉譯題對照 → 設定 `review_before_send=true` → 送審 → `/admin` 核准（檢查 copyright_note/
   clinical_risk_note 顯示）→ 產生邀請碼 → 個案兌換、作答全部題目 → 送出 → 確認顯示「你的專業夥伴確認後就會把結果
   傳給你」等待卡 → `/therapist` 個案追蹤看到量化側寫報告 → 按「確認並發送個案版」→ 個案端重新整理後看到無分數的
   優勢轉譯報告。
6. 冒煙測試（危機判讀）：日記或測驗作答內容包含「最近常常想消失」等關鍵字 → 確認個案端跳出求助資源、
   `/therapist` 出現紅色警示、`/admin` 危機警示總覽的「情境」欄正確標示來源。
7. 若原生 App：確認日記模組「提醒我」按鈕與每週日 21:00 的回顧提醒（id 1002）皆能正常排程（需 iOS 實機或模擬器）。
