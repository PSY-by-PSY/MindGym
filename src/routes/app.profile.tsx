import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import petCat from '../assets/pet-cat.png'

type TargetCode = 'others' | 'self' | 'environment' | 'experience' | 'custom'

const TARGET_META: Record<TargetCode, { emoji: string; label: string }> = {
  others:      { emoji: '👥', label: '身邊他人' },
  self:        { emoji: '🙋', label: '自己' },
  environment: { emoji: '🌳', label: '環境' },
  experience:  { emoji: '✨', label: '體驗' },
  custom:      { emoji: '🏷️', label: '自訂' },
}

const TARGET_COLORS: Record<TargetCode, string> = {
  others:      '#6BAED6',
  self:        '#FD8D3C',
  environment: '#74C476',
  experience:  '#9E9AC8',
  custom:      '#BDBDBD',
}

const TARGET_INSIGHT: Record<TargetCode, string> = {
  others:      '你的幸福感有很大一部分來自身邊的人，珍惜這些連結吧。',
  self:        '你非常懂得欣賞自己的努力與成長，這是很珍貴的自我覺察。',
  environment: '你對生活中的細微美好特別敏感，這份覺察讓你隨時都能找到禮物。',
  experience:  '你善於從日常的小體驗中找到喜悅，生活對你來說充滿驚喜。',
  custom:      '你的感恩來自各種面向，這份多元的覺察豐富了你的內在世界。',
}

const TARGET_INFO: Record<TargetCode, { title: string; desc: string }> = {
  others:      { title: '👥 身邊他人', desc: '感謝身邊的人能強化社會連結感（Relatedness），是 PERMA 中「R」的核心。研究顯示，表達感謝能同時提升給予者與接受者的幸福感。' },
  self:        { title: '🙋 自己', desc: '對自己的努力心存感謝，能培養自我同情（Self-Compassion）與成長型思維（Growth Mindset），減少自我批評，增加心理韌性。' },
  environment: { title: '🌳 環境', desc: '對自然與空間的感謝能喚起「敬畏感」（Awe），研究發現敬畏感能降低壓力荷爾蒙，並擴展我們對世界的視野。' },
  experience:  { title: '✨ 體驗', desc: '感謝日常體驗能強化「正向情緒記憶」，讓大腦更容易在未來注意到美好的事物，形成正向情緒的上升螺旋。' },
  custom:      { title: '🏷️ 自訂', desc: '多元的感恩來源代表你的覺察力不受限制，能從生活的各個角落汲取力量。' },
}

type AvatarCode = 'star' | 'blossom' | 'leaf' | 'sun' | 'butterfly' | 'wave'

const AVATAR_OPTIONS: { code: AvatarCode; emoji: string; tile: string; label: string }[] = [
  { code: 'star',      emoji: '🌟', tile: 'bg-tile-peach', label: '星光' },
  { code: 'blossom',   emoji: '🌸', tile: 'bg-tile-pink',  label: '花朵' },
  { code: 'leaf',      emoji: '🌿', tile: 'bg-tile-mint',  label: '綠意' },
  { code: 'sun',       emoji: '☀️', tile: 'bg-tile-blue',  label: '陽光' },
  { code: 'butterfly', emoji: '🦋', tile: 'bg-tile-pink',  label: '蝴蝶' },
  { code: 'wave',      emoji: '🌊', tile: 'bg-tile-blue',  label: '海浪' },
]

function isPhotoAvatar(code: string | null): boolean {
  return !!code && (code.startsWith('data:image') || code.startsWith('http'))
}

