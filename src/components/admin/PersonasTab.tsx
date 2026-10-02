// 後台「使用者 Persona」分頁。
// persona 由後端產生（backend/persona_builder.py）：只用公開分享到社群的日記，
// 對「公開日記超過 40 篇」的使用者，按一下按鈕就在背景全部重建，進度寫在 persona_refresh_runs。
// user_personas 與 persona_refresh_runs 的 RLS 只放行 admin（supabase/admin_persona_crisis.sql）。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../lib/i18n/context'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

type PainStatus = 'active' | 'improving' | 'resolved'
type PersonaItem = { tag: string; text: string; evidence: string[]; confidence: number; status?: PainStatus }
type Persona = {
  label: string
  summary: string
  life_stage: string
  values: string[]
  pains: PersonaItem[]
  strengths: PersonaItem[]
  coping_that_works: string[]
  goals: { text: string; source: string; status: string }[]
  people: string[]
  rhythm: Record<string, string>
  voice: Record<string, string>
  service_hooks: string[]
  watch_outs: string[]
  restricted: boolean
  restricted_reason: string
}
type PersonaRow = {
  user_id: string
  data: Persona
  entry_count: number
  entries_used: number
  restricted: boolean
  version: number
  updated_at: string
}
type RunRow = {
  id: string
  status: 'running' | 'done' | 'failed'
  min_entries: number
  total: number | null
  done: number
  failed: number
  error: string | null
  started_at: string
  finished_at: string | null
}

