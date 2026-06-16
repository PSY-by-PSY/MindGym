// ─────────────────────────────────────────────────────────────────────────
// 工作坊專屬練習 — 存取控制（密碼保護）
//
// 三個工作坊模塊（暖身卡牌、找尋真實自我、生命最後一天）共用同一組密碼驗證。
// 使用者在同一個分頁／使用階段中通過一次後，解鎖狀態存進 sessionStorage，
// 之後切換到其他工作坊模塊都不需要再輸入密碼。關閉分頁後 sessionStorage 會
// 清空，下次再進來需重新輸入密碼。
// ─────────────────────────────────────────────────────────────────────────

// ⚠️ 測試階段使用，正式上線前應更換為更安全的驗證方式（例如後端驗證、一次性
//    邀請碼或帳號授權）。目前只做「前端單一固定字串比對」，密碼會被打包進前端
//    程式碼，任何人都能在瀏覽器中查看，無法視為真正的安全機制。
//
// 要更換密碼：直接改下面這個字串，或在部署環境設定 VITE_WORKSHOP_PASSWORD。
export const WORKSHOP_PASSWORD =
  (import.meta.env.VITE_WORKSHOP_PASSWORD as string | undefined) ?? 'psy2025'

// sessionStorage 的 key —— 三個模塊共用，代表「本次使用階段已通過工作坊驗證」。
const STORAGE_KEY = 'workshop_unlocked'

/** 是否已在本次使用階段通過工作坊密碼驗證。 */
export function isWorkshopUnlocked(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    // 隱私模式等情境下 sessionStorage 可能無法使用，視為尚未解鎖。
    return false
  }
}

/** 密碼驗證通過後呼叫，記錄解鎖狀態。 */
export function unlockWorkshop(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // sessionStorage 無法寫入時靜默略過（解鎖狀態僅維持在當前頁面記憶體中）。
  }
}

/** 比對使用者輸入的密碼是否正確（去除前後空白後比對）。 */
export function checkWorkshopPassword(input: string): boolean {
  return input.trim() === WORKSHOP_PASSWORD
}
