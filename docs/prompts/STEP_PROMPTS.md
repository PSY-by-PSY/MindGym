# MindGym 各 Step 開場 Prompt

每次開啟新 session 時，直接把對應 Step 的 prompt 貼給 Claude。
完整計畫在 `REDESIGN_PLAN.md`。

---

## Step 2 — 首頁格狀練習菜單

```
我在做 MindGym APP（React + TanStack Router + Tailwind + Supabase）的 UI 更新。

完整更新計畫在 REDESIGN_PLAN.md，Step 1（頂部 Header Bar）已完成。

現在要做 Step 2：把 `src/routes/app.home.tsx` 的首頁練習清單，從目前的直向清單卡片改成格狀圖示菜單（參考設計文件圖一）。

需求：
- 五個練習以 2 列或橫向 scroll 的格狀排列，每個是圓角方塊
- 每個方塊包含：大 emoji icon、練習名稱、下方 PERMA 標籤 badge
- PERMA 對應（已確認）：
  - 三件好事 → P 正向情緒
  - 感恩日記 → P 情緒力、R 連結力、M 意義力（可顯示多個 badge）
  - 自我慈悲 → E 全心投入
  - 過程目標覺察 → M 意義力、A 成就感
  - 正念冥想 → E 全心投入
- 感恩日記 badge 顏色用現有 tile 色系（bg-tile-mint/pink/peach/blue）
- 點擊行為維持不變（感恩日記 → /app/gratitude，其他 → /app/placeholder）

現有設計系統：src/index.css 有定義 tile 顏色和 shadow-soft 等 utilities。
```

---

## Step 3 — 首頁感恩日記快速啟動 Bar

```
我在做 MindGym APP（React + TanStack Router + Tailwind + Supabase）的 UI 更新。

完整更新計畫在 REDESIGN_PLAN.md，Step 1–2 已完成。

現在要做 Step 3：在 `src/routes/app.home.tsx` 的格狀練習菜單下方，新增一個感恩日記快速啟動橫幅卡片。

需求：
- 位置：格狀菜單下方，訓練中心區塊上方
- 樣式：圓角卡片，帶有漸層或強調色背景（可參考現有 bg-gradient-night 或 bg-tile-mint 色系）
- 內容：
  - 標題：「感恩日記練習」
  - 副標：「點擊直接開始今日練習」
  - 右側加箭頭 icon 或 CTA 感
- 點擊跳轉 /app/gratitude

現有設計系統：src/index.css 有 gradient 和 tile 色系定義。
```

---

## Step 4 — 首頁訓練中心下段

```
我在做 MindGym APP（React + TanStack Router + Tailwind + Supabase）的 UI 更新。

完整更新計畫在 REDESIGN_PLAN.md，Step 1–3 已完成。

現在要做 Step 4：在 `src/routes/app.home.tsx` 最下段新增「訓練中心」區塊。

需求（四個子區塊，有各自的小標題）：

1. 我的菜單（我的日程）
   - 顯示「日程一」「日程二」「日程三」三個假卡片（UI 佔位，邏輯之後再接）
   - 可點擊（暫時點了沒反應或 toast 提示「即將開放」）
   - 其他項目（若有）顯示 locked 狀態（灰色 + 鎖頭 icon）

2. 最新上架
   - 整塊 locked，灰色覆蓋，中間顯示「敬請期待」文字

3. 最熱門
   - 顯示一張感恩日記卡片（樣式可參考現有 ModuleCard 或自訂）
   - 點擊跳轉 /app/gratitude

4. PERMA 練習菜單
   - 以 P/E/R/M/A 五個維度為分類
   - 每個維度下列出對應的練習名稱
   - 對應關係：
     P → 三件好事、感恩日記
     E → 自我慈悲、正念冥想
     R → 感恩日記
     M → 感恩日記、過程目標覺察
     A → 過程目標覺察
   - 點擊練習跳轉對應路由（感恩日記 → /app/gratitude，其他 → /app/placeholder）

現有設計系統：src/index.css 有 tile 顏色、shadow-soft、gradient 等 utilities。
```

---

## Step 5 — 社群每日首次訪問 Popup

