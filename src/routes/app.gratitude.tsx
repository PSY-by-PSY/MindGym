import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { PrimaryCta } from '../components/PrimaryCta'

export const Route = createFileRoute('/app/gratitude')({
  component: GratitudePage,
})

type Stage = 'INTRO' | 'WRITING' | 'AI_PROCESSING' | 'RESULT' | 'DONE'

interface GratitudeItems {
  item_1: string
  item_2: string
  item_3: string
}

interface AiResult {
  tag_1: string
  tag_2: string
  tag_3: string
  ai_feedback: string
  anon_name: string
}

async function callGratitudeApi(items: GratitudeItems): Promise<AiResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'
  const resp = await fetch(`${apiUrl}/api/gratitude`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(items),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: resp.status }))
    const detail = (body as { detail?: unknown }).detail ?? resp.status
    console.error('[gratitude API error]', detail)
    throw new Error(`API error: ${detail}`)
  }
  return resp.json() as Promise<AiResult>
}

function formatDate(date: Date): string {
  const days = ['日', '一', '二', '三', '四', '五', '六']
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y} / ${m} / ${d}（星期${days[date.getDay()]}）`
}

function GratitudePage() {
  const [stage, setStage] = useState<Stage>('INTRO')
  const [items, setItems] = useState<GratitudeItems>({ item_1: '', item_2: '', item_3: '' })
  const [result, setResult] = useState<AiResult | null>(null)
  const [isShared, setIsShared] = useState(true)
  const navigate = useNavigate()

  const handleSubmit = async () => {
    setStage('AI_PROCESSING')
    try {
      const res = await callGratitudeApi(items)
      setResult(res)
      setStage('RESULT')
    } catch {
      setStage('WRITING')
    }
  }

  switch (stage) {
    case 'INTRO':
      return <IntroStage date={formatDate(new Date())} onStart={() => setStage('WRITING')} />
    case 'WRITING':
      return <WritingStage items={items} onChange={setItems} onSubmit={handleSubmit} />
    case 'AI_PROCESSING':
      return <ProcessingStage />
    case 'RESULT':
      return (
        <ResultStage
          items={items}
          result={result!}
          isShared={isShared}
          onToggleShared={setIsShared}
          onDone={() => setStage('DONE')}
        />
      )
    case 'DONE':
      return <DoneStage onHome={() => navigate({ to: '/app/home' })} />
  }
}

// ─────────────────────────── INTRO ───────────────────────────

function IntroStage({ date, onStart }: { date: string; onStart: () => void }) {
  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-10 md:px-10">
      <p className="font-handwriting text-2xl text-muted-foreground">今天的練習</p>
      <h1 className="mt-1 text-2xl font-extrabold leading-tight text-foreground md:text-3xl">
        感恩日記
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{date}</span>
        <span className="rounded-full bg-tile-peach px-2.5 py-0.5 text-xs font-bold text-foreground">
          🔥 連續 1 天
        </span>
      </div>

      <div className="relative mt-6 overflow-hidden rounded-3xl bg-gradient-night p-6 shadow-soft">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-primary-foreground/55">
          Today&apos;s session
        </p>
        <p className="mt-2 text-lg font-extrabold leading-snug text-primary-foreground">
          今天發生了哪三件值得你感謝的事情呢？
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-primary-foreground/70">
          請寫得越具體越好，可以是生活中的細微小事。
        </p>
      </div>

      <p className="mb-3 mt-7 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
        感恩對象可以是
      </p>
      <div className="flex flex-wrap gap-2">
        {['身邊的人', '自己', '大自然與環境', '事物', '一段體驗'].map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-card px-4 py-2 text-sm font-bold text-foreground shadow-soft"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-10">
        <PrimaryCta onClick={onStart} variant="next">
          開始練習
        </PrimaryCta>
      </div>
    </div>
  )
}

// ─────────────────────────── WRITING ───────────────────────────

function CircularProgress({ value, max }: { value: number; max: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const dash = (value / max) * circ
  return (
    <div className="relative flex items-center justify-center">
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle cx="46" cy="46" r={r} fill="none" stroke="var(--primary-soft)" strokeWidth="8" />
        <circle
          cx="46"
          cy="46"
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 46 46)"
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <div className="absolute text-center leading-none">
        <span className="text-2xl font-extrabold text-primary">{value}</span>
        <span className="text-sm font-bold text-muted-foreground">/{max}</span>
      </div>
    </div>
  )
}

const WRITING_FIELDS = [
  {
    key: 'item_1' as const,
    label: '第一件感恩的事情是…',
    placeholder: '例：我很感謝工作夥伴幫忙處理事情，讓我感到很安心',
  },
  {
    key: 'item_2' as const,
    label: '第二件感恩的事情是…',
    placeholder: '例：我很感謝自己今天面對繁忙行程並沒有退縮',
  },
  {
    key: 'item_3' as const,
    label: '第三件感恩的事情是…',
    placeholder: '例：今天公車準時，讓我有餘裕欣賞沿途風景',
  },
]

function WritingStage({
  items,
  onChange,
  onSubmit,
}: {
  items: GratitudeItems
  onChange: (v: GratitudeItems) => void
  onSubmit: () => void
}) {
  const filled = [items.item_1, items.item_2, items.item_3].filter((s) => s.trim()).length
  const allFilled = filled === 3

  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-10 md:px-10">
      <div className="mb-7 flex flex-col items-center">
        <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
          今日完成進度
        </p>
        <CircularProgress value={filled} max={3} />
      </div>

      <div className="mb-8 flex flex-col gap-4">
        {WRITING_FIELDS.map(({ key, label, placeholder }, i) => (
          <div key={key} className="rounded-3xl bg-card p-5 shadow-soft">
            <label className="mb-2 flex items-center gap-2 text-sm font-extrabold text-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                {i + 1}
              </span>
              {label}
            </label>
            <textarea
              value={items[key]}
              onChange={(e) => onChange({ ...items, [key]: e.target.value })}
              placeholder={placeholder}
              rows={3}
              className="w-full resize-none rounded-2xl border-2 border-border bg-muted p-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:bg-card focus:outline-none"
            />
          </div>
        ))}
      </div>

      <PrimaryCta onClick={onSubmit} disabled={!allFilled} variant="done">
        送出感恩日記
      </PrimaryCta>
    </div>
  )
}

// ─────────────────────────── AI_PROCESSING ───────────────────────────

function ProcessingStage() {
  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-6 h-20 w-20">
        <div className="absolute inset-0 rounded-full border-[6px] border-primary-soft" />
        <div className="absolute inset-0 animate-spin rounded-full border-[6px] border-transparent border-t-primary" />
      </div>
      <p className="text-lg font-extrabold text-foreground">正在整理你的感恩時刻…</p>
      <p className="mt-1.5 text-sm text-muted-foreground">教練正在閱讀你今天的練習</p>
    </div>
  )
}

// ─────────────────────────── RESULT ───────────────────────────

const TAG_TILES: Record<string, string> = {
  身邊他人: 'bg-tile-pink',
  自己: 'bg-tile-peach',
  環境: 'bg-tile-mint',
  體驗: 'bg-tile-blue',
  自訂: 'bg-tile-blue',
}

function ResultStage({
  items,
  result,
  isShared,
  onToggleShared,
  onDone,
}: {
  items: GratitudeItems
  result: AiResult
  isShared: boolean
  onToggleShared: (v: boolean) => void
  onDone: () => void
}) {
  const entries = [
    { text: items.item_1, tag: result.tag_1 },
    { text: items.item_2, tag: result.tag_2 },
    { text: items.item_3, tag: result.tag_3 },
  ]

  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-10 md:px-10">
      <p className="font-handwriting text-2xl text-muted-foreground">今天的回顧</p>
      <h2 className="mb-6 mt-1 text-2xl font-extrabold leading-tight text-foreground md:text-3xl">
        你今天的感恩回顧 ✨
      </h2>

      <div className="mb-5 flex flex-col gap-3">
        {entries.map((entry, i) => (
          <div key={i} className="rounded-3xl bg-card p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <p className="flex-1 text-sm leading-relaxed text-foreground/80">{entry.text}</p>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold text-foreground ${
                  TAG_TILES[entry.tag] ?? 'bg-muted'
                }`}
              >
                {entry.tag}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-5 rounded-3xl bg-gradient-soft p-5 shadow-soft">
        <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.25em] text-primary">
          Coach&apos;s note
        </p>
        <p className="text-sm leading-relaxed text-foreground">{result.ai_feedback}</p>
      </div>

      <div className="mb-8 flex items-center justify-between rounded-3xl bg-card px-5 py-4 shadow-soft">
        <div>
          <p className="text-sm font-extrabold text-foreground">匿名分享到社群</p>
          <p className="mt-0.5 text-xs text-muted-foreground">以「{result.anon_name}」分享</p>
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

      <PrimaryCta onClick={onDone} variant="done">
        結束今日練習
      </PrimaryCta>
    </div>
  )
}

