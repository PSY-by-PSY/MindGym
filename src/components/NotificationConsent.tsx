import { useEffect, useState } from 'react'
import { isNativeApp } from '../lib/nativeAuth'
import { ensureLocalNotifPermission, scheduleDailyCheckin, NOTIF_CONSENT_KEY as CONSENT_KEY } from '../lib/localNotifications'

// 詢問並取得使用者同意，讓 App / Web App 能傳送系統通知。
// 不論是否登入皆會出現（掛在最外層），每位使用者只問一次（已回應就不再打擾）。
// 原生 App：走 Local Notifications 權限（WKWebView 沒有 Web Notification API）。
// 純網頁：走瀏覽器 Notification 權限。
export function NotificationConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 這個版本已回應過就不再問（原生／網頁共用同一把鍵）
    let responded = false
    try { responded = !!localStorage.getItem(CONSENT_KEY) } catch { /* 忽略 */ }
    if (responded) return

    if (isNativeApp()) {
      // 原生 App：用插件權限狀態判斷（不能用 Web Notification）。
      const timer = setTimeout(() => setVisible(true), 1500)
      return () => clearTimeout(timer)
    }

    // 純網頁：依瀏覽器 Notification 權限決定是否詢問。
    if (!('Notification' in window)) return
    if (Notification.permission === 'granted') {
      try { localStorage.setItem(CONSENT_KEY, 'granted') } catch { /* 忽略 */ }
      return
    }
    if (Notification.permission === 'denied') return

    const timer = setTimeout(() => setVisible(true), 1500)
    return () => clearTimeout(timer)
  }, [])

  const allow = async () => {
    try {
      if (isNativeApp()) {
        // 原生：請求 Local Notifications 權限，授權後立刻排定每晚 21:30 打卡提醒。
        const granted = await ensureLocalNotifPermission()
        try { localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied') } catch { /* 忽略 */ }
        if (granted) await scheduleDailyCheckin()
      } else {
        const result = await Notification.requestPermission()
        try { localStorage.setItem(CONSENT_KEY, result) } catch { /* 忽略 */ }
        if (result === 'granted') {
          try {
            new Notification('PSY by PSY', {
              body: '通知已開啟！有人為你的貼文按讚或留言時會提醒你 🎉',
            })
          } catch { /* 部分平台需 SW 才能顯示，忽略 */ }
        }
      }
    } catch (e) {
      console.error('[notif consent]', e)
    } finally {
      setVisible(false)
    }
  }

  const later = () => {
    try { localStorage.setItem(CONSENT_KEY, 'dismissed') } catch { /* 忽略 */ }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="animate-slide-up w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none">🔔</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-foreground">開啟通知</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              想在有人為你的貼文按讚、留言，以及每晚提醒打卡時收到通知嗎？開啟後我們才能傳送系統通知給你。
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={later}
            className="flex-1 rounded-full border border-border py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted"
          >
            稍後再說
          </button>
          <button
            onClick={allow}
            className="flex-1 rounded-full bg-gradient-primary py-2.5 text-sm font-bold text-white shadow-soft transition active:scale-[0.98]"
          >
            開啟通知
          </button>
        </div>
      </div>
    </div>
  )
}
