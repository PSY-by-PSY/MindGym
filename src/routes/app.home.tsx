import { useState } from 'react'
import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/app/home')({
  beforeLoad: async ({ context }) => {
    const user = context.session!.user
    const userId = user.id
    const userName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split('@')[0] ??
      '朋友'

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (!profile) {
      await supabase.from('profiles').insert({ id: userId, name: userName })
    }

    const { data: scores } = await supabase
      .from('perma_scores')
      .select('id')
      .eq('user_id', userId)
      .limit(1)

    if (!scores || scores.length === 0) {
      throw redirect({ to: '/onboarding' })
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: todayGratitude } = await supabase
      .from('gratitude_entries')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', todayStart.toISOString())
      .limit(1)

    return { userName, hasGratitudeToday: (todayGratitude?.length ?? 0) > 0 }
  },
  component: HomePage,
})

const permaColors: Record<string, string> = {
  P: 'bg-tile-peach',
  E: 'bg-tile-pink',
  R: 'bg-tile-mint',
  M: 'bg-tile-blue',
  A: 'bg-tile-peach',
}

const modules = [
  {
    emoji: '☑️',
    name: '三件好事',
    tile: 'bg-tile-peach',
    to: '/app/placeholder' as const,
    searchName: '三件好事',
    perma: [{ letter: 'P', label: '正向情緒' }],
  },
  {
    emoji: '⭐',
    name: '感恩日記',
    tile: 'bg-tile-mint',
    to: '/app/gratitude' as const,
    searchName: null,
    perma: [
      { letter: 'P', label: '情緒力' },
      { letter: 'R', label: '連結力' },
      { letter: 'M', label: '意義力' },
    ],
  },
  {
    emoji: '❤️',
    name: '自我慈悲',
    tile: 'bg-tile-pink',
    to: '/app/placeholder' as const,
    searchName: '自我慈悲',
    perma: [{ letter: 'E', label: '全心投入' }],
  },
  {
    emoji: '👁️',
    name: '過程目標覺察',
    tile: 'bg-tile-blue',
    to: '/app/placeholder' as const,
    searchName: '過程目標覺察',
    perma: [
      { letter: 'M', label: '意義力' },
      { letter: 'A', label: '成就感' },
    ],
  },
  {
    emoji: '🕐',
    name: '正念冥想',
    tile: 'bg-tile-blue',
    to: '/app/placeholder' as const,
    searchName: '正念冥想',
    perma: [{ letter: 'E', label: '全心投入' }],
  },
]

function HomePage() {
  const { userName, hasGratitudeToday } = Route.useRouteContext()

  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-10 md:px-10">
      <header className="mb-6">
        <p className="font-handwriting text-2xl text-muted-foreground">嗨，歡迎回來</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight text-foreground md:text-3xl">
          {userName}，今天想練哪塊心理肌肉？
        </h1>
      </header>

      {/* 今日暖身 — 暗夜漸層卡 */}
      <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-night p-6 shadow-soft">
        <StarField />
        <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-primary-foreground/55">
          Today&apos;s warm-up
        </p>
        <p className="mt-2 text-lg font-extrabold leading-snug text-primary-foreground">
          先深呼吸三次，讓今天的開機更順暢
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-primary-foreground/70">
          心理肌群和身體一樣，需要每天陪自己練一組。
        </p>
      </div>

      {/* 訓練模組格狀菜單 */}
      <h2 className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
        Training modules
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {modules.slice(0, 4).map((mod) => (
          <GridTile key={mod.name} {...mod} />
        ))}
        <div className="col-span-2 flex justify-center">
          <div className="w-[calc(50%-6px)]">
            <GridTile {...modules[4]} />
          </div>
        </div>
      </div>

      {/* 感恩日記快速啟動橫幅 */}
      <Link
        to="/app/gratitude"
        className="mt-4 flex items-center justify-between rounded-3xl bg-gradient-primary p-5 shadow-soft transition active:scale-[0.98]"
      >
        <div className="flex items-center gap-3.5">
          <span className="text-3xl leading-none">⭐</span>
          <div>
            <p className="text-sm font-extrabold leading-tight text-primary-foreground">
              感恩日記練習
            </p>
            <p className="mt-0.5 text-xs text-primary-foreground/70">
              點擊直接開始今日練習
            </p>
          </div>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-primary-foreground/80"
          aria-hidden="true"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </Link>

      {/* 訓練中心 */}
      <TrainingCenter hasGratitudeToday={hasGratitudeToday} />
    </div>
  )
}

