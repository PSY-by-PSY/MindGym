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

function LoadingState() {
  return (
    <div className="px-5 pt-8 pb-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">大家今天感謝了什麼？</h1>
      </header>
      <div className="flex flex-col gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-indigo-50" />
        ))}
      </div>
    </div>
  )
}

function CommunityPage() {
  const { entries } = Route.useLoaderData()

  return (
    <div className="px-5 pt-8 pb-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">大家今天感謝了什麼？</h1>
      </header>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="text-4xl">💫</span>
          <p className="mt-3 text-sm">還沒有人分享，快去寫感恩日記吧！</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

function EntryCard({ entry }: { entry: GratitudeEntry }) {
  const items = [entry.item_1, entry.item_2, entry.item_3].filter(Boolean) as string[]

  return (
    <div className="rounded-2xl bg-indigo-50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-indigo-600">
          {entry.anon_name ?? '匿名使用者'}
        </span>
        <span className="text-xs text-gray-400">{formatDate(entry.entry_date)}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="mt-0.5 flex-shrink-0 text-indigo-300">✦</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
