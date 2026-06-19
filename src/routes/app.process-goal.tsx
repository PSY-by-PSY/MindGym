import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { computeUnifiedStreak } from '../lib/streak'
import { track } from '../lib/analytics'
import VoiceInput from '../components/pretest/VoiceInput'
import { type Privacy, DEFAULT_PRIVACY, PRIVACY_OPTIONS, privacyToFields } from '../lib/privacy'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

// 模組專用配色（沿用 prompt 規格）
const TEAL = { backgroundColor: '#E1F5EE', color: '#085041' } // 洞察 / 條件標籤
const PURPLE_BG = { backgroundColor: '#EEEDFE', color: '#26215C' } // AI 回饋
const PURPLE = '#534AB7' // CTA 主按鈕

const ANON_NAMES = ['溫暖的星火', '清晨的微風', '靜謐的月光', '晴天的微笑', '輕盈的雲朵']
function pickAnonName() {
  return ANON_NAMES[Math.floor(Math.random() * ANON_NAMES.length)]
}

// 過程目標覺察對應的能力點數加成（示意值，與感恩日記同樣的呈現方式）
const PG_BOOSTS = [
  { label: '意義力', delta: 2 },
  { label: '成就力', delta: 3 },
  { label: '投入力', delta: 2 },
]

export const Route = createFileRoute('/app/process-goal')({
  // 可從外部深連結直接進某個模組：?mod=record | ?mod=boost
  validateSearch: (search: Record<string, unknown>) => ({
    mod:
      search.mod === 'record' || search.mod === 'boost'
        ? (search.mod as 'record' | 'boost')
        : undefined,
  }),
  component: ProcessGoalPage,
})

// ── 型別 ─────────────────────────────────────────────────────────────────
type Phase =
  | 'LOADING'
  | 'INTRO'
  // 模組一【專注時刻記錄】
  | 'R_INPUT'
  | 'R_INSIGHT'
  | 'R_DONE'
  // 模組二【提升專注錦囊】
  | 'B_INPUT'
  | 'B_RESULT'
  | 'B_DONE'

// 過去的「專注時刻記錄」（供模組二檢索）
interface MomentRecord {
  event: string
  who: string
  when_time: string
  where_place: string
  insight: string
  category: string
}

interface ShareContent {
  item_1: string
  item_2?: string | null
  item_3?: string | null
  ai_feedback?: string | null
}

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

// 把打卡內容分享到社群（沿用 gratitude_entries 那張表，practice_type='process_goal'，
// 因此社群的按讚 / 留言 / 機器人讚 / 通知都能直接運作）。
async function insertCommunityPost(userId: string, content: ShareContent, privacy: Privacy): Promise<string | null> {
  const fields = privacyToFields(privacy)
  const { data: profile } = await supabase.from('profiles').select('name, avatar').eq('id', userId).maybeSingle()
  const anonName = fields.use_real_name ? (profile?.name || pickAnonName()) : pickAnonName()
  const { data, error } = await supabase
    .from('gratitude_entries')
    .insert({
      user_id: userId,
      practice_type: 'process_goal',
      item_1: content.item_1,
      item_2: content.item_2 ?? null,
      item_3: content.item_3 ?? null,
      ai_feedback: content.ai_feedback ?? null,
      is_shared: fields.is_shared,
      use_real_name: fields.use_real_name,
      anon_name: anonName,
      avatar: profile?.avatar ?? null,
      entry_date: isoDate(new Date()),
    })
    .select('id')
    .single()
  if (error) {
    console.error('[process-goal community]', error)
    return null
  }
  const id = data?.id ?? null
  if (id && fields.is_shared) void supabase.rpc('schedule_bot_likes', { p_entry_id: id })
  return id
}

async function updateCommunityPrivacy(entryId: string, userId: string, privacy: Privacy) {
  const fields = privacyToFields(privacy)
  const { data: profile } = await supabase.from('profiles').select('name').eq('id', userId).maybeSingle()
  const anonName = fields.use_real_name ? (profile?.name || pickAnonName()) : pickAnonName()
  await supabase
    .from('gratitude_entries')
    .update({ is_shared: fields.is_shared, use_real_name: fields.use_real_name, anon_name: anonName })
    .eq('id', entryId)
}

