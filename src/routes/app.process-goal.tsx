import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { computeUnifiedStreak } from '../lib/streak'
import { track } from '../lib/analytics'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

// 模組專用配色（沿用 prompt 規格）
const AMBER = { backgroundColor: '#FAEEDA', color: '#412402' } // 條件標籤
const TEAL = { backgroundColor: '#E1F5EE', color: '#085041' } // 感受標籤
const PURPLE_BG = { backgroundColor: '#EEEDFE', color: '#26215C' } // AI 回饋
const PURPLE = '#534AB7' // CTA 主按鈕

export const Route = createFileRoute('/app/process-goal')({
  validateSearch: (search: Record<string, unknown>) => ({
    track:
      search.track === 'morning' || search.track === 'evening'
        ? (search.track as 'morning' | 'evening')
        : undefined,
  }),
  component: ProcessGoalPage,
})

// ── 型別 ─────────────────────────────────────────────────────────────────
type Phase =
  | 'LOADING'
  | 'INTRO'
  | 'SCENE'
  | 'DISSECT'
  | 'WHY_Q'
  | 'WHY_SUMMARY'
  | 'FEELINGS'
  | 'ONE_SENTENCE'
  | 'MAP_DONE'
  | 'HUB'
  | 'E_MOMENT'
  | 'E_RECORD'
  | 'E_DIFFICULT'
  | 'E_OBSTACLE'
  | 'E_FEEDBACK'
  | 'E_DONE'
  | 'M_INPUT'
  | 'M_FEEDBACK'
  | 'M_DONE'

interface ImmersionMap {
  scene_description: string
  who: string
  what: string
  when_time: string
  where_place: string
  with_what: string
  feelings: string[]
  why_summary: string
  one_sentence: string
  condition_tags: string[]
}

interface DailyCtx {
  dayCount: number
  yesterdayIfThen: string
  recentSummary: string
}

const FEELING_PRESETS = [
  '忘記時間', '輕微緊張感', '腦子一直在轉', '身體很輕', '很清醒',
  '沒有雜念', '想繼續做下去', '刺激感', '急切', '成就感', '依依不捨',
]

// ── 工具 ─────────────────────────────────────────────────────────────────
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const AI_TIMEOUT_MS = 30000
async function fetchJson<T>(path: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  try {
    const resp = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`API error: ${resp.status}`)
    return (await resp.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

async function markStreak(userId: string) {
  try {
    const streak = await computeUnifiedStreak(userId)
    await supabase.from('profiles').upsert({ id: userId, current_streak: streak }, { onConflict: 'id' })
  } catch (e) {
    console.error('[process-goal streak]', e)
  }
}

// ── 共用 UI ──────────────────────────────────────────────────────────────
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-up mx-auto max-w-xl px-6 pb-28 pt-8 md:px-10">{children}</div>
  )
}

function StepLabel({ step, total }: { step: number; total: number }) {
  return (
    <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
      沈浸地圖 · 步驟 {step} / {total}
    </p>
  )
}

function PurpleCta({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-extrabold tracking-[0.15em] text-white transition active:scale-[0.98] disabled:opacity-40"
      style={{ backgroundColor: disabled ? '#B9B4E6' : PURPLE }}
    >
      {children}
    </button>
  )
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-full items-center justify-center rounded-full text-sm font-bold text-muted-foreground transition hover:bg-muted active:scale-[0.98]"
    >
      {children}
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <label className="block animate-fade-up">
      {label && <span className="mb-1.5 block text-sm font-bold text-foreground">{label}</span>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={2}
        className="w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-sm outline-none transition focus:border-[#534AB7]"
      />
    </label>
  )
}

