// 日記模組播放器（個案端）：週打卡條 + 每日題目 + 送出後三層 AI 回饋（即時／整體／週報）。
// 同一天允許多筆（沿用 pro_entries 無 unique 限制），打卡條以「當日有任一筆」計。
// 危機判讀沿用既有 entrySafetyCheck → localCrisisCheck fallback（零改動）。
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { track } from '../../lib/analytics'
import { useLanguage } from '../../lib/i18n/context'
import { isoLocalDate } from '../../lib/date'
import { isNativeApp } from '../../lib/nativeAuth'
import { scheduleDiaryReminder } from '../../lib/localNotifications'
import { requestDiaryReview, crossedThreshold, type ReviewRow } from '../../lib/reviews'
import {
  entrySafetyCheck,
  localCrisisCheck,
  insertCrisisAlertFallback,
  type DiaryModuleContent,
  type ProAnswers,
  type ProAnswerValue,
  type ProBlock,
} from '../../lib/proModules'
import { BlockRenderer } from './BlockRenderer'
import { CrisisResourcesModal } from './CrisisResourcesModal'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

type Stage = 'writing' | 'done'

function isAnswered(block: ProBlock, value: ProAnswerValue | undefined): boolean {
  switch (block.type) {
    case 'short_text':
    case 'long_text':
      return typeof value === 'string' && value.trim().length > 0
    case 'choice':
    case 'checklist':
      return Array.isArray(value) && value.length > 0
    case 'scale':
      return typeof value === 'number'
    default:
      return true
  }
}

/** 距下一次解鎖還差幾筆/幾天（count 剛好是整數倍時視為「已解鎖」，回傳一整輪）。 */
function remainderTo(count: number, threshold: number): number {
  if (threshold <= 0) return 0
  const r = count % threshold
  return r === 0 ? threshold : threshold - r
}

