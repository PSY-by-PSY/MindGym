// 使用者第一次登入後會看到「歡迎導覽」（/welcome，一頁一頁介紹 App）。
// 這裡純本機記錄「看過沒」，避免每次回首頁都重播導覽（比照 onboardingSkip.ts）。
// 不需要後端欄位／migration。
const WELCOME_SEEN_KEY = 'mg_welcome_seen'

export function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(WELCOME_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, '1')
  } catch {
    /* 忽略（無痕模式等不支援 localStorage 的情境） */
  }
}
