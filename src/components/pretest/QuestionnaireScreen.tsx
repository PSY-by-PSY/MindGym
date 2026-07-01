import { useEffect, useRef, useState } from 'react'
import type { DimensionKey, NarrativeAnswers } from './types'
import { DIMENSION_CONFIGS, DIMENSION_ORDER } from './types'
import VoiceInput from './VoiceInput'

interface Props {
  initialAnswers: NarrativeAnswers
  startAtLast: boolean
  apiError: string
  onSubmit: (answers: NarrativeAnswers) => void
  onExit: () => void
}

const MIN_CHARS = 30

const DOT_COLOR: Record<DimensionKey, string> = {
  P: '#E26D5C',
  E: '#5C95FF',
  R: '#D6FFB7',
  M: '#292F56',
  A: '#FFDDB9',
}

const DARK_GLYPH: Record<DimensionKey, boolean> = {
  P: false,
  E: false,
  R: true,
  M: false,
  A: true,
}

const ORDINAL = ['一', '二', '三', '四', '五']

// ── Top bar with progress dots ──────────────────────────────
function ProgressHeader({ step, onExit }: { step: number; onExit: () => void }) {
  const total = DIMENSION_ORDER.length
  const cfg = DIMENSION_CONFIGS[DIMENSION_ORDER[step]]
  return (
    <div style={{ padding: '14px 24px 16px', background: '#fff' }}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
        }}
      >
        <button
          onClick={onExit}
          aria-label="返回"
          style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            border: '1.5px solid #EAEAEA',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#151515" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <img
          src="/assets/psy-by-psy-logo.png"
          alt="PSY by PSY"
          style={{ height: 84, width: 'auto', objectFit: 'contain' }}
        />
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 11,
            fontFamily: 'Inter',
            color: '#959595',
            fontWeight: 600,
            letterSpacing: 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          {String(step + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </div>
      </div>

      {/* segmented progress bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {DIMENSION_ORDER.map((k, i) => (
          <div
            key={k}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 99,
              background: i <= step ? DOT_COLOR[k] : '#EAEAEA',
              transition: 'background .35s',
            }}
          />
        ))}
      </div>

      {/* PERMA dots */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
        {DIMENSION_ORDER.map((k, i) => {
          const isCurrent = i === step
          const isDone = i < step
          const color = DOT_COLOR[k]
          return (
            <div
              key={k}
              style={{
                width: isCurrent ? 34 : 24,
                height: isCurrent ? 34 : 24,
                borderRadius: '50%',
                background: isDone || isCurrent ? color : '#fff',
                border: `1.5px solid ${isDone || isCurrent ? color : '#D8D8D8'}`,
                color: isCurrent ? (DARK_GLYPH[k] || k === 'M' ? (k === 'M' ? '#fff' : '#151515') : '#151515') : '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Inter',
                fontWeight: 800,
                fontSize: isCurrent ? 14 : 11,
                transition: 'all .3s cubic-bezier(.2,.7,.2,1)',
                boxShadow: isCurrent ? '0 2px 8px rgba(0,0,0,.08)' : 'none',
              }}
            >
              {isDone ? (
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <path
                    d="M1 5 L4 8 L9 2"
                    stroke={DARK_GLYPH[k] ? '#151515' : '#fff'}
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                k
              )}
            </div>
          )
        })}
      </div>
      <div
        style={{
          textAlign: 'center',
          marginTop: 10,
          fontSize: 11,
          color: '#959595',
          fontFamily: 'Noto Sans TC',
          fontWeight: 500,
        }}
      >
        第 {ORDINAL[step]} 題「{cfg.label}」 · 共五題
      </div>
    </div>
  )
}

// ── Main quiz component ─────────────────────────────────────
export default function NarrativeQuiz({ initialAnswers, startAtLast, apiError, onSubmit, onExit }: Props) {
  const [step, setStep] = useState(startAtLast ? DIMENSION_ORDER.length - 1 : 0)
  const [answers, setAnswers] = useState<NarrativeAnswers>(initialAnswers)
  const [showHint, setShowHint] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const key = DIMENSION_ORDER[step]
  const cfg = DIMENSION_CONFIGS[key]
  const color = DOT_COLOR[key]
  const darkGlyph = DARK_GLYPH[key]
  const currentText = answers[key]
  const charCount = currentText.length
  const isLast = step === DIMENSION_ORDER.length - 1
  const textOk = charCount >= MIN_CHARS
  const isEnough = textOk
  const remaining = Math.max(0, MIN_CHARS - charCount)

  useEffect(() => {
    setShowHint(false)
  }, [step])

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }, [currentText])

  function appendTranscript(text: string) {
    setAnswers((prev) => {
      const cur = prev[key]
      const sep = cur && !/\s$/.test(cur) ? ' ' : ''
      return { ...prev, [key]: cur + sep + text }
    })
  }

  function goNext() {
    if (isLast) onSubmit(answers)
    else setStep((s) => s + 1)
  }

  function goPrev() {
    if (step > 0) setStep((s) => s - 1)
  }

  return (
    <div
      key={step}
      className="screen-enter"
      style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}
    >
      <ProgressHeader step={step} onExit={onExit} />

      {/* Prompt block */}
      <div style={{ padding: '8px 24px 14px', textAlign: 'center' }}>
        <div
          style={{
            position: 'relative',
            height: 200,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: 240,
              height: 240,
              borderRadius: '50%',
              background: `radial-gradient(circle,${color}44 0%, ${color}00 70%)`,
            }}
          />
          <img
            src="/assets/bagel.png"
            alt=""
            style={{
              width: 200,
              height: 200,
              objectFit: 'contain',
              position: 'relative',
              zIndex: 1,
              filter: 'drop-shadow(0 10px 20px rgba(201,148,99,.28))',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 10,
              right: '50%',
              transform: 'translateX(112px)',
              padding: '6px 12px',
              background: color,
              borderRadius: 99,
              color: darkGlyph ? '#151515' : '#fff',
              fontSize: 12,
              fontWeight: 800,
              fontFamily: 'Inter',
              letterSpacing: 0.4,
              boxShadow: '0 4px 12px rgba(0,0,0,.08)',
              whiteSpace: 'nowrap',
            }}
          >
            {key} · {cfg.label}
          </div>
        </div>

        <h2
          style={{
            margin: '14px 0 0',
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: -0.4,
            lineHeight: 1.4,
            color: '#151515',
          }}
        >
          {cfg.question}
        </h2>
      </div>

      {/* hint toggle */}
      <div style={{ padding: '0 24px 8px', display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => setShowHint((s) => !s)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            background: showHint ? '#151515' : '#fff',
            color: showHint ? '#fff' : '#151515',
            border: '1.5px solid #151515',
            borderRadius: 99,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
            <path
              d="M5.5 3 V6 M5.5 7.5 V8.2"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          引導提示
        </button>
      </div>
      {showHint && (
        <div
          className="pop"
          style={{
            margin: '0 24px 10px',
            padding: '10px 14px',
            background: '#FFF8EA',
            border: '1px dashed #E8D8A8',
            borderRadius: 12,
            fontSize: 12,
            lineHeight: 1.6,
            color: '#6A4A0F',
          }}
        >
          {cfg.hints.map((hint, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <span>
                {i + 1}. {hint}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Textarea */}
      <div style={{ padding: '4px 18px 0' }}>
        <div
          style={{
            position: 'relative',
            minHeight: 140,
            border: `1.5px solid ${textOk ? color : '#D8D8D8'}`,
            borderRadius: 14,
            padding: '10px 12px 28px',
            background: '#fff',
            transition: 'border-color .3s',
          }}
        >
          <textarea
            ref={textareaRef}
            value={currentText}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [key]: e.target.value }))}
            placeholder="在這裡輸入你的故事或感受，越具體越好～"
            style={{
              width: '100%',
              minHeight: 110,
              height: 'auto',
              resize: 'none',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontFamily: 'inherit',
              fontSize: 12.5,
              lineHeight: 1.55,
              color: '#151515',
              display: 'block',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 14,
              right: 14,
              bottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: 10.5, color: textOk ? color : '#959595', fontWeight: 600 }}>
              {textOk
                ? '✓ 字數已達標'
                : `至少需要 ${MIN_CHARS} 個字（還差 ${remaining} 個字）`}
            </span>
            <span
              className="num"
              style={{ fontSize: 10.5, color: textOk ? color : '#959595', fontWeight: 600 }}
            >
              {charCount}/{MIN_CHARS}
            </span>
          </div>
        </div>

        {/* Voice input */}
        <div style={{ marginTop: 10 }}>
          <VoiceInput accent={color} onTranscript={appendTranscript} />
        </div>
      </div>

      {/* API Error */}
      {apiError && isLast && (
        <div
          style={{
            margin: '12px 18px 0',
            borderRadius: 12,
            background: '#FDECEA',
            border: '1px solid #F5C6BD',
            padding: '10px 14px',
            color: '#C0392B',
            fontSize: 12.5,
          }}
        >
          {apiError}
        </div>
      )}

      {/* Nav buttons */}
      <div style={{ padding: '14px 18px 24px', display: 'flex', gap: 10 }}>
        <button
          onClick={goPrev}
          disabled={step === 0}
          style={{
            flex: 1,
            height: 50,
            borderRadius: 99,
            background: '#fff',
            color: step === 0 ? '#BFBFBF' : '#151515',
            border: `1.5px solid ${step === 0 ? '#EAEAEA' : '#959595'}`,
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: step === 0 ? 'default' : 'pointer',
          }}
        >
          上一題
        </button>
        <button
          onClick={goNext}
          disabled={!isEnough}
          style={{
            flex: 1.4,
            height: 50,
            borderRadius: 99,
            background: isEnough ? '#292F56' : '#EAEAEA',
            color: isEnough ? '#fff' : '#959595',
            border: 'none',
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: isEnough ? 'pointer' : 'default',
            transition: 'background .25s',
            boxShadow: isEnough ? '0 8px 18px -8px rgba(41,47,86,.5)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {isLast ? '看結果' : '下一題'}
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path
              d="M2 7 H12 M8 3 L12 7 L8 11"
              stroke={isEnough ? '#fff' : '#959595'}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
