import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import LandingPage from '../components/pretest/IntroScreen'
import NarrativeQuiz from '../components/pretest/QuestionnaireScreen'
import InMindReportPage from '../components/pretest/ResultsScreen'
import type { NarrativeAnswers, InMindReport } from '../components/pretest/types'

// ── Route ─────────────────────────────────────────────────────────────────

type OnboardingSearch = { reassess?: boolean; showResult?: boolean }

function buildReportFromScores(row: {
  p_score: number; e_score: number; r_score: number; m_score: number; a_score: number
}): import('../components/pretest/types').InMindReport {
  const scores = { P: row.p_score, E: row.e_score, R: row.r_score, M: row.m_score, A: row.a_score }
  const vals = Object.values(scores) as number[]
  const total_score = vals.reduce((s, v) => s + v, 0)
  const max_dim = (Object.entries(scores) as [import('../components/pretest/types').DimensionKey, number][])
    .reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  const min_dim = (Object.entries(scores) as [import('../components/pretest/types').DimensionKey, number][])
    .reduce((a, b) => (b[1] < a[1] ? b : a))[0]
  const delta = scores[max_dim] - scores[min_dim]
  const body_type: 'C' | 'I' | 'D' = total_score >= 20 ? 'D' : total_score >= 14 ? 'I' : 'C'
  const empty_analysis = { score_reason: '', comment: '', exercise_suggestion: '' }
  return {
    scores,
    individual_analysis: { P: empty_analysis, E: empty_analysis, R: empty_analysis, M: empty_analysis, A: empty_analysis },
    total_score,
    body_type,
    body_type_label: body_type === 'D' ? '貝果' : body_type === 'I' ? '吐司' : '棉花糖',
    body_type_context: '',
    balance: {
      max_dim, min_dim, delta,
      level: delta <= 1 ? 'balanced' : delta <= 2 ? 'moderate' : 'unbalanced',
      assessment: '', advice: '',
    },
    percentile: { general: 0, youth: 0 },
    summary_sentence: '',
    celeb_match: { name: '', archetype: '', description: '', reason: '' },
    constitution_advice: { weak_dim: '', short_term_plan: '', long_term_plan: '', daily_practice: '' },
    advanced_analysis: { complementary_dim: '', synergy_explanation: '', next_step_action: '', partnership_profile: '' },
    take_action: { daily_habit: '', after_3_days: '', after_1_week: '', after_2_weeks: '', after_1_month: '' },
  }
}

export const Route = createFileRoute('/onboarding')({
  validateSearch: (search: Record<string, unknown>): OnboardingSearch => ({
    ...(search.reassess === true || search.reassess === 'true' ? { reassess: true } : {}),
    ...(search.showResult === true || search.showResult === 'true' ? { showResult: true } : {}),
  }),
  beforeLoad: async ({ context, search }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
    if (search.reassess || search.showResult) return
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
  loaderDeps: ({ search }) => ({ showResult: search.showResult }),
  loader: async ({ context, deps }) => {
    if (!deps.showResult || !context.session) return { latestReport: null }
    const { data } = await supabase
      .from('perma_scores')
      .select('p_score, e_score, r_score, m_score, a_score')
      .eq('user_id', context.session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return { latestReport: null }
    return { latestReport: buildReportFromScores(data) }
  },
  component: OnboardingPage,
})

// ── Loading Screen ─────────────────────────────────────────────────────────

const SCORING_PHASES = [
  '正在閱讀你的回答…',
  '分析情緒語意…',
  '對照 PERMA 模型…',
  '生成你的報告…',
]

function LoadingScreen() {
  const [phase, setPhase] = useState(0)
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    frameRef.current = setInterval(
      () => setPhase((p) => (p + 1) % SCORING_PHASES.length),
      1400,
    )
    return () => { if (frameRef.current) clearInterval(frameRef.current) }
  }, [])

  return (
    <div
      className="screen-enter"
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#fff',
      }}
    >
      <div style={{ position: 'relative', width: 160, height: 160, marginBottom: 24 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '2px dashed #EAEAEA',
            animation: 'spin360 12s linear infinite',
          }}
        />
        <img
          src="/assets/bagel.png"
          alt=""
          style={{
            position: 'absolute',
            inset: 14,
            width: 132,
            height: 132,
            objectFit: 'contain',
            animation: 'pulse 1.6s ease-in-out infinite',
            filter: 'drop-shadow(0 8px 16px rgba(201,148,99,.3))',
          }}
        />
      </div>
      <div
        style={{
          fontSize: 11,
          fontFamily: 'Inter',
          fontWeight: 700,
          letterSpacing: 1.6,
          color: '#E26D5C',
          marginBottom: 8,
        }}
      >
        ANALYZING · PERMA
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: -0.2,
          color: '#151515',
          marginBottom: 6,
        }}
      >
        {SCORING_PHASES[phase]}
      </div>
      <div style={{ fontSize: 12, color: '#959595' }}>大約再等 10 秒…</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 24 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#E26D5C',
              animation: `pulse 1.4s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

type InMindScreen = 'intro' | 'quiz' | 'loading' | 'report'

function OnboardingPage() {
  const { session } = Route.useRouteContext()
  const { reassess, showResult } = Route.useSearch()
  const { latestReport } = Route.useLoaderData()
  const navigate = useNavigate()

  const [screen, setScreen] = useState<InMindScreen>(showResult && latestReport ? 'report' : 'intro')
  const [answers, setAnswers] = useState<NarrativeAnswers>({ P: '', E: '', R: '', M: '', A: '' })
  const [report, setReport] = useState<InMindReport | null>(latestReport ?? null)
  const [apiError, setApiError] = useState('')

  // 4B: 立即儲存 — 當 report 出現時寫入 inmind_sessions，不等使用者按按鈕
  useEffect(() => {
    if (screen !== 'report' || !session) return
    supabase.from('inmind_sessions').insert({ user_id: session.user.id }).then(() => {})
  }, [screen, session])

  async function handleSubmit(finalAnswers: NarrativeAnswers) {
    setAnswers(finalAnswers)
    setScreen('loading')
    setApiError('')
    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
      const res = await fetch(`${apiUrl}/api/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify(finalAnswers),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
      setReport(data)
      setScreen('report')
    } catch (err) {
      setApiError(err instanceof Error ? err.message : '未知錯誤')
      setScreen('quiz')
    }
  }

  function handleComplete() {
    navigate({ to: (reassess || showResult) ? '/app/home' : '/app/gratitude' })
  }

  if (screen === 'intro') {
    return (
      <div className="mx-auto max-w-[430px]">
        <LandingPage onStart={() => setScreen('quiz')} />
      </div>
    )
  }

  if (screen === 'loading') {
    return (
      <div className="mx-auto max-w-[430px]">
        <LoadingScreen />
      </div>
    )
  }

  if (screen === 'report' && report) {
    return (
      <div className="mx-auto max-w-[430px]">
        <InMindReportPage
          report={report}
          onRestart={() => {
            setAnswers({ P: '', E: '', R: '', M: '', A: '' })
            setReport(null)
            setScreen('intro')
          }}
          onComplete={handleComplete}
          onGoHome={() => navigate({ to: '/app/home' })}
        />
      </div>
    )
  }

  // quiz（含 API 錯誤後返回）
  return (
    <div className="mx-auto max-w-[430px]">
      <NarrativeQuiz
        initialAnswers={answers}
        startAtLast={apiError !== ''}
        apiError={apiError}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
