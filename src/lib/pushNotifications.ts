// ─────────────────────────────────────────────────────────────────────────
// 遠端推播（APNs）裝置註冊 —— 讓「按讚／留言」在 App 關閉時也能收到通知。
//
// 流程：
//   1. iOS 的「通知權限」與 Local Notifications 共用同一個系統授權，所以這裡
//      不再另外跳視窗請求（由 localNotifications 的開啟流程負責）。已授權時才註冊。
//   2. PushNotifications.register() 向 APNs 取得 device token。
//   3. 'registration' 事件拿到 token → upsert 進 Supabase `device_tokens`。
//   4. 後端（Supabase Edge Function `push-notify`）在有人按讚／留言時，查出貼文
//      主人的 token，簽 APNs JWT 送出推播。
//
// 全程 isNativeApp() 把關；純網頁不執行。插件動態 import，網頁打包不受影響。
// ⚠️ 需新增 @capacitor/push-notifications pod → 殼要重建；且要部署 Edge Function。
// ─────────────────────────────────────────────────────────────────────────
// 改用靜態 import（理由同 localNotifications.ts）：動態 import() 的 lazy chunk
// 在 iOS WKWebView/PWA 環境可能卡住載不進來。靜態 import 打包進主 bundle 最穩。
import { PushNotifications } from '@capacitor/push-notifications'
import { isNativeApp } from './nativeAuth'
import { supabase } from './supabase'

let listenersReady = false

async function saveToken(token: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user.id
    if (!uid) return
    // token 為主鍵：同一裝置換帳號會覆蓋成新的 user_id，避免推到舊帳號。
    await supabase.from('device_tokens').upsert(
      { token, user_id: uid, platform: 'ios', updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    )
  } catch (e) {
    console.error('[push] saveToken', e)
  }
}

// 若已取得通知授權，向 APNs 註冊並把 device token 存進 Supabase。
// 未授權則不動作（授權由 localNotifications 的開啟流程處理）。
export async function registerForPush(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const perm = await PushNotifications.checkPermissions()
    if (perm.receive !== 'granted') return

    if (!listenersReady) {
      listenersReady = true
      await PushNotifications.addListener('registration', (token) => {
        void saveToken(token.value)
      })
      await PushNotifications.addListener('registrationError', (err) => {
        console.error('[push] registrationError', err)
      })
    }
    await PushNotifications.register()
  } catch (e) {
    console.error('[push] register', e)
  }
}
