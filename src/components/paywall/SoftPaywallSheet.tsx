// ─────────────────────────────────────────────────────────────────────────
// 軟性付費牆（規格 §3「未轉換者」與 §5.4）
//
// 形式是「半高 sheet」，不是全屏：
//   上半部 = 這份報告**真實生成內容的前 30%**
//   下半部 = 漸層模糊遮罩 + 升級 CTA
//
// ⚠️ 規格 §9 明確要求：呈現的必須是真實生成內容的局部，
//    不可用功能清單、佔位文字或空白頁取代。因此這個元件一定要收到
//    `content`（後端已經生成好的報告全文），自己截前 30%，
//    而不是由呼叫端塞一段假文案進來。
//
// ⚠️ 沒接 IAP 之前，這裡的 CTA 不可以寫「升級」「查看方案」——那會暗示有一個
//    付費層可以買，但按下去只會走到免費的創始成員邀請頁（PaywallScreen）。
//    文案必須跟那一頁一致：免費加入，不涉及付款。
// ─────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react'
import { track } from '../../lib/analytics'
import { useLanguage } from '../../lib/i18n/context'

interface SoftPaywallSheetProps {
  /** 後端已生成的報告全文（純文字）。元件只顯示前 30%。 */
  content: string
  /** 來源，供分析事件標記 */
  source?: string
  onUpgrade: () => void
  onClose: () => void
}

/**
 * 取前 30% 的內容。以字元數計算，並往後找最近的斷句點收尾，
 * 避免剛好切在句子中間看起來像壞掉。
 */
function firstThirtyPercent(content: string): string {
  const text = content.trim()
  if (!text) return ''
  const cut = Math.max(1, Math.floor(text.length * 0.3))
  const slice = text.slice(0, cut)
  // 從截斷處往回找最後一個句讀，讓結尾自然一點；找不到就直接用原切點。
  const lastBreak = Math.max(
    slice.lastIndexOf('。'),
    slice.lastIndexOf('！'),
    slice.lastIndexOf('？'),
    slice.lastIndexOf('\n'),
  )
  return lastBreak > cut * 0.4 ? slice.slice(0, lastBreak + 1) : slice
}

export function SoftPaywallSheet({ content, source, onUpgrade, onClose }: SoftPaywallSheetProps) {
  const { t } = useLanguage()
  const preview = firstThirtyPercent(content)

  useEffect(() => {
    track('soft_paywall_shown', { source: source ?? 'weekly_review' })
  }, [source])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#1c1714]/40"
      onClick={onClose}
    >
      {/* 半高 sheet：最高佔畫面 72%，刻意不做成全屏（規格 §5.4） */}
      <div
        className="max-h-[72vh] w-full max-w-md overflow-hidden rounded-t-[28px] bg-card shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 上半部：真實內容的前 30%，下緣用漸層＋模糊收掉 */}
        <div className="relative max-h-[38vh] overflow-hidden px-6 pt-6">
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground">
            {preview}
          </p>
          {/* 漸層模糊遮罩：越往下越模糊、越接近背景色 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 backdrop-blur-[3px]"
            style={{
              background: 'linear-gradient(to bottom, transparent, var(--card) 85%)',
              maskImage: 'linear-gradient(to bottom, transparent, black 60%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 60%)',
            }}
          />
        </div>

        {/* 下半部：說明 + 升級 CTA */}
        <div className="px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
          <p className="text-sm font-bold leading-relaxed text-foreground">
            {t('這份報告已經生成好了。免費加入創始成員即可看完整內容。')}
          </p>
          <button
            onClick={onUpgrade}
            className="mt-4 flex w-full items-center justify-center rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
          >
            {t('免費加入創始成員')}
          </button>
          <button
            onClick={onClose}
            className="mt-2 w-full py-2 text-xs font-semibold text-muted-foreground underline"
          >
            {t('先自己逛逛')}
          </button>
        </div>
      </div>
    </div>
  )
}
