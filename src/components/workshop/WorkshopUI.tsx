import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { PrimaryCta } from '../PrimaryCta'
import VoiceInput from '../pretest/VoiceInput'

// 工作坊主題色（語音麥克風圖示用）；對應 index.css 的 --primary 藍。
const WORKSHOP_ACCENT = '#5B8DEF'

// ─────────────────────────────────────────────────────────────────────────
// 防跑批機制（規格 [5]）：點「下一步」時跳出 Confirm Dialog，提醒「跟著講師指示，
// 不要提前翻閱」。可勾選「不再提示」，本次使用階段後續就不再跳出。
// ─────────────────────────────────────────────────────────────────────────
const SKIP_CONFIRM_KEY = 'workshop_skip_advance_confirm'
const ADVANCE_HINT = '為了維持課程品質，請跟著講師的指示，不要提前翻閱。'

function shouldSkipAdvanceConfirm(): boolean {
  try {
    return sessionStorage.getItem(SKIP_CONFIRM_KEY) === 'true'
  } catch {
    return false
  }
}

function setSkipAdvanceConfirm(): void {
  try {
    sessionStorage.setItem(SKIP_CONFIRM_KEY, 'true')
  } catch {
    /* 忽略 */
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 工作坊模塊共用 UI
//
// 三個工作坊模塊都是「多步驟流程」，這裡集中放共用的外觀與導覽元件，讓三個
// 模塊風格一致、也避免重複實作：
//   • WorkshopLayout —— 每個步驟畫面的外框（返回首頁鈕＋步驟進度＋標題＋導覽）
//   • StepProgress   —— 步驟進度指示
//   • TimeBadge      —— 「建議參考時間」徽章（僅參考，不強制倒數）
//   • StepNav        —— 上一步／下一步按鈕列
//   • WorkshopTextarea —— 書寫框
//   • CompletionActions —— 完成畫面的「重新開始／返回首頁」按鈕
// ─────────────────────────────────────────────────────────────────────────

/** 每個步驟畫面的外框：頂部返回首頁＋步驟進度、標題與參考時間、內容、底部導覽。 */
export function WorkshopLayout({
  step,
  total,
  title,
  subtitle,
  minutes,
  onBack,
  onNext,
  nextLabel = '下一步',
  nextVariant = 'next',
  nextDisabled = false,
  children,
}: {
  step: number
  total: number
  title: string
  subtitle?: string
  /** 建議參考時間（分鐘）；不傳則不顯示。 */
  minutes?: number
  /** 上一步；不傳則只顯示整排「下一步」按鈕（通常用於第一步）。 */
  onBack?: () => void
  /** 下一步；不傳則不顯示底部導覽（通常用於自訂底部的完成畫面）。 */
  onNext?: () => void
  nextLabel?: string
  nextVariant?: 'next' | 'done'
  nextDisabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-8 pb-40 md:px-10">
      {/* 頂部：返回首頁 + 步驟進度 */}
      <div className="flex items-center justify-between">
        <Link
          to="/app/home"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground shadow-soft transition active:scale-90"
          aria-label="返回訓練中心"
        >
          <HomeIcon />
        </Link>
        <StepProgress current={step} total={total} />
      </div>

      {/* 標題 + 參考時間 */}
      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-extrabold leading-tight text-foreground">
            {title}
          </h1>
          {minutes != null && <TimeBadge minutes={minutes} />}
        </div>
        {subtitle && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
      </header>

      {/* 步驟內容 */}
      <div className="mt-6">{children}</div>

      {/* 底部導覽。前往下一頁（nextVariant='next'）時啟用防跑批確認與固定提示。 */}
      {onNext && (
        <StepNav
          onBack={onBack}
          onNext={onNext}
          nextLabel={nextLabel}
          nextVariant={nextVariant}
          nextDisabled={nextDisabled}
          confirmAdvance={nextVariant === 'next'}
        />
      )}
    </div>
  )
}

/** 步驟進度指示：「步驟 X / Y」＋進度條點。 */
export function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs font-bold text-muted-foreground">
        步驟 {current}/{total}
      </span>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i < current ? 'w-5 bg-primary' : 'w-1.5 bg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

/** 「建議參考時間」徽章 —— 只是參考，不會倒數結束自動跳頁。 */
export function TimeBadge({ minutes }: { minutes: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary">
      ⏱ 建議參考 {minutes} 分鐘
    </span>
  )
}

/**
 * 上一步／下一步按鈕列。沒有 onBack 時，下一步按鈕佔滿整排。
 * confirmAdvance=true 時，點「下一步」會先跳出防跑批確認 Dialog（規格 [5]），
 * 並在按鈕下方顯示固定提示文字。
 */
export function StepNav({
  onBack,
  onNext,
  nextLabel = '下一步',
  nextVariant = 'next',
  nextDisabled = false,
  confirmAdvance = false,
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  nextVariant?: 'next' | 'done'
  nextDisabled?: boolean
  confirmAdvance?: boolean
}) {
  const [confirming, setConfirming] = useState(false)

  const handleNext = () => {
    if (confirmAdvance && !shouldSkipAdvanceConfirm()) {
      setConfirming(true)
      return
    }
    onNext()
  }

  return (
    <>
      <div className="mt-8 flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-16 shrink-0 items-center justify-center gap-2 rounded-full bg-card px-6 text-sm font-extrabold text-foreground/70 shadow-soft transition active:scale-[0.97]"
          >
            <ArrowLeftIcon />
            上一步
          </button>
        )}
        <div className="min-w-0 flex-1">
          <PrimaryCta onClick={handleNext} disabled={nextDisabled} variant={nextVariant}>
            {nextLabel}
          </PrimaryCta>
        </div>
      </div>

      {/* 固定提示文字（規格 [5]） */}
      {confirmAdvance && (
        <p className="mt-3 text-center text-xs font-medium leading-relaxed text-muted-foreground">
          {ADVANCE_HINT}
        </p>
      )}

      {confirming && (
        <AdvanceConfirmDialog
          onConfirm={() => {
            setConfirming(false)
            onNext()
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}

/** 防跑批確認 Dialog：含「不再提示」勾選鈕。 */
function AdvanceConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  const [dontAsk, setDontAsk] = useState(false)

  const confirm = () => {
    if (dontAsk) setSkipAdvanceConfirm()
    onConfirm()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-fade-up rounded-3xl bg-card p-6 shadow-soft">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-2xl">
          ✋
        </div>
        <p className="text-base font-extrabold leading-relaxed text-foreground">
          {ADVANCE_HINT}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          確認講師已經指示前往下一頁了嗎？
        </p>

        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-foreground/80">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          不再提示
        </label>

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={confirm}
            className="flex h-14 w-full items-center justify-center rounded-full bg-gradient-primary text-base font-extrabold tracking-[0.15em] text-primary-foreground shadow-soft transition active:scale-[0.98]"
          >
            是，前往下頁
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-12 w-full items-center justify-center rounded-full bg-card text-sm font-extrabold text-foreground/70 shadow-soft transition active:scale-[0.98]"
          >
            否，留在本頁
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 書寫框 —— 與專案既有卡片風格一致的文字輸入區。
 * voice=true 時，下方多一顆「語音輸入」按鈕（沿用感恩日記的 VoiceInput，
 * 辨識結果接在現有文字後面）。
 */
export function WorkshopTextarea({
  value,
  onChange,
  placeholder,
  rows = 5,
  voice = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  voice?: boolean
}) {
  const appendTranscript = (text: string) => {
    const sep = value && !/\s$/.test(value) ? ' ' : ''
    onChange(value + sep + text)
  }
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none rounded-3xl bg-card p-4 text-sm leading-relaxed text-foreground shadow-soft placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {voice && (
        <div className="mt-2">
          <VoiceInput accent={WORKSHOP_ACCENT} onTranscript={appendTranscript} />
        </div>
      )}
    </div>
  )
}

/** 完成畫面的動作：重新開始（清空回第一步）＋返回首頁。 */
export function CompletionActions({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="mt-8 flex flex-col gap-3">
      <Link
        to="/app/home"
        className="flex h-16 w-full items-center justify-center gap-3 rounded-full bg-gradient-primary text-base font-extrabold tracking-[0.2em] text-primary-foreground shadow-soft transition active:scale-[0.98]"
      >
        返回訓練中心
        <ArrowRightIcon />
      </Link>
      <button
        type="button"
        onClick={onRestart}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-card text-sm font-extrabold text-foreground/70 shadow-soft transition active:scale-[0.98]"
      >
        <RefreshIcon />
        重新開始
      </button>
    </div>
  )
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  )
}

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 19l-7-7 7-7" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}