```
我在做 MindGym APP（React + TanStack Router + Tailwind + Supabase）的 UI 更新。

完整更新計畫在 REDESIGN_PLAN.md，Step 1–4 已完成。

現在要做 Step 5：在 `src/routes/app.community.tsx` 加入每日首次訪問的 Modal popup。

需求：
- 用 localStorage key `community_last_visited`（存 ISO date string）判斷是否為今天第一次訪問
- 每天第一次進入社群頁面，自動跳出 modal
- Modal 內容：
  - 從 loader 拿到的第一則公開感恩日記內容（現有 entries[0]）
  - 日記內容：匿名暱稱 + 三則感恩項目條列
  - 提示文字：「請給對方一些回饋吧 💬」
- 兩個按鈕：
  - 「先看看」→ 關閉 modal
  - 「去留言」→ 關閉 modal（留言功能 Step 6 再接）
- Modal 背景半透明遮罩，點擊遮罩也可關閉
- 若當天已訪問過，或 entries 為空，則不顯示

現有社群資料結構：GratitudeEntry { id, anon_name, item_1, item_2, item_3, entry_date }
現有設計系統：src/index.css 有 tile 顏色、shadow-soft 等 utilities。
```

---

## Step 6 — 社群 Like 按鈕 + 匿名留言