// ─────────────────────────── DONE ───────────────────────────

const ABILITY_BOOSTS = [
  { label: '情緒力', delta: 3, tile: 'bg-tile-pink' },
  { label: '意義力', delta: 1, tile: 'bg-tile-peach' },
  { label: '連結力', delta: 3, tile: 'bg-tile-blue' },
]

function DoneStage({ onHome }: { onHome: () => void }) {
  return (
    <div className="animate-fade-up mx-auto flex max-w-3xl flex-col items-center px-6 pt-12 md:px-10">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-primary text-4xl shadow-soft">
        🎉
      </div>
      <h2 className="mb-3 text-center text-2xl font-extrabold text-foreground">
        今日感恩練習完成！
      </h2>
      <p className="mb-8 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        恭喜完成今天的感恩練習。當我們願意停下來留意身邊的美好時刻，這本身就能提供我們更多的心理健康資源。
      </p>

      <div className="mb-8 w-full rounded-3xl bg-card p-6 shadow-soft">
        <p className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
          練習後能力提升
        </p>
        <div className="flex flex-col gap-4">
          {ABILITY_BOOSTS.map(({ label, delta, tile }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-sm font-bold text-foreground">{label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${tile}`}
                  style={{ width: `${(delta / 3) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-sm font-extrabold text-primary">
                +{delta}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full">
        <PrimaryCta onClick={onHome} variant="next">
          返回首頁
        </PrimaryCta>
      </div>
    </div>
  )
}
