# 計畫書：日記模組建構器 × 量表轉譯質性評估 — 融入專業夥伴工作台

> 狀態：已定稿，待執行。本文件為「可直接交付其他模型執行」的完整規格。
> 執行者請按 §10 的階段順序實作；每個階段結尾有驗收清單。
> 兩份 Prototype 出處：`日記模組建構器 · 大鵬 AI 賦能平台.html`、`量表轉譯 · 質性評估 · 大鵬 AI 賦能平台_副本.html`（心理科學家製作，僅取「功能與資訊架構」，視覺一律改用本站 warm cream/brown 設計系統）。

---

## 0. 現況盤點（執行前必讀）

| 既有資產 | 位置 | 與本計畫的關係 |
|---|---|---|
| 專業模組區 schema（雙槽 draft/published、審核 RPC、邀請碼、enrollment、pro_entries、crisis_alerts） | `supabase/pro_modules.sql` | 全部沿用，僅「純新增」擴充（§3） |
| 個案端共用邏輯（型別、RPC 包裝、危機 fallback、模板） | `src/lib/proModules.ts` | 擴充型別與模板 |
| 專業夥伴工作台（申請閘門＋主控台＋模組編輯器） | `src/routes/therapist.tsx` | 新增「模組類型」選擇與兩種新編輯器 |
| 積木編輯/渲染 | `src/components/pro/BlockEditor.tsx`、`BlockRenderer.tsx` | 沿用；BlockRenderer 未知 type 當 instruction 顯示（前向相容鐵則，不可破壞） |
| 個案端播放器 | `src/routes/app.pro-module.$moduleId.tsx` | 依 `kind` 分流到日記/測驗播放器 |
| 管理員審核台（四 tab） | `src/routes/admin.tsx` | 審核卡片支援新 kind 的預覽 |
| 後端 AI（送審審核、危機判讀、metering） | `backend/app.py`（§/api/pro/*、`meter_claude`） | 新增 5 個端點，沿用 metering 與危機兩層判讀模式 |
| 感恩日記 | `src/routes/app.gratitude.tsx`（INTRO/WRITING/SUMMARY/CELEBRATE 四階段） | UI 精修＋每週回顧資料來源 |
| PERMA 測驗 | `src/components/pretest/*`（IntroScreen/QuestionnaireScreen/ResultsScreen、`types.ts`）、後端 `/api/report` | 測驗播放器的互動範本（開放題＋語音輸入＋維度評分報告） |
| 站內通知（likes/comments 推導＋localStorage 已讀） | `src/lib/notifications.ts` | 擴充納入「回顧報告」通知 |
| 原生本地推播（每晚 21:30 打卡提醒等） | `src/lib/localNotifications.ts` | 新增回顧提醒排程 |
| i18n | `src/lib/i18n/*`，`t('繁中原文')` 為 key | 所有新 UI 字串走 `t()`，並補 zh-CN/en 字典 |
| 個人頁面 | `src/routes/app.profile.tsx` | 新增「回顧集」小模組 |

**設計原則（不可違反）：**
1. 安全模型不變：anon key + RLS；敏感/原子操作走 SECURITY DEFINER RPC；`pro_modules` 仍然沒有直接 UPDATE policy；所有新 SECURITY DEFINER function 一律 `SET search_path = public`。
2. 個案永遠只透過 RPC 讀 `published_content`，不直讀 `pro_modules`。
3. SQL 全部 idempotent，寫進**新檔** `supabase/pro_modules_v2.sql`，需在 Supabase Dashboard 手動執行（本專案慣例）。
4. AI 失敗不阻擋主流程：回 fallback 文案或標記 `error`，人工兜底。
5. 視覺使用現有 token（`bg-page`、`bg-card`、`border-border`、`text-muted-foreground`、`shadow-soft`、`rounded-[22px]`、tile 色 `bg-tile-mint/peach/pink` 等），**不得**引入 Prototype 的綠色系 CSS 變數。

---

## 1. 總體架構決策

`pro_modules` 新增欄位 `kind`，一張表承載三種模組：

| kind | 名稱 | 內容 schema | 個案端行為 |
|---|---|---|---|
| `practice`（既有，DEFAULT） | 練習模組 | `{v:1, intro, blocks, outro}` | 現行播放器，不變 |
| `diary` | 日記模組 | §2.1 的 v2 schema | 每日重複填寫＋三層 AI 回饋 |
| `assessment` | 質性測驗模組 | §5.1 schema | 一次性測驗＋雙版本報告 |

審核、邀請碼、enrollment、危機判讀、停止追蹤等機制三種 kind 完全共用，零改動。

---

## 2. Part A — 日記模組建構器（專業夥伴端）

### 2.1 內容 Schema（`draft_content` / `published_content`，kind='diary'）

```jsonc
{
  "v": 2,
  "kind": "diary",
  "template_key": "gratitude",        // 來源模板，僅供顯示
  "intro": "string",                   // 開場引導語
  "blocks": [ /* 沿用 ProBlock；即每日要填的欄位 */ ],
  "outro": "string",
  "reminder": { "enabled": true, "time": "21:00" },   // HH:mm，個案端可自行覆寫
  "feedback": {
    "daily":   { "enabled": true, "style": "warm" },  // warm|reflective|brief|zen|celebrate
    "overall": { "enabled": true, "threshold": 3,     // 3|5|10|自訂正整數
                 "focus": ["themes","emotion_arc"] }, // themes|emotion_arc|depth_growth|unsaid
    "weekly":  { "enabled": true,
                 "sections": { "trend": true, "quotes": true, "challenge": false },
                 "sync_to_practitioner": true }
  }
  // 安全護欄（情緒風險偵測）固定啟用，不做開關 —— 沿用既有 entry-safety-check，
  // Prototype 中的 toggle 在正式版改為唯讀說明文字。
}
```

`ProBlock` 型別**不擴充新題型**（照片上傳、語音記錄兩個 chip 不做為獨立題型）：
- 語音：`short_text` / `long_text` 的作答框直接掛既有 `VoiceInput`（`src/components/pretest/VoiceInput.tsx`，後端 `/api/transcribe` 已存在）。ProBlock 新增選填欄位 `voice?: boolean`（預設 true），編輯器提供開關。
- 照片：**本期不做**（需開 Supabase Storage bucket 與審核策略），在計畫尾註記為後續項目。

### 2.2 `src/lib/proModules.ts` 擴充

```ts
export type ProModuleKind = 'practice' | 'diary' | 'assessment'
export type DiaryFeedbackStyle = 'warm' | 'reflective' | 'brief' | 'zen' | 'celebrate'
export type OverallFocus = 'themes' | 'emotion_arc' | 'depth_growth' | 'unsaid'

