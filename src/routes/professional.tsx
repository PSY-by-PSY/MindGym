// 教練旅程 MVP 展示頁（/professional）— 隱藏頂層路由。
// 僅限帳號 psybypsy01@gmail.com 登入後可見（email 白名單，非角色制）；
// 非授權者看到通用「找不到頁面」，不透露此路由存在（與 /admin /staff /therapist 同慣例）。
// 內容為外部靜態 MVP（教練旅程原型，見 public/coach-journey-mvp/），以全螢幕 iframe 嵌入；
// 該 MVP 自帶 Anthropic API Key 直連瀏覽器呼叫，不經過本平台後端，資料存於使用者 localStorage。
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n/context'

const ALLOWED_EMAIL = 'psybypsy01@gmail.com'

export const Route = createFileRoute('/professional')({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' })
  },
  component: ProfessionalPage,
})

function ProfessionalPage() {
  const { t } = useLanguage()
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const email = session?.user.email ?? null
      if (!cancelled) setState(email === ALLOWED_EMAIL ? 'ok' : 'denied')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }
  if (state === 'denied') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <p className="text-5xl font-black text-foreground/20">404</p>
        <p className="mt-3 text-lg font-bold text-muted-foreground">{t('找不到頁面')}</p>
      </div>
    )
  }

  return (
    <iframe
      src="/coach-journey-mvp/index.html"
      title="教練旅程 MVP"
      className="h-screen w-full border-0"
    />
  )
}
