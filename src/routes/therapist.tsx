// 專業夥伴工作台（/therapist）— 隱藏頂層路由，桌機優先、responsive 向下相容。
// 三態：非專業夥伴（申請表單）／審核中／被退件；已是專業夥伴 → 主控台（我的模組／邀請碼／個案追蹤）。
// 角色與資料一律走 anon key + RLS；送審走後端 /api/pro/submit-module（要先跑 AI）。
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import { streakFromDates } from '../lib/streak'
import { isoLocalDate } from '../lib/date'
import { BlockEditor } from '../components/pro/BlockEditor'
import { BlockRenderer } from '../components/pro/BlockRenderer'
import { DiaryBuilder } from '../components/pro/DiaryBuilder'
import { AssessmentBuilder } from '../components/pro/AssessmentBuilder'
import { AssessmentReportView } from '../components/pro/AssessmentReportView'
import { MarketplacePreview, EyeIcon } from '../components/pro/MarketplacePreview'
import { useLanguage } from '../lib/i18n/context'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'
import {
  MODULE_TEMPLATES,
  type ProModuleRow,
  type ProModuleContent,
  type ProModuleStatus,
  type ProModuleKind,
  type AssessmentResultRow,
  type ProAnswers,
  type ProAnswerValue,
} from '../lib/proModules'
import logoWordmark from '../assets/ui/logo-wordmark.png'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export const Route = createFileRoute('/therapist')({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' })
  },
  component: TherapistPage,
})

const STATUS_META: Record<ProModuleStatus, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'bg-muted text-muted-foreground' },
  pending_review: { label: '審核中', cls: 'bg-tile-peach text-[#8a6320]' },
  approved: { label: '已上架', cls: 'bg-tile-mint text-[#3f6b46]' },
  rejected: { label: '已退件', cls: 'bg-tile-pink text-rust' },
  archived: { label: '已下架', cls: 'bg-muted text-muted-foreground' },
}

const KIND_META: Record<ProModuleKind, { label: string; cls: string }> = {
  practice: { label: '練習模組', cls: 'bg-muted text-muted-foreground' },
  diary: { label: '日記模組', cls: 'bg-tile-mint text-[#3f6b46]' },
  assessment: { label: '質性測驗', cls: 'bg-tile-peach text-[#8a6320]' },
}

const EMPTY_CONTENT: ProModuleContent = { v: 1, intro: '', blocks: [], outro: '' }

// ── 頂層 shell ─────────────────────────────────────────────────────────────

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

function Spinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

// ── 頁面：角色三態閘門 ──────────────────────────────────────────────────────

type PractitionerApp = {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  admin_note: string | null
  name: string | null
  title: string | null
  organization: string | null
  license_info: string | null
  motivation: string | null
}

