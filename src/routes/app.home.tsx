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

const modules = [
  {
    emoji: '🕐',
    name: '正念冥想',
    desc: '專注當下，觀察思緒流動',
    en: 'Mindfulness',
    tile: 'bg-tile-blue',
    to: '/app/placeholder' as const,
    searchName: '正念冥想',
    hot: false,
  },
  {
    emoji: '❤️',
    name: '自我慈悲',
    desc: '善待自己，接納不完美',
    en: 'Self-compassion',
    tile: 'bg-tile-pink',
    to: '/app/placeholder' as const,
    searchName: '自我慈悲',
    hot: false,
  },
  {
    emoji: '⭐',
    name: '感恩日記',
    desc: '記錄生活中的美好片刻',
    en: 'Gratitude journal',
    tile: 'bg-tile-mint',
    to: '/app/gratitude' as const,
    searchName: null,
    hot: true,
  },
  {
    emoji: '☑️',
    name: '三件好事',
    desc: '每日記錄三個正向事件',
    en: 'Three good things',
    tile: 'bg-tile-peach',
    to: '/app/placeholder' as const,
    searchName: '三件好事',
    hot: false,
  },
  {
    emoji: '👁️',
    name: '過程目標覺察',
    desc: '覺察成長、心得與樂趣',
    en: 'Process awareness',
    tile: 'bg-tile-blue',
    to: '/app/placeholder' as const,
    searchName: '過程目標覺察',
    hot: false,
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

      {/* 訓練模組 */}
      <h2 className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
        Training modules
      </h2>
      <div className="flex flex-col gap-3">
        {modules.map((mod) => (
          <ModuleCard key={mod.name} {...mod} />
        ))}
      </div>
    </div>
  )
}

type ModuleCardProps = (typeof modules)[number]

function ModuleCard({ emoji, name, desc, en, tile, to, searchName, hot }: ModuleCardProps) {
  const linkProps =
    to === '/app/placeholder'
      ? { to, search: { name: searchName ?? name } }
      : { to }

  return (
    <Link
      {...(linkProps as Parameters<typeof Link>[0])}
      className={`flex items-center gap-4 rounded-3xl p-4 shadow-soft transition active:scale-[0.98] ${tile}`}
    >
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-card text-2xl shadow-sm">
        {emoji}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
          {en}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="font-extrabold text-foreground">{name}</p>
          {hot && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-primary-foreground">
              Hot
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{desc}</p>
      </div>
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-foreground/25" />
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

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
