// 後台「使用者 Persona」分頁。版面與本機的 workshop-reports/personas-20plus.html 一致：
// 痛點統計（含大類別、共同出現）、搜尋與篩選、畫廊模式、莫奈風格自畫像、看全部公開日記。
//
// persona 由後端產生（backend/persona_builder.py）：只用公開分享到社群的日記，
// 對「公開日記超過 40 篇」的使用者，按一下按鈕就在背景全部重建，進度寫在 persona_refresh_runs。
// user_personas 與 persona_refresh_runs 的 RLS 只放行 admin（supabase/admin_persona_crisis.sql）。
// 「看全部公開日記」讀的是 gratitude_entries 的公開貼文，沿用既有 RLS（公開且審核通過），不會讀到私密日記。
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../lib/i18n/context'
import { monetPortraitUrl, SCENE_LABEL, type PortraitSpec } from './monetPortrait'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

type PainStatus = 'active' | 'improving' | 'resolved'
type PersonaItem = { tag: string; text: string; evidence: string[]; confidence: number; status?: PainStatus }
type PersonaMeta = {
  display_name: string
  first_date: string | null
  last_date: string | null
  active_days: number
  practice_counts: Record<string, number>
  chars: number
}
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
  // 下面兩欄是後來加的；舊版 persona 沒有，重新刷新後才會有。
  portrait?: PortraitSpec | null
  meta?: PersonaMeta
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
const PAIN_GROUPS: Record<string, string[]> = {
  工作與課業: ['work_stress', 'study_stress', 'procrastination', 'focus', 'burnout_history', 'setback', 'transition_adjustment'],
  情緒與內在: ['anxiety_uncertainty', 'self_criticism', 'comparison', 'rumination', 'emotional_regulation', 'life_crisis', 'grief_loss'],
  身體與習慣: ['health_body', 'sleep_wake', 'phone_overuse', 'eating_impulse'],
  人際關係: ['relationship_strain', 'family_tension', 'loneliness', 'boundaries', 'social_anxiety', 'social_fatigue', 'caregiver_worry'],
  經濟: ['financial_stress'],
}
const STATUS_META: Record<PainStatus, { label: string; cls: string; bar: string }> = {
  active: { label: '持續中', cls: 'bg-rust text-white', bar: 'bg-rust' },
  improving: { label: '改善中', cls: 'bg-gold text-[#5b3a12]', bar: 'bg-gold' },
  resolved: { label: '已過去', cls: 'bg-muted text-muted-foreground', bar: 'bg-border' },
}
const GOAL_STATUS: Record<string, string> = {
  in_progress: '進行中', done: '已完成', planned: '計畫中', stalled: '卡住', failed: '未成功',
}
const PRACTICE_LABEL: Record<string, string> = {
  gratitude: '感恩日記', process_goal: '過程目標覺察', self_compassion: '自我慈悲', woop: 'WOOP',
}
// PsyByPsy 團隊成員（user_id 前 8 碼）。分析使用者時應排除；新增成員時一併更新。
const TEAM_IDS = new Set(['ec217c28', '468516b3', '949dcbde'])

// 「看全部公開日記」的欄位，與 backend/diary_safety.py 的 DIARY_FIELDS 同步（只列使用者自己寫的欄位）。
const DIARY_FIELDS: Record<string, [string, string][]> = {
  gratitude: [['item_1', '1'], ['item_2', '2'], ['item_3', '3']],
  process_goal: [['situation', '情境'], ['event', '事件'], ['who', '人'], ['when', '時間'], ['where', '地點']],
  self_compassion: [['situation', '情境'], ['awareness', '覺察'], ['humanity', '共同人性'], ['to_friend', '對朋友說'], ['to_self', '對自己說']],
  woop: [['wish', '願望'], ['outcome', '結果'], ['obstacle', '阻礙'], ['plan', '計畫']],
}
const RISK_WORDS = /(割腕|自殺|自殘|傷害自己|不想活|活不下去|想死|結束生命|想消失)/g

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const displayName = (r: PersonaRow) => r.data.meta?.display_name || r.user_id.slice(0, 8)
const portraitUrl = (r: PersonaRow) =>
  r.data.portrait ? monetPortraitUrl(r.data.portrait, r.user_id, `${displayName(r)} ${new Date(r.updated_at).getFullYear()}`) : null

