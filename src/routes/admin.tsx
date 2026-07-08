// 管理後台（/admin）— 隱藏頂層路由，桌機優先。非 admin（含一般登入者）看到通用「找不到頁面」，
// 不透露這是後台。四分頁：夥伴申請、模組審核（AI 標籤僅供參考）、已上架模組、危機警示總覽。
// 審核動作走 SECURITY DEFINER RPC（內含 is_admin 檢查）。
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import { BlockRenderer } from '../components/pro/BlockRenderer'
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

type Tab = 'applications' | 'reviews' | 'published' | 'crises'

function AdminConsole() {
  const { t } = useLanguage()
  const [tab, setTab] = useState<Tab>('applications')

  const TABS: { key: Tab; label: string }[] = [
    { key: 'applications', label: t('夥伴申請') },
    { key: 'reviews', label: t('模組審核') },
    { key: 'published', label: t('已上架模組') },
    { key: 'crises', label: t('危機警示總覽') },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="flex flex-wrap gap-2 lg:flex-col">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-2xl px-4 py-2.5 text-left text-[15px] font-bold transition ${
              tab === t.key ? 'bg-foreground text-cream shadow-soft' : 'bg-card text-foreground hover:bg-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </aside>
      <section className="min-w-0">
        {tab === 'applications' && <ApplicationsTab />}
        {tab === 'reviews' && <ModuleReviewTab />}
        {tab === 'published' && <PublishedModulesTab />}
        {tab === 'crises' && <CrisisOverviewTab />}
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
  diary: { label: '日記', cls: 'bg-tile-mint text-[#3f6b46]' },
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
  low: { label: '低風險', cls: 'bg-tile-mint text-[#3f6b46]' },
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
        <p className="mt-1 text-sm text-[#3f6b46]">{t('未發現疑慮。')}</p>
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

// ── 危機警示總覽 ────────────────────────────────────────────────────────────

type CrisisRow = {
  id: string
  severity: string
  source: string | null
  entry_id: string | null
  matched_terms: string[] | null
  acknowledged_at: string | null
  created_at: string
}

function CrisisOverviewTab() {
  const { t } = useLanguage()
  const [rows, setRows] = useState<CrisisRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('crisis_alerts')
      .select('id, severity, source, entry_id, matched_terms, acknowledged_at, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (!cancelled) setRows((data as CrisisRow[]) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (rows === null) return <Spinner />

  return (
    <div>
      <h1 className="mb-4 text-xl font-black text-foreground">{t('危機警示總覽')}</h1>
      {rows.length === 0 ? (
        <EmptyHint>{t('目前沒有任何危機警示。')}</EmptyHint>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-4 py-3 font-bold">{t('時間')}</th>
                <th className="px-4 py-3 font-bold">{t('風險')}</th>
                <th className="px-4 py-3 font-bold">{t('情境')}</th>
                <th className="px-4 py-3 font-bold">{t('來源')}</th>
                <th className="px-4 py-3 font-bold">{t('關鍵字')}</th>
                <th className="px-4 py-3 font-bold">{t('狀態')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${RISK_META[r.severity]?.cls ?? 'bg-muted text-muted-foreground'}`}>
                      {RISK_META[r.severity] ? t(RISK_META[r.severity].label) : r.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.entry_id ? t('一般練習') : t('測驗作答')}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.source === 'keyword' ? t('關鍵字') : r.source === 'ai' ? 'AI' : '—'}</td>
                  <td className="px-4 py-3 text-foreground/80">{r.matched_terms && r.matched_terms.length > 0 ? r.matched_terms.join('、') : '—'}</td>
                  <td className="px-4 py-3">
                    {r.acknowledged_at ? (
                      <span className="text-[#3f6b46]">{t('已知悉')}</span>
                    ) : (
                      <span className="font-bold text-rust">{t('未處理')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