// 讀取使用者過去的「專注時刻記錄」（log_kind='moment'）→ 供模組二檢索遷移
async function loadMomentRecords(userId: string): Promise<MomentRecord[]> {
  const { data } = await supabase
    .from('focus_logs')
    .select('focus_description, moment_who, moment_when, moment_where, insight, category, created_at')
    .eq('user_id', userId)
    .eq('log_kind', 'moment')
    .order('created_at', { ascending: false })
    .limit(40)
  return (data ?? []).map((r) => ({
    event: r.focus_description ?? '',
    who: r.moment_who ?? '',
    when_time: r.moment_when ?? '',
    where_place: r.moment_where ?? '',
    insight: r.insight ?? '',
    category: r.category ?? 'other',
  }))
}

// ── 共用 UI ──────────────────────────────────────────────────────────────
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-up mx-auto max-w-xl px-6 pb-28 pt-8 md:px-10">{children}</div>
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

// 自動長高的多行輸入框 + 語音輸入（每個輸入點都用它，框會隨字數變高）
function AutoTextarea({
  value,
  onChange,
  placeholder,
  autoFocus,
  voice = true,
  minHeight = 48,
  style,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  voice?: boolean
  minHeight?: number
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`
  }, [value, minHeight])

  const appendTranscript = (text: string) => {
    const sep = value && !/\s$/.test(value) ? ' ' : ''
    onChange(value + sep + text)
  }

  return (
    <div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={1}
        className="w-full resize-none overflow-hidden rounded-2xl border border-border bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-sm outline-none transition focus:border-[#534AB7]"
        style={{ minHeight, ...style }}
      />
      {voice && (
        <div className="mt-2">
          <VoiceInput accent={PURPLE} onTranscript={appendTranscript} />
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  voice = true,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  voice?: boolean
}) {
  return (
    <label className="block animate-fade-up">
      {label && <span className="mb-1.5 block text-sm font-bold text-foreground">{label}</span>}
      <AutoTextarea value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} voice={voice} />
    </label>
  )
}

function AiBlock({ text, loading }: { text: string; loading?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl" style={PURPLE_BG}>
      <div className="flex gap-3 p-4">
        <div className="w-1 shrink-0 rounded-full" style={{ backgroundColor: PURPLE }} />
        <p className="text-[15px] font-medium leading-relaxed">
          {loading ? '正在為你整理…' : text}
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
  const [momentCount, setMomentCount] = useState(0)

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

      const { count } = await supabase
        .from('focus_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('log_kind', 'moment')
      if (cancelled) return
      setMomentCount(count ?? 0)

      if (search.mod === 'record') setPhase('R_INPUT')
      else if (search.mod === 'boost') setPhase('B_INPUT')
      else setPhase('INTRO')
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

  if (phase === 'INTRO') {
    return (
      <Intro
        momentCount={momentCount}
        onRecord={() => setPhase('R_INPUT')}
        onBoost={() => setPhase('B_INPUT')}
      />
    )
  }

  if (phase.startsWith('R_')) {
    return (
      <RecordModule
        phase={phase}
        setPhase={setPhase}
        userId={userId!}
        onHome={() => navigate({ to: '/app/home' })}
        toIntro={() => setPhase('INTRO')}
      />
    )
  }

  // B_*
  return (
    <BoostModule
      phase={phase}
      setPhase={setPhase}
      userId={userId!}
      onHome={() => navigate({ to: '/app/home' })}
      toIntro={() => setPhase('INTRO')}
    />
  )
}

// ════════════════════════════════════════════════════════════════════════
// 介紹頁（仿感恩日記進入頁）— 兩個模組入口 + 核心宣導
// ════════════════════════════════════════════════════════════════════════
function Intro({
  momentCount,
  onRecord,
  onBoost,
}: {
  momentCount: number
  onRecord: () => void
  onBoost: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pb-36 pt-8 md:px-10">
      <h1 className="text-[1.9rem] font-extrabold leading-tight text-foreground">過程目標覺察練習</h1>

      <div className="mt-5 flex items-end gap-8">
        <div>
          <p className="text-3xl font-extrabold text-foreground">3</p>
          <p className="mt-0.5 text-xs text-muted-foreground">分鐘</p>
        </div>
        <div>
          <p className="text-3xl font-extrabold text-foreground">初階</p>
          <p className="mt-0.5 text-xs text-muted-foreground">難度</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-card p-4 text-sm leading-relaxed text-foreground/80 shadow-soft">
        過程目標覺察（Process Goal Awareness）幫助你看見自己「最容易專注」的條件。先把專注時刻一筆筆記下來，AI 會幫你看穿背後真正的需求；之後遇到難以投入的事，就能用你過去的成功經驗，為你量身打造一個能立刻試的方法。
      </div>

      {/* 核心宣導：記得越多越完整，建議就越精準 */}
      <div className="mt-3 flex items-start gap-3 rounded-2xl p-4" style={PURPLE_BG}>
        <span className="text-xl">💡</span>
        <p className="text-sm font-bold leading-relaxed">
          你記錄的「專注時刻」越多、越完整，AI 在「提升專注錦囊」中能為你量身打造的專注策略就會越精準、越豐富。
        </p>
      </div>

      <div className="mt-3">
        {!expanded ? (
          <button onClick={() => setExpanded(true)} className="text-xs font-bold text-primary">查看更多 ▾</button>
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 text-sm leading-relaxed shadow-soft">
            <div>
              <p className="mb-1.5 font-extrabold text-foreground">核心目標</p>
              <ul className="flex flex-col gap-1 pl-3 text-foreground/75">
                <li>・看見自己最容易專注的條件（人、時、地）</li>
                <li>・理解這些條件背後真正滿足的心理需求</li>
                <li>・卡住時，把過去的成功條件遷移到眼前的難事</li>
              </ul>
            </div>
            <div>
              <p className="mb-1.5 font-extrabold text-foreground">怎麼進行</p>
              <ul className="flex flex-col gap-1 pl-3 text-foreground/75">
                <li>・平常：用【專注時刻記錄】把投入的片刻存下來</li>
                <li>・卡關：用【提升專注錦囊】拿到一個能立刻試的方法</li>
              </ul>
            </div>
            <div>
              <p className="mb-1.5 font-extrabold text-foreground">研究指出的效益</p>
              <ul className="flex flex-col gap-1 pl-3 text-foreground/75">
                <li>・成就力（Accomplishment）與意義力（Meaning）</li>
                <li>・投入力（Engagement）與心流體驗</li>
                <li>・降低拖延、提升行動的啟動力</li>
              </ul>
            </div>
            <button onClick={() => setExpanded(false)} className="text-left text-xs font-bold text-primary">收合 ▴</button>
          </div>
        )}
      </div>

      <p className="mt-7 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">CHOOSE A MODULE</p>
      <div className="mt-1 flex items-baseline justify-between">
        <h3 className="text-base font-extrabold text-foreground">今天想做哪一個？</h3>
        <div className="whitespace-nowrap text-xs text-muted-foreground">
          {PG_BOOSTS.map(({ label, delta }) => (
            <span key={label} className="mr-3">{label} <strong className="text-foreground">+{delta}</strong></span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {/* 模組一：專注時刻記錄 */}
        <button
          type="button"
          onClick={onRecord}
          className="flex items-center gap-4 rounded-3xl bg-tile-blue p-5 text-left shadow-soft ring-2 ring-orange-400 transition active:scale-[0.98]"
        >
          <span className="text-3xl">📝</span>
          <div className="flex-1">
            <p className="font-extrabold text-blue-900">專注時刻記錄</p>
            <p className="mt-0.5 text-sm text-blue-800/80">記下一個你特別投入的時刻，AI 幫你看見背後的需求</p>
            <p className="mt-1 text-[11px] font-bold text-blue-700">
              {momentCount > 0 ? `你已記錄 ${momentCount} 個專注時刻` : '從你的第一個專注時刻開始'}
            </p>
          </div>
        </button>

        {/* 模組二：提升專注錦囊 */}
        <button
          type="button"
          onClick={onBoost}
          className="flex items-center gap-4 rounded-3xl p-5 text-left shadow-soft transition active:scale-[0.98]"
          style={{ backgroundColor: '#EEF6FF' }}
        >
          <span className="text-3xl">🧭</span>
          <div className="flex-1">
            <p className="font-extrabold text-foreground">提升專注錦囊</p>
            <p className="mt-0.5 text-sm text-muted-foreground">卡住了？用你過去的專注經驗，給你一個能立刻試的方法</p>
            {momentCount === 0 && (
              <p className="mt-1 text-[11px] font-bold text-[#5B8DEF]">建議先記錄幾個專注時刻，建議會更準</p>
            )}
          </div>
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 模組一【專注時刻記錄】— 數據收集與洞察層
// ════════════════════════════════════════════════════════════════════════
function RecordModule({
  phase,
  setPhase,
  userId,
  onHome,
  toIntro,
}: {
  phase: Phase
  setPhase: (p: Phase) => void
  userId: string
  onHome: () => void
  toIntro: () => void
}) {
  const [event, setEvent] = useState('')
  const [who, setWho] = useState('')
  const [whenTime, setWhenTime] = useState('')
  const [wherePlace, setWherePlace] = useState('')
  const [insight, setInsight] = useState('')
  const [category, setCategory] = useState('other')
  const [conditionTags, setConditionTags] = useState<string[]>([])
  const [loadingAi, setLoadingAi] = useState(false)
  const [streak, setStreak] = useState<number | null>(null)
  const savedRef = useRef(false)

  const fallbackInsight = () =>
    '從你的描述裡，能感覺到你在那個情境特別投入。多記幾次，AI 就能更準地看出你需要的專注條件。'

  const runInsight = async () => {
    setLoadingAi(true)
    setPhase('R_INSIGHT')
    try {
      const data = await fetchJson<{ insight: string; category: string; condition_tags: string[] }>(
        '/api/pg/focus-insight',
        { event, who, when_time: whenTime, where_place: wherePlace },
      )
      setInsight(data.insight || fallbackInsight())
      setCategory(data.category || 'other')
      setConditionTags(data.condition_tags ?? [])
    } catch {
      setInsight(fallbackInsight())
      setCategory('other')
      setConditionTags([])
    } finally {
      setLoadingAi(false)
    }
  }

  const buildShareContent = (): ShareContent => ({
    item_1: event || '記下了一個專注時刻',
    item_2: insight || null,
    item_3: null,
    ai_feedback: insight || null,
  })

  const save = async () => {
    if (savedRef.current) {
      setPhase('R_DONE')
      return
    }
    savedRef.current = true
    const { error } = await supabase.from('focus_logs').insert({
      user_id: userId,
      log_date: isoDate(new Date()),
      log_kind: 'moment',
      had_focus_moment: true,
      focus_description: event || null,
      moment_who: who || null,
      moment_when: whenTime || null,
      moment_where: wherePlace || null,
      insight: insight || null,
      category,
    })
    if (error) {
      savedRef.current = false
      alert(`儲存失敗：${error.message}`)
      return
    }
    track('process_goal_moment_recorded')
    await markStreak(userId)
    setStreak(await computeUnifiedStreak(userId))
    setPhase('R_DONE')
  }

  if (phase === 'R_INPUT') {
    const ready = event.trim() && who.trim() && whenTime.trim() && wherePlace.trim()
    return (
      <Screen>
        <BackBar onBack={toIntro} />
        <span className="text-3xl">📝</span>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight text-foreground">記下一個你專注的時刻</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          回想一個你特別「在狀態」的片段——時間過得很快、腦子很清晰、有種自然的流動感。
        </p>

        <div className="mt-6">
          <p className="mb-1.5 text-sm font-bold text-foreground">那是什麼事？當下的感受是什麼？</p>
          <AutoTextarea
            value={event}
            onChange={setEvent}
            placeholder="例：在咖啡廳寫報告，一直被推著往前，覺得很投入、忘記時間"
            autoFocus
            minHeight={110}
          />
        </div>

        <div className="mt-7 rounded-2xl bg-muted/40 p-4">
          <p className="mb-3 text-sm font-bold text-foreground">當時的人、時、地：</p>
          <div className="flex flex-col gap-4">
            <Field label="人物 · 一個人，還是有別人在？" value={who} onChange={setWho} placeholder="例：一個人／和同學一起" />
            <Field label="時間 · 什麼時候？" value={whenTime} onChange={setWhenTime} placeholder="例：週六下午、深夜" />
            <Field label="地點 · 在哪裡？" value={wherePlace} onChange={setWherePlace} placeholder="例：咖啡廳、圖書館" />
          </div>
        </div>

        <div className="mt-6">
          <PurpleCta disabled={!ready} onClick={runInsight}>看看 AI 的觀察</PurpleCta>
        </div>
      </Screen>
    )
  }

  if (phase === 'R_INSIGHT') {
    return (
      <Screen>
        <h2 className="text-xl font-extrabold leading-snug text-foreground">我從你的描述裡，聽見了…</h2>
        <p className="mt-2 text-sm text-muted-foreground">這是你這個專注時刻背後，可能真正需要的條件。</p>
        <div className="mt-6">
          {loadingAi ? <AiBlock text="" loading /> : (
            <div className="rounded-2xl p-5" style={PURPLE_BG}>
              <div className="flex gap-3">
                <div className="w-1 shrink-0 rounded-full" style={{ backgroundColor: PURPLE }} />
                <p className="text-[16px] font-bold leading-relaxed">{insight}</p>
              </div>
            </div>
          )}
        </div>
        {!loadingAi && conditionTags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {conditionTags.map((t) => (
              <span key={t} className="rounded-full px-3 py-1 text-sm font-bold" style={TEAL}>{t}</span>
            ))}
          </div>
        )}
        <div className="mt-7">
          <PurpleCta disabled={loadingAi} onClick={save}>儲存這個專注時刻</PurpleCta>
        </div>
      </Screen>
    )
  }

  // R_DONE
  return (
    <DoneScreen
      emoji="📝"
      title="專注時刻已記下"
      subtitle="記得越多、越完整，之後的專注錦囊就越準。"
      streak={streak}
      userId={userId}
      shareContent={buildShareContent()}
      onHome={onHome}
      onAgain={() => {
        savedRef.current = false
        setEvent(''); setWho(''); setWhenTime(''); setWherePlace('')
        setInsight(''); setCategory('other'); setConditionTags([])
        setStreak(null)
        setPhase('R_INPUT')
      }}
      againLabel="再記一個專注時刻"
    />
  )
}

// ════════════════════════════════════════════════════════════════════════
// 模組二【提升專注錦囊】— 情境遷移與動態建議層
// ════════════════════════════════════════════════════════════════════════
function BoostModule({
  phase,
  setPhase,
  userId,
  onHome,
  toIntro,
}: {
  phase: Phase
  setPhase: (p: Phase) => void
  userId: string
  onHome: () => void
  toIntro: () => void
}) {
  const [situation, setSituation] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [matchedSummary, setMatchedSummary] = useState('')
  const [hasMatch, setHasMatch] = useState(false)
  const [loadingAi, setLoadingAi] = useState(false)
  const [streak, setStreak] = useState<number | null>(null)
  const savedRef = useRef(false)

  const fallbackSuggestion = (records: MomentRecord[]) => {
    if (!records.length) {
      return '先別急著逼自己。回想一個你以前很投入的時刻，去【專注時刻記錄】補一筆——記得越多，我就越知道你需要什麼條件。現在，先把這件事拆到「只做最小的第一步」。'
    }
    const r = records[0]
    const cond = [r.where_place, r.who].filter(Boolean).join('、') || '你熟悉的條件'
    return `想想你以前在「${cond}」很投入的樣子，把那個氛圍帶過來：先換到類似的環境，只做這件事的第一個 10 分鐘。開始比完成更重要。`
  }

  const runBoost = async () => {
    setLoadingAi(true)
    setPhase('B_RESULT')
    const records = await loadMomentRecords(userId)
    try {
      const data = await fetchJson<{
        has_match: boolean; category: string; matched_summary: string; suggestion: string
      }>('/api/pg/focus-boost', { current_situation: situation, records })
      setHasMatch(Boolean(data.has_match))
      setMatchedSummary(data.matched_summary || '')
      setSuggestion(data.suggestion || fallbackSuggestion(records))
    } catch {
      setHasMatch(records.length > 0)
      setMatchedSummary('')
      setSuggestion(fallbackSuggestion(records))
    } finally {
      setLoadingAi(false)
    }
  }

  const buildShareContent = (): ShareContent => ({
    item_1: situation ? `卡關：${situation}` : '今天有件事提不起勁。',
    item_2: suggestion || null,
    item_3: null,
    ai_feedback: suggestion || null,
  })

  const save = async () => {
    if (savedRef.current) {
      setPhase('B_DONE')
      return
    }
    savedRef.current = true
    const { error } = await supabase.from('focus_logs').insert({
      user_id: userId,
      log_date: isoDate(new Date()),
      log_kind: 'boost',
      had_focus_moment: false,
      difficult_task: situation || null,
      ai_feedback: suggestion || null,
    })
    if (error) {
      savedRef.current = false
      alert(`儲存失敗：${error.message}`)
      return
    }
    track('process_goal_boost_done')
    await markStreak(userId)
    setStreak(await computeUnifiedStreak(userId))
    setPhase('B_DONE')
  }

  if (phase === 'B_INPUT') {
    return (
      <Screen>
        <BackBar onBack={toIntro} />
        <span className="text-3xl">🧭</span>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight text-foreground">現在，什麼事讓你卡住了？</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          說說現在這件難以專注、提不起勁的事，連同當下的情境一起講。我會從你過去的專注經驗裡，找一個能立刻試的方法。
        </p>
        <div className="mt-6">
          <AutoTextarea
            value={situation}
            onChange={setSituation}
            placeholder="例：要背一堆單字但完全靜不下心，坐在房間滑手機一小時了"
            autoFocus
            minHeight={120}
          />
        </div>
        <div className="mt-7">
          <PurpleCta disabled={!situation.trim()} onClick={runBoost}>為我找一個方法</PurpleCta>
        </div>
      </Screen>
    )
  }

  if (phase === 'B_RESULT') {
    return (
      <Screen>
        <h2 className="text-xl font-extrabold leading-snug text-foreground">你的專注錦囊</h2>
        {!loadingAi && hasMatch && matchedSummary && (
          <p className="mt-2 text-sm text-muted-foreground">參考了你過去的經驗：{matchedSummary}</p>
        )}
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
        {!loadingAi && !hasMatch && (
          <div className="mt-4 rounded-2xl bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground">
            這類活動還沒有你的專注紀錄。先去【專注時刻記錄】補幾筆相近的時刻，下次的錦囊就會更貼近你。
          </div>
        )}
        <div className="mt-7">
          <PurpleCta disabled={loadingAi} onClick={save}>好，我來試試</PurpleCta>
        </div>
      </Screen>
    )
  }

  // B_DONE
  return (
    <DoneScreen
      emoji="🧭"
      title="帶著這個方法去試試"
      subtitle="先做最小的第一步，開始比完成更重要。"
      streak={streak}
      userId={userId}
      shareContent={buildShareContent()}
      onHome={onHome}
      onAgain={() => setPhase('R_INPUT')}
      againLabel="順手記一個專注時刻"
    />
  )
}

// ── 打卡完成（含分享到社群）─────────────────────────────────────────────
function DoneScreen({
  emoji,
  title,
  subtitle,
  streak,
  userId,
  shareContent,
  onHome,
  onAgain,
  againLabel,
}: {
  emoji: string
  title: string
  subtitle: string
  streak: number | null
  userId: string
  shareContent: ShareContent
  onHome: () => void
  onAgain?: () => void
  againLabel?: string
}) {
  const [privacy, setPrivacy] = useState<Privacy>(DEFAULT_PRIVACY)
  const entryIdRef = useRef<string | null>(null)
  const postedRef = useRef(false)

  // 進入完成頁時，預設把打卡分享到社群（之後可改隱私）
  useEffect(() => {
    if (postedRef.current) return
    postedRef.current = true
    ;(async () => {
      const id = await insertCommunityPost(userId, shareContent, DEFAULT_PRIVACY)
      entryIdRef.current = id
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changePrivacy = async (next: Privacy) => {
    setPrivacy(next)
    if (entryIdRef.current) {
      void updateCommunityPrivacy(entryIdRef.current, userId, next)
    }
  }

  return (
    <Screen>
      <div className="mt-6 flex flex-col items-center text-center">
        <div className="celebrate-pop flex h-24 w-24 items-center justify-center rounded-full text-5xl" style={{ backgroundColor: '#D1FAE5' }}>
          {emoji}
        </div>
        <h1 className="mt-6 text-2xl font-extrabold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        {streak !== null && streak > 0 && (
          <div className="mt-6 rounded-2xl bg-card px-6 py-4 shadow-soft">
            <p className="text-sm text-muted-foreground">連續健心</p>
            <p className="text-3xl font-extrabold" style={{ color: '#059669' }}>{streak} 天 🔥</p>
          </div>
        )}
      </div>

      {/* 分享到社群的隱私設定 */}
      <div className="mt-8 rounded-3xl bg-card p-4 shadow-soft">
        <p className="mb-3 text-sm font-bold text-foreground">要把這次打卡分享到社群嗎？</p>
        <div className="flex flex-col gap-2">
          {PRIVACY_OPTIONS.map((opt) => {
            const active = privacy === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => changePrivacy(opt.value)}
                aria-pressed={active}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                  active ? 'border-[#534AB7] bg-[#EEEDFE]' : 'border-border hover:bg-muted'
                }`}
              >
                <span className="text-xl">{opt.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-foreground">{opt.label}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">{opt.hint}</span>
                </span>
                {active && <span style={{ color: PURPLE }}>✓</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-2.5">
        <PurpleCta onClick={onHome}>回訓練中心</PurpleCta>
        {onAgain && againLabel && <GhostButton onClick={onAgain}>{againLabel}</GhostButton>}
      </div>
    </Screen>
  )
}
