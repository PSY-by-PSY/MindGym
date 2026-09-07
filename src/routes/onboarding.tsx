import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import LandingPage from '../components/pretest/IntroScreen'
import NarrativeQuiz from '../components/pretest/QuestionnaireScreen'
import InMindReportPage from '../components/pretest/ResultsScreen'
import type { NarrativeAnswers, InMindReport } from '../components/pretest/types'
import { reconstructReportFromScores } from '../lib/reconstructReport'
import { track } from '../lib/analytics'
import { useStageBack } from '../lib/useStageBack'
import { markOnboardingSkipped } from '../lib/onboardingSkip'
import { useLanguage } from '../lib/i18n/context'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'
import { useGlobalKeyboard } from '../lib/keyboard'
import { clearQuizDraft, loadQuizDraft, quizDraftKey, saveQuizDraft } from '../lib/quizDraft'
import { PaywallScreen } from '../components/paywall/PaywallScreen'

// ── Route ─────────────────────────────────────────────────────────────────

type OnboardingSearch = { reassess?: boolean; showResult?: boolean }

// 撈使用者最近一次的基線報告。報告本體（report_json）就存在 perma_scores 裡，
// 撈不到完整 json 時用分數重建。loader 與「額度用完」的處理都用這支。
async function fetchLatestReport(userId: string): Promise<InMindReport | null> {
  const { data } = await supabase
    .from('perma_scores')
    .select('p_score, e_score, r_score, m_score, a_score, report_json')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  if (data.report_json) return data.report_json as InMindReport
  return reconstructReportFromScores(data)
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
    return { latestReport: await fetchLatestReport(context.session.user.id) }
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
  const { t } = useLanguage()
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
        {t(SCORING_PHASES[phase])}
      </div>
      <div style={{ fontSize: 12, color: '#959595' }}>
        {elapsed < 12
          ? t('大約再等 10 秒…')
          : elapsed < 35
          ? t('AI 正在深度思考，快好了…')
          : t('伺服器剛喚醒中，再給一點時間')}
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

function WakeUpIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2M9 2h6" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l9.5 17H2.5z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  )
}

