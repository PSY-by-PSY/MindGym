import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n/context'
import { computeUnifiedStreak } from '../lib/streak'
import { isoLocalDate } from '../lib/date'
import { saveOrShareImage } from '../lib/shareImage'
import { track } from '../lib/analytics'
import { useStageBack } from '../lib/useStageBack'
import AiProgressBar from '../components/AiProgressBar'
import VoiceInput from '../components/pretest/VoiceInput'
import { type Privacy, DEFAULT_PRIVACY, PRIVACY_OPTIONS, privacyToFields } from '../lib/privacy'
import processGoalBanner from '../assets/ui/process-goal-intro-banner.png'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

// 模組專用配色（對齊新版暖色設計）
const TEAL = { backgroundColor: '#E8E7D3', color: '#71744F' }
const PURPLE_BG = { backgroundColor: '#f3ead9', color: '#542916' }
const PURPLE = '#542916'

// 匿名顯示名稱：直接寫入 DB 的 anon_name 欄位，故意不走 t() 翻譯——
// 這是儲存進資料庫的資料值（非畫面即時渲染文字），若隨語言切換翻譯，
// 同一篇貼文在不同語言使用者眼中會顯示不同名字，並非預期行為。
const ANON_NAMES = ['溫暖的星火', '清晨的微風', '靜謐的月光', '晴天的微笑', '輕盈的雲朵']
function pickAnonName() {
  return ANON_NAMES[Math.floor(Math.random() * ANON_NAMES.length)]
}

// t() 的型別別名，供元件外的純函式接參數用（不能在裡面呼叫 useLanguage）。
type TFn = (text: string, vars?: Record<string, string | number>) => string

// PERMA 加分項目（用於完成頁）
function getPgPermaBoosts(t: TFn) {
  return [
    {
      key: 'A',
      label: t('成就力'),
      delta: 3,
      bar: 'bg-tile-blue',
      description: t('看見自己的專注條件，是找回行動力的第一步。'),
    },
    {
      key: 'M',
      label: t('意義力'),
      delta: 2,
      bar: 'bg-tile-peach',
      description: t('理解「為什麼投入」，讓你的努力更有方向感與意義感。'),
    },
    {
      key: 'E',
      label: t('投入力'),
      delta: 2,
      bar: 'bg-tile-mint',
      description: t('觀察心流條件，你離沈浸的狀態又近了一步。'),
    },
  ] as const
}

// 進入頁分鐘/強度說明
function getPgBoosts(t: TFn) {
  return [
    { label: t('意義力'), delta: 2 },
    { label: t('成就力'), delta: 3 },
    { label: t('投入力'), delta: 2 },
  ]
}

