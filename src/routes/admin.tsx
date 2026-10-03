// 管理後台（/admin）— 隱藏頂層路由，桌機優先。非 admin（含一般登入者）看到通用「找不到頁面」，
// 不透露這是後台。分頁：夥伴申請、模組審核（AI 標籤僅供參考）、已上架模組、危機警示總覽、
// App 版本控管（強制更新門檻）、使用者預覽（模組市集）。
// 審核與版本控管動作皆走 SECURITY DEFINER RPC（內含 is_admin 檢查）。
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import { BlockRenderer } from '../components/pro/BlockRenderer'
import { MarketplacePreview, EyeIcon } from '../components/pro/MarketplacePreview'
import { IntakeWorkbenchPreview } from '../components/pro/PreSessionPreview'
import { PersonasTab } from '../components/admin/PersonasTab'
import { useLanguage } from '../lib/i18n/context'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'
import type { ProModuleRow, ProModuleKind, AiReview, DiaryModuleContent, AssessmentModuleContent } from '../lib/proModules'
import logoWordmark from '../assets/ui/logo-wordmark.png'

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' })
  },
  component: AdminPage,
})

// ── 角色閘門 ────────────────────────────────────────────────────────────────

function AdminPage() {
  const { t } = useLanguage()
  const [state, setState] = useState<'loading' | 'admin' | 'denied'>('loading')

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
        .eq('role', 'admin')
      if (!cancelled) setState((roles ?? []).length > 0 ? 'admin' : 'denied')
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
  if (state === 'denied') return <NotFound />

  return (
    <Shell title={t('管理後台')}>
      <AdminConsole />
    </Shell>
  )
}

// 通用「找不到頁面」：不透露這是後台。
function NotFound() {
  const { t } = useLanguage()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <p className="text-5xl font-black text-foreground/20">404</p>
      <p className="mt-3 text-lg font-bold text-muted-foreground">{t('找不到頁面')}</p>
    </div>
  )
}

// ── shell ───────────────────────────────────────────────────────────────────

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
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

// ── 主控台（四分頁）─────────────────────────────────────────────────────────

type Tab = 'applications' | 'reviews' | 'reports' | 'published' | 'crises' | 'personas' | 'matching' | 'appVersion' | 'subscriptions' | 'preview'

function AdminConsole() {
  const { t } = useLanguage()
  const [tab, setTab] = useState<Tab>('applications')

  const TABS: { key: Tab; label: string; icon?: React.ReactNode }[] = [
    { key: 'applications', label: t('夥伴申請') },
    { key: 'reviews', label: t('模組審核') },
    { key: 'reports', label: t('檢舉處理') },
    { key: 'published', label: t('已上架模組') },
    { key: 'crises', label: t('危機警示總覽') },
    { key: 'personas', label: t('使用者 Persona') },
    { key: 'matching', label: t('媒合工作台') },
    { key: 'appVersion', label: t('App 版本控管') },
    { key: 'subscriptions', label: t('訂閱管理') },
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
        {tab === 'applications' && <ApplicationsTab />}
        {tab === 'reviews' && <ModuleReviewTab />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'published' && <PublishedModulesTab />}
        {tab === 'crises' && <CrisisOverviewTab />}
        {tab === 'personas' && <PersonasTab />}
        {tab === 'matching' && <IntakeWorkbenchPreview />}
        {tab === 'appVersion' && <AppVersionTab />}
        {tab === 'subscriptions' && <SubscriptionsTab />}
        {tab === 'preview' && <MarketplacePreview />}
      </section>
    </div>
  )
}

// ── 夥伴申請 ────────────────────────────────────────────────────────────────

type ApplicationRow = {
  id: string
  name: string | null
  title: string | null
  organization: string | null
  license_info: string | null
  motivation: string | null
  created_at: string
}

