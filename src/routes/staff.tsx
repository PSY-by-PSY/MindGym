// 行政工作台（/staff）— 隱藏頂層路由，桌機優先。依 docs/plans/pre_session_mvp_plan.md §5：
// staff 是「業務角色」（初談檢視與媒合指派），admin 可代行，故閘門接受 staff 或 admin。
// 非授權者看到通用「找不到頁面」，不透露此路由存在。
// 目前內容為媒合工作台示意（假資料、不寫庫）；正式版接 intake_cases / match_assignments。
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { IntakeWorkbenchPreview } from '../components/pro/PreSessionPreview'
import { useLanguage } from '../lib/i18n/context'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'
import logoWordmark from '../assets/ui/logo-wordmark.png'

export const Route = createFileRoute('/staff')({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' })
  },
  component: StaffPage,
})

function StaffPage() {
  const { t } = useLanguage()
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user.id ?? null
      if (!uid) {
        if (!cancelled) setState('denied')
        return
      }
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', uid)
        .in('role', ['staff', 'admin'])
      if (!cancelled) setState((roles ?? []).length > 0 ? 'ok' : 'denied')
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

  return <Shell title={t('行政工作台')}><IntakeWorkbenchPreview /></Shell>
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const logout = async () => {
    await supabase.auth.signOut()
    navigate({ to: '/login' })
  }
  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-border bg-[#FEFAF0]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <img src={logoWordmark} alt="PSY by PSY" className="h-[22px] w-auto object-contain" />
            <span className="text-sm font-bold text-muted-foreground">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcherCompact />
            <button
              onClick={logout}
              className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-bold text-foreground transition hover:bg-muted"
            >
              {t('登出')}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  )
}
