import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { supabase } from '../lib/supabase'
import { PrimaryCta } from '../components/PrimaryCta'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export const Route = createFileRoute('/app/gratitude')({
  component: GratitudePage,
})

type Stage = 'INTRO' | 'WRITE_1' | 'WRITE_2' | 'WRITE_3' | 'SUMMARY' | 'CELEBRATE'
type Difficulty = 'basic' | 'advanced'
type ItemKey = 'item_1' | 'item_2' | 'item_3'

interface GratitudeItems {
  item_1: string
  item_2: string
  item_3: string
}


const DIFFICULTY_PROMPTS: Record<Difficulty, string> = {
  basic: '今天有什麼讓你心存感謝的事？可以是很小的事。',
  advanced: '這件事的哪個部分讓你感到感謝？它對你的意義是什麼？',
}

const PERMA_BOOSTS = [
  {
    key: 'P',
    label: '情緒力',
    delta: 3,
    badge: 'bg-tile-pink',
    bar: 'bg-tile-pink',
    description: '成功累積三次的正向情緒經驗！',
  },
  {
    key: 'M',
    label: '意義力',
    delta: 1,
    badge: 'bg-tile-peach',
    bar: 'bg-tile-peach',
    description: '感恩日記能幫助你發現自己真正重視的人事物，提升生活的意義感',
  },
  {
    key: 'R',
    label: '連結力',
    delta: 3,
    badge: 'bg-tile-blue',
    bar: 'bg-tile-blue',
    description: '進一步覺察自身的人際關係支持系統，更容易感受到身邊人或自己的支持',
  },
] as const

function todayDate(): Date {
  return new Date()
}

function formatDate(date: Date): string {
  const days = ['日', '一', '二', '三', '四', '五', '六']
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y} / ${m} / ${d}（星期${days[date.getDay()]}）`
}

function isoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function fetchSummary(items: GratitudeItems, difficulty: Difficulty): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const resp = await fetch(`${API_URL}/api/gratitude-summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ...items, difficulty }),
  })
  if (!resp.ok) throw new Error(`API error: ${resp.status}`)
  const data = await resp.json() as { summary?: string }
  if (!data.summary) throw new Error('Empty summary')
  return data.summary
}