function ErrorScreen({
  isTimeout,
  onRetry,
  onBackToAnswers,
}: {
  isTimeout: boolean
  onRetry: () => void
  onBackToAnswers: () => void
}) {
  const { t } = useLanguage()
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
      <div style={{ marginBottom: 16, color: '#E26D5C' }}>
        {isTimeout ? <WakeUpIcon /> : <AlertIcon />}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: '#151515',
          marginBottom: 10,
          letterSpacing: -0.2,
        }}
      >
        {isTimeout ? t('伺服器剛睡醒了') : t('出了點小狀況')}
      </div>
      <div style={{ fontSize: 14, color: '#666', lineHeight: 1.6, marginBottom: 32, maxWidth: 280 }}>
        {isTimeout
          ? t('已成功喚醒伺服器，再試一次通常就能順利完成。')
          : t('網路或 AI 服務暫時有問題，稍後再試試看。')}
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
        {t('重新嘗試')}
      </button>
      {/* 失敗最讓人心痛的不是重試，是以為五題白填了。這裡明講答案還在，
          並且留一個「回去看答案」的出口（回到最後一題，可前後翻閱修改）。 */}
      <button
        onClick={onBackToAnswers}
        style={{
          marginTop: 14,
          background: 'transparent',
          color: '#666',
          border: 'none',
          padding: '8px 12px',
          fontSize: 13.5,
          fontWeight: 600,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        {t('回去看我的答案')}
      </button>
      <div style={{ marginTop: 16, fontSize: 12.5, color: '#959595', maxWidth: 280, lineHeight: 1.6 }}>
        {t('你剛剛填的內容都已經保留，重試不會清空。')}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

type InMindScreen = 'intro' | 'quiz' | 'loading' | 'report' | 'error'

function OnboardingPage() {
  const { t } = useLanguage()
  // 全站鍵盤行為（規格 [2][5]）：點空白處收鍵盤、鍵盤彈出時管理 --keyboard-height 並捲動輸入框。
  // onboarding 是獨立於 /app 的路由，過去沒掛這個 hook，導致 InMind 測驗輸入框被鍵盤蓋住。
  useGlobalKeyboard()
  const { session } = Route.useRouteContext()
  const { reassess, showResult } = Route.useSearch()
  const { latestReport } = Route.useLoaderData()
  const navigate = useNavigate()

  // 測驗草稿：作答只放在 React state 的話，AI 失敗後返回、App 被系統回收或
  // WebView 重載，五題長文就全沒了。改成隨打隨存 localStorage（見 lib/quizDraft）。
  const draftKey = quizDraftKey(session?.user?.id)
  const [draft] = useState(() => loadQuizDraft(draftKey))

  const [screen, setScreen] = useState<InMindScreen>(showResult && latestReport ? 'report' : 'intro')
  const [answers, setAnswers] = useState<NarrativeAnswers>(
    draft?.answers ?? { P: '', E: '', R: '', M: '', A: '' },
  )
  const [report, setReport] = useState<InMindReport | null>(latestReport ?? null)
  const [apiError, setApiError] = useState('')
  const [isTimeoutError, setIsTimeoutError] = useState(false)
  // 規格 Day 0：基線報告看完後自然接到付費牆。重測／回看舊報告不再出現。
  const [showPaywall, setShowPaywall] = useState(false)

  // 測驗不再強制：進行到一半也能由左往右滑或按返回鍵放棄，退回到可以「跳過測驗」的入口頁。
  const triggerBack = useStageBack(screen, (s) => s !== 'quiz', () => setScreen('intro'))

  function handleSkip() {
    markOnboardingSkipped()
    navigate({ to: '/app/home' })
  }

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
      // 402 = 後端 _check_baseline_assessment_quota 擋下「免費層重測」。
      // 這不是故障：規格 §2 免費層基線檢測限 1 次，第二次起要付費。
      // 若不在這裡攔，會掉進下面的 throw，錯誤頁顯示「網路或 AI 服務暫時有問題」——
      // 使用者按重試永遠是同一個 402，看起來就像測驗壞掉（2026-08-29 的實際災情）。
      if (res.status === 402) {
        setScreen('quiz')  // 保留作答，付費牆疊在上面
        setShowPaywall(true)
        return
      }
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
      setReport(data)
      setScreen('report')
      clearQuizDraft(draftKey)
      track('quiz_completed', {
        reassess: Boolean(reassess),
        total_score: data.total_score,
        body_type: data.body_type_label,
      })
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'AbortError'
      setIsTimeoutError(timedOut)
      setApiError(timedOut ? 'TIMEOUT' : (err instanceof Error ? err.message : t('未知錯誤')))
      setScreen('error')
    } finally {
      clearTimeout(timer)
    }
  }

  // 第一次做完檢測 → 先看付費牆（規格 Day 0：報告結尾自然接到付費牆）。
  // 重測或回看舊報告的情境維持原行為，不打擾已經看過的人。
  function handleComplete() {
    if (reassess || showResult) {
      navigate({ to: '/app/home' })
      return
    }
    setShowPaywall(true)
  }

  // 付費牆關閉（✕ 或「先自己逛逛」）後，continue 到原本的目的地。
  function handlePaywallDismiss() {
    setShowPaywall(false)
    navigate({ to: '/app/gratitude' })
  }

  let content: ReactNode

  if (screen === 'intro') {
    content = (
      <LandingPage
        onStart={() => {
          track('quiz_started', { reassess: Boolean(reassess) })
          setScreen('quiz')
        }}
        onSkip={() => {
          track('quiz_skipped', { reassess: Boolean(reassess) })
          handleSkip()
        }}
      />
    )
  } else if (screen === 'loading') {
    content = <LoadingScreen />
  } else if (screen === 'error') {
    content = (
      <ErrorScreen
        isTimeout={isTimeoutError}
        onRetry={() => handleSubmit(answers)}
        onBackToAnswers={() => setScreen('quiz')}
      />
    )
  } else if (screen === 'report' && report) {
    content = (
      <InMindReportPage
        report={report}
        onRestart={() => {
          clearQuizDraft(draftKey)
          setAnswers({ P: '', E: '', R: '', M: '', A: '' })
          setReport(null)
          setScreen('intro')
        }}
        onComplete={handleComplete}
        onGoHome={() => navigate({ to: '/app/home' })}
      />
    )
  } else {
    // quiz（含 API 錯誤後返回）
    content = (
      <NarrativeQuiz
        initialAnswers={answers}
        initialStep={draft?.step ?? 0}
        startAtLast={apiError !== ''}
        apiError={apiError}
        onSubmit={handleSubmit}
        onDraftChange={(next) => {
          // 父層也同步一份，錯誤畫面的「重新嘗試」才會送出最新的作答。
          setAnswers(next.answers)
          saveQuizDraft(draftKey, next)
        }}
        onExit={triggerBack}
      />
    )
  }

  return (
    <div className="mx-auto max-w-[430px]">
      {/* 外層 frame-width：把語言鈕收進手機外框的欄位（詳見 index.css 的
          .frame-width 說明）。App 版這層就是整個螢幕寬，位置沒有變。 */}
      <div className="frame-width pointer-events-none fixed inset-x-0 top-0 z-40">
        <LanguageSwitcherCompact className="pointer-events-auto absolute right-4 top-[calc(env(safe-area-inset-top)+0.75rem)]" />
      </div>
      {content}
      {/* 基線報告看完 → 付費牆（規格 Day 0）。帶入剛算出的 PERMA 分數做個人化標頭。 */}
      {showPaywall && (
        <PaywallScreen
          source="onboarding"
          scores={report?.scores ?? null}
          onDismiss={handlePaywallDismiss}
        />
      )}
    </div>
  )
}
