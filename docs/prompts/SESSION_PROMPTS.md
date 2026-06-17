# 每個 Session 的 Prompt

根據 [0526_to_0529.md](0526_to_0529.md) 的執行計劃，每個 session 複製對應的 prompt。

---

## Session 1：D1 — 選單改名 InMind

```
根據 0526_to_0529.md 的 **Step D1** 要求：

修改 src/routes/app.tsx → TopHeader 組件
將 Top header 中間的 Logo 文字「MindGym」改成「InMind」

完成修改後請：
1. 在本機驗證改動正確（可選：npm run dev 簡單檢查）
2. git add 相關檔案
3. 建立 commit，訊息格式：feat: 選單改名 InMind
4. git push 到 main branch
```

---

## Session 2：D2 — IG 連結

```
根據 0526_to_0529.md 的 **Step D2** 要求：

修改 src/routes/app.tsx → Side Drawer 的 DrawerExternalLink 元件

變更「IG 追蹤我們」項目：
- 將 href="#" 改成 https://www.instagram.com/psy_by_psy/
- 移除 note="即將開放" 屬性

完成修改後請：
1. 在本機驗證改動正確
2. git add 相關檔案
3. 建立 commit，訊息格式：feat: 新增 IG 社群連結
4. git push 到 main branch
```

---

## Session 3：A2 — SummaryStage 移除「結束這次練習」按鈕

```
根據 0526_to_0529.md 的 **Step A2** 要求：

修改 src/routes/app.gratitude.tsx → SummaryStage 組件（約 L843–L859）

刪除最下方第三個按鈕：
- 找到 onClick={() => onRestart()} 的那個 <button>（文字「結束這次練習」）
- 將整個 <button> 標籤刪除

修改完成後只保留兩個按鈕：「分享」和「下一步：完成這次練習」

完成修改後請：
1. 在本機驗證改動正確（可選：npm run dev 檢查 SummaryStage 按鈕數量）
2. git add 相關檔案
3. 建立 commit，訊息格式：fix: 移除 SummaryStage 的「結束這次練習」按鈕
4. git push 到 main branch
```

---

## Session 4：A4 — CelebrateStage 按鈕調整

```
根據 0526_to_0529.md 的 **Step A4** 要求：

修改 src/routes/app.gratitude.tsx → CelebrateStage 組件（約 L1253–L1276）

調整三個按鈕：
1. 第一個按鈕：「💬 點擊留言」改成「✅ 結束今天練習」
   - onClick={() => handleNavigate('comment')} 改成 onClick={() => handleNavigate('wall')}
2. 第二個按鈕：「📖 查看更多」整個 <button> 刪除
3. 第三個按鈕：「✕ 關閉」整個 <button> 刪除

修改完成後只保留一個按鈕「結束今天練習」

完成修改後請：
1. 在本機驗證改動正確（可選：npm run dev 檢查 CelebrateStage 按鈕）
2. git add 相關檔案
3. 建立 commit，訊息格式：fix: CelebrateStage 按鈕調整（點擊留言→結束練習，刪查看更多和關閉）
4. git push 到 main branch
```

---

## Session 5：B1 — 首頁三件好事鎖起來

```
根據 0526_to_0529.md 的 **Step B1** 要求：

修改 src/routes/app.home.tsx → GridTile 組件 + modules 陣列

找到 modules 陣列中 name: '三件好事' 的那筆資料（index 0）

改法：
1. 在 HomePage 中，將 <GridTile {...modules[0]} /> 改成條件渲染：
   - 把該項目的渲染改成 <div>（不用 Link）
   - 套用樣式：grayscale opacity-50 cursor-not-allowed（同進階練習卡樣式）
   - 加上 🔒 鎖頭 badge（參考進階練習卡的「施工中」badge 做法）
   - 移除 onClick 導航邏輯

2. 或者另外開一個條件判斷，渲染一個鎖定版的 GridTile

完成修改後請：
1. 在本機驗證改動正確（可選：npm run dev 檢查首頁三件好事是否鎖定）
2. git add 相關檔案
3. 建立 commit，訊息格式：feat: 首頁三件好事鎖起來（灰底+鎖頭）
4. git push 到 main branch
```

---

## Session 6：C3 — 個人頁名字無法修改 bug fix

```
根據 0526_to_0529.md 的 **Step C3** 要求：

修改 src/routes/app.profile.tsx

問題：使用者無法修改個人頁的名字

調查方向：
1. 名字欄位是否被設成 readOnly 或 disabled
2. 儲存邏輯是否有正確 update profiles.name
3. 頁面 loader 是否正確帶入初始值

修復後確認：
- 名字欄位可編輯
- 點擊儲存後名字成功更新到 Supabase
- 重新整理頁面後新名字仍存在

完成修改後請：
1. 在本機驗證修復正確（建議 npm run dev 測試整個流程）
2. git add 相關檔案
3. 建立 commit，訊息格式：fix: 修復個人頁名字無法修改的 bug
4. git push 到 main branch
```

