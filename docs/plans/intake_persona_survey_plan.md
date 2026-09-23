# 入門偏好問卷（Intake Persona Survey）計劃書

> 狀態：**提案草稿 v1（2026-09-23）**，待產品／臨床端過目後開工。
> 參考對象：Nüli 女力、BetterMe（Fitness／Mental Health）、LUCIDBOOK 路晰書。
> 三家的逐題清單見 `reference_apps_onboarding_questions.md`。§4 的六題已於 2026-09-23 實作為 `/intake`（見 `src/lib/intake.ts`）。
> 全文案受晤談前計畫書 §1-1 用語法遵規範約束（禁「心理諮商／心理治療」）。UI 不使用 emoji。
>
> **2026-09-23 追加**：實作版由 Boaba 教練陪填（對話泡泡＋插圖＋插話頁），並擴充為 11 題：
> 新增「你的職業類別是？」（`occupation`，關於你段落，供配對參考）與「你有心理諮詢或教練晤談的經驗嗎？」
> （`counseling`，獨立成一題，拆成目前晤談中／以前有／教練／兩者都有／有興趣／沒想過六種，取代原本
> `tried` 題裡籠統的「心理諮詢或晤談」一個選項）。選項文案一律用「心理諮詢」，不寫「心理諮商」。

---

## 0. 一句話目標

在使用者第一次進 App 時，用 **不到 60 秒、全部點選** 的 7 題問卷，同時做到三件事：

1. **使用者**：一進來就拿到「為你安排」的練習，不用自己在訓練中心裡翻。
2. **平台**：知道我們的人是誰（persona），漏斗與留存可以切分析。
3. **專業夥伴**：私域個案進來時就帶著一張「來這裡想要什麼」的小卡，不用從零開始問。

InMind 測驗負責「**你現在的狀態長什麼樣**」（PERMA 分數，診斷面）；
這份問卷負責「**你為什麼來、想要什麼、能給多少**」（意圖與情境面）。兩者互補，不重疊。

---

## 1. 三個參考 App 怎麼做

| | Nüli 女力 | BetterMe | LUCIDBOOK 路晰書 |
|---|---|---|---|
| 問卷時機 | 第一次登入立刻問 | 註冊後立刻問，問完才付費牆 | 進 App 後以對話式互動抓情緒脈絡 |
| 長度 | 約 4 題 | Fitness 26 題、Mental Health 26 步（約 1.5–3 分鐘）；完整版達 41 步 | 幾句對話 |
| 問什麼 | 健身目標、健身經驗、訓練場地（家裡／健身房）、訓練頻率 | 性別、年齡、身高體重、目標（減壓／焦慮／睡眠／自尊…）、睡眠作息、活動量、想改的習慣、「我容易為小事緊張」這類同意度句子、想要的內容形式（課程／聲音／睡眠練習） | 「今天報告很緊張，出錯了，現在很焦慮…」→ 系統回三個練習（呼吸 5 分、內耗覺察 5 分、思維調節 7 分） |
| 答案怎麼用 | 直接推薦課表，之後每日訓練內容依課表產生 | 客製計畫 + 付費牆標頭個人化 + 訂閱後先給一個呼吸練習 | 當下推薦練習菜單，兩週一份成長報告 |
| 值得學的 UX | 題少、選項少、問完馬上給東西 | 一題一頁、大按鈕、進度條、「Analyzing your goals」過場動畫、問卷結束才接付費牆、權限說明先於系統彈窗 | 以情境語言開場（不是量表），使用者講白話就好 |
| 要避開的 | — | 太長（評測者認為是最大摩擦點）、「你犯了哪些壞習慣」這種帶評價的措辭、誇張體型示意圖 | — |

**共同模式**（三家都有）：
- 一開始就問「目標 × 現況 × 能投入多少」三件事。
- 問完不會直接丟你進首頁，而是「幫你準備好了 → 這是你的第一個練習」。
- 問卷是自我揭露的儀式，投入感累積到一定程度才談錢（BetterMe 在 3 分鐘後才出付費牆）。

