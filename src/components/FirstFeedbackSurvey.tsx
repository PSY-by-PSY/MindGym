import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n/context'

// ─────────────────────────────────────────────────────────────────────────
// 首次完成練習後的三題回饋問卷
//
// 規則：
//  • 一次只顯示一題，答完按「下一步」才換下一題。
//  • 每答一題就即時存進資料庫（first_feedback 表，一人一列）。
//  • 問卷一打開就先寫入空白列，確保「之後不再顯示」—— 就算中途關閉也不會再跳。
//
// 顯示時機與「是否已填過」的判斷在 app.gratitude.tsx 的 CelebrateStage 處理。
// ─────────────────────────────────────────────────────────────────────────

type FieldKey = 'impression' | 'moment' | 'friend'

function buildQuestions(t: (text: string, vars?: Record<string, string | number>) => string): { key: FieldKey; title: string; placeholder: string }[] {
  return [
    {
      key: 'impression',
      title: t('哪個環節讓你印象最深？'),
      placeholder: t('寫下最有感覺的那個部分…'),
    },
    {
      key: 'moment',
      title: t('如果這變成 App，你希望它出現在你生活的什麼時刻？'),
      placeholder: t('例如：睡前、通勤、心情低落的時候…'),
    },
    {
      key: 'friend',
      title: t('你會想帶哪個朋友來？為什麼？'),
      placeholder: t('想到的那個人，還有你想到的原因…'),
    },
  ]
}

export function FirstFeedbackSurvey({ onDone }: { onDone: () => void }) {
  const { t } = useLanguage()
  const QUESTIONS = buildQuestions(t)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<FieldKey, string>>({
    impression: '',
    moment: '',
    friend: '',
  })
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  // 打開問卷的當下先建立一列（空白），標記「已詢問過」→ 之後不再顯示。
  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await supabase
        .from('first_feedback')
        .upsert({ user_id: session.user.id }, { onConflict: 'user_id', ignoreDuplicates: true })
    })()
  }, [])

  const current = QUESTIONS[index]
  const isLast = index === QUESTIONS.length - 1

  const persist = async (next: Record<FieldKey, string>) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('first_feedback').upsert(
      {
        user_id: session.user.id,
        impression: next.impression || null,
        moment: next.moment || null,
        friend: next.friend || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
  }

  const handleNext = async () => {
    if (saving) return
    const next = { ...answers, [current.key]: draft.trim() }
    setAnswers(next)
    setSaving(true)
    try {
      await persist(next) // 每題即時存檔
    } catch (e) {
      console.error('[first_feedback]', e)
    } finally {
      setSaving(false)
    }
    if (isLast) {
      onDone()
    } else {
      setIndex(index + 1)
      setDraft(next[QUESTIONS[index + 1].key])
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40">
      <div className="animate-slide-up w-full max-w-md rounded-t-3xl bg-card p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-soft">
        {/* 進度點 */}
        <div className="mb-5 flex items-center justify-between">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
            {t('想聽聽你的想法')} · {index + 1}/{QUESTIONS.length}
          </p>
          <div className="flex gap-1.5">
            {QUESTIONS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i <= index ? 'bg-primary' : 'bg-border'
                }`}
              />
            ))}
          </div>
        </div>

        <h3 className="mb-4 text-lg font-extrabold leading-snug text-foreground">
          {current.title}
        </h3>

        <textarea
          key={current.key}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={current.placeholder}
          rows={4}
          autoFocus
          className="w-full resize-none rounded-2xl bg-muted/50 p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <button
          onClick={handleNext}
          disabled={saving}
          className="mt-4 h-12 w-full rounded-full bg-primary text-sm font-extrabold tracking-[0.15em] text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? t('儲存中…') : isLast ? t('完成') : t('下一步')}
        </button>
      </div>
    </div>
  )
}
