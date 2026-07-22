// 晤談中（In-Session）示意元件 —— 依 docs/plans/mid_session_mvp_plan.md。
// SessionWorkbenchPreview：心理師端的晤談工作台（/therapist「晤談工作台」分頁）。
// 核心設計：私人視圖（心理師專用，含臨床草稿）／共視視圖（轉向後雙方一起看，
// 大字體、個案友善），兩者用明顯的大按鈕切換，避免轉螢幕前忘記切換而讓臨床
// 底稿曝光。AI 介入只有一處：關鍵字 → 候選卡草稿，未經共視確認不算定稿。
// 全部為示意假資料、只動 local state、不寫資料庫。文案遵守用語法遵規範。
import { useState } from 'react'
import { DemoBanner, Chip, SectionCard, CASES, type IntakeCase } from './PreSessionPreview'

// ── 型別 ────────────────────────────────────────────────────────────────────

type CardKind = 'goal' | 'action'

type SessionCard = {
  id: string
  kind: CardKind
  title: string
  body: string
  /** 僅行動方案卡使用 */
  frequency?: string
}

type Candidate = { title: string; body: string; frequency?: string }

type Step = 'prep' | 'expectations' | 'goals' | 'actions' | 'snapshot' | 'done'

const STEPS: { key: Step; label: string; sharedOnly?: boolean; privateOnly?: boolean }[] = [
  { key: 'prep', label: '準備區', privateOnly: true },
  { key: 'expectations', label: '期待核對' },
  { key: 'goals', label: '目標卡' },
  { key: 'actions', label: '行動方案卡' },
  { key: 'snapshot', label: '狀態快照' },
  { key: 'done', label: '結束' },
]

// ── AI 擴寫（示意：關鍵字比對出候選卡，非真實模型呼叫） ─────────────────────

function expandKeyword(keyword: string, kind: CardKind): Candidate[] {
  const k = keyword.trim()
  if (!k) return []
  if (kind === 'goal') {
    return [
      { title: `留意「${k}」出現的時刻`, body: `不急著改變，先練習在「${k}」發生時，停下來認出它正在發生。` },
      { title: `理解「${k}」在說什麼`, body: `「${k}」背後可能有一個沒被滿足的需要，這階段先弄懂它，不急著解決。` },
    ]
  }
  return [
    {
      title: `${k} 覺察記錄`,
      body: `每次注意到「${k}」，用一句話寫下當下發生了什麼、身體有什麼感覺。`,
      frequency: '想到就記，一天至少 1 次',
    },
    {
      title: `${k} 的下一步`,
      body: `找一件跟「${k}」有關、這週具體做得到的小行動，先從最小的版本開始。`,
      frequency: '本週內做 1 次，下次晤談一起回顧',
    },
  ]
}

// ── 主元件 ──────────────────────────────────────────────────────────────────

let cardSeq = 0
function nextId() {
  cardSeq += 1
  return `card-${cardSeq}`
}

