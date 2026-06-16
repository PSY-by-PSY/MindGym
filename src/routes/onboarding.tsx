import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import LandingPage from '../components/pretest/IntroScreen'
import NarrativeQuiz from '../components/pretest/QuestionnaireScreen'
import InMindReportPage from '../components/pretest/ResultsScreen'
import type { NarrativeAnswers, InMindReport } from '../components/pretest/types'
import { reconstructReportFromScores } from '../lib/reconstructReport'
import { track } from '../lib/analytics'

// ── Route ─────────────────────────────────────────────────────────────────

type OnboardingSearch = { reassess?: boolean; showResult?: boolean }

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
      .select('p_score, e_score, r_score, m_score, a_score, report_json')
      .eq('user_id', context.session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return { latestReport: null }
    if (data.report_json) return { latestReport: data.report_json as InMindReport }
    return { latestReport: reconstructReportFromScores(data) }
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
  const [elapsed, setElapsed] = useState(0)
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    frameRef.current = setInterval(
      () => setPhase((p) => (p + 1) % SCORING_PHASES.length),
      1400,
    )
    elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => {
      if (frameRef.current) clearInterval(frameRef.current)
      if (elapsedRef.current) clearInterval(elapsedRef.current)
    }
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
      <div style={{ fontSize: 12, color: '#959595' }}>
        {elapsed < 12
          ? '大約再等 10 秒…'
          : elapsed < 35
          ? 'AI 正在深度思考，快好了…'
          : '伺服器剛喚醒中，再給一點時間 ☕'}
      </div>
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

function ErrorScreen({ isTimeout, onRetry }: { isTimeout: boolean; onRetry: () => void }) {
  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        background: '#fff',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>{isTimeout ? '☕' : '😓'}</div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: '#151515',
          marginBottom: 10,
          letterSpacing: -0.2,
        }}
      >
        {isTimeout ? '伺服器剛睡醒了' : '出了點小狀況'}
      </div>
      <div style={{ fontSize: 14, color: '#666', lineHeight: 1.6, marginBottom: 32, maxWidth: 280 }}>
        {isTimeout
          ? '已成功喚醒伺服器，再試一次通常就能順利完成。'
          : '網路或 AI 服務暫時有問題，稍後再試試看。'}
      </div>
      <button
        onClick={onRetry}
        style={{
          background: '#E26D5C',
          color: '#fff',
          border: 'none',
          borderRadius: 100,
          padding: '14px 40px',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: 0.4,
        }}
      >
        重新嘗試
      </button>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

type InMindScreen = 'intro' | 'quiz' | 'loading' | 'report' | 'error'

function OnboardingPage() {
  const { session } = Route.useRouteContext()
  const { reassess, showResult } = Route.useSearch()
  const { latestReport } = Route.useLoaderData()
  const navigate = useNavigate()

  const [screen, setScreen] = useState<InMindScreen>(showResult && latestReport ? 'report' : 'intro')
  const [answers, setAnswers] = useState<NarrativeAnswers>({ P: '', E: '', R: '', M: '', A: '' })
  const [report, setReport] = useState<InMindReport | null>(latestReport ?? null)
  const [apiError, setApiError] = useState('')
  const [isTimeoutError, setIsTimeoutError] = useState(false)

  async function handleSubmit(finalAnswers: NarrativeAnswers) {
    setAnswers(finalAnswers)
    setScreen('loading')
    setApiError('')
    setIsTimeoutError(false)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 90_000)
    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
      const res = await fetch(`${apiUrl}/api/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify(finalAnswers),
        signal: controller.signal,
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
      setReport(data)
      setScreen('report')
      track('quiz_completed', {
        reassess: Boolean(reassess),
        total_score: data.total_score,
        body_type: data.body_type_label,
      })
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'AbortError'
      setIsTimeoutError(timedOut)
      setApiError(timedOut ? 'TIMEOUT' : (err instanceof Error ? err.message : '未知錯誤'))
      setScreen('error')
    } finally {
      clearTimeout(timer)
    }
  }

  function handleComplete() {
    navigate({ to: (reassess || showResult) ? '/app/home' : '/app/gratitude' })
  }

  if (screen === 'intro') {
    return (
      <div className="mx-auto max-w-[430px]">
        <LandingPage
          onStart={() => {
            track('quiz_started', { reassess: Boolean(reassess) })
            setScreen('quiz')
          }}
          onGoHome={reassess || showResult ? () => navigate({ to: '/app/home' }) : undefined}
        />
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

  if (screen === 'error') {
    return (
      <div className="mx-auto max-w-[430px]">
        <ErrorScreen
          isTimeout={isTimeoutError}
          onRetry={() => handleSubmit(answers)}
        />
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
