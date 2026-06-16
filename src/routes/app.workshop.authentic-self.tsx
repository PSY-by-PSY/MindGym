import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { WorkshopGate } from '../components/workshop/WorkshopGate'
import {
  WorkshopLayout,
  WorkshopTextarea,
  CompletionActions,
} from '../components/workshop/WorkshopUI'

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

const TOTAL_STEPS = 6

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
  const [step, setStep] = useState(1)
  const [workItems, setWorkItems] = useState<Triple>(emptyTriple)
  const [lifeItems, setLifeItems] = useState<Triple>(emptyTriple)
  const [deepWriting, setDeepWriting] = useState('')
  const [workReflection, setWorkReflection] = useState('')
  const [lifeReflection, setLifeReflection] = useState('')
  const [narrative, setNarrative] = useState<Narrative>({ who: '', did: '', kind: '' })

  const restart = () => {
    setWorkItems(emptyTriple())
    setLifeItems(emptyTriple())
    setDeepWriting('')
    setWorkReflection('')
    setLifeReflection('')
    setNarrative({ who: '', did: '', kind: '' })
    setStep(1)
  }

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const back = () => setStep((s) => Math.max(s - 1, 1))

  const setWorkAt = (i: number, v: string) =>
    setWorkItems((prev) => prev.map((x, j) => (j === i ? v : x)) as Triple)
  const setLifeAt = (i: number, v: string) =>
    setLifeItems((prev) => prev.map((x, j) => (j === i ? v : x)) as Triple)

  // ── 步驟 1：課前回顧 ──────────────────────────────────────────────
  if (step === 1) {
    return (
      <WorkshopLayout
        step={1}
        total={TOTAL_STEPS}
        title="課前回顧"
        onNext={next}
      >
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          請分別在「工作」與「生活」上，各寫下 3 件對你而言{' '}
          <strong className="font-bold text-foreground">重要、重大、印象深刻，且出自於你自主決定</strong>{' '}
          的事情。先不用排順序，想到什麼就寫下來。
        </div>

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

  // ── 步驟 2：深入書寫 ──────────────────────────────────────────────
  if (step === 2) {
    return (
      <WorkshopLayout
        step={2}
        total={TOTAL_STEPS}
        title="深入書寫"
        minutes={10}
        onBack={back}
        onNext={next}
      >
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          想像你正要向一位夥伴介紹這幾件事，寫下你會怎麼說，以及為什麼它對你來說很有意義。
        </div>

        <ReferenceList workItems={workItems} lifeItems={lifeItems} />

        <div className="mt-4">
          <WorkshopTextarea
            value={deepWriting}
            onChange={setDeepWriting}
            placeholder="我想跟你介紹……"
            rows={9}
          />
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 3：排序 ──────────────────────────────────────────────────
  if (step === 3) {
    return (
      <WorkshopLayout
        step={3}
        total={TOTAL_STEPS}
        title="排序"
        minutes={5}
        onBack={back}
        onNext={next}
      >
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          用上下箭頭調整順序，把對你{' '}
          <strong className="font-bold text-foreground">最有意義</strong>{' '}
          的事件排到第一名。工作與生活分開排序。
        </div>

        <RankList
          title="工作"
          accent="bg-tile-blue"
          items={workItems}
          onReorder={setWorkItems}
        />
        <RankList
          title="生活"
          accent="bg-tile-mint"
          items={lifeItems}
          onReorder={setLifeItems}
        />
      </WorkshopLayout>
    )
  }

  // ── 步驟 4：深層反思 ──────────────────────────────────────────────
  if (step === 4) {
    return (
      <WorkshopLayout
        step={4}
        total={TOTAL_STEPS}
        title="深層反思"
        minutes={10}
        onBack={back}
        onNext={next}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          針對工作與生活各自排序第一名的事件，書寫：為何覺得它重要、重大，以及它如何影響了你的生命。
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

  // ── 步驟 5：撰寫自我敘事 ──────────────────────────────────────────
  if (step === 5) {
    return (
      <WorkshopLayout
        step={5}
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

  // ── 步驟 6：完成 ──────────────────────────────────────────────────
  return (
    <WorkshopLayout step={6} total={TOTAL_STEPS} title="你的自我敘事 🌟">
      <p className="text-sm leading-relaxed text-muted-foreground">
        這是你今天為自己寫下的敘事：
      </p>

      <div className="mt-5 rounded-3xl bg-gradient-soft p-6 shadow-soft">
        <p className="text-lg font-bold leading-relaxed text-foreground">
          {assembleNarrative(narrative)}
        </p>
      </div>

      <CompletionActions onRestart={restart} />
    </WorkshopLayout>
  )
}

// ─── 子元件 ───────────────────────────────────────────────────────────────

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

function ReferenceList({
  workItems,
  lifeItems,
}: {
  workItems: Triple
  lifeItems: Triple
}) {
  return (
    <div className="mt-4 rounded-3xl bg-muted/40 p-4">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
        你寫下的 6 件事（參考）
      </p>
      <div className="flex flex-col gap-3">
        <RefColumn title="工作" items={workItems} />
        <RefColumn title="生活" items={lifeItems} />
      </div>
    </div>
  )
}

function RefColumn({ title, items }: { title: string; items: Triple }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-foreground/60">{title}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-foreground/85">
            <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
            {item.trim() || <span className="text-muted-foreground/50">（未填寫）</span>}
          </li>
        ))}
      </ul>
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
          <li
            key={i}
            className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft"
          >
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
              <MoveButton
                dir="down"
                disabled={i === items.length - 1}
                onClick={() => move(i, i + 1)}
              />
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
        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          {rank}
        </span>
      </div>
      <div className="mb-3 rounded-2xl bg-muted/40 p-3 text-sm font-bold text-foreground">
        {item.trim() || <span className="font-normal text-muted-foreground/60">（第一名尚未填寫，可回上一步調整）</span>}
      </div>
      <WorkshopTextarea
        value={value}
        onChange={onChange}
        placeholder="為何覺得它重要、重大？它如何影響了我的生命？"
        rows={5}
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
      <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-primary">
        即時預覽
      </p>
      <p className="text-base font-bold leading-relaxed text-foreground">
        我是{who}，因為我{did}，所以我是一個{kind}。
      </p>
    </div>
  )
}

function assembleNarrative(n: Narrative): string {
  const who = n.who.trim() || '＿＿＿'
  const did = n.did.trim() || '＿＿＿＿＿'
  const kind = n.kind.trim() || '＿＿＿＿＿＿＿'
  return `我是${who}，因為我${did}，所以我是一個${kind}。`
}