export interface DiaryFeedbackConfig { /* 對應 §2.1 feedback */ }
export interface DiaryModuleContent extends ProModuleContent {
  kind: 'diary'
  template_key?: string
  reminder?: { enabled: boolean; time: string }
  feedback: DiaryFeedbackConfig
}
```

- `ProModuleRow` / `ProModuleInfo` / `ProModulePreview` 各加 `kind: ProModuleKind`（RPC 回傳一併補上，見 §3）。
- `MODULE_TEMPLATES` 拆成 `MODULE_TEMPLATES`（practice，維持）與新增 `DIARY_TEMPLATES: DiaryTemplate[]`。日記模板共 **16 + 1 組**，完整移植 Prototype 第一步的四分類：
  - 情感與關係：🙏 感恩日記、💕 戀愛日記、👨‍👩‍👧 親子日記、🕊️ 告別日記
  - 情緒與覺察：🌤️ 情緒天氣日記、🧘 正念日記、💭 夢境日記、🌊 焦慮追蹤日記
  - 成長與行動：🏆 成就日記、🎯 目標行動日記、🌱 自我慈悲日記、💡 創意靈感日記
  - 身體與生活：😴 睡眠日記、🍽️ 飲食覺察日記、💰 金錢情緒日記、📱 數位使用日記
  - ＋「空白日記」
  每個模板 `build()` 產出 2–4 個預設 blocks（執行者請為每個模板撰寫符合該主題的預設題目：至少一題 long_text、視主題加 scale 或 choice；感恩日記模板照 Prototype：兩題文字＋1–7 感恩程度量表＋好事分類單選 人際/成就/小確幸/自然）＋預設 feedback 設定（daily warm、overall threshold 3、weekly trend+quotes 開）。

### 2.3 建構器 UI（`src/routes/therapist.tsx` 內）

主控台「建立新模組」改為先選類型（三張卡：練習模組／日記模組／質性測驗）。選「日記模組」進入四步驟精靈（新元件 `src/components/pro/DiaryBuilder.tsx`，被 therapist.tsx 引用；步驟導覽視覺沿用站內 tab 樣式，不用 Prototype 的 steps 樣式）：

1. **選日記類型**：分類標題＋2 欄卡片格（手機 1 欄），卡片選中態 `border-primary bg-tile-mint`。
2. **記錄格式**：模組名稱 input＋既有 `BlockEditor`（新增 voice 開關欄位）＋提醒時間 chips（`早上 8:00`／`晚上 21:00`／自訂 `<input type="time">`／不提醒）。
3. **AI 回饋**：
   - 三層說明卡（每日即時／整體回饋·滿 N 則解鎖／一週成長報告·滿 7 天解鎖），tile 色分別 mint/blue(自訂 `#EDF1F7` 改用既有近似 token，若無則加 `bg-[#EAF1F5]`)/peach。
   - 每日風格 5 個單選 chips；整體回饋 toggle＋門檻 chips（3/5/10/自訂）＋聚焦多選 chips；一週報告三個 section toggle＋「同步給專業夥伴」toggle；安全護欄顯示為固定開啟的說明列（shield icon＋「情緒風險偵測常駐啟用」）。
