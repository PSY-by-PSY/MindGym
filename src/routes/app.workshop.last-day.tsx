import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { WorkshopGate } from '../components/workshop/WorkshopGate'
import {
  WorkshopLayout,
  WorkshopTextarea,
  CompletionActions,
} from '../components/workshop/WorkshopUI'
import { supabase } from '../lib/supabase'
import { insertCommunityPost, markStreak, isoDate } from '../lib/communityPost'
import { downloadNodeAsPng, isMobileDevice } from '../lib/shareImage'
import { type Privacy, DEFAULT_PRIVACY, PRIVACY_OPTIONS } from '../lib/privacy'

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

const TOTAL_STEPS = 6

function LastDayFlow() {
  const navigate = useNavigate()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [unfinished, setUnfinished] = useState('')
  const [people, setPeople] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [action, setAction] = useState('')

  const [userId, setUserId] = useState<string | null>(null)
  const [privacy, setPrivacy] = useState<Privacy>(DEFAULT_PRIVACY)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [sharing, setSharing] = useState(false)

  const reflectCardRef = useRef<HTMLDivElement>(null)
  const summaryCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null))
  }, [])

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const back = () => setStep((s) => Math.max(s - 1, 1))
  const restart = () => {
    setUnfinished('')
    setPeople('')
    setName('')
    setDescription('')
    setAction('')
    setPrivacy(DEFAULT_PRIVACY)
    setPublishing(false)
    setPublished(false)
    setStep(1)
  }

  const today = formatDate(new Date())
  const downloadLabel = isMobileDevice() ? '📲 分享圖片' : '⬇️ 儲存圖片'

  const handleDownload = async (
    ref: React.RefObject<HTMLDivElement>,
    filename: string,
    title: string,
  ) => {
    if (!ref.current || sharing) return
    setSharing(true)
    try {
      await downloadNodeAsPng(ref.current, filename, title)
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') console.error('[share image]', e)
    } finally {
      setSharing(false)
    }
  }

  const publish = async () => {
    if (!userId || publishing) return
    setPublishing(true)
    try {
      const desc = description.trim()
      const act = action.trim()
      const entryId = await insertCommunityPost(
        userId,
        'workshop_last_day',
        {
          item_1: desc ? `我希望被記得，是一個「${desc}」的人` : '我想成為的樣子',
          item_2: act,
          item_3: '',
          ai_feedback: null,
        },
        privacy,
        { v: 'last_day', description: desc, action: act },
      )
      setPublished(true)
      await markStreak(userId)
      await router.invalidate()
      navigate({
        to: '/app/community',
        search: entryId ? { focus: entryId } : { showEntry: 1 },
      })
    } catch (e) {
      console.error('[last-day publish]', e)
      setPublishing(false)
      alert('發佈失敗，請稍後再試一次。')
    }
  }

  // ── 步驟 1：生命中的最後一天 · 書寫區 ─────────────────────────────
  if (step === 1) {
    return (
      <WorkshopLayout step={1} total={TOTAL_STEPS} title="生命中的最後一天" onNext={next}>
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          想像今天是你生命中的最後一天，靜靜地思考下面兩個問題，用書寫來澄清你真正在乎的是什麼。可以用打字，也可以用語音輸入。
        </div>

        <QuestionBlock index={1} question="哪些是我放在心上，對我而言很重要的事情，卻沒有機會、沒有勇氣去完成的？">
          <WorkshopTextarea
            value={unfinished}
            onChange={setUnfinished}
            placeholder="慢慢寫，沒有對錯……"
            rows={6}
            voice
          />
        </QuestionBlock>

        <QuestionBlock index={2} question="哪些是我牽掛的人？我想把時間花在誰身上？我還想跟誰說什麼話？">
          <WorkshopTextarea
            value={people}
            onChange={setPeople}
            placeholder="想到誰，就寫下誰……"
            rows={6}
            voice
          />
        </QuestionBlock>
      </WorkshopLayout>
    )
  }

  // ── 步驟 2：生命中的最後一天（生成圖 + 儲存） ─────────────────────
  if (step === 2) {
    return (
      <>
        <div ref={reflectCardRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0" style={{ width: 1080, height: 1440 }}>
          <ReflectShareCard unfinished={unfinished} people={people} date={today} />
        </div>

        <WorkshopLayout step={2} total={TOTAL_STEPS} title="生命中的最後一天" onBack={back} onNext={next}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            這是你今天靜下來寫下的內容，你可以把它儲存下來，提醒自己真正在乎的是什麼。
          </p>

          <SummaryCard label="放在心上、卻還沒完成的事" content={unfinished} />
          <SummaryCard label="我牽掛的人，想說的話" content={people} />

          <button
            type="button"
            onClick={() => handleDownload(reflectCardRef, `last-day-${isoDate(new Date())}.png`, '生命中的最後一天')}
            disabled={sharing}
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full border border-border bg-white text-sm font-extrabold tracking-[0.15em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {sharing ? '正在生成圖片…' : downloadLabel}
          </button>
        </WorkshopLayout>
      </>
    )
  }

  // ── 步驟 3：寫下你希望別人如何形容你 ──────────────────────────────
  if (step === 3) {
    return (
      <WorkshopLayout step={3} total={TOTAL_STEPS} title="你希望別人如何形容你" onBack={back} onNext={next}>
        <p className="text-sm leading-relaxed text-muted-foreground">
          想像在你離開這個世界以後，身邊重要的人會怎麼描述你。
        </p>

        <div className="mt-6 rounded-3xl bg-gradient-soft p-6 shadow-soft">
          <p className="text-base font-bold leading-relaxed text-foreground">
            「我是
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="名字"
              className="mx-1 w-28 rounded-xl bg-card px-3 py-1.5 text-base text-foreground shadow-soft placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            ，在我離開這個世界以後……」
          </p>
          <p className="mt-4 text-base font-bold leading-relaxed text-foreground">
            「我身邊重要的人，會形容我是一個
          </p>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例如：溫暖、值得信賴、認真生活"
            className="mt-2 w-full rounded-2xl bg-card px-4 py-3 text-sm text-foreground shadow-soft placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="mt-2 text-base font-bold leading-relaxed text-foreground">的人。」</p>
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 4：送給你的一首歌（備案靜態版） ──────────────────────────
  if (step === 4) {
    return (
      <WorkshopLayout step={4} total={TOTAL_STEPS} title="送給你的一首歌" onBack={back} onNext={next}>
        <div className="mt-2 flex flex-col items-center rounded-3xl bg-gradient-soft p-8 text-center shadow-soft">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-card text-5xl shadow-soft">
            🎵
          </div>
          <p className="mt-6 text-base font-bold leading-relaxed text-foreground">
            恭喜你走完了這一生。
          </p>
          <p className="mt-3 text-sm leading-relaxed text-foreground/80">
            接下來，PSYbyPSY 想要送給大家的一首歌
          </p>
          <p className="mt-2 text-lg font-extrabold tracking-wide text-primary">
            《生命最後一天》
          </p>
        </div>
        <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
          給自己一段安靜的時間，讓剛剛浮現的情緒慢慢沉澱。準備好了再繼續，不用急。
        </p>
      </WorkshopLayout>
    )
  }

  // ── 步驟 5：寫下未來一個月可以做的事情 ────────────────────────────
  if (step === 5) {
    return (
      <WorkshopLayout
        step={5}
        total={TOTAL_STEPS}
        title="未來一個月，我想要…"
        onBack={back}
        onNext={next}
        nextLabel="完成"
        nextVariant="done"
      >
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          回到現在這一刻。寫下接下來一個月，你想要做的事 —— 可以很小，例如一通電話、一次拜訪，或一句一直想說卻還沒說出口的話。
        </div>

        <div className="mt-4">
          <WorkshopTextarea
            value={action}
            onChange={setAction}
            placeholder="接下來一個月，我想要……"
            rows={7}
            voice
          />
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 6：完成練習（整合圖下載 + 發佈到社群） ───────────────────
  return (
    <>
      <div ref={summaryCardRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0" style={{ width: 1080, height: 1440 }}>
        <SummaryShareCard
          unfinished={unfinished}
          people={people}
          description={description}
          action={action}
          date={today}
        />
      </div>

      <WorkshopLayout step={6} total={TOTAL_STEPS} title="今天的整理 🕊️">
        <p className="text-sm leading-relaxed text-muted-foreground">
          把你今天澄清的事、希望被記得的樣子，與決定踏出的一步放在一起：
        </p>

        <SummaryCard label="放在心上、卻還沒完成的事" content={unfinished} />
        <SummaryCard label="我牽掛的人，想說的話" content={people} />
        {description.trim() && (
          <SummaryCard label="我希望被記得的樣子" content={`一個「${description.trim()}」的人`} />
        )}
        <SummaryCard label="接下來一個月，我想要" content={action} highlight />

        <button
          type="button"
          onClick={() => handleDownload(summaryCardRef, `last-day-summary-${isoDate(new Date())}.png`, '生命最後一天 · 我的整理')}
          disabled={sharing}
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full border border-border bg-white text-sm font-extrabold tracking-[0.15em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
        >
          {sharing ? '正在生成圖片…' : downloadLabel}
        </button>

        {/* 發佈到社群 */}
        <div className="mt-6 rounded-3xl bg-card p-5 shadow-soft">
          <p className="text-sm font-extrabold text-foreground">把你的整理分享到社群</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            分享你希望被記得的樣子，與接下來一個月想做的事，和大家彼此鼓勵。
          </p>
          <PrivacyPicker privacy={privacy} onChange={setPrivacy} disabled={publishing || published} />
          <button
            type="button"
            onClick={publish}
            disabled={publishing || published || !userId}
            className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-primary text-base font-extrabold tracking-[0.15em] text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {publishing ? '發佈中…' : published ? '已發佈 ✓' : '🕊️ 發佈並前往社群'}
          </button>
          {!userId && (
            <p className="mt-2 text-center text-xs text-muted-foreground">尚未登入，無法發佈到社群。</p>
          )}
        </div>

        <CompletionActions onRestart={restart} />
      </WorkshopLayout>
    </>
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
    <div className={`mt-4 rounded-3xl p-4 shadow-soft ${highlight ? 'bg-gradient-soft' : 'bg-card'}`}>
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
        {content.trim() || '（沒有留下文字）'}
      </p>
    </div>
  )
}

function PrivacyPicker({
  privacy,
  onChange,
  disabled,
}: {
  privacy: Privacy
  onChange: (p: Privacy) => void
  disabled?: boolean
}) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {PRIVACY_OPTIONS.map((opt) => {
        const active = privacy === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            aria-pressed={active}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60 ${
              active ? 'border-primary bg-primary/10' : 'border-border bg-muted/40 hover:bg-muted'
            }`}
          >
            <span className="text-lg leading-none">{opt.emoji}</span>
            <span className="flex-1">
              <span className={`block text-sm font-bold ${active ? 'text-primary' : 'text-foreground'}`}>
                {opt.label}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{opt.hint}</span>
            </span>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                active ? 'border-primary' : 'border-border'
              }`}
            >
              {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function formatDate(date: Date): string {
  const days = ['日', '一', '二', '三', '四', '五', '六']
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y} / ${m} / ${d}（星期${days[date.getDay()]}）`
}

// ════════════════════════════════════════════════════════════════════════
// 下載圖卡（html-to-image 用，畫面外 1080×1440）
// ════════════════════════════════════════════════════════════════════════

const CARD_BASE: React.CSSProperties = {
  width: 1080,
  height: 1440,
  background: 'linear-gradient(160deg,#e7eef7 0%,#eef1f6 50%,#f1ece6 100%)',
  padding: '72px 72px 60px',
  boxSizing: 'border-box',
  fontFamily: 'PingFang TC, Microsoft JhengHei, sans-serif',
  color: '#2a2a32',
  display: 'flex',
  flexDirection: 'column',
  gap: 30,
}

function CardLogo() {
  return (
    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
      <img
        src="/assets/logo-full-color.png"
        alt="PSYbyPSY"
        style={{ height: 48, objectFit: 'contain', opacity: 0.7 }}
        crossOrigin="anonymous"
      />
    </div>
  )
}

function CardBlock({
  label,
  value,
  accent = '#6B7280',
  highlight = false,
}: {
  label: string
  value: string
  accent?: string
  highlight?: boolean
}) {
  return (
    <div
      style={{
        background: highlight ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.6)',
        borderRadius: 28,
        padding: '26px 34px',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, marginBottom: 12 }}>{label}</div>
      <div style={{ fontSize: 27, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{value.trim() || '—'}</div>
    </div>
  )
}

function ReflectShareCard({
  unfinished,
  people,
  date,
}: {
  unfinished: string
  people: string
  date: string
}) {
  return (
    <div style={CARD_BASE}>
      <div>
        <div style={{ fontSize: 16, letterSpacing: 8, fontWeight: 800, opacity: 0.5 }}>PSY BY PSY · LAST DAY</div>
        <div style={{ fontSize: 50, fontWeight: 800, marginTop: 18, lineHeight: 1.2 }}>生命中的最後一天</div>
        <div style={{ fontSize: 22, opacity: 0.6, marginTop: 10 }}>{date}</div>
      </div>
      <CardBlock label="放在心上、卻還沒完成的事" value={unfinished} accent="#8a6fae" />
      <CardBlock label="我牽掛的人，想說的話" value={people} accent="#c08a4a" />
      <CardLogo />
    </div>
  )
}

function SummaryShareCard({
  unfinished,
  people,
  description,
  action,
  date,
}: {
  unfinished: string
  people: string
  description: string
  action: string
  date: string
}) {
  return (
    <div style={CARD_BASE}>
      <div>
        <div style={{ fontSize: 16, letterSpacing: 8, fontWeight: 800, opacity: 0.5 }}>PSY BY PSY · LAST DAY</div>
        <div style={{ fontSize: 50, fontWeight: 800, marginTop: 16, lineHeight: 1.2 }}>今天的整理</div>
        <div style={{ fontSize: 22, opacity: 0.6, marginTop: 10 }}>{date}</div>
      </div>
      <CardBlock label="放在心上、卻還沒完成的事" value={unfinished} accent="#8a6fae" />
      <CardBlock label="我牽掛的人，想說的話" value={people} accent="#c08a4a" />
      {description.trim() && (
        <CardBlock label="我希望被記得的樣子" value={`一個「${description.trim()}」的人`} accent="#3F7BD6" />
      )}
      <CardBlock label="接下來一個月，我想要" value={action} accent="#2E9E8F" highlight />
      <CardLogo />
    </div>
  )
}
