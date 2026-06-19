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

export const Route = createFileRoute('/app/workshop/authentic-self')({
  component: AuthenticSelfModule,
})

function AuthenticSelfModule() {
  return (
    <WorkshopGate>
      <AuthenticSelfFlow />
    </WorkshopGate>
  )
}

const TOTAL_STEPS = 8

const WORK_LABELS = ['工作・第 1 件', '工作・第 2 件', '工作・第 3 件']
const LIFE_LABELS = ['生活・第 1 件', '生活・第 2 件', '生活・第 3 件']

type Triple = [string, string, string]
const emptyTriple = (): Triple => ['', '', '']

interface Narrative {
  who: string
  did: string
  kind: string
}

function AuthenticSelfFlow() {
  const navigate = useNavigate()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [workItems, setWorkItems] = useState<Triple>(emptyTriple)
  const [lifeItems, setLifeItems] = useState<Triple>(emptyTriple)
  const [workReflection, setWorkReflection] = useState('')
  const [lifeReflection, setLifeReflection] = useState('')
  const [narrative, setNarrative] = useState<Narrative>({ who: '', did: '', kind: '' })

  const [userId, setUserId] = useState<string | null>(null)
  const [privacy, setPrivacy] = useState<Privacy>(DEFAULT_PRIVACY)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [sharing, setSharing] = useState(false)

  const rankCardRef = useRef<HTMLDivElement>(null)
  const narrativeCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null))
  }, [])

  const restart = () => {
    setWorkItems(emptyTriple())
    setLifeItems(emptyTriple())
    setWorkReflection('')
    setLifeReflection('')
    setNarrative({ who: '', did: '', kind: '' })
    setPrivacy(DEFAULT_PRIVACY)
    setPublishing(false)
    setPublished(false)
    setStep(1)
  }

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const back = () => setStep((s) => Math.max(s - 1, 1))

  const setWorkAt = (i: number, v: string) =>
    setWorkItems((prev) => prev.map((x, j) => (j === i ? v : x)) as Triple)
  const setLifeAt = (i: number, v: string) =>
    setLifeItems((prev) => prev.map((x, j) => (j === i ? v : x)) as Triple)

  const topWork = workItems[0]?.trim() ?? ''
  const topLife = lifeItems[0]?.trim() ?? ''

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
      const narrativeText = assembleNarrative(narrative)
      const entryId = await insertCommunityPost(
        userId,
        'workshop_authentic_self',
        {
          item_1: narrativeText,
          item_2: topWork ? `工作：${topWork}` : '',
          item_3: topLife ? `生活：${topLife}` : '',
          ai_feedback: null,
        },
        privacy,
        { v: 'authentic_self', top_work: topWork, top_life: topLife, narrative: narrativeText },
      )
      setPublished(true)
      await markStreak(userId)
      await router.invalidate()
      navigate({
        to: '/app/community',
        search: entryId ? { focus: entryId } : { showEntry: 1 },
      })
    } catch (e) {
      console.error('[authentic-self publish]', e)
      setPublishing(false)
      alert('發佈失敗，請稍後再試一次。')
    }
  }

  const today = formatDate(new Date())
  const downloadLabel = isMobileDevice() ? '📲 分享圖片' : '⬇️ 儲存圖片'

  // ── 步驟 1：覺察重要生命事件（工作） ──────────────────────────────
  if (step === 1) {
    return (
      <WorkshopLayout step={1} total={TOTAL_STEPS} title="覺察重要生命事件" onNext={next}>
        <AwarenessGuide />
        <FieldGroup title="工作上的 3 件事" accent="bg-tile-blue">
          {WORK_LABELS.map((label, i) => (
            <LabeledField
              key={label}
              label={label}
              value={workItems[i]}
              onChange={(v) => setWorkAt(i, v)}
              placeholder="例如：主動爭取負責一個新專案"
            />
          ))}
        </FieldGroup>
      </WorkshopLayout>
    )
  }

  // ── 步驟 2：覺察重要生命事件（生活） ──────────────────────────────
  if (step === 2) {
    return (
      <WorkshopLayout step={2} total={TOTAL_STEPS} title="覺察重要生命事件" onBack={back} onNext={next}>
        <AwarenessGuide />
        <FieldGroup title="生活上的 3 件事" accent="bg-tile-mint">
          {LIFE_LABELS.map((label, i) => (
            <LabeledField
              key={label}
              label={label}
              value={lifeItems[i]}
              onChange={(v) => setLifeAt(i, v)}
              placeholder="例如：決定開始長期的運動習慣"
            />
          ))}
        </FieldGroup>
      </WorkshopLayout>
    )
  }

  // ── 步驟 3：排序重要生命事件 ──────────────────────────────────────
  if (step === 3) {
    return (
      <WorkshopLayout step={3} total={TOTAL_STEPS} title="排序重要生命事件" minutes={5} onBack={back} onNext={next}>
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          用上下箭頭調整順序，把對你{' '}
          <strong className="font-bold text-foreground">最有影響力、最重要</strong>{' '}
          的事件排到第一名。工作與生活分開排序。
        </div>

        <RankList title="工作" accent="bg-tile-blue" items={workItems} onReorder={setWorkItems} />
        <RankList title="生活" accent="bg-tile-mint" items={lifeItems} onReorder={setLifeItems} />
      </WorkshopLayout>
    )
  }

  // ── 步驟 4：我重要的生命事件（生成圖 + 儲存） ──────────────────────
  if (step === 4) {
    return (
      <>
        {/* 畫面外高解析下載圖 */}
        <div ref={rankCardRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0" style={{ width: 1080, height: 1440 }}>
          <RankShareCard workItems={workItems} lifeItems={lifeItems} date={today} />
        </div>

        <WorkshopLayout step={4} total={TOTAL_STEPS} title="我在工作與生活中的重要生命事件" onBack={back} onNext={next}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            這是你排序後的重要生命事件，你可以把它儲存下來，留作紀念。
          </p>

          <div className="mt-5 rounded-3xl bg-gradient-soft p-5 shadow-soft">
            <RankedColumn title="工作" accent="bg-tile-blue" items={workItems} />
            <div className="my-4 h-px bg-foreground/10" />
            <RankedColumn title="生活" accent="bg-tile-mint" items={lifeItems} />
          </div>

          <button
            type="button"
            onClick={() => handleDownload(rankCardRef, `life-events-${isoDate(new Date())}.png`, '我的重要生命事件')}
            disabled={sharing}
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full border border-border bg-white text-sm font-extrabold tracking-[0.15em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {sharing ? '正在生成圖片…' : downloadLabel}
          </button>
        </WorkshopLayout>
      </>
    )
  }

  // ── 步驟 5：分享你最重要的生命事件（討論環節） ────────────────────
  if (step === 5) {
    return (
      <WorkshopLayout step={5} total={TOTAL_STEPS} title="分享你最重要的生命事件" minutes={10} onBack={back} onNext={next}>
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          <p className="font-bold text-foreground">為什麼這對你來說很重要？</p>
          <p className="mt-1.5">
            兩人一組，針對排序第一的事件，分享你做這件事情的核心原因。時間為 10 分鐘，請大家輪流分享。
          </p>
        </div>

        <p className="mt-6 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          我在工作與生活中最重要的生命事件
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <TopEventCard accent="bg-tile-blue" label="工作中，最重要的事件是" value={topWork} />
          <TopEventCard accent="bg-tile-mint" label="生活中，最重要的事件是" value={topLife} />
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 6：書寫核心原因（含語音輸入） ────────────────────────────
  if (step === 6) {
    return (
      <WorkshopLayout step={6} total={TOTAL_STEPS} title="書寫核心原因" minutes={10} onBack={back} onNext={next}>
        <p className="text-sm leading-relaxed text-muted-foreground">
          針對工作與生活各自排序第一名的事件，書寫：為何覺得它重要、重大，以及它如何影響了你的生命。可以用打字，也可以用語音輸入。
        </p>

        <ReflectionField
          rank="工作・第一名"
          accent="bg-tile-blue"
          item={workItems[0]}
          value={workReflection}
          onChange={setWorkReflection}
        />
        <ReflectionField
          rank="生活・第一名"
          accent="bg-tile-mint"
          item={lifeItems[0]}
          value={lifeReflection}
          onChange={setLifeReflection}
        />
      </WorkshopLayout>
    )
  }

  // ── 步驟 7：撰寫自我敘事 ──────────────────────────────────────────
  if (step === 7) {
    return (
      <WorkshopLayout
        step={7}
        total={TOTAL_STEPS}
        title="撰寫自我敘事"
        minutes={5}
        onBack={back}
        onNext={next}
        nextLabel="完成"
        nextVariant="done"
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          把前面的探索收斂成一句自我敘事，完成下面的填空。
        </p>

        <NarrativePreview narrative={narrative} />

        <div className="mt-5 flex flex-col gap-4">
          <LabeledField
            label="我是＿＿＿"
            value={narrative.who}
            onChange={(v) => setNarrative((n) => ({ ...n, who: v }))}
            placeholder="例如：一個重視成長的人 / 我的名字"
          />
          <LabeledField
            label="因為我＿＿＿＿＿（做過最重要的哪些決定、事情）"
            value={narrative.did}
            onChange={(v) => setNarrative((n) => ({ ...n, did: v }))}
            placeholder="例如：在關鍵時刻選擇了……"
          />
          <LabeledField
            label="所以我是一個＿＿＿＿＿＿＿（什麼樣的人）"
            value={narrative.kind}
            onChange={(v) => setNarrative((n) => ({ ...n, kind: v }))}
            placeholder="例如：勇於為自己做選擇的人"
          />
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 8：你的自我敘事（下載圖 + 發佈到社群） ───────────────────
  return (
    <>
      {/* 畫面外高解析下載圖 */}
      <div ref={narrativeCardRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0" style={{ width: 1080, height: 1440 }}>
        <NarrativeShareCard narrative={assembleNarrative(narrative)} topWork={topWork} topLife={topLife} date={today} />
      </div>

      <WorkshopLayout step={8} total={TOTAL_STEPS} title="你的自我敘事 🌟">
        <p className="text-sm leading-relaxed text-muted-foreground">這是你今天為自己寫下的敘事：</p>

        <div className="mt-5 rounded-3xl bg-gradient-soft p-6 shadow-soft">
          <p className="text-lg font-bold leading-relaxed text-foreground">{assembleNarrative(narrative)}</p>
        </div>

        <button
          type="button"
          onClick={() => handleDownload(narrativeCardRef, `self-narrative-${isoDate(new Date())}.png`, '我的自我敘事')}
          disabled={sharing}
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full border border-border bg-white text-sm font-extrabold tracking-[0.15em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
        >
          {sharing ? '正在生成圖片…' : downloadLabel}
        </button>

        {/* 發佈到社群 */}
        <div className="mt-6 rounded-3xl bg-card p-5 shadow-soft">
          <p className="text-sm font-extrabold text-foreground">把你的自我敘事分享到社群</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            選擇要如何出現在社群打卡牆，鼓勵彼此一起認識真實的自己。
          </p>
          <PrivacyPicker privacy={privacy} onChange={setPrivacy} disabled={publishing || published} />
          <button
            type="button"
            onClick={publish}
            disabled={publishing || published || !userId}
            className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-primary text-base font-extrabold tracking-[0.15em] text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {publishing ? '發佈中…' : published ? '已發佈 ✓' : '🌟 發佈並前往社群'}
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

// 覺察生命事件的引導語（工作頁與生活頁共用）。
function AwarenessGuide() {
  return (
    <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
      <p className="font-bold text-foreground">在過往的工作和生活中，有哪些選擇和行動對我來說：</p>
      <ul className="mt-2 flex flex-col gap-1">
        <li>1）是重要的</li>
        <li>2）是重大的（對我的人生發展有極大幫助的）</li>
        <li>3）是我印象深刻的</li>
        <li>4）且完全出自於我的個人決定</li>
      </ul>
    </div>
  )
}

function FieldGroup({
  title,
  accent,
  children,
}: {
  title: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${accent}`} />
        <h2 className="text-base font-extrabold text-foreground">{title}</h2>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function LabeledField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl bg-card px-4 py-3 text-sm text-foreground shadow-soft placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  )
}

// 排序後的編號清單（畫面上的預覽用）。
function RankedColumn({ title, accent, items }: { title: string; accent: string; items: Triple }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${accent}`} />
        <h3 className="text-sm font-extrabold text-foreground">{title}</h3>
      </div>
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-3">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 text-sm text-foreground/85">
              {item.trim() || <span className="text-muted-foreground/50">（未填寫）</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// 討論頁的「排序第一名」卡片。
function TopEventCard({ accent, label, value }: { accent: string; label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-card p-4 shadow-soft">
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${accent}`} />
        <span className="text-xs font-bold text-muted-foreground">{label}</span>
      </div>
      <p className="text-base font-bold leading-relaxed text-foreground">
        {value || <span className="font-normal text-muted-foreground/60">（第一名尚未填寫，可回上一步調整）</span>}
      </p>
    </div>
  )
}

function RankList({
  title,
  accent,
  items,
  onReorder,
}: {
  title: string
  accent: string
  items: Triple
  onReorder: (next: Triple) => void
}) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return
    const copy = [...items]
    const [x] = copy.splice(from, 1)
    copy.splice(to, 0, x)
    onReorder(copy as Triple)
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${accent}`} />
        <h2 className="text-base font-extrabold text-foreground">{title}</h2>
      </div>
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-foreground/85">
              {item.trim() || <span className="text-muted-foreground/50">（未填寫）</span>}
            </span>
            <div className="flex shrink-0 flex-col gap-1">
              <MoveButton dir="up" disabled={i === 0} onClick={() => move(i, i - 1)} />
              <MoveButton dir="down" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function MoveButton({
  dir,
  disabled,
  onClick,
}: {
  dir: 'up' | 'down'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={dir === 'up' ? '上移' : '下移'}
      className={`flex h-6 w-7 items-center justify-center rounded-lg transition active:scale-90 ${
        disabled
          ? 'cursor-not-allowed text-muted-foreground/30'
          : 'bg-muted text-foreground/70 hover:bg-primary-soft'
      }`}
    >
      <svg
        className={`h-3.5 w-3.5 ${dir === 'down' ? 'rotate-180' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  )
}

function ReflectionField({
  rank,
  accent,
  item,
  value,
  onChange,
}: {
  rank: string
  accent: string
  item: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${accent}`} />
        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{rank}</span>
      </div>
      <div className="mb-3 rounded-2xl bg-muted/40 p-3 text-sm font-bold text-foreground">
        {item.trim() || <span className="font-normal text-muted-foreground/60">（第一名尚未填寫，可回上一步調整）</span>}
      </div>
      <WorkshopTextarea
        value={value}
        onChange={onChange}
        placeholder="為何覺得它重要、重大？它如何影響了我的生命？"
        rows={5}
        voice
      />
    </div>
  )
}

function NarrativePreview({ narrative }: { narrative: Narrative }) {
  const who = narrative.who.trim() || '＿＿＿'
  const did = narrative.did.trim() || '＿＿＿＿＿'
  const kind = narrative.kind.trim() || '＿＿＿＿＿＿＿'
  return (
    <div className="mt-4 rounded-3xl bg-gradient-soft p-5 shadow-soft">
      <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-primary">即時預覽</p>
      <p className="text-base font-bold leading-relaxed text-foreground">
        我是{who}，因為我{did}，所以我是一個{kind}。
      </p>
    </div>
  )
}

// 隱私三選一（與感恩日記、過程目標覺察一致）。
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

function assembleNarrative(n: Narrative): string {
  const who = n.who.trim() || '＿＿＿'
  const did = n.did.trim() || '＿＿＿＿＿'
  const kind = n.kind.trim() || '＿＿＿＿＿＿＿'
  return `我是${who}，因為我${did}，所以我是一個${kind}。`
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
  background: 'linear-gradient(150deg,#dbeafe 0%,#e0f2f1 55%,#ede9fe 100%)',
  padding: '72px 72px 60px',
  boxSizing: 'border-box',
  fontFamily: 'PingFang TC, Microsoft JhengHei, sans-serif',
  color: '#1f2742',
  display: 'flex',
  flexDirection: 'column',
  gap: 32,
}

function CardLogo() {
  return (
    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
      <img
        src="/assets/logo-full-color.png"
        alt="PSYbyPSY"
        style={{ height: 48, objectFit: 'contain', opacity: 0.75 }}
        crossOrigin="anonymous"
      />
    </div>
  )
}

function CardRankColumn({ title, color, items }: { title: string; color: string; items: Triple }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.72)', borderRadius: 32, padding: '28px 36px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginBottom: 16 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span
              style={{
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: '50%',
                background: i === 0 ? color : '#e7e7ef',
                color: i === 0 ? '#fff' : '#8a8a9a',
                fontSize: 22,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontSize: 26, lineHeight: 1.4 }}>{item.trim() || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RankShareCard({
  workItems,
  lifeItems,
  date,
}: {
  workItems: Triple
  lifeItems: Triple
  date: string
}) {
  return (
    <div style={CARD_BASE}>
      <div>
        <div style={{ fontSize: 16, letterSpacing: 8, fontWeight: 800, opacity: 0.55 }}>PSY BY PSY · LIFE EVENTS</div>
        <div style={{ fontSize: 46, fontWeight: 800, marginTop: 18, lineHeight: 1.25 }}>
          我在工作與生活中的重要生命事件
        </div>
        <div style={{ fontSize: 22, opacity: 0.65, marginTop: 10 }}>{date}</div>
      </div>
      <CardRankColumn title="工作" color="#3F7BD6" items={workItems} />
      <CardRankColumn title="生活" color="#2E9E8F" items={lifeItems} />
      <CardLogo />
    </div>
  )
}

function NarrativeShareCard({
  narrative,
  topWork,
  topLife,
  date,
}: {
  narrative: string
  topWork: string
  topLife: string
  date: string
}) {
  return (
    <div style={CARD_BASE}>
      <div>
        <div style={{ fontSize: 16, letterSpacing: 8, fontWeight: 800, opacity: 0.55 }}>PSY BY PSY · SELF NARRATIVE</div>
        <div style={{ fontSize: 52, fontWeight: 800, marginTop: 18, lineHeight: 1.2 }}>我的自我敘事</div>
        <div style={{ fontSize: 22, opacity: 0.65, marginTop: 10 }}>{date}</div>
      </div>

      <div
        style={{
          background: 'rgba(255,255,255,0.78)',
          borderRadius: 32,
          padding: '44px 40px',
          display: 'flex',
          alignItems: 'center',
          minHeight: 360,
        }}
      >
        <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.6 }}>{narrative}</div>
      </div>

      {(topWork || topLife) && (
        <div style={{ background: 'rgba(255,255,255,0.55)', borderRadius: 32, padding: '28px 36px' }}>
          {topWork && (
            <div style={{ fontSize: 24, lineHeight: 1.6, marginBottom: topLife ? 14 : 0 }}>
              <span style={{ fontWeight: 800, color: '#3F7BD6', marginRight: 12 }}>工作・最重要的事件</span>
              {topWork}
            </div>
          )}
          {topLife && (
            <div style={{ fontSize: 24, lineHeight: 1.6 }}>
              <span style={{ fontWeight: 800, color: '#2E9E8F', marginRight: 12 }}>生活・最重要的事件</span>
              {topLife}
            </div>
          )}
        </div>
      )}

      <CardLogo />
    </div>
  )
}
