import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import LandingPage from '../components/pretest/IntroScreen'
import NarrativeQuiz from '../components/pretest/QuestionnaireScreen'
import InMindReportPage from '../components/pretest/ResultsScreen'
import type { NarrativeAnswers, InMindReport } from '../components/pretest/types'

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
  const { reassess } = Route.useSearch()
  const navigate = useNavigate()

  const [screen, setScreen] = useState<InMindScreen>('intro')
  const [answers, setAnswers] = useState<NarrativeAnswers>({ P: '', E: '', R: '', M: '', A: '' })
  const [report, setReport] = useState<InMindReport | null>(null)
  const [apiError, setApiError] = useState('')

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
    navigate({ to: reassess ? '/app/home' : '/app/gratitude' })
  }

  if (screen === 'intro') {
    return <LandingPage onStart={() => setScreen('quiz')} />
  }

  if (screen === 'loading') {
    return <LoadingScreen />
  }

  if (screen === 'report' && report) {
    return (
      <InMindReportPage
        report={report}
        onRestart={() => {
          setAnswers({ P: '', E: '', R: '', M: '', A: '' })
          setReport(null)
          setScreen('intro')
        }}
        onComplete={handleComplete}
      />
    )
  }

  // quiz（含 API 錯誤後返回）
  return (
    <NarrativeQuiz
      initialAnswers={answers}
      startAtLast={apiError !== ''}
      apiError={apiError}
      onSubmit={handleSubmit}
    />
  )
}