4. **預覽**：手機殼預覽（仿 Prototype 第四步資訊架構：週打卡條、欄位、AI 即時回饋卡、整體回饋卡、鎖定中的週報卡），用站內色。按「儲存草稿」→ `update_module_draft` RPC（不需改，draft_content 就是 jsonb）；「送審」→ 既有 `/api/pro/submit-module`。

編輯既有 diary 模組時直接進同一精靈（從 step 2 起）。

### 2.4 個案端日記播放器

`src/routes/app.pro-module.$moduleId.tsx` 讀到 `kind==='diary'` 時改渲染新元件 `src/components/pro/DiaryPlayer.tsx`：

- 頂部：模組名＋「第 N 天 · 由 {practitioner_name} 為你設計」＋**週打卡條**（本週一到日 7 格，已填日期填色；資料來源：`pro_entries` 本人該模組的 `entry_date`）。
- 中段：`BlockRenderer` 逐題作答（文字題掛 VoiceInput）。同一天允許多筆（沿用 pro_entries 無 unique 限制），但打卡條以「當日有任一筆」計。
- 送出流程：
  1. INSERT `pro_entries`（既有 RLS）。
  2. 危機判讀：沿用既有 `entrySafetyCheck` → fallback `localCrisisCheck`（**零改動**）。
  3. 呼叫新端點 `POST /api/pro/diary-feedback`（§6.1）取得每日即時回饋 → 顯示在「AI 即時回饋」卡（mint tile）並由後端寫回 entry。
  4. 前端判斷 overall/weekly 是否達門檻（§4.2 觸發規則）→ 達標則呼叫 `/api/pro/diary-review` 生成並顯示。
- 完成頁下方依序顯示：AI 即時回饋卡 → 最新整體回饋卡（若有）→ 週報卡或「還差 N 天解鎖」鎖定卡（`opacity-55`＋鎖 icon）。
- 提醒時間：完成頁提供「提醒我」列，呼叫 `localNotifications` 排程（§4.4）；純網頁隱藏。

### 2.5 專業夥伴端「個案追蹤」強化

therapist.tsx 既有個案追蹤區塊：diary 模組的個案列多顯示「連續天數、最近 7 天打卡點、最新一份週報摘要（若 `sync_to_practitioner` 且個案 enrollment active）」。資料來源 `pro_entries` ＋ `pro_reviews`（§3）。

---

## 3. 資料庫變更（`supabase/pro_modules_v2.sql`，全 idempotent）

```sql
-- 3.1 pro_modules 加 kind
ALTER TABLE pro_modules ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'practice'
  CHECK (kind IN ('practice','diary','assessment'));

-- 3.2 pro_entries 加每日 AI 回饋槽（由後端 service key 寫入；不開放本人 UPDATE）
ALTER TABLE pro_entries ADD COLUMN IF NOT EXISTS ai_feedback jsonb;

-- 3.3 回顧報告表（整體回饋 / 週報 / 內建感恩日記週回顧 共用）
CREATE TABLE IF NOT EXISTS pro_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  module_id    uuid REFERENCES pro_modules(id) ON DELETE CASCADE,  -- NULL = 內建感恩日記
  review_type  text NOT NULL CHECK (review_type IN ('overall','weekly','gratitude_weekly')),
  period_start date NOT NULL,
  period_end   date NOT NULL,
  entry_count  int  NOT NULL DEFAULT 0,
  content      jsonb NOT NULL,     -- §4.3 報告 schema
  created_at   timestamptz DEFAULT now(),
  read_at      timestamptz,
  UNIQUE (user_id, module_id, review_type, period_start)  -- 防重複生成
);
CREATE INDEX IF NOT EXISTS pro_reviews_user_idx ON pro_reviews (user_id, created_at DESC);
ALTER TABLE pro_reviews ENABLE ROW LEVEL SECURITY;
-- 本人可讀、可標已讀（UPDATE 僅允許 read_at）；INSERT 只由後端 service key（無 policy）。
CREATE POLICY "pro_reviews: 本人可讀" ON pro_reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pro_reviews: 本人可標已讀" ON pro_reviews FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- 專業夥伴可讀：僅 weekly、且該模組 feedback.weekly.sync_to_practitioner=true、且 enrollment active
CREATE POLICY "pro_reviews: 專業夥伴可讀已同意週報" ON pro_reviews FOR SELECT USING (
  review_type = 'weekly' AND EXISTS (
    SELECT 1 FROM pro_enrollments e JOIN pro_modules m ON m.id = e.module_id
    WHERE e.module_id = pro_reviews.module_id AND e.user_id = pro_reviews.user_id
      AND e.practitioner_id = auth.uid() AND e.status = 'active'
      AND COALESCE((m.published_content->'feedback'->'weekly'->>'sync_to_practitioner')::boolean, false)
  )
);

-- 3.4 質性測驗結果表
CREATE TABLE IF NOT EXISTS pro_assessment_results (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id           uuid REFERENCES pro_modules(id) ON DELETE CASCADE NOT NULL,
  user_id             uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  answers             jsonb NOT NULL,          -- { question_id: string }
  practitioner_report jsonb,                   -- §5.4；僅專業夥伴/後端可見
  client_report       jsonb,                   -- §5.5；發布後個案可見
  status              text NOT NULL DEFAULT 'released'
    CHECK (status IN ('pending_release','released')),
  created_at          timestamptz DEFAULT now(),
  released_at         timestamptz
);
CREATE INDEX IF NOT EXISTS pro_assessment_results_module_user_idx
  ON pro_assessment_results (module_id, user_id, created_at DESC);
ALTER TABLE pro_assessment_results ENABLE ROW LEVEL SECURITY;
-- 個案不直讀此表（避免看到 practitioner_report），走 RPC get_my_assessment_results。
CREATE POLICY "pro_assessment_results: 專業夥伴可讀已同意個案的" ON pro_assessment_results
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM pro_enrollments e
    WHERE e.module_id = pro_assessment_results.module_id
      AND e.user_id = pro_assessment_results.user_id
      AND e.practitioner_id = auth.uid() AND e.status = 'active'));
-- INSERT/報告寫入由後端 service key（無 policy）。
-- 專業夥伴發布個案版：RPC release_assessment_result(p_result_id)（SECURITY DEFINER，
-- 驗證 auth.uid() 是該 enrollment 的 practitioner → status='released', released_at=now()）。

-- 3.5 get_my_modules() / preview_invite_code / redeem_invite_code：
--   CREATE OR REPLACE，回傳 json 多帶 'kind', m.kind（其餘不變，直接整段重貼三個函式）。

-- 3.6 get_my_assessment_results(p_module_id uuid) RETURNS json：
--   SECURITY DEFINER，回本人的 { id, created_at, status, client_report(僅 status='released' 時), … }。

-- 3.7 mark_review_read(p_review_id uuid)：可用直接 UPDATE（policy 已允許），不需 RPC。
```

