import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { WorkshopGate } from '../components/workshop/WorkshopGate'
import {
  WorkshopLayout,
  WorkshopTextarea,
  CompletionActions,
} from '../components/workshop/WorkshopUI'
import { supabase } from '../lib/supabase'
import { insertCommunityPost, markStreak } from '../lib/communityPost'
import { isoLocalDate } from '../lib/date'
import { getWorkshopId } from '../lib/workshop'
import { downloadNodeAsPng, isMobileDevice } from '../lib/shareImage'
import { DEFAULT_PRIVACY } from '../lib/privacy'

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

const TOTAL_STEPS = 9

interface Farewell {
  name: string
  friend: string
  family: string
  world: string
}

function LastDayFlow() {
  const navigate = useNavigate()
  const router = useRouter()
  const [step, setStep] = useState(1)

  // 步驟 3：意識流自由書寫（單一大型書寫框）
  const [stream, setStream] = useState('')
  // 步驟 6：自我告別敘事
  const [farewell, setFarewell] = useState<Farewell>({ name: '', friend: '', family: '', world: '' })
  // 步驟 8：未來一個月想要
  const [action, setAction] = useState('')

  const [userId, setUserId] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [sharing, setSharing] = useState(false)

  const streamCardRef = useRef<HTMLDivElement>(null)
  const farewellCardRef = useRef<HTMLDivElement>(null)
  const summaryCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null)
    })
  }, [])

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const back = () => setStep((s) => Math.max(s - 1, 1))
  const restart = () => {
    setStream('')
    setFarewell({ name: '', friend: '', family: '', world: '' })
    setAction('')
    setPublishing(false)
    setPublished(false)
    setStep(1)
  }

  const setFarewellAt = (k: keyof Farewell, v: string) =>
    setFarewell((prev) => ({ ...prev, [k]: v }))

  const today = formatDate(new Date())
  const farewellText = assembleFarewell(farewell)
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
      const act = action.trim()
      const workshopId = getWorkshopId()
      const entryId = await insertCommunityPost(
        userId,
        'workshop_last_day',
        {
          item_1: farewellText || '我希望被記得的樣子',
          item_2: act,
          item_3: '',
          ai_feedback: null,
        },
        DEFAULT_PRIVACY,
        {
          v: 'last_day',
          stream: stream.trim(),
          name: farewell.name.trim(),
          friend: farewell.friend.trim(),
          family: farewell.family.trim(),
          world: farewell.world.trim(),
          farewell: farewellText,
          action: act,
          workshop_id: workshopId,
        },
      )
      setPublished(true)
      await markStreak(userId)
      await router.invalidate()
      // 規格 [3]：發佈後導引至「當天工作坊貼文頁面」。
      navigate({
        to: '/app/community',
        search: { workshop: workshopId, ...(entryId ? { focus: entryId } : {}) },
      })
    } catch (e) {
      console.error('[last-day publish]', e)
      setPublishing(false)
      alert('發佈失敗，請稍後再試一次。')
    }
  }

  // ── 步驟 1：活動說明（純文字，無書寫框架） ─────────────────────────
  if (step === 1) {
    return (
      <WorkshopLayout step={1} total={TOTAL_STEPS} title="生命中的最後一天" onNext={next}>
        <div className="rounded-3xl bg-card p-5 shadow-soft text-sm leading-relaxed text-foreground/85">
          <p className="text-base font-bold text-foreground">
            如果人生只剩下一天，你想要怎麼活、想做哪些事情、想見哪些人？
          </p>

          <div className="mt-4">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">活動流程</p>
            <ol className="mt-2 flex flex-col gap-1.5">
              <li>1. 冥想引導：5 min</li>
              <li>2. 自由書寫：5 min</li>
            </ol>
          </div>
        </div>

        <div className="mt-4 rounded-3xl bg-gradient-soft p-5 shadow-soft text-sm leading-relaxed text-foreground/85">
          <p className="text-xs font-extrabold text-primary">💡 我的意識流：自由書寫原則</p>
          <ul className="mt-2 flex flex-col gap-2">
            <li>
              <span className="font-bold text-foreground">不間斷書寫：</span>
              不停筆，寫下腦中浮現的思緒、感受，即使沒有靈感，也持續書寫。
            </li>
            <li>
              <span className="font-bold text-foreground">不回頭修改：</span>
              不檢查、不刪除、不修正，不管語法、標點、句子通順與否。
            </li>
            <li>
              <span className="font-bold text-foreground">不糾結詞語：</span>
              若真的卡住，想不到詞語時，可以用符號代替，或重複寫「我不知道該寫什麼」。
            </li>
          </ul>
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 2：冥想引導（純文字） ─────────────────────────────────────
  if (step === 2) {
    return (
      <WorkshopLayout step={2} total={TOTAL_STEPS} title="冥想引導" minutes={5} onBack={back} onNext={next}>
        <div className="mt-2 flex flex-col items-center rounded-3xl bg-gradient-soft p-8 text-center shadow-soft">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-card text-5xl shadow-soft">
            🧘
          </div>
          <p className="mt-6 text-base font-bold leading-relaxed text-foreground">
            冥想引導 5min
          </p>
          <p className="mt-3 text-sm leading-relaxed text-foreground/80">
            請你找到一個自在、舒適的坐姿，跟隨引導，慢慢把心穩定下來。
          </p>
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 3：問題整合 + 大型書寫框（意識流自由書寫） ─────────────────
  if (step === 3) {
    return (
      <WorkshopLayout step={3} total={TOTAL_STEPS} title="自由書寫" minutes={5} onBack={back} onNext={next}>
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/85">
          <p>跟著心裡浮現的念頭，不間斷地寫下來。你可以用打字，也可以用語音輸入。</p>
          <ul className="mt-3 flex flex-col gap-2 font-bold text-foreground">
            <li className="flex gap-2">
              <span className="text-primary">・</span>
              哪些是我放在心上，對我而言很重要的事情，卻沒有機會、沒有勇氣去完成的？
            </li>
            <li className="flex gap-2">
              <span className="text-primary">・</span>
              哪些是我牽掛的人？我想把時間花在誰身上？我還想跟誰說什麼話？
            </li>
          </ul>
        </div>

        <div className="mt-4">
          <WorkshopTextarea
            value={stream}
            onChange={setStream}
            placeholder="不停筆，寫下腦中浮現的思緒、感受……"
            rows={12}
            voice
          />
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 4：字卡儲存（把意識流文字生成圖儲存） ─────────────────────
  if (step === 4) {
    return (
      <>
        <div ref={streamCardRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0" style={{ width: 1080, height: 1440 }}>
          <StreamShareCard stream={stream} date={today} />
        </div>

        <WorkshopLayout step={4} total={TOTAL_STEPS} title="把今天的意識流留下來" onBack={back} onNext={next}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            這是你剛剛不間斷寫下的內容，你可以把它儲存下來，留作紀念。
          </p>

          <div className="mt-5 rounded-3xl bg-card p-5 shadow-soft">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
              {stream.trim() || '（沒有留下文字）'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleDownload(streamCardRef, `last-day-stream-${isoLocalDate(new Date())}.png`, '生命最後一天 · 自由書寫')}
            disabled={sharing}
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full border border-border bg-white text-sm font-extrabold tracking-[0.15em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {sharing ? '正在生成圖片…' : downloadLabel}
          </button>
        </WorkshopLayout>
      </>
    )
  }

  // ── 步驟 5：概念引導（純文字說明，無書寫框架） ─────────────────────
  if (step === 5) {
    return (
      <WorkshopLayout step={5} total={TOTAL_STEPS} title="當我離開以後" onBack={back} onNext={next}>
        <div className="mt-2 flex flex-col items-center rounded-3xl bg-gradient-soft p-8 text-center shadow-soft">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-card text-4xl shadow-soft">
            🕊️
          </div>
          <p className="mt-6 text-base font-bold leading-relaxed text-foreground">
            當我離開以後
          </p>
          <p className="mt-3 text-sm leading-relaxed text-foreground/80">
            我希望對世界產生什麼樣的影響力？我希望大家如何記得我？
          </p>
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 6：自我告別敘事（書寫框架，多行；移除「」引號） ────────────
  if (step === 6) {
    return (
      <WorkshopLayout step={6} total={TOTAL_STEPS} title="當我離開以後" onBack={back} onNext={next}>
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/85">
          <p className="font-bold text-foreground">
            我希望對世界產生什麼樣的影響力？我希望大家如何記得我？
          </p>
          <p className="mt-2">
            想像在你離開這個世界以後，身邊重要的人會怎麼描述你。
          </p>
        </div>

        <FarewellPreview farewell={farewell} />

        <div className="mt-5 flex flex-col gap-4">
          <FarewellField
            prefix="我是"
            suffix="，在我離開這個世界以後…"
            placeholder="名字"
            value={farewell.name}
            onChange={(v) => setFarewellAt('name', v)}
          />
          <FarewellField
            prefix="我的朋友，會形容我是一個"
            suffix="的人。"
            placeholder="例如：溫暖、值得信賴"
            value={farewell.friend}
            onChange={(v) => setFarewellAt('friend', v)}
          />
          <FarewellField
            prefix="我的伴侶／家人／孩子，會形容我是一個"
            suffix="的人。"
            placeholder="例如：認真生活、願意陪伴"
            value={farewell.family}
            onChange={(v) => setFarewellAt('family', v)}
          />
          <FarewellField
            prefix="最後，我希望這個社會／國家／世界／宇宙，記得我是一個"
            suffix="的人。"
            placeholder="例如：努力讓世界更溫柔"
            value={farewell.world}
            onChange={(v) => setFarewellAt('world', v)}
          />
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 7：圖片生成與儲存（自我告別敘事字卡） ─────────────────────
  if (step === 7) {
    return (
      <>
        <div ref={farewellCardRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0" style={{ width: 1080, height: 1440 }}>
          <FarewellShareCard farewell={farewellText} date={today} />
        </div>

        <WorkshopLayout step={7} total={TOTAL_STEPS} title="我希望被記得的樣子" onBack={back} onNext={next}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            這是你寫下、希望被記得的樣子，你可以把它儲存下來，留作紀念。
          </p>

          <div className="mt-5 rounded-3xl bg-gradient-soft p-6 shadow-soft">
            <FarewellNarrative
              farewell={farewell}
              className="text-base font-bold leading-relaxed text-foreground"
            />
          </div>

          <button
            type="button"
            onClick={() => handleDownload(farewellCardRef, `last-day-farewell-${isoLocalDate(new Date())}.png`, '當我離開以後')}
            disabled={sharing}
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full border border-border bg-white text-sm font-extrabold tracking-[0.15em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {sharing ? '正在生成圖片…' : downloadLabel}
          </button>
        </WorkshopLayout>
      </>
    )
  }

  // ── 步驟 8：未來一個月，我想要（取代原音樂頁） ──────────────────────
  if (step === 8) {
    return (
      <WorkshopLayout
        step={8}
        total={TOTAL_STEPS}
        title="未來一個月，我想要…"
        onBack={back}
        onNext={next}
        nextLabel="完成"
        nextVariant="done"
      >
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/85">
          回到現在這一刻。寫下接下來一個月，你想要做的事 —— 可以很小，例如一通電話、一次拜訪，或一句一直想說卻還沒說出口的話。
        </div>

        <div className="mt-4">
          <WorkshopTextarea
            value={action}
            onChange={setAction}
            placeholder="接下來一個月，我想要……"
            rows={8}
            voice
          />
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 9：結尾整合頁面（自我告別敘事 + 未來一個月） ───────────────
  return (
    <>
      {/* 畫面外高解析下載圖（整理：四句告別敘事 + 接下來一個月想要） */}
      <div ref={summaryCardRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0" style={{ width: 1080, height: 1440 }}>
        <SummaryShareCard farewell={farewellText} action={action} date={today} />
      </div>

      <WorkshopLayout step={9} total={TOTAL_STEPS} title="今天的整理 🕊️">
        <p className="text-sm leading-relaxed text-muted-foreground">
          把你希望被記得的樣子，與接下來一個月想踏出的一步放在一起：
        </p>

        {/* 我是怎樣的人：四句自我告別敘事（規格 [5]，使用者填入以藍色標記） */}
        <div className="mt-4 rounded-3xl bg-card p-4 shadow-soft">
          <p className="text-xs font-bold text-muted-foreground">我是怎樣的人</p>
          <FarewellNarrative
            farewell={farewell}
            className="mt-1.5 text-sm leading-relaxed text-foreground/85"
          />
        </div>
        <SummaryCard label="接下來一個月，我想要" content={action} highlight />

        <button
          type="button"
          onClick={() => handleDownload(summaryCardRef, `last-day-summary-${isoLocalDate(new Date())}.png`, '生命最後一天 · 今天的整理')}
          disabled={sharing}
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full border border-border bg-white text-sm font-extrabold tracking-[0.15em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
        >
          {sharing ? '正在生成圖片…' : downloadLabel}
        </button>

        {/* 發佈到工作坊貼文（規格 [1]：工作坊一定直接分享到工作坊貼文，不再選擇隱私） */}
        <div className="mt-6 rounded-3xl bg-card p-5 shadow-soft">
          <p className="text-sm font-extrabold text-foreground">把你的整理分享到工作坊</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            分享你希望被記得的樣子，與接下來一個月想做的事，和工作坊夥伴彼此鼓勵。
          </p>
          <button
            type="button"
            onClick={publish}
            disabled={publishing || published || !userId}
            className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-primary text-base font-extrabold tracking-[0.15em] text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {publishing ? '發佈中…' : published ? '已發佈 ✓' : '🕊️ 發佈到工作坊貼文'}
          </button>
          {!userId && (
            <p className="mt-2 text-center text-xs text-muted-foreground">尚未登入，無法發佈到工作坊貼文。</p>
          )}
        </div>

        <CompletionActions onRestart={restart} />
      </WorkshopLayout>
    </>
  )
}

// ─── 子元件 ───────────────────────────────────────────────────────────────

// 使用者填入的內容以藍色標記，方便辨識自己寫的字（規格 [4][5]）。
function FilledText({ children }: { children: React.ReactNode }) {
  return <span className="font-bold text-blue-600">{children}</span>
}

// 四句自我告別敘事：固定句型 + 使用者填入（藍色）。空白以底線佔位。
function FarewellNarrative({ farewell, className }: { farewell: Farewell; className?: string }) {
  const blank = (v: string) =>
    v.trim() ? (
      <FilledText>{v.trim()}</FilledText>
    ) : (
      <span className="text-muted-foreground/50">＿＿＿＿</span>
    )
  return (
    <p className={`whitespace-pre-wrap leading-relaxed ${className ?? ''}`}>
      我是{blank(farewell.name)}，在我離開這個世界以後…{'\n'}
      我的朋友，會形容我是一個{blank(farewell.friend)}的人。{'\n'}
      我的伴侶／家人／孩子，會形容我是一個{blank(farewell.family)}的人。{'\n'}
      最後，我希望在我離開之後，這個社會／國家／世界／宇宙，記得我是一個{blank(farewell.world)}的人。
    </p>
  )
}

// 自我告別敘事的單行填空（規格 [6]：多行 textarea；移除中文「」引號）。
function FarewellField({
  prefix,
  suffix,
  placeholder,
  value,
  onChange,
}: {
  prefix: string
  suffix: string
  placeholder?: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="rounded-3xl bg-card p-4 shadow-soft">
      <p className="text-sm font-bold leading-relaxed text-foreground">
        {prefix}
        {suffix && <span className="text-muted-foreground">{suffix}</span>}
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="mt-2 w-full resize-y rounded-2xl bg-muted/50 px-4 py-3 text-sm leading-relaxed text-foreground shadow-soft placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  )
}

function FarewellPreview({ farewell }: { farewell: Farewell }) {
  return (
    <div className="mt-4 rounded-3xl bg-gradient-soft p-5 shadow-soft">
      <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-primary">即時預覽</p>
      <FarewellNarrative farewell={farewell} className="text-base font-bold text-foreground" />
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

// 組裝自我告別敘事文本（移除中文「」引號；空白以底線佔位）。
function assembleFarewell(f: Farewell): string {
  const name = f.name.trim() || '＿＿＿＿'
  const friend = f.friend.trim() || '＿＿＿＿'
  const family = f.family.trim() || '＿＿＿＿'
  const world = f.world.trim() || '＿＿＿＿'
  return (
    `我是${name}，在我離開這個世界以後…\n` +
    `我的朋友，會形容我是一個${friend}的人。\n` +
    `我的伴侶／家人／孩子，會形容我是一個${family}的人。\n` +
    `最後，我希望在我離開之後，這個社會／國家／世界／宇宙，記得我是一個${world}的人。`
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

function StreamShareCard({ stream, date }: { stream: string; date: string }) {
  return (
    <div style={CARD_BASE}>
      <div>
        <div style={{ fontSize: 16, letterSpacing: 8, fontWeight: 800, opacity: 0.5 }}>PSY BY PSY · LAST DAY</div>
        <div style={{ fontSize: 50, fontWeight: 800, marginTop: 18, lineHeight: 1.2 }}>生命中的最後一天</div>
        <div style={{ fontSize: 22, opacity: 0.6, marginTop: 10 }}>{date}</div>
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,0.7)',
          borderRadius: 32,
          padding: '40px 44px',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        <div style={{ fontSize: 30, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{stream.trim() || '—'}</div>
      </div>
      <CardLogo />
    </div>
  )
}

function FarewellShareCard({ farewell, date }: { farewell: string; date: string }) {
  return (
    <div style={CARD_BASE}>
      <div>
        <div style={{ fontSize: 16, letterSpacing: 8, fontWeight: 800, opacity: 0.5 }}>PSY BY PSY · LAST DAY</div>
        <div style={{ fontSize: 50, fontWeight: 800, marginTop: 18, lineHeight: 1.2 }}>當我離開以後</div>
        <div style={{ fontSize: 22, opacity: 0.6, marginTop: 10 }}>{date}</div>
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,0.78)',
          borderRadius: 32,
          padding: '48px 44px',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{farewell}</div>
      </div>
      <CardLogo />
    </div>
  )
}

// 步驟 9「今天的整理」字卡：四句自我告別敘事 + 接下來一個月想要。
function SummaryShareCard({ farewell, action, date }: { farewell: string; action: string; date: string }) {
  return (
    <div style={CARD_BASE}>
      <div>
        <div style={{ fontSize: 16, letterSpacing: 8, fontWeight: 800, opacity: 0.5 }}>PSY BY PSY · LAST DAY</div>
        <div style={{ fontSize: 50, fontWeight: 800, marginTop: 18, lineHeight: 1.2 }}>今天的整理</div>
        <div style={{ fontSize: 22, opacity: 0.6, marginTop: 10 }}>{date}</div>
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,0.78)',
          borderRadius: 32,
          padding: '40px 44px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 32,
        }}
      >
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, opacity: 0.55, marginBottom: 14 }}>我是怎樣的人</div>
          <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{farewell}</div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, opacity: 0.55, marginBottom: 14 }}>接下來一個月，我想要</div>
          <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{action.trim() || '—'}</div>
        </div>
      </div>
      <CardLogo />
    </div>
  )
}
