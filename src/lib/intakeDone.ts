// 入門偏好問卷（/intake）做過沒。跟 onboardingSkip.ts 一樣純本機記錄：
// 完成或整份跳過都記 1，避免每次回首頁都被 beforeLoad 攔去重問。
// 正式紀錄在 user_intake 表；本機 flag 只是省一次查詢、也讓資料表還沒建好時流程不卡住。
const INTAKE_DONE_KEY = 'mg_intake_done'

export function hasIntakeDone(): boolean {
  try {
    return localStorage.getItem(INTAKE_DONE_KEY) === '1'
  } catch {
    return false
  }
}

export function markIntakeDone(): void {
  try {
    localStorage.setItem(INTAKE_DONE_KEY, '1')
  } catch {
    /* 忽略（無痕模式等不支援 localStorage 的情境） */
  }
}
