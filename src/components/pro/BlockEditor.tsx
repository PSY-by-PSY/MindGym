// 積木編輯器（專業夥伴端）：管理 blocks 陣列——新增（選題型）、刪除、上移/下移、
// 編輯各欄位。即時預覽由呼叫端用 BlockRenderer 呈現。
import { newBlockId, type ProBlock, type ProBlockType } from '../../lib/proModules'

const TYPE_LABELS: Record<string, string> = {
  instruction: '說明文字',
  short_text: '短文字',
  long_text: '長文字',
  choice: '單/複選',
  scale: '量表',
  checklist: '清單勾選',
}

const ADDABLE_TYPES: ProBlockType[] = [
  'instruction', 'short_text', 'long_text', 'choice', 'scale', 'checklist',
]

function makeBlock(type: ProBlockType): ProBlock {
  const id = newBlockId()
  switch (type) {
    case 'instruction':
      return { id, type, text: '' }
    case 'choice':
      return { id, type, label: '', options: ['選項一', '選項二'], multi: false }
    case 'scale':
      return { id, type, label: '', min: 1, max: 5, minLabel: '', maxLabel: '' }
    case 'checklist':
      return { id, type, label: '', options: ['項目一'] }
    default:
      return { id, type, label: '', placeholder: '', required: false }
  }
}

// ── 小型輸入元件 ──────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{children}</span>
}

const inputCls =
  'w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40'

function TextField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  )
}

// options 陣列（choice / checklist 共用）
function OptionsEditor({ options, onChange }: { options: string[]; onChange: (opts: string[]) => void }) {
  return (
    <div>
      <FieldLabel>選項</FieldLabel>
      <div className="flex flex-col gap-2">
        {options.map((opt, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={opt}
              onChange={(e) => onChange(options.map((o, idx) => (idx === i ? e.target.value : o)))}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => onChange(options.filter((_, idx) => idx !== i))}
              className="shrink-0 rounded-xl border border-border px-3 text-sm font-bold text-muted-foreground transition hover:bg-muted"
              aria-label="刪除選項"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...options, ''])}
          className="self-start rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:bg-muted"
        >
          ＋ 新增選項
        </button>
      </div>
    </div>
  )
}

// ── 各題型的欄位編輯 ──────────────────────────────────────────────────────

function BlockFields({ block, onPatch }: { block: ProBlock; onPatch: (patch: Partial<ProBlock>) => void }) {
  switch (block.type) {
    case 'instruction':
      return (
        <label className="block">
          <FieldLabel>引導文字</FieldLabel>
          <textarea
            value={block.text ?? ''}
            rows={2}
            onChange={(e) => onPatch({ text: e.target.value })}
            className={`${inputCls} resize-none`}
          />
        </label>
      )
    case 'choice':
      return (
        <div className="flex flex-col gap-3">
          <TextField label="題目" value={block.label ?? ''} onChange={(v) => onPatch({ label: v })} />
          <OptionsEditor options={block.options ?? []} onChange={(opts) => onPatch({ options: opts })} />
          <label className="flex items-center gap-2 text-sm font-bold text-foreground">
            <input type="checkbox" checked={!!block.multi} onChange={(e) => onPatch({ multi: e.target.checked })} />
            允許複選
          </label>
        </div>
      )
    case 'scale':
      return (
        <div className="flex flex-col gap-3">
          <TextField label="題目" value={block.label ?? ''} onChange={(v) => onPatch({ label: v })} />
          <div className="flex gap-3">
            <label className="flex-1">
              <FieldLabel>最小值</FieldLabel>
              <input
                type="number"
                value={block.min ?? 1}
                onChange={(e) => onPatch({ min: Number(e.target.value) })}
                className={inputCls}
              />
            </label>
            <label className="flex-1">
              <FieldLabel>最大值</FieldLabel>
              <input
                type="number"
                value={block.max ?? 5}
                onChange={(e) => onPatch({ max: Number(e.target.value) })}
                className={inputCls}
              />
            </label>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <TextField label="低分標籤" value={block.minLabel ?? ''} onChange={(v) => onPatch({ minLabel: v })} />
            </div>
            <div className="flex-1">
              <TextField label="高分標籤" value={block.maxLabel ?? ''} onChange={(v) => onPatch({ maxLabel: v })} />
            </div>
          </div>
        </div>
      )
    case 'checklist':
      return (
        <div className="flex flex-col gap-3">
          <TextField label="題目" value={block.label ?? ''} onChange={(v) => onPatch({ label: v })} />
          <OptionsEditor options={block.options ?? []} onChange={(opts) => onPatch({ options: opts })} />
        </div>
      )
    default:
      // short_text / long_text
      return (
        <div className="flex flex-col gap-3">
          <TextField label="題目" value={block.label ?? ''} onChange={(v) => onPatch({ label: v })} />
          <TextField label="提示文字（選填）" value={block.placeholder ?? ''} onChange={(v) => onPatch({ placeholder: v })} />
          <label className="flex items-center gap-2 text-sm font-bold text-foreground">
            <input type="checkbox" checked={!!block.required} onChange={(e) => onPatch({ required: e.target.checked })} />
            必填
          </label>
        </div>
      )
  }
}

export function BlockEditor({ blocks, onChange }: { blocks: ProBlock[]; onChange: (blocks: ProBlock[]) => void }) {
  const patch = (i: number, p: Partial<ProBlock>) =>
    onChange(blocks.map((b, idx) => (idx === i ? { ...b, ...p } : b)))
  const remove = (i: number) => onChange(blocks.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= blocks.length) return
    const next = blocks.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          還沒有任何題目。從下方新增第一個積木。
        </p>
      )}

      {blocks.map((block, i) => (
        <div key={block.id} className="rounded-2xl border border-border bg-background p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
              {TYPE_LABELS[block.type] ?? block.type}
            </span>
            <div className="flex items-center gap-1">
              <IconBtn label="上移" disabled={i === 0} onClick={() => move(i, -1)}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
              </IconBtn>
              <IconBtn label="下移" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </IconBtn>
              <IconBtn label="刪除" onClick={() => remove(i)}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 13h8l1-13" /></svg>
              </IconBtn>
            </div>
          </div>
          <BlockFields block={block} onPatch={(p) => patch(i, p)} />
        </div>
      ))}

      <div className="rounded-2xl border border-dashed border-border p-3">
        <p className="mb-2 text-xs font-bold text-muted-foreground">新增積木</p>
        <div className="flex flex-wrap gap-2">
          {ADDABLE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange([...blocks, makeBlock(t)])}
              className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-bold text-foreground transition hover:bg-muted active:scale-[0.98]"
            >
              ＋ {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function IconBtn({ children, label, onClick, disabled }: {
  children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/60 transition hover:bg-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  )
}