function ApplicationsTab() {
  const { t } = useLanguage()
  const [apps, setApps] = useState<ApplicationRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<ApplicationRow | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('practitioner_applications')
      .select('id, name, title, organization, license_info, motivation, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setApps((data as ApplicationRow[]) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const approve = async (id: string) => {
    setBusy(id)
    const { error } = await supabase.rpc('approve_practitioner_application', { p_app_id: id })
    setBusy(null)
    if (error) {
      console.error('[approve app]', error)
      return
    }
    await load()
  }

  const reject = async (note: string) => {
    if (!rejecting) return
    setBusy(rejecting.id)
    const { error } = await supabase.rpc('reject_practitioner_application', { p_app_id: rejecting.id, p_note: note })
    setBusy(null)
    setRejecting(null)
    if (error) {
      console.error('[reject app]', error)
      return
    }
    await load()
  }

  if (apps === null) return <Spinner />

  return (
    <div>
      <h1 className="mb-4 text-xl font-black text-foreground">{t('夥伴申請')}</h1>
      {apps.length === 0 ? (
        <EmptyHint>{t('目前沒有待審核的申請。')}</EmptyHint>
      ) : (
        <div className="flex flex-col gap-3">
          {apps.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <h2 className="text-[17px] font-black text-foreground">{a.name || t('（未填姓名）')}</h2>
              <div className="mt-2 flex flex-col gap-1.5 text-sm">
                <Detail label={t('職稱')} value={a.title} />
                <Detail label={t('服務單位')} value={a.organization} />
                <Detail label={t('證照 / 資歷')} value={a.license_info} />
                <Detail label={t('使用動機')} value={a.motivation} />
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => approve(a.id)}
                  disabled={busy === a.id}
                  className="rounded-full bg-gradient-primary px-5 py-2 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
                >
                  {t('核准')}
                </button>
                <button
                  onClick={() => setRejecting(a)}
                  disabled={busy === a.id}
                  className="rounded-full border border-border bg-background px-5 py-2 text-sm font-bold text-rust transition hover:bg-muted disabled:opacity-60"
                >
                  {t('退件')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejecting && (
        <ReasonDialog
          title={t('退回這份申請')}
          placeholder={t('請說明退件理由（申請人可見）')}
          confirmLabel={t('確認退件')}
          onConfirm={reject}
          onCancel={() => setRejecting(null)}
        />
      )}
    </div>
  )
}

// ── 模組審核 ────────────────────────────────────────────────────────────────

function ModuleReviewTab() {
  const { t } = useLanguage()
  const [modules, setModules] = useState<ProModuleRow[] | null>(null)
  const [selected, setSelected] = useState<ProModuleRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('pro_modules')
      .select('*')
      .eq('status', 'pending_review')
      .order('submitted_at', { ascending: true })
    setModules((data as ProModuleRow[]) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const approve = async () => {
    if (!selected) return
    setBusy(true)
    const { error } = await supabase.rpc('approve_module', { p_module_id: selected.id, p_note: null })
    setBusy(false)
    if (error) {
      console.error('[approve module]', error)
      return
    }
    track('admin_module_approved', { module_id: selected.id })
    setSelected(null)
    await load()
  }

  const reject = async (note: string) => {
    if (!selected) return
    setBusy(true)
    const { error } = await supabase.rpc('reject_module', { p_module_id: selected.id, p_note: note })
    setBusy(false)
    setRejecting(false)
    if (error) {
      console.error('[reject module]', error)
      return
    }
    track('admin_module_rejected', { module_id: selected.id })
    setSelected(null)
    await load()
  }

  if (modules === null) return <Spinner />

  if (selected) {
    const content = selected.draft_content
    const hasBlocks = !!content && 'blocks' in content
    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="mb-4 text-sm font-bold text-muted-foreground transition hover:text-foreground"
        >
          {t('← 返回佇列')}
        </button>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* 左：模組完整內容（唯讀） */}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-foreground">{selected.title}</h2>
              <KindBadge kind={selected.kind} />
            </div>
            {selected.description && <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>}
            {selected.est_minutes != null && (
              <p className="mt-1 text-sm text-muted-foreground">{t('預估 {n} 分鐘', { n: selected.est_minutes })}</p>
            )}
            {selected.kind === 'diary' && content && 'feedback' in content && (
              <DiaryFeedbackSummary content={content as DiaryModuleContent} />
            )}
            <div className="mt-4 rounded-[22px] border border-border bg-background p-5 shadow-soft">
              {hasBlocks ? (
                <BlockRenderer content={content} answers={{}} disabled />
              ) : selected.kind === 'assessment' && content && 'questions' in content ? (
                <AssessmentContentSummary content={content as AssessmentModuleContent} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('（沒有內容）')}</p>
              )}
            </div>
          </div>

          {/* 右：AI 標籤面板 + 動作 */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <AiReviewPanel review={selected.ai_review} />
            <div className="mt-4 flex gap-2">
              <button
                onClick={approve}
                disabled={busy}
                className="rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
              >
                {t('核准上架')}
              </button>
              <button
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-bold text-rust transition hover:bg-muted disabled:opacity-60"
              >
                {t('退回修改')}
              </button>
            </div>
          </div>
        </div>

        {rejecting && (
          <ReasonDialog
            title={t('退回修改')}
            placeholder={t('請說明退件理由（專業夥伴可見）')}
            confirmLabel={t('確認退回')}
            onConfirm={reject}
            onCancel={() => setRejecting(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-black text-foreground">{t('模組審核')}</h1>
      {modules.length === 0 ? (
        <EmptyHint>{t('目前沒有待審核的模組。')}</EmptyHint>
      ) : (
        <div className="flex flex-col gap-3">
          {modules.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m)}
              className="rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition hover:bg-muted"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[17px] font-black text-foreground">{m.title}</span>
                <KindBadge kind={m.kind} />
                <RiskBadge level={m.ai_review?.risk_level} error={!!m.ai_review?.error} />
              </div>
              {m.description && <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{m.description}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const KIND_META: Record<ProModuleKind, { label: string; cls: string }> = {
  practice: { label: '練習', cls: 'bg-muted text-muted-foreground' },
  diary: { label: '日記', cls: 'bg-tile-mint text-[#71744F]' },
  assessment: { label: '測驗', cls: 'bg-tile-peach text-[#8a6320]' },
}

function KindBadge({ kind }: { kind: ProModuleKind }) {
  const { t } = useLanguage()
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${KIND_META[kind].cls}`}>
      {t(KIND_META[kind].label)}
    </span>
  )
}

const RISK_META: Record<string, { label: string; cls: string }> = {
  low: { label: '低風險', cls: 'bg-tile-mint text-[#71744F]' },
  medium: { label: '中風險', cls: 'bg-gold text-[#5b3a12]' },
  high: { label: '高風險', cls: 'bg-rust text-white' },
}

function RiskBadge({ level, error }: { level?: string; error?: boolean }) {
  const { t } = useLanguage()
  if (error) return <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{t('AI 未完成')}</span>
  const meta = level ? RISK_META[level] : null
  if (!meta) return null
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${meta.cls}`}>{t(meta.label)}</span>
}

function AiReviewPanel({ review }: { review: AiReview | null }) {
  const { t } = useLanguage()
  return (
    <div className="rounded-[22px] border border-border bg-card p-5 shadow-soft">
      <p className="mb-3 rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">
        {t('AI 標籤僅供參考，最終判斷以人工審核為準。')}
      </p>
      {!review || review.error ? (
        <p className="text-sm text-muted-foreground">{t('AI 審核未完成，請直接人工審核。')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">{t('整體風險')}</span>
            <RiskBadge level={review.risk_level} />
          </div>
          {review.summary && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('總結')}</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/85">{review.summary}</p>
            </div>
          )}
          <FindingList title={t('心理安全')} findings={review.psych_safety} />
          <FindingList title={t('資訊安全')} findings={review.info_safety} />
          {review.psychology_basis_note && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('心理學根據')}</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/85">{review.psychology_basis_note}</p>
            </div>
          )}
          {review.copyright_note && (
            <div className="rounded-xl bg-tile-pink px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-rust">{t('版權疑慮')}</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/85">{review.copyright_note}</p>
            </div>
          )}
          {review.clinical_risk_note && (
            <div className="rounded-xl bg-tile-pink px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-rust">{t('臨床風險備註')}</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/85">{review.clinical_risk_note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// assessment 審核重點：維度列表＋原題/轉譯題對照全文。
function AssessmentContentSummary({ content }: { content: AssessmentModuleContent }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm font-black text-foreground">
          {t('維度（來源量表：{name}）', { name: content.source_scale?.name || '—' })}
        </p>
        <div className="flex flex-wrap gap-2">
          {content.dimensions.map((d) => (
            <span key={d.key} className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-foreground">
              {d.key} · {d.name}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {content.questions.map((q, i) => (
          <div key={q.id} className="rounded-2xl border border-border bg-background p-3">
            <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">
              {i + 1}. {q.dimension}
              {q.sensitive && <span className="ml-2 rounded-full bg-tile-pink px-2 py-0.5 text-[10px] font-extrabold text-rust">{t('敏感題')}</span>}
            </p>
            <div className="rounded-xl bg-muted px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('原題')}</p>
              <p className="mt-0.5 text-sm text-foreground/70">{q.original || t('（無）')}</p>
            </div>
            <div className="mt-1.5 rounded-xl bg-card px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('轉譯題')}</p>
              <p className="mt-0.5 text-sm text-foreground/85">{q.translated}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// diary 審核：回饋設定摘要表（風格/門檻/週報 sections/同步開關）。
function DiaryFeedbackSummary({ content }: { content: DiaryModuleContent }) {
  const { t } = useLanguage()
  const { daily, overall, weekly } = content.feedback
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <p className="mb-2 text-sm font-black text-foreground">{t('回饋設定摘要')}</p>
      <div className="flex flex-col gap-1.5 text-sm text-foreground/85">
        <p>{t('每日回饋：{v}（風格：{style}）', { v: daily.enabled ? t('啟用') : t('停用'), style: daily.style })}</p>
        <p>
          {t('整體回饋：{v}（門檻 {n} 則，聚焦：{focus}）', {
            v: overall.enabled ? t('啟用') : t('停用'),
            n: overall.threshold,
            focus: overall.focus.join('、') || '—',
          })}
        </p>
        <p>
          {t('週報：{v}（sections：{sections}；同步給專業夥伴：{sync}）', {
            v: weekly.enabled ? t('啟用') : t('停用'),
            sections: Object.entries(weekly.sections).filter(([, on]) => on).map(([k]) => k).join('、') || '—',
            sync: weekly.sync_to_practitioner ? t('是') : t('否'),
          })}
        </p>
        {content.reminder && <p>{t('提醒時間：{v}', { v: content.reminder.enabled ? content.reminder.time : t('不提醒') })}</p>}
      </div>
    </div>
  )
}

function FindingList({ title, findings }: { title: string; findings?: AiReview['psych_safety'] }) {
  const { t } = useLanguage()
  if (!findings || findings.length === 0) {
    return (
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{title}</p>
        <p className="mt-1 text-sm text-[#71744F]">{t('未發現疑慮。')}</p>
      </div>
    )
  }
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{title}</p>
      <div className="mt-1.5 flex flex-col gap-2">
        {findings.map((f, i) => (
          <div key={i} className="rounded-xl bg-muted px-3 py-2">
            <div className="flex items-center gap-2">
              {f.severity && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${RISK_META[f.severity]?.cls ?? 'bg-background text-muted-foreground'}`}>
                  {RISK_META[f.severity] ? t(RISK_META[f.severity].label) : f.severity}
                </span>
              )}
            </div>
            {f.quote && <p className="mt-1 text-sm italic text-foreground/70">「{f.quote}」</p>}
            {f.reason && <p className="mt-1 text-sm text-foreground/85">{f.reason}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 已上架模組 ──────────────────────────────────────────────────────────────

type KindFilter = 'all' | ProModuleKind

function PublishedModulesTab() {
  const { t } = useLanguage()
  const [modules, setModules] = useState<ProModuleRow[] | null>(null)
  const [taking, setTaking] = useState<ProModuleRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<KindFilter>('all')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('pro_modules')
      .select('*')
      .eq('status', 'approved')
      .order('published_at', { ascending: false })
    setModules((data as ProModuleRow[]) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const takedown = async (note: string) => {
    if (!taking) return
    setBusy(true)
    const { error } = await supabase.rpc('takedown_module', { p_module_id: taking.id, p_note: note })
    setBusy(false)
    setTaking(null)
    if (error) {
      console.error('[takedown]', error)
      return
    }
    await load()
  }

  if (modules === null) return <Spinner />

  const filtered = filter === 'all' ? modules : modules.filter((m) => m.kind === filter)
  const FILTERS: { key: KindFilter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'practice', label: '練習' },
    { key: 'diary', label: '日記' },
    { key: 'assessment', label: '測驗' },
  ]

  return (
    <div>
      <h1 className="mb-4 text-xl font-black text-foreground">{t('已上架模組')}</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
              filter === f.key ? 'bg-foreground text-cream' : 'bg-card text-foreground hover:bg-muted'
            }`}
          >
            {t(f.label)}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyHint>{t('目前沒有已上架的模組。')}</EmptyHint>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[17px] font-black text-foreground">{m.title}</h2>
                  <KindBadge kind={m.kind} />
                </div>
                {m.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{m.description}</p>}
              </div>
              <button
                onClick={() => setTaking(m)}
                disabled={busy}
                className="shrink-0 rounded-full border border-border bg-background px-4 py-1.5 text-sm font-bold text-rust transition hover:bg-muted disabled:opacity-60"
              >
                {t('下架')}
              </button>
            </div>
          ))}
        </div>
      )}

      {taking && (
        <ReasonDialog
          title={t('下架「{title}」', { title: taking.title })}
          placeholder={t('請說明下架理由（專業夥伴可見）')}
          confirmLabel={t('確認下架')}
          onConfirm={takedown}
          onCancel={() => setTaking(null)}
        />
      )}
    </div>
  )
}

// ── 檢舉處理 ────────────────────────────────────────────────────────────────
// App Store 審查指南 1.2 要求「在 24 小時內處理檢舉、移除違規內容與違規者」。
// 這個分頁就是那個「處理」的地方——在此之前 reports 只有檢舉者自己讀得到，
// 送出去等於石沉大海（這是 1.2 被退件的原因之一）。
//
// 佇列以「被檢舉的內容」為單位（同一則貼文被十個人檢舉是一件事，不是十件），
// 由 admin_review_queue() 這支 SECURITY DEFINER RPC 組好——已隱藏的內容被 RLS
// 擋住，前端自己 join 是撈不到的。所有處置也都走 RPC，函式內再檢查一次 is_admin。

type ReviewQueueRow = {
  target_type: 'entry' | 'comment'
  target_id: string
  author_id: string | null
  author_name: string | null
  author_suspended: boolean
  content_preview: string | null
  moderation_status: string | null
  report_count: number
  auto_flagged: boolean
  reasons: string[] | null
  notes: string[] | null
  first_reported_at: string
  last_reported_at: string
  report_ids: string[]
}

type ReportAction = 'hide' | 'remove' | 'restore' | 'dismiss'

const REPORT_REASON_LABEL: Record<string, string> = {
  harassment: '騷擾或霸凌',
  spam: '垃圾訊息或廣告',
  inappropriate: '不當或冒犯內容',
  self_harm: '自我傷害疑慮',
  self_harm_promotion: '鼓勵自傷或自殺',
  hate: '仇恨或歧視',
  sexual: '性內容',
  violence: '暴力威脅',
  other: '其他',
}

const MODERATION_LABEL: Record<string, { label: string; cls: string }> = {
  ok: { label: '仍公開中', cls: 'bg-rust/15 text-rust' },
  hidden: { label: '已隱藏', cls: 'bg-muted text-muted-foreground' },
  removed: { label: '已下架', cls: 'bg-foreground/10 text-foreground/60' },
}

/** 距離第一次被檢舉過了多久——1.2 的 24 小時就看這個。 */
function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 36e5
}

function ReportsTab() {
  const { t } = useLanguage()
  const [status, setStatus] = useState<'pending' | 'all'>('pending')
  const [rows, setRows] = useState<ReviewQueueRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (s: 'pending' | 'all') => {
    setRows(null)
    const { data, error } = await supabase.rpc('admin_review_queue', { p_status: s })
    if (error) {
      // 最常見的原因是 community_safety.sql 還沒在 Supabase 跑過。
      setError(error.message)
      setRows([])
      return
    }
    setError(null)
    setRows((data as ReviewQueueRow[]) ?? [])
  }, [])

  useEffect(() => {
    void load(status)
  }, [load, status])

  const act = async (row: ReviewQueueRow, action: ReportAction, note: string | null) => {
    setBusy(row.target_id)
    const { error } = await supabase.rpc('admin_resolve_reports', {
      p_target_type: row.target_type,
      p_target_id: row.target_id,
      p_action: action,
      p_note: note,
    })
    setBusy(null)
    if (error) {
      setError(error.message)
      return
    }
    track('admin_report_resolved', { action, target_type: row.target_type })
    await load(status)
  }

  const suspend = async (row: ReviewQueueRow, days: number | null) => {
    if (!row.author_id) return
    setBusy(row.target_id)
    const { error } = await supabase.rpc('admin_suspend_user', {
      p_user_id: row.author_id,
      p_days: days,
      p_reason: t('違反社群守則（檢舉處理）'),
    })
    setBusy(null)
    if (error) {
      setError(error.message)
      return
    }
    track('admin_user_suspended', { days: days ?? 0 })
    await load(status)
  }

  const pending = (rows ?? []).filter((r) => hoursSince(r.first_reported_at) >= 24)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-foreground">{t('檢舉處理')}</h1>
        <div className="flex gap-2">
          {([['pending', '待處理'], ['all', '全部']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                status === key ? 'bg-foreground text-cream' : 'bg-card text-foreground hover:bg-muted'
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        {t('App Store 審查指南 1.2 要求 24 小時內處理檢舉。被兩位以上使用者檢舉的內容已由系統自動隱藏，仍需要在這裡確認下架或放回。')}
      </p>

      {pending.length > 0 && (
        <p className="mb-4 rounded-2xl bg-rust/10 px-4 py-3 text-sm font-bold text-rust">
          {t('有 {n} 件超過 24 小時尚未處理', { n: String(pending.length) })}
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-2xl bg-rust/10 px-4 py-3 text-sm text-rust">
          {t('讀取失敗：{msg}', { msg: error })}
        </p>
      )}

      {rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyHint>{t('目前沒有待處理的檢舉。')}</EmptyHint>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <ReportCard
              key={`${row.target_type}-${row.target_id}`}
              row={row}
              busy={busy === row.target_id}
              onAct={act}
              onSuspend={suspend}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ReportCard({
  row,
  busy,
  onAct,
  onSuspend,
}: {
  row: ReviewQueueRow
  busy: boolean
  onAct: (row: ReviewQueueRow, action: ReportAction, note: string | null) => Promise<void>
  onSuspend: (row: ReviewQueueRow, days: number | null) => Promise<void>
}) {
  const { t } = useLanguage()
  const [removing, setRemoving] = useState(false)
  const [suspending, setSuspending] = useState(false)
  const overdue = hoursSince(row.first_reported_at) >= 24
  const meta = MODERATION_LABEL[row.moderation_status ?? 'ok'] ?? MODERATION_LABEL.ok

  return (
    <article className={`rounded-3xl border bg-card p-5 shadow-soft ${overdue ? 'border-rust/50' : 'border-border'}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
          {row.target_type === 'entry' ? t('貼文') : t('留言')}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 ${meta.cls}`}>{t(meta.label)}</span>
        {row.auto_flagged && (
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-primary">{t('系統自動標記')}</span>
        )}
        {row.author_suspended && (
          <span className="rounded-full bg-foreground/10 px-2.5 py-0.5 text-foreground/70">{t('作者已停權')}</span>
        )}
        <span className={overdue ? 'text-rust' : 'text-muted-foreground'}>
          {t('{n} 次檢舉 · 首次 {time}', {
            n: String(row.report_count),
            time: formatDateTime(row.first_reported_at),
          })}
        </span>
      </div>

      <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-muted/50 px-4 py-3 text-[15px] leading-relaxed text-foreground">
        {row.content_preview || t('（內容已被作者刪除）')}
      </p>

      <div className="mt-3 space-y-1 text-sm">
        <Detail
          label={t('檢舉原因')}
          value={(row.reasons ?? []).map((r) => t(REPORT_REASON_LABEL[r] ?? r)).join('、') || null}
        />
        <Detail label={t('補充說明')} value={(row.notes ?? []).join(' / ') || null} />
        {/* 作者身分只給管理員看，不回寫到任何前台畫面，匿名貼文的匿名性不受影響。 */}
        <Detail label={t('作者')} value={row.author_name || row.author_id || null} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {row.moderation_status !== 'removed' && (
          <button
            disabled={busy}
            onClick={() => setRemoving(true)}
            className="rounded-full bg-rust px-4 py-2 text-sm font-extrabold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {t('確認違規並下架')}
          </button>
        )}
        {row.moderation_status !== 'hidden' && row.moderation_status !== 'removed' && (
          <button
            disabled={busy}
            onClick={() => void onAct(row, 'hide', null)}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-extrabold text-cream transition active:scale-[0.98] disabled:opacity-50"
          >
            {t('先隱藏待查')}
          </button>
        )}
        {row.moderation_status !== 'ok' && (
          <button
            disabled={busy}
            onClick={() => void onAct(row, 'restore', null)}
            className="rounded-full bg-card px-4 py-2 text-sm font-extrabold text-foreground ring-1 ring-border transition active:scale-[0.98] disabled:opacity-50"
          >
            {t('放回動態牆')}
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => void onAct(row, 'dismiss', null)}
          className="rounded-full px-4 py-2 text-sm font-bold text-muted-foreground transition disabled:opacity-50"
        >
          {t('內容沒問題，結案')}
        </button>
        {row.author_id && !row.author_suspended && (
          <button
            disabled={busy}
            onClick={() => setSuspending(true)}
            className="rounded-full px-4 py-2 text-sm font-bold text-rust transition disabled:opacity-50"
          >
            {t('停權作者')}
          </button>
        )}
      </div>

      {removing && (
        <ReasonDialog
          title={t('確認違規並下架')}
          placeholder={t('請說明下架理由（保留紀錄，供後續申訴查證）')}
          confirmLabel={t('確認下架')}
          onCancel={() => setRemoving(false)}
          onConfirm={(note) => {
            setRemoving(false)
            void onAct(row, 'remove', note)
          }}
        />
      )}
      {suspending && (
        <ConfirmDialog
          title={t('停權這位作者')}
          body={t('停權期間他無法發佈貼文與留言（仍可寫私人日記）。先停權 7 天，需要永久停權請在 Supabase 直接調整 user_suspensions。')}
          confirmLabel={t('停權 7 天')}
          onCancel={() => setSuspending(false)}
          onConfirm={() => {
            setSuspending(false)
            void onSuspend(row, 7)
          }}
        />
      )}
    </article>
  )
}

// ── 危機警示總覽 ────────────────────────────────────────────────────────────

type ReviewStatus = 'needs_attention' | 'handled' | 'false_positive'

type CrisisRow = {
  id: string
  user_id: string
  severity: string
  source: string | null
  entry_id: string | null
  // 以下欄位來自 supabase/admin_persona_crisis.sql 等後續 SQL；還沒執行時查不到，會是 undefined。
  context?: 'pro' | 'diary'
  diary_entry_id?: string | null
  notified_at?: string | null
  // 日記的發文時間（crisis_alerts_entry_date.sql）。created_at 是判讀的時間，補判舊日記時會全部同一天。
  entry_created_at?: string | null
  // 團隊人工確認（crisis_alerts_admin_review.sql）。acknowledged_at 是諮商師專用，後台不碰。
  review_status?: ReviewStatus | null
  review_note?: string | null
  reviewed_at?: string | null
  reviewer?: { name: string | null } | null
  matched_terms: string[] | null
  acknowledged_at: string | null
  created_at: string
}

type CrisisEntry = {
  practice_label: string
  entry_date: string | null
  is_shared: boolean
  moderation_status: string | null
  created_at?: string | null
  ai_feedback?: string | null
  fields: [string, string][]
}

const CRISIS_API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

const REVIEW_META: Record<ReviewStatus, { label: string; cls: string }> = {
  needs_attention: { label: '需要關注', cls: 'bg-gold text-[#5b3a12]' },
  handled: { label: '已處理', cls: 'bg-tile-mint text-[#71744F]' },
  false_positive: { label: '誤判', cls: 'bg-muted text-muted-foreground' },
}
type ReviewFilter = 'all' | 'unreviewed' | ReviewStatus

const CRISIS_SELECT_FULL =
  'id, user_id, severity, source, entry_id, context, diary_entry_id, notified_at, entry_created_at, review_status, review_note, reviewed_at, reviewer:profiles!crisis_alerts_reviewed_by_fkey(name), matched_terms, acknowledged_at, created_at'

function crisisContextLabel(r: CrisisRow): string {
  if (r.context === 'diary') return '每日練習'
  return r.entry_id ? '專業模組練習' : '測驗作答'
}

function CrisisOverviewTab() {
  const { t } = useLanguage()
  const [rows, setRows] = useState<CrisisRow[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [entries, setEntries] = useState<Record<string, CrisisEntry | string>>({})
  const [filter, setFilter] = useState<ReviewFilter>('unreviewed')

  const load = useCallback(async () => {
    const full = await supabase
      .from('crisis_alerts')
      .select(CRISIS_SELECT_FULL)
      .order('entry_created_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500)
    if (!full.error) {
      setRows((full.data as unknown as CrisisRow[]) ?? [])
      return
    }
    // 還沒執行後續 SQL 時新欄位不存在，退回舊欄位，畫面照常可用。
    console.warn('[crisis] 退回舊欄位：', full.error.message)
    const legacy = await supabase
      .from('crisis_alerts')
      .select('id, user_id, severity, source, entry_id, matched_terms, acknowledged_at, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
    setRows((legacy.data as CrisisRow[]) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (r: CrisisRow) => {
    if (openId === r.id) {
      setOpenId(null)
      return
    }
    setOpenId(r.id)
    if (!r.diary_entry_id || entries[r.id]) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(`${CRISIS_API_URL}/api/admin/crisis-entry/${r.id}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
      if (!resp.ok) throw new Error(`${resp.status}`)
      const body = (await resp.json()) as CrisisEntry
      setEntries((m) => ({ ...m, [r.id]: body }))
    } catch (e) {
      console.error('[crisis entry]', e)
      setEntries((m) => ({ ...m, [r.id]: t('讀取失敗，請稍後再試。') }))
    }
  }

  if (rows === null) return <Spinner />

  const counts: Record<ReviewFilter, number> = {
    all: rows.length,
    unreviewed: rows.filter((r) => !r.review_status).length,
    needs_attention: rows.filter((r) => r.review_status === 'needs_attention').length,
    handled: rows.filter((r) => r.review_status === 'handled').length,
    false_positive: rows.filter((r) => r.review_status === 'false_positive').length,
  }
  const FILTERS: { key: ReviewFilter; label: string }[] = [
    { key: 'unreviewed', label: '未確認' },
    { key: 'needs_attention', label: '需要關注' },
    { key: 'handled', label: '已處理' },
    { key: 'false_positive', label: '誤判' },
    { key: 'all', label: '全部' },
  ]
  const visible = rows.filter((r) =>
    filter === 'all' ? true : filter === 'unreviewed' ? !r.review_status : r.review_status === filter,
  )

  return (
    <div>
      <h1 className="mb-1 text-xl font-black text-foreground">{t('危機警示總覽')}</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('每日練習（含私密日記）與專業模組都會偵測。看過內容後，請在「人工確認」記下結果，系統不會自動確認。')}
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
              filter === f.key ? 'bg-foreground text-cream' : 'bg-card text-foreground hover:bg-muted'
            }`}
          >
            {t(f.label)} <span className="ml-1 tabular-nums opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <EmptyHint>{filter === 'unreviewed' ? t('所有警示都已經確認過了。') : t('目前沒有任何危機警示。')}</EmptyHint>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-4 py-3 font-bold">{t('發文時間')}</th>
                <th className="px-4 py-3 font-bold">{t('風險')}</th>
                <th className="px-4 py-3 font-bold">{t('情境')}</th>
                <th className="px-4 py-3 font-bold">{t('來源')}</th>
                <th className="px-4 py-3 font-bold">{t('關鍵字')}</th>
                <th className="px-4 py-3 font-bold">{t('人工確認')}</th>
                <th className="px-4 py-3 font-bold">{t('操作')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const entry = entries[r.id]
                const review = r.review_status ? REVIEW_META[r.review_status] : null
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        <div className="text-foreground">{formatDateTime(r.entry_created_at ?? r.created_at)}</div>
                        {r.entry_created_at && (
                          <div className="text-[11px]">{t('判讀')} {formatDateTime(r.created_at)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${RISK_META[r.severity]?.cls ?? 'bg-muted text-muted-foreground'}`}>
                          {RISK_META[r.severity] ? t(RISK_META[r.severity].label) : r.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {t(crisisContextLabel(r))}
                        <div className="font-mono text-[11px]">{r.user_id.slice(0, 8)}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.source === 'keyword' ? t('關鍵字') : r.source === 'ai' ? 'AI' : '—'}</td>
                      <td className="px-4 py-3 text-foreground/80">{r.matched_terms && r.matched_terms.length > 0 ? r.matched_terms.join('、') : '—'}</td>
                      <td className="px-4 py-3">
                        {review ? (
                          <>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${review.cls}`}>{t(review.label)}</span>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {r.reviewer?.name ?? t('（未具名）')}・{r.reviewed_at ? formatDateTime(r.reviewed_at) : ''}
                            </div>
                          </>
                        ) : (
                          <span className="font-bold text-rust">{t('未確認')}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button onClick={() => void toggle(r)} className="text-xs font-bold text-primary underline">
                          {openId === r.id ? t('收起') : t('看內容與確認')}
                        </button>
                      </td>
                    </tr>
                    {openId === r.id && (
                      <tr className="border-b border-border bg-muted">
                        <td colSpan={7} className="px-4 py-3">
                          {r.diary_entry_id && (
                            !entry ? (
                              <span className="text-muted-foreground">{t('讀取中…')}</span>
                            ) : typeof entry === 'string' ? (
                              <span className="text-rust">{entry}</span>
                            ) : (
                              <div className="text-sm">
                                <div className="mb-1 text-xs text-muted-foreground">
                                  {entry.practice_label}・{entry.entry_date}・{entry.is_shared ? t('公開到社群') : t('私密')}
                                  {entry.is_shared && entry.moderation_status === 'ok' && (
                                    <span className="ml-2 font-bold text-rust">{t('目前公開顯示在社群牆上')}</span>
                                  )}
                                </div>
                                {entry.fields.map(([label, text], i) => (
                                  <p key={i} className="text-foreground">
                                    <span className="mr-2 text-xs text-muted-foreground">{label}</span>
                                    {text}
                                  </p>
                                ))}
                                <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2">
                                  <div className="mb-1 text-xs font-bold text-muted-foreground">{t('當時 BOUBA 的回饋')}</div>
                                  {entry.ai_feedback ? (
                                    <p className="whitespace-pre-line text-foreground">{entry.ai_feedback}</p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">{t('這個練習沒有 BOUBA 回饋。')}</p>
                                  )}
                                </div>
                              </div>
                            )
                          )}
                          {!r.diary_entry_id && (
                            <p className="text-xs text-muted-foreground">
                              {t('專業模組的警示由負責的諮商師處理，內容請到諮商師後台查看。')}
                              {r.acknowledged_at && <span className="ml-2">{t('諮商師已知悉')}（{formatDateTime(r.acknowledged_at)}）</span>}
                            </p>
                          )}
                          <ReviewForm row={r} onSaved={load} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ReviewForm({ row, onSaved }: { row: CrisisRow; onSaved: () => Promise<void> }) {
  const { t } = useLanguage()
  const [status, setStatus] = useState<ReviewStatus | null>(row.review_status ?? null)
  const [note, setNote] = useState(row.review_note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!status) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.rpc('admin_review_crisis_alert', { p_alert_id: row.id, p_status: status, p_note: note })
    setSaving(false)
    if (err) {
      console.error('[crisis review]', err)
      setError(t('儲存失敗，請稍後再試。'))
      return
    }
    await onSaved()
  }

  return (
    <div className="mt-3 rounded-xl border-2 border-border bg-card px-3 py-3">
      <div className="mb-2 text-xs font-bold text-foreground">{t('人工確認（由團隊成員看過後手動記錄）')}</div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(REVIEW_META) as ReviewStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
              status === s ? `${REVIEW_META[s].cls} border-transparent` : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            {t(REVIEW_META[s].label)}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={t('處理備註（選填），例如：已私訊提供求助資源；AI 誤判，內容在寫電影情節')}
        className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={!status || saving}
          className="rounded-full bg-gradient-primary px-4 py-1.5 text-xs font-extrabold text-primary-foreground shadow-soft disabled:opacity-50"
        >
          {saving ? t('儲存中…') : row.review_status ? t('更新確認') : t('儲存確認')}
        </button>
        {error && <span className="text-xs font-bold text-rust">{error}</span>}
        {row.review_status && row.reviewed_at && (
          <span className="text-[11px] text-muted-foreground">
            {t('上次確認')}：{row.reviewer?.name ?? t('（未具名）')}・{formatDateTime(row.reviewed_at)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── App 版本控管 ────────────────────────────────────────────────────────────
// ── 訂閱管理 ────────────────────────────────────────────────────────────────
// 這階段不接金流：權益由管理員在這裡手動開通（見 supabase/subscriptions.sql）。
// 寫入一律走 set_user_subscription() RPC —— subscriptions 表沒有任何
// INSERT/UPDATE policy，使用者無法自行升級自己。

type SubscriptionRow = {
  user_id: string
  name: string | null
  email: string | null
  tier: string
  status: string
  is_founding_member: boolean
  expires_at: string | null
  note: string | null
  updated_at: string | null
}

const TIER_OPTIONS = [
  { value: 'free', label: '免費會員' },
  { value: 'pro', label: 'Pro 練心會員' },
  { value: 'pass', label: '練心通行證' },
]

const STATUS_OPTIONS = ['active', 'trialing', 'grace', 'canceled', 'expired']

// 創始成員申請（付費牆 CTA 的點擊紀錄）。
type IntentRow = {
  id: string
  user_id: string
  name: string | null
  email: string | null
  plan_code: string
  source: string | null
  created_at: string
  is_founding_member: boolean
  tier: string
}

function SubscriptionsTab() {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<SubscriptionRow[] | null>(null)
  const [seats, setSeats] = useState<{ remaining: number; total: number } | null>(null)
  const [intents, setIntents] = useState<IntentRow[] | null>(null)

  const load = useCallback(async (q: string) => {
    const [searchRes, seatsRes, cfgRes, intentRes] = await Promise.all([
      supabase.rpc('admin_search_subscriptions', { p_query: q }),
      supabase.rpc('founding_seats_remaining'),
      supabase.from('paywall_config').select('founding_quota_total').eq('id', 1).maybeSingle(),
      supabase.rpc('admin_list_paywall_intents', { p_limit: 100 }),
    ])
    if (intentRes.error) {
      console.error('[admin_list_paywall_intents]', intentRes.error)
      setIntents([])
    } else {
      setIntents((intentRes.data as IntentRow[]) ?? [])
    }
    if (searchRes.error) {
      console.error('[admin_search_subscriptions]', searchRes.error)
      setRows([])
    } else {
      setRows((searchRes.data as SubscriptionRow[]) ?? [])
    }
    const total = (cfgRes.data?.founding_quota_total ?? 0) as number
    const remaining = (seatsRes.data ?? 0) as number
    setSeats({ remaining, total })
  }, [])

  useEffect(() => { void load('') }, [load])

  return (
    <div>
      <h1 className="mb-1 text-xl font-black text-foreground">{t('訂閱管理')}</h1>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
        {t('這階段不接金流，付費權益由這裡手動開通。設定後伺服器端會立即依此判斷所有權益（週分析額度、社群貢獻換觀看、基線重測）。')}
      </p>
      {seats && (
        <p className="mb-4 text-xs font-bold text-primary">
          {t('創始名額：{used} / {total}', { used: seats.total - seats.remaining, total: seats.total })}
        </p>
      )}

      {/* 創始成員申請：付費牆 CTA 的點擊紀錄，待核准的排在最前面 */}
      <IntentInbox intents={intents} onApproved={() => load(query.trim())} />

      <div className="mb-4 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void load(query.trim()) }}
          placeholder={t('搜尋姓名或 email')}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          onClick={() => void load(query.trim())}
          className="shrink-0 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-95"
        >
          {t('搜尋')}
        </button>
      </div>

      {rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyHint>{t('找不到符合的使用者')}</EmptyHint>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <SubscriptionCard key={r.user_id} row={r} onSaved={() => load(query.trim())} />
          ))}
        </div>
      )}
    </div>
  )
}

function IntentInbox({ intents, onApproved }: { intents: IntentRow[] | null; onApproved: () => Promise<void> }) {
  const { t } = useLanguage()
  const [busyId, setBusyId] = useState<string | null>(null)

  if (intents === null) return null

  // 同一個人可能按過多次 CTA，只留每人最新那筆，避免收件匣被重複紀錄洗版。
  const latestByUser = new Map<string, IntentRow>()
  for (const i of intents) if (!latestByUser.has(i.user_id)) latestByUser.set(i.user_id, i)
  const unique = [...latestByUser.values()]
  // ⚠️ 付費意願測試期間：點過 CTA 的人「已經」享有完整權益（見 is_pro()），
  //    這裡的「核准」只是額外加上「創始成員」徽章，不是開通權益。
  //    所以沒有所謂「待處理」——不要用紅色待辦數字暗示有人在等。
  const withoutBadge = unique.filter((i) => !i.is_founding_member)

  const approve = async (row: IntentRow) => {
    setBusyId(row.id)
    // 這些人已經有完整權益了（點過 CTA 就有）。這一步是額外授予「創始成員」
    // 徽章，讓他們的貼文掛上標記；順手把 tier 也設成 pro，讓後台狀態一目瞭然。
    const { error } = await supabase.rpc('set_user_subscription', {
      p_user_id: row.user_id,
      p_tier: 'pro',
      p_status: 'active',
      p_is_founding: true,
      p_price_plan_code: row.plan_code,
      p_expires_at: null,
      p_note: '創始成員申請核准',
    })
    setBusyId(null)
    if (error) {
      console.error('[approve founding member]', error)
      return
    }
    await onApproved()
  }

  return (
    <div className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[15px] font-black text-foreground">{t('點過付費按鈕的人')}</h2>
        <span className="rounded-full bg-tile-mint px-2 py-0.5 text-[11px] font-extrabold text-foreground">
          {t('共 {n} 人', { n: unique.length })}
        </span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        {t('這些人點過付費牆的 CTA，已自動享有完整權益（全部分析、全部報告、社群無限瀏覽）。下方按鈕只是額外加上「創始成員」徽章。')}
      </p>

      {unique.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('目前還沒有人點過')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* 還沒給徽章的排前面，方便快速補發 */}
          {[...withoutBadge, ...unique.filter((i) => i.is_founding_member)].map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-background px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{row.name || row.email}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {row.plan_code === 'pro_yearly' ? t('年繳') : t('月繳')}
                  {' · '}
                  {new Date(row.created_at).toLocaleDateString('zh-TW')}
                </p>
              </div>
              {row.is_founding_member ? (
                <span className="shrink-0 rounded-full bg-gold px-2.5 py-1 text-[11px] font-extrabold text-ink-deep">
                  {t('已有徽章')}
                </span>
              ) : (
                <button
                  onClick={() => void approve(row)}
                  disabled={busyId === row.id}
                  className="shrink-0 rounded-full bg-gradient-primary px-3 py-1.5 text-xs font-extrabold text-primary-foreground shadow-soft transition active:scale-95 disabled:opacity-40"
                >
                  {busyId === row.id ? t('儲存中…') : t('給予創始成員徽章')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SubscriptionCard({ row, onSaved }: { row: SubscriptionRow; onSaved: () => Promise<void> }) {
  const { t } = useLanguage()
  const [tier, setTier] = useState(row.tier)
  const [status, setStatus] = useState(row.status)
  const [founding, setFounding] = useState(row.is_founding_member)
  const [note, setNote] = useState(row.note ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty =
    tier !== row.tier || status !== row.status ||
    founding !== row.is_founding_member || note.trim() !== (row.note ?? '')

  const save = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('set_user_subscription', {
      p_user_id: row.user_id,
      p_tier: tier,
      p_status: status,
      p_is_founding: founding,
      p_price_plan_code: null,
      p_expires_at: null,
      p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) {
      console.error('[set_user_subscription]', error)
      setError(t('更新失敗'))
      return
    }
    await onSaved()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate text-[15px] font-black text-foreground">
          {row.name || t('未設定名稱')}
        </h2>
        {row.is_founding_member && (
          <span className="shrink-0 rounded-full bg-gold px-2 py-0.5 text-[11px] font-extrabold text-ink-deep">
            {t('創始會員')}
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.email}</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {t('方案層級')}
          </span>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          >
            {TIER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.label)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {t('狀態')}
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          >
            {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={founding}
            onChange={(e) => setFounding(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm font-bold text-foreground">{t('設為創始會員')}</span>
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          {t('備註')}
        </span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>

      {error && <p className="mt-2 text-xs font-semibold text-red-500">{error}</p>}

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={!dirty || busy}
          className="rounded-full bg-gradient-primary px-4 py-2 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-95 disabled:opacity-40"
        >
          {busy ? t('儲存中…') : t('儲存訂閱設定')}
        </button>
        {saved && <span className="text-xs font-bold text-primary">{t('已更新')}</span>}
      </div>
    </div>
  )
}

// 管理 app_config 表：低於 min_version 的原生殼會被 src/lib/appVersion.ts
// 全螢幕擋下強制更新。寫入走 update_app_config RPC（內含 is_admin 檢查），
// 詳見 supabase/app_config.sql 開頭註解。

type AppPlatform = 'ios' | 'android'

type AppConfigRow = {
  platform: AppPlatform
  min_version: string
  update_url: string | null
  update_message: string | null
  updated_at: string
}

const PLATFORMS: { key: AppPlatform; label: string }[] = [
  { key: 'ios', label: 'iOS' },
  { key: 'android', label: 'Android' },
]

function AppVersionTab() {
  const { t } = useLanguage()
  const [rows, setRows] = useState<Record<AppPlatform, AppConfigRow | null> | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('app_config').select('*')
    const list = (data as AppConfigRow[]) ?? []
    setRows({
      ios: list.find((r) => r.platform === 'ios') ?? null,
      android: list.find((r) => r.platform === 'android') ?? null,
    })
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (rows === null) return <Spinner />

  return (
    <div>
      <h1 className="mb-1 text-xl font-black text-foreground">{t('App 版本控管')}</h1>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        {t('把某平台的「最低版本」調高，低於這個版本的使用者下次開 App 會被全螢幕擋下、導去商店更新，無法略過。網頁版使用者不受影響。')}
      </p>
      <div className="flex flex-col gap-4">
        {PLATFORMS.map((p) => (
          <PlatformConfigCard key={p.key} platform={p.key} label={p.label} row={rows[p.key]} onSaved={load} />
        ))}
      </div>
    </div>
  )
}

function PlatformConfigCard({
  platform,
  label,
  row,
  onSaved,
}: {
  platform: AppPlatform
  label: string
  row: AppConfigRow | null
  onSaved: () => Promise<void>
}) {
  const { t } = useLanguage()
  const [minVersion, setMinVersion] = useState(row?.min_version ?? '')
  const [updateUrl, setUpdateUrl] = useState(row?.update_url ?? '')
  const [updateMessage, setUpdateMessage] = useState(row?.update_message ?? '')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty =
    minVersion.trim() !== (row?.min_version ?? '') ||
    updateUrl.trim() !== (row?.update_url ?? '') ||
    updateMessage.trim() !== (row?.update_message ?? '')

  const save = async () => {
    if (!minVersion.trim()) {
      setError(t('請填寫最低版本號'))
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('update_app_config', {
      p_platform: platform,
      p_min_version: minVersion.trim(),
      p_update_url: updateUrl.trim() || null,
      p_update_message: updateMessage.trim() || null,
    })
    setBusy(false)
    setConfirming(false)
    if (error) {
      console.error('[update app_config]', error)
      setError(t('儲存失敗，請稍後再試。'))
      return
    }
    await onSaved()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-black text-foreground">{label}</h2>
        {row ? (
          <span className="text-xs text-muted-foreground">
            {t('目前門檻 {v}', { v: row.min_version })}
          </span>
        ) : (
          <span className="rounded-full bg-tile-peach px-2 py-0.5 text-[11px] font-extrabold text-[#8a6320]">
            {t('尚未設定')}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {t('最低版本號')}
          </span>
          <input
            value={minVersion}
            onChange={(e) => setMinVersion(e.target.value)}
            placeholder="1.2"
            className="w-40 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {t('商店更新連結（選填）')}
          </span>
          <input
            value={updateUrl}
            onChange={(e) => setUpdateUrl(e.target.value)}
            placeholder="https://apps.apple.com/app/id..."
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {t('自訂說明文字（選填，留空用預設文案）')}
          </span>
          <textarea
            value={updateMessage}
            rows={2}
            onChange={(e) => setUpdateMessage(e.target.value)}
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm font-bold text-rust">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => setConfirming(true)}
          disabled={busy || !dirty}
          className="rounded-full bg-gradient-primary px-5 py-2 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-50"
        >
          {t('儲存')}
        </button>
        {saved && <span className="text-sm font-bold text-[#3f6b46]">{t('已儲存')}</span>}
      </div>

      {confirming && (
        <ConfirmDialog
          title={t('確認調整 {platform} 的更新門檻？', { platform: label })}
          body={t('低於 {v} 的使用者下次開 App 會被強制要求更新，無法略過。請確認版本號填寫正確。', { v: minVersion.trim() })}
          confirmLabel={busy ? t('儲存中…') : t('確認儲存')}
          onConfirm={save}
          onCancel={() => !busy && setConfirming(false)}
        />
      )}
    </div>
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
        <p className="mt-2 text-[15px] leading-relaxed text-foreground/80">{body}</p>
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

// ── 共用小元件 ──────────────────────────────────────────────────────────────

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <p className="text-foreground/85">
      <span className="font-bold text-muted-foreground">{label}：</span>
      {value}
    </p>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function ReasonDialog({
  title,
  placeholder,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  placeholder: string
  confirmLabel: string
  onConfirm: (note: string) => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  const [note, setNote] = useState('')
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1c1714]/40 px-6" onClick={onCancel}>
      <div className="w-full max-w-md rounded-[24px] bg-background p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-foreground">{title}</h2>
        <textarea
          value={note}
          rows={3}
          autoFocus
          placeholder={placeholder}
          onChange={(e) => setNote(e.target.value)}
          className="mt-3 w-full resize-none rounded-xl border border-border bg-card px-4 py-2.5 text-[15px] leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => onConfirm(note.trim())}
            disabled={!note.trim()}
            className="w-full rounded-full bg-rust py-3 text-base font-extrabold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-50"
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
