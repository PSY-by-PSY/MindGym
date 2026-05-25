import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import petCat from '../assets/pet-cat.png'

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
}

export const Route = createFileRoute('/app/profile')({
  loader: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user.id
    if (!userId) return { name: null, scores: null, userId: null, initialEntries: [], streak: 0, monthlyCount: 0 }

    const today = new Date()
    const y = today.getFullYear()
    const m = today.getMonth() + 1
    const startOfMonth = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const endOfMonth = `${y}-${String(m).padStart(2, '0')}-${lastDay}`

    const [profileRes, permaRes, entriesRes, allDatesRes] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', userId).single(),
      supabase
        .from('perma_scores')
        .select('p_score, e_score, r_score, m_score, a_score')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('gratitude_entries')
        .select('id, entry_date, item_1, item_2, item_3')
        .eq('user_id', userId)
        .gte('entry_date', startOfMonth)
        .lte('entry_date', endOfMonth),
      supabase
        .from('gratitude_entries')
        .select('entry_date')
        .eq('user_id', userId)
        .order('entry_date', { ascending: false }),
    ])

    const entryDateSet = new Set(allDatesRes.data?.map((e) => e.entry_date) ?? [])
    const toDS = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    let streak = 0
    const checkDate = new Date(today)
    while (entryDateSet.has(toDS(checkDate))) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    }

    const monthlyCount = (entriesRes.data ?? []).length

    return {
      name: (profileRes.data?.name ?? null) as string | null,
      scores: (permaRes.data ?? null) as PermaScores | null,
      userId,
      initialEntries: (entriesRes.data ?? []) as GratitudeEntry[],
      streak,
      monthlyCount,
    }
  },
  pendingComponent: LoadingState,
  component: ProfilePage,
})

const PERMA_DIMENSIONS = [
  { key: 'p_score' as const, letter: 'P', label: '正向情緒', short: '正向', tile: 'bg-tile-pink' },
  { key: 'e_score' as const, letter: 'E', label: '全心投入', short: '投入', tile: 'bg-tile-blue' },
  { key: 'r_score' as const, letter: 'R', label: '與他人關係', short: '關係', tile: 'bg-tile-peach' },
  { key: 'm_score' as const, letter: 'M', label: '生活意義', short: '意義', tile: 'bg-tile-mint' },
  { key: 'a_score' as const, letter: 'A', label: '成就感', short: '成就', tile: 'bg-tile-blue' },
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
            y={y}
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
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-44 rounded-b-[40%] bg-gradient-soft" />
      <div className="relative px-6 pt-10 md:px-10">
        <p className="font-handwriting text-2xl text-muted-foreground">你的健心檔案</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight text-foreground md:text-3xl">
          本週進度，看得見
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

// ── 健心紀錄日曆 ────────────────────────────────────────────────────────────

function GratitudeCalendar({
  initialEntries,
  userId,
}: {
  initialEntries: GratitudeEntry[]
  userId: string | null
}) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayDate = new Date()

  const [year, setYear] = useState(todayDate.getFullYear())
  const [month, setMonth] = useState(todayDate.getMonth()) // 0-indexed
  const [entries, setEntries] = useState<GratitudeEntry[]>(initialEntries)
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [modalEntry, setModalEntry] = useState<GratitudeEntry | null>(null)
  const isInitialMount = useRef(true)

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (!userId) return

    setLoading(true)
    setSelectedDate(null)

    const m = month + 1
    const startDate = `${year}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const endDate = `${year}-${String(m).padStart(2, '0')}-${lastDay}`

    supabase
      .from('gratitude_entries')
      .select('id, entry_date, item_1, item_2, item_3')
      .eq('user_id', userId)
      .gte('entry_date', startDate)
      .lte('entry_date', endDate)
      .then(({ data }) => {
        setEntries(data ?? [])
        setLoading(false)
      })
  }, [year, month, userId])

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const entryMap = new Map(entries.map((e) => [e.entry_date, e]))

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
          Training log
        </p>
        <h2 className="mb-4 text-lg font-extrabold text-foreground">健心紀錄日曆</h2>

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
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 px-4 pb-8 backdrop-blur-sm"
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
          </div>
        </div>
      )}
    </>
  )
}

// ── 主頁面 ────────────────────────────────────────────────────────────────

function ProfilePage() {
  const { name, scores, userId, initialEntries, streak, monthlyCount } = Route.useLoaderData()

  return (
    <div className="animate-fade-up mx-auto max-w-3xl pb-4">
      <Header />

      <div className="flex flex-col gap-4 px-6 pt-5 md:px-10">
        {/* 名字卡 */}
        <div className="flex items-center gap-4 rounded-3xl bg-card p-5 shadow-soft">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary text-2xl text-primary-foreground">
            {(name ?? '友').slice(0, 1)}
          </div>
          <div>
            <p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
              Member
            </p>
            <p className="text-lg font-extrabold text-foreground">{name ?? '未設定名稱'}</p>
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
            <span className="mb-1 text-xl text-primary">🎖️</span>
            <span className="text-2xl font-extrabold text-foreground">1.8<span className="text-base font-bold">噸</span></span>
            <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">總重量</span>
          </div>
        </div>

        {/* 夥伴小卡（裝飾） */}
        <div className="flex items-center gap-4 rounded-3xl bg-tile-blue p-5 shadow-soft">
          <img src={petCat} alt="夥伴貓" className="h-20 w-20 animate-float" />
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
              Training partner
            </p>
            <p className="mt-1 font-extrabold text-foreground">星河藍貓</p>
            <p className="mt-0.5 text-sm text-muted-foreground">「今天也跟著你一起變強了！」</p>
          </div>
        </div>

        {/* PERMA 雷達圖 + 分數 */}
        {scores ? (
          <div className="rounded-3xl bg-card p-5 shadow-soft">
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
              MENTAL RADAR
            </p>
            <h2 className="mb-0.5 text-lg font-extrabold text-foreground">心理肌群雷達圖</h2>
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
      </div>
    </div>
  )
}
