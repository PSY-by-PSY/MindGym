// 積木渲染器（個案端作答；admin 審核頁複用其 disabled 唯讀模式）。
//
// 前向相容鐵則：遇到未知 type → 當 instruction 顯示（若有 text/label），絕不 crash。
// 未來加新題型只需在 BlockField 新增一個 case。
import VoiceInput from '../pretest/VoiceInput'
import type { ProBlock, ProAnswers, ProAnswerValue, ProModuleContent } from '../../lib/proModules'

function Label({ block }: { block: ProBlock }) {
  if (!block.label?.trim()) return null
  return (
    <p className="mb-2 text-[15px] font-bold leading-relaxed text-foreground">
      {block.label}
      {block.required && <span className="ml-1 text-rust">*</span>}
    </p>
  )
}

function asString(v: ProAnswerValue | undefined): string {
  return typeof v === 'string' ? v : ''
}

function asArray(v: ProAnswerValue | undefined): string[] {
  return Array.isArray(v) ? v : []
}

function BlockField({
  block,
  value,
  onChange,
  disabled,
}: {
  block: ProBlock
  value: ProAnswerValue | undefined
  onChange?: (value: ProAnswerValue) => void
  disabled?: boolean
}) {
  switch (block.type) {
    case 'instruction':
      return block.text?.trim() ? (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground-soft">{block.text}</p>
      ) : null

    case 'short_text': {
      const showVoice = !disabled && !!onChange && block.voice !== false
      const appendVoice = (text: string) => {
        const cur = asString(value)
        const sep = cur && !/\s$/.test(cur) ? ' ' : ''
        onChange?.(cur + sep + text)
      }
      return (
        <div>
          <Label block={block} />
          <input
            type="text"
            value={asString(value)}
            disabled={disabled}
            placeholder={block.placeholder || ''}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-[15px] text-foreground shadow-soft outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/40 disabled:opacity-70"
          />
          {showVoice && (
            <div className="mt-2">
              <VoiceInput accent="var(--primary)" onTranscript={appendVoice} />
            </div>
          )}
        </div>
      )
    }

    case 'long_text': {
      const showVoice = !disabled && !!onChange && block.voice !== false
      const appendVoice = (text: string) => {
        const cur = asString(value)
        const sep = cur && !/\s$/.test(cur) ? ' ' : ''
        onChange?.(cur + sep + text)
      }
      return (
        <div>
          <Label block={block} />
          <textarea
            value={asString(value)}
            disabled={disabled}
            placeholder={block.placeholder || ''}
            rows={4}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-soft outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/40 disabled:opacity-70"
          />
          {showVoice && (
            <div className="mt-2">
              <VoiceInput accent="var(--primary)" onTranscript={appendVoice} />
            </div>
          )}
        </div>
      )
    }

    case 'choice': {
      const selected = asArray(value)
      const toggle = (opt: string) => {
        if (disabled) return
        if (block.multi) {
          onChange?.(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt])
        } else {
          onChange?.(selected.includes(opt) ? [] : [opt])
        }
      }
      return (
        <div>
          <Label block={block} />
          <div className="flex flex-wrap gap-2">
            {(block.options ?? []).map((opt, i) => {
              const on = selected.includes(opt)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(opt)}
                  className={`rounded-full border px-4 py-2 text-sm font-bold transition active:scale-[0.98] ${
                    on
                      ? 'border-foreground bg-foreground text-cream'
                      : 'border-border bg-card text-foreground'
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    case 'scale': {
      const min = Number.isFinite(block.min) ? (block.min as number) : 1
      const max = Number.isFinite(block.max) ? (block.max as number) : 5
      const steps = max >= min ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : []
      const current = typeof value === 'number' ? value : null
      return (
        <div>
          <Label block={block} />
          <div className="flex items-center gap-2">
            {steps.map((n) => {
              const on = current === n
              return (
                <button
                  key={n}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange?.(n)}
                  className={`h-11 flex-1 rounded-xl border text-base font-black transition active:scale-[0.98] ${
                    on
                      ? 'border-foreground bg-foreground text-cream'
                      : 'border-border bg-card text-foreground'
                  }`}
                >
                  {n}
                </button>
              )
            })}
          </div>
          {(block.minLabel || block.maxLabel) && (
            <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
              <span>{block.minLabel}</span>
              <span>{block.maxLabel}</span>
            </div>
          )}
        </div>
      )
    }

    case 'checklist': {
      const selected = asArray(value)
      const toggle = (opt: string) => {
        if (disabled) return
        onChange?.(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt])
      }
      return (
        <div>
          <Label block={block} />
          <div className="flex flex-col gap-2">
            {(block.options ?? []).map((opt, i) => {
              const on = selected.includes(opt)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(opt)}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] font-medium transition active:scale-[0.99] ${
                    on ? 'border-foreground bg-cream text-foreground' : 'border-border bg-card text-foreground'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                      on ? 'border-foreground bg-foreground text-cream' : 'border-border'
                    }`}
                  >
                    {on && (
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5L20 6" />
                      </svg>
                    )}
                  </span>
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    default:
      // 前向相容：未知題型當引導文字顯示（有 text 或 label 就顯示），絕不 crash。
      return block.text?.trim() || block.label?.trim() ? (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground-soft">
          {block.text || block.label}
        </p>
      ) : null
  }
}

/** 渲染整個模組內容（intro + blocks + outro）。disabled=true 供 admin 審核頁唯讀預覽。 */
export function BlockRenderer({
  content,
  answers,
  onChange,
  disabled,
}: {
  content: ProModuleContent
  answers: ProAnswers
  onChange?: (id: string, value: ProAnswerValue) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-5">
      {content.intro?.trim() && (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground-soft">{content.intro}</p>
      )}
      {content.blocks.map((block) => (
        <BlockField
          key={block.id}
          block={block}
          value={answers[block.id]}
          onChange={onChange ? (v) => onChange(block.id, v) : undefined}
          disabled={disabled}
        />
      ))}
      {content.outro?.trim() && (
        <p className="whitespace-pre-wrap rounded-2xl bg-cream px-4 py-3 text-[15px] leading-relaxed text-foreground-soft">
          {content.outro}
        </p>
      )}
    </div>
  )
}
