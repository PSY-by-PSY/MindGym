# MindGym APP 新版設計 — 更新計畫

> 根據 UI/UX 設計草案（2026-05-19）拆分成以下步驟，每個 Step 可獨立完成並測試。
> ✅ = 已確認  ⚠️ = 仍需確認

---

## Step 1 — 固定框架：頂部 Header Bar
**影響檔案：** `src/routes/app.tsx`

- ✅ 在 AppShell 新增頂部固定 header（高度約 56px，固定在頁面頂端）
- ✅ 中間：MindGym logo 文字
- ✅ 右側三個 icon：搜尋、漢堡選單、通知（通知先做靜態 icon，無功能）
- ✅ 漢堡選單 → side drawer，包含：
  - 測驗（連到 `/onboarding`）
  - PSYbyPSY 社群（連結先空著，placeholder）
  - IG 連結（連結先空著，placeholder）
  - 個人資料編輯（跳轉到 `/app/profile`）
- ✅ 底部 tab 第一個保持「訓練中心」（不改名）
- `main` 的 `pt` 要加上 header 高度，避免內容被遮住

---

## Step 2 — 首頁重構：上段練習菜單（圖一格狀樣式）
**影響檔案：** `src/routes/app.home.tsx`

目前：直向清單卡片 → 改成：橫向/格狀圖示菜單，下方標注所屬 PERMA 維度

五個練習及所屬 PERMA 標籤（⚠️ 請確認以下 PERMA 對應是否正確）：

| 練習 | PERMA 標籤 |
|------|-----------|
| 三件好事 | P 正向情緒 |
| 感恩日記 | P 情緒力、R 連結力、M 意義力 |
| 自我慈悲 | E 全心投入 |
| 過程目標覺察 | M 意義力、A 成就感 |
| 正念冥想 | E 全心投入 |

---

## Step 3 — 首頁重構：中段感恩日記快速啟動 Bar
**影響檔案：** `src/routes/app.home.tsx`

- ✅ 在圖示菜單下方加一個橫幅卡片
- 文字：「感恩日記練習」副標：「點擊直接開始今日練習」
- 點擊跳轉 `/app/gratitude`

---

## Step 4 — 首頁重構：下段訓練中心
**影響檔案：** `src/routes/app.home.tsx`

分四個子區塊，有區塊標題：

1. **我的菜單（我的日程）**
   - ✅ 先做 UI 佔位，顯示「日程一、二、三」三個假卡片（可點擊）
   - 其他項目顯示 locked（灰色 + 鎖頭 icon + 「即將開放」標籤）
2. **最新上架** — 整塊 locked，顯示「敬請期待」
3. **最熱門** — 顯示感恩日記練習卡片，可點入 `/app/gratitude`
4. **PERMA 練習菜單** — 以 PERMA 五維為分類，每個維度列出對應練習（圖二樣式）

---

## Step 5 — 社群：每日首次訪問 Popup
**影響檔案：** `src/routes/app.community.tsx`

- ✅ 用 `localStorage` 記錄最後訪問日期（key: `community_last_visited`）
- 每天第一次進入社群頁面，跳出 modal
- Modal 顯示第一則他人公開感恩日記內容
- 提示文字：「請給對方一些回饋吧 💬」
- 按鈕：「先看看」（關閉）、「去留言」（關閉 + scroll 到該則日記）

---

## Step 6 — 社群：Like 按鈕 + 匿名留言
**影響檔案：** `src/routes/app.community.tsx`
**DB：** 需新增兩個 Supabase 表格

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

UI 更改：
- 每則日記卡片底部加愛心按鈕（toggle，顯示數量）
- 展開留言區域（點擊後顯示現有留言 + 輸入框）
- 留言以匿名暱稱顯示

---

## Step 7 — 社群：重整鍵 + AI 關鍵詞標籤
**影響檔案：** `src/routes/app.community.tsx`

- ✅ 重整鍵：點擊後重新 fetch 一批不同的公開日記
- AI 標籤：每則日記顯示 2-3 個關鍵詞小標籤
  - ✅ 需新建 Edge Function（呼叫 Claude API 抽取關鍵詞）
  - 四個類別：感受（粉色）、事件（藍色）、對象（橙色）、其他（灰色）
  - ✅ 先用現有配色系統，待主色調確定後再調整

---

## Step 8 — 社群：文字雲（Word Cloud）
**影響檔案：** `src/routes/app.community.tsx`，新增 Supabase Edge Function

