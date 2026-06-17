# MindGym — Demo 版規格書 (v2)

> 這份文件是 Claude Code 的工作 ground truth。每次開新 session 前請先閱讀本文件。

---

## 1. 產品定位

把心理健康練習包裝成「每日訓練」的 PWA App。使用者登入後完成一次性 PERMA 評估，然後每天進入五個心理練習模組。Demo 階段以「感恩日記」為核心功能，其餘四個模組放 placeholder。

---

## 2. 技術棧

| 層級 | 技術 |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v3 |
| PWA | `vite-plugin-pwa`（manifest + service worker） |
| 路由 | TanStack Router（file-based，dot-separated） |
| Backend | FastAPI（Python 3.11+），單一 `app.py` |
| Auth | Supabase Auth（Google OAuth） |
| Database | Supabase（PostgreSQL） |
| AI | Anthropic Claude API（`claude-sonnet-4-5`） |
| Frontend hosting | Vercel |
| Backend hosting | Render |

**不需要的：** i18n 套件、edge functions、payments、react-router-dom、Lovable Cloud。

介面全部繁體中文寫死。

---

## 3. 環境變數

### Backend（`.env`）
```
ANTHROPIC_API_KEY=   # 必填
SUPABASE_URL=        # 必填
SUPABASE_KEY=        # 必填（service role key）
PORT=8000
```

### Frontend（`.env.local`）
```
VITE_API_URL=http://localhost:8000   # 本機開發用
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

## 4. 資料庫 Schema（Supabase）

### `profiles`
```sql
id          uuid  PRIMARY KEY  -- 對應 auth.users.id
name        text
created_at  timestamptz DEFAULT now()
```

### `perma_scores`
```sql
id          uuid  PRIMARY KEY DEFAULT gen_random_uuid()
user_id     uuid  REFERENCES profiles(id)
p_score     int   -- 1~5（正向情緒）
e_score     int   -- 1~5（全心投入）
r_score     int   -- 1~5（與他人關係）
m_score     int   -- 1~5（生活意義）
a_score     int   -- 1~5（成就感）
created_at  timestamptz DEFAULT now()
```

### `gratitude_entries`
```sql
id              uuid  PRIMARY KEY DEFAULT gen_random_uuid()
user_id         uuid  REFERENCES profiles(id)
entry_date      date  DEFAULT CURRENT_DATE
item_1          text
item_2          text
item_3          text
tag_1           text  -- AI 標記：身邊他人 / 自己 / 環境 / 體驗 / 自訂
tag_2           text
tag_3           text
ai_feedback     text  -- AI 一句話回饋
is_shared       bool  DEFAULT true  -- 預設匿名分享到社群
anon_name       text  -- 能量代號，例如「溫暖的星火」
created_at      timestamptz DEFAULT now()
```

---

## 5. 路由結構

```
src/routes/
  __root.tsx            root layout（HTML shell + AuthGuard）
  login.tsx             /login           Google 登入頁
  onboarding.tsx        /onboarding      PERMA 問卷（首次登入才到這）
  app.tsx               /app             App shell（底部 3 tab）
  app.home.tsx          /app/home        訓練中心（五個模組按鈕）
  app.community.tsx     /app/community   社群（四則感恩日記）
  app.profile.tsx       /app/profile     個人頁（名字 + PERMA 分數）
  app.gratitude.tsx     /app/gratitude   感恩日記練習（完整流程）
  app.placeholder.tsx   /app/placeholder 其他四個模組共用 placeholder 頁
```

### 頁面流向
```
/login
  ├── 已登入 ──────────────────────────────→ /app/home
  └── 首次登入 → /onboarding → /app/home

/app/home
  ├── 點「感恩日記」→ /app/gratitude
  └── 點其他四個  → /app/placeholder（顯示「即將開放」）