---

## 4. Part B — 定期回顧功能（User 端＋個人頁面）

### 4.1 範圍

兩條線共用 `pro_reviews` 與同一套通知/顯示元件：
- **內建感恩日記**（全體使用者）：`gratitude_weekly` 週回顧。
- **專業日記模組**（有 enrollment 的使用者）：`overall`（滿 N 則）＋ `weekly`（滿 7 個不同 entry_date）。

### 4.2 生成觸發（lazy on-open，不用 pg_cron 跑 AI）

新檔 `src/lib/reviews.ts`：

- `checkAndGenerateReviews(userId)`：App 進入 `/app/home` 或 `/app/profile` 時呼叫（每 session 最多一次，模組層 localStorage 節流 `reviews_checked_YYYY-MM-DD`）。
  1. `gratitude_weekly`：取「上一個完整週」（週一–週日，用 `isoLocalDate`）；若該週 `gratitude_entries` ≥ 3 筆且 `pro_reviews` 無該 `period_start` 紀錄 → 呼叫 `POST /api/reviews/gratitude-weekly`。
  2. 每個 active diary enrollment：
     - overall：該模組累計 entries 數每次跨過 threshold 的整數倍（N、2N、3N…）且無對應 review → `POST /api/pro/diary-review {type:'overall'}`（`period_start` 用第一筆、`period_end` 用最新一筆 entry_date；UNIQUE 以 period_start=第 kN 筆的日期防重）。
     - weekly：不同 `entry_date` 達 7 的倍數 → `POST /api/pro/diary-review {type:'weekly'}`。
  3. 後端負責再驗證與寫入（防前端誤判/重放；撞 UNIQUE 即回既有那筆）。
- `fetchMyReviews(userId)`、`markReviewRead(id)`。

### 4.3 報告內容 schema（`pro_reviews.content`）

```jsonc
{
  "v": 1,
  "title": "第 2 週成長報告",
  "summary": "string",                      // 主體觀察，150–250 字
  "trend": [ { "date": "2026-07-01", "score": 5 } ],  // weekly 且模組含 scale 題才有
  "themes": [ "string" ],                   // 重複主題（overall/weekly）
  "quote": { "text": "string", "source_date": "2026-07-03" },  // 金句回顧（可缺）
  "challenge": "string"                     // 下週小挑戰（依設定，可缺）
}
```
`gratitude_weekly` 同 schema（trend 用感恩篇數/日）。AI 失敗 → 後端回 fallback content（固定溫暖文案＋純統計 trend），一樣入庫，不留空。

### 4.4 通知（「系統定期彈出通知，告知已產生回顧報告」）

1. **站內通知**：`src/lib/notifications.ts` 的 `fetchNotifications` 增加第三來源——本人 `pro_reviews` 中 `read_at IS NULL` 或 `created_at > lastSeen` 的紀錄，`type: 'review'`，title 例：`t('你的週回顧報告出爐了')`；點擊導向 §4.5 的回顧頁。未讀紅點沿用既有 lastSeen 機制。
2. **原生本地推播**：`src/lib/localNotifications.ts` 新增：
   - 生成成功當下（App 開著）：立即 `LocalNotifications.schedule` 一則「你的回顧報告出爐了 ✨」。
   - 排程型：固定 id `1002`，每週日 21:00「本週回顧即將生成，回來看看你這週寫下了什麼」。與既有 `1001` 打卡提醒相同的重排/取消模式，並受 `NOTIF_CONSENT_KEY` 同意把關。
   - diary 模組 reminder.time：固定 id 區段 `2000+hash(moduleId)%1000`，每日重複；個案在播放器開關。
