import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

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
    <div className="flex flex-col px-6 py-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">今天的感恩日記</h1>
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-8">
        <span>{date}</span>
        <span className="font-medium text-orange-500">🔥 1 天連續</span>
      </div>

      <div className="rounded-2xl bg-indigo-50 p-5 mb-6">
        <p className="font-medium text-gray-800 mb-2">
          今天發生了哪三件值得你感謝的事情呢？
        </p>
        <p className="text-sm text-gray-500">請寫得越具體越好，可以是生活中的細微小事</p>
      </div>

      <div className="mb-8">
        <p className="text-sm font-medium text-gray-600 mb-3">感恩對象可以是：</p>
        <div className="flex flex-wrap gap-2">
          {['身邊的人', '自己', '大自然與環境', '事物', '一段體驗'].map(tag => (
            <span
              key={tag}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={onStart}
        className="w-full rounded-2xl bg-indigo-500 py-4 text-lg font-semibold text-white transition-colors hover:bg-indigo-600"
      >
        開始練習
      </button>
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
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e0e7ff" strokeWidth="7" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="#6366f1"
          strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 44 44)"
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <div className="absolute text-center leading-none">
        <span className="text-2xl font-bold text-indigo-600">{value}</span>
        <span className="text-sm text-gray-400">/{max}</span>
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
  const filled = [items.item_1, items.item_2, items.item_3].filter(s => s.trim()).length
  const allFilled = filled === 3

  return (
    <div className="flex flex-col px-6 py-8 max-w-md mx-auto">
      <div className="flex flex-col items-center mb-6">
        <p className="mb-3 text-sm font-medium text-gray-500">今日完成進度</p>
        <CircularProgress value={filled} max={3} />
      </div>

      <div className="flex flex-col gap-4 mb-6">
        {WRITING_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <label className="mb-2 block text-sm font-medium text-gray-700">{label}</label>
            <textarea
              value={items[key]}
              onChange={e => onChange({ ...items, [key]: e.target.value })}
              placeholder={placeholder}
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 placeholder-gray-400 transition-colors focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </div>
        ))}
      </div>

      <button
        disabled={!allFilled}
        onClick={onSubmit}
        className={`w-full rounded-2xl py-4 text-lg font-semibold transition-colors ${
          allFilled
            ? 'bg-indigo-500 text-white hover:bg-indigo-600'
            : 'cursor-not-allowed bg-gray-200 text-gray-400'
        }`}
      >
        送出感恩日記
      </button>
    </div>
  )
}

// ─────────────────────────── AI_PROCESSING ───────────────────────────

function ProcessingStage() {
  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 h-14 w-14 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-500" />
      <p className="text-lg font-medium text-gray-700">正在整理你的感恩時刻…</p>
    </div>
  )
}

// ─────────────────────────── RESULT ───────────────────────────

const TAG_COLORS: Record<string, string> = {
  身邊他人: 'bg-purple-100 text-purple-700',
  自己: 'bg-pink-100 text-pink-700',
  環境: 'bg-green-100 text-green-700',
  體驗: 'bg-orange-100 text-orange-700',
  自訂: 'bg-blue-100 text-blue-700',
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
    <div className="flex flex-col px-6 py-8 max-w-md mx-auto">
      <h2 className="mb-6 text-xl font-bold text-gray-900">你今天的感恩回顧 ✨</h2>

      <div className="mb-6 flex flex-col gap-3">
        {entries.map((entry, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <p className="flex-1 text-sm leading-relaxed text-gray-700">{entry.text}</p>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${TAG_COLORS[entry.tag] ?? 'bg-gray-100 text-gray-600'}`}
              >
                {entry.tag}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-2xl bg-indigo-50 p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-500">AI 回饋</p>
        <p className="text-sm leading-relaxed text-gray-700">{result.ai_feedback}</p>
      </div>

      <div className="mb-6 flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-sm font-medium text-gray-800">匿名分享到社群</p>
          <p className="mt-0.5 text-xs text-gray-500">以「{result.anon_name}」分享</p>
        </div>
        <button
          role="switch"
          aria-checked={isShared}
          onClick={() => onToggleShared(!isShared)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            isShared ? 'bg-indigo-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              isShared ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <button
        onClick={onDone}
        className="w-full rounded-2xl bg-indigo-500 py-4 text-lg font-semibold text-white transition-colors hover:bg-indigo-600"
      >
        結束今日練習
      </button>
    </div>
  )
}

// ─────────────────────────── DONE ───────────────────────────

const ABILITY_BOOSTS = [
  { label: '情緒力', delta: 3, color: 'bg-pink-500' },
  { label: '意義力', delta: 1, color: 'bg-purple-500' },
  { label: '連結力', delta: 3, color: 'bg-indigo-500' },
]

function DoneStage({ onHome }: { onHome: () => void }) {
  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center px-6 max-w-md mx-auto">
      <div className="mb-4 text-5xl">🎉</div>
      <h2 className="mb-3 text-xl font-bold text-gray-900 text-center">今日感恩練習完成！</h2>
      <p className="mb-8 text-center text-sm leading-relaxed text-gray-500">
        恭喜完成今天的感恩練習。當我們願意停下來留意身邊的美好時刻，這本身就能提供我們更多的心理健康資源。
      </p>

      <div className="mb-8 w-full rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="mb-4 text-sm font-semibold text-gray-700">練習後能力提升</p>
        <div className="flex flex-col gap-4">
          {ABILITY_BOOSTS.map(({ label, delta, color }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-sm text-gray-600">{label}</span>
              <div className="flex-1 overflow-hidden rounded-full bg-gray-100 h-2">
                <div
                  className={`h-full rounded-full ${color}`}
                  style={{ width: `${(delta / 3) * 100}%` }}
                />
              </div>
              <span className="w-7 shrink-0 text-right text-sm font-semibold text-gray-700">
                +{delta}
              </span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onHome}
        className="w-full rounded-2xl bg-indigo-500 py-4 text-lg font-semibold text-white transition-colors hover:bg-indigo-600"
      >
        返回首頁
      </button>
    </div>
  )
}