---

## Session 7：A5 — 資料存取時機調整

```
根據 0526_to_0529.md 的 **Step A5** 要求：

修改 src/routes/app.gratitude.tsx

目前邏輯：按下 CelebrateStage 的按鈕 → handleFinalSave → 存 DB → navigate
新邏輯：按下 SummaryStage 的「下一步」→ 存 DB → 進入 CELEBRATE（已存完）

實作步驟：
1. 把 handleFinalSave 的存 DB 邏輯提取成獨立的 saveEntry() async function
2. 在 SummaryStage 的 onContinue 回調改成：
   - 先呼叫 await saveEntry()，等待完成
   - 成功後才 setStage('CELEBRATE')
3. 簡化 CelebrateStage 的 onNavigate，移除 DB 存取邏輯，只做：
   - await router.invalidate()
   - navigate({ to: '/app/community' })

完成修改後請：
1. 在本機驗證修復正確（建議 npm run dev 完整走一遍流程，觀察資料何時存到 DB）
2. git add 相關檔案
3. 建立 commit，訊息格式：refactor: 感恩日記存取時機改到下一步時存
4. git push 到 main branch
```

---

## Session 8：A1 — 感恩日記 INTRO 版面重構

```
根據 0526_to_0529.md 的 **Step A1** 要求：

修改 src/routes/app.gratitude.tsx → IntroStage 組件

修改內容：
1. 刪除現有描述文字區塊（3-C 區塊，「停下來，把注意力放回…」那整段）

2. 改成兩個新區塊：
   - 區塊一（常駐）：「感恩日記（Gratitude Journal）是正向心理學中最具代表性的練習之一，透過每天有意識地回顧值得感謝的事件，幫助大腦重新聚焦於生活中的支持、善意與美好經驗。」
   - 區塊二（「查看更多」展開，預設收合）：包含核心目標、練前準備、不建議練習時刻、研究支持（含兩篇文獻引用）

3. default 難度改成：
   - 在 GratitudePage 的 useState<Difficulty>('advanced') 改成 useState<Difficulty>('basic')

完成修改後請：
1. 在本機驗證修改正確（npm run dev 檢查 INTRO 版面、展開功能、預設難度）
2. git add 相關檔案
3. 建立 commit，訊息格式：feat: 感恩日記 INTRO 版面重構 + 預設難度改初階
4. git push 到 main branch
```

---

## Session 9：A3 — ShareCard 升級 + Web Share API

```
根據 0526_to_0529.md 的 **Step A3** 要求：

修改 src/routes/app.gratitude.tsx → ShareCard 組件 + SummaryStage

修改內容：
1. **按鈕更名**：SummaryStage 的 CTA 文字「儲存並分享」改成「分享」

2. **ShareCard 加 PSYbyPSY logo**：
   - Logo 路徑：/assets/psy-by-psy-logo.png（public 資料夾）
   - 在 ShareCard JSX 中加入 <img> 標籤，放在分享圖片最下方
   - Logo 會被 toPng 渲染到分享圖中

3. **行動建議區塊獨立**：
   - 修改 fetchSummary 返回的數據格式（emotional_summary 和 action_suggestion 分開）
   - ShareCard 顯示時要將兩個部分分成兩個視覺區塊，action_suggestion 有獨立的標題「行動建議」

4. **分享方式升級**：改用 Web Share API
   - handleShare 先用 navigator.share({ files: [imageFile], title: '今天的感恩日記' })
   - fallback 到原有的下載方式（<a>.click()）

完成修改後請：
1. 在本機驗證修改正確（npm run dev 測試分享功能、logo 是否在圖中、web share 是否有出現）
2. git add 相關檔案
3. 建立 commit，訊息格式：feat: ShareCard 升級 - 加 PSYbyPSY logo + Web Share API
4. git push 到 main branch
```

---

## Session 10：C2 — 頭像選單改成底部 bottom sheet