3. 純網頁：只有站內通知（現行慣例）。

### 4.5 個人頁面「回顧集」小模組（`src/routes/app.profile.tsx`）

- 新元件 `src/components/ReviewsSection.tsx`，插在 PERMA 雷達與感恩統計之間。
- **顯現條件（自動顯現）**：`pro_reviews` 本人紀錄 ≥ 2 筆才渲染；0–1 筆完全不出現（符合「持續進行一段時間後自動顯現」）。
- 內容：標題「我的回顧集」＋橫向卡片列（每張：週期日期、title、summary 前 40 字、未讀點）。點卡片開全屏 bottom-sheet 顯示完整報告（summary → trend 折線（有才畫，SVG 簡單 polyline，主色 `--primary`）→ themes chips → 金句卡（quote 樣式置中、引號淡色）→ challenge 虛線框卡），開啟即 `markReviewRead`。
- 空態不佔位。分享：復用 `saveOrShareImage` 產生報告圖卡（次要，Phase 3）。

### 4.6 感恩日記 UI 精修（需求 1(c)）

`app.gratitude.tsx` 調整（不動資料流）：
1. INTRO 加「本週打卡條」（同 §2.4 樣式，資料：本人 `gratitude_entries` 的近 7 日）。
2. SUMMARY 的 AI 回饋改成分層卡片視覺：`emotional_summary` 用 mint tile＋「AI 即時回饋」標頭（sparkles icon）；`resonance_story` 用 peach tile＋「共鳴故事」標頭。
3. SUMMARY 底部加「回顧預告」鎖定卡：顯示「本週已記錄 N 天，滿 3 天解鎖週回顧」或「週日晚間為你生成本週回顧」。
4. 全頁字級/間距對齊四大主畫面精修規格（`docs/plans/REDESIGN_PLAN.md` 的 token 用法）。

---

## 5. Part C — 量表上傳與轉化（kind='assessment'）

### 5.1 內容 Schema

```jsonc
{
  "v": 1,
  "kind": "assessment",
  "source_scale": { "name": "自我慈悲量表 SCS", "note": "26 題原量表", "origin": "pasted" },
  "dimensions": [
    { "key": "SK", "name": "自我友善", "description": "…", "color_index": 0 }
    // color_index 0–4 對應站內五色（沿用 profile 的 TARGET_COLORS 五色序）
  ],
  "questions": [
    { "id": "q1", "dimension": "SK",
      "original": "我會溫柔對待自己的缺點（1–5 評分）",
      "translated": "最近一次你對自己失望時，你是怎麼跟自己說話的？",
      "hints": ["當時發生了什麼？", "如果是好朋友遇到同樣的事，你會對他說什麼？"],
      "required": true }
  ],
  "intro": "string",
  "consent_text": "這些問題背後有心理學的評估架構，你的回答會幫助你的專業夥伴更了解你。沒有標準答案。",  // 固定顯示，編輯器唯讀
  "review_before_send": false   // true = 個案版報告需專業夥伴確認後才發送
}
```

- **作答模式**：本期只做「問卷版」（Prototype 的輕量問卷版；互動範本＝`pretest/QuestionnaireScreen`：一題一頁、hints 摺疊、VoiceInput、進度條）。「深度對話版」列為後續項目（§11），schema 已預留不需改。
- 每維度建議 2–4 題、總題數上限 20（前端編輯器軟性提示，送審不強制擋）。

### 5.2 建構器流程（`src/components/pro/AssessmentBuilder.tsx`，掛在 therapist.tsx）

1. **上傳量表**：大 textarea 貼上量表全文（題目＋維度說明）＋量表名稱 input；「常用量表快速帶入」chips（PERMA-Profiler / FFMQ / PHQ-9+GAD-7 / SCS——只帶入名稱與維度骨架提示文字，**不內建受版權保護的完整題目**）。檔案上傳（.txt）可選；PDF/OCR 不做。
2. 按「AI 轉譯」→ `POST /api/pro/scale-transform`（§6.2）→ 回 dimensions + questions。
3. **編修**：維度列表（名稱/描述可改、可刪）＋逐題卡片（原題唯讀灰底、轉譯題可編輯、hints 可編輯、可換維度、可刪、可手動加題）。仿 Prototype 的 pair 卡（上：原題 tag＋灰底；下：轉譯 tag＋白底），用站內 muted/card 色。
4. **設定**：intro 編輯、`review_before_send` toggle、知情同意文案唯讀展示（藍 tile＋info icon，標注「無法關閉」）。
5. **預覽＋送審**：手機殼預覽問卷第一題；儲存草稿（`update_module_draft`）→ 送審（既有端點；§6.5 審核 prompt 針對量表加版權/診斷語彙檢核）。