---

## 2. PSY by PSY 現況與缺口

**現在的首次流程**（`src/routes/`）：

```
/login → /welcome（歡迎導覽，3–6 頁）
      → /onboarding intro → InMind 5 題開放問答（約 5 分鐘）→ loading → 報告
      → PaywallScreen（創始成員）→ /app/gratitude（第一個練習）
      → 第一次完成練習後：first_feedback 三題回饋
```

缺口：

| 缺口 | 說明 |
|---|---|
| 沒有「意圖」資料 | 只有 PERMA 分數，不知道使用者為什麼來、想解決什麼、每天能給幾分鐘。`profiles` 只有 name / avatar / streak。 |
| 推薦只看雷達圖 | `src/lib/recommend.ts` 純以 PERMA 弱項加輪替；跳過 InMind 的人一律拿預設推薦。 |
| InMind 是重門檻 | 5 題開放式作答，可以跳過（`quiz_skipped` 事件已在追）。跳過的人目前什麼個人化都沒有。 |
| 專業夥伴看不到 persona | 私域個案掃邀請碼進來，夥伴工作台只看得到打卡資料。 |
| 市集規劃已經定了「白話入口」分類 | `marketplace_style_matching_plan.md` §3：睡不好／情緒好滿／壓力爆表／關係卡住／找不到方向／重大失落／想更認識自己。問卷若直接沿用這套分類，市集預設入口可以零成本對上。 |
| 沒有 PostHog person properties | 只有 `identify(id)`，漏斗無法依 persona 切分。 |

---

## 3. 放在哪裡（決策建議）

**建議：放在歡迎導覽之後、InMind 測驗之前，再把 1 題放到 InMind 報告之後。**

```
/welcome → [新] 入門問卷 6 題（約 45 秒）→「正在為你安排…」過場
        → InMind intro（副標依問卷個人化）→ 5 題 → 報告
        → [新] 第 7 題：提醒時段（一頁）→ 付費牆 → 第一個練習
```

為什麼不是「InMind 之後」：

1. **跳過 InMind 的人也拿得到個人化。** InMind 可以跳過，若問卷排在它後面，跳過者兩樣都沒有。
2. **問卷輕、InMind 重，輕的先。** 三個參考 App 都是「幾個點選 → 馬上有東西」。先用 45 秒點選累積投入感，再進 5 分鐘的開放作答，InMind 的開始率應該會上升（可用 `quiz_started / welcome_completed` 前後對照）。
3. **InMind intro 可以立刻用上答案**：「你說最近壓力爆表，接下來 5 題會幫你看清楚壓力落在哪個維度」，讓測驗看起來是「分析」而不是「關卡」。
4. **付費牆也能用上**：`PaywallScreen` 已吃 `scores` 做標頭，再加上 goal 一句話（例：「想每天有個小習慣穩住自己 → 創始成員解鎖全部練習」）。

只有「提醒時段」放後面，因為它跟推播權限綁在一起，放在使用者已經看到報告價值之後再問，允許率較高（BetterMe 的「permission warm-up」模式）。

**不建議**放在第一次練習之後（像 `first_feedback` 那樣）：那時推薦已經發生過了，答案只剩分析用途，對使用者沒有即時回報。

---

## 4. 題目設計（v1 草稿，請臨床端潤飾文案）

原則：一題一頁、全部點選、單選點了就自動下一題、每頁右上角「先跳過」、進度條沿用 `/welcome` 的分段樣式。
台灣口吻、不帶評價（避開 BetterMe「你犯了哪些壞習慣」的問法）。

### 4-1 歡迎導覽之後（6 題）