```
我在做 MindGym APP（React + TanStack Router + Tailwind + Supabase）的 UI 更新。

完整更新計畫在 REDESIGN_PLAN.md，Step 1–5 已完成。

現在要做 Step 6：在社群頁面（src/routes/app.community.tsx）加入 Like 和匿名留言功能。

需要先在 Supabase 建立兩個新表格（請先給我 SQL，我去執行，再繼續做前端）：

```sql
-- likes 表
create table likes (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references gratitude_entries(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(entry_id, user_id)
);

-- comments 表
create table comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references gratitude_entries(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  anon_name text,
  content text not null,
  created_at timestamptz default now()
);
```

前端需求（修改 src/routes/app.community.tsx）：
- 每則日記卡片底部加：
  - 愛心按鈕：toggle like（呼叫 Supabase insert/delete），顯示總 like 數
  - 「留言」按鈕：點擊後展開該則日記的留言區
- 留言區：
  - 顯示現有留言列表（anon_name + content）
  - 輸入框 + 送出按鈕，留言以當前用戶的匿名暱稱送出
  - anon_name 從 profiles 表的 name 欄位取（已有 loader context）
- loader 需額外 fetch likes 數量和 comments

現有設計系統：src/index.css 有 tile 顏色、shadow-soft 等 utilities。
Supabase client 在 src/lib/supabase.ts。
```

---

## Step 7 — 社群重整鍵 + AI 關鍵詞標籤

```
我在做 MindGym APP（React + TanStack Router + Tailwind + Supabase）的 UI 更新。

完整更新計畫在 REDESIGN_PLAN.md，Step 1–6 已完成。

現在要做 Step 7：社群頁面的重整鍵和 AI 關鍵詞標籤。

需求：

1. 重整鍵
   - 社群頁面標題附近加一個重整 icon 按鈕
   - 點擊後重新 fetch 一批公開日記（可 shuffle 或改 offset）
   - 按下時有 loading 旋轉動畫

2. AI 關鍵詞標籤
   - 每則感恩日記卡片加 2–3 個關鍵詞小標籤
   - 需要建立 Supabase Edge Function（呼叫 Claude API）：
     - input: 感恩日記三則文字
     - output: JSON 陣列，每個元素 { word: string, category: "感受"|"事件"|"對象"|"其他" }
   - 標籤顏色依類別：
     - 感受 → bg-tile-pink
     - 事件 → bg-tile-blue
     - 對象 → bg-tile-peach
     - 其他 → bg-muted
   - 標籤在 loader 階段一起 fetch（批次呼叫 edge function）
   - 若 edge function 失敗則 gracefully 不顯示標籤

Supabase client 在 src/lib/supabase.ts。
Claude API 使用 claude-sonnet-4-6 model。
```

---

## Step 8 — 社群文字雲

```
我在做 MindGym APP（React + TanStack Router + Tailwind + Supabase）的 UI 更新。

完整更新計畫在 REDESIGN_PLAN.md，Step 1–7 已完成。

現在要做 Step 8：社群頁面頂端的文字雲。

需求：
- 位置：社群頁面最上方（日記列表上方）
- 顯示一週內所有公開貼文的高頻關鍵字
- 字體大小依頻率決定（出現越多越大）
- 四個類別（感受/事件/對象/其他）用不同顏色（現有 tile 色系）：
  - 感受 → text 用 tile-pink 相關色
  - 事件 → tile-blue
  - 對象 → tile-peach
  - 其他 → muted-foreground
- 目前先用一張靜態佔位圖（placeholder image）代替真實文字雲，之後 Step 7 的 AI 標籤資料累積夠了再接上
- 佔位圖樣式：圓角卡片，內部放一個有色塊文字雲外觀的假圖或 SVG 示意圖
- 圖片下方加小字「本週健心社群關鍵字・每週更新」

現有設計系統：src/index.css 有 tile 顏色和 shadow-soft 等 utilities。
```

---

## Step 9 — 個人頁健心紀錄日曆

```
我在做 MindGym APP（React + TanStack Router + Tailwind + Supabase）的 UI 更新。

完整更新計畫在 REDESIGN_PLAN.md，Step 1–8 已完成。

現在要做 Step 9：在個人頁面（src/routes/app.profile.tsx）最下方加入健心紀錄日曆。

需求：
- 月份 grid 日曆（顯示當月，可左右切換上下個月）
- 有做過感恩日記的日期在格子上顯示小色點（資料來源：gratitude_entries 表的 entry_date 欄位，filter by user_id）
- 點擊有記錄的日期 → 展開該日的練習清單（目前只有感恩日記，列出「感恩日記 ✓」）
- 點擊清單中的「感恩日記」項目 → 跳出 modal 顯示當天三則感恩日記內容（item_1, item_2, item_3）
- 點擊無記錄的日期 → 不反應或顯示「這天還沒有紀錄」
- loader 需額外 fetch 當月的 gratitude_entries（entry_date 欄位）

現有 profile loader 已 fetch：profiles.name、perma_scores
現有設計系統：src/index.css 有 tile 顏色、shadow-soft 等 utilities。
Supabase client 在 src/lib/supabase.ts。
```

---

## Step 10–13 — 感恩日記完整重構

```
我在做 MindGym APP（React + TanStack Router + Tailwind + Supabase）的 UI 更新。

完整更新計畫在 REDESIGN_PLAN.md，Step 1–9 已完成。

現在要做 Step 10–13：全面重構感恩日記流程（src/routes/app.gratitude.tsx）。

目前的感恩日記已有基本多頁流程，這次要改成六頁標準流程：

【第一頁 — 說明 + 難度選擇】
- PERMA 加分預告：情緒力 +3、連結力 +3、意義力 +1（用 badge 樣式顯示）
- 感恩日記說明文字（你來定稿或先用 placeholder）
- 難度選擇：初階 / 進階（兩個選項卡，點選後高亮）
- 「開始練習」按鈕

【第二至四頁 — 引導輸入，共三頁】
- 每頁上方顯示今天日期
- 進度條（1/3 → 2/3 → 3/3）
- 引導語依難度不同：
  - 初階：「今天有什麼讓你心存感謝的事？可以是很小的事。」
  - 進階：「這件事的哪個部分讓你感到感謝？它對你的意義是什麼？」
- 文字輸入框（單行或多行）
- 第三頁加「完成三件感恩」按鈕

【第五頁 — 摘要 + 儲存】
- 條列三則感恩內容
- AI 摘要區塊（呼叫 Supabase Edge Function，input: 三則感恩文字，output: 一段溫暖摘要；Edge Function 需新建，呼叫 claude-sonnet-4-6）
- AI 摘要 loading 時顯示骨架屏
- 「儲存並分享」按鈕：純前端用 html2canvas 或 dom-to-image 截圖生成 16:9 分享圖（需安裝套件）
- 「結束這次練習」按鈕 → 回第一頁

【第六頁 — 完成慶祝】
- 完成慶祝動畫（可用 CSS keyframes）
- PERMA 加分逐條展示：
  - 情緒力 +3：成功累積三次的正向情緒經驗！
  - 意義力 +1：感恩日記能幫助你發現自己真正重視的人事物，提升生活的意義感
  - 連結力 +3：進一步覺察自身的人際關係支持系統，更容易感受到身邊人或自己的支持
- 「分享給健心的好夥伴」預設勾選 toggle（控制是否 is_shared = true 儲存到 DB）
- 「收下，繼續加油」按鈕 → 跳轉 /app/community

DB 寫入在第六頁「收下，繼續加油」確認後執行（item_1/2/3 + is_shared + entry_date）。
現有 gratitude_entries 表已有 item_1、item_2、item_3、is_shared、entry_date、anon_name 欄位。
Supabase client 在 src/lib/supabase.ts。
現有設計系統：src/index.css。
```

---

> 使用方式：開新 session → 貼上對應 Step 的 prompt → Claude 會直接開始執行。
> 如果某個 Step 的細節有變動，在 prompt 裡直接修改後再貼。
