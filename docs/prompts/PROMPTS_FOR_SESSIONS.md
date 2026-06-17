# Session Prompts — 0526_to_0529

每个 session 直接复制对应的 prompt，完成后 `git add . && git commit -m "..."` 并 push。

---

## 批次一：UI 文字/按鈕改動

### Session 1 — Step D1: 選單改名 InMind

```
修改文件：src/routes/app.tsx 的 TopHeader 組件
任务：Top header 中间的 Logo 文字从「MindGym」改成「InMind」。
位置：约 L35-36，找到 <span className="text-sm font-extrabold...">MindGym</span>，改成 InMind

完成后提交：
git add . && git commit -m "chore: 改 TopHeader logo 文字 MindGym → InMind"
git push
```

---

### Session 2 — Step D2: IG 連結

```
修改文件：src/routes/app.tsx 的 Side Drawer 部分
任务：
1. 找到「IG 追蹤我們」的 DrawerExternalLink（约 L102-106）
2. 改 href="#" → href="https://www.instagram.com/psy_by_psy/"
3. 移除 note="即將開放" 這個 prop

完成后提交：
git add . && git commit -m "feat: 加 IG 追蹤連結 (https://www.instagram.com/psy_by_psy/)"
git push
```

---

### Session 3 — Step A2: SummaryStage 移除「結束這次練習」

```
修改文件：src/routes/app.gratitude.tsx 的 SummaryStage 組件
任务：
1. 找到 SummaryStage 組件最下方的三個按鈕區塊（約 L842-858）
2. 刪除第三個按鈕：
   <button onClick={onRestart} className="h-12 w-full...">
     結束這次練習
   </button>
3. 保留「分享」（原「儲存並分享」，這裡先保留舊文字，會在 A3 改）和「下一步：完成這次練習」兩個按鈕

完成后提交：
git add . && git commit -m "refactor: SummaryStage 移除『結束這次練習』按鈕"
git push
```

---

### Session 4 — Step A4: CelebrateStage 按鈕調整

```
修改文件：src/routes/app.gratitude.tsx 的 CelebrateStage 組件
任务：
1. 找到 CelebrateStage 組件的按鈕區塊（約 L1253-1276）
2. 修改第一個按鈕：
   - 文字「💬 點擊留言」改成「✅ 結束今天練習」
   - onClick={() => handleNavigate('comment')} 改成 onClick={() => handleNavigate('wall')}
3. 刪除第二個按鈕「📖 查看更多」（整個 <button> 刪掉）
4. 刪除第三個按鈕「✕ 關閉」（整個 <button> 刪掉）
5. 最終只剩一個按鈕「結束今天練習」

完成后提交：
git add . && git commit -m "refactor: CelebrateStage 按鈕調整 - 點擊留言→結束今天練習，移除查看更多和關閉"
git push
```

---

### Session 5 — Step B1: 首頁三件好事鎖起來

```
修改文件：src/routes/app.home.tsx
任务：
1. 找到 GridTile 函數（約 L191-216），和 modules 陣列（約 L59-107）
2. 在 modules 陣列中，「三件好事」那筆（index 0）的 to 改成 null（或移除，改成 disabled）
3. 改 GridTile 的渲染邏輯：
   - 「三件好事」不用 <Link>，改用 <div>
   - 加 className: "grayscale opacity-50 cursor-not-allowed"
   - 加一個小標籤，如 <span className="absolute right-3 top-3 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">🔒 敬請期待</span>
   - 點擊無反應（移除 Link 的所有行為）
4. 參考進階練習卡片的禁用樣式做法

完成后提交：
git add . && git commit -m "refactor: 首頁三件好事禁用（灰底 + 鎖頭 + 不可點擊）"
git push
```

---

## 批次二：邏輯 + 版面中等難度

### Session 6 — Step C3: 個人頁名字無法修改 bug fix

```
修改文件：src/routes/app.profile.tsx
任务：
調查並修復「名字無法修改」的 bug
1. 打開個人頁，嘗試修改名字欄位
2. 檢查：
   - 名字欄位是否 readOnly 或 disabled（L1-100 的 ProfileForm 或類似）
   - 儲存時是否有正確更新 profiles.name 到 Supabase
   - 頁面 loader 是否正確帶入初始值
3. 根據發現修復：
   - 若欄位被禁用，移除 readOnly 或 disabled
   - 若儲存邏輯有問題，補上或修復
4. 完成後在瀏覽器測試：修改名字 → 儲存 → 重新整理頁面 → 名字應該更新

完成后提交：
git add . && git commit -m "fix: 個人頁名字欄位可修改"
git push
```