function GratitudePage() {
  const [stage, setStage] = useState<Stage>('INTRO')
  const [difficulty, setDifficulty] = useState<Difficulty>('basic')
  const [items, setItems] = useState<GratitudeItems>({ item_1: '', item_2: '', item_3: '' })
  const [summary, setSummary] = useState<string | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [isShared, setIsShared] = useState(true)
  const navigate = useNavigate()

  const resetAll = () => {
    setStage('INTRO')
    setDifficulty('basic')
    setItems({ item_1: '', item_2: '', item_3: '' })
    setSummary(null)
    setSummaryError(null)
    setIsShared(true)
  }

  useEffect(() => {
    if (stage !== 'SUMMARY') return
    let cancelled = false
    setSummary(null)
    setSummaryError(null)
    fetchSummary(items, difficulty)
      .then((s) => {
        if (!cancelled) setSummary(s)
      })
      .catch((e) => {
        if (!cancelled) {
          console.error('[gratitude-summary]', e)
          setSummaryError('教練暫時無法整理你的感恩，稍後再試一次也沒關係。')
        }
      })
    return () => {
      cancelled = true
    }
  }, [stage, items, difficulty])

  const handleFinalSave = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      try {
        const resp = await fetch(`${API_URL}/api/gratitude-save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            item_1: items.item_1,
            item_2: items.item_2,
            item_3: items.item_3,
            is_shared: isShared,
            ai_feedback: summary,
            entry_date: isoDate(todayDate()),
          }),
        })
        if (!resp.ok) console.error('[gratitude save]', resp.status)
      } catch (e) {
        console.error('[gratitude save]', e)
      }
    }
    navigate({ to: '/app/community' })
  }

  switch (stage) {
    case 'INTRO':
      return (
        <IntroStage
          difficulty={difficulty}
          onChangeDifficulty={setDifficulty}
          onStart={() => setStage('WRITE_1')}
        />
      )
    case 'WRITE_1':
    case 'WRITE_2':
    case 'WRITE_3': {
      const step = stage === 'WRITE_1' ? 1 : stage === 'WRITE_2' ? 2 : 3
      const itemKey: ItemKey = `item_${step}` as ItemKey
      return (
        <WritingStage
          step={step}
          difficulty={difficulty}
          value={items[itemKey]}
          onChange={(v) => setItems({ ...items, [itemKey]: v })}
          onBack={() => {
            if (step === 1) setStage('INTRO')
            else if (step === 2) setStage('WRITE_1')
            else setStage('WRITE_2')
          }}
          onNext={() => {
            if (step === 1) setStage('WRITE_2')
            else if (step === 2) setStage('WRITE_3')
            else setStage('SUMMARY')
          }}
        />
      )
    }
    case 'SUMMARY':
      return (
        <SummaryStage
          items={items}
          summary={summary}
          summaryError={summaryError}
          onContinue={() => setStage('CELEBRATE')}
          onRestart={resetAll}
        />
      )
    case 'CELEBRATE':
      return (
        <CelebrateStage
          isShared={isShared}
          onToggleShared={setIsShared}
          onConfirm={handleFinalSave}
        />
      )
  }
}

// ─────────────────────────── INTRO ───────────────────────────

function IntroStage({
  difficulty,
  onChangeDifficulty,
  onStart,
}: {
  difficulty: Difficulty
  onChangeDifficulty: (d: Difficulty) => void
  onStart: () => void
}) {
  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-10 md:px-10">
      <p className="font-handwriting text-2xl text-muted-foreground">今天的練習</p>
      <h1 className="mt-1 text-2xl font-extrabold leading-tight text-foreground md:text-3xl">
        感恩日記
      </h1>

      <p className="mb-3 mt-6 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
        完成後 PERMA 加分
      </p>
      <div className="flex flex-wrap gap-2">
        {PERMA_BOOSTS.map(({ label, delta, badge }) => (
          <span
            key={label}
            className={`flex items-center gap-1.5 rounded-full ${badge} px-3.5 py-1.5 text-xs font-bold text-foreground`}
          >
            {label}
            <span className="text-primary">+{delta}</span>
          </span>
        ))}
      </div>

      <div className="relative mt-7 overflow-hidden rounded-3xl bg-gradient-night p-6 shadow-soft">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-primary-foreground/55">
          What you&apos;ll do
        </p>
        <p className="mt-2 text-lg font-extrabold leading-snug text-primary-foreground">
          寫下今天的三件感恩
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-primary-foreground/75">
          停下來，把注意力放回身邊的美好。即使是一件很小的事，當你願意命名它、寫下它，就能為自己累積一份內在的心理資源。
        </p>
      </div>

      <p className="mb-3 mt-7 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
        選擇今天的難度
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(['basic', 'advanced'] as const).map((d) => {
          const selected = difficulty === d
          return (
            <button
              key={d}
              onClick={() => onChangeDifficulty(d)}
              className={`flex flex-col items-start gap-1 rounded-3xl border-2 p-5 text-left transition active:scale-[0.98] ${
                selected
                  ? 'border-primary bg-primary-soft shadow-soft'
                  : 'border-border bg-card'
              }`}
            >
              <span
                className={`text-sm font-extrabold ${
                  selected ? 'text-primary' : 'text-foreground'
                }`}
              >
                {d === 'basic' ? '初階' : '進階'}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {d === 'basic'
                  ? '寫下讓你感謝的人事物，不需要太多解釋'
                  : '深入探討為什麼感謝、它如何影響你'}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-10">
        <PrimaryCta onClick={onStart} variant="next">
          開始練習
        </PrimaryCta>
      </div>
    </div>
  )
}

// ─────────────────────────── WRITING (per page) ───────────────────────────

function WritingStage({
  step,
  difficulty,
  value,
  onChange,
  onBack,
  onNext,
}: {
  step: 1 | 2 | 3
  difficulty: Difficulty
  value: string
  onChange: (v: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const date = useMemo(() => formatDate(todayDate()), [])
  const dirty = value.trim().length > 0
  const nextLabel = step === 3 ? '完成三件感恩' : '下一件'
  const nextVariant = step === 3 ? 'done' : 'next'

  return (
    <div className="animate-fade-up mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl flex-col px-6 pt-8 md:px-10">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground shadow-soft transition active:scale-90"
          aria-label="返回"
        >
          <BackIcon />
        </button>
        <span>{date}</span>
        <span className="text-xs font-extrabold text-primary">{step}/3</span>
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-primary transition-all duration-500"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      <p className="mb-3 mt-8 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
        感恩 {step} / 3 · {difficulty === 'basic' ? '初階' : '進階'}
      </p>
      <h2 className="text-xl font-extrabold leading-snug text-foreground md:text-2xl">
        {DIFFICULTY_PROMPTS[difficulty]}
      </h2>

      <div className="mt-6 flex-1">
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            difficulty === 'basic'
              ? '寫下今天的這份感謝…'
              : '描述為什麼讓你感謝、對你的意義…'
          }
          rows={8}
          className="w-full resize-none rounded-3xl bg-card p-5 text-base leading-relaxed text-foreground shadow-soft placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="mt-6 pb-6">
        <PrimaryCta onClick={onNext} disabled={!dirty} variant={nextVariant}>
          {nextLabel}
        </PrimaryCta>
      </div>
    </div>
  )
}

function BackIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

// ─────────────────────────── SUMMARY ───────────────────────────

function SummaryStage({
  items,
  summary,
  summaryError,
  onContinue,
  onRestart,
}: {
  items: GratitudeItems
  summary: string | null
  summaryError: string | null
  onContinue: () => void
  onRestart: () => void
}) {
  const shareCardRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const date = useMemo(() => formatDate(todayDate()), [])

  const handleShare = async () => {
    if (!shareCardRef.current || sharing) return
    setSharing(true)
    try {
      const dataUrl = await toPng(shareCardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
      })
      const link = document.createElement('a')
      link.download = `gratitude-${isoDate(todayDate())}.png`
      link.href = dataUrl
      link.click()
    } catch (e) {
      console.error('[share image]', e)
    } finally {
      setSharing(false)
    }
  }

  const entries = [items.item_1, items.item_2, items.item_3]

  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-8 md:px-10">
      <p className="font-handwriting text-2xl text-muted-foreground">今天的回顧</p>
      <h2 className="mb-1 mt-1 text-2xl font-extrabold leading-tight text-foreground md:text-3xl">
        你今天的感恩回顧 ✨
      </h2>
      <p className="text-xs text-muted-foreground">{date}</p>

      <div className="mb-6 mt-6 flex flex-col gap-3">
        {entries.map((text, i) => (
          <div key={i} className="rounded-3xl bg-card p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                {i + 1}
              </span>
              <p className="flex-1 text-sm leading-relaxed text-foreground/85">{text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-3xl bg-gradient-soft p-5 shadow-soft">
        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.25em] text-primary">
          Coach&apos;s note
        </p>
        {summary === null && !summaryError ? (
          <SummarySkeleton />
        ) : summaryError ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{summaryError}</p>
        ) : (
          <p className="text-sm leading-relaxed text-foreground">{summary}</p>
        )}
      </div>

      <div
        ref={shareCardRef}
        aria-hidden
        className="pointer-events-none fixed -left-[9999px] top-0"
        style={{ width: '1280px', height: '720px' }}
      >
        <ShareCard items={items} summary={summary} date={date} />
      </div>

      <div className="flex flex-col gap-3 pb-4">
        <PrimaryCta onClick={handleShare} disabled={sharing || !summary} variant="done">
          {sharing ? '正在生成分享圖…' : '儲存並分享'}
        </PrimaryCta>
        <button
          onClick={onContinue}
          className="h-14 w-full rounded-full bg-card text-sm font-extrabold tracking-[0.2em] text-foreground shadow-soft transition active:scale-[0.98]"
        >
          下一步：完成這次練習
        </button>
        <button
          onClick={onRestart}
          className="h-12 w-full text-xs font-bold tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
        >
          結束這次練習
        </button>
      </div>
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-3 w-full animate-pulse rounded-full bg-primary-soft" />
      <div className="h-3 w-11/12 animate-pulse rounded-full bg-primary-soft" />
      <div className="h-3 w-9/12 animate-pulse rounded-full bg-primary-soft" />
    </div>
  )
}

function ShareCard({
  items,
  summary,
  date,
}: {
  items: GratitudeItems
  summary: string | null
  date: string
}) {
  return (
    <div
      style={{
        width: '1280px',
        height: '720px',
        background: 'linear-gradient(135deg,#dfe7f5 0%,#e8d6e8 60%,#f1d6c2 100%)',
        padding: '64px 80px',
        boxSizing: 'border-box',
        fontFamily: 'PingFang TC, Microsoft JhengHei, sans-serif',
        color: '#1f2742',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ fontSize: 14, letterSpacing: 6, fontWeight: 800, opacity: 0.55 }}>
          MINDGYM · GRATITUDE
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, marginTop: 12 }}>今天的三件感恩</div>
        <div style={{ fontSize: 18, opacity: 0.65, marginTop: 6 }}>{date}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {[items.item_1, items.item_2, items.item_3].map((text, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(255,255,255,0.7)',
              borderRadius: 28,
              padding: '20px 28px',
              display: 'flex',
              gap: 18,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#3b56a8',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <div style={{ fontSize: 20, lineHeight: 1.55 }}>{text}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 16, lineHeight: 1.7, opacity: 0.8, maxWidth: 1120 }}>
        {summary ?? '——'}
      </div>
    </div>
  )
}

// ─────────────────────────── CELEBRATE ───────────────────────────

function CelebrateStage({
  isShared,
  onToggleShared,
  onConfirm,
}: {
  isShared: boolean
  onToggleShared: (v: boolean) => void
  onConfirm: () => void
}) {
  return (
    <div className="animate-fade-up mx-auto flex max-w-3xl flex-col items-center px-6 pt-12 md:px-10">
      <div className="celebrate-pop mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-primary text-5xl shadow-soft">
        🎉
      </div>
      <h2 className="mb-2 text-center text-2xl font-extrabold text-foreground">
        今日感恩練習完成！
      </h2>
      <p className="mb-8 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        願意停下來留意身邊的美好，這份覺察本身就是一份很大的禮物。
      </p>

      <div className="mb-7 w-full rounded-3xl bg-card p-6 shadow-soft">
        <p className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
          練習後 PERMA 加分
        </p>
        <div className="flex flex-col gap-5">
          {PERMA_BOOSTS.map(({ label, delta, bar, description }, i) => (
            <div
              key={label}
              className="celebrate-row flex flex-col gap-2"
              style={{ animationDelay: `${0.15 + i * 0.18}s` }}
            >
              <div className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-sm font-extrabold text-foreground">
                  {label}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${bar} celebrate-bar`}
                    style={{ width: `${(delta / 3) * 100}%`, animationDelay: `${0.25 + i * 0.18}s` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-extrabold text-primary">
                  +{delta}
                </span>
              </div>
              <p className="pl-[68px] text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-7 flex w-full items-center justify-between rounded-3xl bg-card px-5 py-4 shadow-soft">
        <div className="pr-3">
          <p className="text-sm font-extrabold text-foreground">分享給健心的好夥伴</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            以匿名身份在社群中分享你今天的感恩
          </p>
        </div>
        <button
          role="switch"
          aria-checked={isShared}
          onClick={() => onToggleShared(!isShared)}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            isShared ? 'bg-primary' : 'bg-border'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-card shadow transition-transform ${
              isShared ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="w-full">
        <PrimaryCta onClick={onConfirm} variant="next">
          收下，繼續加油
        </PrimaryCta>
      </div>
    </div>
  )
}