```
根據 0526_to_0529.md 的 **Step C2** 要求：

修改 src/routes/app.profile.tsx

現狀：頭像點擊後的選擇菜單位置不佳
目標：改成 bottom sheet 樣式（從螢幕底部向上滑入）

實作：
1. 找到頭像選擇的 modal/UI 部分
2. 改成 bottom sheet 設計：
   - 背景遮罩（半透明） + 點擊遮罩可關閉
   - content 從螢幕底部滑入（animate-slide-up 或 CSS animation）
   - 頭像選項列表在 bottom sheet 中排列
3. 參考 CelebrateStage 的「?" 說明 Modal」（L1279–L1308）做法

完成修改後請：
1. 在本機驗證修改正確（npm run dev 檢查頭像選單位置與滑動動畫）
2. git add 相關檔案
3. 建立 commit，訊息格式：feat: 個人頁頭像選單改成底部 bottom sheet 滑出
4. git push 到 main branch
```

---

## Session 11：C1 — 個人頁雷達圖加分數 + 上次測驗按鈕

```
根據 0526_to_0529.md 的 **Step C1** 要求：

修改 src/routes/app.profile.tsx

修改內容：
1. **雷達圖加分數**：
   - 在雷達圖的每個頂點或圖表標題旁顯示各維度分數（P/E/R/M/A 的數值）
   - 分數來自最新的 perma_scores 記錄

2. **「觀看上次測驗結果」按鈕**：
   - 在「重新評估」按鈕上方加新按鈕
   - 點擊後展示上一次（非最新）測驗的雷達圖 modal
   - 需從 perma_scores 抓第二筆（order created_at desc limit 2 offset 1）
   - 若只有一次記錄則隱藏此按鈕

完成修改後請：
1. 在本機驗證修改正確（npm run dev 檢查雷達圖分數、上次測驗按鈕）
2. git add 相關檔案
3. 建立 commit，訊息格式：feat: 個人頁雷達圖加分數 + 「觀看上次測驗結果」按鈕
4. git push 到 main branch
```

---

## Session 12：A6 — 補打卡功能

```
根據 0526_to_0529.md 的 **Step A6** 要求：

修改 src/routes/app.gratitude.tsx → WritingStage 組件 + GratitudePage

實作補打卡機制：
1. **UI**：在 WritingStage 日期行旁加「修改日期」小按鈕
2. **互動**：點擊後彈出 bottom sheet，列出兩個選項：
   - 今天（YYYY/MM/DD，星期Ｘ）
   - 昨天（YYYY/MM/DD，星期Ｘ）
3. **狀態**：
   - 在 GratitudePage 加 selectedDate state（預設 todayDate()）
   - WritingStage 接收 selectedDate、onChangeSelectedDate 作為 prop
   - 選昨天時更新 selectedDate
4. **存入**：改用 isoDate(selectedDate) 作為 entry_date，而非硬寫 todayDate()
5. **Streak 即時更新**：補打卡成功後重新計算 streak
   - 在 Step A5 的 saveEntry() 完成後，重新呼叫 loadStreak() 並更新 CELEBRATE stage 顯示

完成修改後請：
1. 在本機驗證修改正確（npm run dev 完整流程：修改日期→昨天→存→streak 更新）
2. git add 相關檔案
3. 建立 commit，訊息格式：feat: 感恩日記補打卡機制 - 支援修改日期 + streak 即時重算
4. git push 到 main branch
```

---

## Session 13：E1 — 社群觸發 modal

```
根據 0526_to_0529.md 的 **Step E1** 要求：

修改 src/routes/app.community.tsx + src/routes/app.gratitude.tsx

實作社群觸發 modal：
每當以下兩個條件之一發生，系統跳出 modal 顯示一則他人的感恩日記：
1. 完成感恩練習後從 CELEBRATE 導向 community（從 gratitude navigate 來）
2. 每天首次點擊底部導航「社群」tab 時

實作步驟：
1. 在 community 頁加 showWelcomeEntry state + entryData state
2. 條件一：從 gratitude navigate 時，透過 URL search param（如 ?showEntry=1）觸發
3. 條件二：使用 localStorage 記錄今天是否已顯示（key: community_last_shown: YYYY-MM-DD）
4. Modal 內容：隨機抓一筆 gratitude_entries 的資料（is_shared=true 且 user_id != 自己）
5. 使用者關閉 modal 後直接停在社群頁面（無需進一步互動）

完成修改後請：
1. 在本機驗證修改正確（npm run dev 完成練習→看 modal；刷新頁面首次點社群→看 modal）
2. git add 相關檔案
3. 建立 commit，訊息格式：feat: 社群頁面觸發 modal - 完成練習後 + 每日首次進入
4. git push 到 main branch
```

---

## 使用說明

複製上方對應 Session 的 prompt，貼進新 Claude Code session，AI 會：
1. 按照指示修改程式碼
2. 完成後驗證改動
3. 自動 git commit + push

所有 13 個 step 都能獨立進行，但建議按照順序走（尤其是 A2 → A4 → A5 這三個連續相關的 step）。
