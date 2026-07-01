// 使用者選擇「跳過測驗」（或測驗到一半放棄）時記錄下來，避免每次回到首頁
// 都被 beforeLoad 強制導回 InMind 測驗（規格：測驗不再是強制關卡）。
// 純本機記錄即可，不需要後端欄位／migration。
const ONBOARDING_SKIPPED_KEY = 'mg_onboarding_skipped'

export function hasSkippedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_SKIPPED_KEY) === '1'
  } catch {
    return false
  }
}

export function markOnboardingSkipped(): void {
  try {
    localStorage.setItem(ONBOARDING_SKIPPED_KEY, '1')
  } catch {
    /* 忽略（無痕模式等不支援 localStorage 的情境） */
  }
}
