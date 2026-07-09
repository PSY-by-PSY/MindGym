// 質性測驗播放器（個案端）：intro＋固定知情同意 → 一題一畫面作答 → 送出 → 雙版本結果。
// 危機判讀由後端同步跑（沿用 entry-safety-check 的兩層邏輯，嵌入 /api/pro/assessment-report）。
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { track } from '../../lib/analytics'
import { useLanguage } from '../../lib/i18n/context'
import { PrimaryCta } from '../PrimaryCta'
import VoiceInput from '../pretest/VoiceInput'
import { CrisisResourcesModal } from './CrisisResourcesModal'
import {
  getMyAssessmentResults,
  type AssessmentModuleContent,
  type AssessmentResultInfo,
} from '../../lib/proModules'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'
const DIM_COLORS = ['bg-tile-mint', 'bg-tile-blue', 'bg-tile-peach', 'bg-tile-pink', 'bg-tile-lemon']

type Stage = 'loading' | 'intro' | 'answering' | 'submitting' | 'result'

export function AssessmentPlayer({
  moduleId,
  estMinutes,
  content,
}: {
  moduleId: string
  estMinutes: number | null
  content: AssessmentModuleContent
}) {
  const { t } = useLanguage()
  const [stage, setStage] = useState<Stage>('loading')
  const [result, setResult] = useState<AssessmentResultInfo | null>(null)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showHint, setShowHint] = useState(false)
  const [showCrisis, setShowCrisis] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getMyAssessmentResults(moduleId).then((rows) => {
      if (cancelled) return
      if (rows.length > 0) {
        setResult(rows[0])
        setStage('result')
      } else {
        setStage('intro')
      }
    })
    return () => {
      cancelled = true
    }
  }, [moduleId])

  const startAnswering = () => {
    setAnswers({})
    setStep(0)
    setStage('answering')
    track('pro_assessment_started', { module_id: moduleId })
  }

  const question = content.questions[step]
  const dim = content.dimensions.find((d) => d.key === question?.dimension)
  const dimIndex = content.dimensions.findIndex((d) => d.key === question?.dimension)
  const isLast = step === content.questions.length - 1
  const currentText = question ? answers[question.id] ?? '' : ''

  const appendTranscript = (text: string) => {
    if (!question) return
    setAnswers((prev) => {
      const cur = prev[question.id] ?? ''
      const sep = cur && !/\s$/.test(cur) ? ' ' : ''
      return { ...prev, [question.id]: cur + sep + text }
    })
  }

  const submit = async () => {
    setStage('submitting')
    setSubmitError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(`${API_URL}/api/pro/assessment-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ module_id: moduleId, answers }),
      })
      if (!resp.ok) throw new Error(`assessment-report ${resp.status}`)
      const data = (await resp.json()) as {
        result_id: string
        status: 'pending_release' | 'released'
        client_report: AssessmentResultInfo['client_report']
        crisis: { risk: string }
      }
      track('pro_assessment_submitted', { module_id: moduleId })
      if (data.crisis?.risk && data.crisis.risk !== 'none') setShowCrisis(true)
      setResult({
        id: data.result_id,
        created_at: new Date().toISOString(),
        status: data.status,
        client_report: data.client_report,
      })
      setStage('result')
    } catch (e) {
      console.error('[assessment submit]', e)
      setSubmitError(t('送出失敗，請稍後再試一次。'))
      setStage('answering')
    }
  }

  if (stage === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (stage === 'intro') {
    return (
      <div className="animate-fade-up">
        {content.intro?.trim() && <p className="mb-4 text-[15px] leading-relaxed text-foreground-soft">{content.intro}</p>}
        {estMinutes != null && <p className="mb-4 text-sm text-muted-foreground">{t('約 {n} 分鐘', { n: estMinutes })}</p>}
        <div className="mb-6 rounded-2xl bg-tile-blue px-4 py-4">
          <p className="text-sm leading-relaxed text-foreground/85">{content.consent_text}</p>
        </div>
        <PrimaryCta onClick={startAnswering}>{t('我了解了，開始作答')}</PrimaryCta>
      </div>
    )
  }

  if (stage === 'submitting') {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-[15px] font-bold text-foreground">{t('正在為你整理…')}</p>
      </div>
    )
  }

  if (stage === 'result' && result) {
    return (
      <div className="animate-fade-up">
        {result.status === 'released' && result.client_report ? (
          <ClientReportView report={result.client_report} onRetake={startAnswering} />
        ) : (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-[15px] font-bold text-foreground">{t('你的專業夥伴確認後就會把結果傳給你')}</p>
            <p className="text-sm text-muted-foreground">{t('之後再回來看看，就會看到完整報告。')}</p>
            <button onClick={startAnswering} className="mt-2 text-sm font-bold text-primary">
              {t('重新測驗')}
            </button>
          </div>
        )}
        {showCrisis && <CrisisResourcesModal onClose={() => setShowCrisis(false)} />}
      </div>
    )
  }

  // stage === 'answering'
  if (!question) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t('這個模組還沒有任何題目。')}</p>
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${((step + 1) / content.questions.length) * 100}%` }}
        />
      </div>
      <p className="mb-2 text-xs font-bold text-muted-foreground">
        {step + 1} / {content.questions.length}
      </p>

      <div className={`mb-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${DIM_COLORS[Math.max(0, dimIndex) % DIM_COLORS.length]}`}>
        {dim?.name ?? question.dimension}
      </div>
      <p className="mt-2 text-lg font-black leading-snug text-foreground">{question.translated}</p>

      {question.hints.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowHint((s) => !s)}
            className="text-xs font-bold text-primary"
          >
            {showHint ? t('收起提示 ▴') : t('需要一點靈感？▾')}
          </button>
          {showHint && (
            <div className="mt-1.5 rounded-xl border border-dashed border-border bg-cream px-3 py-2 text-xs leading-relaxed text-foreground/75">
              {question.hints.map((h) => (
                <p key={h}>・{h}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {question.sensitive && (
        <p className="mt-2 rounded-xl bg-tile-pink px-3 py-2 text-xs font-bold text-rust">
          {t('若這個問題讓你感到沉重，你可以簡短回答，或先跳過。你並不孤單。')}
        </p>
      )}

      <textarea
        value={currentText}
        onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
        rows={5}
        placeholder={t('在這裡輸入你的想法……')}
        className="mt-4 w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-soft outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/40"
      />
      <div className="mt-2">
        <VoiceInput accent="var(--primary)" onTranscript={appendTranscript} />
      </div>

      {submitError && <p className="mt-3 text-sm font-bold text-rust">{submitError}</p>}

      <div className="mt-6 flex gap-3">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex-1 rounded-full border border-border bg-card py-3 text-sm font-bold text-foreground transition active:scale-[0.98] disabled:opacity-40"
        >
          {t('上一題')}
        </button>
        <button
          onClick={() => (isLast ? void submit() : setStep((s) => s + 1))}
          className="flex-[1.4] rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
        >
          {isLast ? t('送出') : t('下一題')}
        </button>
      </div>
    </div>
  )
}

function ClientReportView({ report, onRetake }: { report: NonNullable<AssessmentResultInfo['client_report']>; onRetake: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl bg-gradient-primary p-6 text-center shadow-soft">
        <p className="text-4xl">{report.hero.emoji}</p>
        <h2 className="mt-2 text-xl font-black text-primary-foreground">{report.hero.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-primary-foreground/85">{report.hero.subtitle}</p>
      </div>

      {report.highlights.map((h, i) => (
        <div key={i} className="rounded-2xl bg-tile-mint p-4 shadow-soft">
          <p className="text-sm font-black text-foreground">
            <span className="mr-1.5">{h.emoji}</span>
            {h.title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/85">{h.text}</p>
        </div>
      ))}

      {report.quote && (
        <div className="rounded-2xl bg-cream px-5 py-4 text-center">
          <p className="text-[15px] italic leading-relaxed text-foreground/85">「{report.quote.text}」</p>
          <p className="mt-1.5 text-xs text-foreground/60">{report.quote.source}</p>
        </div>
      )}

      <div className="rounded-2xl bg-gradient-soft p-4">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-primary">{t('溫暖的提醒')}</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground/85">{report.hope}</p>
      </div>

      <div className="rounded-2xl border border-dashed border-border px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{report.mission.title}</p>
        <p className="mt-1 text-[15px] leading-relaxed text-foreground/85">{report.mission.text}</p>
      </div>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">{report.footer_note}</p>

      <button onClick={onRetake} className="mt-1 text-sm font-bold text-muted-foreground transition hover:text-foreground">
        {t('重新測驗')}
      </button>
    </div>
  )
}