async function fetchDiaryFeedback(entryId: string): Promise<{ style: string | null; text: string | null } | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const resp = await fetch(`${API_URL}/api/pro/diary-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ entry_id: entryId }),
      signal: controller.signal,
    })
    if (!resp.ok) return null
    return (await resp.json()) as { style: string | null; text: string | null }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function DiaryPlayer({
  moduleId,
  userId,
  content,
  practitionerName,
}: {
  moduleId: string
  userId: string
  content: DiaryModuleContent
  practitionerName: string | null
}) {
  const { t } = useLanguage()
  const [entryDates, setEntryDates] = useState<string[]>([])
  const [answers, setAnswers] = useState<ProAnswers>({})
  const [stage, setStage] = useState<Stage>('writing')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showCrisis, setShowCrisis] = useState(false)
  const [dailyFeedback, setDailyFeedback] = useState<{ style: string | null; text: string | null } | null>(null)
  const [overallReview, setOverallReview] = useState<ReviewRow | null>(null)
  const [weeklyReview, setWeeklyReview] = useState<ReviewRow | null>(null)
  const [reminded, setReminded] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('pro_entries')
      .select('entry_date')
      .eq('module_id', moduleId)
      .eq('user_id', userId)
      .then(({ data }) => {
        if (!cancelled) setEntryDates((data ?? []).map((r) => String(r.entry_date)))
      })
    return () => {
      cancelled = true
    }
  }, [moduleId, userId])

  const today = isoLocalDate(new Date())
  const distinctDates = new Set(entryDates)
  const totalEntries = entryDates.length
  const distinctCount = distinctDates.size
  const dayNumber = distinctDates.has(today) ? distinctCount : distinctCount + 1

  const weekStrip = (() => {
    const now = new Date()
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(now)
    monday.setDate(monday.getDate() + diff)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(d.getDate() + i)
      return isoLocalDate(d)
    })
  })()

  const requiredMissing = content.blocks.some((b) => b.required && !isAnswered(b, answers[b.id]))
  const setAnswer = (id: string, value: ProAnswerValue) => setAnswers((prev) => ({ ...prev, [id]: value }))
  const collectTexts = (): string[] =>
    content.blocks.map((b) => answers[b.id]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

  const fetchLatestReview = async (type: 'overall' | 'weekly'): Promise<ReviewRow | null> => {
    const { data } = await supabase
      .from('pro_reviews')
      .select('*')
      .eq('module_id', moduleId)
      .eq('user_id', userId)
      .eq('review_type', type)
      .order('period_start', { ascending: false })
      .limit(1)
    return ((data as ReviewRow[]) ?? [])[0] ?? null
  }

  const submit = async () => {
    if (submitting) return
    if (requiredMissing) {
      setFormError(t('請先完成所有必填題目。'))
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const { data, error } = await supabase
        .from('pro_entries')
        .insert({ module_id: moduleId, user_id: userId, answers })
        .select('id')
        .single()
      if (error || !data) throw error ?? new Error('insert failed')
      const entryId = data.id as string

      const texts = collectTexts()
      let hasRisk = false
      if (texts.length > 0) {
        try {
          const r = await entrySafetyCheck(entryId, texts)
          hasRisk = r.risk !== 'none'
        } catch {
          const matched = localCrisisCheck(texts)
          if (matched.length > 0) {
            await insertCrisisAlertFallback(moduleId, userId, entryId, matched)
            hasRisk = true
          }
        }
      }

      track('pro_diary_entry_submitted', { module_id: moduleId })
      if (hasRisk) setShowCrisis(true)

      if (content.feedback.daily.enabled) {
        const fb = await fetchDiaryFeedback(entryId)
        if (fb) {
          setDailyFeedback(fb)
          track('pro_diary_feedback_shown', { module_id: moduleId })
        }
      }

      const newDates = [...entryDates, today]
      setEntryDates(newDates)
      const newTotal = newDates.length
      const newDistinct = new Set(newDates).size

      if (content.feedback.overall.enabled && crossedThreshold(newTotal, content.feedback.overall.threshold)) {
        const rv = await requestDiaryReview(moduleId, 'overall')
        if (rv) track('review_generated', { type: 'overall', module_id: moduleId })
        setOverallReview(rv ?? (await fetchLatestReview('overall')))
      } else if (content.feedback.overall.enabled) {
        setOverallReview(await fetchLatestReview('overall'))
      }

      if (content.feedback.weekly.enabled && crossedThreshold(newDistinct, 7)) {
        const rv = await requestDiaryReview(moduleId, 'weekly')
        if (rv) track('review_generated', { type: 'weekly', module_id: moduleId })
        setWeeklyReview(rv ?? (await fetchLatestReview('weekly')))
      } else if (content.feedback.weekly.enabled) {
        setWeeklyReview(await fetchLatestReview('weekly'))
      }

      setStage('done')
    } catch (e) {
      console.error('[diary submit]', e)
      setFormError(t('儲存失敗，請稍後再試一次。'))
    } finally {
      setSubmitting(false)
    }
  }

  const remind = async () => {
    if (reminded) return
    const time = content.reminder?.enabled ? content.reminder.time : '21:00'
    await scheduleDiaryReminder(moduleId, time)
    setReminded(true)
  }

  const subheader = t('第 {n} 天 · 由 {name} 為你設計', { n: dayNumber, name: practitionerName || t('你的專業夥伴') })

  if (stage === 'done') {
    return (
      <div className="animate-fade-up">
        <p className="mb-4 text-sm text-muted-foreground">{subheader}</p>

        {content.feedback.daily.enabled && dailyFeedback?.text && (
          <div className="mb-3 rounded-2xl bg-tile-mint p-4">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-[#71744F]">{t('AI 即時回饋')}</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/85">{dailyFeedback.text}</p>
          </div>
        )}

        {content.feedback.overall.enabled &&
          (overallReview ? (
            <div className="mb-3 rounded-2xl bg-tile-blue p-4">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-foreground/70">{t('整體回饋')}</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/85">{overallReview.content.summary}</p>
            </div>
          ) : (
            <div className="mb-3 rounded-2xl bg-tile-blue p-4 opacity-60">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-foreground/70">{t('整體回饋')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('還差 {n} 則解鎖', { n: remainderTo(totalEntries, content.feedback.overall.threshold) })}
              </p>
            </div>
          ))}

        {content.feedback.weekly.enabled &&
          (weeklyReview ? (
            <div className="mb-3 rounded-2xl bg-tile-peach p-4">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-[#8a6320]">{t('一週成長報告')}</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/85">{weeklyReview.content.summary}</p>
            </div>
          ) : (
            <div className="mb-3 rounded-2xl bg-tile-peach p-4 opacity-55">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-[#8a6320]">{t('一週成長報告')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('還差 {n} 天解鎖', { n: remainderTo(distinctCount, 7) })}</p>
            </div>
          ))}

        {isNativeApp() && (
          <button
            onClick={remind}
            disabled={reminded}
            className="mt-2 w-full rounded-full border border-border bg-card py-3 text-sm font-bold text-foreground transition active:scale-[0.98] disabled:opacity-60"
          >
            {reminded ? t('已設定提醒') : t('提醒我')}
          </button>
        )}

        <button
          onClick={() => {
            setAnswers({})
            setDailyFeedback(null)
            setFormError(null)
            setStage('writing')
          }}
          className="mt-3 w-full rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
        >
          {t('再寫一則')}
        </button>

        {showCrisis && <CrisisResourcesModal onClose={() => setShowCrisis(false)} />}
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      <p className="mb-3 text-sm text-muted-foreground">{subheader}</p>

      <div className="mb-4 flex justify-between rounded-2xl bg-card px-3 py-2.5 shadow-soft">
        {weekStrip.map((d) => (
          <span
            key={d}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              distinctDates.has(d) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {new Date(d + 'T00:00:00').getDate()}
          </span>
        ))}
      </div>

      <BlockRenderer content={content} answers={answers} onChange={setAnswer} />

      {formError && <p className="mt-4 text-sm font-bold text-rust">{formError}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="mt-6 w-full rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
      >
        {submitting ? t('儲存中…') : t('完成今天的紀錄')}
      </button>
    </div>
  )
}
