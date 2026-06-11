# 全面體檢報告（2026-06-12）

> 本次對 PSY by PSY 進行了完整的程式碼審查 + 實機測試：本機同時啟動 FastAPI 後端與
> Vite 前端，建立臨時測試帳號實際走完「登入 → InMind 測驗 → 首頁 → 感恩日記
> 全流程 → 社群 → 個人頁」，並比對正式 Supabase 資料庫的實際 schema。
> 測試帳號與其產生的所有資料已於測試後從正式資料庫刪除。

---

## 一、已修復的 Bug（本次 commit 內含）

### 🔴 1. InMind 測驗結果從未存進資料庫（最嚴重）
- **位置**：`app.py` `/api/report`
- **現象**：LLM 評分帶 0.1 小數（如 4.3），但 `perma_scores.p_score` 等欄位是
  `int`，Postgres 直接以 `22P02 invalid input syntax for type integer` 拒絕，
  後端只默默記 log、照樣回 200。
- **後果**：使用者看得到報告，但**整筆測驗結果遺失**。又因為 `/app/home` 的
  `beforeLoad` 查不到 `perma_scores` 就導回 `/onboarding`，使用者會
  **永遠卡在「重新測驗」迴圈**。實測 100% 重現。
- **修復**：寫入 int 欄位前四捨五入（夾在 1–5），完整浮點分數仍保留在
  `report_json.scores`；插入失敗改記 error 級 log。已實測：報告產生 → DB 有資料
  → 回首頁不再被踢回測驗。

### 🔴 2. 「實名/匿名分享」開關是裝飾品（隱私問題）
- **位置**：`src/routes/app.gratitude.tsx`
- **現象**：日記在 SUMMARY → CELEBRATE 之間就已寫入 DB（含真實姓名），CELEBRATE
  頁的開關只改前端 state，**切到匿名後 DB 裡仍是真實姓名、照樣公開在社群牆**。
  實測證實：UI 顯示「以能量代號匿名出現」，DB 仍為 `anon_name: "本名",
  use_real_name: true`。
- **修復**：切換開關時同步 UPDATE 該筆 `gratitude_entries`（實名 → 撈 profile
  名稱；匿名 → 重抽能量代號）。已實測雙向切換，DB 即時跟著變。

### 🟠 3. 社群貼文的感恩對象標籤永遠不顯示
- **位置**：`src/routes/app.community.tsx`
- **現象**：feed 從不存在的 `gratitude_item_tags` 資料表撈標籤（正式庫回 404），
  但儲存時標籤其實寫在 `gratitude_entries.target_1~3`。標籤功能等於從未上線，
  且每次進社群多打一次必失敗的請求。
- **修復**：移除 `gratitude_item_tags` 查詢，標籤直接由貼文的 `target_1~3`
  產生（同類別去重）。已實測：feed 卡片現在會顯示「👥 身邊他人 / 🙋 自己 /
  🌳 環境 / ✨ 體驗」標籤。

### 🟠 4. 後端安全性
- `/api/perma`：原本**不驗證身分、user_id 由 client 自由指定**，任何人可替任意
  使用者塞分數（違反 SPEC 第 13 節）。已改為從 Authorization token 取 user_id。
- `/api/extract-keywords`：原本完全不需登入，公開網址可被刷 Claude API 額度。
  已加上登入驗證。

### 🟡 5. 社群 feed 不支援照片頭像
- `EntryCard` 沒處理 `photoUrl`（`DailyModal` 有），上傳照片頭像的使用者在
  feed 上會變一顆空白圈。已補上與 Modal 一致的 `<img>` 分支。

### 🟡 6. onboarding 寫入不存在的 `inmind_sessions` 表
- 每次看完報告就對不存在的表 insert 一次（404 fire-and-forget）。已移除死碼。

### 🟡 7. 其他
- `VoiceInput` 的 API base fallback 原是空字串（本機 dev 會 404），統一改為
  `http://localhost:8000`，與其他 API 呼叫一致。
- 修掉全部 ESLint error（unused 參數、全形空白）與 React hook 依賴警告。
  `tsc -b`、`eslint`、`vite build` 全數通過。
- `.gitignore` 加入 `__pycache__/`。
- `supabase/schema.sql` 補記正式庫已存在的 `comments.parent_id` 欄位。

---

## 二、需要你動手的事（程式碼修不了）