### 5.3 個案端測驗播放器（`src/components/pro/AssessmentPlayer.tsx`，由 `app.pro-module.$moduleId.tsx` 依 kind 分流）

- 進場：intro 卡＋固定知情同意卡（consent_text，需點「我了解了」）＋預估時間（est_minutes）。
- 作答：一題一畫面（上一題/下一題），維度色點＋名稱做小標，題目、hints（「需要一點靈感？」摺疊），textarea＋VoiceInput，頂部進度條 `n / total`。答案存 local state，離開前 confirm。**全站風格**：卡片 `rounded-[22px] bg-card shadow-soft`，主 CTA 用 `PrimaryCta`——不照搬 PERMA 測驗的特殊視覺。
- 送出：`POST /api/pro/assessment-report`（§6.3）。等待畫面（吉祥物＋「正在為你整理…」）。
- 結果：
  - `status='released'`：渲染個案版報告（§5.5）。
  - `status='pending_release'`：顯示「你的專業夥伴確認後就會把結果傳給你」等待卡；之後從模組卡再點入時輪 `get_my_assessment_results` 顯示。
- 危機判讀：答案文字送出時後端同步跑（沿用 entry-safety-check 的兩層邏輯，§6.3 內嵌），高風險 → 寫 crisis_alerts＋前端彈 `CrisisResourcesModal`（既有元件）。
- 重測：允許，每次一筆新 result；模組卡顯示最近一次日期。

### 5.4 專業夥伴版報告（`practitioner_report` schema）

```jsonc
{
  "v": 1,
  "dimensions": [
    { "key": "SK", "name": "自我友善", "estimated_score": 3.0, "max_score": 10,
      "confidence": "high" | "medium" | "low",
      "evidence": ["「那好像是唯一一次笑得那麼開心」——自發性對比補充"] }
  ],
  "needs_confirmation": ["快感頻率下降的持續時間需會談中溫和確認"],
  "reflection_prompts": ["個案版以『低潮期的創作者』框架呈現，可作為切入點", "…"],
  "disclaimer": "推估分數來自質性回答的語意映射，不可等同標準化施測分數；本報告不構成診斷。"
}
```

therapist.tsx 個案追蹤區：assessment 模組的個案列出結果清單 → 點開報告視圖（新元件 `src/components/pro/AssessmentReportView.tsx`）：
- 量化側寫區（mint 邊框卡）：每維度名＋信心度 badge（high=mint/medium=peach/low=muted）＋分數 bar＋原文證據（左邊線引用樣式）＋固定 disclaimer。
- 需要人工確認區（pink/rust 邊框卡，標注「個案版不顯示此區塊」）。
- 反思與方向區（編號圓點列表）。
- `review_before_send=true` 且 `pending_release` 時：底部顯示個案版預覽＋「確認並發送個案版」按鈕 → RPC `release_assessment_result`。（個案版內容編輯功能列後續項目；本期只做「預覽＋發送」。）

### 5.5 個案版報告（`client_report` schema，優勢轉譯、無分數無風險語彙）

```jsonc
{
  "v": 1,
  "hero": { "emoji": "🔥", "title": "蓄能中的創作者", "subtitle": "…" },
  "highlights": [ { "emoji": "👀", "title": "你有罕見的自我觀察力", "text": "…" } ],  // 固定 3 則
  "quote": { "text": "…", "source": "出自你第 1 題的回答" },
  "hope": "一段有研究支持的溫暖敘述",
  "mission": { "title": "按一次呼叫鈕", "text": "本週小任務…" },
  "footer_note": "這份報告由 AI 根據你的書寫生成，經你的專業夥伴確認後發送。它不是測驗結果，是一面溫柔的鏡子。"
}
```
渲染（AssessmentPlayer 結果頁）：hero 用主色漸層卡（站內 brown/primary 漸層，不用 Prototype 綠）、亮點三卡 mint tile、金句置中卡、hope 藍紫漸層淡底卡、mission 虛線框卡、底部「收藏這份快照」→ `saveOrShareImage`。名人比對區塊（celeb）**不做**——涉及真實人物聯想風險，改為 hero 原型稱號（title 已涵蓋）。

---

## 6. 後端變更（`backend/app.py`）

共通：全部走 `Authorization: Bearer`＋`get_user_id`；AI 呼叫用既有 `claude()`＋`meter_claude(source, model, usage, user_id)`；模型沿用檔內既有 model 常數樣式（新增 `_DIARY_FEEDBACK_MODEL`、`_REVIEW_MODEL`、`_SCALE_TRANSFORM_MODEL`、`_ASSESSMENT_REPORT_MODEL`，值比照現有 pro 審核所用模型設定）；所有 JSON 解析用既有 `re.search(r"\{.*\}", …)` 容錯模式；失敗回 fallback、不 5xx 阻斷（除驗證錯誤）。

