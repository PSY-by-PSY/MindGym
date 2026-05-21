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

    return { userName }
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
  const { userName } = Route.useRouteContext()

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