function TherapistPage() {
  const { t } = useLanguage()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPractitioner, setIsPractitioner] = useState(false)
  const [application, setApplication] = useState<PractitionerApp | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user.id ?? null
    setUserId(uid)
    if (!uid) {
      setLoading(false)
      return
    }
    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', uid)
    const practitioner = (roles ?? []).some((r) => r.role === 'practitioner')
    setIsPractitioner(practitioner)
    if (!practitioner) {
      const { data: app } = await supabase
        .from('practitioner_applications')
        .select('id, status, admin_note, name, title, organization, license_info, motivation')
        .eq('user_id', uid)
        .maybeSingle()
      setApplication((app as PractitionerApp) ?? null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (loading) {
    return (
      <Shell title={t('專業夥伴工作台')}>
        <Spinner />
      </Shell>
    )
  }

  if (isPractitioner && userId) {
    return (
      <Shell title={t('專業夥伴工作台')}>
        <Console ownerId={userId} />
      </Shell>
    )
  }

  return (
    <Shell title={t('專業夥伴工作台')}>
      <ApplicationGate userId={userId} application={application} onChanged={refresh} />
    </Shell>
  )
}

// ── 申請表單 / 審核中 / 被退件 ───────────────────────────────────────────────

function ApplicationGate({
  userId,
  application,
  onChanged,
}: {
  userId: string | null
  application: PractitionerApp | null
  onChanged: () => void
}) {
  const { t } = useLanguage()
  const editable = !application || application.status === 'rejected'

  const [name, setName] = useState(application?.name ?? '')
  const [title, setTitle] = useState(application?.title ?? '')
  const [organization, setOrganization] = useState(application?.organization ?? '')
  const [licenseInfo, setLicenseInfo] = useState(application?.license_info ?? '')
  const [motivation, setMotivation] = useState(application?.motivation ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (application && application.status === 'pending') {
    return (
      <div className="mx-auto max-w-xl rounded-[22px] border border-border bg-card p-8 shadow-soft">
        <h1 className="text-xl font-black text-foreground">{t('審核中')}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          {t('我們已收到你的申請，正在審核中。通過後這裡會變成你的工作台。')}
        </p>
      </div>
    )
  }

  const submit = async () => {
    if (!userId || busy) return
    if (!name.trim()) {
      setError(t('請填寫姓名'))
      return
    }
    setBusy(true)
    setError(null)
    const payload = {
      name: name.trim(),
      title: title.trim() || null,
      organization: organization.trim() || null,
      license_info: licenseInfo.trim() || null,
      motivation: motivation.trim() || null,
    }
    let dbError
    if (application && application.status === 'rejected') {
      // 被退件後重新送出：本人可把自己的申請改回 pending（RLS 已允許 rejected → pending）。
      const { error } = await supabase
        .from('practitioner_applications')
        .update({ ...payload, status: 'pending', admin_note: null })
        .eq('user_id', userId)
      dbError = error
    } else {
      const { error } = await supabase
        .from('practitioner_applications')
        .insert({ user_id: userId, ...payload })
      dbError = error
    }
    setBusy(false)
    if (dbError) {
      console.error('[application]', dbError)
      setError(t('送出失敗，請稍後再試。'))
      return
    }
    onChanged()
  }

  return (
    <div className="mx-auto max-w-xl rounded-[22px] border border-border bg-card p-8 shadow-soft">
      <h1 className="text-xl font-black text-foreground">{t('申請成為專業夥伴')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {t('填寫以下資訊，通過審核後即可建立你自己的練習模組，發給個案使用。')}
      </p>

      {application?.status === 'rejected' && application.admin_note && (
        <div className="mt-4 rounded-2xl bg-tile-pink px-4 py-3">
          <p className="text-sm font-bold text-rust">{t('申請未通過')}</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/80">{application.admin_note}</p>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-4">
        <FormField label={t('姓名')} required value={name} onChange={setName} disabled={!editable} />
        <FormField label={t('職稱')} value={title} onChange={setTitle} disabled={!editable} placeholder={t('例：諮商心理師、輔導老師')} />
        <FormField label={t('服務單位')} value={organization} onChange={setOrganization} disabled={!editable} />
        <FormArea label={t('專業證照 / 資歷說明')} value={licenseInfo} onChange={setLicenseInfo} disabled={!editable} />
        <FormArea label={t('想如何使用本平台')} value={motivation} onChange={setMotivation} disabled={!editable} />
      </div>

      {error && <p className="mt-3 text-sm font-bold text-rust">{error}</p>}

      <button
        onClick={submit}
        disabled={busy}
        className="mt-6 w-full rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60 sm:w-auto sm:px-10"
      >
        {busy ? t('送出中…') : application?.status === 'rejected' ? t('重新送出申請') : t('送出申請')}
      </button>
    </div>
  )
}

// ── 主控台（三分頁）─────────────────────────────────────────────────────────

type Tab = 'modules' | 'invites' | 'clients' | 'preview'

function Console({ ownerId }: { ownerId: string }) {
  const { t } = useLanguage()
  const [tab, setTab] = useState<Tab>('modules')
  const [modules, setModules] = useState<ProModuleRow[] | null>(null)

  const loadModules = useCallback(async () => {
    const { data } = await supabase
      .from('pro_modules')
      .select('*')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
    setModules((data as ProModuleRow[]) ?? [])
  }, [ownerId])

  useEffect(() => {
    track('therapist_console_opened')
  }, [])
  useEffect(() => {
    void loadModules()
  }, [loadModules])

  const TABS: { key: Tab; label: string; icon?: React.ReactNode }[] = [
    { key: 'modules', label: t('我的模組') },
    { key: 'invites', label: t('邀請碼') },
    { key: 'clients', label: t('個案追蹤') },
    { key: 'preview', label: t('使用者預覽'), icon: <EyeIcon className="h-4 w-4 shrink-0" /> },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="flex flex-wrap gap-2 lg:flex-col">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-left text-[15px] font-bold transition ${
              tab === tb.key ? 'bg-foreground text-cream shadow-soft' : 'bg-card text-foreground hover:bg-muted'
            }`}
          >
            {tb.icon}
            {tb.label}
          </button>
        ))}
      </aside>

      <section className="min-w-0">
        {tab === 'preview' ? (
          <MarketplacePreview />
        ) : modules === null ? (
          <Spinner />
        ) : tab === 'modules' ? (
          <MyModulesTab ownerId={ownerId} modules={modules} reload={loadModules} />
        ) : tab === 'invites' ? (
          <InviteCodesTab modules={modules} />
        ) : (
          <ClientTrackingTab ownerId={ownerId} modules={modules} />
        )}
      </section>
    </div>
  )
}

// ── 我的模組 ────────────────────────────────────────────────────────────────

function MyModulesTab({
  ownerId,
  modules,
  reload,
}: {
  ownerId: string
  modules: ProModuleRow[]
  reload: () => Promise<void>
}) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState<ProModuleRow | null | 'new'>(null)
  const [diaryEditing, setDiaryEditing] = useState<ProModuleRow | null | 'new'>(null)
  const [assessmentEditing, setAssessmentEditing] = useState<ProModuleRow | null | 'new'>(null)
  const [picking, setPicking] = useState(false)
  const [pickingKind, setPickingKind] = useState(false)
  const [templateContent, setTemplateContent] = useState<ProModuleContent>(EMPTY_CONTENT)

  if (diaryEditing === 'new' || diaryEditing) {
    return (
      <DiaryBuilder
        ownerId={ownerId}
        module={diaryEditing === 'new' ? null : diaryEditing}
        onDone={async () => {
          setDiaryEditing(null)
          await reload()
        }}
        onCancel={() => setDiaryEditing(null)}
      />
    )
  }

  if (assessmentEditing === 'new' || assessmentEditing) {
    return (
      <AssessmentBuilder
        ownerId={ownerId}
        module={assessmentEditing === 'new' ? null : assessmentEditing}
        onDone={async () => {
          setAssessmentEditing(null)
          await reload()
        }}
        onCancel={() => setAssessmentEditing(null)}
      />
    )
  }

  if (editing === 'new' || editing) {
    const mod = editing === 'new' ? null : editing
    return (
      <ModuleEditor
        ownerId={ownerId}
        module={mod}
        initialContent={editing === 'new' ? templateContent : undefined}
        onDone={async () => {
          setEditing(null)
          await reload()
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  const openEdit = (m: ProModuleRow) => {
    if (m.kind === 'diary') setDiaryEditing(m)
    else if (m.kind === 'assessment') setAssessmentEditing(m)
    else setEditing(m)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-black text-foreground">{t('我的模組')}</h1>
        <button
          onClick={() => setPickingKind(true)}
          className="rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
        >
          {t('建立新模組')}
        </button>
      </div>

      {modules.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t('還沒有任何模組。點「建立新模組」從模板開始。')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {modules.map((m) => (
            <div key={m.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-[17px] font-black text-foreground">{m.title}</h2>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${KIND_META[m.kind].cls}`}>
                      {t(KIND_META[m.kind].label)}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${STATUS_META[m.status].cls}`}>
                      {t(STATUS_META[m.status].label)}
                    </span>
                  </div>
                  {m.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{m.description}</p>}
                  {m.status === 'rejected' && m.admin_note && (
                    <p className="mt-2 rounded-xl bg-tile-pink px-3 py-2 text-sm text-rust">{t('退件理由：{note}', { note: m.admin_note })}</p>
                  )}
                </div>
                <button
                  onClick={() => openEdit(m)}
                  className="shrink-0 rounded-full border border-border bg-background px-4 py-1.5 text-sm font-bold text-foreground transition hover:bg-muted"
                >
                  {t('編輯')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pickingKind && (
        <KindPicker
          onPick={(kind) => {
            setPickingKind(false)
            if (kind === 'diary') setDiaryEditing('new')
            else if (kind === 'assessment') setAssessmentEditing('new')
            else setPicking(true)
          }}
          onClose={() => setPickingKind(false)}
        />
      )}

      {picking && (
        <TemplatePicker
          onPick={(content) => {
            setTemplateContent(content)
            setPicking(false)
            setEditing('new')
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}

function KindPicker({ onPick, onClose }: { onPick: (kind: ProModuleKind) => void; onClose: () => void }) {
  const { t } = useLanguage()
  const options: { kind: ProModuleKind; label: string; hint: string }[] = [
    { kind: 'practice', label: '練習模組', hint: '一次性引導練習，沿用積木題型' },
    { kind: 'diary', label: '日記模組', hint: '個案每日重複填寫，附三層 AI 回饋' },
    { kind: 'assessment', label: '質性測驗', hint: '把量表轉譯成開放式問題，AI 生成雙版本報告' },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1c1714]/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[24px] bg-background p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-foreground">{t('選擇模組類型')}</h2>
        <div className="mt-4 flex flex-col gap-2.5">
          {options.map((opt) => (
            <button
              key={opt.kind}
              onClick={() => onPick(opt.kind)}
              className="rounded-2xl border border-border bg-card px-4 py-3 text-left transition hover:bg-muted hover:border-primary active:scale-[0.99]"
            >
              <p className="text-[15px] font-black text-foreground">{t(opt.label)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{t(opt.hint)}</p>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-full py-2.5 text-sm font-bold text-muted-foreground">
          {t('取消')}
        </button>
      </div>
    </div>
  )
}

function TemplatePicker({ onPick, onClose }: { onPick: (c: ProModuleContent) => void; onClose: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1c1714]/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[24px] bg-background p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-foreground">{t('選一個模板開始')}</h2>
        <div className="mt-4 flex flex-col gap-2.5">
          {MODULE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.key}
              onClick={() => onPick(tpl.build())}
              className="rounded-2xl border border-border bg-card px-4 py-3 text-left transition hover:bg-muted active:scale-[0.99]"
            >
              <p className="text-[15px] font-black text-foreground">{t(tpl.label)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{t(tpl.hint)}</p>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-full py-2.5 text-sm font-bold text-muted-foreground">
          {t('取消')}
        </button>
      </div>
    </div>
  )
}

// ── 模組編輯器 ──────────────────────────────────────────────────────────────

function ModuleEditor({
  ownerId,
  module,
  initialContent,
  onDone,
  onCancel,
}: {
  ownerId: string
  module: ProModuleRow | null
  initialContent?: ProModuleContent
  onDone: () => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  const [moduleId, setModuleId] = useState<string | null>(module?.id ?? null)
  const [title, setTitle] = useState(module?.title ?? '')
  const [description, setDescription] = useState(module?.description ?? '')
  const [estMinutes, setEstMinutes] = useState(module?.est_minutes != null ? String(module.est_minutes) : '')
  // ModuleEditor 只用於 kind='practice'（diary/assessment 走各自的 Builder），
  // draft_content/published_content 保證是 ProModuleContent 形狀。
  const [content, setContent] = useState<ProModuleContent>(
    (module?.draft_content as ProModuleContent | undefined) ??
      (module?.published_content as ProModuleContent | undefined) ??
      initialContent ??
      EMPTY_CONTENT,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmSubmit, setConfirmSubmit] = useState(false)

  const isPublished = !!module?.published_content

  const parseEst = (): number | null => {
    const n = parseInt(estMinutes, 10)
    return Number.isFinite(n) ? n : null
  }

  const saveDraft = async (): Promise<string | null> => {
    if (!title.trim()) {
      setError(t('請填寫模組標題'))
      return null
    }
    setError(null)
    if (moduleId) {
      const { error } = await supabase.rpc('update_module_draft', {
        p_module_id: moduleId,
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_est_minutes: parseEst(),
        p_draft_content: content,
      })
      if (error) {
        console.error('[save draft]', error)
        setError(t('儲存失敗，請稍後再試。'))
        return null
      }
      return moduleId
    }
    const { data, error } = await supabase
      .from('pro_modules')
      .insert({
        owner_id: ownerId,
        title: title.trim(),
        description: description.trim() || null,
        est_minutes: parseEst(),
        draft_content: content,
        status: 'draft',
      })
      .select('id')
      .single()
    if (error || !data) {
      console.error('[create module]', error)
      setError(t('建立失敗，請稍後再試。'))
      return null
    }
    setModuleId(data.id as string)
    return data.id as string
  }

  const handleSave = async () => {
    setBusy(true)
    const id = await saveDraft()
    setBusy(false)
    if (id) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleSubmit = async () => {
    setBusy(true)
    const id = await saveDraft()
    if (!id) {
      setBusy(false)
      return
    }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(`${API_URL}/api/pro/submit-module`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ module_id: id }),
      })
      if (!resp.ok) throw new Error(`submit ${resp.status}`)
      track('pro_module_submitted', { module_id: id })
      onDone()
    } catch (e) {
      console.error('[submit module]', e)
      setError(t('送審失敗，請稍後再試。'))
    } finally {
      setBusy(false)
      setConfirmSubmit(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onCancel} className="text-sm font-bold text-muted-foreground transition hover:text-foreground">
          {t('← 返回列表')}
        </button>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm font-bold text-[#3f6b46]">{t('已儲存')}</span>}
          <button
            onClick={handleSave}
            disabled={busy}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-bold text-foreground transition hover:bg-muted disabled:opacity-60"
          >
            {t('儲存草稿')}
          </button>
          <button
            onClick={() => setConfirmSubmit(true)}
            disabled={busy}
            className="rounded-full bg-gradient-primary px-5 py-2 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {t('送審')}
          </button>
        </div>
      </div>

      {isPublished && (
        <p className="mb-4 rounded-2xl bg-tile-peach px-4 py-3 text-sm font-medium text-[#8a6320]">
          {t('個案目前使用的是已上架版本；修改內容需重新審核通過後才會生效。')}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左：編輯 */}
        <div className="flex flex-col gap-4">
          <FormField label={t('模組標題')} required value={title} onChange={setTitle} />
          <FormArea label={t('模組說明')} value={description} onChange={setDescription} />
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('預估時間（分鐘）')}</span>
            <input
              type="number"
              value={estMinutes}
              onChange={(e) => setEstMinutes(e.target.value)}
              className="w-32 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('開場引導語（選填）')}</span>
            <textarea
              value={content.intro ?? ''}
              rows={2}
              onChange={(e) => setContent((c) => ({ ...c, intro: e.target.value }))}
              className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>

          <div>
            <p className="mb-2 text-sm font-black text-foreground">{t('題目積木')}</p>
            <BlockEditor blocks={content.blocks} onChange={(blocks) => setContent((c) => ({ ...c, blocks }))} />
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('結語（選填）')}</span>
            <textarea
              value={content.outro ?? ''}
              rows={2}
              onChange={(e) => setContent((c) => ({ ...c, outro: e.target.value }))}
              className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        </div>

        {/* 右：即時預覽 */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-sm font-black text-foreground">{t('個案看到的樣子')}</p>
          <div className="rounded-[22px] border border-border bg-background p-5 shadow-soft">
            {content.blocks.length === 0 && !content.intro && !content.outro ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('新增題目後這裡會即時預覽。')}</p>
            ) : (
              <ReadOnlyPreview content={content} />
            )}
          </div>
        </div>
      </div>

      {error && <p className="mt-4 text-sm font-bold text-rust">{error}</p>}

      {confirmSubmit && (
        <ConfirmDialog
          title={t('送審這個模組？')}
          body={t('送審後將由管理員依心理學標準審核，通過後個案才能使用新內容。')}
          confirmLabel={busy ? t('送審中…') : t('確認送審')}
          onConfirm={handleSubmit}
          onCancel={() => !busy && setConfirmSubmit(false)}
        />
      )}
    </div>
  )
}

// 即時預覽：用 BlockRenderer 的 disabled 模式，維持一份 answers state 讓互動看起來真實。
function ReadOnlyPreview({ content }: { content: ProModuleContent }) {
  const [answers, setAnswers] = useState<ProAnswers>({})
  const onChange = (id: string, value: ProAnswerValue) => setAnswers((prev) => ({ ...prev, [id]: value }))
  return <BlockRenderer content={content} answers={answers} onChange={onChange} />
}

// ── 邀請碼 ──────────────────────────────────────────────────────────────────

function InviteCodesTab({ modules }: { modules: ProModuleRow[] }) {
  const { t } = useLanguage()
  const published = modules.filter((m) => m.published_content && m.status !== 'archived')
  const unpublished = modules.filter((m) => !m.published_content || m.status === 'archived')

  return (
    <div>
      <h1 className="mb-4 text-xl font-black text-foreground">{t('邀請碼')}</h1>
      {published.length === 0 && unpublished.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t('還沒有任何模組。')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {published.map((m) => (
            <InviteCodeRow key={m.id} module={m} />
          ))}
          {unpublished.map((m) => (
            <div key={m.id} className="rounded-2xl border border-border bg-card p-4 opacity-70 shadow-soft">
              <p className="text-[15px] font-black text-foreground">{m.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('模組上架後才能產生邀請碼。')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function InviteCodeRow({ module }: { module: ProModuleRow }) {
  const { t } = useLanguage()
  const [code, setCode] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('invite_codes')
      .select('code')
      .eq('module_id', module.id)
      .eq('is_active', true)
      .maybeSingle()
    setCode((data?.code as string) ?? null)
    setLoaded(true)
  }, [module.id])

  useEffect(() => {
    void load()
  }, [load])

  const regenerate = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('regenerate_invite_code', { p_module_id: module.id })
    setBusy(false)
    setConfirming(false)
    if (error) {
      console.error('[regenerate]', error)
      return
    }
    setCode((data as string) ?? null)
    track('invite_code_regenerated', { module_id: module.id })
  }

  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 忽略 */
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <p className="text-[15px] font-black text-foreground">{module.title}</p>
      {!loaded ? (
        <p className="mt-2 text-sm text-muted-foreground">{t('讀取中…')}</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {code ? (
            <span className="rounded-xl bg-muted px-4 py-2 font-mono text-xl font-black tracking-[0.25em] text-foreground">
              {code}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{t('尚未產生邀請碼')}</span>
          )}
          {code && (
            <button
              onClick={copy}
              className="rounded-full border border-border bg-background px-4 py-1.5 text-sm font-bold text-foreground transition hover:bg-muted"
            >
              {copied ? t('已複製') : t('複製')}
            </button>
          )}
          <button
            onClick={() => (code ? setConfirming(true) : void regenerate())}
            disabled={busy}
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-bold text-cream transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? '…' : code ? t('重新產生') : t('產生邀請碼')}
          </button>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title={t('重新產生邀請碼？')}
          body={t('舊的邀請碼將立即失效，尚未加入的個案需使用新碼。')}
          confirmLabel={busy ? t('產生中…') : t('確認重新產生')}
          onConfirm={regenerate}
          onCancel={() => !busy && setConfirming(false)}
        />
      )}
    </div>
  )
}

// ── 個案追蹤 ────────────────────────────────────────────────────────────────

type Enrollment = {
  module_id: string
  user_id: string
  share_perma: boolean
  consented_at: string
}
type CrisisAlert = {
  id: string
  user_id: string
  module_id: string | null
  severity: string
  matched_terms: string[] | null
  acknowledged_at: string | null
  created_at: string
}

function ClientTrackingTab({ ownerId, modules }: { ownerId: string; modules: ProModuleRow[] }) {
  const { t } = useLanguage()
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [alerts, setAlerts] = useState<CrisisAlert[]>([])
  const [selected, setSelected] = useState<Enrollment | null>(null)

  const loadEnrollments = useCallback(async () => {
    const { data } = await supabase
      .from('pro_enrollments')
      .select('module_id, user_id, share_perma, consented_at')
      .eq('practitioner_id', ownerId)
      .eq('status', 'active')
      .order('consented_at', { ascending: false })
    const list = (data as Enrollment[]) ?? []
    setEnrollments(list)
    const ids = [...new Set(list.map((e) => e.user_id))]
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', ids)
      const map: Record<string, string> = {}
      ;(profs ?? []).forEach((p) => {
        map[p.id as string] = (p.name as string) || t('個案')
      })
      setNames(map)
    }
  }, [ownerId, t])

  const loadAlerts = useCallback(async () => {
    const { data } = await supabase
      .from('crisis_alerts')
      .select('id, user_id, module_id, severity, matched_terms, acknowledged_at, created_at')
      .eq('practitioner_id', ownerId)
      .order('created_at', { ascending: false })
    setAlerts((data as CrisisAlert[]) ?? [])
  }, [ownerId])

  useEffect(() => {
    void loadEnrollments()
    void loadAlerts()
    // MVP 不做 realtime：頁面開著時每 60 秒 refetch 危機警示即達到「即時跳出」的體感。
    const timer = setInterval(() => void loadAlerts(), 60000)
    return () => clearInterval(timer)
  }, [loadEnrollments, loadAlerts])

  const unreadFor = (userId: string) =>
    alerts.filter((a) => a.user_id === userId && !a.acknowledged_at).length

  if (enrollments === null) return <Spinner />

  return (
    <div>
      <h1 className="mb-4 text-xl font-black text-foreground">{t('個案追蹤')}</h1>
      {enrollments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t('還沒有個案加入。上架模組並把邀請碼發給個案吧。')}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="flex flex-col gap-2">
            {enrollments.map((e) => {
              const unread = unreadFor(e.user_id)
              const active = selected?.user_id === e.user_id && selected?.module_id === e.module_id
              const mod = modules.find((m) => m.id === e.module_id)
              return (
                <button
                  key={`${e.module_id}:${e.user_id}`}
                  onClick={() => setSelected(e)}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    active ? 'border-foreground bg-cream' : 'border-border bg-card hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-black text-foreground">
                      {names[e.user_id] ?? t('個案')}
                    </span>
                    {unread > 0 && (
                      <span className="shrink-0 rounded-full bg-rust px-2 py-0.5 text-[11px] font-extrabold text-white">
                        {unread}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{mod?.title ?? t('模組')}</p>
                </button>
              )
            })}
          </div>

          <div className="min-w-0">
            {selected ? (
              <ClientDetail
                key={`${selected.module_id}:${selected.user_id}`}
                ownerId={ownerId}
                enrollment={selected}
                name={names[selected.user_id] ?? t('個案')}
                module={modules.find((m) => m.id === selected.module_id) ?? null}
                onAcknowledged={loadAlerts}
              />
            ) : (
              <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                {t('從左側選一位個案查看紀錄。')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

type ProEntry = { id: string; answers: ProAnswers; created_at: string; entry_date: string }
type PermaRow = { p_score: number; e_score: number; r_score: number; m_score: number; a_score: number; created_at: string }
type WeeklyReviewRow = { id: string; period_start: string; period_end: string; content: { title?: string; summary?: string } }

function ClientDetail({
  ownerId,
  enrollment,
  name,
  module,
  onAcknowledged,
}: {
  ownerId: string
  enrollment: Enrollment
  name: string
  module: ProModuleRow | null
  onAcknowledged: () => void
}) {
  const { t } = useLanguage()
  const [entries, setEntries] = useState<ProEntry[] | null>(null)
  const [alerts, setAlerts] = useState<CrisisAlert[]>([])
  const [perma, setPerma] = useState<PermaRow | null>(null)
  const [latestWeekly, setLatestWeekly] = useState<WeeklyReviewRow | null>(null)
  const [assessmentResults, setAssessmentResults] = useState<AssessmentResultRow[] | null>(null)

  const isDiary = module?.kind === 'diary'
  const isAssessment = module?.kind === 'assessment'

  const load = useCallback(async () => {
    const [{ data: e }, { data: a }] = await Promise.all([
      supabase
        .from('pro_entries')
        .select('id, answers, created_at, entry_date')
        .eq('module_id', enrollment.module_id)
        .eq('user_id', enrollment.user_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('crisis_alerts')
        .select('id, user_id, module_id, severity, matched_terms, acknowledged_at, created_at')
        .eq('practitioner_id', ownerId)
        .eq('user_id', enrollment.user_id)
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false }),
    ])
    setEntries((e as ProEntry[]) ?? [])
    setAlerts((a as CrisisAlert[]) ?? [])
    if (enrollment.share_perma) {
      const { data: p } = await supabase
        .from('perma_scores')
        .select('p_score, e_score, r_score, m_score, a_score, created_at')
        .eq('user_id', enrollment.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
      setPerma(((p as PermaRow[]) ?? [])[0] ?? null)
    }
    if (isDiary) {
      const { data: rv } = await supabase
        .from('pro_reviews')
        .select('id, period_start, period_end, content')
        .eq('module_id', enrollment.module_id)
        .eq('user_id', enrollment.user_id)
        .eq('review_type', 'weekly')
        .order('period_start', { ascending: false })
        .limit(1)
      setLatestWeekly(((rv as WeeklyReviewRow[]) ?? [])[0] ?? null)
    }
    if (isAssessment) {
      const { data: ar } = await supabase
        .from('pro_assessment_results')
        .select('*')
        .eq('module_id', enrollment.module_id)
        .eq('user_id', enrollment.user_id)
        .order('created_at', { ascending: false })
      setAssessmentResults((ar as AssessmentResultRow[]) ?? [])
    }
  }, [ownerId, enrollment, isDiary, isAssessment])

  useEffect(() => {
    void load()
  }, [load])

  const acknowledge = async (id: string) => {
    await supabase.from('crisis_alerts').update({ acknowledged_at: new Date().toISOString() }).eq('id', id)
    setAlerts((prev) => prev.filter((x) => x.id !== id))
    onAcknowledged()
  }

  const now = Date.now()
  const last7 = (entries ?? []).filter((e) => now - new Date(e.created_at).getTime() <= 7 * 86400000)

  const entryDates = [...new Set((entries ?? []).map((e) => e.entry_date))]
  const diaryStreak = isDiary ? streakFromDates(entryDates) : 0
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return isoLocalDate(d)
  })

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-black text-foreground">{name}</h2>

      {/* (a) 未確認危機警示 */}
      {alerts.length > 0 && (
        <div className="rounded-2xl border-2 border-rust bg-tile-pink p-4">
          <p className="text-sm font-black text-rust">{t('危機警示（{n}）', { n: alerts.length })}</p>
          <div className="mt-2 flex flex-col gap-2">
            {alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-background/70 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">
                    {a.severity === 'high' ? t('高風險') : t('中度風險')}
                    {a.matched_terms && a.matched_terms.length > 0 && (
                      <span className="ml-2 font-normal text-muted-foreground">{t('關鍵字：{terms}', { terms: a.matched_terms.join('、') })}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</p>
                </div>
                <button
                  onClick={() => acknowledge(a.id)}
                  className="shrink-0 rounded-full bg-rust px-3 py-1.5 text-xs font-bold text-white transition active:scale-[0.98]"
                >
                  {t('標記已知悉')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* (b) 統計 */}
      {isAssessment ? (
        <div className="flex gap-3">
          <StatCard label={t('測驗次數')} value={assessmentResults === null ? '…' : String(assessmentResults.length)} />
        </div>
      ) : (
        <div className="flex gap-3">
          <StatCard label={t('總打卡次數')} value={entries === null ? '…' : String(entries.length)} />
          <StatCard label={t('最近 7 天')} value={entries === null ? '…' : String(last7.length)} />
          {isDiary && <StatCard label={t('連續天數')} value={entries === null ? '…' : String(diaryStreak)} />}
        </div>
      )}

      {/* 日記模組：最近 7 天打卡點 + 最新週報摘要 */}
      {isDiary && entries !== null && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="mb-2 text-sm font-black text-foreground">{t('最近 7 天打卡')}</p>
          <div className="flex gap-2">
            {last7Days.map((d) => (
              <span
                key={d}
                className={`h-3 w-3 flex-1 rounded-full ${entryDates.includes(d) ? 'bg-tile-mint' : 'bg-muted'}`}
              />
            ))}
          </div>
          {latestWeekly ? (
            <div className="mt-3 rounded-xl bg-tile-peach px-3 py-2.5">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#8a6320]">
                {t('最新週報 · {start} ~ {end}', { start: latestWeekly.period_start, end: latestWeekly.period_end })}
              </p>
              {latestWeekly.content?.summary && (
                <p className="mt-1 text-sm leading-relaxed text-foreground/85">{latestWeekly.content.summary}</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{t('尚未有週報，或個案未同步週報給你。')}</p>
          )}
        </div>
      )}

      {/* (d) PERMA（若已同意分享） */}
      {enrollment.share_perma && perma && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="mb-2 text-sm font-black text-foreground">{t('最新 PERMA 五力')}</p>
          <div className="flex flex-wrap gap-3">
            {([[t('P 情緒力'), perma.p_score], [t('E 投入力'), perma.e_score], [t('R 連結力'), perma.r_score], [t('M 意義力'), perma.m_score], [t('A 成就力'), perma.a_score]] as const).map(
              ([label, v]) => (
                <div key={label} className="rounded-xl bg-muted px-3 py-2 text-center">
                  <p className="text-lg font-black text-foreground">{v}</p>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {/* (c) 紀錄時間軸（practice/diary） */}
      {!isAssessment && (
        <div>
          <p className="mb-2 text-sm font-black text-foreground">{t('紀錄時間軸')}</p>
          {entries === null ? (
            <p className="text-sm text-muted-foreground">{t('讀取中…')}</p>
          ) : entries.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t('這位個案還沒有任何打卡紀錄。')}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {entries.map((e) => (
                <div key={e.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <p className="mb-2 text-xs font-bold text-muted-foreground">{formatDateTime(e.created_at)}</p>
                  <EntryAnswersView
                    content={(module?.published_content ?? module?.draft_content ?? null) as ProModuleContent | null}
                    answers={e.answers}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* (e) 測驗結果（assessment）：每筆一份完整報告視圖，含 review_before_send 的發布動作 */}
      {isAssessment && (
        <div>
          <p className="mb-2 text-sm font-black text-foreground">{t('測驗結果')}</p>
          {assessmentResults === null ? (
            <p className="text-sm text-muted-foreground">{t('讀取中…')}</p>
          ) : assessmentResults.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t('這位個案還沒有任何測驗結果。')}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {assessmentResults.map((r) => (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <p className="mb-2 text-xs font-bold text-muted-foreground">{formatDateTime(r.created_at)}</p>
                  <AssessmentReportView result={r} onReleased={load} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EntryAnswersView({ content, answers }: { content: ProModuleContent | null; answers: ProAnswers }) {
  const { t } = useLanguage()
  const blocks = content?.blocks ?? []
  const entries = Object.entries(answers)
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{t('（未填寫）')}</p>
  const fmt = (v: ProAnswerValue): string => (Array.isArray(v) ? v.join('、') : String(v))
  return (
    <div className="flex flex-col gap-2">
      {entries.map(([id, v]) => {
        const b = blocks.find((x) => x.id === id)
        if (b && b.type === 'instruction') return null
        const label = b?.label || b?.text || t('題目')
        return (
          <div key={id} className="rounded-xl bg-muted px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/85">{fmt(v)}</p>
          </div>
        )
      })}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-2xl border border-border bg-card p-4 text-center shadow-soft">
      <p className="text-2xl font-black text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

// ── 共用小元件 ──────────────────────────────────────────────────────────────

function FormField({
  label,
  value,
  onChange,
  required,
  disabled,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-foreground">
        {label}
        {required && <span className="ml-1 text-rust">*</span>}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-[15px] text-foreground outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-70"
      />
    </label>
  )
}

function FormArea({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-foreground">{label}</span>
      <textarea
        value={value}
        rows={3}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded-xl border border-border bg-card px-4 py-2.5 text-[15px] leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-70"
      />
    </label>
  )
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1c1714]/40 px-6" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-[24px] bg-background p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-foreground">{title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-foreground-soft">{body}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="w-full rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
          >
            {confirmLabel}
          </button>
          <button onClick={onCancel} className="w-full rounded-full py-2.5 text-sm font-bold text-muted-foreground">
            {t('取消')}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
