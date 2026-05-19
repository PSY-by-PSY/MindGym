import { createFileRoute } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'

type GratitudeEntry = {
  id: string
  anon_name: string | null
  item_1: string | null
  item_2: string | null
  item_3: string | null
  entry_date: string | null
}

export const Route = createFileRoute('/app/community')({
  loader: async () => {
    const { data } = await supabase
      .from('gratitude_entries')
      .select('id, anon_name, item_1, item_2, item_3, entry_date')
      .eq('is_shared', true)
      .order('created_at', { ascending: false })
      .limit(4)
    return { entries: (data ?? []) as GratitudeEntry[] }
  },
  pendingComponent: LoadingState,
  component: CommunityPage,
})

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${y} / ${m} / ${d}`
}

const AVATARS = [
  { emoji: '🌟', tile: 'bg-tile-peach' },
  { emoji: '🌿', tile: 'bg-tile-mint' },
  { emoji: '🌸', tile: 'bg-tile-pink' },
  { emoji: '☁️', tile: 'bg-tile-blue' },
]

function avatarFor(seed: string | null, index: number) {
  if (!seed) return AVATARS[index % AVATARS.length]
  const sum = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return AVATARS[sum % AVATARS.length]
}

function Header() {
  return (
    <header className="mb-6">
      <p className="font-handwriting text-2xl text-muted-foreground">健身房動態</p>
      <h1 className="mt-1 text-2xl font-extrabold leading-tight text-foreground md:text-3xl">
        大家今天感謝了什麼？
      </h1>
    </header>
  )
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-10 md:px-10">
      <Header />
      <div className="flex flex-col gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-3xl bg-primary-soft" />
        ))}
      </div>
    </div>
  )
}

function CommunityPage() {
  const { entries } = Route.useLoaderData()

  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-10 md:px-10">
      <Header />

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-16 text-muted-foreground shadow-soft">
          <span className="text-4xl">💫</span>
          <p className="mt-3 text-sm font-medium">還沒有人分享，快去寫感恩日記吧！</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((entry, i) => (
            <EntryCard key={entry.id} entry={entry} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function EntryCard({ entry, index }: { entry: GratitudeEntry; index: number }) {
  const items = [entry.item_1, entry.item_2, entry.item_3].filter(Boolean) as string[]
  const avatar = avatarFor(entry.anon_name, index)

  return (
    <article className="rounded-3xl bg-card p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-full text-lg ${avatar.tile}`}>
          {avatar.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold text-foreground">
            {entry.anon_name ?? '匿名使用者'}
          </p>
          <p className="text-xs text-muted-foreground">{formatDate(entry.entry_date)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-tile-mint px-3 py-1 text-[11px] font-bold text-foreground">
          感恩日記
        </span>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 rounded-2xl bg-muted px-3.5 py-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">
              {i + 1}
            </span>
            <span className="text-sm leading-relaxed text-foreground/80">{item}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}
