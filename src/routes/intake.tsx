import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import { useLanguage } from '../lib/i18n/context'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'
import { markIntakeDone } from '../lib/intakeDone'
import { markOnboardingSkipped } from '../lib/onboardingSkip'
import {
  EMPTY_INTAKE_ANSWERS,
  INTAKE_QUESTIONS,
  answersToRow,
  suggestFirstPractice,
  type IntakeAnswers,
  type IntakeQuestion,
} from '../lib/intake'

// ── Route ───────────────────────────────────────────────────────────────────
// 入門偏好問卷：歡迎導覽之後、InMind 測驗之前的 6 題點選（不到一分鐘）。
// 問「為什麼來、想要什麼、能給多少」，答完馬上給一個「先幫你排了…」的練習。
// /app/home 的 beforeLoad 依 user_intake／hasIntakeDone() 決定要不要導來這裡；
// 直接開這個網址永遠會重新作答（方便日後「重新填寫」入口與測試）。
// 設計理由與參考對象見 docs/plans/intake_persona_survey_plan.md。
export const Route = createFileRoute('/intake')({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
  },
  component: IntakePage,
})

type Stage = 'quiz' | 'arranging' | 'done'

const SINGLE_SELECT_ADVANCE_MS = 260
const ARRANGING_MS = 1500