export function PersonasTab() {
  const { t } = useLanguage()
  const [rows, setRows] = useState<PersonaRow[] | null>(null)
  const [run, setRun] = useState<RunRow | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [painFilter, setPainFilter] = useState('')
  const [gallery, setGallery] = useState(false)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

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
  const painTags = useMemo(() => [...new Set(full.flatMap((r) => r.data.pains.map((p) => p.tag)))].sort(), [full])
  const visible = full.filter((r) => {
    const q = query.trim().toLowerCase()
    const hay = [r.user_id, displayName(r), r.data.label, r.data.summary, ...r.data.pains.map((p) => p.text), ...r.data.strengths.map((p) => p.text)]
      .join(' ')
      .toLowerCase()
    return (!q || hay.includes(q)) && (!painFilter || r.data.pains.some((p) => p.tag === painFilter))
  })
  const allOpen = visible.length > 0 && visible.every((r) => openIds.has(r.user_id))
  const toggleOpen = (id: string) =>
    setOpenIds((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
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
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
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

      <div className="mb-4 rounded-xl border-l-4 border-gold bg-muted px-4 py-2 text-sm text-foreground">
        {t('每張卡片展開後可按「看全部公開日記」，只包含分享到社群的日記，不含私密日記。含自我傷害相關字眼的篇章會以紅框標出。標「團隊成員」的是 PsyByPsy 內部人員，分析時請排除。')}
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
                <div className="h-full bg-primary transition-all" style={{ width: `${run.total ? ((run.done + run.failed) / run.total) * 100 : 5}%` }} />
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
          <div className="sticky top-0 z-10 mb-3 flex flex-wrap gap-2 border-b border-border bg-background py-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('搜尋名字、標籤、內容…')}
              className="min-w-[180px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
            />
            <select value={painFilter} onChange={(e) => setPainFilter(e.target.value)} className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <option value="">{t('全部痛點')}</option>
              {painTags.map((tag) => (
                <option key={tag} value={tag}>{t(TAG_LABEL[tag] ?? tag)}</option>
              ))}
            </select>
            <button
              onClick={() => setOpenIds(allOpen ? new Set() : new Set(visible.map((r) => r.user_id)))}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold"
            >
              {allOpen ? t('全部收合') : t('全部展開')}
            </button>
            <button onClick={() => setGallery((g) => !g)} className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold">
              {gallery ? t('回到列表') : t('畫廊模式')}
            </button>
          </div>

          {gallery ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {visible.map((r) => {
                const url = portraitUrl(r)
                return (
                  <button
                    key={r.user_id}
                    onClick={() => {
                      setGallery(false)
                      setOpenIds((s) => new Set(s).add(r.user_id))
                      window.setTimeout(() => document.getElementById(`persona-${r.user_id}`)?.scrollIntoView({ behavior: 'smooth' }), 50)
                    }}
                    className="text-center text-xs text-foreground"
                  >
                    {url ? <img src={url} alt="" className="mb-1 aspect-square w-full rounded-xl shadow-soft" /> : <div className="mb-1 aspect-square w-full rounded-xl bg-muted" />}
                    {displayName(r)}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visible.map((r) => (
                <PersonaCard key={r.user_id} row={r} open={openIds.has(r.user_id)} onToggle={() => toggleOpen(r.user_id)} />
              ))}
            </div>
          )}
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
                <span className="ml-2">{r.data.restricted_reason || t('需要人工關懷')}</span>
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
      .sort((a, b) => b.total - a.total || b.active - a.active)
    const all = rows.flatMap((r) => r.data.pains)
    const perPerson = rows.map((r) => r.data.pains.length).sort((a, b) => a - b)
    const activePer = rows.map((r) => r.data.pains.filter((p) => p.status === 'active').length)
    const groups = Object.entries(PAIN_GROUPS)
      .map(([g, tags]) => [g, rows.filter((r) => r.data.pains.some((p) => tags.includes(p.tag) && p.status !== 'resolved')).length] as const)
      .sort((a, b) => b[1] - a[1])
    const co = new Map<string, number>()
    for (const r of rows) {
      const tags = [...new Set(r.data.pains.filter((p) => p.status !== 'resolved').map((p) => p.tag))].sort()
      for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) {
        const k = `${tags[i]}|${tags[j]}`
        co.set(k, (co.get(k) ?? 0) + 1)
      }
    }
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
    return {
      list,
      total: all.length,
      avg: all.length / n,
      median: perPerson[n >> 1] ?? 0,
      min: perPerson[0] ?? 0,
      max: perPerson[perPerson.length - 1] ?? 0,
      activeAvg: activePer.reduce((a, b) => a + b, 0) / n,
      noActive: activePer.filter((x) => x === 0).length,
      improvingPct: pct(all.filter((p) => p.status === 'improving').length, all.length),
      activePct: pct(all.filter((p) => p.status === 'active').length, all.length),
      resolvedPct: pct(all.filter((p) => p.status === 'resolved').length, all.length),
      groups,
      co: [...co.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    }
  }, [rows, n])
  const singles = stats.list.filter((s) => s.total === 1)

  return (
    <details open className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <summary className="cursor-pointer font-black text-foreground">{t('痛點描述性統計（{n} 人、{m} 個痛點）', { n, m: stats.total })}</summary>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi value={stats.avg.toFixed(1)} label={t('平均每人痛點數')} sub={t('中位數 {m}・範圍 {a}～{b}', { m: stats.median, a: stats.min, b: stats.max })} />
        <Kpi value={stats.activeAvg.toFixed(1)} label={t('平均每人「持續中」')} sub={t('{n} 人沒有持續中的痛點', { n: stats.noActive })} />
        <Kpi value={`${stats.improvingPct}%`} label={t('標為「改善中」')} sub={t('持續中 {a}%・已過去 {r}%', { a: stats.activePct, r: stats.resolvedPct })} />
        <Kpi value={String(stats.list.length)} label={t('種痛點分類')} sub={t('其中 {n} 種只出現在 1 人身上', { n: singles.length })} />
      </div>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-1 text-xs font-bold text-muted-foreground">{t('各痛點有幾個人（依人數排序）')}</h3>
          <div className="mb-1 flex items-center gap-3 text-[11px] text-muted-foreground">
            {(Object.keys(STATUS_META) as PainStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${STATUS_META[s].bar}`} />
                {t(STATUS_META[s].label)}
              </span>
            ))}
          </div>
          <table className="w-full text-sm">
            <tbody>
              {stats.list.filter((s) => s.total >= 2).map((s) => (
                <tr key={s.tag}>
                  <td className="whitespace-nowrap py-1 pr-2 text-foreground">{t(TAG_LABEL[s.tag] ?? s.tag)}</td>
                  <td className="w-full py-1">
                    <div className="flex h-3 min-w-[100px] overflow-hidden rounded bg-muted">
                      {(Object.keys(STATUS_META) as PainStatus[]).map((st) => (
                        <span key={st} className={STATUS_META[st].bar} style={{ width: `${(s[st] / n) * 100}%` }} />
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums text-muted-foreground">
                    {t('{n} 人', { n: s.total })}・{Math.round((s.total / n) * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {singles.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('只出現 1 人的')}：{singles.map((s) => t(TAG_LABEL[s.tag] ?? s.tag)).join('、')}
            </p>
          )}
        </section>
        <section>
          <h3 className="mb-1 text-xs font-bold text-muted-foreground">{t('大類別（至少一個未過去的痛點）')}</h3>
          <table className="w-full text-sm">
            <tbody>
              {stats.groups.map(([g, c]) => (
                <tr key={g}>
                  <td className="whitespace-nowrap py-1 pr-2 text-foreground">{t(g)}</td>
                  <td className="w-full py-1">
                    <div className="flex h-3 min-w-[100px] overflow-hidden rounded bg-muted">
                      <span className="bg-[#3F6B46]" style={{ width: `${(c / n) * 100}%` }} />
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums text-muted-foreground">
                    {t('{n} 人', { n: c })}・{Math.round((c / n) * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="mb-1 mt-4 text-xs font-bold text-muted-foreground">{t('最常一起出現的痛點（同一人身上）')}</h3>
          <table className="w-full text-sm">
            <tbody>
              {stats.co.map(([k, c]) => (
                <tr key={k}>
                  <td className="py-1 text-foreground">{k.split('|').map((x) => t(TAG_LABEL[x] ?? x)).join(' ＋ ')}</td>
                  <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums text-muted-foreground">{t('{n} 人', { n: c })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t('痛點與狀態是 AI 讀公開日記後的判斷，不是使用者自評，僅供參考。一個人同一類痛點只算一次。')}
      </p>
    </details>
  )
}

function Kpi({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2">
      <div className="text-2xl font-black tabular-nums text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-[11px] leading-snug text-muted-foreground">{sub}</div>}
    </div>
  )
}

function PersonaCard({ row, open, onToggle }: { row: PersonaRow; open: boolean; onToggle: () => void }) {
  const { t } = useLanguage()
  const p = row.data
  const m = p.meta
  const url = portraitUrl(row)
  const types = m ? Object.entries(m.practice_counts).map(([k, v]) => `${t(PRACTICE_LABEL[k] ?? k)} ${v}`).join('・') : ''
  return (
    <div id={`persona-${row.user_id}`} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-left">
        {url ? (
          <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-xl shadow-soft" />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-xl bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[17px] font-black text-foreground">{displayName(row)}</span>
            <span className="font-mono text-xs text-muted-foreground">{row.user_id.slice(0, 8)}</span>
            {TEAM_IDS.has(row.user_id.slice(0, 8)) && (
              <span className="rounded-full border border-border bg-muted px-2 text-[11px] text-muted-foreground">{t('團隊成員')}</span>
            )}
          </div>
          <div className="font-bold text-[#3F6B46]">{p.label}</div>
          {m && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {m.first_date} ～ {m.last_date}・{m.active_days} {t('天')}・{types}
            </div>
          )}
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
          <div className="text-xl font-black text-foreground">{row.entry_count}</div>
          {t('篇')}
          {m && <div>{m.chars.toLocaleString()} {t('字')}</div>}
        </div>
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 text-sm">
          {url && p.portrait ? (
            <figure className="mb-3 flex flex-col gap-3 md:flex-row md:items-end">
              <img src={url} alt={t('{name} 的莫奈風格自畫像', { name: displayName(row) })} className="aspect-square w-full rounded-xl shadow-soft md:w-[280px]" />
              <figcaption className="text-sm text-muted-foreground">
                <span className="mb-1 block font-bold text-[#3F6B46]">{t(SCENE_LABEL[p.portrait.scene])}</span>
                {p.portrait.why}
              </figcaption>
            </figure>
          ) : (
            <p className="mb-3 text-xs text-muted-foreground">{t('這份 persona 是舊版產生的，重新刷新後會有自畫像。')}</p>
          )}
          <p className="text-foreground">{p.summary}</p>
          <p className="mt-2 text-muted-foreground"><b className="mr-2">{t('人生階段')}</b>{p.life_stage}</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <Section title={t('痛點')}>{p.pains.map((x, i) => <Item key={i} item={x} showStatus />)}</Section>
            <Section title={t('長處')}>{p.strengths.map((x, i) => <Item key={i} item={x} />)}</Section>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <List title={t('價值觀')} items={p.values} />
            <List title={t('有效的調適方式')} items={p.coping_that_works} />
            <List title={t('重要他人')} items={p.people} />
          </div>
          <List title={t('目標')} items={p.goals.map((g) => `${g.text}（${t(GOAL_STATUS[g.status] ?? g.status)}）`)} />
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <List title={t('書寫節奏')} items={Object.values(p.rhythm ?? {}).filter(Boolean)} />
            <List title={t('語氣')} items={Object.values(p.voice ?? {}).filter(Boolean)} />
          </div>
          <div className="mt-3 rounded-xl bg-tile-mint px-3 py-2">
            <List title={t('個人化服務建議')} items={p.service_hooks} />
          </div>
          <EntriesPanel userId={row.user_id} count={row.entry_count} />
          {p.watch_outs.length > 0 && (
            <details className="mt-3 rounded-xl border border-gold px-3 py-2">
              <summary className="cursor-pointer text-xs font-bold text-[#8a6320]">{t('注意事項（{n}）', { n: p.watch_outs.length })}</summary>
              <List title="" items={p.watch_outs} />
            </details>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {t('依據 {used} 篇公開日記產生（共 {total} 篇；太長時只取最近的）。', { used: row.entries_used, total: row.entry_count })}
            <span className="ml-2">v{row.version}・{fmt(row.updated_at)}</span>
          </p>
        </div>
      )}
    </div>
  )
}

type EntryRow = { id: string; entry_date: string; practice_type: string; item_1: string | null; item_2: string | null; item_3: string | null; payload: Record<string, unknown> | null; ai_feedback: string | null }

function entryFields(e: EntryRow): [string, string][] {
  const spec = DIARY_FIELDS[e.practice_type]
  if (!spec) return []
  return spec
    .map(([k, label]) => {
      const raw = k.startsWith('item_') ? e[k as 'item_1'] : e.payload?.[k]
      return [label, typeof raw === 'string' ? raw.trim() : ''] as [string, string]
    })
    .filter(([, v]) => v)
}

function highlight(text: string) {
  const parts = text.split(RISK_WORDS)
  return parts.map((part, i) => (i % 2 === 1 ? <mark key={i} className="rounded bg-tile-pink px-0.5 text-rust">{part}</mark> : <Fragment key={i}>{part}</Fragment>))
}

function EntriesPanel({ userId, count }: { userId: string; count: number }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<EntryRow[] | null>(null)
  const [error, setError] = useState(false)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (!next || entries) return
    const { data, error: err } = await supabase
      .from('gratitude_entries')
      .select('id, entry_date, practice_type, item_1, item_2, item_3, payload, ai_feedback')
      .eq('user_id', userId)
      .eq('is_shared', true)
      .not('practice_type', 'like', 'workshop_%')
      .order('entry_date', { ascending: true })
      .limit(1000)
    if (err) {
      console.error('[persona entries]', err)
      setError(true)
      return
    }
    setEntries((data as EntryRow[]) ?? [])
  }

  const list = (entries ?? []).filter((e) => entryFields(e).length > 0)
  return (
    <div className="mt-3">
      <button onClick={() => void toggle()} className="rounded-lg border border-[#3F6B46] px-3 py-1.5 text-sm font-bold text-[#3F6B46]">
        {open ? t('收起日記') : t('看全部公開日記（{n} 篇）', { n: entries ? list.length : count })}
      </button>
      {open && (
        <div className="mt-2 max-h-[560px] overflow-auto rounded-xl border border-border px-3 py-1">
          {error ? (
            <p className="py-2 text-sm text-rust">{t('讀取失敗，請稍後再試。')}</p>
          ) : entries === null ? (
            <p className="py-2 text-sm text-muted-foreground">{t('讀取中…')}</p>
          ) : list.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">{t('沒有公開日記')}</p>
          ) : (
            list.map((e) => {
              const fields = entryFields(e)
              const hit = new RegExp(RISK_WORDS.source).test(fields.map(([, v]) => v).join(' '))
              return (
                <div key={e.id} className={`border-b border-border py-2 last:border-0 ${hit ? 'border-l-4 border-l-rust bg-tile-pink pl-2' : ''}`}>
                  <div className="text-xs text-muted-foreground">
                    <b className="mr-2 text-foreground">{e.entry_date}</b>
                    {t(PRACTICE_LABEL[e.practice_type] ?? e.practice_type)}
                  </div>
                  {fields.map(([label, text], i) => (
                    <div key={i} className="text-foreground">
                      <span className="mr-1 inline-block min-w-[18px] text-xs text-muted-foreground">{label}</span>
                      {highlight(text)}
                    </div>
                  ))}
                  {e.ai_feedback && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">{t('當時 BOUBA 的回饋')}</summary>
                      <p className="whitespace-pre-line">{e.ai_feedback}</p>
                    </details>
                  )}
                </div>
              )
            })
          )}
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
      {item.evidence.length > 0 && <div className="text-[11px] text-muted-foreground">{t('依據')}：{item.evidence.join('、')}</div>}
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
