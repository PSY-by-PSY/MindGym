import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

// ── PERMA 問卷資料 ─────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    key: 'p' as const,
    dimension: 'P',
    label: '正向情緒',
    color: 'bg-purple-100 text-purple-600',
    question: '一般而言，你感到滿足的程度是？',
  },
  {
    key: 'e' as const,
    dimension: 'E',
    label: '全心投入',
    color: 'bg-blue-100 text-blue-600',
    question: '一般而言，在事物上你感到興奮和有趣的程度是？',
  },
  {
    key: 'r' as const,
    dimension: 'R',
    label: '與他人關係',
    color: 'bg-pink-100 text-pink-600',
    question: '你對自己的人際關係感到滿意的程度是？',
  },
  {
    key: 'm' as const,
    dimension: 'M',
    label: '生活意義',
    color: 'bg-green-100 text-green-600',
    question: '你通常覺得自己生活有價值且值得的程度是？',
  },
  {
    key: 'a' as const,
    dimension: 'A',
    label: '成就感',
    color: 'bg-orange-100 text-orange-600',
    question: '有多少的時間你認為自己正在往要完成的目標前進？',
  },
] as const

const OPTION_LABELS = ['非常不同意', '不同意', '普通', '同意', '非常同意']

// ── Route ─────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
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

// ── Component ─────────────────────────────────────────────────────────────

function OnboardingPage() {
  const { session } = Route.useRouteContext()
  const navigate = useNavigate()

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

  const progress = ((step + (selected !== null ? 1 : 0)) / QUESTIONS.length) * 100

  return (
    <div className="flex min-h-screen flex-col bg-[#fafaf9] px-5 pb-10 pt-12">
      {/* 頂部 Header */}
      <div className="mb-8">
        <p className="mb-1 text-sm font-medium text-gray-400">
          問題 {step + 1} / {QUESTIONS.length}
        </p>
        {/* 進度條 */}
        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-[#6366f1] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 維度標籤 */}
      <div className={`mb-4 inline-flex w-fit items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold ${current.color}`}>
        <span className="text-base font-bold">{current.dimension}</span>
        {current.label}
      </div>

      {/* 問題 */}
      <h2 className="mb-10 text-xl font-bold leading-snug text-gray-900">
        {current.question}
      </h2>

      {/* 選項 */}
      <div className="flex flex-1 flex-col gap-3">
        {OPTION_LABELS.map((label, idx) => {
          const value = idx + 1
          const isSelected = selected === value
          return (
            <button
              key={value}
              onClick={() => choose(value)}
              className={`flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-all active:scale-[0.98] ${
                isSelected
                  ? 'border-[#6366f1] bg-[#6366f1] text-white shadow-md'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-[#6366f1]/40'
              }`}
            >
              <span className={`text-lg font-bold ${isSelected ? 'text-white/70' : 'text-gray-300'}`}>
                {value}
              </span>
              <span className="font-medium">{label}</span>
            </button>
          )
        })}
      </div>

      {/* 錯誤訊息 */}
      {error && (
        <p className="mt-4 text-center text-sm text-red-500">{error}</p>
      )}

      {/* 導航按鈕 */}
      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={submitting}
            className="flex-1 rounded-2xl border-2 border-gray-200 bg-white py-4 font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            ← 上一題
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={!canProceed || submitting}
          className="flex-[2] rounded-2xl bg-[#6366f1] py-4 font-semibold text-white shadow-md transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? '儲存中…' : isLast ? '完成評估 ✓' : '下一題 →'}
        </button>
      </div>
    </div>
  )
}
