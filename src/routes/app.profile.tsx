import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { streakFromDates } from '../lib/streak'
import { checkAndGenerateReviews } from '../lib/reviews'
import { ReviewsSection } from '../components/ReviewsSection'
import playingMascot from '../assets/ui/playing-mascot.png'
import avatar1 from '../assets/ui/avatar-1.png'
import avatar2 from '../assets/ui/avatar-2.png'
import { useLanguage } from '../lib/i18n/context'

type TargetCode = 'others' | 'self' | 'environment' | 'experience' | 'custom'

const TARGET_META: Record<TargetCode, { label: string }> = {
  others:      { label: '身邊他人' },
  self:        { label: '自己' },
  environment: { label: '環境' },
  experience:  { label: '體驗' },
  custom:      { label: '自訂' },
}

// 暖色重設計：對齊附圖五（自己=金、身邊他人=藍、自訂=粉），其餘沿用全站語意色
const TARGET_COLORS: Record<TargetCode, string> = {
  self:        '#F1C166',
  others:      '#88B8CE',
  environment: '#7BA86E',
  experience:  '#C99A6A',
  custom:      '#D18197',
}

const TARGET_INSIGHT: Record<TargetCode, string> = {
  others:      '你的幸福感有很大一部分來自身邊的人，珍惜這些連結吧。',
  self:        '你非常懂得欣賞自己的努力與成長，這是很珍貴的自我覺察。',
  environment: '你對生活中的細微美好特別敏感，這份覺察讓你隨時都能找到禮物。',
  experience:  '你善於從日常的小體驗中找到喜悅，生活對你來說充滿驚喜。',
  custom:      '你的感恩來自各種面向，這份多元的覺察豐富了你的內在世界。',
}

const TARGET_INFO: Record<TargetCode, { title: string; desc: string }> = {
  others:      { title: '身邊他人', desc: '感謝身邊的人能強化社會連結感（Relatedness），是 PERMA 中「R」的核心。研究顯示，表達感謝能同時提升給予者與接受者的幸福感。' },
  self:        { title: '自己', desc: '對自己的努力心存感謝，能培養自我同情（Self-Compassion）與成長型思維（Growth Mindset），減少自我批評，增加心理韌性。' },
  environment: { title: '環境', desc: '對自然與空間的感謝能喚起「敬畏感」（Awe），研究發現敬畏感能降低壓力荷爾蒙，並擴展我們對世界的視野。' },
  experience:  { title: '體驗', desc: '感謝日常體驗能強化「正向情緒記憶」，讓大腦更容易在未來注意到美好的事物，形成正向情緒的上升螺旋。' },
  custom:      { title: '自訂', desc: '多元的感恩來源代表你的覺察力不受限制，能從生活的各個角落汲取力量。' },
}

type AvatarCode = 'avatar-1' | 'avatar-2'

const AVATAR_OPTIONS: { code: AvatarCode; src: string; label: string }[] = [
  { code: 'avatar-1', src: avatar1, label: '夥伴一' },
  { code: 'avatar-2', src: avatar2, label: '夥伴二' },
]

function isPhotoAvatar(code: string | null): boolean {
  return !!code && (code.startsWith('data:image') || code.startsWith('http'))
}

// 頭像現在固定為兩張角色圖，預設 avatar-1。舊資料（emoji 代號 / null）一律回退到 avatar-1。
function avatarSrcByCode(code: string | null): string {
  return AVATAR_OPTIONS.find((a) => a.code === code)?.src ?? avatar1
}

type PermaScores = {
  p_score: number
  e_score: number
  r_score: number
  m_score: number
  a_score: number
}

type GratitudeEntry = {
  id: string
  entry_date: string
  item_1: string
  item_2: string
  item_3: string
  ai_feedback?: string | null
}

// 過程目標覺察的每日紀錄（專注時刻記錄 / 提升專注錦囊），用於「我的健心日記」日曆
// 'morning' 為舊版「早晨啟動」的遺留資料（morning_logs），仍相容顯示。
type PgItem =
  | {
      kind: 'moment'
      log_date: string
      focus_description?: string | null
      insight?: string | null
    }
  | {
      kind: 'boost'
      log_date: string
      difficult_task?: string | null
      ai_feedback?: string | null
    }
  | {
      kind: 'morning'
      log_date: string
      today_task?: string | null
      ai_suggestion?: string | null
    }

const PG_KIND_META: Record<PgItem['kind'], { label: string }> = {
  moment: { label: '專注時刻記錄' },
  boost: { label: '提升專注錦囊' },
  morning: { label: '早晨啟動' },
}

function EditPencilIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

function FlameIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c4 0 6.5-2.5 6.5-6 0-2.5-1.5-4-2.5-5.5.3 2-.7 3-1.5 3 .5-3-1-5.5-3.5-7 .5 2.5-.5 4-2 5.5-1.3 1.3-2.5 2.8-2.5 5 0 3.5 2.5 6 5.5 6z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  )
}

function StopwatchIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2M9 2h6M12 2v3" />
    </svg>
  )
}

