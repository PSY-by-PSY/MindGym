# PSY by PSY × PostHog 行為分析使用手冊

> 這份手冊教你：登入 PostHog 後台、看懂使用者行為數據、做出主管想要的分析報告。
> 完全不用寫程式，照著點就會。

---

## 目錄

1. [這個工具在做什麼](#1-這個工具在做什麼)
2. [登入後台](#2-登入後台)
3. [我們追蹤了哪些行為](#3-我們追蹤了哪些行為)
4. [最常用的 5 種分析](#4-最常用的-5-種分析)
5. [做一份給主管的儀表板](#5-做一份給主管的儀表板)
6. [常見問題](#6-常見問題)

---

## 1. 這個工具在做什麼

每當使用者在 App 裡做一件事（登入、做測驗、寫感恩日記、點某個模組），
App 會偷偷送一筆紀錄到 PostHog。PostHog 把這些紀錄整理成圖表，讓你能回答：

- 今天有幾個人用 App？
- 大家最常用哪個功能？
- 多少人「做完測驗」後，真的「開始寫日記」？
- 哪一步流失最多人？

**重要觀念：資料是即時累積的。** 從今天部署後才開始記錄，過去的行為沒有資料。
所以越早上線，累積越多，分析越準。

---

## 2. 登入後台

1. 打開網址：**https://us.posthog.com**
2. 用你註冊 PostHog 的帳號登入
3. 左上角確認專案是 **PSY by PSY**（Project ID：`466067`）

> 如果主管也要看，請在後台左下角 **Settings → Members** 邀請他的 email，
> 不要把你的帳號密碼給別人。

---

## 3. 我們追蹤了哪些行為

App 目前會自動記錄以下事件。你在後台 **Activity**（活動）頁就能看到它們即時跳出來：

| 事件名稱 | 中文意思 | 額外記錄的資訊 |
|---|---|---|
| `$pageview` | 看了某個頁面 | 哪一頁（網址） |
| `login_completed` | 完成登入 | 登入方式 |
| `quiz_started` | 開始心理測驗 | 是否為重新測驗 |
| `quiz_completed` | 完成心理測驗 | 總分、體質類型 |
| `gratitude_started` | 開始寫感恩日記 | 難度（基礎／進階） |
| `gratitude_completed` | 寫完感恩日記 | 難度、連續天數 |
| `module_opened` | 點開訓練模組 | 模組名稱 |

> 每一筆事件都綁定到「是哪個使用者」做的（用登入後的帳號 ID），
> 所以你可以追蹤單一使用者的完整足跡。

---

## 4. 最常用的 5 種分析

後台左側選單會用到 **Insights（洞察）**、**Funnels（漏斗）**、**Trends（趨勢）**。

### ① 每天有多少人用 App（活躍使用者）

1. 左側點 **Product analytics → New insight → Trends**
2. 「Series」選事件 `$pageview`
3. 右上角把計算方式從 `Total count` 改成 **`Unique users`**（不重複人數）
4. 時間範圍選 **Last 30 days**
   → 得到一條「每天有幾個人開 App」的折線圖

### ② 哪個功能最受歡迎

1. 新增一個 **Trends** 洞察
2. Series 同時加入多個事件：`quiz_started`、`gratitude_started`、`module_opened`
3. 圖表類型選 **Bar chart（長條圖）**
   → 一眼看出哪個功能被點最多次

### ③ 測驗完成率（漏斗分析）★主管最愛

1. 左側點 **Funnels（漏斗）→ New funnel**
2. 依序加入兩個步驟：
   - 第一步：`quiz_started`
   - 第二步：`quiz_completed`
3. 它會告訴你：「100 人開始測驗，68 人完成，完成率 68%」
   → 數字太低就代表測驗太長或有 bug，是很好的改善依據

你也可以做更長的漏斗，看「**登入 → 測驗 → 寫日記**」整段轉換：
`login_completed` → `quiz_completed` → `gratitude_completed`

### ④ 回訪率（使用者會不會回來）

1. 左側點 **Retention（留存）**
2. 「First event」選 `login_completed`，「Returning event」選 `$pageview`
   → 得到一張表：第一次登入後，第 1 天、第 7 天還有多少 % 的人回來

### ⑤ 單一使用者在做什麼

1. 左側點 **People（人物）**
2. 點任一個使用者，會看到他的 email 和「**完整行為時間軸**」
   → 適合客服或想了解某個人卡在哪一步時使用

---

## 5. 做一份給主管的儀表板

把上面幾張圖整合成一頁，主管打開就能看全貌：

1. 做好上面 ①②③ 三張 Insight，每張右上角點 **Save**
2. 左側點 **Dashboards → New dashboard**，命名為「主管週報」
3. 點 **Add insight**，把剛剛存好的圖加進來
4. 把網址傳給主管，或在 Dashboard 右上 **Share** 設定公開連結

> 進階：Dashboard 可設定 **Subscribe（訂閱）**，讓 PostHog 每週一自動寄一封
> 數據 email 給你和主管，完全不用手動。

---

## 6. 常見問題

**Q：我剛部署完，後台都沒資料？**
A：先自己用 App 操作幾下（登入、做測驗）。到後台 **Activity** 頁，
正常會在幾秒～1 分鐘內看到事件跳出來。若完全沒有，看下方排除步驟。

**Q：怎麼確認追蹤有正常運作？**
A：用電腦瀏覽器打開 App → 按 F12 開啟開發者工具 → 切到 **Network（網路）**
分頁 → 隨便操作 → 看到很多送往 `us.i.posthog.com` 的請求（狀態 200）就代表正常。

**Q：開發時我自己的測試會不會污染數據？**
A：會。正式分析前，可以在後台用 filter 排除自己，或在
**Settings → Project → Filter out internal users** 設定排除規則。

**Q：想新增追蹤一個新按鈕怎麼辦？**
A：這需要改一行程式碼。跟工程師說「我要追蹤 XX 行為」，
他在 `src/lib/analytics.ts` 加一個事件名稱，再到對應頁面呼叫 `track()` 即可。
所有追蹤程式都集中在 `src/lib/analytics.ts` 這個檔案，很好找。

**Q：資料安全嗎？會被別人看到嗎？**
A：只有被你邀請進專案的人能看後台。App 裡用的是「可公開的 write-only token」，
它只能「寫入」資料、不能「讀取」，就算被看到也無法偷資料。

---

## 給工程師的技術備註

- 整合程式集中在 [`src/lib/analytics.ts`](src/lib/analytics.ts)
- 初始化、換頁追蹤、使用者身分綁定在 [`src/main.tsx`](src/main.tsx)
- Project token 已內建為 fallback；若要改用環境變數，在 Vercel 設定
  `VITE_POSTHOG_KEY` 與 `VITE_POSTHOG_HOST`（US Cloud 為 `https://us.i.posthog.com`）
- 區域：US Cloud｜Project ID：466067