---

### Session 7 — Step A5: 資料存取時機調整

```
修改文件：src/routes/app.gratitude.tsx 的 GratitudePage 函數
任务（較複雜，分步驟）：
1. 提取 saveEntry() 函數：
   - 把 handleFinalSave 內的存 DB 邏輯（L200-256）提出成獨立的 async saveEntry()
   - 接收 items, summaryResult, tags, isShared 參數
   - 返回 entryId
2. 修改 SummaryStage 的 onContinue：
   - 改成：await saveEntry() → setStage('CELEBRATE')
   - 這樣進入 CELEBRATE 時資料已存完
3. 修改 CelebrateStage 的 onNavigate：
   - 移除存 DB 邏輯，只做 navigate
   - 若已有 savedEntryId，直接 navigate
4. 確保 setSavedEntryId 在適當時機更新

完成后提交：
git add . && git commit -m "refactor: 資料存取時機 - 改成按『下一步』時存（而非 Celebrate）"
git push
```

---

### Session 8 — Step A1: 感恩日記 INTRO 版面重構

```
修改文件：src/routes/app.gratitude.tsx 的 IntroStage 組件
任务（較複雜，含多個子任務）：
1. 修改難度預設值：
   - L147，setDifficulty('advanced') 改成 setDifficulty('basic')
2. 刪除舊描述文字（L346-366）：
   - 刪除整個 3-C 描述文字 div，包括 expanded logic
3. 加入新的兩區塊結構：
   區塊一（常駐）：
   <div className="mt-5 text-sm leading-relaxed text-foreground/80">
     感恩日記（Gratitude Journal）是正向心理學中最具代表性的練習之一，透過每天有意識地回顧值得感謝的事件，幫助大腦重新聚焦於生活中的支持、善意與美好經驗。
   </div>

   區塊二（展開式，預設收合）：
   - 使用 useState(false) 控制展開/收合
   - 展開後顯示：核心目標、練前準備、不建議練習時刻、研究支持（含文獻）
   - 可參考既有的 expanded state 邏輯
4. 測試：打開感恩日記 INTRO 頁，確認：
   - 難度預設為「初階」
   - 描述文字換成新內容
   - 有「查看更多」按鈕，點擊後展開/收合

完成后提交：
git add . && git commit -m "refactor: 感恩日記 INTRO 版面重構 + 難度改初階"
git push
```

---

### Session 9 — Step A3: ShareCard 升級 + Web Share API

```
修改文件：src/routes/app.gratitude.tsx 的 ShareCard 和 SummaryStage
任务（含 UI + 邏輯）：
1. SummaryStage 按鈕：
   - L843 的「儲存並分享」改成「分享」
2. ShareCard 加 PSYbyPSY logo：
   - 在 ShareCard 的 JSX 最下方加：
     <img src="/assets/psy-by-psy-logo.png" alt="PSYbyPSY" style={{ height: 40, marginTop: 20 }} />
3. ShareCard 分離 action_suggestion：
   - 現在 summary 是合併字串，需把 action_suggestion 單獨顯示
   - 改 ShareCard props：傳 { emotional_summary, action_suggestion } 而非 summary string
   - 在 ShareCard 內分開渲染：emotional_summary 在上，action_suggestion 在「行動建議」區塊
4. handleShare 改用 Web Share API：
   - 嘗試 navigator.share() 分享圖片
   - fallback 到現有的下載邏輯
   例：
   ```javascript
   const imageBlob = await fetch(dataUrl).then(r => r.blob());
   if (navigator.share && navigator.canShare({ files: [new File([imageBlob], 'gratitude.png')] })) {
     await navigator.share({ files: [new File([imageBlob], 'gratitude.png')] });
   } else {
     // fallback to download
   }
   ```
5. 測試：
   - 完成感恩練習
   - 點「分享」，若瀏覽器支援會彈分享選單（Line、IG 等）
   - 若不支援，fallback 到下載圖片

完成后提交：
git add . && git commit -m "feat: ShareCard 加 PSYbyPSY logo + Web Share API"
git push
```

---

### Session 10 — Step C2: 頭像選單改成底部 bottom sheet

```
修改文件：src/routes/app.profile.tsx 的頭像選取 UI 部分
任务：
1. 找到頭像選取相關的 modal/UI 代碼
2. 改成 bottom sheet 樣式：
   - 從螢幕底部向上滑入（使用 fixed + transform）
   - 半透明深色遮罩背景
   - 點遮罩可關閉
3. 樣式參考 app.gratitude.tsx 的 showInfoModal（L1279-1307）
4. 測試：
   - 個人頁點頭像
   - 選單應該從底部向上滑出，而非跳出
   - 點外面可關閉

完成后提交：
git add . && git commit -m "refactor: 頭像選單改成底部 bottom sheet"
git push
```