function Chip({
  label,
  selected,
  onToggle,
  palette,
}: {
  label: string
  selected: boolean
  onToggle: () => void
  palette: 'amber' | 'teal'
}) {
  const base = palette === 'amber' ? AMBER : TEAL
  const ring = palette === 'amber' ? 'ring-[#D9A441]' : 'ring-[#34A78A]'
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition active:scale-95 ${
        selected ? `shadow-sm ring-2 ${ring}` : 'opacity-70'
      }`}
      style={base}
    >
      {label}
    </button>
  )
}

// 可多選 + 自填的標籤群
function TagPicker({
  options,
  selected,
  onChange,
  palette,
  addPlaceholder,
}: {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  palette: 'amber' | 'teal'
  addPlaceholder: string
}) {
  const [draft, setDraft] = useState('')
  const all = useMemo(() => {
    const set = [...options]
    for (const s of selected) if (!set.includes(s)) set.push(s)
    return set
  }, [options, selected])

  const toggle = (label: string) => {
    if (selected.includes(label)) onChange(selected.filter((s) => s !== label))
    else onChange([...selected, label])
  }
  const add = () => {
    const v = draft.trim()
    if (v && !selected.includes(v)) onChange([...selected, v])
    setDraft('')
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {all.map((opt) => (
          <Chip key={opt} label={opt} selected={selected.includes(opt)} onToggle={() => toggle(opt)} palette={palette} />
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={addPlaceholder}
          className="flex-1 rounded-full border border-border bg-card px-4 py-2 text-sm outline-none focus:border-[#534AB7]"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-full px-4 py-2 text-sm font-bold text-white"
          style={{ backgroundColor: PURPLE }}
        >
          加入
        </button>
      </div>
    </div>
  )
}

function AiBlock({ text, loading }: { text: string; loading?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl" style={PURPLE_BG}>
      <div className="flex gap-3 p-4">
        <div className="w-1 shrink-0 rounded-full" style={{ backgroundColor: PURPLE }} />
        <p className="text-[15px] font-medium leading-relaxed">
          {loading ? '正在為你整理回饋…' : text}
        </p>
      </div>
    </div>
  )
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-4 flex items-center gap-1 text-sm font-bold text-muted-foreground transition hover:text-foreground"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      返回
    </button>
  )
}

// ── 主元件 ───────────────────────────────────────────────────────────────
function ProcessGoalPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [userId, setUserId] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('LOADING')
  const [map, setMap] = useState<ImmersionMap | null>(null)
  const [ctx, setCtx] = useState<DailyCtx>({ dayCount: 0, yesterdayIfThen: '', recentSummary: '' })

  // 初始化：載入沈浸地圖與近期記錄，決定要進入哪個流程
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user.id ?? null
      if (!uid) {
        navigate({ to: '/login' })
        return
      }
      if (cancelled) return
      setUserId(uid)

      const { data: mapRow } = await supabase
        .from('immersion_map')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle()

      if (!mapRow) {
        if (!cancelled) setPhase('INTRO')
        return
      }
      const m: ImmersionMap = {
        scene_description: mapRow.scene_description ?? '',
        who: mapRow.who ?? '',
        what: mapRow.what ?? '',
        when_time: mapRow.when_time ?? '',
        where_place: mapRow.where_place ?? '',
        with_what: mapRow.with_what ?? '',
        feelings: mapRow.feelings ?? [],
        why_summary: mapRow.why_summary ?? '',
        one_sentence: mapRow.one_sentence ?? '',
        condition_tags: mapRow.condition_tags ?? [],
      }

      const dailyCtx = await loadDailyCtx(uid)
      if (cancelled) return
      setMap(m)
      setCtx(dailyCtx)
      // 從首頁帶 track 參數可直接進入早晨／晚間
      if (search.track === 'morning') setPhase('M_INPUT')
      else if (search.track === 'evening') setPhase('E_MOMENT')
      else setPhase('HUB')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase === 'LOADING') {
    return (
      <Screen>
        <div className="mt-20 flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-soft border-t-[#534AB7]" />
          <p className="text-sm text-muted-foreground">載入中…</p>
        </div>
      </Screen>
    )
  }

  // ── 初始引導流程 ──────────────────────────────────────────────────────
  if (
    phase === 'INTRO' || phase === 'SCENE' || phase === 'DISSECT' || phase === 'WHY_Q' ||
    phase === 'WHY_SUMMARY' || phase === 'FEELINGS' || phase === 'ONE_SENTENCE' || phase === 'MAP_DONE'
  ) {
    return (
      <Onboarding
        phase={phase}
        setPhase={setPhase}
        userId={userId!}
        onComplete={(m) => {
          setMap(m)
          setPhase('MAP_DONE')
        }}
        finalMap={map}
        startDaily={async () => {
          setCtx(await loadDailyCtx(userId!))
          setPhase('HUB')
        }}
      />
    )
  }

  // ── 每日互動 ──────────────────────────────────────────────────────────
  if (phase === 'HUB') {
    return <Hub map={map!} onMorning={() => setPhase('M_INPUT')} onEvening={() => setPhase('E_MOMENT')} onHome={() => navigate({ to: '/app/home' })} />
  }

  if (phase.startsWith('E_')) {
    return (
      <Evening
        phase={phase}
        setPhase={setPhase}
        map={map!}
        userId={userId!}
        onHome={() => navigate({ to: '/app/home' })}
      />
    )
  }

  // M_*
  return (
    <Morning
      phase={phase}
      setPhase={setPhase}
      map={map!}
      ctx={ctx}
      userId={userId!}
      onHome={() => navigate({ to: '/app/home' })}
    />
  )
}

// 近期記錄摘要：天數、昨晚 if-then、近七天摘要句（供早晨 AI 使用）
async function loadDailyCtx(userId: string): Promise<DailyCtx> {
  const since = new Date()
  since.setDate(since.getDate() - 14)
  const [focusRes, morningRes] = await Promise.all([
    supabase.from('focus_logs').select('log_date, had_focus_moment, focus_conditions, obstacle, if_then_plan').eq('user_id', userId).gte('log_date', isoDate(since)).order('log_date', { ascending: false }),
    supabase.from('morning_logs').select('log_date').eq('user_id', userId).gte('log_date', isoDate(since)).order('log_date', { ascending: false }),
  ])
  const focus = focusRes.data ?? []
  const morning = morningRes.data ?? []

  const dates = new Set<string>()
  for (const r of focus) dates.add(String(r.log_date))
  for (const r of morning) dates.add(String(r.log_date))
  const dayCount = dates.size

  const yest = isoDate(new Date(Date.now() - 86400000))
  const yesterdayIfThen = focus.find((r) => String(r.log_date) === yest && r.if_then_plan)?.if_then_plan ?? ''

  // 近七天摘要
  const last7 = focus.filter((r) => String(r.log_date) >= isoDate(new Date(Date.now() - 7 * 86400000)))
  const momentDays = last7.filter((r) => r.had_focus_moment).length
  const condCount: Record<string, number> = {}
  const obsCount: Record<string, number> = {}
  for (const r of last7) {
    for (const c of r.focus_conditions ?? []) condCount[c] = (condCount[c] ?? 0) + 1
    if (r.obstacle) obsCount[r.obstacle] = (obsCount[r.obstacle] ?? 0) + 1
  }
  const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k)
  const recentSummary = last7.length
    ? `近七天有 ${momentDays} 天有專注時刻${top(condCount).length ? `；常見有效條件：${top(condCount).join('、')}` : ''}${top(obsCount).length ? `；常見障礙：${top(obsCount).join('、')}` : ''}`
    : ''

  return { dayCount, yesterdayIfThen, recentSummary }
}

// ════════════════════════════════════════════════════════════════════════
// 初始引導流程（Step 0–6）
// ════════════════════════════════════════════════════════════════════════
function Onboarding({
  phase,
  setPhase,
  userId,
  onComplete,
  finalMap,
  startDaily,
}: {
  phase: Phase
  setPhase: (p: Phase) => void
  userId: string
  onComplete: (m: ImmersionMap) => void
  finalMap: ImmersionMap | null
  startDaily: () => void
}) {
  // Step 1 四問
  const [sceneDesc, setSceneDesc] = useState('')
  const [undisturbed, setUndisturbed] = useState('')
  const [mindFeel, setMindFeel] = useState('')
  const [afterFeel, setAfterFeel] = useState('')
  const [sceneIdx, setSceneIdx] = useState(0)
  // Step 2 人時地物
  const [who, setWho] = useState('')
  const [whenTime, setWhenTime] = useState('')
  const [wherePlace, setWherePlace] = useState('')
  const [withWhat, setWithWhat] = useState('')
  // Step 3 why
  const [whyQ, setWhyQ] = useState({ who_why: '', when_why: '', where_why: '', what_why: '' })
  const [whyA, setWhyA] = useState({ who_why: '', when_why: '', where_why: '', what_why: '' })
  const [whyIdx, setWhyIdx] = useState(0)
  const [loadingWhy, setLoadingWhy] = useState(false)
  // Step 4
  const [whySummary, setWhySummary] = useState('')
  const [loadingSummary, setLoadingSummary] = useState(false)
  // Step 5
  const [feelings, setFeelings] = useState<string[]>([])
  // Step 6
  const [s1, setS1] = useState('')
  const [s2, setS2] = useState('')
  const [s3, setS3] = useState('')
  const [saving, setSaving] = useState(false)

  const conditionTags = useMemo(
    () => [who, whenTime, wherePlace, withWhat, undisturbed].map((x) => x.trim()).filter(Boolean),
    [who, whenTime, wherePlace, withWhat, undisturbed],
  )

  const sceneQuestions = [
    { label: '那件事是什麼？', value: sceneDesc, set: setSceneDesc, ph: '例：上週六晚上在實驗室寫程式' },
    { label: '你最不想被什麼打斷？', value: undisturbed, set: setUndisturbed, ph: '例：有人突然進來、手機響' },
    { label: '那個時候，你的腦子在做什麼感覺？', value: mindFeel, set: setMindFeel, ph: '例：像在解一個謎、一直往前推' },
    { label: '結束或被打斷之後，你的感覺是什麼？', value: afterFeel, set: setAfterFeel, ph: '例：有點捨不得停、腦子還在轉' },
  ]

  const whyConfig = [
    { key: 'who_why' as const, fallback: '這個「人」的安排，滿足了你什麼？' },
    { key: 'when_why' as const, fallback: '為什麼這個時間點對你特別有效？' },
    { key: 'where_why' as const, fallback: '這個地方給了你什麼，是別處沒有的？' },
    { key: 'what_why' as const, fallback: '這個工具或媒介，幫你進入了什麼狀態？' },
  ]

  // Step 2 → 3：呼叫 AI 產生 why 追問
  const goWhy = async () => {
    setLoadingWhy(true)
    setPhase('WHY_Q')
    try {
      const data = await fetchJson<typeof whyQ>('/api/pg/why-questions', {
        scene_description: sceneDesc,
        who, when_time: whenTime, where_place: wherePlace, with_what: withWhat,
        feelings: [mindFeel, afterFeel].filter(Boolean),
      })
      setWhyQ({
        who_why: data.who_why || whyConfig[0].fallback,
        when_why: data.when_why || whyConfig[1].fallback,
        where_why: data.where_why || whyConfig[2].fallback,
        what_why: data.what_why || whyConfig[3].fallback,
      })
    } catch {
      setWhyQ({
        who_why: whyConfig[0].fallback,
        when_why: whyConfig[1].fallback,
        where_why: whyConfig[2].fallback,
        what_why: whyConfig[3].fallback,
      })
    } finally {
      setLoadingWhy(false)
    }
  }

  // Step 3 → 4：收斂 why
  const goSummary = async () => {
    setLoadingSummary(true)
    setPhase('WHY_SUMMARY')
    try {
      const data = await fetchJson<{ summary: string }>('/api/pg/why-summary', whyA)
      setWhySummary(data.summary || fallbackSummary())
    } catch {
      setWhySummary(fallbackSummary())
    } finally {
      setLoadingSummary(false)
    }
  }
  const fallbackSummary = () => {
    const ans = [whyA.who_why, whyA.when_why, whyA.where_why, whyA.what_why].filter(Boolean)
    return ans.length ? `你真正需要的是：${ans[0]}` : '你真正需要的是：一個能讓你專注、不被打斷的空間。'
  }

  // Step 5 → 6：預填一句話模板
  const goOneSentence = () => {
    setS1(conditionTags.join('、'))
    setS2(feelings.join('、'))
    setPhase('ONE_SENTENCE')
  }

  const save = async () => {
    setSaving(true)
    const oneSentence = `我最容易進入沈浸的條件是「${s1}」，那個狀態裡我會感覺「${s2}」。就算結果沒有完成，在那個過程中，我會得到「${s3}」。`
    const m: ImmersionMap = {
      scene_description: sceneDesc,
      who, what: sceneDesc, when_time: whenTime, where_place: wherePlace, with_what: withWhat,
      feelings, why_summary: whySummary, one_sentence: oneSentence, condition_tags: conditionTags,
    }
    const { error } = await supabase
      .from('immersion_map')
      .upsert({ user_id: userId, ...m, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) {
      alert(`儲存失敗：${error.message}\n請截圖回報。`)
      return
    }
    track('process_goal_map_created')
    onComplete(m)
  }

  // ── Step 0 ──
  if (phase === 'INTRO') {
    const steps = [
      { n: '01', t: '喚起場景', d: '回想一個你特別投入的時刻' },
      { n: '02', t: '拆解條件', d: '把那個時刻的人時地物拆開來看' },
      { n: '03', t: '找到 Why', d: '理解這些條件為什麼對你有效' },
      { n: '04', t: '寫下座標', d: '收斂成一句屬於你的句子' },
    ]
    return (
      <Screen>
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl text-4xl" style={{ backgroundColor: '#DBEAFE' }}>👁️</div>
        <h1 className="text-3xl font-extrabold leading-tight text-foreground">找回你的狀態</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          我們要做三件事：看見它、拆解它、把它變成你的目標。
        </p>
        <div className="mt-6 flex flex-col gap-3">
          {steps.map((s) => (
            <div key={s.n} className="flex items-start gap-3 rounded-2xl bg-card p-4 shadow-soft">
              <span className="text-lg font-extrabold tabular-nums" style={{ color: PURPLE }}>{s.n}</span>
              <div>
                <p className="font-extrabold text-foreground">{s.t}</p>
                <p className="text-sm text-muted-foreground">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <PurpleCta onClick={() => setPhase('SCENE')}>我準備好了，開始</PurpleCta>
        </div>
      </Screen>
    )
  }

  // ── Step 1 ──
  if (phase === 'SCENE') {
    const q = sceneQuestions[sceneIdx]
    const canNext = q.value.trim().length > 0
    const isLast = sceneIdx === sceneQuestions.length - 1
    return (
      <Screen>
        <BackBar onBack={() => (sceneIdx === 0 ? setPhase('INTRO') : setSceneIdx((i) => i - 1))} />
        <StepLabel step={1} total={6} />
        <h2 className="text-xl font-extrabold leading-snug text-foreground">喚起場景</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          先讓自己停下來一秒。回想這一週——在學習、工作、或任何你做了些什麼的時刻——有沒有哪個片段，你感覺自己特別沈浸在當下？時間過得很快、腦子很清晰、或是做起來有種自然的流動感。不用是最厲害的時刻，只要是最有「在」的感覺就好。
        </p>
        <div className="mt-6">
          <Field key={sceneIdx} label={`${sceneIdx + 1}. ${q.label}`} value={q.value} onChange={q.set} placeholder={q.ph} autoFocus />
        </div>
        <div className="mt-6">
          <PurpleCta
            disabled={!canNext}
            onClick={() => (isLast ? setPhase('DISSECT') : setSceneIdx((i) => i + 1))}
          >
            {isLast ? '下一步' : '繼續'}
          </PurpleCta>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">{sceneIdx + 1} / {sceneQuestions.length}</p>
      </Screen>
    )
  }

  // ── Step 2 ──
  if (phase === 'DISSECT') {
    const ready = who.trim() && whenTime.trim() && wherePlace.trim() && withWhat.trim()
    return (
      <Screen>
        <BackBar onBack={() => setPhase('SCENE')} />
        <StepLabel step={2} total={6} />
        <h2 className="text-xl font-extrabold leading-snug text-foreground">拆解人時地物</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">好，現在我們把那個時刻拆開來看。</p>
        <div className="mt-6 flex flex-col gap-4">
          <Field label="人 · 一個人，還是有別人在？" value={who} onChange={setWho} placeholder="例：一個人／和誰" />
          <Field label="時 · 什麼時間點？" value={whenTime} onChange={setWhenTime} placeholder="例：週六晚上、深夜" />
          <Field label="地 · 在哪裡？" value={wherePlace} onChange={setWherePlace} placeholder="例：實驗室、咖啡廳" />
          <Field label="物 · 用什麼工具或媒介？" value={withWhat} onChange={setWithWhat} placeholder="例：電腦、筆記本" />
        </div>
        <div className="mt-6">
          <PurpleCta disabled={!ready} onClick={goWhy}>下一步</PurpleCta>
        </div>
      </Screen>
    )
  }

  // ── Step 3 ──
  if (phase === 'WHY_Q') {
    const cfg = whyConfig[whyIdx]
    const question = whyQ[cfg.key] || cfg.fallback
    const answer = whyA[cfg.key]
    const isLast = whyIdx === whyConfig.length - 1
    const advance = () => (isLast ? goSummary() : setWhyIdx((i) => i + 1))
    return (
      <Screen>
        <BackBar onBack={() => (whyIdx === 0 ? setPhase('DISSECT') : setWhyIdx((i) => i - 1))} />
        <StepLabel step={3} total={6} />
        <h2 className="text-xl font-extrabold leading-snug text-foreground">找到 Why</h2>
        {loadingWhy ? (
          <p className="mt-6 text-sm text-muted-foreground">正在依你的描述，想幾個好問題…</p>
        ) : (
          <>
            <div className="mt-5 rounded-2xl p-4" style={PURPLE_BG}>
              <p className="text-[15px] font-bold leading-relaxed">{question}</p>
            </div>
            <div className="mt-4">
              <Field
                key={whyIdx}
                label=""
                value={answer}
                onChange={(v) => setWhyA((a) => ({ ...a, [cfg.key]: v }))}
                placeholder="想到什麼就寫什麼，也可以跳過"
                autoFocus
              />
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <PurpleCta onClick={advance}>{isLast ? '收斂我的 Why' : '下一題'}</PurpleCta>
              {!answer.trim() && <GhostButton onClick={advance}>跳過這題</GhostButton>}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">{whyIdx + 1} / {whyConfig.length}</p>
          </>
        )}
      </Screen>
    )
  }

  // ── Step 4 ──
  if (phase === 'WHY_SUMMARY') {
    return (
      <Screen>
        <StepLabel step={4} total={6} />
        <h2 className="text-xl font-extrabold leading-snug text-foreground">收斂你的 Why</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">這是我從你的回答裡，聽見的核心需求。你可以直接修改它。</p>
        <div className="mt-6">
          {loadingSummary ? (
            <AiBlock text="" loading />
          ) : (
            <textarea
              value={whySummary}
              onChange={(e) => setWhySummary(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-2xl border-2 px-4 py-3 text-[16px] font-bold leading-relaxed shadow-sm outline-none"
              style={{ ...PURPLE_BG, borderColor: PURPLE }}
            />
          )}
        </div>
        <div className="mt-6">
          <PurpleCta disabled={loadingSummary || !whySummary.trim()} onClick={() => setPhase('FEELINGS')}>下一步</PurpleCta>
        </div>
      </Screen>
    )
  }

  // ── Step 5 ──
  if (phase === 'FEELINGS') {
    return (
      <Screen>
        <BackBar onBack={() => setPhase('WHY_SUMMARY')} />
        <StepLabel step={5} total={6} />
        <h2 className="text-xl font-extrabold leading-snug text-foreground">那個狀態裡，你的感覺是什麼？</h2>
        <p className="mt-2 text-sm text-muted-foreground">選幾個最貼近的，也可以自己加。</p>
        <div className="mt-6">
          <TagPicker options={FEELING_PRESETS} selected={feelings} onChange={setFeelings} palette="teal" addPlaceholder="加入你自己的詞…" />
        </div>
        <div className="mt-8">
          <PurpleCta disabled={feelings.length === 0} onClick={goOneSentence}>下一步</PurpleCta>
        </div>
      </Screen>
    )
  }

  // ── Step 6 ──
  if (phase === 'ONE_SENTENCE') {
    const blank = 'mx-1 inline-block min-w-[6rem] rounded-lg border-b-2 bg-white/60 px-2 py-0.5 text-center font-bold outline-none'
    return (
      <Screen>
        <BackBar onBack={() => setPhase('FEELINGS')} />
        <StepLabel step={6} total={6} />
        <h2 className="text-xl font-extrabold leading-snug text-foreground">寫下你的座標</h2>
        <p className="mt-2 text-sm text-muted-foreground">完成這句話——這是給你自己的座標。前兩格已幫你填好，可修改。</p>
        <div className="mt-6 rounded-2xl bg-card p-5 text-[15px] leading-loose text-foreground shadow-soft">
          我最容易進入沈浸的條件是「
          <input value={s1} onChange={(e) => setS1(e.target.value)} className={blank} style={{ borderColor: '#D9A441' }} />
          」，那個狀態裡我會感覺「
          <input value={s2} onChange={(e) => setS2(e.target.value)} className={blank} style={{ borderColor: '#34A78A' }} />
          」。就算結果沒有完成，在那個過程中，我會得到「
          <input value={s3} onChange={(e) => setS3(e.target.value)} placeholder="你會得到什麼？" className={blank} style={{ borderColor: PURPLE }} />
          」。
        </div>
        <div className="mt-8">
          <PurpleCta disabled={saving || !s3.trim()} onClick={save}>{saving ? '儲存中…' : '完成沈浸地圖'}</PurpleCta>
        </div>
      </Screen>
    )
  }

  // ── 完成卡片 ──
  const m = finalMap
  return (
    <Screen>
      <div className="celebrate-pop mb-2 flex h-16 w-16 items-center justify-center rounded-3xl text-4xl" style={{ backgroundColor: '#DBEAFE' }}>🗺️</div>
      <h1 className="text-2xl font-extrabold text-foreground">你的沈浸地圖</h1>
      <p className="mt-1 text-sm text-muted-foreground">這是你進入專注狀態的座標，之後每天的練習都會用到它。</p>
      {m && (
        <div className="mt-5 rounded-3xl bg-card p-5 shadow-soft">
          <p className="text-[15px] font-bold leading-relaxed text-foreground">{m.scene_description}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {[['人', m.who], ['時', m.when_time], ['地', m.where_place], ['物', m.with_what]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-muted px-3 py-2">
                <span className="text-xs font-bold text-muted-foreground">{k}</span>
                <p className="font-semibold text-foreground">{v || '—'}</p>
              </div>
            ))}
          </div>
          {m.feelings.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {m.feelings.map((f) => (
                <span key={f} className="rounded-full px-3 py-1 text-sm font-bold" style={TEAL}>{f}</span>
              ))}
            </div>
          )}
          {m.why_summary && (
            <div className="mt-4 rounded-2xl p-4" style={PURPLE_BG}>
              <p className="text-[15px] font-bold leading-relaxed">{m.why_summary}</p>
            </div>
          )}
          {m.one_sentence && <p className="mt-4 text-[15px] leading-loose text-foreground">{m.one_sentence}</p>}
        </div>
      )}
      <div className="mt-8">
        <PurpleCta onClick={startDaily}>開始每日練習</PurpleCta>
      </div>
    </Screen>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 每日互動入口
// ════════════════════════════════════════════════════════════════════════
function MapSummary({ map }: { map: ImmersionMap }) {
  return (
    <div className="rounded-3xl bg-card p-4 shadow-soft">
      <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">你的沈浸條件</p>
      <div className="flex flex-wrap gap-1.5">
        {map.condition_tags.map((c) => (
          <span key={c} className="rounded-full px-3 py-1 text-sm font-bold" style={AMBER}>{c}</span>
        ))}
        {map.feelings.slice(0, 4).map((f) => (
          <span key={f} className="rounded-full px-3 py-1 text-sm font-bold" style={TEAL}>{f}</span>
        ))}
      </div>
    </div>
  )
}

function Hub({
  map,
  onMorning,
  onEvening,
  onHome,
}: {
  map: ImmersionMap
  onMorning: () => void
  onEvening: () => void
  onHome: () => void
}) {
  const hour = new Date().getHours()
  const suggestMorning = hour < 15
  return (
    <Screen>
      <p className="font-handwriting text-2xl text-muted-foreground">過程目標覺察</p>
      <h1 className="mt-1 text-2xl font-extrabold leading-tight text-foreground">今天，怎麼用你的狀態？</h1>
      <div className="mt-5">
        <MapSummary map={map} />
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={onMorning}
          className={`flex items-center gap-4 rounded-3xl p-5 text-left shadow-soft transition active:scale-[0.98] ${suggestMorning ? 'ring-2 ring-[#D9A441]' : ''}`}
          style={{ backgroundColor: '#FFF7E6' }}
        >
          <span className="text-3xl">🌅</span>
          <div className="flex-1">
            <p className="font-extrabold text-foreground">早晨啟動{suggestMorning && <span className="ml-2 rounded-full px-2 py-0.5 text-[11px]" style={AMBER}>推薦</span>}</p>
            <p className="text-sm text-muted-foreground">用你的條件，決定今天怎麼開始一件難事</p>
          </div>
        </button>
        <button
          type="button"
          onClick={onEvening}
          className={`flex items-center gap-4 rounded-3xl p-5 text-left shadow-soft transition active:scale-[0.98] ${!suggestMorning ? 'ring-2 ring-[#5B8DEF]' : ''}`}
          style={{ backgroundColor: '#EEF6FF' }}
        >
          <span className="text-3xl">🌙</span>
          <div className="flex-1">
            <p className="font-extrabold text-foreground">晚間回顧{!suggestMorning && <span className="ml-2 rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: '#DBEAFE', color: '#1E3A8A' }}>推薦</span>}</p>
            <p className="text-sm text-muted-foreground">回顧今天的專注時刻，把難事變成可執行的計畫</p>
          </div>
        </button>
      </div>
      <div className="mt-6">
        <GhostButton onClick={onHome}>回訓練中心</GhostButton>
      </div>
    </Screen>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 晚間回顧（軌道一）
// ════════════════════════════════════════════════════════════════════════
function Evening({
  phase,
  setPhase,
  map,
  userId,
  onHome,
}: {
  phase: Phase
  setPhase: (p: Phase) => void
  map: ImmersionMap
  userId: string
  onHome: () => void
}) {
  const [hadMoment, setHadMoment] = useState(false)
  const [focusDesc, setFocusDesc] = useState('')
  const [focusConditions, setFocusConditions] = useState<string[]>([])
  const [focusFeelings, setFocusFeelings] = useState<string[]>([])
  const [difficultTask, setDifficultTask] = useState('')
  const [obstacle, setObstacle] = useState('')
  const [aiFeedback, setAiFeedback] = useState('')
  const [ifThen, setIfThen] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)
  const [streak, setStreak] = useState<number | null>(null)
  const savedRef = useRef(false)

  const fallbackIfThen = () => {
    const cond = map.condition_tags[0] ?? '我熟悉的條件'
    const obs = obstacle || difficultTask || '我又分心了'
    return `如果${obs}，那我就回到「${cond}」，先做最小的一步。`
  }

  const runFeedback = async () => {
    setLoadingAi(true)
    setPhase('E_FEEDBACK')
    try {
      const data = await fetchJson<{ focus_feedback: string; if_then_plan: string }>('/api/pg/evening-feedback', {
        condition_tags: map.condition_tags,
        feelings: map.feelings,
        why_summary: map.why_summary,
        had_focus_moment: hadMoment,
        focus_description: focusDesc,
        today_conditions: focusConditions,
        difficult_task: difficultTask,
        obstacle,
      })
      setAiFeedback(data.focus_feedback || '')
      setIfThen(data.if_then_plan || fallbackIfThen())
    } catch {
      setAiFeedback('')
      setIfThen(fallbackIfThen())
    } finally {
      setLoadingAi(false)
    }
  }

  const save = async () => {
    if (savedRef.current) {
      setPhase('E_DONE')
      return
    }
    savedRef.current = true
    const { error } = await supabase.from('focus_logs').insert({
      user_id: userId,
      log_date: isoDate(new Date()),
      had_focus_moment: hadMoment,
      focus_description: focusDesc || null,
      focus_conditions: focusConditions,
      focus_feelings: focusFeelings,
      difficult_task: difficultTask || null,
      obstacle: obstacle || null,
      if_then_plan: ifThen || null,
      ai_feedback: aiFeedback || null,
    })
    if (error) {
      savedRef.current = false
      alert(`儲存失敗：${error.message}`)
      return
    }
    track('process_goal_evening_done')
    await markStreak(userId)
    setStreak(await computeUnifiedStreak(userId))
    setPhase('E_DONE')
  }

  // 沒有困難任務、直接結束
  const finishWithoutWoop = async () => {
    await save()
  }

  if (phase === 'E_MOMENT') {
    return (
      <Screen>
        <BackBar onBack={onHome} />
        <span className="text-3xl">🌙</span>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight text-foreground">今天有沒有那個「被拉著走」的感覺？</h1>
        <p className="mt-2 text-sm text-muted-foreground">睡前兩分鐘，回顧今天的專注時刻。</p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => { setHadMoment(true); setPhase('E_RECORD') }}
            className="flex items-center justify-between rounded-3xl p-5 text-left font-extrabold text-white shadow-soft transition active:scale-[0.98]"
            style={{ backgroundColor: PURPLE }}
          >
            有，我想記下來 <span className="text-xl">✍️</span>
          </button>
          <button
            type="button"
            onClick={() => { setHadMoment(false); setPhase('E_DIFFICULT') }}
            className="flex items-center justify-between rounded-3xl bg-card p-5 text-left font-extrabold text-foreground shadow-soft transition active:scale-[0.98]"
          >
            沒有，今天很難專注 <span className="text-xl">🫧</span>
          </button>
        </div>
      </Screen>
    )
  }

  if (phase === 'E_RECORD') {
    return (
      <Screen>
        <BackBar onBack={() => setPhase('E_MOMENT')} />
        <h2 className="text-xl font-extrabold text-foreground">記錄今天的專注時刻</h2>
        <div className="mt-6 flex flex-col gap-5">
          <Field label="那是什麼事？" value={focusDesc} onChange={setFocusDesc} placeholder="一句話即可" autoFocus />
          <div>
            <p className="mb-2 text-sm font-bold text-foreground">今天有效的條件是什麼？</p>
            <TagPicker options={map.condition_tags} selected={focusConditions} onChange={setFocusConditions} palette="amber" addPlaceholder="新增條件…" />
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-foreground">當時的感受？</p>
            <TagPicker options={map.feelings} selected={focusFeelings} onChange={setFocusFeelings} palette="teal" addPlaceholder="新增感受…" />
          </div>
        </div>
        <div className="mt-7">
          <PurpleCta disabled={!focusDesc.trim()} onClick={() => setPhase('E_DIFFICULT')}>下一步</PurpleCta>
        </div>
      </Screen>
    )
  }

  if (phase === 'E_DIFFICULT') {
    return (
      <Screen>
        <BackBar onBack={() => setPhase(hadMoment ? 'E_RECORD' : 'E_MOMENT')} />
        <h2 className="text-xl font-extrabold leading-snug text-foreground">今天有沒有什麼很難開始或很難專注的事？</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">一直想做但一直進不去？或是坐下來了但腦子一直飄？</p>
        <div className="mt-6">
          <Field label="那件事是：" value={difficultTask} onChange={setDifficultTask} placeholder="例：寫報告、聯絡某個人" autoFocus />
        </div>
        <div className="mt-7 flex flex-col gap-2">
          <PurpleCta disabled={!difficultTask.trim()} onClick={() => setPhase('E_OBSTACLE')}>下一步</PurpleCta>
          <GhostButton onClick={finishWithoutWoop}>今天先這樣，完成打卡</GhostButton>
        </div>
      </Screen>
    )
  }

  if (phase === 'E_OBSTACLE') {
    return (
      <Screen>
        <BackBar onBack={() => setPhase('E_DIFFICULT')} />
        <h2 className="text-xl font-extrabold text-foreground">什麼最可能阻止你去做這件事？</h2>
        <div className="mt-6">
          <Field label="" value={obstacle} onChange={setObstacle} placeholder="例：不知道從哪裡開始、太累、環境太吵、手機一直分心" autoFocus />
        </div>
        <div className="mt-7">
          <PurpleCta disabled={!obstacle.trim()} onClick={runFeedback}>看看我的計畫</PurpleCta>
        </div>
      </Screen>
    )
  }

  if (phase === 'E_FEEDBACK') {
    return (
      <Screen>
        <h2 className="text-xl font-extrabold text-foreground">今晚的回饋</h2>
        <div className="mt-5 flex flex-col gap-4">
          {hadMoment && aiFeedback && <AiBlock text={aiFeedback} loading={loadingAi} />}
          {loadingAi ? (
            <AiBlock text="" loading />
          ) : (
            <div>
              <p className="mb-2 text-sm font-bold text-foreground">你的 if-then 計畫（可修改）</p>
              <textarea
                value={ifThen}
                onChange={(e) => setIfThen(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-2xl border-2 px-4 py-3 text-[15px] font-medium leading-relaxed outline-none"
                style={{ ...PURPLE_BG, borderColor: PURPLE }}
              />
            </div>
          )}
        </div>
        <div className="mt-7">
          <PurpleCta disabled={loadingAi} onClick={save}>確認，完成打卡</PurpleCta>
        </div>
      </Screen>
    )
  }

  // E_DONE
  return <DoneScreen kind="evening" streak={streak} onHome={onHome} />
}

// ════════════════════════════════════════════════════════════════════════
// 早晨啟動（軌道二）
// ════════════════════════════════════════════════════════════════════════
function pickMorningQuestion(ctx: DailyCtx): string {
  if (ctx.yesterdayIfThen) {
    return `昨晚你說：「${ctx.yesterdayIfThen}」。今天這個計畫還有效嗎？打算怎麼做？`
  }
  if (ctx.dayCount > 0 && ctx.dayCount % 30 === 0) {
    return '你的沈浸條件還準確嗎？有沒有什麼新的發現想更新？也可以直接寫今天要做的事。'
  }
  if (ctx.dayCount >= 7) {
    return '今天最難開始的是哪件事？你打算在什麼條件下做它？'
  }
  return '今天，你打算怎麼用你的條件？找一件事，描述你要怎麼安排它。'
}

function Morning({
  phase,
  setPhase,
  map,
  ctx,
  userId,
  onHome,
}: {
  phase: Phase
  setPhase: (p: Phase) => void
  map: ImmersionMap
  ctx: DailyCtx
  userId: string
  onHome: () => void
}) {
  const [todayTask, setTodayTask] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)
  const [streak, setStreak] = useState<number | null>(null)
  const savedRef = useRef(false)
  const question = useMemo(() => pickMorningQuestion(ctx), [ctx])

  const fallbackSuggestion = () => {
    const cond = map.condition_tags.slice(0, 2).join('、') || '你最有效的條件'
    return `先把範圍縮到最小：在「${cond}」的狀態下，只做這件事的第一個 10 分鐘。開始比完成更重要。`
  }

  const runFeedback = async () => {
    setLoadingAi(true)
    setPhase('M_FEEDBACK')
    try {
      const data = await fetchJson<{ suggestion: string }>('/api/pg/morning-feedback', {
        condition_tags: map.condition_tags,
        feelings: map.feelings,
        why_summary: map.why_summary,
        one_sentence: map.one_sentence,
        recent_logs_summary: ctx.recentSummary,
        today_task: todayTask,
        yesterday_if_then: ctx.yesterdayIfThen,
      })
      setSuggestion(data.suggestion || fallbackSuggestion())
    } catch {
      setSuggestion(fallbackSuggestion())
    } finally {
      setLoadingAi(false)
    }
  }

  const save = async () => {
    if (savedRef.current) {
      setPhase('M_DONE')
      return
    }
    savedRef.current = true
    const { error } = await supabase.from('morning_logs').insert({
      user_id: userId,
      log_date: isoDate(new Date()),
      today_task: todayTask || null,
      ai_suggestion: suggestion || null,
      user_confirmed: true,
    })
    if (error) {
      savedRef.current = false
      alert(`儲存失敗：${error.message}`)
      return
    }
    track('process_goal_morning_done')
    await markStreak(userId)
    setStreak(await computeUnifiedStreak(userId))
    setPhase('M_DONE')
  }

  if (phase === 'M_INPUT') {
    return (
      <Screen>
        <BackBar onBack={onHome} />
        <span className="text-3xl">🌅</span>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight text-foreground">今天，怎麼創造你的狀態？</h1>
        <div className="mt-5">
          <MapSummary map={map} />
        </div>
        <div className="mt-6 rounded-2xl p-4" style={PURPLE_BG}>
          <p className="text-[15px] font-bold leading-relaxed">{question}</p>
        </div>
        <div className="mt-4">
          <Field label="" value={todayTask} onChange={setTodayTask} placeholder="寫下今天要做的難事，或今天的安排" autoFocus />
        </div>
        <div className="mt-6">
          <PurpleCta onClick={runFeedback}>給我今天的啟動建議</PurpleCta>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">也可以不輸入，直接看建議（但會比較籠統）</p>
      </Screen>
    )
  }

  if (phase === 'M_FEEDBACK') {
    return (
      <Screen>
        <h2 className="text-xl font-extrabold text-foreground">今天的啟動</h2>
        <div className="mt-5">
          {loadingAi ? <AiBlock text="" loading /> : (
            <div className="rounded-2xl p-5" style={PURPLE_BG}>
              <div className="flex gap-3">
                <div className="w-1 shrink-0 rounded-full" style={{ backgroundColor: PURPLE }} />
                <p className="text-[17px] font-bold leading-relaxed">{suggestion}</p>
              </div>
            </div>
          )}
        </div>
        <div className="mt-7">
          <PurpleCta disabled={loadingAi} onClick={save}>好，我知道了</PurpleCta>
        </div>
      </Screen>
    )
  }

  // M_DONE
  return <DoneScreen kind="morning" streak={streak} onHome={onHome} />
}

// ── 打卡完成 ─────────────────────────────────────────────────────────────
function DoneScreen({ kind, streak, onHome }: { kind: 'morning' | 'evening'; streak: number | null; onHome: () => void }) {
  return (
    <Screen>
      <div className="mt-10 flex flex-col items-center text-center">
        <div className="celebrate-pop flex h-24 w-24 items-center justify-center rounded-full text-5xl" style={{ backgroundColor: '#D1FAE5' }}>
          {kind === 'morning' ? '🌅' : '🌙'}
        </div>
        <h1 className="mt-6 text-2xl font-extrabold text-foreground">
          {kind === 'morning' ? '今天的啟動完成了' : '今晚的回顧完成了'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {kind === 'morning' ? '帶著你的條件，去創造今天的狀態。' : '把今天好好收起來，明天見。'}
        </p>
        {streak !== null && streak > 0 && (
          <div className="mt-6 rounded-2xl bg-card px-6 py-4 shadow-soft">
            <p className="text-sm text-muted-foreground">連續健心</p>
            <p className="text-3xl font-extrabold" style={{ color: '#059669' }}>{streak} 天 🔥</p>
          </div>
        )}
      </div>
      <div className="mt-10">
        <PurpleCta onClick={onHome}>回訓練中心</PurpleCta>
      </div>
    </Screen>
  )
}