export function SessionWorkbenchPreview() {
  const client: IntakeCase = CASES[1] // 阿哲：延續媒合前/晤談前示意的同一位個案

  const [shared, setShared] = useState(false)
  const [step, setStep] = useState<Step>('prep')
  const [cards, setCards] = useState<SessionCard[]>([])
  const [pushed, setPushed] = useState(false)

  const reset = () => {
    setShared(false)
    setStep('prep')
    setCards([])
    setPushed(false)
  }

  const currentStepDef = STEPS.find((s) => s.key === step)!
  const forcedPrivate = !!currentStepDef.privateOnly
  const effectiveShared = forcedPrivate ? false : shared

  const addCard = (kind: CardKind, c: Candidate) => {
    setCards((prev) => [...prev, { id: nextId(), kind, title: c.title, body: c.body, frequency: c.frequency }])
  }
  const updateCard = (id: string, patch: Partial<SessionCard>) =>
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const removeCard = (id: string) => setCards((prev) => prev.filter((c) => c.id !== id))

  const goalCards = cards.filter((c) => c.kind === 'goal')
  const actionCards = cards.filter((c) => c.kind === 'action')

  return (
    <div>
      <DemoBanner note="這是晤談工作台的示意。個案與內容皆為假資料，互動不會寫入資料庫。" onReset={reset} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-foreground">晤談工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            與 {client.alias} 的晤談 · 首次晤談，帶著初談包的系統觀進來。
          </p>
        </div>
        {!forcedPrivate && (
          <button
            onClick={() => setShared((v) => !v)}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold shadow-soft transition active:scale-[0.98] ${
              effectiveShared ? 'bg-gradient-primary text-primary-foreground' : 'border border-border bg-card text-foreground'
            }`}
          >
            {effectiveShared ? '● 共視視圖（螢幕已轉向個案）' : '○ 私人視圖（僅自己看得到）'}
          </button>
        )}
      </div>
      {forcedPrivate && (
        <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">
          準備區僅供心理師自己閱讀，不會出現在共視畫面。
        </p>
      )}

      {/* 步驟導覽 */}
      <div className="mt-4 flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <button
            key={s.key}
            onClick={() => setStep(s.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
              step === s.key ? 'bg-foreground text-cream' : 'bg-card text-foreground hover:bg-muted'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {step === 'prep' && <PrepView client={client} />}
        {step === 'expectations' && <ExpectationsView client={client} shared={effectiveShared} />}
        {step === 'goals' && (
          <CardBuilderView
            kind="goal"
            title="目標卡"
            hint="這階段一起訂的方向，先訂 1–3 個就好。"
            shared={effectiveShared}
            cards={goalCards}
            onAdd={addCard}
            onUpdate={updateCard}
            onRemove={removeCard}
          />
        )}
        {step === 'actions' && (
          <CardBuilderView
            kind="action"
            title="行動方案卡"
            hint="具體到「什麼時候、做什麼、記什麼」，確認後可指派為回家練習。"
            shared={effectiveShared}
            cards={actionCards}
            onAdd={addCard}
            onUpdate={updateCard}
            onRemove={removeCard}
          />
        )}
        {step === 'snapshot' && <SnapshotView shared={effectiveShared} />}
        {step === 'done' && (
          <DoneView goalCards={goalCards} actionCards={actionCards} pushed={pushed} onPush={() => setPushed(true)} />
        )}
      </div>
    </div>
  )
}

// ── 準備區（私人） ──────────────────────────────────────────────────────────

function PrepView({ client }: { client: IntakeCase }) {
  const p = client.packet
  return (
    <div className="flex flex-col gap-3">
      <SectionCard title="初談包摘要（私人筆記，僅供準備）">
        <p><span className="font-bold">主訴：</span>{p.summary.chief}</p>
        <p className="mt-1"><span className="font-bold">脈絡：</span>{p.summary.context}</p>
      </SectionCard>
      <SectionCard title="上次行動卡完成狀況">
        <p className="text-sm text-foreground/85">首次晤談，尚無前次行動卡可回顧。</p>
      </SectionCard>
      <SectionCard title="推薦切入方向（依初談包 3P 草稿）">
        <div className="flex flex-col gap-1.5">
          {p.ppp.map((row, i) => (
            <p key={i} className="text-sm text-foreground/85">
              <Chip tone={row.kind === '促發' ? 'peach' : row.kind === '維持' ? 'pink' : 'mint'}>{row.kind}</Chip>
              <span className="ml-2">{row.text}</span>
            </p>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

// ── 期待核對（共視） ────────────────────────────────────────────────────────

function ExpectationsView({ client, shared }: { client: IntakeCase; shared: boolean }) {
  const [confirmed, setConfirmed] = useState<'unset' | 'same' | 'updated'>('unset')
  return (
    <SharedFrame shared={shared} title="期待核對">
      <p className={shared ? 'text-lg text-foreground/90' : 'text-sm text-foreground/85'}>
        初談時你提到的期待是這些，現在還是這樣嗎？
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {client.expectations.map((e) => (
          <Chip key={e} tone="mint">
            {e}
          </Chip>
        ))}
        {client.dealbreakers.map((d) => (
          <Chip key={d} tone="pink">
            雷點：{d}
          </Chip>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setConfirmed('same')}
          className={`flex-1 rounded-full border py-2.5 text-sm font-bold transition ${
            confirmed === 'same' ? 'border-primary bg-primary-soft text-foreground' : 'border-border bg-card text-foreground hover:bg-muted'
          }`}
        >
          還是這樣
        </button>
        <button
          onClick={() => setConfirmed('updated')}
          className={`flex-1 rounded-full border py-2.5 text-sm font-bold transition ${
            confirmed === 'updated' ? 'border-primary bg-primary-soft text-foreground' : 'border-border bg-card text-foreground hover:bg-muted'
          }`}
        >
          有一些不一樣了
        </button>
      </div>
      {confirmed !== 'unset' && (
        <p className="mt-3 text-xs font-bold text-[#3f6b46]">
          {confirmed === 'same' ? '已確認期待維持不變，可以進到目標卡。' : '好，記得在目標卡討論時把新的部分放進去。'}
        </p>
      )}
    </SharedFrame>
  )
}

// ── 目標卡／行動方案卡建構器（共視 + AI 擴寫） ──────────────────────────────

function CardBuilderView({
  kind,
  title,
  hint,
  shared,
  cards,
  onAdd,
  onUpdate,
  onRemove,
}: {
  kind: CardKind
  title: string
  hint: string
  shared: boolean
  cards: SessionCard[]
  onAdd: (kind: CardKind, c: Candidate) => void
  onUpdate: (id: string, patch: Partial<SessionCard>) => void
  onRemove: (id: string) => void
}) {
  const [keyword, setKeyword] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <SharedFrame shared={shared} title={title} subtitle={hint}>
      {!shared && (
        <div className="mb-4 rounded-2xl border border-dashed border-primary/50 bg-primary-soft/30 p-3">
          <p className="text-xs font-black text-foreground">AI 擴寫操作區（私人操作，產出後才共視挑選）</p>
          <div className="mt-2 flex gap-2">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={kind === 'goal' ? '輸入關鍵字，例：情緒粒度' : '輸入關鍵字，例：睡前不滑手機'}
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={() => setCandidates(expandKeyword(keyword, kind))}
              disabled={keyword.trim().length === 0}
              className="shrink-0 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-50"
            >
              AI 擴寫
            </button>
          </div>
          {candidates.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {candidates.map((c, i) => (
                <div key={i} className="rounded-xl bg-card p-3">
                  <p className="text-sm font-black text-foreground">{c.title}</p>
                  <p className="mt-0.5 text-sm text-foreground/80">{c.body}</p>
                  {c.frequency && <p className="mt-0.5 text-xs text-muted-foreground">頻率：{c.frequency}</p>}
                  <button
                    onClick={() => {
                      onAdd(kind, c)
                      setCandidates([])
                      setKeyword('')
                    }}
                    className="mt-2 rounded-full border border-primary/50 bg-primary-soft/40 px-3 py-1 text-xs font-bold text-foreground transition hover:bg-primary-soft/70"
                  >
                    加入{kind === 'goal' ? '目標卡' : '行動方案卡'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {shared ? '還沒有卡片，等心理師切回私人視圖用 AI 擴寫出候選草稿。' : '用上方 AI 擴寫，或直接手動加一張。'}
        </p>
      ) : (
        <div className={`flex flex-col gap-3 ${shared ? 'mt-1' : ''}`}>
          {cards.map((c) =>
            editing === c.id ? (
              <div key={c.id} className="rounded-2xl border border-primary/50 bg-card p-4">
                <input
                  value={c.title}
                  onChange={(e) => onUpdate(c.id, { title: e.target.value })}
                  className={`w-full rounded-lg border border-border bg-background px-2 py-1 font-black text-foreground outline-none focus:ring-2 focus:ring-primary/40 ${shared ? 'text-lg' : 'text-sm'}`}
                />
                <textarea
                  value={c.body}
                  rows={2}
                  onChange={(e) => onUpdate(c.id, { body: e.target.value })}
                  className={`mt-2 w-full resize-none rounded-lg border border-border bg-background px-2 py-1.5 text-foreground/85 outline-none focus:ring-2 focus:ring-primary/40 ${shared ? 'text-base' : 'text-sm'}`}
                />
                {c.frequency !== undefined && (
                  <input
                    value={c.frequency}
                    onChange={(e) => onUpdate(c.id, { frequency: e.target.value })}
                    placeholder="頻率"
                    className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40"
                  />
                )}
                <button
                  onClick={() => setEditing(null)}
                  className="mt-2 rounded-full bg-gradient-primary px-4 py-1.5 text-xs font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
                >
                  完成修改
                </button>
              </div>
            ) : (
              <div
                key={c.id}
                className={`rounded-2xl border border-border bg-card p-4 ${shared ? 'shadow-soft' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`font-black text-foreground ${shared ? 'text-lg' : 'text-sm'}`}>{c.title}</p>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => setEditing(c.id)}
                      className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-bold text-foreground hover:bg-muted"
                    >
                      修改
                    </button>
                    <button
                      onClick={() => onRemove(c.id)}
                      className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-bold text-muted-foreground hover:text-rust"
                    >
                      移除
                    </button>
                  </div>
                </div>
                <p className={`mt-1.5 text-foreground/85 ${shared ? 'text-base' : 'text-sm'}`}>{c.body}</p>
                {c.frequency && (
                  <p className="mt-1.5 text-xs font-bold text-muted-foreground">頻率：{c.frequency}</p>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </SharedFrame>
  )
}

// ── 狀態快照（共視，個案自評） ───────────────────────────────────────────────

const SNAPSHOT_DIMS = [
  { key: 'distress', label: '困擾強度' },
  { key: 'impact', label: '對生活的影響' },
  { key: 'confidence', label: '因應信心' },
] as const

function SnapshotView({ shared }: { shared: boolean }) {
  const [values, setValues] = useState<Record<string, number>>({ distress: 5, impact: 5, confidence: 5 })
  const [submitted, setSubmitted] = useState(false)

  return (
    <SharedFrame shared={shared} title="狀態快照" subtitle="由個案自己滑動評分，約 1 分鐘。">
      <div className="flex flex-col gap-5">
        {SNAPSHOT_DIMS.map((d) => (
          <div key={d.key}>
            <div className="flex items-center justify-between">
              <span className={`font-bold text-foreground ${shared ? 'text-base' : 'text-sm'}`}>{d.label}</span>
              <span className="text-sm font-black text-foreground">{values[d.key]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={values[d.key]}
              onChange={(e) => setValues((v) => ({ ...v, [d.key]: Number(e.target.value) }))}
              className="mt-1 w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0</span>
              <span>10</span>
            </div>
          </div>
        ))}
        {!submitted ? (
          <button
            onClick={() => setSubmitted(true)}
            className="rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
          >
            送出這次的狀態
          </button>
        ) : (
          <p className="rounded-xl bg-tile-mint px-3 py-2 text-sm font-bold text-[#3f6b46]">
            已記錄。這筆會是成長軌跡的第一個資料點，之後每次晤談都能對比。
          </p>
        )}
      </div>
    </SharedFrame>
  )
}

// ── 結束 ────────────────────────────────────────────────────────────────────

function DoneView({
  goalCards,
  actionCards,
  pushed,
  onPush,
}: {
  goalCards: SessionCard[]
  actionCards: SessionCard[]
  pushed: boolean
  onPush: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <SectionCard title="本次晤談產出（送出前最後確認）">
        <p className="text-sm font-bold text-foreground">目標卡（{goalCards.length}）</p>
        <ul className="mt-1 flex flex-col gap-1">
          {goalCards.map((c) => (
            <li key={c.id} className="text-sm text-foreground/80">
              · {c.title}
            </li>
          ))}
          {goalCards.length === 0 && <li className="text-sm text-muted-foreground">（尚未建立）</li>}
        </ul>
        <p className="mt-3 text-sm font-bold text-foreground">行動方案卡（{actionCards.length}）</p>
        <ul className="mt-1 flex flex-col gap-1">
          {actionCards.map((c) => (
            <li key={c.id} className="text-sm text-foreground/80">
              · {c.title}（{c.frequency}）
            </li>
          ))}
          {actionCards.length === 0 && <li className="text-sm text-muted-foreground">（尚未建立）</li>}
        </ul>
      </SectionCard>

      {!pushed ? (
        <button
          onClick={onPush}
          disabled={goalCards.length === 0 && actionCards.length === 0}
          className="rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-50"
        >
          結束晤談，推送給個案
        </button>
      ) : (
        <div className="rounded-2xl bg-tile-mint px-4 py-4 text-center">
          <p className="text-sm font-black text-[#3f6b46]">已推送！個案手機收到「這週的行動卡已送達」通知。</p>
          <p className="mt-1 text-xs text-[#3f6b46]/80">
            正式版：行動卡進入個案「我的行動卡」，快照併入成長軌跡；下次晤談前的準備區會看到完成狀況。
          </p>
        </div>
      )}
    </div>
  )
}

// ── 共視框架（統一大字體/一般字體切換的外殼） ───────────────────────────────

function SharedFrame({
  shared,
  title,
  subtitle,
  children,
}: {
  shared: boolean
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        shared ? 'border-primary/40 bg-primary-soft/20 shadow-soft' : 'border-border bg-card'
      }`}
    >
      <h2 className={`font-black text-foreground ${shared ? 'text-2xl' : 'text-lg'}`}>{title}</h2>
      {subtitle && <p className={`mt-1 text-muted-foreground ${shared ? 'text-base' : 'text-xs'}`}>{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}
