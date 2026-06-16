import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { WorkshopGate } from '../components/workshop/WorkshopGate'
import {
  WorkshopLayout,
  WorkshopTextarea,
  CompletionActions,
} from '../components/workshop/WorkshopUI'

export const Route = createFileRoute('/app/workshop/last-day')({
  component: LastDayModule,
})

function LastDayModule() {
  return (
    <WorkshopGate>
      <LastDayFlow />
    </WorkshopGate>
  )
}

const TOTAL_STEPS = 4

function LastDayFlow() {
  const [step, setStep] = useState(1)
  const [unfinished, setUnfinished] = useState('')
  const [people, setPeople] = useState('')
  const [action, setAction] = useState('')

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const back = () => setStep((s) => Math.max(s - 1, 1))
  const restart = () => {
    setUnfinished('')
    setPeople('')
    setAction('')
    setStep(1)
  }

  // ── 步驟 1：反思書寫 ──────────────────────────────────────────────
  if (step === 1) {
    return (
      <WorkshopLayout
        step={1}
        total={TOTAL_STEPS}
        title="反思書寫"
        onNext={next}
      >
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          想像今天是你生命中的最後一天，靜靜地思考下面兩個問題，用書寫來澄清你真正在乎的是什麼。
        </div>

        <QuestionBlock
          index={1}
          question="哪些是我放在心上，對我而言很重要的事情，卻沒有機會、沒有勇氣去完成的？"
        >
          <WorkshopTextarea
            value={unfinished}
            onChange={setUnfinished}
            placeholder="慢慢寫，沒有對錯……"
            rows={6}
          />
        </QuestionBlock>

        <QuestionBlock
          index={2}
          question="哪些是我牽掛的人？我想把時間花在誰身上？我還想跟誰說什麼話？"
        >
          <WorkshopTextarea
            value={people}
            onChange={setPeople}
            placeholder="想到誰，就寫下誰……"
            rows={6}
          />
        </QuestionBlock>
      </WorkshopLayout>
    )
  }

  // ── 步驟 2：聽歌 ──────────────────────────────────────────────────
  if (step === 2) {
    return (
      <WorkshopLayout
        step={2}
        total={TOTAL_STEPS}
        title="聽一首歌"
        minutes={5}
        onBack={back}
        onNext={next}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          給自己一段安靜聆聽的時間，讓剛剛浮現的情緒慢慢沉澱。準備好了再繼續，不用急。
        </p>

        <MusicPlayer />
      </WorkshopLayout>
    )
  }

  // ── 步驟 3：行動規劃 ──────────────────────────────────────────────
  if (step === 3) {
    return (
      <WorkshopLayout
        step={3}
        total={TOTAL_STEPS}
        title="行動規劃"
        onBack={back}
        onNext={next}
        nextLabel="完成"
        nextVariant="done"
      >
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          回到現在這一刻。寫下這一週你可以付諸的具體行動 —— 可以很小，例如一通電話、一次拜訪，或一句一直想說卻還沒說出口的話。
        </div>

        <div className="mt-4">
          <WorkshopTextarea
            value={action}
            onChange={setAction}
            placeholder="這一週我可以……"
            rows={7}
          />
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 4：完成 ──────────────────────────────────────────────────
  return (
    <WorkshopLayout step={4} total={TOTAL_STEPS} title="今天的整理 🕊️">
      <p className="text-sm leading-relaxed text-muted-foreground">
        把你今天澄清的事，與決定踏出的一步放在一起：
      </p>

      <SummaryCard
        label="放在心上、卻還沒完成的事"
        content={unfinished}
      />
      <SummaryCard
        label="我牽掛的人，想說的話"
        content={people}
      />
      <SummaryCard
        label="這一週我可以付諸的行動"
        content={action}
        highlight
      />

      <CompletionActions onRestart={restart} />
    </WorkshopLayout>
  )
}

// ─── 子元件 ───────────────────────────────────────────────────────────────

function QuestionBlock({
  index,
  question,
  children,
}: {
  index: number
  question: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-extrabold text-primary">
          {index}
        </span>
        <p className="pt-0.5 text-sm font-bold leading-relaxed text-foreground">{question}</p>
      </div>
      {children}
    </div>
  )
}

function SummaryCard({
  label,
  content,
  highlight = false,
}: {
  label: string
  content: string
  highlight?: boolean
}) {
  return (
    <div
      className={`mt-4 rounded-3xl p-4 shadow-soft ${
        highlight ? 'bg-gradient-soft' : 'bg-card'
      }`}
    >
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
        {content.trim() || '（沒有留下文字）'}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 模擬音樂播放器
//
// 測試階段先用「播放／暫停 + 進度條」模擬一段安靜聆聽的時間，不串接真實音檔。
// 之後若有可用的音檔資源，可改用 <audio> 元素：建立一個 ref，把 play/pause
// 接到 audio.play()/pause()，並用 timeupdate 事件更新 elapsed 即可。
// ─────────────────────────────────────────────────────────────────────────
const TRACK_DURATION = 300 // 秒（5:00）

function MusicPlayer() {
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!playing) return
    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= TRACK_DURATION) {
          setPlaying(false)
          return TRACK_DURATION
        }
        return e + 1
      })
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [playing])

  const finished = elapsed >= TRACK_DURATION
  const progress = (elapsed / TRACK_DURATION) * 100

  const toggle = () => {
    if (finished) {
      // 播完後再按一次 = 重新聆聽
      setElapsed(0)
      setPlaying(true)
    } else {
      setPlaying((p) => !p)
    }
  }

  return (
    <div className="mt-6 flex flex-col items-center rounded-3xl bg-gradient-soft p-8 shadow-soft">
      <div
        className={`flex h-28 w-28 items-center justify-center rounded-full bg-card text-5xl shadow-soft ${
          playing ? 'animate-float' : ''
        }`}
      >
        🎵
      </div>

      <p className="mt-5 text-sm font-bold text-foreground">靜心聆聽</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {playing ? '播放中…' : finished ? '已播放完畢' : '輕鬆地聽，不用做什麼'}
      </p>

      {/* 進度條 */}
      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1.5 flex w-full justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
        <span>{formatTime(elapsed)}</span>
        <span>{formatTime(TRACK_DURATION)}</span>
      </div>

      {/* 播放／暫停 */}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? '暫停' : '播放'}
        className="mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-soft transition active:scale-95"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
    </div>
  )
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function PlayIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}