| # | 題目 | 選項 | 型態 | 主要用途 |
|---|---|---|---|---|
| 1 | 最近是什麼讓你想打開這個 App？ | 壓力爆表 ／ 情緒起伏大 ／ 睡不好 ／ 關係卡住 ／ 提不起勁、找不到方向 ／ 想更認識自己 ／ 只是好奇看看 | 多選，最多 2 | 議題標籤；市集白話入口預設；PERMA 維度加權 |
| 2 | 現在的你比較像？ | 還撐得住，想先預防 ／ 有點累，想調整一下 ／ 蠻辛苦的，需要一些支持 ／ 說不上來 | 單選 | 負荷程度；第 3 個選項在完成頁多顯示一張「需要立即支持的資源」卡（1925／1995），不做診斷 |
| 3 | 你希望這裡幫你做到什麼？ | 每天有個小習慣穩住自己 ／ 學會處理某種情緒 ／ 有專業夥伴陪我走一段 ／ 記錄下來，看見自己的變化 | 單選 | 目標；決定首頁主推（習慣→感恩日記；情緒→自我慈悲；夥伴→市集／快篩；記錄→週回顧） |
| 4 | 你之前試過哪些方式？ | 寫日記 ／ 冥想或呼吸練習 ／ 運動 ／ 找朋友聊 ／ 心理諮詢或晤談 ／ 沒特別做過 | 多選 | 經驗程度（比照 Nüli「健身經驗」）；初階／進階內容排序；曾晤談者 → 私域車道潛在客 |
| 5 | 一天能留給自己多久？ | 3 分鐘 ／ 5 分鐘 ／ 10 分鐘以上 ／ 看那天心情 | 單選 | 依模組時長過濾（訓練中心卡片已有「三分鐘／五分鐘」meta） |
| 6 | 你比較喜歡哪種練習方式？ | 寫下來 ／ 聽引導 ／ 點選就好，不想打字 ／ 都可以 | 單選 | 內容形式；「不想打字」者 InMind 可提示語音輸入（Whisper 已有） |

**身份／年齡層**：B 端與投資人 persona 需要，但對使用者沒有即時回報，放在第 6 題之後**同一頁兩排 chips、可整頁跳過**：
- 身份：學生 ／ 上班族 ／ 照顧者或家長 ／ 自由工作者 ／ 其他
- 年齡層：18–24 ／ 25–34 ／ 35–44 ／ 45 以上

不問性別、不問身高體重（跟練習無關，也避開 BetterMe 被批評的點）。

### 4-2 InMind 報告之後（1 題）

| # | 題目 | 選項 | 用途 |
|---|---|---|---|
| 7 | 想在什麼時候收到練習提醒？ | 早上出門前 ／ 午休 ／ 睡前 ／ 先不用 | 推播時段（`push_notifications.sql` 已有基礎）；選了才觸發系統通知權限彈窗 |

### 4-3 完成頁（「正在為你安排…」）

1.5 秒過場（沿用 `LoadingScreen` 的 bagel 動畫）→ 一頁摘要：

> 你想「每天有個小習慣穩住自己」，最近「壓力爆表」。
> 我們先幫你排了 **感恩日記（五分鐘）**，接下來 5 題會讓安排更準。
> 〔開始 InMind 測驗〕〔先跳過，直接練習〕

跳過 InMind 的人從這裡直接進第一個練習，仍然是個人化的。

---

## 5. 答案怎麼用（價值閉環）

| 答案 | 使用者端 | 平台端 | 專業夥伴端 |
|---|---|---|---|
| Q1 議題 | 市集白話入口預設 chips；`recommendPractice` 加議題→PERMA 對照權重（壓力→E/A、情緒→P、關係→R、方向→M、認識自己→M） | PostHog person property `intake_issues`；後台 persona 分布 | 私域個案卡片「來這裡想處理：壓力爆表、睡不好」 |
| Q2 負荷 | 第 3 選項顯示資源卡；InMind 報告 `take_action` prompt 帶入，語氣放輕 | 分群看留存差異 | 卡片顯示，供夥伴決定第一個模組強度 |
| Q3 目標 | 首頁主推、付費牆標頭一句話、「有專業夥伴陪我」→ 導到市集 3 題快篩（`client_preferences`） | 私域／公域車道潛在比例 | 卡片顯示 |
| Q4 經驗 | 初階／進階排序；曾晤談者首頁露出「找專業夥伴」入口 | — | 卡片顯示 |
| Q5 時長 | 推薦只挑符合時長的模組 | — | 夥伴建模組時看得到個案偏好時長分布 |
| Q6 形式 | 「不想打字」→ InMind 顯示語音輸入提示 | — | — |
| 身份／年齡 | — | persona 報表；投資人簡報 | 匿名彙總（不到個人） |
| Q7 提醒 | 推播時段 | 推播 A/B | — |

