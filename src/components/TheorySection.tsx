import { useState, type ReactNode } from 'react'
import { useLanguage } from '../lib/i18n/context'

// 三個練習進入頁（感恩日記／過程目標覺察／自我慈悲）共用的「理論說明」區塊：
// 核心內容常駐顯示（children 收到 expanded 決定露出多少），完整說明由下方
// 整寬的「查看更多」按鈕展開，取代過去容易被忽略的小字連結。
export function TheorySection({ children }: { children: (expanded: boolean) => ReactNode }) {
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-4">
      {children(expanded)}
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-full border-2 border-primary/25 bg-primary/5 text-sm font-extrabold tracking-[0.08em] text-primary transition active:scale-[0.98]"
      >
        {expanded ? t('收合') : t('查看更多')}
        <svg
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  )
}