// 與 backend/persona_builder.py 的 PAIN_TAGS / STRENGTH_TAGS 同步。
const TAG_LABEL: Record<string, string> = {
  work_stress: '工作壓力', study_stress: '課業研究壓力', procrastination: '拖延', focus: '專注困難',
  transition_adjustment: '轉換適應', setback: '挫折', burnout_history: '過往耗竭', anxiety_uncertainty: '焦慮與不確定',
  self_criticism: '自我批評', comparison: '和別人比較', rumination: '反覆內耗', emotional_regulation: '情緒調節',
  grief_loss: '失落與哀傷', life_crisis: '生命困境', relationship_strain: '關係困擾', family_tension: '家庭摩擦',
  loneliness: '孤單', boundaries: '界線', social_anxiety: '社交焦慮', social_fatigue: '社交疲憊',
  caregiver_worry: '照顧者的擔心', health_body: '身體健康', sleep_wake: '睡眠與起床', phone_overuse: '手機成癮',
  eating_impulse: '飲食衝動', financial_stress: '經濟壓力',
  self_reflection: '自我覺察', resilience: '韌性', reframing: '轉念', gratitude_noticing: '看見善意',
  self_care_routine: '自我照顧', caring_for_others: '照顧他人', discipline: '自律', social_connection: '人際連結',
  emotional_expression: '表達感受', learning_curiosity: '好奇與學習', humor: '幽默', help_seeking: '願意求助',
  boundary_setting: '設立界線', self_compassion: '自我慈悲', courage: '勇氣', small_steps: '拆成小步驟', flow: '心流',
  other: '其他',
}
const GOAL_STATUS: Record<string, string> = {
  in_progress: '進行中', done: '已完成', planned: '計畫中', stalled: '卡住', failed: '未成功',
}
const STATUS_META: Record<PainStatus, { label: string; cls: string; bar: string }> = {
  active: { label: '持續中', cls: 'bg-rust text-white', bar: 'bg-rust' },
  improving: { label: '改善中', cls: 'bg-gold text-[#5b3a12]', bar: 'bg-gold' },
  resolved: { label: '已過去', cls: 'bg-muted text-muted-foreground', bar: 'bg-border' },
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function PersonasTab() {
  const { t } = useLanguage()
  const [rows, setRows] = useState<PersonaRow[] | null>(null)
  const [run, setRun] = useState<RunRow | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [painFilter, setPainFilter] = useState('')

  const load = useCallback(async () => {
    const [{ data: personas }, { data: runs }] = await Promise.all([
      supabase
        .from('user_personas')
        .select('user_id, data, entry_count, entries_used, restricted, version, updated_at')
        .order('entry_count', { ascending: false }),
      supabase.from('persona_refresh_runs').select('*').order('started_at', { ascending: false }).limit(1),
    ])
    setRows((personas as PersonaRow[]) ?? [])
    setRun(((runs as RunRow[]) ?? [])[0] ?? null)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 刷新進行中就每 3 秒更新一次進度與結果。
  useEffect(() => {
    if (run?.status !== 'running') return
    const id = window.setInterval(() => void load(), 3000)
    return () => window.clearInterval(id)
  }, [run?.status, load])

  const refresh = async () => {
    setStarting(true)
    setError(null)
    try {
      const resp = await fetch(`${API_URL}/api/admin/personas/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      })
      if (!resp.ok) throw new Error(`${resp.status} ${await resp.text()}`)
      const body = (await resp.json()) as { run: RunRow }
      setRun(body.run)
    } catch (e) {
      console.error('[persona refresh]', e)
      setError(t('啟動失敗，請稍後再試。'))
    } finally {
      setStarting(false)
    }
  }

  const full = useMemo(() => (rows ?? []).filter((r) => !r.restricted), [rows])
  const restricted = useMemo(() => (rows ?? []).filter((r) => r.restricted), [rows])
  const painTags = useMemo(
    () => [...new Set(full.flatMap((r) => r.data.pains.map((p) => p.tag)))].sort(),
    [full],
  )
  const visible = full.filter((r) => {
    const q = query.trim().toLowerCase()
    const hay = [r.user_id, r.data.label, r.data.summary, ...r.data.pains.map((p) => p.text)].join(' ').toLowerCase()
    return (!q || hay.includes(q)) && (!painFilter || r.data.pains.some((p) => p.tag === painFilter))
  })

  if (rows === null) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const running = run?.status === 'running'
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-foreground">{t('使用者 Persona')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('只用公開分享到社群的日記產生，不含私密日記。對公開日記超過 {n} 篇的使用者建立。', { n: run?.min_entries ?? 40 })}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={starting || running}
          className="rounded-full bg-gradient-primary px-5 py-2 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
        >
          {running ? t('刷新中…') : t('刷新 persona（超過 40 篇）')}
        </button>
      </div>

      {run && (
        <div className="mb-4 rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-soft">
          {running ? (
            <>
              <div className="mb-2 font-bold text-foreground">
                {t('刷新中：{done} / {total} 位完成', { done: run.done + run.failed, total: run.total ?? '…' })}
                {run.failed > 0 && <span className="ml-2 text-rust">{t('{n} 位失敗', { n: run.failed })}</span>}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${run.total ? ((run.done + run.failed) / run.total) * 100 : 5}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t('每位約需 20～40 秒，可以先離開這頁，背景會繼續跑。')}</p>
            </>
          ) : (
            <span className="text-muted-foreground">
              {run.status === 'done'
                ? t('上次刷新：{time}，完成 {done} 位', { time: fmt(run.finished_at), done: run.done })
                : t('上次刷新失敗：{time}', { time: fmt(run.finished_at) })}
              {run.failed > 0 && <span className="ml-2 text-rust">{t('{n} 位失敗', { n: run.failed })}</span>}
              {run.error && <span className="ml-2 text-xs">（{run.error}）</span>}
            </span>
          )}
        </div>
      )}
      {error && <p className="mb-4 text-sm font-bold text-rust">{error}</p>}

      {full.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t('還沒有任何 persona，按右上角的按鈕產生。')}
        </p>
      ) : (
        <>
          <PainStats rows={full} />
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('搜尋 ID、標題、內容…')}
              className="min-w-[180px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
            />
            <select
              value={painFilter}
              onChange={(e) => setPainFilter(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">{t('全部痛點')}</option>
              {painTags.map((tag) => (
                <option key={tag} value={tag}>{t(TAG_LABEL[tag] ?? tag)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-3">
            {visible.map((r) => <PersonaCard key={r.user_id} row={r} />)}
          </div>
        </>
      )}

      {restricted.length > 0 && (
        <div className="mt-6 rounded-2xl border-2 border-rust bg-card p-4">
          <h2 className="font-black text-rust">{t('需要人工處理（{n} 位）', { n: restricted.length })}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('疑似未成年或近期有自我傷害相關內容，不做自動化個人化。請到「危機警示總覽」確認，或由負責人員人工檢視。')}
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {restricted.map((r) => (
              <li key={r.user_id}>
                <span className="font-mono text-xs text-muted-foreground">{r.user_id.slice(0, 8)}</span>
                <span className="ml-2">{r.data.restricted_reason || r.data.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PainStats({ rows }: { rows: PersonaRow[] }) {
  const { t } = useLanguage()
  const n = rows.length
  const stats = useMemo(() => {
    const byTag = new Map<string, Record<PainStatus, number>>()
    for (const r of rows) {
      for (const p of r.data.pains) {
        const s = byTag.get(p.tag) ?? { active: 0, improving: 0, resolved: 0 }
        s[p.status ?? 'active'] += 1
        byTag.set(p.tag, s)
      }
    }
    const list = [...byTag.entries()]
      .map(([tag, s]) => ({ tag, ...s, total: s.active + s.improving + s.resolved }))
      .sort((a, b) => b.total - a.total)
    const all = rows.flatMap((r) => r.data.pains)
    return {
      list,
      avg: all.length / n,
      activeAvg: all.filter((p) => p.status === 'active').length / n,
      improvingPct: all.length ? Math.round((all.filter((p) => p.status === 'improving').length / all.length) * 100) : 0,
    }
  }, [rows, n])

  return (
    <details open className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <summary className="cursor-pointer font-black text-foreground">{t('痛點統計（{n} 人）', { n })}</summary>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Kpi value={stats.avg.toFixed(1)} label={t('平均每人痛點數')} />
        <Kpi value={stats.activeAvg.toFixed(1)} label={t('平均每人「持續中」')} />
        <Kpi value={`${stats.improvingPct}%`} label={t('標為「改善中」')} />
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        {(Object.keys(STATUS_META) as PainStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${STATUS_META[s].bar}`} />
            {t(STATUS_META[s].label)}
          </span>
        ))}
      </div>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {stats.list.map((s) => (
            <tr key={s.tag}>
              <td className="w-[32%] whitespace-nowrap py-1 pr-2 text-foreground">{t(TAG_LABEL[s.tag] ?? s.tag)}</td>
              <td className="w-full py-1">
                <div className="flex h-3 min-w-[120px] overflow-hidden rounded bg-muted">
                  {(Object.keys(STATUS_META) as PainStatus[]).map((st) => (
                    <span key={st} className={STATUS_META[st].bar} style={{ width: `${(s[st] / n) * 100}%` }} />
                  ))}
                </div>
              </td>
              <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums text-muted-foreground">
                {s.total} {t('人')}・{Math.round((s.total / n) * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        {t('痛點與狀態是 AI 讀公開日記後的判斷，不是使用者自評，僅供參考。')}
      </p>
    </details>
  )
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2">
      <div className="text-xl font-black tabular-nums text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function PersonaCard({ row }: { row: PersonaRow }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const p = row.data
  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted-foreground">{row.user_id.slice(0, 8)}</div>
          <div className="text-[16px] font-black text-foreground">{p.label}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {p.pains.filter((x) => x.status !== 'resolved').slice(0, 4).map((x, i) => (
              <span key={`p${i}`} className="rounded-full bg-tile-pink px-2 py-0.5 text-[11px] font-bold text-rust">
                {t(TAG_LABEL[x.tag] ?? x.tag)}
              </span>
            ))}
            {p.strengths.slice(0, 3).map((x, i) => (
              <span key={`s${i}`} className="rounded-full bg-tile-mint px-2 py-0.5 text-[11px] font-bold text-[#71744F]">
                {t(TAG_LABEL[x.tag] ?? x.tag)}
              </span>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <div className="text-lg font-black text-foreground">{row.entry_count}</div>
          {t('篇公開日記')}
          <div className="mt-1">v{row.version}・{fmt(row.updated_at)}</div>
        </div>
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 text-sm">
          <p className="text-foreground">{p.summary}</p>
          <p className="mt-2 text-muted-foreground"><b className="mr-2">{t('人生階段')}</b>{p.life_stage}</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <Section title={t('痛點')}>
              {p.pains.map((x, i) => <Item key={i} item={x} showStatus />)}
            </Section>
            <Section title={t('長處')}>
              {p.strengths.map((x, i) => <Item key={i} item={x} />)}
            </Section>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <List title={t('價值觀')} items={p.values} />
            <List title={t('有效的調適方式')} items={p.coping_that_works} />
            <List title={t('重要他人')} items={p.people} />
          </div>
          <List title={t('目標')} items={p.goals.map((g) => `${g.text}（${t(GOAL_STATUS[g.status] ?? g.status)}）`)} />
          <div className="mt-3 rounded-xl bg-tile-mint px-3 py-2">
            <List title={t('個人化服務建議')} items={p.service_hooks} />
          </div>
          {p.watch_outs.length > 0 && (
            <details className="mt-3 rounded-xl border border-gold px-3 py-2">
              <summary className="cursor-pointer text-xs font-bold text-[#8a6320]">{t('注意事項（{n}）', { n: p.watch_outs.length })}</summary>
              <List title="" items={p.watch_outs} />
            </details>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {t('依據 {used} 篇公開日記產生（共 {total} 篇；太長時只取最近的）。', { used: row.entries_used, total: row.entry_count })}
          </p>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-bold text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </section>
  )
}

function Item({ item, showStatus }: { item: PersonaItem; showStatus?: boolean }) {
  const { t } = useLanguage()
  const st = item.status ? STATUS_META[item.status] : null
  return (
    <li className="rounded-xl bg-muted px-3 py-2">
      <div className="mb-0.5 flex items-center gap-1.5 text-[11px]">
        {showStatus && st && <span className={`rounded px-1.5 font-bold ${st.cls}`}>{t(st.label)}</span>}
        <span className="font-bold text-muted-foreground">{t(TAG_LABEL[item.tag] ?? item.tag)}</span>
        <span className="ml-auto text-muted-foreground">{Math.round(item.confidence * 100)}%</span>
      </div>
      <div className="text-foreground">{item.text}</div>
      {item.evidence.length > 0 && (
        <div className="text-[11px] text-muted-foreground">{t('依據')}：{item.evidence.join('、')}</div>
      )}
    </li>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <section className="mt-2">
      {title && <h3 className="mb-1 text-xs font-bold text-muted-foreground">{title}</h3>}
      <ul className="list-inside list-disc text-foreground">
        {items.map((v, i) => <li key={i}>{v}</li>)}
      </ul>
    </section>
  )
}