**專業夥伴可見範圍**：只有**私域 enrollment**（掃該夥伴邀請碼）的個案 persona 才對該夥伴顯示，且身份／年齡只做彙總。
公域市集使用者的 persona 不對夥伴個別揭露。填寫頁底部一句：「這些答案只用來安排你的練習；若你之後加入某位專業夥伴的追蹤，會一併讓對方看到，方便對方認識你。」

---

## 6. 資料設計

```sql
-- supabase/intake.sql
CREATE TABLE IF NOT EXISTS user_intake (
  user_id        uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  issues         text[]  DEFAULT '{}',   -- Q1：stress / mood / sleep / relationship / direction / self / curious
  load_level     text,                   -- Q2：ok / tired / hard / unsure
  goal           text,                   -- Q3：habit / emotion / partner / track
  tried          text[]  DEFAULT '{}',   -- Q4：journal / meditation / exercise / friends / consult / none
  daily_minutes  int,                    -- Q5：3 / 5 / 10 / null(看心情)
  format_pref    text,                   -- Q6：write / listen / tap / any
  identity       text,                   -- student / worker / caregiver / freelancer / other
  age_band       text,                   -- 18-24 / 25-34 / 35-44 / 45+
  remind_slot    text,                   -- Q7：morning / noon / night / none
  version        int     DEFAULT 1,      -- 題目改版時往上加，方便之後分析對齊
  skipped        boolean DEFAULT false,  -- 整份跳過也留一列，避免每次進首頁再問
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
-- RLS：本人可讀／建立／更新（比照 first_feedback）；
-- 夥伴讀取走 RPC：intake_for_enrolled_client(client_id) 檢查 enrollment 才回傳。
```

- 問卷版本存 `version`，題目換了不用改表。
- 個人頁面加「重新填寫入門偏好」入口（比照「重新評估」按鈕）。
- PostHog：`intake_completed` 時一併 `setPersonProperties({ intake_goal, intake_issues, intake_load, intake_identity, intake_age_band })`。

---

## 7. 前端規格

**路由**：新增 `/intake`（獨立路由，比塞進 `onboarding.tsx` 乾淨）。

**導向邏輯**（`app.home.tsx` beforeLoad 現有順序往中間插一層）：

```
!hasSeenWelcome()           → /welcome
!hasIntake && !skippedIntake → /intake        ← 新增（查 user_intake，本機也存一份 flag 比照 onboardingSkip.ts）
!perma_scores && !skippedQuiz → /onboarding
```

`/welcome` 最後一頁的「開始測驗」改導向 `/intake`；`/intake` 完成頁再導 `/onboarding`。

**畫面**：
- 每題一頁，`screen-enter` 進場；頂部分段進度條（7 段，沿用 `/welcome`）。
- 單選：點選後 250ms 自動下一題（BetterMe 模式）；多選：底部「下一步」。
- 每頁右上「先跳過」→ 跳這一題；intro 頁提供「整份跳過」。
- 完成頁見 §4-3。
- 語言：先出繁中，字串進 `src/lib/i18n/dict/intake.ts`（英文與簡中比照 pretest.ts 補）。

**事件**（加進 `AnalyticsEvent`）：
`intake_started`、`intake_question_answered {q, value}`、`intake_completed {skipped_count}`、`intake_skipped {at_question}`、`intake_reminder_set {slot}`。