### 6.1 `POST /api/pro/diary-feedback`
Body：`{ entry_id }`。驗證 entry 屬本人＋active enrollment＋模組 kind='diary'＋`feedback.daily.enabled`。讀 published_content 的 style → system prompt 五風格對映（warm 溫暖肯定／reflective 多問一個開放問題／brief 一句話鼓勵／zen 留白短句／celebrate 活力慶祝；每則 ≤ 80 字、禁止診斷與建議用藥、對高風險內容只回穩定陪伴語）。將結果 `{style, text}` PATCH 回 `pro_entries.ai_feedback`（service key）並回傳前端。AI 失敗 → 回固定 fallback 文案（仍寫庫）。

### 6.2 `POST /api/pro/scale-transform`
Body：`{ scale_name, scale_text }`。限 practitioner（`_is_practitioner`）。System prompt 要點：
- 從量表全文辨識維度結構與題項；每維度輸出 key(2–3 大寫字母)/name/description；每題輸出 original（濃縮原題意，不逐字複製超過必要範圍）＋translated（開放式、生活化、無誘導、繁中）＋2 條 hints。
- 題數壓縮：每維度取最具代表性的 2–3 題轉譯（總數 ≤ 15）。
- 高風險量表（PHQ-9 第 9 題等自傷題）：translated 必須是溫和間接問法，並在該題標 `"sensitive": true`（前端在該題顯示求助資源列）。
- 回傳 §5.1 的 dimensions+questions JSON。
Metering source：`pro-scale-transform`。

### 6.3 `POST /api/pro/assessment-report`
Body：`{ module_id, answers }`。流程：
1. 驗證本人 active enrollment＋模組 kind='assessment'。
2. 危機兩層判讀（關鍵字 → AI 語意，直接複用 `_insert_crisis_alert` 與現行邏輯抽出的共用函式；回應帶 `crisis: {risk, matched_terms}` 供前端彈窗）。
3. 一次 AI 呼叫同時產出 practitioner_report＋client_report（單一 prompt、輸出兩個頂層 key，確保兩版本出自同一次分析——Prototype 明確要求）。Prompt 硬規則：client_report 不得含分數、百分位、風險語彙、臨床診斷詞；highlights 必須引用個案原文；mission 必須小而可行。
4. INSERT `pro_assessment_results`（service key），status 依模組 `review_before_send` 決定 `pending_release`/`released`（released 時 `released_at=now()`）。
5. 回傳 `{ result_id, status, client_report(僅 released), crisis }`。
AI 失敗：仍入庫 `answers`，兩報告欄位存 `{error: …}`，回 `status:'pending_release'`＋前端顯示「報告生成中，稍後再回來看」；professional 端報告視圖對 error 顯示「生成失敗，請聯繫平台」（後續可加重試，列 §11）。

### 6.4 `POST /api/pro/diary-review` 與 `POST /api/reviews/gratitude-weekly`
- diary-review Body：`{ module_id, review_type: 'overall'|'weekly' }`。後端自行重算門檻（threshold/7 天）與 period（不信前端），未達回 409；讀該期間 entries（service key），依 feedback.overall.focus / weekly.sections 組 prompt，產 §4.3 content，INSERT `pro_reviews`（撞 UNIQUE → 回既有列）。回傳完整 review 列。
- gratitude-weekly Body：`{ period_start }`（週一）。驗證該週本人 `gratitude_entries` ≥ 3；讀該週 items 組 prompt；同上入庫回傳。
Metering source：`pro-diary-review`、`gratitude-weekly-review`。

### 6.5 送審 AI 審核 prompt 擴充（`_PRO_REVIEW_SYSTEM`）
加入 kind 感知：diary → 檢查回饋設定是否誘發依賴/過度承諾；assessment → 額外輸出 `copyright_note`（是否疑似逐字收錄受版權保護量表題目）與 `clinical_risk_note`（是否含診斷性宣稱）。`AiReview` 型別（proModules.ts）與 admin 的 `AiReviewPanel` 增列這兩欄。

---

## 7. 管理員端調整（`src/routes/admin.tsx`）

1. 各 tab 模組卡片加 kind badge（練習=muted／日記=mint／測驗=peach）。
2. `ModuleReviewTab` 審核詳情：
   - diary：完整預覽 blocks＋回饋設定摘要表（風格/門檻/週報 sections/同步開關）。
   - assessment：維度列表＋原題/轉譯題對照全文（審核重點）＋`copyright_note`/`clinical_risk_note` 高亮。
3. `CrisisOverviewTab`：來源欄補顯示 assessment 觸發（`crisis_alerts.entry_id` 為 NULL、module kind='assessment' 時標「測驗作答」）。crisis_alerts 表不改（entry_id 本就 nullable）。
4. `PublishedModulesTab`：篩選 chips（全部/練習/日記/測驗）。

---

## 8. i18n / 分析事件 / 權限

