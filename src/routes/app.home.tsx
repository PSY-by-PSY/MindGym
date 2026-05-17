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
    bg: 'bg-violet-50',
    text: 'text-violet-600',
    to: '/app/placeholder' as const,
    searchName: '正念冥想',
  },
  {
    emoji: '❤️',
    name: '自我慈悲',
    desc: '善待自己，接納不完美',
    bg: 'bg-pink-50',
    text: 'text-pink-600',
    to: '/app/placeholder' as const,
    searchName: '自我慈悲',
  },
  {
    emoji: '⭐',
    name: '感恩日記',
    desc: '記錄生活中的美好片刻',
    bg: 'bg-green-50',
    text: 'text-green-600',
    to: '/app/gratitude' as const,
    searchName: null,
  },
  {
    emoji: '☑️',
    name: '三件好事',
    desc: '每日記錄三個正向事件',
    bg: 'bg-orange-50',
    text: 'text-orange-600',
    to: '/app/placeholder' as const,
    searchName: '三件好事',
  },
  {
    emoji: '👁️',
    name: '過程目標覺察',
    desc: '覺察成長、心得與樂趣',
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    to: '/app/placeholder' as const,
    searchName: '過程目標覺察',
  },
]

function HomePage() {
  const { userName } = Route.useRouteContext()

  return (
    <div className="px-5 pt-8 pb-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          你好，{userName}
        </h1>
        <p className="mt-1 text-base text-gray-500">今天想練哪一塊？</p>
      </header>

      <div className="flex flex-col gap-3">
        {modules.map((mod) => (
          <ModuleCard key={mod.name} {...mod} />
        ))}
      </div>
    </div>
  )
}

type ModuleCardProps = (typeof modules)[number]

function ModuleCard({ emoji, name, desc, bg, text, to, searchName }: ModuleCardProps) {
  const linkProps =
    to === '/app/placeholder'
      ? { to, search: { name: searchName ?? name } }
      : { to }

  return (
    <Link
      {...(linkProps as Parameters<typeof Link>[0])}
      className={`flex items-center gap-4 rounded-2xl p-4 transition active:scale-[.98] ${bg}`}
    >
      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-2xl ${bg}`}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold ${text}`}>{name}</p>
        <p className="mt-0.5 text-sm text-gray-500">{desc}</p>
      </div>
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300" />
    </Link>
  )
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