type GridTileProps = (typeof modules)[number]

function GridTile({ emoji, name, tile, to, searchName, perma }: GridTileProps) {
  const linkProps =
    to === '/app/placeholder'
      ? { to, search: { name: searchName ?? name } }
      : { to }

  return (
    <Link
      {...(linkProps as Parameters<typeof Link>[0])}
      className={`flex w-full flex-col items-center gap-2.5 rounded-3xl p-4 shadow-soft transition active:scale-[0.97] ${tile}`}
    >
      <span className="text-4xl leading-none">{emoji}</span>
      <p className="text-center text-sm font-extrabold leading-tight text-foreground">{name}</p>
      <div className="flex flex-wrap justify-center gap-1">
        {perma.map(({ letter, label }) => (
          <span
            key={letter + label}
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold text-foreground/80 shadow-sm ${permaColors[letter]}`}
          >
            {letter} {label}
          </span>
        ))}
      </div>
    </Link>
  )
}

// permaMenuItems kept for Step 9
const permaMenuItems: { letter: string; label: string; practices: { name: string; to: string; searchName?: string }[] }[] = [
  {
    letter: 'P', label: '正向情緒',
    practices: [
      { name: '三件好事', to: '/app/placeholder', searchName: '三件好事' },
      { name: '感恩日記', to: '/app/gratitude' },
    ],
  },
  {
    letter: 'E', label: '全心投入',
    practices: [
      { name: '自我慈悲', to: '/app/placeholder', searchName: '自我慈悲' },
      { name: '正念冥想', to: '/app/placeholder', searchName: '正念冥想' },
    ],
  },
  {
    letter: 'R', label: '連結力',
    practices: [
      { name: '感恩日記', to: '/app/gratitude' },
    ],
  },
  {
    letter: 'M', label: '意義力',
    practices: [
      { name: '感恩日記', to: '/app/gratitude' },
      { name: '過程目標覺察', to: '/app/placeholder', searchName: '過程目標覺察' },
    ],
  },
  {
    letter: 'A', label: '成就感',
    practices: [
      { name: '過程目標覺察', to: '/app/placeholder', searchName: '過程目標覺察' },
    ],
  },
]
void permaMenuItems // used in Step 9

// ─── Training Center ──────────────────────────────────────────────────────────

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日']

function getWeekDays(): Date[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dow = today.getDay() // 0=Sun
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function WeekCalendar({
  selectedDay,
  onSelectDay,
}: {
  selectedDay: Date
  onSelectDay: (d: Date) => void
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = getWeekDays()

  return (
    <div className="mb-4 flex gap-1">
      {days.map((day, i) => {
        const isToday = day.getTime() === today.getTime()
        const isSelected = day.getTime() === selectedDay.getTime()
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelectDay(day)}
            className="flex flex-1 flex-col items-center gap-1 py-1"
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition ${
                isSelected
                  ? 'bg-foreground text-background'
                  : 'border border-border text-foreground/70'
              }`}
            >
              {isToday ? '今' : DAY_NAMES[i]}
            </div>
            <span
              className={`text-[11px] ${
                isSelected ? 'font-extrabold text-foreground' : 'text-muted-foreground'
              }`}
            >
              {day.getDate()}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function StatsCard({
  hasGratitudeToday,
  selectedDay,
}: {
  hasGratitudeToday: boolean
  selectedDay: Date
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isToday = selectedDay.getTime() === today.getTime()
  const completionPct = isToday && hasGratitudeToday ? 100 : 0

  return (
    <div className="mb-4 rounded-2xl bg-card p-4 shadow-soft">
      <div className="grid grid-cols-2 divide-x divide-border">
        <div className="pr-4">
          <p className="text-xs text-muted-foreground">預計強度</p>
          <p className="mt-1 text-xl font-extrabold text-foreground">
            5 <span className="text-sm font-bold">分鐘</span>
          </p>
        </div>
        <div className="pl-4">
          <p className="text-xs text-muted-foreground">完成進度</p>
          <p className="mt-1 text-xl font-extrabold text-foreground">
            {completionPct} <span className="text-sm font-bold">%</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function GratitudeExerciseCard() {
  return (
    <Link
      to="/app/gratitude"
      className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-soft transition active:scale-[0.97]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-tile-mint text-2xl">⭐</span>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold text-foreground">感恩日記</p>
        <p className="mt-0.5 text-xs text-muted-foreground">初階 · 5 分鐘 · 正向情緒</p>
      </div>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-foreground/40"
        aria-hidden="true"
      >
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

type TrainingTab = 'schedule' | 'new' | 'hot' | 'perma'

const TABS: { key: TrainingTab; label: string }[] = [
  { key: 'schedule', label: '我的日程' },
  { key: 'new', label: '最新上架' },
  { key: 'hot', label: '最熱門' },
  { key: 'perma', label: 'PERMA' },
]

function TrainingCenter({ hasGratitudeToday }: { hasGratitudeToday: boolean }) {
  const [activeTab, setActiveTab] = useState<TrainingTab>('schedule')
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })

  return (
    <section className="mt-10 pb-16">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-extrabold text-foreground">訓練中心</h2>
        <span className="text-sm text-muted-foreground">2 套菜單</span>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              activeTab === tab.key
                ? 'bg-foreground text-background'
                : 'bg-card text-foreground/70 shadow-soft'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'schedule' && (
        <div>
          <WeekCalendar selectedDay={selectedDay} onSelectDay={setSelectedDay} />
          <StatsCard hasGratitudeToday={hasGratitudeToday} selectedDay={selectedDay} />
          <div className="flex flex-col gap-2">
            <GratitudeExerciseCard />
          </div>
        </div>
      )}

      {activeTab === 'new' && (
        <div className="relative overflow-hidden rounded-3xl bg-muted/60 px-6 py-10 text-center shadow-soft">
          <span className="text-2xl">🔒</span>
          <p className="mt-2 text-sm font-extrabold text-muted-foreground">敬請期待</p>
          <p className="mt-1 text-xs text-muted-foreground/70">新課程正在路上</p>
        </div>
      )}

      {activeTab === 'hot' && (
        <Link
          to="/app/gratitude"
          className="flex items-center gap-4 rounded-3xl bg-tile-mint px-5 py-4 shadow-soft transition active:scale-[0.97]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/60 text-2xl shadow-sm">⭐</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-foreground">感恩日記</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {['P 情緒力', 'R 連結力', 'M 意義力'].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-extrabold text-foreground/70"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-foreground/50"
            aria-hidden="true"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {activeTab === 'perma' && (
        <div className="relative overflow-hidden rounded-3xl bg-muted/60 px-6 py-10 text-center shadow-soft">
          <span className="text-2xl">🔒</span>
          <p className="mt-2 text-sm font-extrabold text-muted-foreground">敬請期待</p>
          <p className="mt-1 text-xs text-muted-foreground/70">PERMA 練習菜單正在整理中</p>
        </div>
      )}
    </section>
  )
}

function StarField() {
  return (
    <svg className="absolute right-0 top-0 h-full w-32 opacity-70" viewBox="0 0 128 160" fill="none" aria-hidden="true">
      <g fill="var(--primary-glow)">
        <circle cx="96" cy="28" r="2.5" />
        <circle cx="116" cy="56" r="1.8" />
        <circle cx="80" cy="64" r="1.5" />
        <circle cx="108" cy="100" r="2.2" />
        <circle cx="90" cy="124" r="1.6" />
      </g>
      <path d="M104 38l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="var(--primary-foreground)" opacity="0.85" />
    </svg>
  )
}
