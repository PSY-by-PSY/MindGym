import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import type { Session } from '@supabase/supabase-js'
import { routeTree } from './routeTree.gen'
import { supabase } from './lib/supabase'
import { initAnalytics, identifyUser, resetUser, trackPageview } from './lib/analytics'
import { getFontScale, applyFontScale } from './lib/fontScale'
import { isNativeApp, setupNativeAuthListener } from './lib/nativeAuth'
import { initLocalNotifications } from './lib/localNotifications'
import { NotificationConsent } from './components/NotificationConsent'
import { ForceUpdateGate } from './components/ForceUpdateGate'
import { LanguageProvider } from './lib/i18n/context'
import './index.css'

// 原生 App（iOS）才加上 native-app class：讓「更像原生」的 CSS（去除點擊高亮、
// 關閉過度滾動回彈…）只作用在 App 內，網頁版完全不受影響。
if (isNativeApp()) {
  document.documentElement.classList.add('native-app')

  // 鎖定 WebView 縮放，根治「點輸入框後整頁卡在放大狀態」的 bug。
  //   原因：iOS 在輸入框字級 < 16px 時會自動放大頁面。網頁版是 Safari，iOS 10
  //   起為了無障礙會忽略 viewport 的縮放鎖定 → 使用者能用雙指縮回；但 App 版是
  //   WKWebView，它「會」遵守縮放設定，預設又沒鎖 maximum-scale，於是放大進去後
  //   雙指也縮不回來，頁面就一直卡在放大狀態。
  //   解法：只在 App 內把 viewport 補上 maximum-scale=1，讓 WKWebView 從頭就不放大。
  //   （App 本來就無法雙指縮放，鎖定不影響任何既有功能；網頁版的 viewport 完全不動。）
  const viewport = document.querySelector('meta[name="viewport"]')
  if (viewport) {
    viewport.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
    )
  }
}

// 套用使用者先前選的字體大小（渲染前套用，避免閃爍）
applyFontScale(getFontScale())

// 啟動 PostHog 行為分析
initAnalytics()

// 原生 App（iOS）：監聽 Google 登入完成後導回 App 的 deep link。
// 網頁版會自動跳過（isNativeApp() 為 false），不影響任何網頁行為。
void setupNativeAuthListener()

// 原生 App（iOS）：若已授權通知，補排每晚 21:30 打卡提醒（重啟後仍存在）。
// 未授權則不動作；網頁版自動跳過。
void initLocalNotifications()

export interface RouterContext {
  session: Session | null
}

const router = createRouter({
  routeTree,
  context: { session: null } satisfies RouterContext,
})

// 每次換頁都上報一次頁面瀏覽，讓後台能看到使用者走過哪些畫面
router.subscribe('onResolved', () => {
  trackPageview(router.state.location.pathname)
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  // undefined = still resolving, null = no session, Session = logged in
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    // resolve initial session (also picks up OAuth hash tokens from URL)
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // 綁定／解除 PostHog 身分，讓每筆行為都對應到真實使用者
      if (s?.user) {
        identifyUser(s.user.id, { email: s.user.email })
      } else {
        resetUser()
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // invalidate router whenever session changes so beforeLoad guards re-run
  useEffect(() => {
    if (session !== undefined) router.invalidate()
  }, [session])

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <>
      <RouterProvider router={router} context={{ session }} />
      <NotificationConsent />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ForceUpdateGate>
        <App />
      </ForceUpdateGate>
    </LanguageProvider>
  </StrictMode>,
)
