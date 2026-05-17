import { createFileRoute, Link } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'

type PermaScores = {
  p_score: number
  e_score: number
  r_score: number
  m_score: number
  a_score: number
}

export const Route = createFileRoute('/app/profile')({
  loader: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user.id
    if (!userId) return { name: null, scores: null }

    const [profileRes, permaRes] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', userId).single(),
      supabase
        .from('perma_scores')
        .select('p_score, e_score, r_score, m_score, a_score')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ])

    return {
      name: (profileRes.data?.name ?? null) as string | null,
      scores: (permaRes.data ?? null) as PermaScores | null,
    }
  },
  pendingComponent: LoadingState,
  component: ProfilePage,
})

const PERMA_DIMENSIONS = [
  { key: 'p_score' as const, letter: 'P', label: '正向情緒', color: 'bg-purple-400' },
  { key: 'e_score' as const, letter: 'E', label: '全心投入', color: 'bg-pink-400' },
  { key: 'r_score' as const, letter: 'R', label: '與他人關係', color: 'bg-green-400' },
  { key: 'm_score' as const, letter: 'M', label: '生活意義', color: 'bg-orange-400' },
  { key: 'a_score' as const, letter: 'A', label: '成就感', color: 'bg-blue-400' },
]

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-2.5 flex-1 rounded-full transition-all ${
              i <= score ? color : 'bg-gray-100'
            }`}
          />
        ))}
      </div>
      <span className="w-8 text-right text-sm font-semibold text-gray-700">{score}/5</span>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="px-5 pt-8 pb-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">你的心理檔案</h1>
      </header>
      <div className="flex flex-col gap-4">
        <div className="h-20 animate-pulse rounded-2xl bg-indigo-50" />
        <div className="h-64 animate-pulse rounded-2xl bg-indigo-50" />
      </div>
    </div>
  )
}

function ProfilePage() {
  const { name, scores } = Route.useLoaderData()

  return (
    <div className="px-5 pt-8 pb-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">你的心理檔案</h1>
      </header>

      {/* Name card */}
      <div className="mb-4 flex items-center gap-4 rounded-2xl bg-indigo-50 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-2xl">
          👤
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">使用者名稱</p>
          <p className="text-lg font-bold text-gray-900">{name ?? '未設定名稱'}</p>
        </div>
      </div>

      {/* PERMA scores */}
      {scores ? (
        <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <h2 className="mb-4 text-sm font-semibold text-gray-500">PERMA 心理健康指數</h2>
          <div className="flex flex-col gap-4">
            {PERMA_DIMENSIONS.map(({ key, letter, label, color }) => (
              <div key={key}>
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                      {letter}
                    </span>
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                  </div>
                </div>
                <ScoreBar score={scores[key]} color={color} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-4 flex flex-col items-center justify-center rounded-2xl bg-white py-10 shadow-sm ring-1 ring-gray-100 text-gray-400">
          <span className="text-3xl mb-2">📋</span>
          <p className="text-sm">尚未完成 PERMA 評估</p>
        </div>
      )}

      {/* Re-assess button */}
      <Link
        to="/onboarding"
        search={{ reassess: true }}
        className="flex w-full items-center justify-center rounded-2xl border border-indigo-200 bg-white py-3.5 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50"
      >
        重新評估
      </Link>
    </div>
  )
}