- **i18n**：所有新字串 `t('繁中')`；於 `src/lib/i18n` 字典補 zh-CN、en 對應（執行時 grep 新增 t() 呼叫逐條補齊）。寫入 DB 的資料值（如報告內容）不走 t()（AI 依使用者語言生成——prompt 帶 `language` 參數，取自前端 `useLanguage` 傳給後端各端點 body `{ lang }`；三個生成端點都要支援）。
- **analytics（`track`）**：`pro_diary_created`、`pro_diary_entry_submitted`、`pro_diary_feedback_shown`、`review_generated {type}`、`review_opened {type}`、`profile_reviews_section_shown`、`pro_scale_transform_run`、`pro_assessment_started/submitted`、`pro_assessment_report_released`。
- **權限/安全檢核（執行者自查清單）**：
  - [ ] 個案任何路徑都拿不到 `practitioner_report`、`ai_review`、`draft_content`。
  - [ ] 停止追蹤（enrollment stopped）後：專業夥伴立即看不到該個案 entries、weekly reviews、assessment results（三條 policy 都以 `status='active'` 為條件——已符合）。
  - [ ] `pro_reviews`/`pro_assessment_results` 無任何前端 INSERT 路徑。
  - [ ] 新 RPC 全部 `SECURITY DEFINER SET search_path = public`＋身分驗證第一行。

---

## 9. 新增/修改檔案總表

| 動作 | 檔案 |
|---|---|
| 新增 | `supabase/pro_modules_v2.sql`（§3 全部＋三個 RPC 重貼＋`release_assessment_result`＋`get_my_assessment_results`） |
| 修改 | `backend/app.py`（§6 五端點＋審核 prompt＋共用危機函式抽取） |
| 修改 | `src/lib/proModules.ts`（kind、diary/assessment 型別、DIARY_TEMPLATES、assessment RPC 包裝） |
| 新增 | `src/lib/reviews.ts`（§4.2） |
| 修改 | `src/lib/notifications.ts`（review 通知源）、`src/lib/localNotifications.ts`（id 1002＋diary reminder 排程） |
| 新增 | `src/components/pro/DiaryBuilder.tsx`、`DiaryPlayer.tsx`、`AssessmentBuilder.tsx`、`AssessmentPlayer.tsx`、`AssessmentReportView.tsx` |
| 新增 | `src/components/ReviewsSection.tsx` |
| 修改 | `src/routes/therapist.tsx`（類型選擇＋兩 builder 掛載＋個案追蹤強化）、`src/routes/app.pro-module.$moduleId.tsx`（kind 分流）、`src/routes/admin.tsx`（§7）、`src/routes/app.profile.tsx`（回顧集）、`src/routes/app.gratitude.tsx`（§4.6）、`src/components/pro/BlockEditor.tsx`（voice 開關） |
| 修改 | `src/lib/i18n` 字典 |

---

## 10. 執行順序與驗收

**Phase 1 — 地基（DB＋型別）**
`pro_modules_v2.sql` 全檔＋proModules.ts 型別擴充＋RPC 帶 kind。
驗收：SQL 在乾淨環境重複執行兩次無錯；既有 practice 模組流程（建立→送審→核准→兌換→作答）完全不受影響（回歸測試）。

**Phase 2 — 日記模組端到端**
DIARY_TEMPLATES → DiaryBuilder → 送審/審核（admin kind 支援）→ DiaryPlayer ＋ `/api/pro/diary-feedback`。
驗收：建立感恩日記模板模組→核准→個案兌換→填寫→看到即時回饋卡＋週打卡條；危機關鍵字觸發 alert＋資源彈窗。

**Phase 3 — 定期回顧**
`/api/pro/diary-review`、`/api/reviews/gratitude-weekly`、reviews.ts、通知擴充、ReviewsSection、感恩日記 UI 精修。
驗收：造 3 筆上週感恩紀錄→開 App 生成 gratitude_weekly＋站內通知未讀點；diary 滿 3 則生成 overall；2 筆 review 後 profile 出現回顧集；1 筆時不出現。

**Phase 4 — 量表轉譯**
`/api/pro/scale-transform` → AssessmentBuilder → 審核（版權/臨床備註）→ AssessmentPlayer → `/api/pro/assessment-report` → 雙報告＋release RPC。
驗收：貼一份含兩維度的量表文字→轉譯→編修→送審核准→個案作答→個案看到無分數的溫暖報告、專業夥伴看到分數+信心度+證據報告；`review_before_send=true` 時個案先看到等待卡、發布後可見。

**Phase 5 — 收尾**
i18n 三語補齊、analytics 事件、`npm run build`＋lint 通過、`docs/plans/` 本檔更新為「已完成」並撰寫 result 文件（比照 `pro_modules_result.md`，含需手動執行的 SQL 與環境步驟清單）。

---

## 11. 明確排除（後續 backlog）

- 照片上傳題型（需 Storage bucket＋圖像審核）。
- 量表「深度對話版」作答模式（AI 逐題追問聊天流）。
- 個案版報告發送前的逐字編輯（本期僅預覽＋發送）。
- 名人比對區塊（真實人物聯想風險）。
- PDF/圖片量表 OCR 上傳。
- 報告生成失敗的自動重試佇列。
- App 完全關閉時的遠端推播（APNs 完整版，見 localNotifications.ts 既有註記）。