function IntakePage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { session } = Route.useRouteContext()

  const total = INTAKE_QUESTIONS.length
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<IntakeAnswers>(EMPTY_INTAKE_ANSWERS)
  const [stage, setStage] = useState<Stage>('quiz')
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const question = INTAKE_QUESTIONS[index]
  const selected = answers[question.key]
  const isLast = index === total - 1

  useEffect(() => {
    track('intake_started')
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
    }
  }, [])

  // ── 作答 ──────────────────────────────────────────────────────────────
  const toggle = (q: IntakeQuestion, value: string) => {
    const current = answers[q.key]
    let next: string[]
    if (!q.multi) {
      next = [value]
    } else if (current.includes(value)) {
      next = current.filter((v) => v !== value)
    } else if (q.exclusive && value === q.exclusive) {
      next = [value] // 「沒特別做過」與其他互斥
    } else {
      const base = q.exclusive ? current.filter((v) => v !== q.exclusive) : current
      if (q.max && base.length >= q.max) return // 到上限就不再加
      next = [...base, value]
    }
    setAnswers((prev) => ({ ...prev, [q.key]: next }))

    // 單選：點了就自動往下一題，跟 BetterMe／Nüli 的手感一樣
    if (!q.multi) {
      track('intake_question_answered', { question: q.key, value })
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      advanceTimer.current = setTimeout(() => goNext({ ...answers, [q.key]: next }), SINGLE_SELECT_ADVANCE_MS)
    }
  }

  const goNext = (latest: IntakeAnswers = answers) => {
    if (question.multi) {
      track('intake_question_answered', { question: question.key, value: latest[question.key] })
    }
    if (isLast) {
      finish(latest)
      return
    }
    setIndex((i) => Math.min(total - 1, i + 1))
  }

  const goBack = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    setIndex((i) => Math.max(0, i - 1))
  }

  // 「先跳過」= 這一題不作答，往下一題；最後一題跳過就直接完成。
  const skipQuestion = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    const cleared: IntakeAnswers = { ...answers, [question.key]: [] }
    setAnswers(cleared)
    if (isLast) finish(cleared)
    else setIndex((i) => i + 1)
  }

  // ── 完成：寫入 user_intake → 過場 → 完成頁 ───────────────────────────
  const finish = async (finalAnswers: IntakeAnswers) => {
    setStage('arranging')
    const row = answersToRow(finalAnswers)
    const practice = suggestFirstPractice(finalAnswers)
    const skippedCount = INTAKE_QUESTIONS.filter((q) => finalAnswers[q.key].length === 0).length

    // 本機 flag 先記，資料表還沒建好或離線時流程也不會卡在這一頁。
    markIntakeDone()
    if (row.skipped) {
      track('intake_skipped', { at_question: question.key })
    } else {
      track('intake_completed', {
        ...row,
        skipped_count: skippedCount,
        first_practice: practice.key,
      })
    }

    const started = Date.now()
    if (session) {
      const { error } = await supabase
        .from('user_intake')
        .upsert({ user_id: session.user.id, ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) console.warn('[intake] save failed:', error.message)
    }
    // 過場至少停 ARRANGING_MS，讓「正在為你安排」看得到（BetterMe 的 analyzing 過場）。
    const remain = ARRANGING_MS - (Date.now() - started)
    setTimeout(() => setStage('done'), Math.max(0, remain))
  }

  // ── 完成頁的兩條路 ────────────────────────────────────────────────────
  const startInMind = () => navigate({ to: '/onboarding' })
  const skipToPractice = () => {
    const practice = suggestFirstPractice(answers)
    markOnboardingSkipped()
    track('quiz_skipped', { reassess: false, from: 'intake' })
    navigate({ to: practice.to })
  }

  if (stage === 'arranging') return <ArrangingScreen />
  if (stage === 'done') {
    return <DoneScreen answers={answers} onStart={startInMind} onSkip={skipToPractice} />
  }

  const canNext = selected.length > 0

  return (
    <div className="relative mx-auto flex h-[100dvh] max-w-[430px] flex-col overflow-hidden bg-background">
      {/* 頂部：分段進度條（沿用 /welcome）+ 上一題 / 先跳過 */}
      <div className="relative z-30 px-5 pt-[calc(env(safe-area-inset-top)+0.9rem)]">
        <div className="flex items-center gap-1.5">
          {INTAKE_QUESTIONS.map((q, i) => (
            <span key={q.key} className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
              <span
                className="block h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: i <= index ? '100%' : '0%',
                  background: 'var(--foreground)',
                  opacity: i < index ? 0.35 : 1,
                }}
              />
            </span>
          ))}
        </div>
        <div className="mt-2 flex h-6 items-center justify-between">
          <button
            onClick={goBack}
            disabled={index === 0}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground/70 transition active:scale-95 disabled:invisible"
          >
            <ArrowLeft />
            {t('上一題')}
          </button>
          <span className="font-en text-[11px] font-bold tracking-[0.2em] text-muted-foreground">
            {index + 1} / {total}
          </span>
          <div className="flex items-center gap-3">
            <LanguageSwitcherCompact />
            <button
              onClick={skipQuestion}
              className="text-xs font-semibold text-muted-foreground/70 transition active:scale-95"
            >
              {t('先跳過')}
            </button>
          </div>
        </div>
      </div>

      {/* 題目（切題時 key 改變 → 重播進場動畫） */}
      <div key={question.key} className="flex-1 overflow-y-auto px-6 pb-4 pt-6">
        <span
          className="animate-fade-up inline-block rounded-full bg-primary/20 px-3.5 py-1.5 text-[11px] font-black tracking-[0.18em] text-primary"
          style={{ animationDelay: '0.05s' }}
        >
          {t('認識你')}
        </span>
        <h1
          className="animate-fade-up mt-4 text-[26px] font-black leading-[1.3] tracking-[-0.01em] text-foreground"
          style={{ animationDelay: '0.12s' }}
        >
          {t(question.title)}
        </h1>
        {question.hint && (
          <p className="animate-fade-up mt-2 text-[13px] text-muted-foreground" style={{ animationDelay: '0.18s' }}>
            {t(question.hint)}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {question.options.map((opt, i) => {
            const on = selected.includes(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggle(question, opt.value)}
                aria-pressed={on}
                className="animate-fade-up flex min-h-[58px] w-full items-center justify-between rounded-2xl border-2 px-5 py-3 text-left text-[16px] font-bold transition active:scale-[0.98]"
                style={{
                  animationDelay: `${0.2 + i * 0.04}s`,
                  borderColor: on ? '#292F56' : 'rgba(41,47,86,0.12)',
                  background: on ? '#292F56' : '#fff',
                  color: on ? '#fff' : 'var(--foreground)',
                }}
              >
                <span>{t(opt.label)}</span>
                {question.multi && (
                  <span
                    aria-hidden
                    className="ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2"
                    style={{ borderColor: on ? '#fff' : 'rgba(41,47,86,0.25)', background: on ? '#fff' : 'transparent' }}
                  >
                    {on && <Check />}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {index === 0 && (
          <p className="animate-fade-up mt-6 text-center text-[12px] leading-relaxed text-muted-foreground/80" style={{ animationDelay: '0.5s' }}>
            {t('這些答案只用來安排你的練習，不會公開。')}
          </p>
        )}
      </div>

      {/* 多選題才需要底部「下一步」；單選點了就自動往下 */}
      {question.multi && (
        <div className="relative z-30 px-6 pb-[calc(env(safe-area-inset-bottom)+1.4rem)] pt-2">
          <button
            onClick={() => goNext()}
            disabled={!canNext}
            className="flex h-16 w-full items-center justify-center gap-2 rounded-full text-lg font-extrabold tracking-wide text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-40"
            style={{ background: 'var(--primary)' }}
          >
            {t('下一步')}
            <ArrowRight />
          </button>
        </div>
      )}
    </div>
  )
}

// ── 過場：正在為你安排 ───────────────────────────────────────────────────────

function ArrangingScreen() {
  const { t } = useLanguage()
  return (
    <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col items-center justify-center bg-background px-6">
      <div className="relative mb-6 h-40 w-40">
        <div
          className="absolute inset-0 rounded-full border-2 border-dashed border-foreground/10"
          style={{ animation: 'spin360 12s linear infinite' }}
        />
        <img
          src="/assets/bagel.png"
          alt=""
          className="absolute inset-3 h-[136px] w-[136px] object-contain"
          style={{ animation: 'pulse 1.6s ease-in-out infinite', filter: 'drop-shadow(0 8px 16px rgba(201,148,99,.3))' }}
        />
      </div>
      <div className="text-lg font-extrabold text-foreground">{t('正在為你安排…')}</div>
    </div>
  )
}

// ── 完成頁：你告訴我們… → 先幫你排了… ─────────────────────────────────────────

function DoneScreen({
  answers,
  onStart,
  onSkip,
}: {
  answers: IntakeAnswers
  onStart: () => void
  onSkip: () => void
}) {
  const { t } = useLanguage()
  const practice = suggestFirstPractice(answers)

  // 摘要 chips：把使用者選過的「議題」與「目標」原樣回放，讓人感覺有被聽到。
  const chips = INTAKE_QUESTIONS.filter((q) => q.key === 'issues' || q.key === 'goal').flatMap((q) =>
    q.options.filter((o) => answers[q.key].includes(o.value)).map((o) => t(o.label)),
  )
  const needsSupport = answers.load[0] === 'hard'

  return (
    <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col bg-background">
      <div className="flex flex-1 flex-col items-center justify-center px-7 pt-[calc(env(safe-area-inset-top)+1rem)] text-center">
        <img
          src="/assets/bagel.png"
          alt=""
          className="animate-float h-32 w-32 object-contain"
          style={{ filter: 'drop-shadow(0 14px 22px rgba(40,24,12,0.16))' }}
        />
        <h1 className="animate-fade-up mt-6 text-[28px] font-black leading-[1.28] text-foreground" style={{ animationDelay: '0.1s' }}>
          {t('為你安排好了')}
        </h1>

        {chips.length > 0 && (
          <div className="animate-fade-up mt-5 w-full" style={{ animationDelay: '0.2s' }}>
            <div className="text-[12px] font-bold tracking-[0.12em] text-muted-foreground">{t('你告訴我們：')}</div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {chips.map((c) => (
                <span key={c} className="rounded-full border border-foreground/15 bg-white px-3 py-1.5 text-[13px] font-bold text-foreground">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="animate-fade-up mx-auto mt-6 max-w-[20rem] text-[15px] leading-relaxed text-foreground-soft" style={{ animationDelay: '0.3s' }}>
          {t('我們先幫你排了「{practice}」。接下來 5 題 InMind 測驗，會讓安排更準。', { practice: t(practice.name) })}
        </p>

        {needsSupport && (
          <p
            className="animate-fade-up mt-5 rounded-2xl border border-[#E26D5C]/30 bg-[#E26D5C]/10 px-4 py-3 text-[13px] leading-relaxed text-foreground"
            style={{ animationDelay: '0.4s' }}
          >
            {t('如果此刻真的很難撐，你不用一個人扛：安心專線 1925（24 小時）、生命線 1995 都在。')}
          </p>
        )}
      </div>

      <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+1.4rem)] pt-2">
        <button
          onClick={onStart}
          className="flex h-16 w-full items-center justify-center gap-2 rounded-full text-lg font-extrabold tracking-wide text-white shadow-soft transition active:scale-[0.98]"
          style={{ background: '#292F56' }}
        >
          {t('開始 InMind 測驗')}
          <ArrowRight />
        </button>
        <button
          onClick={onSkip}
          className="mt-3 flex h-12 w-full items-center justify-center text-[14px] font-bold text-muted-foreground transition active:scale-95"
        >
          {t('先跳過，直接練習')}
        </button>
      </div>
    </div>
  )
}

// ── Icons ───────────────────────────────────────────────────────────────────

function ArrowRight() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function ArrowLeft() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  )
}

function Check() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="#292F56" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l4 4L19 7" />
    </svg>
  )
}
