// ─────────────────────────────────────────────────────────────────────────
// 原生 App（Capacitor / iOS）本地推播 —— Local Notifications，先做、不需後端。
//
// 三種情境：
//   1. 有人按讚使用者的貼文      → 立即本地通知
//   2. 有人留言                  → 立即本地通知
//      （1、2 由 App 開著時的 60 秒輪詢偵測到新互動時送出；純本地、無後端，
//        App 完全關閉時不會收到 —— 那需要 APNs 完整版，列為後續。）
//   3. 每晚 21:30               → 提醒上線打卡（排程型，App 關著也會跳）
//
// 全部以 isNativeApp() 把關：純網頁版完全不執行（網頁版改用 Web Notification）。
//
// ⚠️ 插件改用「靜態 import」而非動態 import：
//    動態 import() 會被切成 lazy chunk，在 iOS WKWebView（PWA / service worker
//    環境）載入新 chunk 時可能「卡住不回應」，導致權限視窗永遠跳不出來。
//    靜態 import 會打包進主 bundle（App 一定載得到），最穩。網頁端只多幾 KB 的
//    plugin web shim、且呼叫前都有 isNativeApp() 把關，無副作用。
// ─────────────────────────────────────────────────────────────────────────
import { LocalNotifications } from '@capacitor/local-notifications'
import { isNativeApp } from './nativeAuth'
import { registerForPush } from './pushNotifications'

// 版本化的通知同意鍵（NotificationConsent 橫幅與選單開關共用）：
// 升版（改字串）即可「重新詢問所有使用者」。
export const NOTIF_CONSENT_KEY = 'notif_consent_2026_06'

// 統一的通知權限狀態。'unsupported' = 純網頁無 Notification API。
export type NotifPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

// 固定 id：打卡提醒用單一 id，重排前先取消避免堆疊。
const DAILY_CHECKIN_ID = 1001
const CHECKIN_HOUR = 21
const CHECKIN_MINUTE = 30

let permissionGranted: boolean | null = null

// 把錯誤攤平成可讀字串（Capacitor 的錯誤常是純物件 {message, code}，直接 log 會變成 {}）。
function errDetail(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

// 查詢目前的本地通知權限狀態（不會跳出系統視窗）。供「選單 → 通知開關」顯示狀態用。
export async function getLocalNotifPermission(): Promise<NotifPermission> {
  if (!isNativeApp()) return 'unsupported'
  try {
    const cur = await LocalNotifications.checkPermissions()
    if (cur.display === 'granted') return 'granted'
    if (cur.display === 'denied') return 'denied'
    return 'prompt'
  } catch (e) {
    // 別讓選單停在「讀取中」——當作「還沒問過」，使用者仍可按「開啟通知」直接觸發授權。
    console.error('[localNotif] getPermission FAILED ->', errDetail(e))
    return 'prompt'
  }
}

// 請求本地通知權限（會跳出 iOS 系統視窗）。回傳是否已授權。
// 直接呼叫 requestPermissions —— 「不」先 checkPermissions：後者在部分裝置會卡住，
// 而 requestPermissions 較可靠、且本身具冪等性（已決定過會直接回現況、不重複跳窗）。
export async function ensureLocalNotifPermission(): Promise<boolean> {
  if (!isNativeApp()) return false
  if (permissionGranted === true) return true
  try {
    const req = await LocalNotifications.requestPermissions()
    const granted = req.display === 'granted'
    permissionGranted = granted
    return granted
  } catch (e) {
    console.error('[localNotif] permission FAILED ->', errDetail(e))
    return false
  }
}

// 排程每晚 21:30 的打卡提醒（每日重複）。先取消同 id，避免重複堆疊。
export async function scheduleDailyCheckin(): Promise<void> {
  if (!(await ensureLocalNotifPermission())) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: DAILY_CHECKIN_ID }] })
    await LocalNotifications.schedule({
      notifications: [
        {
          id: DAILY_CHECKIN_ID,
          title: 'PSY by PSY',
          body: '今天還沒打卡嗎？花一分鐘記錄，延續你的健心連續紀錄',
          // on: { hour, minute } 會每天在該時間重複觸發。
          schedule: { on: { hour: CHECKIN_HOUR, minute: CHECKIN_MINUTE }, allowWhileIdle: true },
        },
      ],
    })
  } catch (e) {
    console.error('[localNotif] scheduleDailyCheckin', errDetail(e))
  }
}

// 使用者主動開啟通知的單一入口（橫幅、選單開關共用）：
// 請求權限 → 排每晚打卡提醒 → 註冊遠端推播。回傳是否成功授權。
export async function enableNotifications(): Promise<boolean> {
  const granted = await ensureLocalNotifPermission()
  if (granted) {
    // 不 await：排程／註冊推播在部分裝置可能卡住，不該讓「開啟通知」按鈕卡在「處理中」。
    void scheduleDailyCheckin()
    void registerForPush()
  }
  return granted
}

// App 啟動時呼叫一次：若先前已授權，確保打卡提醒已排程（重裝/重啟後補排）。
// 未授權則完全不動作（由 NotificationConsent 詢問後才排）。
export async function initLocalNotifications(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const cur = await LocalNotifications.checkPermissions()
    if (cur.display === 'granted') {
      permissionGranted = true
      await scheduleDailyCheckin()
      // 已授權 → 順便（重新）註冊遠端推播，刷新 device token。
      await registerForPush()
    }
  } catch (e) {
    console.error('[localNotif] init', errDetail(e))
  }
}

// 立即送出一則本地通知（用於偵測到新的按讚／留言時）。
export async function pushLocalNotification(title: string, body: string): Promise<void> {
  if (!(await ensureLocalNotifPermission())) return
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          // 用時間戳尾段當 id（避免與打卡提醒 1001 衝突，且每則唯一）。
          id: 30000 + (Date.now() % 1000000),
          title,
          body,
          schedule: { at: new Date(Date.now() + 250) },
        },
      ],
    })
  } catch (e) {
    console.error('[localNotif] push', errDetail(e))
  }
}