### 🔴 A. Email OTP 登入在正式環境根本寄不出信
實測對 Supabase `/auth/v1/otp` 發送驗證碼，回傳
`500 "Error sending confirmation email"`。**新使用者用 Email 完全無法註冊**，
畫面上只會看到「寄送失敗，請確認 email 後再試一次」。
Supabase 內建 SMTP 只寄給專案團隊成員信箱，正式上線必須到
**Dashboard → Authentication → SMTP Settings 設定自訂 SMTP**（如 Resend、
AWS SES、Gmail SMTP）。

### 🔴 B. 正式資料庫缺 `profiles.current_streak` 欄位
`supabase/schema.sql` 裡有這個欄位，但顯然沒在正式庫執行過。實測後果：
- 每次完成感恩日記後的連續天數寫入都失敗（400）
- 社群 feed 的「🔥 連續 N 天」永遠不顯示
- 每次載入社群多 2 個失敗請求後才 fallback

**處理方式**：到 Supabase Dashboard → SQL Editor，把
`supabase/schema.sql` 整份貼上執行一次（已設計成可重複執行，不會弄壞現有資料）。
執行後上述三個問題自動消失（前端已寫好 fallback 與正式路徑）。

---

## 三、實測驗證過、確認正常的部分

| 流程 | 結果 |
|---|---|
| 登入頁渲染、Email/驗證碼兩段式 UI | ✅ |
| 未登入訪問 `/app/*` → 導回 `/login` | ✅ |
| 新帳號首次進入 → 自動建 profile → 導向 `/onboarding` | ✅ |
| InMind 五題敘事問卷（字數門檻、進度條、引導提示） | ✅ |
| `/api/report` LLM 評分 + 報告渲染（總分、體型、名人配對、雷達圖） | ✅ |
| 修復後：perma_scores 正確落地、回首頁不再迴圈 | ✅ |
| 感恩日記 INTRO → WRITING（3 卡輪流啟用、圓形進度、修改日期 sheet） | ✅ |
| SUMMARY：安安回饋 + 行動建議（Claude 即時生成） | ✅ |
| 儲存：`target_1~3`、`ai_feedback`、`entry_date` 正確寫入 | ✅ |
| CELEBRATE：今日完成數、連續天數、PERMA 加分動畫、感恩對象圓餅 | ✅ |
| 修復後：實名/匿名開關雙向同步 DB | ✅ |
| 社群：每日彈窗、feed 無限捲動、按讚、留言、巢狀回覆（`parent_id` 正式庫存在） | ✅ |
| 修復後：feed 顯示感恩對象標籤 | ✅ |
| 個人頁：統計三格、健心日曆（含日記 Modal + 安安回饋）、雷達圖、感恩地圖 | ✅ |
| 「觀看最近一次測驗結果」由 `report_json` 完整重現報告 | ✅ |
| `tsc`、`eslint`、`vite build` | ✅ 全綠 |

---

## 四、建議後續改善（未動手，按優先序）

1. **`likes`/`comments` 表對未登入者完全公開可讀**（`USING (true)`）：
   anon key 就能撈全部留言。建議改成 `auth.uid() IS NOT NULL`。
2. **留言的愛心是純前端 state**（`commentLikes`），重新整理就歸零，
   使用者會以為按讚不見了。建議做成 DB 表或先拿掉。
3. **CORS `allow_origins=["*"]`**：上線後建議鎖定 Vercel 網域。
4. **`/api/transcribe` 無登入驗證**（只有 IP rate limit），語音轉文字燒的是
   OpenAI 額度，建議比照其他端點加 token 驗證。
5. **bundle 偏大**（主 JS 805KB / gzip 252KB）：PostHog、html2canvas、
   html-to-image 都進了主包，可用 dynamic import 切開。
6. 個人頁有一段「上次測驗結果」overlay 死碼（`showPrevious` 沒有任何入口），
   可清掉或補入口。
7. 連續天數有兩套計算（前端多處 + `profiles.current_streak`），建議統一成
   一個 util 或 DB view。
8. 舊貼文沒有 `target_1~3`（標籤功能上線前的資料），如想補標可寫一次性
   backfill script 呼叫 `/api/tag-gratitude-targets`。

---

## 五、測試方法附記

- 測試帳號 `claude.qa.tester.0612@gmail.com` 由 service role admin API 建立
  （因 Email OTP 寄信壞掉、Google OAuth 無法自動化），測試完成後已連同
  其 profile / perma_scores / gratitude_entries / likes / comments
  一併從正式資料庫刪除（cascade 驗證為空）。
- 本次共呼叫正式 Claude API 4 次（2 次報告評分、1 次感恩回饋、1 次標籤），
  皆為功能驗證所需。