export const Route = createFileRoute('/app/process-goal')({
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
  | 'R_CELEBRATE'
  // 模組二【提升專注錦囊】
  | 'B_INPUT'
  | 'B_RESULT'
  | 'B_CELEBRATE'

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
const WEEKDAY_LABELS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function formatDate(date: Date, t: TFn): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y} / ${m} / ${d}（${t(WEEKDAY_LABELS[date.getDay()])}）`
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

async function insertCommunityPost(
  userId: string,
  content: ShareContent,
  privacy: Privacy,
  payload?: Record<string, unknown>,
): Promise<string | null> {
  const fields = privacyToFields(privacy)
  const { data: profile } = await supabase.from('profiles').select('name, avatar').eq('id', userId).maybeSingle()
  const anonName = fields.use_real_name ? (profile?.name || pickAnonName()) : pickAnonName()
  // item_1~3 在 DB 有 NOT NULL 約束（感恩日記固定填三項），過程目標覺察
  // 只用到 1~2 項，未用到的補空字串而非 null；社群卡片以 filter(Boolean)
  // 過濾空字串，不會顯示空泡泡。payload 則承載「客製版型」的結構化欄位。
  const baseRow: Record<string, unknown> = {
    user_id: userId,
    practice_type: 'process_goal',
    item_1: content.item_1 || '',
    item_2: content.item_2 ?? '',
    item_3: content.item_3 ?? '',
    ai_feedback: content.ai_feedback ?? null,
    is_shared: fields.is_shared,
    use_real_name: fields.use_real_name,
    anon_name: anonName,
    avatar: profile?.avatar ?? null,
    entry_date: isoLocalDate(new Date()),
  }

  const attempt = (row: Record<string, unknown>) =>
    supabase.from('gratitude_entries').insert(row).select('id').single()

  let { data, error } = await attempt(payload ? { ...baseRow, payload } : baseRow)

  // payload 欄位尚未建立（migration 未跑）→ 退回不含 payload 的寫入，
  // 確保貼文照樣發得出去（顯示退回 item 條列版），不再重蹈無聲失敗。
  if (error && payload && (error.code === '42703' || /payload/i.test(error.message ?? ''))) {
    console.warn('[process-goal community] payload 欄位不存在，請在 Supabase 跑 process_goal.sql；本次以退回版發佈')
    ;({ data, error } = await attempt(baseRow))
  }

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
    <div className="animate-fade-up mx-auto max-w-xl px-6 pb-8 pt-5 md:px-10">{children}</div>
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
      style={{ backgroundColor: disabled ? '#cfe2ee' : PURPLE }}
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
        className="w-full resize-none overflow-hidden rounded-2xl border border-border bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-sm outline-none transition focus:border-[#542916]"
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

function AiBlock({
  text,
  loading,
  loadingDurationMs = 3000,
}: {
  text: string
  loading?: boolean
  loadingDurationMs?: number
}) {
  const { t } = useLanguage()
  return (
    <div className="overflow-hidden rounded-2xl" style={PURPLE_BG}>
      <div className="flex flex-col gap-2 p-4">
        <div className="flex gap-3">
          <div className="w-1 shrink-0 rounded-full" style={{ backgroundColor: PURPLE }} />
          <p className="text-[15px] font-medium leading-relaxed">
            {loading ? t('正在為你整理…') : text}
          </p>
        </div>
        {loading && <AiProgressBar durationMs={loadingDurationMs} className="pl-4" />}
      </div>
    </div>
  )
}

function PgBackIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function PgCelebrateCheckIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="#FEFAF0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

// 返回鍵：比照感恩日記，左上角圓形白底按鈕，讓滑動手勢／返回鍵／按鍵三種操作視覺一致。
function BackBar({ onBack }: { onBack: () => void }) {
  const { t } = useLanguage()
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-4 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#542916] bg-[#FEFAF0] text-[#542916] shadow-soft transition active:scale-90"
      aria-label={t('返回')}
    >
      <PgBackIcon />
    </button>
  )
}

// ── 主元件 ───────────────────────────────────────────────────────────────
function ProcessGoalPage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [userId, setUserId] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('LOADING')
  const [momentCount, setMomentCount] = useState(0)

  // 練習內部的 phase 也要能被瀏覽器返回／邊緣滑動手勢／畫面返回鍵一致地「退一層」
  // （比照感恩日記），而不是直接跳出整個練習回首頁。LOADING／INTRO 是最外層。
  const stageBack = () => {
    if (phase === 'R_INPUT' || phase === 'B_INPUT') setPhase('INTRO')
    else if (phase === 'R_INSIGHT') setPhase('R_INPUT')
    else if (phase === 'R_CELEBRATE') setPhase('R_INSIGHT')
    else if (phase === 'B_RESULT') setPhase('B_INPUT')
    else if (phase === 'B_CELEBRATE') setPhase('B_RESULT')
  }
  const triggerBack = useStageBack(phase, (p) => p === 'INTRO' || p === 'LOADING', stageBack)

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
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-soft border-t-[#542916]" />
          <p className="text-sm text-muted-foreground">{t('載入中…')}</p>
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
        onGoBack={() => window.history.back()}
      />
    )
  }

  if (phase.startsWith('R_')) {
    return (
      <RecordModule
        phase={phase}
        setPhase={setPhase}
        userId={userId!}
        toIntro={() => setPhase('INTRO')}
        onBack={triggerBack}
      />
    )
  }

  return (
    <BoostModule
      phase={phase}
      setPhase={setPhase}
      userId={userId!}
      toIntro={() => setPhase('INTRO')}
      onBack={triggerBack}
    />
  )
}

// ════════════════════════════════════════════════════════════════════════
// 介紹頁（仿感恩日記進入頁）
// ════════════════════════════════════════════════════════════════════════
function Intro({
  momentCount,
  onRecord,
  onBoost,
  onGoBack,
}: {
  momentCount: number
  onRecord: () => void
  onBoost: () => void
  onGoBack: () => void
}) {
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="animate-fade-up mx-auto max-w-md px-5 pt-4 pb-8">
      {/* 愛心橫幅 + 3 分鐘標記（比照感恩日記進入頁） */}
      <div className="relative -mx-5 h-[170px] overflow-hidden">
        <img
          src={processGoalBanner}
          alt=""
          className="pointer-events-none absolute bottom-[-10px] left-1/2 w-[430px] max-w-none -translate-x-1/2"
        />
        <button
          onClick={onGoBack}
          className="absolute left-1 top-1 z-[2] flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#542916] bg-[#FEFAF0] text-[#542916] shadow-soft transition active:scale-90"
          aria-label={t('返回')}
        >
          <PgBackIcon />
        </button>
        <div className="absolute right-5 top-16 z-[2] flex h-[70px] w-[70px] flex-col items-center justify-center rounded-xl border-[3px] border-[#88B8CE] bg-cream">
          <span className="font-en text-[30px] font-bold leading-none text-foreground">3</span>
          <span className="mt-0.5 text-xs text-muted-foreground">{t('分鐘')}</span>
        </div>
      </div>

      <h1 className="mt-3.5 text-[27px] font-black tracking-[0.03em] text-foreground">{t('過程目標覺察練習')}</h1>
      <p className="font-en mt-1 text-[15px] font-medium tracking-[0.04em] text-muted-foreground">Process Goal Awareness</p>

      <div className="mt-4 rounded-[20px] bg-gold p-4 text-[15px] leading-[1.75] text-[#5b4226]">
        {t('過程目標覺察（Process Goal Awareness）幫助你看見自己「最容易專注」的條件。先把專注時刻一筆筆記下來，AI 會幫你看穿背後真正的需求；之後遇到難以投入的事，就能用你過去的成功經驗，為你量身打造一個能立刻試的方法。')}
      </div>

      <div className="mt-3">
        {!expanded ? (
          <button onClick={() => setExpanded(true)} className="text-xs font-bold text-primary">
            {t('查看更多 ▾')}
          </button>
        ) : (
          <div className="rounded-2xl bg-card p-4 shadow-soft text-sm leading-relaxed flex flex-col gap-4">
            <div>
              <p className="font-extrabold text-foreground mb-1.5">{t('核心目標')}</p>
              <ul className="flex flex-col gap-1 text-foreground/75 pl-3">
                <li>{t('・看見自己最容易專注的條件（人、時、地）')}</li>
                <li>{t('・理解這些條件背後真正滿足的心理需求')}</li>
                <li>{t('・卡住時，把過去的成功條件遷移到眼前的難事')}</li>
              </ul>
            </div>
            <div>
              <p className="font-extrabold text-foreground mb-1.5">{t('怎麼進行')}</p>
              <ul className="flex flex-col gap-1 text-foreground/75 pl-3">
                <li>{t('・平常：用【專注時刻記錄】把投入的片刻存下來')}</li>
                <li>{t('・卡關：用【提升專注錦囊】拿到一個能立刻試的方法')}</li>
              </ul>
            </div>
            <div>
              <p className="font-extrabold text-foreground mb-1.5">{t('研究指出的效益')}</p>
              <ul className="flex flex-col gap-1 text-foreground/75 pl-3">
                <li>{t('・成就力（Accomplishment）與意義力（Meaning）')}</li>
                <li>{t('・投入力（Engagement）與心流體驗')}</li>
                <li>{t('・降低拖延、提升行動的啟動力')}</li>
              </ul>
            </div>
            <button onClick={() => setExpanded(false)} className="text-xs font-bold text-primary text-left">
              {t('收合 ▴')}
            </button>
          </div>
        )}
      </div>

      {/* 練習內容清單（比照感恩日記進入頁） */}
      <div className="mt-5 flex flex-col gap-3.5">
        {[t('選擇今天要做的模組'), t('記下一個投入的時刻或卡關的困境'), t('閱讀 BOUBA 觀察')].map((item) => (
          <div key={item} className="flex items-center gap-3 text-base text-foreground">
            <span className="h-[22px] w-[22px] shrink-0 rounded-full bg-[#88B8CE]" />
            {item}
          </div>
        ))}
      </div>

      <h3 className="mt-7 text-[23px] font-black tracking-[0.02em] text-foreground">{t('今天想做哪一個？')}</h3>
      <p className="font-en mb-3 text-[13px] font-medium text-muted-foreground">Choose a Module</p>
      <p className="mb-3 text-sm text-muted-foreground">
        {getPgBoosts(t).map(({ label, delta }) => (
          <span key={label} className="mr-3">
            {label} <strong className="text-foreground">+{delta}</strong>
          </span>
        ))}
      </p>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onRecord}
          className="flex items-center gap-4 rounded-3xl border-[3px] border-gold-deep bg-gold p-5 text-left shadow-soft transition active:scale-[0.98]"
        >
          <div className="flex-1">
            <p className="font-extrabold text-[#5b4226]">{t('專注時刻記錄')}</p>
            <p className="mt-0.5 text-sm text-[#5b4226]/75">{t('記下一個你特別投入的時刻，AI 幫你看見背後的需求')}</p>
            <p className="mt-1 text-[11px] font-bold text-[#8a6320]">
              {momentCount > 0 ? t('你已記錄 {n} 個專注時刻', { n: momentCount }) : t('從你的第一個專注時刻開始')}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onBoost}
          className="flex items-center gap-4 rounded-3xl bg-card p-5 text-left shadow-soft transition active:scale-[0.98]"
        >
          <div className="flex-1">
            <p className="font-extrabold text-foreground">{t('提升專注錦囊')}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('卡住了？用你過去的專注經驗，給你一個能立刻試的方法')}</p>
            {momentCount === 0 && (
              <p className="mt-1 text-[11px] font-bold text-primary">{t('建議先記錄幾個專注時刻，建議會更準')}</p>
            )}
          </div>
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 模組一【專注時刻記錄】
// ════════════════════════════════════════════════════════════════════════
function RecordModule({
  phase,
  setPhase,
  userId,
  toIntro,
  onBack,
}: {
  phase: Phase
  setPhase: (p: Phase) => void
  userId: string
  toIntro: () => void
  onBack: () => void
}) {
  const [event, setEvent] = useState('')
  const [who, setWho] = useState('')
  const [whenTime, setWhenTime] = useState('')
  const [wherePlace, setWherePlace] = useState('')
  const [insight, setInsight] = useState('')
  const [category, setCategory] = useState('other')
  const [conditionTags, setConditionTags] = useState<string[]>([])
  const [loadingAi, setLoadingAi] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const { t } = useLanguage()
  const [streak, setStreak] = useState<number | null>(null)
  const savedRef = useRef(false)
  const savedEntryIdRef = useRef<string | null>(null)
  const shareCardRef = useRef<HTMLDivElement>(null)
  const today = useMemo(() => formatDate(new Date(), t), [t])

  const fallbackInsight = () =>
    t('從你的描述裡，能感覺到你在那個情境特別投入。多記幾次，AI 就能更準地看出你需要的專注條件。')

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

  const handleShare = async () => {
    if (!shareCardRef.current || sharing) return
    setSharing(true)
    try {
      const node = shareCardRef.current
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(node, {
        width: 1080,
        height: 1440,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#FEFAF0',
        style: { position: 'static', left: '0', top: '0', transform: 'none', margin: '0' },
      })
      const filename = `focus-moment-${isoLocalDate(new Date())}.png`
      await saveOrShareImage(dataUrl, filename, t('我的專注時刻'))
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') console.error('[share image]', e)
    } finally {
      setSharing(false)
    }
  }

  const save = async () => {
    if (savedRef.current) {
      setPhase('R_CELEBRATE')
      return
    }
    savedRef.current = true
    setSubmitting(true)
    try {
      // 1. 寫入 focus_logs
      const { error } = await supabase.from('focus_logs').insert({
        user_id: userId,
        log_date: isoLocalDate(new Date()),
        log_kind: 'moment',
        had_focus_moment: true,
        focus_description: event || null,
        moment_who: who || null,
        moment_when: whenTime || null,
        moment_where: wherePlace || null,
        insight: insight || null,
        category,
      })
      if (error) throw error

      // 2. 建立社群貼文（預設隱私，之後在完成頁可改）
      //    payload 承載「專注時刻記錄」客製版型：事件／人時地／AI 回饋。
      const entryId = await insertCommunityPost(userId, {
        item_1: event || t('記下了一個專注時刻'),
        item_2: insight || null,
        item_3: null,
        ai_feedback: insight || null,
      }, DEFAULT_PRIVACY, {
        v: 'moment',
        event,
        who,
        when: whenTime,
        where: wherePlace,
        insight,
      })
      savedEntryIdRef.current = entryId

      track('process_goal_moment_recorded')
      await markStreak(userId)
      setStreak(await computeUnifiedStreak(userId))
      setPhase('R_CELEBRATE')
    } catch (e: unknown) {
      savedRef.current = false
      const msg = e instanceof Error ? e.message : String(e)
      alert(t('儲存失敗：{msg}', { msg }))
    } finally {
      setSubmitting(false)
    }
  }

  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent)

  if (phase === 'R_INPUT') {
    const ready = event.trim() && who.trim() && whenTime.trim() && wherePlace.trim()
    return (
      <Screen>
        <BackBar onBack={onBack} />
        <h1 className="mt-3 text-2xl font-extrabold leading-tight text-foreground">{t('記下一個你專注的時刻')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t('回想一個你特別「在狀態」的片段——時間過得很快、腦子很清晰、有種自然的流動感。')}
        </p>

        <div className="mt-6">
          <p className="mb-1.5 text-sm font-bold text-foreground">{t('那是什麼事？當下的感受是什麼？')}</p>
          <AutoTextarea
            value={event}
            onChange={setEvent}
            placeholder={t('例：在咖啡廳寫報告，一直被推著往前，覺得很投入、忘記時間')}
            autoFocus
            minHeight={110}
          />
        </div>

        <div className="mt-7 rounded-2xl bg-muted/40 p-4">
          <p className="mb-3 text-sm font-bold text-foreground">{t('當時的人、時、地：')}</p>
          <div className="flex flex-col gap-4">
            <Field label={t('人物 · 一個人，還是有別人在？')} value={who} onChange={setWho} placeholder={t('例：一個人／和同學一起')} />
            <Field label={t('時間 · 什麼時候？')} value={whenTime} onChange={setWhenTime} placeholder={t('例：週六下午、深夜')} />
            <Field label={t('地點 · 在哪裡？')} value={wherePlace} onChange={setWherePlace} placeholder={t('例：咖啡廳、圖書館')} />
          </div>
        </div>

        <div className="mt-6">
          <PurpleCta disabled={!ready} onClick={runInsight}>{t('看看 AI 的觀察')}</PurpleCta>
        </div>
      </Screen>
    )
  }

  if (phase === 'R_INSIGHT') {
    return (
      <>
        {/* 隱藏的分享圖（和感恩日記一樣，放在畫面外） */}
        <div
          ref={shareCardRef}
          aria-hidden
          className="pointer-events-none fixed -left-[9999px] top-0"
          style={{ width: '1080px', height: '1440px' }}
        >
          <PgShareCard
            kind="record"
            mainText={event}
            aiText={insight}
            date={today}
            streak={streak}
          />
        </div>

        <Screen>
          <BackBar onBack={onBack} />
          <h2 className="text-xl font-extrabold leading-snug text-foreground">{t('我從你的描述裡，聽見了…')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('這是你這個專注時刻背後，可能真正需要的條件。你可以把這張圖儲存下來。')}</p>

          <div className="mt-6">
            {loadingAi ? <AiBlock text="" loading loadingDurationMs={2800} /> : (
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
              {conditionTags.map((tag) => (
                <span key={tag} className="rounded-full px-3 py-1 text-sm font-bold" style={TEAL}>{tag}</span>
              ))}
            </div>
          )}

          <div className="mt-7 flex flex-col gap-3 pb-4">
            {/* 下載 / 分享圖片：白框樣式 */}
            <button
              onClick={handleShare}
              disabled={sharing || loadingAi}
              className="flex h-16 w-full items-center justify-center gap-3 rounded-full border border-border bg-white text-base font-extrabold tracking-[0.2em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
            >
              {sharing ? t('正在生成圖片…') : isMobile ? t('分享圖片') : t('下載圖片')}
            </button>
            {/* 下一步：儲存後進入完成頁 */}
            <button
              onClick={save}
              disabled={submitting || loadingAi}
              className="h-14 w-full rounded-full text-sm font-extrabold tracking-[0.2em] text-white shadow-soft transition active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: submitting || loadingAi ? '#cfe2ee' : PURPLE }}
            >
              {submitting ? t('處理中…') : t('下一步')}
            </button>
          </div>
        </Screen>
      </>
    )
  }

  // R_CELEBRATE
  return (
    <PgCelebrateStage
      title={t('今日專注時刻記錄完成！')}
      subtitle={t('每記一筆，你的專注地圖就更完整一點。')}
      streak={streak}
      savedEntryId={savedEntryIdRef.current}
      userId={userId}
      onAgain={() => {
        savedRef.current = false
        savedEntryIdRef.current = null
        setEvent(''); setWho(''); setWhenTime(''); setWherePlace('')
        setInsight(''); setCategory('other'); setConditionTags([])
        setStreak(null); setSubmitting(false)
        setPhase('R_INPUT')
      }}
      againLabel={t('再記一個專注時刻')}
      onIntro={toIntro}
    />
  )
}

// ════════════════════════════════════════════════════════════════════════
// 模組二【提升專注錦囊】
// ════════════════════════════════════════════════════════════════════════
function BoostModule({
  phase,
  setPhase,
  userId,
  toIntro,
  onBack,
}: {
  phase: Phase
  setPhase: (p: Phase) => void
  userId: string
  toIntro: () => void
  onBack: () => void
}) {
  const [situation, setSituation] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [matchedSummary, setMatchedSummary] = useState('')
  const [hasMatch, setHasMatch] = useState(false)
  const [loadingAi, setLoadingAi] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const { t } = useLanguage()
  const [streak, setStreak] = useState<number | null>(null)
  const savedRef = useRef(false)
  const savedEntryIdRef = useRef<string | null>(null)
  const shareCardRef = useRef<HTMLDivElement>(null)
  const today = useMemo(() => formatDate(new Date(), t), [t])

  const fallbackSuggestion = (records: MomentRecord[]) => {
    if (!records.length) {
      return t('先別急著逼自己。去【專注時刻記錄】補一筆相近的時刻——記得越多，我就越知道你需要什麼條件。現在，先把這件事拆到「只做最小的第一步」。')
    }
    const r = records[0]
    const cond = [r.where_place, r.who].filter(Boolean).join('、') || t('你熟悉的條件')
    return t('想想你以前在「{cond}」很投入的樣子，把那個氛圍帶過來：先換到類似的環境，只做這件事的第一個 10 分鐘。開始比完成更重要。', { cond })
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

  const handleShare = async () => {
    if (!shareCardRef.current || sharing) return
    setSharing(true)
    try {
      const node = shareCardRef.current
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(node, {
        width: 1080,
        height: 1440,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#FEFAF0',
        style: { position: 'static', left: '0', top: '0', transform: 'none', margin: '0' },
      })
      const filename = `focus-boost-${isoLocalDate(new Date())}.png`
      await saveOrShareImage(dataUrl, filename, t('我的專注錦囊'))
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') console.error('[share image]', e)
    } finally {
      setSharing(false)
    }
  }

  const save = async () => {
    if (savedRef.current) {
      setPhase('B_CELEBRATE')
      return
    }
    savedRef.current = true
    setSubmitting(true)
    try {
      const { error } = await supabase.from('focus_logs').insert({
        user_id: userId,
        log_date: isoLocalDate(new Date()),
        log_kind: 'boost',
        had_focus_moment: false,
        difficult_task: situation || null,
        ai_feedback: suggestion || null,
      })
      if (error) throw error

      // payload 承載「提升專注錦囊」客製版型：困境 + AI 錦囊。
      const entryId = await insertCommunityPost(userId, {
        item_1: situation ? t('卡關：{situation}', { situation }) : t('今天有件事提不起勁。'),
        item_2: suggestion || null,
        item_3: null,
        ai_feedback: suggestion || null,
      }, DEFAULT_PRIVACY, {
        v: 'boost',
        situation,
        suggestion,
      })
      savedEntryIdRef.current = entryId

      track('process_goal_boost_done')
      await markStreak(userId)
      setStreak(await computeUnifiedStreak(userId))
      setPhase('B_CELEBRATE')
    } catch (e: unknown) {
      savedRef.current = false
      const msg = e instanceof Error ? e.message : String(e)
      alert(t('儲存失敗：{msg}', { msg }))
    } finally {
      setSubmitting(false)
    }
  }

  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent)

  if (phase === 'B_INPUT') {
    return (
      <Screen>
        <BackBar onBack={onBack} />
        <h1 className="mt-3 text-2xl font-extrabold leading-tight text-foreground">{t('現在，什麼事讓你卡住了？')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t('說說現在這件難以專注、提不起勁的事，連同當下的情境一起講。我會從你過去的專注經驗裡，找一個能立刻試的方法。')}
        </p>
        <div className="mt-6">
          <AutoTextarea
            value={situation}
            onChange={setSituation}
            placeholder={t('例：要背一堆單字但完全靜不下心，坐在房間滑手機一小時了')}
            autoFocus
            minHeight={120}
          />
        </div>
        <div className="mt-7">
          <PurpleCta disabled={!situation.trim()} onClick={runBoost}>{t('為我找一個方法')}</PurpleCta>
        </div>
      </Screen>
    )
  }

  if (phase === 'B_RESULT') {
    return (
      <>
        {/* 隱藏的分享圖 */}
        <div
          ref={shareCardRef}
          aria-hidden
          className="pointer-events-none fixed -left-[9999px] top-0"
          style={{ width: '1080px', height: '1440px' }}
        >
          <PgShareCard
            kind="boost"
            mainText={situation}
            aiText={suggestion}
            date={today}
            streak={streak}
          />
        </div>

        <Screen>
          <BackBar onBack={onBack} />
          <h2 className="text-xl font-extrabold leading-snug text-foreground">{t('你的專注錦囊')}</h2>
          {!loadingAi && hasMatch && matchedSummary && (
            <p className="mt-2 text-sm text-muted-foreground">{t('參考了你過去的經驗：{summary}', { summary: matchedSummary })}</p>
          )}

          <div className="mt-5">
            {loadingAi ? <AiBlock text="" loading loadingDurationMs={3400} /> : (
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
              {t('這類活動還沒有你的專注紀錄。先去【專注時刻記錄】補幾筆相近的時刻，下次的錦囊就會更貼近你。')}
            </div>
          )}

          <div className="mt-7 flex flex-col gap-3 pb-4">
            <button
              onClick={handleShare}
              disabled={sharing || loadingAi}
              className="flex h-16 w-full items-center justify-center gap-3 rounded-full border border-border bg-white text-base font-extrabold tracking-[0.2em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
            >
              {sharing ? t('正在生成圖片…') : isMobile ? t('分享圖片') : t('下載圖片')}
            </button>
            <button
              onClick={save}
              disabled={submitting || loadingAi}
              className="h-14 w-full rounded-full text-sm font-extrabold tracking-[0.2em] text-white shadow-soft transition active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: submitting || loadingAi ? '#cfe2ee' : PURPLE }}
            >
              {submitting ? t('處理中…') : t('下一步')}
            </button>
          </div>
        </Screen>
      </>
    )
  }

  // B_CELEBRATE
  return (
    <PgCelebrateStage
      title={t('今日專注錦囊完成！')}
      subtitle={t('帶著這個方法去試試，開始比完成更重要。')}
      streak={streak}
      savedEntryId={savedEntryIdRef.current}
      userId={userId}
      onAgain={() => setPhase('R_INPUT')}
      againLabel={t('順手記一個專注時刻')}
      onIntro={toIntro}
    />
  )
}

// ════════════════════════════════════════════════════════════════════════
// 分享圖卡（仿感恩日記 ShareCard，用於 html-to-image 生成圖片）
// ════════════════════════════════════════════════════════════════════════
function PgShareCard({
  kind,
  mainText,
  aiText,
  date,
  streak,
}: {
  kind: 'record' | 'boost'
  mainText: string
  aiText: string
  date: string
  streak: number | null
}) {
  const { t } = useLanguage()
  const isRecord = kind === 'record'
  const mainLen = mainText.length
  const mainFontSize = mainLen < 60 ? 40 : mainLen < 120 ? 34 : 29

  return (
    <div
      style={{
        width: '1080px',
        height: '1440px',
        background: 'linear-gradient(180deg, #FEFAF0 0%, #f6efe0 55%, #efe2c9 100%)',
        padding: '76px 72px 56px',
        boxSizing: 'border-box',
        color: '#542916',
        display: 'flex',
        flexDirection: 'column',
        gap: 30,
      }}
    >
      <div>
        <div style={{ fontSize: 18, letterSpacing: 8, fontWeight: 800, color: '#88B8CE' }}>
          PSY BY PSY · {isRecord ? 'FOCUS MOMENT' : 'FOCUS BOOST'}
        </div>
        <div style={{ fontSize: 58, fontWeight: 900, marginTop: 16, lineHeight: 1.25, letterSpacing: 1 }}>
          {isRecord ? t('今天的專注時刻') : t('今天的專注錦囊')}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, opacity: 0.6, marginTop: 12 }}>{date}</div>
      </div>

      {/* 主體內容（事件 or 困境） */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 40,
          padding: '34px 38px',
          boxShadow: '0 8px 22px -10px rgba(40,24,12,0.18)',
        }}
      >
        <div style={{ fontSize: 18, letterSpacing: 6, fontWeight: 800, color: '#88B8CE', marginBottom: 14 }}>
          {isRecord ? t('我的專注時刻') : t('遇到的困境')}
        </div>
        <div style={{ fontSize: mainFontSize, lineHeight: 1.55, whiteSpace: 'pre-wrap', opacity: 0.85 }}>
          {mainText}
        </div>
      </div>

      {/* AI 洞察 or 建議 */}
      {aiText ? (
        <div
          style={{
            background: 'linear-gradient(135deg, #f6efe0 0%, #efe2c9 100%)',
            borderRadius: 40,
            padding: '34px 38px',
            boxShadow: '0 8px 22px -10px rgba(40,24,12,0.18)',
          }}
        >
          <div style={{ fontSize: 18, letterSpacing: 6, fontWeight: 800, color: '#88B8CE', marginBottom: 14 }}>
            {isRecord ? t('BOUBA 觀察') : t('我的專注錦囊')}
          </div>
          <div style={{ fontSize: 32, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{aiText}</div>
        </div>
      ) : null}

      {/* 連續打卡 */}
      {streak !== null && streak > 0 && (
        <div
          style={{
            background: 'linear-gradient(135deg, #9fc6dc 0%, #88B8CE 100%)',
            borderRadius: 40,
            padding: '30px 36px',
            textAlign: 'center',
            color: '#FEFAF0',
          }}
        >
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 2, lineHeight: 1.3 }}>
            {t('連續健心第 {n} 天', { n: streak })}
          </div>
        </div>
      )}

      {/* Logo */}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
        <img
          src="/assets/logo-wordmark.png"
          alt="PSY by PSY"
          style={{ height: 44, objectFit: 'contain', opacity: 0.8 }}
          crossOrigin="anonymous"
        />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 完成頁（仿感恩日記 CelebrateStage）
// 顯示：連續打卡 + 今日完成 → PERMA 幸福力成長 → 隱私設定 → 結束練習
// ════════════════════════════════════════════════════════════════════════
function PgCelebrateStage({
  title,
  subtitle,
  streak,
  savedEntryId,
  userId,
  onAgain,
  againLabel,
  onIntro,
}: {
  title: string
  subtitle: string
  streak: number | null
  savedEntryId: string | null
  userId: string
  onAgain?: () => void
  againLabel?: string
  onIntro: () => void
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const router = useRouter()
  const [privacy, setPrivacy] = useState<Privacy>(DEFAULT_PRIVACY)
  const [todayCount, setTodayCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const today = isoLocalDate(new Date())
      const { count } = await supabase
        .from('focus_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('log_date', today)
      if (!cancelled) setTodayCount(count ?? 0)
    })()
    return () => { cancelled = true }
  }, [userId])

  const handlePrivacyChange = async (next: Privacy) => {
    setPrivacy(next)
    if (savedEntryId) {
      void updateCommunityPrivacy(savedEntryId, userId, next)
    }
  }

  const handleFinish = async () => {
    if (saving) return
    setSaving(true)
    await router.invalidate()
    // 與感恩日記一致：導向社群動態牆（貼文已 is_shared，會出現在牆上）
    navigate({ to: '/app/community', search: { showEntry: 1 } })
  }

  return (
    <div className="animate-fade-up mx-auto flex max-w-3xl flex-col items-center px-6 pb-8 pt-5 md:px-10">
      {/* 完成圖示 */}
      <div className="celebrate-pop mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-primary shadow-soft">
        <PgCelebrateCheckIcon />
      </div>
      <h2 className="mb-2 text-center text-2xl font-extrabold text-foreground">{title}</h2>
      <p className="mb-6 max-w-md text-center text-sm leading-relaxed text-muted-foreground">{subtitle}</p>

      {/* 統計卡：今日完成 + 連續打卡 */}
      <div className="mb-6 flex w-full gap-3">
        <div className="flex flex-1 flex-col items-center rounded-2xl bg-card px-4 py-3 shadow-soft">
          <span className="text-xl font-extrabold text-primary">
            {todayCount !== null ? todayCount : '—'}
          </span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {t('今日完成')}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center rounded-2xl bg-card px-4 py-3 shadow-soft">
          <span className="text-xl font-extrabold text-primary">
            {streak !== null ? streak : '—'}
          </span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {t('連續健心')}
          </span>
        </div>
      </div>

      {/* PERMA 幸福力成長（含動態進度條） */}
      <div className="mb-6 w-full rounded-3xl bg-card p-6 shadow-soft">
        <p className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
          {t('練習後 PERMA 幸福力成長')}
        </p>
        <div className="flex flex-col gap-5">
          {getPgPermaBoosts(t).map(({ key, label, delta, bar, description }, i) => (
            <div
              key={key}
              className="celebrate-row flex flex-col gap-2"
              style={{ animationDelay: `${0.15 + i * 0.18}s` }}
            >
              <div className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-sm font-extrabold text-foreground">
                  {label}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${bar} celebrate-bar`}
                    style={{ width: `${(delta / 3) * 100}%`, animationDelay: `${0.25 + i * 0.18}s` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-extrabold text-primary">
                  +{delta}
                </span>
              </div>
              <p className="pl-[68px] text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 隱私設定（決定是否公開這次打卡到社群） */}
      <div className="mb-7 w-full rounded-3xl bg-card px-5 py-4 shadow-soft">
        <p className="text-sm font-extrabold text-foreground">{t('分享到社群的隱私設定')}</p>
        <div className="mt-3 flex flex-col gap-2">
          {PRIVACY_OPTIONS.map((opt) => {
            const active = privacy === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => handlePrivacyChange(opt.value)}
                aria-pressed={active}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-muted/40 hover:bg-muted'
                }`}
              >
                <span className="flex-1">
                  <span className={`block text-sm font-bold ${active ? 'text-primary' : 'text-foreground'}`}>
                    {t(opt.label)}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {t(opt.hint)}
                  </span>
                </span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    active ? 'border-primary' : 'border-border'
                  }`}
                >
                  {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* CTA：結束練習 → 跳社群；也可以再做一次 */}
      <div className="flex w-full flex-col gap-3">
        <button
          onClick={handleFinish}
          disabled={saving}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full text-sm font-extrabold tracking-[0.15em] text-white shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          style={{ backgroundColor: saving ? '#cfe2ee' : PURPLE }}
        >
          {t('結束今天練習')}
        </button>
        {onAgain && againLabel && (
          <GhostButton onClick={onAgain}>{againLabel}</GhostButton>
        )}
        <GhostButton onClick={onIntro}>{t('回練習選單')}</GhostButton>
      </div>
    </div>
  )
}