- 顯示一週內公開貼文的高頻關鍵字，以大小代表頻率
- 四個類別各有顏色（待主色調確定後調整）
- ✅ 先用現有配色
- 每週一次 reset，資料累積方式：Edge Function 定時跑 or 每次 reload 時計算
- ⚠️ 確認：文字雲用 SVG 純前端渲染，還是需要後端生成圖片？

---

## Step 9 — 個人頁：健心紀錄日曆
**影響檔案：** `src/routes/app.profile.tsx`

- ✅ 以月份 grid 顯示日曆
- 有練習打卡的日期顯示高亮標記（小點）
- 點擊日期 → 展開當天練習清單（例如「感恩日記」「三件好事」）
- 點擊「感恩日記」項目 → 跳出 modal 顯示當天三則感恩日記內容
- 資料來源：`gratitude_entries` 表的 `entry_date` 欄位

> ✅ 感謝對象比例圖：這次跳過，之後再規劃

---

## Step 10 — 感恩日記重構：第一頁（說明 + 難度選擇）
**影響檔案：** `src/routes/app.gratitude.tsx`

- PERMA 指數預覽 + 完成後加分：「情緒力 +3、連結力 +3、意義力 +1」
- 感恩日記說明文字
- 難度選擇：初階 / 進階（✅ 引導語不同，建議內容如下）
  - **初階**：簡短描述感謝的人事物，不需要太多解釋，寫下來就好
  - **進階**：深入探討為什麼感謝、這件事如何影響你、你從中發現了什麼
  - ⚠️ 請確認以上引導語是否符合設計意圖，或提供正確文字
- 「開始練習」按鈕

---

## Step 11 — 感恩日記重構：第二至四頁（引導輸入）
**影響檔案：** `src/routes/app.gratitude.tsx`

三頁結構（感恩一、二、三），每頁：
- 顯示今天日期
- 引導語（✅ 依難度不同）
  - **初階引導語（建議）：**「今天有什麼讓你心存感謝的事？可以是很小的事。」
  - **進階引導語（建議）：**「這件事的哪個部分讓你感到感謝？它對你的意義是什麼？」
  - ⚠️ 請確認或修改以上引導語
- 文字輸入框（感恩框架）
- 進度條（1/3 → 2/3 → 3/3）
- 第三頁加「完成三件感恩」按鈕

---

## Step 12 — 感恩日記重構：第五頁（摘要 + 儲存）
**影響檔案：** `src/routes/app.gratitude.tsx`
**需新建：** AI 摘要 Edge Function

- 條列三則感恩內容
- AI 摘要（✅ 需新建 Edge Function，呼叫 Claude API 生成一段溫暖的摘要文字）
- 「儲存」按鈕 → 生成分享圖（✅ 需新建，格式：16:9 IG 限時動態，純前端 canvas 截圖方案）
- 「結束這次練習」按鈕 → 回到第一頁

---

## Step 13 — 感恩日記重構：第六頁（完成慶祝）
**影響檔案：** `src/routes/app.gratitude.tsx`

- 完成慶祝畫面 + 激勵文字
- PERMA 加分展示動畫：
  - 情緒力 +3：成功累積三次的正向情緒經驗！
  - 意義力 +1：感恩日記能幫助你發現自己真正重視的人事物，提升生活的意義感
  - 連結力 +3：進一步覺察自身的人際關係支持系統，更容易感受到身邊人或自己的支持
- 「分享給健心的好夥伴」預設勾選 toggle（可取消）
- 「收下，繼續加油」按鈕 → 跳轉 `/app/community`，並觸發 Step 5 的每日 popup

---

## 執行順序建議

```
Step 1 (Header) → Step 2–4 (首頁) → Step 5 (社群 popup) → Step 6 (Like/留言)
→ Step 9 (日曆) → Step 10–13 (感恩日記) → Step 7–8 (社群 AI 功能)
```

後面幾個 Step 依賴 AI Edge Function，可以排在最後。

---

## ❓ 仍需確認的細節

| # | 問題 | 影響步驟 |
|---|------|---------|
| 1 | Step 2 的五個練習 PERMA 對應是否正確？ | Step 2 |
| 2 | 初階/進階的引導語文字是否符合你們的設定？ | Step 10–11 |
| 3 | PSYbyPSY 社群和 IG 的外部連結網址（之後補充） | Step 1 |
| 4 | 社群文字雲：純前端 SVG 渲染 vs 後端生成圖片？ | Step 8 |
| 5 | 個人頁日曆需要顯示哪些練習類型？（目前只有感恩日記有 entry_date，其他練習還沒有 DB 記錄） | Step 9 |
