import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import type { Session } from '@supabase/supabase-js'
import { routeTree } from './routeTree.gen'
import { supabase } from './lib/supabase'
import { initAnalytics, identifyUser, resetUser, trackPageview } from './lib/analytics'
import './index.css'

// 啟動 PostHog 行為分析
initAnalytics()

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

  return <RouterProvider router={router} context={{ session }} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
