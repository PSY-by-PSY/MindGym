# TestFlight 外部測試（External Testing）填寫文案

> 用途：在 App Store Connect → TestFlight → External Testing 建立測試群組、開公開連結時，
> 各欄位要填的內容。首次外部測試會觸發一次輕量的 **Beta App Review**，
> 「給審核員的測試帳號 / 操作引導」是過審關鍵——本 App 要登入才看得到內容，沒給帳號會被退。

---

## 1. Beta App Review 資訊（Test Information 頁）

### Beta App Description（測試者會看到的 App 說明）

```
PSY by PSY 是一款心理練習與正向習慣養成 App，包含每日感恩記錄、專注時刻覺察、
四個心理工作坊、以及一個互相鼓勵的社群。這是測試版，歡迎回報任何使用上的問題或建議。
```

### Feedback Email（測試回饋寄到哪）

```
love2002yy@gmail.com
```

### What to Test（這個版本要測什麼，每次上傳可更新）

```
本版為首次外部測試，請協助走過以下流程並回報任何卡頓 / 顯示異常：
1. 註冊 / 登入
2. 首頁瀏覽
3. 感恩記錄：新增一筆三件好事
4. 專注模組：記錄一次專注時刻
5. 社群：發一則貼文、按讚、留言
6. 四個工作坊各點進去看一遍
7. 個人檔案 Profile
```

---

## 2. 給 Apple 審核員的備註（App Review Information → Notes）

> ⚠️ 一定要填，否則審核員無法登入看內容會直接退件。
>
> 目前 App 只開放「用 Google 登入」（Email/密碼登入功能暫時關閉，待團隊討論），
> 所以審核帳號**必須是一組 Google 帳號**，不是你自己的真帳號。
> 申請方式：去 accounts.google.com 開一個新帳號（例如 `psybypsy.review@gmail.com`），
> 用它在 App 上跑過一次「用 Google 登入」+ onboarding，放個一兩筆資料再交給審核員。

```
This app uses "Sign in with Google" as its only sign-in method. Please use the
Google account below to review.

Demo account (Google):
  Email:    ____________________   ← 請填你申請的審核專用 Google 帳號
  Password: ____________________

Notes for reviewer:
- Tap "用 Google 登入" / "Sign in with Google" on the welcome screen and sign in
  with the Google account above.
- The home screen shows daily mental-wellness exercises.
- Core features to see: Gratitude journal, Focus log, Community feed
  (post/like/comment), and four self-guided workshops.
- Push notifications are used for daily reminders (optional, not required to test).
- The app uses the microphone only when the user taps the voice-input button
  in surveys; it is optional.
```

---

## 3. 公開連結（Public Link）給親友 / 受試者的安裝引導

> 把下面這段連同公開連結一起貼到群組 / Email。

```
【PSY by PSY 測試版安裝步驟】
1. 先到 App Store 安裝 Apple 官方的「TestFlight」App（免費）。
2. 用手機點這條連結：<在這裡貼上你的 Public Link>
3. 在 TestFlight 裡按「安裝 / Install」即可。
4. 之後 App 有更新，TestFlight 會通知你按「更新」。
有任何問題或建議，直接回訊息給我，謝謝你的協助 🙏
```

---

## 待你補的空格
- [ ] 第 2 節：建立一組審核專用帳號，填入 Email / Password
- [ ] 第 3 節：貼上 App Store Connect 產生的 Public Link
