import { useState } from 'react'
import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import { recommendPractice, type Recommendation } from '../lib/recommend'

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
      .select('id, name')
      .eq('id', userId)
      .maybeSingle()

    if (!profile) {
      await supabase.from('profiles').insert({ id: userId, name: userName })
    } else if (!profile.name && userName) {
      await supabase.from('profiles').update({ name: userName }).eq('id', userId)
    }

    const { data: scores } = await supabase
      .from('perma_scores')
      .select('p_score, e_score, r_score, m_score, a_score')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
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

    // 由雷達圖（最新 PERMA 分數）決定今天推薦的練習
    const recommendation = recommendPractice(scores[0] ?? null)

    return { userName, hasGratitudeToday: (todayGratitude?.length ?? 0) > 0, recommendation }
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

// 順序：感恩日記 → 三件好事 → 過程目標覺察 → 自我慈悲 → 正念冥想
const modules = [
  {
    emoji: '⭐',
    name: '感恩日記',
    tile: 'bg-tile-mint',
    to: '/app/gratitude' as const,
    searchName: null,
    locked: false,
    perma: [
      { letter: 'P', label: '情緒力' },
      { letter: 'R', label: '連結力' },
      { letter: 'M', label: '意義力' },
    ],
  },
  {
    emoji: '☑️',
    name: '三件好事',
    tile: 'bg-tile-peach',
    to: '/app/placeholder' as const,
    searchName: '三件好事',
    locked: true,
    perma: [{ letter: 'P', label: '情緒力' }],
  },
  {
    emoji: '👁️',
    name: '過程目標覺察',
    tile: 'bg-tile-blue',
    to: '/app/process-goal' as const,
    searchName: null,
    locked: false,
    perma: [
      { letter: 'M', label: '意義力' },
      { letter: 'A', label: '成就力' },
    ],
  },
  {
    emoji: '❤️',
    name: '自我慈悲',
    tile: 'bg-tile-pink',
    to: '/app/placeholder' as const,
    searchName: '自我慈悲',
    locked: true,
    perma: [{ letter: 'E', label: '投入力' }],
  },
  {
    emoji: '🕐',
    name: '正念冥想',
    tile: 'bg-tile-blue',
    to: '/app/placeholder' as const,
    searchName: '正念冥想',
    locked: true,
    perma: [{ letter: 'E', label: '投入力' }],
  },
]

// 工作坊專屬練習：配合線上工作坊的限定模塊，首次點擊需輸入工作坊密碼
// （密碼閘門由各模塊路由的 WorkshopGate 處理，這裡只是入口卡片）。
const workshopModules = [
  { emoji: '🃏', name: '暖身卡牌', tile: 'bg-tile-peach', to: '/app/workshop/warmup' as const },
  { emoji: '🪞', name: '找尋真實自我', tile: 'bg-tile-mint', to: '/app/workshop/authentic-self' as const },
  { emoji: '🌅', name: '生命最後一天', tile: 'bg-tile-blue', to: '/app/workshop/last-day' as const },
]