---

## 批次三：新功能邏輯

### Session 11 — Step C1: 個人頁雷達圖加分數 + 觀看上次測驗

```
修改文件：src/routes/app.profile.tsx 的雷達圖相關區塊
任务（含複雜查詢邏輯）：
1. 雷達圖加分數：
   - 在雷達圖旁邊或圖表標題中顯示 P/E/R/M/A 各維度的數值
   - 例如在雷達圖頂部加文字「P: 65 E: 72 R: 58 M: 80 A: 75」
2. 「觀看上次測驗結果」按鈕：
   - 在「重新評估」按鈕上方加一個新按鈕
   - 邏輯：查 perma_scores 的倒數第二筆（limit 2, order created_at desc，然後取第二個）
   - 若少於 2 筆測驗記錄，隱藏此按鈕
   - 點擊後顯示上次測驗的雷達圖 modal 或展開區塊
3. 改 loader 邏輯：
   - 改成 limit(2) 抓最近兩筆測驗
   - 把兩筆都帶到組件
4. 測試：
   - 若有至少 2 次測驗，應該看到「觀看上次測驗結果」按鈕
   - 點擊後顯示上次測驗的雷達圖

完成后提交：
git add . && git commit -m "feat: 個人頁雷達圖加分數 + 觀看上次測驗按鈕"
git push
```

---

### Session 12 — Step A6: 補打卡功能

```
修改文件：src/routes/app.gratitude.tsx 的 WritingStage 和 GratitudePage
任务（較複雜，含日期管理 + state 提升）：
1. WritingStage 加日期修改功能：
   - 在日期顯示旁邊加「修改日期」小按鈕
   - 點擊後彈出 bottom sheet，列出今天和昨天兩個選項
   - 使用 useState(todayDate()) 管理 selectedDate
2. State 提升：
   - selectedDate 從 WritingStage 提升到 GratitudePage
   - 改 WritingStage 的 props 傳入 selectedDate 和 onSelectDate
3. 存檔時用 selectedDate：
   - 在 saveEntry() 內用 isoDate(selectedDate) 而非 isoDate(todayDate())
4. Streak 重算：
   - saveEntry() 完成後，呼叫 loadStreak() 重新計算
   - 更新 CELEBRATE stage 的 streak 顯示
5. 測試：
   - 開感恩練習
   - 點「修改日期」，選昨天
   - 寫完三件感恩，完成練習
   - 檢查 DB：gratitude_entries 該筆記錄的 entry_date 應是昨天
   - 若昨天沒打卡，streak 應加 1

完成后提交：
git add . && git commit -m "feat: 補打卡功能 - 修改日期 + streak 重算"
git push
```

---

### Session 13 — Step E1: 社群觸發 Modal

```
修改文件：src/routes/app.community.tsx 和 src/routes/app.gratitude.tsx
任务（需要跨組件邏輯 + localStorage）：
1. 完成練習後觸發（CelebrateStage → Community）：
   - 在 GratitudePage 的 handleFinalSave 或 navigation 時，帶上 URL search param
   - 例：navigate({ to: '/app/community', search: { showEntry: 1 } })
2. 每日首次進入社群觸發：
   - 在 community 組件 mount 時檢查 localStorage
   - key: 'community_last_shown'，value: 'YYYY-MM-DD'
   - 若不是今天，就觸發並更新 localStorage
3. Community 頁加 welcomeEntry modal：
   - 查詢一筆隨機的 gratitude_entries（is_shared=true 且 user_id != 自己）
   - 顯示在 modal 內，包含使用者名字、三件感恩內容、時間戳
4. 關閉 modal：
   - 點遮罩或「關閉」按鈕直接關閉，停在社群頁面
5. 測試：
   - 完成感恩練習，應立即看到別人的日記 modal
   - 關閉後停在社群頁
   - 隔天重新進入社群，應再看到一則別人的日記（不是同一則）
   - 同天重複進入社群，不應再彈 modal

完成后提交：
git add . && git commit -m "feat: 社群觸發 - 完成練習後及每日首次進入彈出別人的感恩日記"
git push
```

---

## 提交訊息範例

所有 commit message 格式：
- `feat:` — 新功能
- `refactor:` — 程式碼重構/邏輯調整
- `fix:` — bug 修復
- `chore:` — 配置、文字等小改動

例：
```bash
git add .
git commit -m "feat: 補打卡功能"
git push
```