**推薦整合**（`src/lib/recommend.ts`）：
- `recommendPractice(scores, intake?, date)`：先用 `daily_minutes` 過濾，再把 Q1 議題對照到 PERMA 維度加權（與雷達圖弱項相加），Q3 目標決定 tiebreak。
- `reason` 文案加一個模板：「你說最近壓力爆表，今天為你安排『過程目標覺察』」。

---

## 8. 實作切分

| PR | 內容 | 主要檔案 |
|---|---|---|
| 1 | 資料表 + `/intake` 問卷 + 事件 + 導向 | `supabase/intake.sql`、`src/routes/intake.tsx`、`src/lib/intakeSkip.ts`、`src/lib/i18n/dict/intake.ts`、`src/lib/analytics.ts`、`src/routes/app.home.tsx`、`src/routes/welcome.tsx` |
| 2 | 推薦與個人化：首頁推薦、InMind intro 副標、報告 prompt、付費牆標頭 | `src/lib/recommend.ts`、`src/components/pretest/IntroScreen.tsx`、`backend/app.py`（/api/report 帶入 intake）、`src/components/paywall/PaywallScreen.tsx` |
| 3 | 第 7 題提醒時段 + 推播權限流程 | `src/routes/onboarding.tsx`（報告後）、`supabase/push_notifications.sql` |
| 4 | 夥伴工作台個案卡片 + 後台 persona 彙總 | `src/routes/therapist.tsx`、`src/routes/admin.tsx`、RPC |

PR 1 上線後就能開始累積資料；PR 2 才是使用者感受得到的差異，兩者盡量同一週上。

---

## 9. 驗收指標

- `intake_completed / intake_started` ≥ 85%（BetterMe 26 題被評為摩擦點，我們 7 題應該要高很多）。
- `quiz_started / welcome_completed` 上線前後對照，預期上升。
- Day-1 留存：有 intake vs 跳過 intake 分群。
- 第一個練習完成率（`gratitude_completed` 或對應模組）：個人化推薦 vs 之前的預設推薦。

上線前先用 `scripts/posthog_top_events.py` 抓一次現況基準（welcome → quiz_started → quiz_completed → gratitude_completed）。

---

## 10. 待確認

1. Q1–Q6 文案請臨床端潤飾；Q2 第 3 選項的資源卡文案與晤談前計畫 §6 危機流程對齊。
2. 身份／年齡層要不要問（B 端與投資人簡報需要，但會多一頁；建議問但整頁可跳）。
3. 私域夥伴可見 persona 的告知文案是否需要放進條款版本（`termsVersion.ts`）。
4. 英文版是否第一版就上（目前 App 有 en／zh-CN 字典）。
5. 「有專業夥伴陪我走一段」導到市集快篩的時機：市集尚未上線前先導到「找專業夥伴」等候名單。

---

## 參考來源

- Nüli 官方介紹（首次登入詢問健身目標／經驗／場地／頻率）：https://nuli.app/blog/nuliapp-review/
- BetterMe Fitness onboarding（26 題、不需先註冊、完整導覽）：https://theappfuel.com/examples/bettermefitness_onboarding
- BetterMe Health Coaching 流程拆解（41 步、3 分鐘後付費牆、3D 選部位、權限預告）：https://screensdesign.com/showcase/betterme-health-coaching
- BetterMe Mental Health 流程拆解（26 步、Analyzing your goals 過場、訂閱後先給呼吸練習）：https://screensdesign.com/showcase/betterme-mental-health
- BetterMe 評測（問性別／年齡／身高體重／目標／睡眠／部位／習慣；「壞習慣」措辭與體型示意被批評）：https://www.medicalnewstoday.com/articles/betterme-review
- BetterMe 各類 quiz 題型整理：https://betterme.world/articles/betterme-quiz/
- LUCIDBOOK 路晰書官網（極簡對話捕捉情緒脈絡 → 推薦練習菜單）：https://lucidbook.tw/
- LUCIDBOOK 情緒健康養成計劃問卷：https://lucidbook.tw/lucidbook-emotional-project-survey/