/app/gratitude  （步驟在第 7 節說明）
```

---

## 6. Auth 機制（`__root.tsx` 的 AuthGuard）

- 用 Supabase client 的 `onAuthStateChange` 監聽登入狀態
- 任何 `/app/*` 路徑：未登入 → redirect `/login`
- `/login`：已登入 → redirect `/app/home`
- `/onboarding`：已有 `perma_scores` 記錄 → redirect `/app/home`

---

## 7. 各頁面詳細規格

### 7.1 `/login` 登入頁

- 全螢幕居中，只有：
  - App logo / 標題「MindGym」
  - 副標「照顧心理，像照顧身體一樣自然」
  - 一顆「用 Google 登入」按鈕（呼叫 Supabase Google OAuth）
- 登入成功後：
  - 如果 `profiles` 沒有此 user → 建立 profile → 去 `/onboarding`
  - 如果有 profile 但沒有 `perma_scores` → 去 `/onboarding`
  - 如果都有 → 去 `/app/home`

### 7.2 `/onboarding` PERMA 問卷

5 題 Likert-Scale，一題一頁（或一頁全部顯示，看實作方便），選項 1–5：

| # | 維度 | 題目 |
|---|---|---|
| P | 正向情緒 | 一般而言，你感到滿足的程度是？ |
| E | 全心投入 | 一般而言，在事物上你感到興奮和有趣的程度是？ |
| R | 與他人關係 | 你對自己的人際關係感到滿意的程度是？ |
| M | 生活意義 | 你通常覺得自己生活有價值且值得的程度是？ |
| A | 成就感 | 有多少的時間你認為自己正在往要完成的目標前進？ |

選項標籤（1→5）：「非常不同意 / 不同意 / 普通 / 同意 / 非常同意」

完成後：
- POST `/api/perma` 儲存分數到 `perma_scores`
- Navigate → `/app/home`

### 7.3 `/app` shell

- `<Outlet />` + 固定底部 nav
- 底部 3 tab：
  - 訓練中心（Dumbbell icon）→ `/app/home`
  - 社群（Users icon）→ `/app/community`
  - 個人頁面（User icon）→ `/app/profile`
- `bg-white/95 backdrop-blur`，含 `pb-[env(safe-area-inset-bottom)]`

### 7.4 `/app/home` 訓練中心

- Header：「你好，{name}　今天想練哪一塊？」
- 五個大按鈕（Grid 或直式清單，每個有 icon + 名稱 + 一句描述）：

| icon | 名稱 | 描述 | 路由 |
|---|---|---|---|
| 🕐（時鐘）| 正念冥想 | 專注當下，觀察思緒流動 | `/app/placeholder` |
| ❤️（愛心）| 自我慈悲 | 善待自己，接納不完美 | `/app/placeholder` |
| ⭐（星星）| 感恩日記 | 記錄生活中的美好片刻 | `/app/gratitude` |
| ☑️（勾選）| 三件好事 | 每日記錄三個正向事件 | `/app/placeholder` |
| 👁️（眼睛）| 過程目標覺察 | 覺察成長、心得與樂趣 | `/app/placeholder` |

### 7.5 `/app/community` 社群

- Header：「大家今天感謝了什麼？」
- 從 Supabase `gratitude_entries` 撈最新 4 筆（`is_shared = true`，`ORDER BY created_at DESC LIMIT 4`）
- 每則卡片顯示：
  - 能量代號（`anon_name`）
  - 三件感恩事件（`item_1`, `item_2`, `item_3`）
  - 日期
- 無互動功能（Demo 版不需要留言/按讚）

### 7.6 `/app/profile` 個人頁面

- Header：「你的心理檔案」
- 顯示：
  - 名字（從 `profiles.name`）
  - PERMA 分數：五個維度各自的分數（1–5），簡單的條狀或數字顯示即可
  - 「重新評估」按鈕 → `/onboarding`（覆蓋舊分數）
- 不需要雷達圖（之後版本再加）

### 7.7 `/app/placeholder` 功能開發中

- 全螢幕居中，顯示：
  - 功能名稱（從 query param 或固定文字）
  - 「這個功能即將開放，敬請期待！」
  - 返回按鈕

---

## 8. 感恩日記完整流程（`/app/gratitude`）

這是 Demo 的核心功能，使用**初階版**流程。

### 8.1 頁面狀態機
```
INTRO → WRITING → AI_PROCESSING → RESULT → DONE
```

### 8.2 INTRO（引導說明）
- 標題：「今天的感恩日記」
- 日期（`YYYY / MM / DD（星期）`）+ 今日連續紀錄天數🔥
- 引導語：「今天發生了哪三件值得你感謝的事情呢？」
- 提示：「請寫得越具體越好，可以是生活中的細微小事」
- 感恩對象說明：身邊的人 / 自己 / 大自然與環境 / 事物 / 一段體驗
- 「開始練習」按鈕 → WRITING

### 8.3 WRITING（書寫）
- 頂部進度儀表板：「今日完成進度 (0/3)」，圓形進度條
- 三個輸入卡片並列（或直式）：
  - 第一件感恩的事情是… （placeholder：例：我很感謝工作夥伴幫忙處理事情，讓我感到很安心）
  - 第二件感恩的事情是… （placeholder：例：我很感謝自己今天面對繁忙行程並沒有退縮）
  - 第三件感恩的事情是… （placeholder：例：今天公車準時，讓我有餘裕欣賞沿途風景）
- 三項都填寫後，「送出感恩日記」按鈕啟用 → AI_PROCESSING

### 8.4 AI_PROCESSING（AI 分析中）
- 呼叫 POST `/api/gratitude`（見第 9 節）
- 顯示載入動畫 + 文字「正在整理你的感恩時刻…」

### 8.5 RESULT（結果顯示）
顯示：
1. 三件感恩事件 + 各自的 AI 標籤（身邊他人 / 自己 / 環境 / 體驗）
2. AI 一句話回饋（溫柔語氣，見 9.2 的 prompt）
3. **匿名分享設定**：「預設分享到社群（匿名）」toggle，預設開啟
4. 「結束今日練習」按鈕 → DONE

### 8.6 DONE（完成畫面）
- 完成文字：「恭喜完成今天的感恩練習。當我們願意停下來留意身邊的美好時刻，這本身就能提供我們更多的心理健康資源。」
- 練習後能力提升：
  - 情緒力 +3
  - 意義力 +1
  - 連結力 +3
- 「返回首頁」按鈕

---

## 9. Backend API

### 9.1 `POST /api/perma`

**Request**
```json
{
  "user_id": "uuid",
  "p": 4,
  "e": 3,
  "r": 5,
  "m": 4,
  "a": 3
}
```
**Response**：`{ "ok": true }`

直接寫入 `perma_scores`，不呼叫 AI。

---

### 9.2 `POST /api/gratitude`

**Request**
```json
{
  "user_id": "uuid",
  "item_1": "感謝工作夥伴幫忙溝通事項",
  "item_2": "感謝自己今天沒有放棄",
  "item_3": "感謝公車準時到來"
}
```

**Backend 處理流程：**

1. 呼叫 Claude API，執行兩個任務（可以一次呼叫完成）：

**Prompt（System）：**
```
你是一位心理學分析助手，回應請使用繁體中文，且只回傳 JSON，不要加任何前言或 markdown。
```

**Prompt（User）：**
```
請根據以下三件感恩事件：
1. {item_1}
2. {item_2}
3. {item_3}

完成兩件事：
A. 為每件事標記感恩對象（只能選：身邊他人、自己、環境、體驗、自訂）
   - 若提及具體人名，標記為「身邊他人」
   - 若提及自身努力/堅持/情緒，標記為「自己」
   - 若提及天氣/空間/大自然，標記為「環境」
   - 若提及電影/音樂/美食/旅行/事物，標記為「體驗」

B. 生成一句溫柔的回饋，反映使用者的正向情緒，點出感恩事件的心理意義，不批判、有陪伴感，30字以內。

回傳格式：
{
  "tag_1": "身邊他人",
  "tag_2": "自己",
  "tag_3": "環境",
  "ai_feedback": "你今天留意到了身邊的支持，這份覺察是你最珍貴的心理資源。"
}
```

2. 解析 JSON 回應
3. 生成能量代號（從固定清單隨機選，例如：溫暖的星火、清晨的微風、靜謐的月光、晴天的微笑、輕盈的雲朵）
4. 寫入 `gratitude_entries`

**Response**
```json
{
  "tag_1": "身邊他人",
  "tag_2": "自己",
  "tag_3": "環境",
  "ai_feedback": "你今天留意到了身邊的支持，這份覺察是你最珍貴的心理資源。",
  "anon_name": "溫暖的星火"
}
```

---

## 10. PWA 設定

`vite-plugin-pwa` 的 manifest：
```json
{
  "name": "MindGym",
  "short_name": "MindGym",
  "theme_color": "#6366f1",
  "background_color": "#ffffff",
  "display": "standalone",
  "start_url": "/",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## 11. 設計風格

- 色系：柔和藍紫（primary `#6366f1`）+ 米白底（`#fafaf9`）
- 圓角：`rounded-2xl`～`rounded-3xl`
- 五個功能 icon 色系參考：紫 / 粉 / 綠 / 橙 / 藍（各自淡底色）
- 字體：系統字體 `ui-sans-serif, system-ui, "PingFang TC", "Microsoft JhengHei"`
- 底部 tab 需支援 `safe-area-inset-bottom`（iOS 瀏海）
- 元件不要用 `bg-white`/`bg-black` 寫死，改用 Tailwind token

---

## 12. Claude Code 建議執行順序

每個步驟完成後 commit 再繼續，確保每一步可以獨立運作。

```
Step 1  專案初始化
        - Vite + React + TypeScript
        - Tailwind CSS v3
        - TanStack Router
        - vite-plugin-pwa
        - Supabase client

Step 2  Auth 基礎
        - Supabase Google OAuth 設定
        - __root.tsx AuthGuard
        - /login 頁面

Step 3  Onboarding
        - /onboarding PERMA 問卷（5題 Likert）
        - POST /api/perma（FastAPI）
        - 寫入 perma_scores

Step 4  App Shell + 首頁
        - /app shell（底部 3 tab）
        - /app/home（五個功能按鈕）
        - /app/placeholder

Step 5  感恩日記（前端流程）
        - /app/gratitude 的四個狀態（INTRO/WRITING/AI_PROCESSING/RESULT/DONE）
        - 先用 mock AI 回應測試流程

Step 6  感恩日記（後端 AI）
        - POST /api/gratitude（FastAPI）
        - Claude API 呼叫（標籤 + 回饋）
        - 寫入 gratitude_entries

Step 7  社群頁面
        - /app/community 從 Supabase 撈最新 4 筆感恩日記

Step 8  個人頁面
        - /app/profile 顯示名字 + PERMA 分數

Step 9  PWA 設定 + 最終測試
        - manifest.json、icon、service worker
        - 手機瀏覽器安裝測試
```

---

## 13. 不要犯的錯

- 不要用 `react-router-dom`，路由統一用 TanStack Router
- Auth 狀態只在 `__root.tsx` 的 context 管理，不要在每頁各自訂 listener
- `gratitude_entries` 的 `user_id` 必須是當前登入 user，不接受 client 傳入任意 user_id（由 backend 從 session token 取）
- Supabase 的 `service role key` 只放 backend，frontend 只用 `anon key`
- PWA 的 service worker 不要快取 `/api/*` 路由
- 底部 tab 一定要有 `pb-[env(safe-area-inset-bottom)]` 處理 iPhone 底部安全區域
