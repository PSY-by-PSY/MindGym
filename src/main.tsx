import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import type { Session } from '@supabase/supabase-js'
import { routeTree } from './routeTree.gen'
import { supabase } from './lib/supabase'
import { initAnalytics, identifyUser, resetUser, trackPageview } from './lib/analytics'
import { getFontScale, applyFontScale } from './lib/fontScale'
import { isNativeApp, setupNativeAuthListener } from './lib/nativeAuth'
import { NotificationConsent } from './components/NotificationConsent'
import './index.css'

// 原生 App（iOS）才加上 native-app class：讓「更像原生」的 CSS（去除點擊高亮、
// 關閉過度滾動回彈…）只作用在 App 內，網頁版完全不受影響。
if (isNativeApp()) {
  document.documentElement.classList.add('native-app')
}

// 套用使用者先前選的字體大小（渲染前套用，避免閃爍）
applyFontScale(getFontScale())

// 啟動 PostHog 行為分析
initAnalytics()

// 原生 App（iOS）：監聽 Google 登入完成後導回 App 的 deep link。
// 網頁版會自動跳過（isNativeApp() 為 false），不影響任何網頁行為。
void setupNativeAuthListener()

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
    <App />
  </StrictMode>,
)