function avatarByCode(code: string | null): { emoji: string; tile: string } {
  return AVATAR_OPTIONS.find((a) => a.code === code) ?? { emoji: '🌟', tile: 'bg-tile-peach' }
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

export const Route = createFileRoute('/app/profile')({
  loader: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user.id
    if (!userId) return { name: null, avatar: null, scores: null, previousScores: null, userId: null, initialEntries: [], streak: 0, monthlyCount: 0, totalCount: 0 }

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

    const [profileRes, permaRes, entriesRes, allDatesRes] = await Promise.all([
      supabase.from('profiles').select('name, avatar').eq('id', userId).maybeSingle(),
      supabase
        .from('perma_scores')
        .select('p_score, e_score, r_score, m_score, a_score, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(2),
      supabase
        .from('gratitude_entries')
        .select('id, entry_date, item_1, item_2, item_3, ai_feedback')
        .eq('user_id', userId)
        .gte('entry_date', startOfMonth)
        .lte('entry_date', endOfMonth),
      supabase
        .from('gratitude_entries')
        .select('entry_date')
        .eq('user_id', userId)
        .order('entry_date', { ascending: false }),
    ])

    const toDS = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const allDates = allDatesRes.data ?? []
    const entryDateSet = new Set(allDates.map((e) => String(e.entry_date).slice(0, 10)))

    let streak = 0
    const checkDate = new Date(today)
    if (!entryDateSet.has(toDS(checkDate))) {
      checkDate.setDate(checkDate.getDate() - 1)
    }
    while (entryDateSet.has(toDS(checkDate))) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    }

    const monthlyCount = (entriesRes.data ?? []).length
    const totalCount = allDates.length

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
      previousScores: (permaRows[1] ?? null) as (PermaScores & { created_at?: string }) | null,
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

function PermaRadar({ scores }: { scores: PermaScores }) {
  const cx = 130
  const cy = 122
  const maxR = 76
  const n = PERMA_DIMENSIONS.length
  const angle = (i: number) => ((-90 + (i * 360) / n) * Math.PI) / 180
  const point = (i: number, r: number): [number, number] => [
    cx + Math.cos(angle(i)) * r,
    cy + Math.sin(angle(i)) * r,
  ]
  const poly = (r: number) =>
    PERMA_DIMENSIONS.map((_, i) => point(i, r).join(',')).join(' ')

  const dataPts = PERMA_DIMENSIONS.map((d, i) => point(i, (scores[d.key] / 5) * maxR))
  const dataPoly = dataPts.map((p) => p.join(',')).join(' ')

  return (
    <svg viewBox="0 0 260 250" className="w-full">
      {[1, 2, 3, 4, 5].map((level) => (
        <polygon
          key={level}
          points={poly((level / 5) * maxR)}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1.5"
        />
      ))}
      {PERMA_DIMENSIONS.map((_, i) => {
        const [x, y] = point(i, maxR)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="1.5" />
      })}
      <polygon points={dataPoly} fill="var(--primary)" fillOpacity="0.25" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" />
      {dataPts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4.5" fill="var(--primary)" stroke="var(--card)" strokeWidth="2" />
      ))}
      {PERMA_DIMENSIONS.map((d, i) => {
        const [x, y] = point(i, maxR + 22)
        return (
          <text
            key={d.key}
            x={x}
            y={y - 6}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="12"
            fontWeight="800"
            fill="var(--muted-foreground)"
          >
            {d.letter} {d.short}
          </text>
        )
      })}
      {PERMA_DIMENSIONS.map((d, i) => {
        const [x, y] = point(i, maxR + 22)
        return (
          <text
            key={`${d.key}-score`}
            x={x}
            y={y + 8}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="11"
            fontWeight="800"
            fill="var(--primary)"
          >
            {scores[d.key]}/5
          </text>
        )
      })}
    </svg>
  )
}

function ScoreBar({ score, tile }: { score: number; tile: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-2.5 flex-1 rounded-full transition-all ${i <= score ? tile : 'bg-muted'}`}
          />
        ))}
      </div>
      <span className="w-9 text-right text-sm font-extrabold text-foreground">{score}/5</span>
    </div>
  )
}

function Header() {
  return (
    <div className="relative min-h-44">
      <div className="absolute inset-x-0 top-0 h-44 rounded-b-[40%] bg-gradient-soft" />
      <div className="relative px-6 pt-10 md:px-10">
        <p className="font-handwriting text-2xl text-muted-foreground">我的健心檔案</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight text-foreground md:text-3xl">
          本週進度，小改變促進大改變
        </h1>
      </div>
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
  const r = 38
  const cx = 50
  const cy = 50
  const circumference = 2 * Math.PI * r

  if (segments.length === 0) {
    return (
      <svg viewBox="0 0 100 100" className="h-32 w-32">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="16" />
      </svg>
    )
  }

  let cumulative = 0
  return (
    <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
      {segments.map(({ code, pct }) => {
        const dash = Math.max(0, pct * circumference - 2)
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
            strokeWidth="16"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={offset}
          />
        )
      })}
    </svg>
  )
}

function GratitudeTargetMap({ userId }: { userId: string | null }) {
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
            <h2 className="text-lg font-extrabold text-foreground">感恩對象地圖</h2>
          </div>
          <button
            onClick={() => setShowInfoModal(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-xs font-bold text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            ?
          </button>
        </div>

        <div className="flex items-center gap-5">
          <DonutChart segments={segments} />
          <div className="flex flex-1 flex-col gap-2">
            {segments.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                完成更多感恩練習後，這裡會顯示你的感恩對象分佈。
              </p>
            ) : (
              segments.map(({ code, pct }) => {
                const meta = TARGET_META[code]
                return (
                  <div key={code} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: TARGET_COLORS[code] }}
                    />
                    <span className="flex-1 text-xs text-foreground/80">
                      {meta.emoji} {meta.label}
                    </span>
                    <span className="text-xs font-bold text-foreground">
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
            {insight}
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
              <p className="text-sm font-extrabold text-foreground">感恩對象的心理學意義</p>
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
                  <p className="text-xs font-extrabold text-foreground">{info.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{info.desc}</p>
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
  const todayDate = new Date()
  const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`

  const [year, setYear] = useState(todayDate.getFullYear())
  const [month, setMonth] = useState(todayDate.getMonth()) // 0-indexed
  const [entries, setEntries] = useState<GratitudeEntry[]>(initialEntries)
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [modalEntry, setModalEntry] = useState<GratitudeEntry | null>(null)

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

  // 當父層因 router.invalidate() 回傳新的 initialEntries 時，立即同步
  useEffect(() => {
    setEntries(initialEntries)
  }, [initialEntries])

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const entryMap = new Map(
    entries.map((e) => [String(e.entry_date).slice(0, 10), { ...e, entry_date: String(e.entry_date).slice(0, 10) }] as const)
  )

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

  return (
    <>
      <div className="rounded-3xl bg-card p-5 shadow-soft">
        <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
          Mental Training Log
        </p>
        <h2 className="mb-4 text-lg font-extrabold text-foreground">我的健心日記</h2>

        {/* 月份導覽 */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={prevMonth}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground transition active:scale-95"
          >
            ‹
          </button>
          <span className="font-extrabold text-foreground">
            {year} 年 {MONTH_NAMES[month]}
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
              {d}
            </span>
          ))}
        </div>

        {/* 日曆格子 */}
        <div className={`grid grid-cols-7 gap-y-1 transition-opacity ${loading ? 'opacity-40' : ''}`}>
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} />
            const ds = dateStr(day)
            const hasEntry = entryMap.has(ds)
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
            {selectedEntry ? (
              <>
                <p className="mb-2 text-xs font-bold text-muted-foreground">
                  {selectedDate} 的練習紀錄
                </p>
                <button
                  onClick={() => setModalEntry(selectedEntry)}
                  className="flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left shadow-soft transition active:scale-[0.98]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tile-mint text-base">
                    📔
                  </span>
                  <span className="flex-1 text-sm font-bold text-foreground">感恩日記</span>
                  <span className="text-xs font-extrabold text-primary">✓ 已完成</span>
                </button>
              </>
            ) : (
              <p className="py-1 text-center text-sm text-muted-foreground">
                這天還沒有紀錄
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
                <h3 className="text-lg font-extrabold text-foreground">感恩日記</h3>
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
                  安安回饋
                </p>
                <p className="text-sm leading-relaxed text-foreground">{modalEntry.ai_feedback}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── 主頁面 ────────────────────────────────────────────────────────────────

function formatPracticeTime(totalMinutes: number): { value: string; unit: string } {
  if (totalMinutes < 60) return { value: String(totalMinutes), unit: '分鐘' }
  const hours = totalMinutes / 60
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
  return { value: text, unit: '小時' }
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
          <p className="text-sm font-extrabold text-foreground">選擇你的頭像</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {AVATAR_OPTIONS.map((opt) => (
            <button
              key={opt.code}
              onClick={() => onSelect(opt.code)}
              className={`flex flex-col items-center gap-2 rounded-2xl py-4 transition active:scale-95 ${
                current === opt.code
                  ? 'ring-2 ring-primary ring-offset-2'
                  : 'hover:bg-muted'
              }`}
            >
              <span className={`flex h-14 w-14 items-center justify-center rounded-full text-3xl ${opt.tile}`}>
                {opt.emoji}
              </span>
              <span className="text-xs font-bold text-foreground">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ProfilePage() {
  const { name, avatar: initialAvatar, scores, previousScores, userId, initialEntries, streak, monthlyCount, totalCount } = Route.useLoaderData()
  const [avatar, setAvatar] = useState<string | null>(initialAvatar ?? null)
  const [showPicker, setShowPicker] = useState(false)
  const [showPrevious, setShowPrevious] = useState(false)
  const [nameValue, setNameValue] = useState<string>(name ?? '')
  const [editingName, setEditingName] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const totalMinutes = totalCount * 5
  const practiceTime = formatPracticeTime(totalMinutes)

  const handleSaveName = async () => {
    const trimmed = nameValue.trim()
    if (!trimmed || !userId) { setEditingName(false); return }
    setSavingName(true)
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, name: trimmed }, { onConflict: 'id' })
    if (error) console.error('[name save]', error)
    setNameValue(trimmed)
    setSavingName(false)
    setEditingName(false)
  }

  const persistAvatar = async (value: string) => {
    setAvatar(value)
    setShowPicker(false)
    if (userId) {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: userId, avatar: value }, { onConflict: 'id' })
      if (error) console.error('[avatar save]', error)
    }
  }

  const handleSelectAvatar = (code: AvatarCode) => persistAvatar(code)

  const avatarDisplay = avatarByCode(avatar)
  const isPhoto = isPhotoAvatar(avatar)

  return (
    <>
      <div className="animate-fade-up mx-auto max-w-3xl pb-4">
        <Header />

        <div className="flex flex-col gap-4 px-6 pt-5 md:px-10">
        {/* 名字卡 */}
        <div className="flex items-center gap-4 rounded-3xl bg-card p-5 shadow-soft">
          <button
            onClick={() => setShowPicker(true)}
            className="relative shrink-0 transition active:scale-95"
            aria-label="更換頭像"
          >
            {isPhoto && avatar ? (
              <img
                src={avatar}
                alt="使用者頭像"
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl ${avatarDisplay.tile}`}>
                {avatarDisplay.emoji}
              </div>
            )}
            <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground shadow">
              ✏️
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
                  {savingName ? '…' : '儲存'}
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
                <p className="text-lg font-extrabold text-foreground">{nameValue || '未設定名稱'}</p>
                <button
                  onClick={() => setEditingName(true)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground transition hover:bg-primary hover:text-primary-foreground active:scale-95"
                  aria-label="編輯名稱"
                >
                  ✏️
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 三個統計數字框 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center rounded-3xl bg-card p-4 shadow-soft">
            <span className="mb-1 text-xl text-primary">🔥</span>
            <span className="text-2xl font-extrabold text-foreground">{streak}<span className="text-base font-bold">天</span></span>
            <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">連續打卡</span>
          </div>
          <div className="flex flex-col items-center rounded-3xl bg-card p-4 shadow-soft">
            <span className="mb-1 text-xl text-primary">📅</span>
            <span className="text-2xl font-extrabold text-foreground">{monthlyCount}<span className="text-base font-bold">次</span></span>
            <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">本月完成</span>
          </div>
          <div className="flex flex-col items-center rounded-3xl bg-card p-4 shadow-soft">
            <span className="mb-1 text-xl text-primary">⏱️</span>
            <span className="text-2xl font-extrabold text-foreground">{practiceTime.value}<span className="text-base font-bold">{practiceTime.unit}</span></span>
            <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">總練習時間</span>
          </div>
        </div>

        {/* 夥伴小卡（裝飾） */}
        <div className="flex items-center gap-4 rounded-3xl bg-tile-blue p-5 shadow-soft">
          <img src={petCat} alt="夥伴貓" className="h-20 w-20 animate-float" />
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
              Mental Training Partner
            </p>
            <p className="mt-1 font-extrabold text-foreground">我的健心夥伴</p>
            <p className="mt-0.5 text-sm text-muted-foreground">「今天也跟著你一起變強了！」</p>
          </div>
        </div>

        {/* PERMA 雷達圖 + 分數 */}
        {scores ? (
          <div className="rounded-3xl bg-card p-5 shadow-soft">
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
              Mental Muscle Radar
            </p>
            <h2 className="mb-0.5 text-lg font-extrabold text-foreground">心理肌肉雷達圖</h2>
            <p className="mb-2 text-sm text-muted-foreground">看看哪一塊還可以再練</p>
            <PermaRadar scores={scores} />
            <div className="mt-4 flex flex-col gap-4">
              {PERMA_DIMENSIONS.map(({ key, letter, label, tile }) => (
                <div key={key}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                      {letter}
                    </span>
                    <span className="text-sm font-bold text-foreground">{label}</span>
                  </div>
                  <ScoreBar score={scores[key]} tile={tile} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-12 text-muted-foreground shadow-soft">
            <span className="mb-2 text-3xl">📋</span>
            <p className="text-sm font-medium">尚未完成 PERMA 評估</p>
          </div>
        )}

        {/* 觀看最近一次測驗結果 */}
        {scores && (
          <Link
            to="/onboarding"
            search={{ showResult: true }}
            className="flex w-full items-center justify-center rounded-full bg-primary-soft py-4 text-sm font-extrabold tracking-wide text-primary transition active:scale-[0.98]"
          >
            觀看最近一次測驗結果
          </Link>
        )}


        {/* 重新評估 */}
        <Link
          to="/onboarding"
          search={{ reassess: true }}
          className="flex w-full items-center justify-center rounded-full border-2 border-primary-soft bg-card py-4 text-sm font-extrabold tracking-wide text-primary transition active:scale-[0.98]"
        >
          重新評估
        </Link>

        {/* 健心紀錄日曆 */}
        <GratitudeCalendar initialEntries={initialEntries} userId={userId} />

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

      {/* 上次測驗結果 — full-screen page overlay */}
      {showPrevious && previousScores && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 py-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
                Previous result
              </p>
              <h3 className="text-lg font-extrabold text-foreground">上次測驗結果</h3>
              {previousScores.created_at && (
                <p className="text-xs text-muted-foreground">
                  {String(previousScores.created_at).slice(0, 10)}
                </p>
              )}
            </div>
            <button
              onClick={() => setShowPrevious(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition active:scale-95"
            >
              ✕
            </button>
          </div>
          <div className="overflow-y-auto px-6 pb-12 pt-4 md:px-10">
            <PermaRadar scores={previousScores} />
            <div className="mt-4 flex flex-col gap-4">
              {PERMA_DIMENSIONS.map(({ key, letter, label, tile }) => (
                <div key={key}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                      {letter}
                    </span>
                    <span className="text-sm font-bold text-foreground">{label}</span>
                  </div>
                  <ScoreBar score={previousScores[key]} tile={tile} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