function HomePage() {
  const { userName, recommendation } = Route.useRouteContext()

  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-10 md:px-10">
      <header className="mb-6">
        <p className="font-handwriting text-2xl text-muted-foreground">嗨，歡迎回來</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight text-foreground md:text-3xl">
          {userName}，今天想練哪塊心理肌肉？
        </h1>
      </header>

      {/* 訓練模組—大按鈕、左右滑動瀏覽 */}
      <h2 className="mb-4 text-2xl font-extrabold text-foreground leading-tight">
        健心訓練模組<br />PSY by PSY Training Modules
      </h2>
      <div className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 no-scrollbar md:-mx-10 md:px-10">
        {modules.map((mod) => (
          <div key={mod.name} className="w-[70%] max-w-[260px] shrink-0 snap-center">
            {mod.locked ? (
              <LockedGridTile {...mod} />
            ) : (
              <GridTile {...mod} />
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">← 左右滑動瀏覽更多模組 →</p>

      {/* 今日練習快速啟動橫幅—依雷達圖推薦 */}
      <TodayPracticeBanner recommendation={recommendation} />

      {/* 工作坊專屬練習 */}
      <WorkshopSection />

      {/* 訓練中心 */}
      <TrainingCenter recommendation={recommendation} />
    </div>
  )
}

function TodayPracticeBanner({ recommendation }: { recommendation: Recommendation }) {
  const linkProps = recommendation.search
    ? { to: recommendation.to, search: recommendation.search }
    : { to: recommendation.to }

  return (
    <Link
      {...(linkProps as Parameters<typeof Link>[0])}
      onClick={() => track('today_practice_opened', { module: recommendation.name })}
      className="mt-4 flex items-center justify-between gap-3 rounded-3xl bg-gradient-primary p-5 shadow-soft transition active:scale-[0.98]"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="text-3xl leading-none">{recommendation.emoji}</span>
        <div className="min-w-0">
          <p className="text-lg font-extrabold leading-tight text-white">
            開始今日練習 · {recommendation.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-white/75">{recommendation.reason}</p>
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
      onClick={() => track('module_opened', { module: name })}
      className={`flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl p-7 shadow-soft transition active:scale-[0.97] ${tile}`}
    >
      <span className="text-6xl leading-none">{emoji}</span>
      <p className="text-center text-lg font-extrabold leading-tight text-foreground">{name}</p>
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

function LockedGridTile({ emoji, name, tile, perma }: GridTileProps) {
  return (
    <div className={`relative flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl p-7 shadow-soft grayscale opacity-50 cursor-not-allowed ${tile}`}>
      <span className="absolute right-3 top-3 rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
        🔒 施工中
      </span>
      <span className="text-6xl leading-none">{emoji}</span>
      <p className="text-center text-lg font-extrabold leading-tight text-foreground">{name}</p>
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
    </div>
  )
}

// ─── Workshop Section ─────────────────────────────────────────────────────────

function WorkshopSection() {
  return (
    <section className="mt-10">
      <h2 className="mb-1.5 text-2xl font-extrabold leading-tight text-foreground">
        工作坊專屬練習<br />Workshop Exclusive Practice
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        配合線上工作坊的限定練習，首次進入需輸入工作坊密碼。
      </p>
      <div className="grid grid-cols-3 gap-3">
        {workshopModules.map((mod) => (
          <WorkshopTile key={mod.name} {...mod} />
        ))}
      </div>
    </section>
  )
}

type WorkshopTileProps = (typeof workshopModules)[number]

function WorkshopTile({ emoji, name, tile, to }: WorkshopTileProps) {
  return (
    <Link
      to={to}
      onClick={() => track('module_opened', { module: name })}
      className={`relative flex w-full flex-col items-center gap-2 rounded-3xl p-4 shadow-soft transition active:scale-[0.97] ${tile}`}
    >
      <span className="absolute right-2 top-2 rounded-full bg-black/15 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
        🔒 限定
      </span>
      <span className="text-4xl leading-none">{emoji}</span>
      <p className="text-center text-xs font-extrabold leading-tight text-foreground">{name}</p>
    </Link>
  )
}

// ─── PERMA Menu Table (Step 9) ───────────────────────────────────────────────

const PRACTICE_BADGE_STYLE: Record<string, { bg: string; dot: string; text: string }> = {
  '正念冥想':     { bg: '#EDE9FE', dot: '#7C3AED', text: '#5B21B6' },
  '自我慈悲':     { bg: '#FCE7F3', dot: '#BE185D', text: '#9D174D' },
  '感恩日記':     { bg: '#D1FAE5', dot: '#059669', text: '#065F46' },
  '三件好事':     { bg: '#FEF3C7', dot: '#D97706', text: '#92400E' },
  '過程目標覺察': { bg: '#DBEAFE', dot: '#2563EB', text: '#1E3A8A' },
}

const PERMA_LETTER_COLOR: Record<string, string> = {
  P: '#7C3AED',
  E: '#059669',
  R: '#BE185D',
  M: '#9B1257',
  A: '#2563EB',
}

const BADGE_STYLE = {
  good:     { bg: '#D1FAE5', text: '#065F46' },
  improve:  { bg: '#FEE2E2', text: '#991B1B' },
  adjusted: { bg: '#E0E7FF', text: '#3730A3' },
}

type PermaPractice = { name: string; primary: boolean }
type PermaRow = {
  letter: string
  zh: string
  en: string
  practices: PermaPractice[]
  strength: number
  strengthLabel: string
  description: string
  badge: { text: string; style: keyof typeof BADGE_STYLE }
}

const PERMA_ROWS: PermaRow[] = [
  {
    letter: 'P', zh: '情緒力', en: 'Positive Emotion',
    practices: [
      { name: '三件好事', primary: true },
      { name: '感恩日記', primary: true },
      { name: '正念冥想', primary: false },
    ],
    strength: 4, strengthLabel: '強',
    description: '三件好事與感恩日記直接累積正向情感體驗；正念冥想透過情緒調節間接貢獻。',
    badge: { text: '覆蓋良好', style: 'good' },
  },
  {
    letter: 'E', zh: '投入力', en: 'Engagement',
    practices: [
      { name: '正念冥想', primary: true },
      { name: '過程目標覺察', primary: true },
    ],
    strength: 3, strengthLabel: '中',
    description: '正念訓練專注與當下投入；過程目標覺察的「享受到的樂趣」直接對應 flow 狀態的反思。',
    badge: { text: '可加強', style: 'improve' },
  },
  {
    letter: 'R', zh: '連結力', en: 'Relationships',
    practices: [
      { name: '感恩日記', primary: true },
      { name: '自我慈悲', primary: false },
    ],
    strength: 3, strengthLabel: '中',
    description: '感恩日記的書寫對象多為他人，強化對人際連結的覺察與珍視；自我慈悲的「共同人性」成分（common humanity）也間接涉及關係感。',
    badge: { text: '修正後合理', style: 'adjusted' },
  },
  {
    letter: 'M', zh: '意義力', en: 'Meaning',
    practices: [
      { name: '過程目標覺察', primary: true },
      { name: '自我慈悲', primary: false },
      { name: '感恩日記', primary: false },
    ],
    strength: 3, strengthLabel: '中',
    description: '過程目標覺察的「成長心得」最直接引導意義建構；感恩讓使用者辨認生命中有價值的事物。可加入更明確的價值觀連結引導。',
    badge: { text: '可加強', style: 'improve' },
  },
  {
    letter: 'A', zh: '成就力', en: 'Accomplishment',
    practices: [
      { name: '三件好事', primary: true },
      { name: '過程目標覺察', primary: true },
    ],
    strength: 4, strengthLabel: '強',
    description: '三件好事引導使用者辨認每日小成就；過程目標覺察的「成長了哪些部分」直接強化勝任感。平台打卡機制也持續累積成就感。',
    badge: { text: '覆蓋良好', style: 'good' },
  },
]

function PermaMenuTable() {
  return (
    <div className="overflow-hidden rounded-3xl bg-card shadow-soft">
      {/* Practice legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-border px-4 py-3">
        {Object.entries(PRACTICE_BADGE_STYLE).map(([name, { dot }]) => (
          <span key={name} className="flex items-center gap-1.5 text-[11px] text-foreground/70">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />
            {name}
          </span>
        ))}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[72px_1fr_72px] border-b border-border bg-muted/30 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground md:grid-cols-[80px_1fr_88px_1fr]">
        <span>維度</span>
        <span>對應練習</span>
        <span className="text-center">覆蓋強度</span>
        <span className="hidden md:block">說明</span>
      </div>

      {/* Rows */}
      {PERMA_ROWS.map((row, idx) => {
        const letterColor = PERMA_LETTER_COLOR[row.letter]
        return (
          <div key={row.letter} className={idx < PERMA_ROWS.length - 1 ? 'border-b border-border' : ''}>
            <div className="grid grid-cols-[72px_1fr_72px] gap-3 px-4 pt-4 md:grid-cols-[80px_1fr_88px_1fr]">
              {/* Dimension */}
              <div className="pb-4">
                <p className="text-xl font-extrabold leading-none" style={{ color: letterColor }}>{row.letter}</p>
                <p className="mt-1 text-xs font-bold text-foreground/80">{row.zh}</p>
                <p className="text-[10px] text-muted-foreground">{row.en}</p>
              </div>

              {/* Practices */}
              <div className="flex flex-wrap content-start gap-1.5 pb-4">
                {row.practices.map((p) => {
                  const s = PRACTICE_BADGE_STYLE[p.name]
                  return (
                    <span
                      key={p.name}
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold leading-none"
                      style={{ backgroundColor: s.bg, color: s.text }}
                    >
                      {p.name}
                      <span className="opacity-80">{p.primary ? '●' : '◐'}</span>
                    </span>
                  )
                })}
              </div>

              {/* Strength */}
              <div className="flex flex-col items-center gap-1 pb-4 pt-1">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: i < row.strength ? letterColor : '#E5E7EB' }}
                    />
                  ))}
                </div>
                <span className="text-[11px] font-bold text-muted-foreground">{row.strengthLabel}</span>
              </div>

              {/* Description — shown as 4th column on md+ */}
              <div className="hidden pb-4 md:block">
                <p className="text-xs leading-relaxed text-muted-foreground">{row.description}</p>
                <span
                  className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                  style={{ backgroundColor: BADGE_STYLE[row.badge.style].bg, color: BADGE_STYLE[row.badge.style].text }}
                >
                  {row.badge.text}
                </span>
              </div>
            </div>

            {/* Description — shown below row on mobile */}
            <div className="px-4 pb-4 md:hidden">
              <p className="text-xs leading-relaxed text-muted-foreground">{row.description}</p>
              <span
                className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                style={{ backgroundColor: BADGE_STYLE[row.badge.style].bg, color: BADGE_STYLE[row.badge.style].text }}
              >
                {row.badge.text}
              </span>
            </div>
          </div>
        )
      })}

      {/* Footer */}
      <div className="border-t border-border px-4 py-3 text-[10px] leading-relaxed text-muted-foreground/60">
        ● 主要對應 ・ ◐ 部分對應 ｜ 覆蓋強度以五個練習對該維度的累計貢獻估算，非實驗數據
      </div>
    </div>
  )
}

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

function ChevronRight() {
  return (
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
  )
}

type ExerciseCardProps = {
  to: string
  search?: Record<string, string>
  emoji: string
  tile: string
  name: string
  meta: string
  badge?: string
}

function ExerciseCard({ to, search, emoji, tile, name, meta, badge }: ExerciseCardProps) {
  const linkProps = search ? { to, search } : { to }
  return (
    <Link
      {...(linkProps as Parameters<typeof Link>[0])}
      onClick={() => track('module_opened', { module: name })}
      className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-soft transition active:scale-[0.97]"
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${tile}`}>{emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-extrabold text-foreground">{name}</p>
          {badge && (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-extrabold text-primary">{badge}</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
      </div>
      <ChevronRight />
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

function TrainingCenter({ recommendation }: { recommendation: Recommendation }) {
  const [activeTab, setActiveTab] = useState<TrainingTab>('schedule')
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })

  return (
    <section className="mt-10 pb-16">
      <div className="mb-4">
        <h2 className="text-2xl font-extrabold text-foreground leading-tight">
          健心訓練中心<br />PSY by PSY Training Center
        </h2>
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
          <p className="mb-2 text-xs text-muted-foreground">
            今天為你安排：<span className="font-bold text-foreground">{recommendation.name}</span>。其他練習也隨時可以做。
          </p>
          <div className="flex flex-col gap-2">
            <ExerciseCard
              to="/app/gratitude"
              emoji="⭐"
              tile="bg-tile-mint"
              name="感恩日記"
              meta="初階 · 5 分鐘 · 情緒力"
              badge={recommendation.key === 'gratitude' ? '今日推薦' : undefined}
            />
            <ExerciseCard
              to="/app/process-goal"
              emoji="👁️"
              tile="bg-tile-blue"
              name="過程目標覺察"
              meta="進階 · 3 分鐘 · 意義力 · 成就力"
              badge={recommendation.key === 'process-goal' ? '今日推薦' : undefined}
            />
          </div>
        </div>
      )}

      {activeTab === 'new' && (
        <div className="flex flex-col gap-2">
          <ExerciseCard
            to="/app/process-goal"
            emoji="👁️"
            tile="bg-tile-blue"
            name="過程目標覺察"
            meta="新上架 · 找回你的專注狀態"
            badge="NEW"
          />
          <ExerciseCard
            to="/app/placeholder"
            search={{ name: '三件好事' }}
            emoji="☑️"
            tile="bg-tile-peach"
            name="三件好事"
            meta="即將上架 · 情緒力 · 成就力"
          />
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

      {activeTab === 'perma' && <PermaMenuTable />}
    </section>
  )
}
