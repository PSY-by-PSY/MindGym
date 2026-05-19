import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { PrimaryCta } from '../components/PrimaryCta'

// ── PERMA 問卷資料 ─────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    key: 'p' as const,
    dimension: 'P',
    label: '正向情緒',
    tile: 'bg-tile-pink',
    question: '一般而言，你感到滿足的程度是？',
  },
  {
    key: 'e' as const,
    dimension: 'E',
    label: '全心投入',
    tile: 'bg-tile-blue',
    question: '一般而言，在事物上你感到興奮和有趣的程度是？',
  },
  {
    key: 'r' as const,
    dimension: 'R',
    label: '與他人關係',
    tile: 'bg-tile-peach',
    question: '你對自己的人際關係感到滿意的程度是？',
  },
  {
    key: 'm' as const,
    dimension: 'M',
    label: '生活意義',
    tile: 'bg-tile-mint',
    question: '你通常覺得自己生活有價值且值得的程度是？',
  },
  {
    key: 'a' as const,
    dimension: 'A',
    label: '成就感',
    tile: 'bg-tile-blue',
    question: '有多少的時間你認為自己正在往要完成的目標前進？',
  },
] as const

const OPTION_LABELS = ['非常不同意', '不同意', '普通', '同意', '非常同意']

// ── Route ─────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/onboarding')({
  validateSearch: (search: Record<string, unknown>): { reassess?: boolean } => (
    search.reassess === true || search.reassess === 'true' ? { reassess: true } : {}
  ),
  beforeLoad: async ({ context, search }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
    if (search.reassess) return
    // 已做過評估 → 直接去首頁
    const { data } = await supabase
      .from('perma_scores')
      .select('id')
      .eq('user_id', context.session.user.id)
      .limit(1)
    if (data && data.length > 0) {
      throw redirect({ to: '/app/home' })
    }
  },
  component: OnboardingPage,
})

// ── ProgressTrail（曲線進度） ───────────────────────────────────────────────

function ProgressTrail({ total, current }: { total: number; current: number }) {
  const w = 300
  const h = 56
  const pad = 24
  const pts = Array.from({ length: total }, (_, i) => {
    const x = pad + (i * (w - pad * 2)) / (total - 1)
    const y = h / 2 - Math.sin((i / (total - 1)) * Math.PI) * 12
    return { x, y }
  })
  const path = pts.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`)).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-full max-w-[300px]">
      <path d={path} fill="none" stroke="var(--border)" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 9" />
      {pts.map((p, i) => {
        const done = i < current
        const active = i === current
        return (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={active ? 13 : 9}
              fill={active ? 'var(--primary)' : done ? 'var(--primary-glow)' : 'var(--card)'}
              stroke={active || done ? 'var(--primary)' : 'var(--border)'}
              strokeWidth="2.5"
            />
            {done && (
              <path
                d={`M${p.x - 4} ${p.y} l3 3.5 l5.5 -7`}
                stroke="var(--primary-foreground)"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {active && <circle cx={p.x} cy={p.y} r="4.5" fill="var(--primary-foreground)" />}
          </g>
        )
      })}
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

function OnboardingPage() {
  const { session } = Route.useRouteContext()
  const navigate = useNavigate()
  const router = useRouter()

  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>([null, null, null, null, null])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = QUESTIONS[step]
  const selected = answers[step]
  const isLast = step === QUESTIONS.length - 1
  const canProceed = selected !== null

  const choose = (value: number) => {
    setAnswers(prev => {
      const next = [...prev]
      next[step] = value
      return next
    })
  }

  const goBack = () => {
    if (step > 0) {
      setStep(s => s - 1)
    } else {
      router.history.back()
    }
  }

  const handleNext = async () => {
    if (!canProceed) return

    if (!isLast) {
      setStep(s => s + 1)
      return
    }

    // 最後一題 → 送出
    setSubmitting(true)
    setError(null)
    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
      const res = await fetch(`${apiUrl}/api/perma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: session!.user.id,
          p: answers[0],
          e: answers[1],
          r: answers[2],
          m: answers[3],
          a: answers[4],
        }),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      navigate({ to: '/app/home' })
    } catch {
      setError('儲存失敗，請再試一次。')
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen pb-36">
      {/* 漸層膠囊 header 背景 */}
      <div className="absolute inset-x-0 top-0 h-60 rounded-b-[40%] bg-gradient-soft" />

      {/* header */}
      <div className="relative mx-auto max-w-3xl px-6 pt-10 md:px-10">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={goBack}
            disabled={submitting}
            aria-label="返回"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-soft transition active:scale-95 disabled:opacity-40"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <ProgressTrail total={QUESTIONS.length} current={step} />
        </div>

        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
          PERMA Check-in · {step + 1} / {QUESTIONS.length}
        </p>

        {/* 維度標籤 */}
        <div className={`mb-4 inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 ${current.tile}`}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
            {current.dimension}
          </span>
          <span className="text-sm font-bold text-foreground">{current.label}</span>
        </div>

        {/* 問題 */}
        <h2 className="text-2xl font-extrabold leading-tight text-foreground md:text-4xl">
          {current.question}
        </h2>
      </div>

      {/* 選項 */}
      <div className="animate-fade-up mx-auto mt-8 flex max-w-3xl flex-col gap-3 px-6 md:px-10" key={step}>
        {OPTION_LABELS.map((label, idx) => {
          const value = idx + 1
          const isSelected = selected === value
          return (
            <button
              key={value}
              onClick={() => choose(value)}
              className={`flex items-center gap-4 rounded-3xl border-2 px-5 py-4 text-left transition-all active:scale-[0.98] ${
                isSelected
                  ? 'scale-[1.02] border-primary bg-gradient-primary text-primary-foreground shadow-soft'
                  : 'border-border bg-card text-foreground'
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-extrabold ${
                  isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {value}
              </span>
              <span className="font-bold">{label}</span>
            </button>
          )
        })}

        {error && <p className="mt-2 text-center text-sm font-medium text-tile-pink">{error}</p>}
      </div>

      {/* 底部固定 CTA */}
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent px-6 pb-8 pt-10">
        <div className="mx-auto max-w-3xl md:px-10">
          <PrimaryCta
            onClick={handleNext}
            disabled={!canProceed || submitting}
            variant={isLast ? 'done' : 'next'}
          >
            {submitting ? '儲存中…' : isLast ? '完成評估' : '下一題'}
          </PrimaryCta>
        </div>
      </div>
    </div>
  )
}