export const Route = createFileRoute('/app/profile')({
  loader: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user.id
    if (!userId) return { name: null, avatar: null, scores: null, userId: null, initialEntries: [], streak: 0, monthlyCount: 0, totalCount: 0 }

    const fallbackName =
      (session?.user.user_metadata?.full_name as string | undefined) ??
      (session?.user.user_metadata?.name as string | undefined) ??
      session?.user.email?.split('@')[0] ??
      null

    const today = new Date()
    const y = today.getFullYear()
    const m = today.getMonth() + 1
    const startOfMonth = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const endOfMonth = `${y}-${String(m).padStart(2, '0')}-${lastDay}`

    const [profileRes, permaRes, entriesRes, allDatesRes, focusAllRes, morningAllRes, focusMonthRes, morningMonthRes] = await Promise.all([
      supabase.from('profiles').select('name, avatar').eq('id', userId).maybeSingle(),
      supabase
        .from('perma_scores')
        .select('p_score, e_score, r_score, m_score, a_score, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1),
      // 感恩日記日曆只取感恩日記本身（過程目標覺察的社群貼文也在這張表，需排除）
      supabase
        .from('gratitude_entries')
        .select('id, entry_date, item_1, item_2, item_3, ai_feedback')
        .eq('user_id', userId)
        .eq('practice_type', 'gratitude')
        .gte('entry_date', startOfMonth)
        .lte('entry_date', endOfMonth),
      supabase
        .from('gratitude_entries')
        .select('entry_date')
        .eq('user_id', userId)
        .eq('practice_type', 'gratitude')
        .order('entry_date', { ascending: false }),
      // 過程目標覺察的打卡日（晚間 / 早晨）也算「健心」，併入連續與統計
      supabase.from('focus_logs').select('log_date').eq('user_id', userId),
      supabase.from('morning_logs').select('log_date').eq('user_id', userId),
      supabase.from('focus_logs').select('log_date').eq('user_id', userId).gte('log_date', startOfMonth).lte('log_date', endOfMonth),
      supabase.from('morning_logs').select('log_date').eq('user_id', userId).gte('log_date', startOfMonth).lte('log_date', endOfMonth),
    ])

    // 連續打卡與統計跨練習計算（感恩日記 + 過程目標覺察）
    const unifiedDates = [
      ...(allDatesRes.data ?? []).map((e) => String(e.entry_date)),
      ...(focusAllRes.data ?? []).map((r) => String(r.log_date)),
      ...(morningAllRes.data ?? []).map((r) => String(r.log_date)),
    ]
    const streak = streakFromDates(unifiedDates)

    const monthlyCount =
      (entriesRes.data?.length ?? 0) + (focusMonthRes.data?.length ?? 0) + (morningMonthRes.data?.length ?? 0)
    const totalCount = new Set(unifiedDates.map((d) => d.slice(0, 10))).size

    const dbName = (profileRes.data?.name ?? null) as string | null
    const finalName = dbName ?? fallbackName

    if (!dbName && fallbackName) {
      void supabase
        .from('profiles')
        .upsert({ id: userId, name: fallbackName }, { onConflict: 'id' })
    }

    const permaRows = (permaRes.data ?? []) as (PermaScores & { created_at: string })[]

    return {
      name: finalName,
      avatar: (profileRes.data?.avatar ?? null) as string | null,
      scores: (permaRows[0] ?? null) as (PermaScores & { created_at?: string }) | null,
      userId,
      initialEntries: (entriesRes.data ?? []) as GratitudeEntry[],
      streak,
      monthlyCount,
      totalCount,
    }
  },
  pendingComponent: LoadingState,
  component: ProfilePage,
})

const PERMA_DIMENSIONS = [
  { key: 'p_score' as const, letter: 'P', label: '情緒力', short: '情緒', tile: 'bg-tile-pink' },
  { key: 'e_score' as const, letter: 'E', label: '投入力', short: '投入', tile: 'bg-tile-blue' },
  { key: 'r_score' as const, letter: 'R', label: '連結力', short: '連結', tile: 'bg-tile-peach' },
  { key: 'm_score' as const, letter: 'M', label: '意義力', short: '意義', tile: 'bg-tile-mint' },
  { key: 'a_score' as const, letter: 'A', label: '成就力', short: '成就', tile: 'bg-tile-blue' },
]

const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const WEEK_DAYS = ['日','一','二','三','四','五','六']

// ── PERMA 雷達圖 ────────────────────────────────────────────────────────────

