import { createFileRoute, Link } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import petCat from '../assets/pet-cat.png'

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
  { key: 'p_score' as const, letter: 'P', label: '正向情緒', short: '正向', tile: 'bg-tile-pink' },
  { key: 'e_score' as const, letter: 'E', label: '全心投入', short: '投入', tile: 'bg-tile-blue' },
  { key: 'r_score' as const, letter: 'R', label: '與他人關係', short: '關係', tile: 'bg-tile-peach' },
  { key: 'm_score' as const, letter: 'M', label: '生活意義', short: '意義', tile: 'bg-tile-mint' },
  { key: 'a_score' as const, letter: 'A', label: '成就感', short: '成就', tile: 'bg-tile-blue' },
]

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
        <p className="font-handwriting text-2xl text-muted-foreground">PSY GYM Profile</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight text-foreground md:text-3xl">
          你的健心檔案
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

function ProfilePage() {
  const { name, scores } = Route.useLoaderData()

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
              Mental radar
            </p>
            <h2 className="mb-2 text-lg font-extrabold text-foreground">PERMA 心理健康指數</h2>
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
      </div>
    </div>
  )
}