// 黃色五角星標記（資料頂點用），對齊附圖的手繪星星風格
function starPolygon(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = ((-90 + i * 36) * Math.PI) / 180
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`)
  }
  return pts.join(' ')
}

function PermaRadar({ scores }: { scores: PermaScores }) {
  const { t } = useLanguage()
  const cx = 160
  const cy = 150
  const maxR = 80
  const n = PERMA_DIMENSIONS.length
  const angle = (i: number) => ((-90 + (i * 360) / n) * Math.PI) / 180
  const point = (i: number, r: number): [number, number] => [
    cx + Math.cos(angle(i)) * r,
    cy + Math.sin(angle(i)) * r,
  ]
  const poly = (r: number) =>
    PERMA_DIMENSIONS.map((_, i) => point(i, r).join(',')).join(' ')

  const dataPts = PERMA_DIMENSIONS.map((d, i) => point(i, (Math.max(0, scores[d.key]) / 5) * maxR))
  const dataPoly = dataPts.map((p) => p.join(',')).join(' ')

  return (
    <svg viewBox="0 0 320 300" className="w-full">
      {/* 藍色同心五邊形格線 */}
      {[1, 2, 3, 4, 5].map((level) => (
        <polygon
          key={level}
          points={poly((level / 5) * maxR)}
          fill={level === 5 ? 'rgba(136,184,206,0.06)' : 'none'}
          stroke={level === 5 ? '#7fb0c9' : '#a6cce0'}
          strokeWidth={level === 5 ? 1.8 : 1.3}
          strokeLinejoin="round"
        />
      ))}
      {/* 軸線 */}
      {PERMA_DIMENSIONS.map((_, i) => {
        const [x, y] = point(i, maxR)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#c4dded" strokeWidth="1.1" />
      })}
      {/* 金色資料區塊 + 星星頂點 */}
      <polygon points={dataPoly} fill="rgba(241,193,102,0.5)" stroke="#e0a93f" strokeWidth="2.5" strokeLinejoin="round" />
      {dataPts.map(([x, y], i) => (
        <polygon
          key={i}
          points={starPolygon(x, y, 7.5, 3)}
          fill="#F1C166"
          stroke="#dd9f33"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      ))}
      {/* 各維度標籤 + 分數框 */}
      {PERMA_DIMENSIONS.map((d, i) => {
        const [lx, ly] = point(i, maxR + 30)
        const by = ly + 13
        return (
          <g key={d.key}>
            <text
              x={lx}
              y={ly - 3}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="12.5"
              fontWeight="800"
              fill="#542916"
            >
              {d.letter} {t(d.label)}
            </text>
            <rect x={lx - 16} y={by - 11} width="32" height="22" rx="7" fill="#FEFAF0" stroke="#542916" strokeWidth="1.5" />
            <text
              x={lx}
              y={by + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="13"
              fontWeight="800"
              fill="#542916"
            >
              {Math.max(0, scores[d.key]).toFixed(1)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Header() {
  const { t } = useLanguage()
  return (
    <div className="px-5 pt-4 text-center">
      <h1 className="text-[25px] font-black tracking-[0.04em] text-foreground">{t('我的健心檔案')}</h1>
      <p className="font-en mt-1 text-sm font-medium tracking-[0.02em] text-muted-foreground">My PSY by PSY Profile</p>
      <p className="mt-4 text-xl font-bold tracking-[0.02em] text-muted-foreground">{t('本週進度，小改變促進大改變')}</p>
    </div>
  )
}

// 區段標題（中文 900 + 英文副標），對齊新版設計
function SectionLabel({ zh, en }: { zh: string; en: string }) {
  return (
    <div className="mt-3">
      <h2 className="text-[21px] font-black tracking-[0.03em] text-foreground">{zh}</h2>
      <p className="font-en text-[13px] font-medium text-muted-foreground">{en}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-3xl">
      <Header />
      <div className="flex flex-col gap-4 px-6 pt-4 md:px-10">
        <div className="h-24 animate-pulse rounded-3xl bg-primary-soft" />
        <div className="h-72 animate-pulse rounded-3xl bg-primary-soft" />
      </div>
    </div>
  )
}

// ── 感恩對象地圖 ────────────────────────────────────────────────────────────

function DonutChart({ segments }: { segments: { code: TargetCode; count: number; pct: number }[] }) {
  const r = 37
  const cx = 50
  const cy = 50
  const circumference = 2 * Math.PI * r
  // 單一區塊時不留缺口（否則圓形會被切一刀）；多區塊用圓角端 + 缺口呈現附圖五的塊狀甜甜圈。
  const gapPx = segments.length > 1 ? 9 : 0

  if (segments.length === 0) {
    return (
      <svg viewBox="0 0 100 100" className="h-36 w-36">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#efe7d6" strokeWidth="17" />
      </svg>
    )
  }

  let cumulative = 0
  return (
    <svg viewBox="0 0 100 100" className="h-36 w-36 -rotate-90">
      {segments.map(({ code, pct }) => {
        const dash = Math.max(0.5, pct * circumference - gapPx)
        const gap = circumference - dash
        const offset = -(cumulative * circumference)
        cumulative += pct
        return (
          <circle
            key={code}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={TARGET_COLORS[code]}
            strokeWidth="17"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={offset}
          />
        )
      })}
    </svg>
  )
}

function GratitudeTargetMap({ userId }: { userId: string | null }) {
  const { t } = useLanguage()
  const [segments, setSegments] = useState<{ code: TargetCode; count: number; pct: number }[]>([])
  const [showInfoModal, setShowInfoModal] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('gratitude_entries')
        .select('target_1, target_2, target_3')
        .eq('user_id', userId)
        .eq('practice_type', 'gratitude')
      if (cancelled || !data) return

      const counts: Partial<Record<TargetCode, number>> = {}
      for (const row of data) {
        for (const val of [row.target_1, row.target_2, row.target_3]) {
          if (val) counts[val as TargetCode] = (counts[val as TargetCode] ?? 0) + 1
        }
      }
      const total = Object.values(counts).reduce((s, v) => s + v, 0)
      if (total > 0) {
        const segs = (Object.entries(counts) as [TargetCode, number][])
          .sort((a, b) => b[1] - a[1])
          .map(([code, count]) => ({ code, count, pct: count / total }))
        setSegments(segs)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  const topCode = segments[0]?.code ?? null
  const insight = topCode ? TARGET_INSIGHT[topCode] : null

  return (
    <>
      <div className="rounded-3xl bg-card p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
              Gratitude Map
            </p>
            <h2 className="text-lg font-extrabold text-foreground">{t('感恩對象地圖')}</h2>
          </div>
          <button
            onClick={() => setShowInfoModal(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-xs font-bold text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            ?
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <DonutChart segments={segments} />
          </div>
          <div className="flex flex-1 flex-col gap-2.5">
            {segments.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('完成更多感恩練習後，這裡會顯示你的感恩對象分佈。')}
              </p>
            ) : (
              segments.map(({ code, pct }) => {
                const meta = TARGET_META[code]
                return (
                  <div key={code} className="flex items-center gap-2.5">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: TARGET_COLORS[code] }}
                    />
                    <span className="flex-1 text-sm font-bold text-foreground">
                      {t(meta.label)}
                    </span>
                    <span className="text-sm font-extrabold text-foreground">
                      {Math.round(pct * 100)}%
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {insight && (
          <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            {t(insight)}
          </p>
        )}
      </div>

      {showInfoModal && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          onClick={() => setShowInfoModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-card p-6 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-extrabold text-foreground">{t('感恩對象的心理學意義')}</p>
              <button
                onClick={() => setShowInfoModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {(Object.entries(TARGET_INFO) as [TargetCode, { title: string; desc: string }][]).map(([, info]) => (
                <div key={info.title}>
                  <p className="text-xs font-extrabold text-foreground">{t(info.title)}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(info.desc)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── 健心紀錄日曆 ────────────────────────────────────────────────────────────

function GratitudeCalendar({
  initialEntries,
  userId,
}: {
  initialEntries: GratitudeEntry[]
  userId: string | null
}) {
  const { t } = useLanguage()
  const todayDate = new Date()
  const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`

  const [year, setYear] = useState(todayDate.getFullYear())
  const [month, setMonth] = useState(todayDate.getMonth()) // 0-indexed
  const [entries, setEntries] = useState<GratitudeEntry[]>(initialEntries)
  const [pgItems, setPgItems] = useState<PgItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [modalEntry, setModalEntry] = useState<GratitudeEntry | null>(null)
  const [pgModal, setPgModal] = useState<PgItem | null>(null)

  // 永遠用最新的 DB 資料覆蓋（避免 useState 鎖在第一次的 initialEntries）
  useEffect(() => {
    if (!userId) return

    let cancelled = false
    setLoading(true)

    const m = month + 1
    const startDate = `${year}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const endDate = `${year}-${String(m).padStart(2, '0')}-${lastDay}`

    supabase
      .from('gratitude_entries')
      .select('id, entry_date, item_1, item_2, item_3, ai_feedback')
      .eq('user_id', userId)
      .eq('practice_type', 'gratitude')
      .gte('entry_date', startDate)
      .lte('entry_date', endDate)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[calendar fetch]', error)
        }
        setEntries(data ?? [])
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [year, month, userId])

  // 過程目標覺察：抓本月的晚間回顧 / 早晨啟動紀錄，併入健心日記
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const m = month + 1
    const startDate = `${year}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const endDate = `${year}-${String(m).padStart(2, '0')}-${lastDay}`

    Promise.all([
      supabase
        .from('focus_logs')
        .select('log_date, log_kind, focus_description, insight, difficult_task, ai_feedback')
        .eq('user_id', userId)
        .gte('log_date', startDate)
        .lte('log_date', endDate),
      supabase
        .from('morning_logs')
        .select('log_date, today_task, ai_suggestion')
        .eq('user_id', userId)
        .gte('log_date', startDate)
        .lte('log_date', endDate),
    ]).then(([focusRes, morningRes]) => {
      if (cancelled) return
      const items: PgItem[] = [
        ...(focusRes.data ?? []).map((r): PgItem => {
          const log_date = String(r.log_date).slice(0, 10)
          return r.log_kind === 'boost'
            ? { kind: 'boost', log_date, difficult_task: r.difficult_task, ai_feedback: r.ai_feedback }
            : { kind: 'moment', log_date, focus_description: r.focus_description, insight: r.insight }
        }),
        ...(morningRes.data ?? []).map((r): PgItem => ({ kind: 'morning', ...r, log_date: String(r.log_date).slice(0, 10) })),
      ]
      setPgItems(items)
    })

    return () => { cancelled = true }
  }, [year, month, userId])

  // 當父層因 router.invalidate() 回傳新的 initialEntries 時，立即同步
  useEffect(() => {
    setEntries(initialEntries)
  }, [initialEntries])

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const entryMap = new Map(
    entries.map((e) => [String(e.entry_date).slice(0, 10), { ...e, entry_date: String(e.entry_date).slice(0, 10) }] as const)
  )
  const pgMap = new Map<string, PgItem[]>()
  for (const it of pgItems) {
    const list = pgMap.get(it.log_date) ?? []
    list.push(it)
    pgMap.set(it.log_date, list)
  }
  const hasAnyEntry = (ds: string) => entryMap.has(ds) || pgMap.has(ds)

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const dateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11) }
    else setMonth((m) => m - 1)
  }

  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0) }
    else setMonth((m) => m + 1)
  }

  const selectedEntry = selectedDate ? (entryMap.get(selectedDate) ?? null) : null
  const selectedPg = selectedDate ? (pgMap.get(selectedDate) ?? []) : []

  return (
    <>
      <div className="rounded-3xl bg-card p-5 shadow-soft">
        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
          Mental Training Log
        </p>
        <h2 className="mb-4 text-lg font-extrabold text-foreground">{t('我的健心日記')}</h2>

        {/* 月份導覽 */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={prevMonth}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground transition active:scale-95"
          >
            ‹
          </button>
          <span className="font-extrabold text-foreground">
            {t('{year} 年 {month}', { year, month: t(MONTH_NAMES[month]) })}
          </span>
          <button
            onClick={nextMonth}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground transition active:scale-95"
          >
            ›
          </button>
        </div>

        {/* 星期標題 */}
        <div className="mb-1 grid grid-cols-7 text-center">
          {WEEK_DAYS.map((d) => (
            <span key={d} className="py-1 text-[10px] font-bold text-muted-foreground">
              {t(d)}
            </span>
          ))}
        </div>

        {/* 日曆格子 */}
        <div className={`grid grid-cols-7 gap-y-1 transition-opacity ${loading ? 'opacity-40' : ''}`}>
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} />
            const ds = dateStr(day)
            const hasEntry = hasAnyEntry(ds)
            const isSelected = selectedDate === ds
            const isToday = ds === todayStr

            return (
              <button
                key={ds}
                onClick={() => setSelectedDate(isSelected ? null : ds)}
                className={`relative mx-auto flex w-9 flex-col items-center justify-center rounded-xl py-1.5 text-sm font-bold transition active:scale-95
                  ${isSelected
                    ? 'bg-primary text-primary-foreground'
                    : isToday
                    ? 'bg-primary-soft text-primary'
                    : 'text-foreground hover:bg-muted'
                  }`}
              >
                {day}
                {hasEntry && (
                  <span
                    className={`mt-0.5 h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-primary-foreground' : 'bg-primary'}`}
                  />
                )}
                {!hasEntry && <span className="mt-0.5 h-1.5 w-1.5" />}
              </button>
            )
          })}
        </div>

        {/* 選取日期詳情 */}
        {selectedDate && (
          <div className="mt-4 rounded-2xl bg-muted p-4">
            {selectedEntry || selectedPg.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="mb-1 text-xs font-bold text-muted-foreground">
                  {t('{date} 的練習紀錄', { date: selectedDate })}
                </p>
                {selectedEntry && (
                  <button
                    onClick={() => setModalEntry(selectedEntry)}
                    className="flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left shadow-soft transition active:scale-[0.98]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tile-mint">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#3f6b46]" />
                    </span>
                    <span className="flex-1 text-sm font-bold text-foreground">{t('感恩日記')}</span>
                    <span className="text-xs font-extrabold text-primary">✓ {t('已完成')}</span>
                  </button>
                )}
                {selectedPg.map((it, i) => (
                  <button
                    key={i}
                    onClick={() => setPgModal(it)}
                    className="flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left shadow-soft transition active:scale-[0.98]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tile-blue">
                      <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                    </span>
                    <span className="flex-1 text-sm font-bold text-foreground">
                      {t('過程目標覺察')} · {t(PG_KIND_META[it.kind].label)}
                    </span>
                    <span className="text-xs font-extrabold text-primary">✓ {t('已完成')}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-1 text-center text-sm text-muted-foreground">
                {t('這天還沒有紀錄')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 感恩日記 Modal */}
      {modalEntry && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/30 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] backdrop-blur-sm"
          onClick={() => setModalEntry(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-card p-6 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
                  Gratitude journal
                </p>
                <h3 className="text-lg font-extrabold text-foreground">{t('感恩日記')}</h3>
                <p className="text-xs text-muted-foreground">{modalEntry.entry_date}</p>
              </div>
              <button
                onClick={() => setModalEntry(null)}
                className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition active:scale-95"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {[modalEntry.item_1, modalEntry.item_2, modalEntry.item_3].map((item, i) => (
                <div key={i} className="flex gap-3 rounded-2xl bg-tile-mint p-4">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-card text-xs font-extrabold text-primary">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-foreground">{item}</p>
                </div>
              ))}
            </div>
            {modalEntry.ai_feedback && (
              <div className="mt-3 rounded-2xl bg-primary-soft p-4">
                <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary">
                  BOUBA {t('回饋')}
                </p>
                <p className="text-sm leading-relaxed text-foreground">{modalEntry.ai_feedback}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 過程目標覺察 Modal */}
      {pgModal && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/30 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] backdrop-blur-sm"
          onClick={() => setPgModal(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-card p-6 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
                  Process Goal Awareness
                </p>
                <h3 className="text-lg font-extrabold text-foreground">
                  {t('過程目標覺察')} · {t(PG_KIND_META[pgModal.kind].label)}
                </h3>
                <p className="text-xs text-muted-foreground">{pgModal.log_date}</p>
              </div>
              <button
                onClick={() => setPgModal(null)}
                className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition active:scale-95"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {pgModal.kind === 'morning' && (
                <>
                  {pgModal.today_task && (
                    <div className="rounded-2xl bg-tile-blue p-4">
                      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-foreground/60">{t('今天要做的事')}</p>
                      <p className="text-sm leading-relaxed text-foreground">{pgModal.today_task}</p>
                    </div>
                  )}
                  {pgModal.ai_suggestion && (
                    <div className="rounded-2xl p-4" style={{ backgroundColor: '#EEEDFE', color: '#26215C' }}>
                      <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em]">{t('啟動建議')}</p>
                      <p className="text-sm leading-relaxed">{pgModal.ai_suggestion}</p>
                    </div>
                  )}
                </>
              )}
              {pgModal.kind === 'moment' && (
                <>
                  {pgModal.focus_description && (
                    <div className="rounded-2xl bg-tile-blue p-4">
                      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-foreground/60">{t('專注時刻')}</p>
                      <p className="text-sm leading-relaxed text-foreground">{pgModal.focus_description}</p>
                    </div>
                  )}
                  {pgModal.insight && (
                    <div className="rounded-2xl p-4" style={{ backgroundColor: '#EEEDFE', color: '#26215C' }}>
                      <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em]">{t('AI 洞察')}</p>
                      <p className="text-sm leading-relaxed">{pgModal.insight}</p>
                    </div>
                  )}
                </>
              )}
              {pgModal.kind === 'boost' && (
                <>
                  {pgModal.difficult_task && (
                    <div className="rounded-2xl bg-muted p-4">
                      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-foreground/60">{t('卡關的事')}</p>
                      <p className="text-sm leading-relaxed text-foreground">{pgModal.difficult_task}</p>
                    </div>
                  )}
                  {pgModal.ai_feedback && (
                    <div className="rounded-2xl p-4" style={{ backgroundColor: '#EEEDFE', color: '#26215C' }}>
                      <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em]">{t('專注錦囊')}</p>
                      <p className="text-sm leading-relaxed">{pgModal.ai_feedback}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── 主頁面 ────────────────────────────────────────────────────────────────

function formatPracticeTime(
  totalMinutes: number,
  t: (text: string, vars?: Record<string, string | number>) => string,
): { value: string; unit: string } {
  if (totalMinutes < 60) return { value: String(totalMinutes), unit: t('分鐘') }
  const hours = totalMinutes / 60
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
  return { value: text, unit: t('小時') }
}


function AvatarPicker({
  current,
  onSelect,
  onClose,
}: {
  current: string | null
  onSelect: (code: AvatarCode) => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="animate-slide-up w-full max-w-md rounded-t-3xl bg-card px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-6 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm font-extrabold text-foreground">{t('選擇你的頭像')}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {AVATAR_OPTIONS.map((opt) => {
            const active =
              current === opt.code ||
              (!AVATAR_OPTIONS.some((a) => a.code === current) && opt.code === 'avatar-1')
            return (
              <button
                key={opt.code}
                onClick={() => onSelect(opt.code)}
                className={`flex flex-col items-center gap-2 rounded-2xl py-4 transition active:scale-95 ${
                  active ? 'bg-muted ring-2 ring-primary ring-offset-2' : 'hover:bg-muted'
                }`}
              >
                <img
                  src={opt.src}
                  alt={t(opt.label)}
                  className="h-20 w-20 rounded-full object-cover shadow-soft"
                />
                <span className="text-xs font-bold text-foreground">{t(opt.label)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── 我的健心夥伴：PERMA 成長盆栽 ────────────────────────────────────────────
// 五個 PERMA 維度各是一株植物，分數越高長得越成熟（嫩芽→花苞→花→向日葵），
// 分數標在植物上方；下方盆器標示 P/E/R/M/A 五色與中文。對齊新版手繪設計。
const PLANTER_DIMS = [
  { key: 'p_score' as const, letter: 'P', label: '情緒', color: '#D18197' },
  { key: 'e_score' as const, letter: 'E', label: '投入', color: '#e0a93f' },
  { key: 'r_score' as const, letter: 'R', label: '連結', color: '#88B8CE' },
  { key: 'm_score' as const, letter: 'M', label: '意義', color: '#71744F' },
  { key: 'a_score' as const, letter: 'A', label: '成就', color: '#c98a52' },
]

function planterLeaf(x: number, y: number, rot: number, s: number, fill = '#7BA86E') {
  return <ellipse cx={x} cy={y} rx={6 * s} ry={11 * s} fill={fill} transform={`rotate(${rot} ${x} ${y})`} />
}

function PlantColumn({ x, score, hasScore }: { x: number; score: number; hasScore: boolean }) {
  const rimY = 176
  const h = 22 + (Math.max(0, Math.min(5, score)) / 5) * 112
  const topY = rimY - h
  const midY = (rimY + topY) / 2
  const sway = 5

  let top: JSX.Element
  let labelOffset = 14
  if (score < 1.5) {
    top = <g>{planterLeaf(x - 3, topY + 2, -38, 0.62)}{planterLeaf(x + 3, topY + 2, 38, 0.62)}</g>
    labelOffset = 12
  } else if (score < 2.8) {
    top = <g>{planterLeaf(x - 4, topY + 1, -46, 0.95)}{planterLeaf(x + 4, topY + 1, 46, 0.95)}</g>
  } else if (score < 3.8) {
    top = (
      <g>
        <path
          d={`M ${x} ${topY - 17} C ${x - 7} ${topY - 17} ${x - 7} ${topY + 1} ${x} ${topY + 1} C ${x + 7} ${topY + 1} ${x + 7} ${topY - 17} ${x} ${topY - 17} Z`}
          fill="#ecc873"
          stroke="#d8ac4a"
          strokeWidth="1"
        />
        {planterLeaf(x - 3, topY + 2, -28, 0.5, '#6f9a5c')}
        {planterLeaf(x + 3, topY + 2, 28, 0.5, '#6f9a5c')}
      </g>
    )
    labelOffset = 22
  } else if (score < 4.5) {
    top = (
      <g>
        {[0, 72, 144, 216, 288].map((a) => {
          const r = ((a - 90) * Math.PI) / 180
          const px = x + Math.cos(r) * 10
          const py = topY - 1 + Math.sin(r) * 10
          return <ellipse key={a} cx={px} cy={py} rx={6} ry={9} fill="#F1C166" transform={`rotate(${a} ${px} ${py})`} />
        })}
        <circle cx={x} cy={topY - 1} r={6} fill="#c98a52" />
      </g>
    )
    labelOffset = 22
  } else {
    top = (
      <g>
        {Array.from({ length: 11 }).map((_, k) => {
          const a = k * (360 / 11)
          const r = ((a - 90) * Math.PI) / 180
          const px = x + Math.cos(r) * 13
          const py = topY - 1 + Math.sin(r) * 13
          return <ellipse key={k} cx={px} cy={py} rx={6} ry={11} fill="#F1C166" transform={`rotate(${a} ${px} ${py})`} />
        })}
        <circle cx={x} cy={topY - 1} r={9} fill="#c07a3e" />
        <circle cx={x - 3} cy={topY - 2} r={1.1} fill="#fff" />
        <circle cx={x + 3} cy={topY - 2} r={1.1} fill="#fff" />
        <path d={`M ${x - 3} ${topY + 1} Q ${x} ${topY + 3.5} ${x + 3} ${topY + 1}`} stroke="#fff" strokeWidth="1" fill="none" strokeLinecap="round" />
      </g>
    )
    labelOffset = 26
  }

  return (
    <g>
      <path d={`M ${x} ${rimY} Q ${x + sway} ${midY} ${x} ${topY}`} stroke="#7BA86E" strokeWidth="4" fill="none" strokeLinecap="round" />
      {score >= 2.4 && (
        <g>
          {planterLeaf(x - 9, midY, -55, 0.8)}
          {planterLeaf(x + 9, midY + 6, 55, 0.8)}
        </g>
      )}
      {top}
      {hasScore && (
        <text x={x} y={topY - labelOffset} textAnchor="middle" fontSize="15" fontWeight="800" fill="#7a4a2a">
          {score.toFixed(1)}
        </text>
      )}
    </g>
  )
}

function PartnerPlanter({ scores }: { scores: PermaScores | null }) {
  const { t } = useLanguage()
  const hasScore = !!scores
  const xs = [36, 74, 112, 150, 188]
  return (
    <div className="relative mt-2.5 overflow-hidden rounded-[22px] bg-cream">
      <svg viewBox="0 0 360 258" className="relative z-[1] w-full">
        {/* 草叢 */}
        <g fill="#9aa86a" opacity="0.9">
          <path d="M6 250 q3 -22 6 0 z M14 250 q3 -28 7 0 z M24 250 q3 -18 6 0 z" />
          <path d="M330 250 q3 -24 6 0 z M340 250 q3 -30 7 0 z M351 250 q2 -16 5 0 z" />
        </g>
        {/* 植物 */}
        {PLANTER_DIMS.map((d, i) => (
          <PlantColumn key={d.key} x={xs[i]} score={scores ? Math.max(0, scores[d.key]) : 0.6} hasScore={hasScore} />
        ))}
        {/* 盆器 */}
        <path d="M20 178 L340 178 L322 236 Q322 242 316 242 L44 242 Q38 242 38 236 Z" fill="#7a5640" />
        <rect x="14" y="170" width="332" height="16" rx="8" fill="#8a6a4a" />
        {/* P/E/R/M/A 五色圓 + 中文 */}
        {PLANTER_DIMS.map((d, i) => (
          <g key={d.key}>
            <circle cx={xs[i]} cy={203} r={14} fill={d.color} />
            <text x={xs[i]} y={203} textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="900" fill="#fff" fontFamily="Inter, sans-serif">
              {d.letter}
            </text>
            <text x={xs[i]} y={253} textAnchor="middle" fontSize="12" fontWeight="800" fill="#542916">
              {t(d.label)}
            </text>
          </g>
        ))}
      </svg>
      {/* 玩耍吉祥物 — 大尺寸，坐在盆器右側抱膝 */}
      <img
        src={playingMascot}
        alt=""
        className="pointer-events-none absolute bottom-[14px] right-0 z-[2] w-[152px] select-none"
      />
    </div>
  )
}

function ProfilePage() {
  const { name, avatar: initialAvatar, scores, userId, initialEntries, streak, monthlyCount, totalCount } = Route.useLoaderData()
  const router = useRouter()
  const { t } = useLanguage()
  const [avatar, setAvatar] = useState<string | null>(initialAvatar ?? null)
  const [showPicker, setShowPicker] = useState(false)
  const [nameValue, setNameValue] = useState<string>(name ?? '')
  const [editingName, setEditingName] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const totalMinutes = totalCount * 5
  const practiceTime = formatPracticeTime(totalMinutes, t)

  // lazy 檢查是否有新的回顧報告可生成（每人每天最多一次，見 reviews.ts）。
  useEffect(() => {
    if (userId) void checkAndGenerateReviews(userId)
  }, [userId])

  const handleSaveName = async () => {
    const trimmed = nameValue.trim()
    if (!trimmed || !userId) { setEditingName(false); return }
    setSavingName(true)
    const [{ error }] = await Promise.all([
      supabase.from('profiles').upsert({ id: userId, name: trimmed }, { onConflict: 'id' }),
      supabase
        .from('gratitude_entries')
        .update({ anon_name: trimmed })
        .eq('user_id', userId)
        .eq('use_real_name', true),
    ])
    if (error) console.error('[name save]', error)
    setNameValue(trimmed)
    setSavingName(false)
    setEditingName(false)
    // 重跑 loader，讓新名字立即同步到本頁與社群等其他畫面
    void router.invalidate()
  }

  const persistAvatar = async (value: string) => {
    setAvatar(value)
    setShowPicker(false)
    if (userId) {
      const [{ error }] = await Promise.all([
        supabase.from('profiles').upsert({ id: userId, avatar: value }, { onConflict: 'id' }),
        supabase
          .from('gratitude_entries')
          .update({ avatar: value })
          .eq('user_id', userId),
      ])
      if (error) console.error('[avatar save]', error)
    }
  }

  const handleSelectAvatar = (code: AvatarCode) => persistAvatar(code)

  const isPhoto = isPhotoAvatar(avatar)
  const avatarSrc = isPhoto && avatar ? avatar : avatarSrcByCode(avatar)

  return (
    <>
      <div className="animate-fade-up mx-auto max-w-md pb-4">
        <Header />

        <div className="flex flex-col gap-4 px-5 pt-5">
        {/* 名字卡 */}
        <div className="flex items-center gap-4 rounded-3xl bg-card p-5 shadow-soft">
          <button
            onClick={() => setShowPicker(true)}
            className="relative shrink-0 transition active:scale-95"
            aria-label={t('更換頭像')}
          >
            <img
              src={avatarSrc}
              alt={t('使用者頭像')}
              className="h-[72px] w-[72px] rounded-[20px] border-[3px] border-[#542916] object-cover"
            />
            <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#542916] bg-cream shadow">
              <EditPencilIcon className="h-3 w-3" />
            </span>
          </button>
          <div className="flex-1">
            <p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
              Name
            </p>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSaveName()
                    if (e.key === 'Escape') setEditingName(false)
                  }}
                  className="flex-1 rounded-xl border border-primary bg-muted px-3 py-1.5 text-base font-extrabold text-foreground outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={() => void handleSaveName()}
                  disabled={savingName}
                  className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-extrabold text-primary-foreground transition active:scale-95 disabled:opacity-60"
                >
                  {savingName ? '…' : t('儲存')}
                </button>
                <button
                  onClick={() => { setNameValue(name ?? ''); setEditingName(false) }}
                  className="shrink-0 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-lg font-extrabold text-foreground">{nameValue || t('未設定名稱')}</p>
                <button
                  onClick={() => setEditingName(true)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-foreground transition hover:bg-primary hover:text-primary-foreground active:scale-95"
                  aria-label={t('編輯名稱')}
                >
                  <EditPencilIcon className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 三個統計數字框 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center rounded-3xl bg-card p-4 shadow-soft">
            <span className="mb-1 text-foreground"><FlameIcon /></span>
            <span className="text-2xl font-extrabold text-foreground">{streak}<span className="text-base font-bold">{t('天')}</span></span>
            <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">{t('連續打卡')}</span>
          </div>
          <div className="flex flex-col items-center rounded-3xl bg-card p-4 shadow-soft">
            <span className="mb-1 text-foreground"><CalendarIcon /></span>
            <span className="text-2xl font-extrabold text-foreground">{monthlyCount}<span className="text-base font-bold">{t('次')}</span></span>
            <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">{t('本月完成')}</span>
          </div>
          <div className="flex flex-col items-center rounded-3xl bg-card p-4 shadow-soft">
            <span className="mb-1 text-foreground"><StopwatchIcon /></span>
            <span className="text-2xl font-extrabold text-foreground">{practiceTime.value}<span className="text-base font-bold">{practiceTime.unit}</span></span>
            <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">{t('總練習時間')}</span>
          </div>
        </div>

        {/* 我的健心夥伴（盆栽 + 吉祥物 + PERMA 種子） */}
        <div>
          <SectionLabel zh={t('我的健心夥伴')} en="Mental Training Partner" />
          <PartnerPlanter scores={scores} />
        </div>

        {/* 健心紀錄日曆 */}
        <GratitudeCalendar initialEntries={initialEntries} userId={userId} />

        {/* PERMA 雷達圖 + 分數 */}
        {scores ? (
          <div className="rounded-3xl bg-card p-5 shadow-soft">
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
              Mental Muscle Radar
            </p>
            <h2 className="mb-0.5 text-lg font-extrabold text-foreground">{t('心理肌肉雷達圖')}</h2>
            <p className="mb-1 text-sm text-muted-foreground">{t('看看哪一塊還可以再練')}</p>
            <PermaRadar scores={scores} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-12 text-muted-foreground shadow-soft">
            <p className="text-sm font-medium">{t('尚未完成 PERMA 評估')}</p>
          </div>
        )}

        {/* 觀看最近一次測驗結果 / 重新評估（並排） */}
        <div className="flex gap-3">
          {scores && (
            <Link
              to="/onboarding"
              search={{ showResult: true }}
              className="flex flex-1 items-center justify-center rounded-2xl border-2 border-primary bg-transparent px-3 py-3.5 text-center text-sm font-extrabold leading-snug tracking-wide text-foreground shadow-soft transition active:scale-[0.98]"
            >
              {t('觀看最近一次')}<br />{t('測驗結果')}
            </Link>
          )}
          <Link
            to="/onboarding"
            search={{ reassess: true }}
            className="flex flex-1 items-center justify-center rounded-2xl bg-primary px-3 py-3.5 text-center text-sm font-extrabold tracking-wide text-foreground shadow-soft transition active:scale-[0.98]"
          >
            {t('重新評估')}
          </Link>
        </div>

        {/* 回顧集：≥2 筆回顧報告才顯現 */}
        {userId && <ReviewsSection userId={userId} />}

        {/* 感恩對象地圖 */}
        <GratitudeTargetMap userId={userId} />
        </div>
      </div>

      {/* 選頭像 bottom sheet — rendered outside animate-fade-up to avoid fixed-position offset */}
      {showPicker && (
        <AvatarPicker
          current={avatar}
          onSelect={handleSelectAvatar}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  )
}
