// ─────────────────────────────────────────────────────────────────────────
// 「理論依據與參考文獻」區塊（App Store 審查指南 1.4.1）
//
// 用在任何會給使用者健康判讀、分數或建議的畫面：
//   1. InMind 基線檢測報告（components/pretest/ResultsScreen.tsx）
//   2. 每週 AI 統整回饋（routes/app.weekly-review.tsx）
//
// ⚠️ 這一區「不可以」預設收合。2026-09-05 的退件原文要求
//    "The citations to the sources should be easy for the user to find."
//    收在展開式選單裡等於沒有——審查員找不到就是再退一次。
//    同理也不要移到條款頁：Apple 要的是「in the app」、在提供資訊的當下。
//
// ⚠️ 免責聲明與文獻必須同時存在。只放文獻不放免責聲明，等於宣稱這份報告
//    有醫療效力；只放免責聲明不放文獻，就是這次被退的原因。
// ─────────────────────────────────────────────────────────────────────────
import type { Reference } from '../lib/references'
import { useLanguage } from '../lib/i18n/context'

interface Props {
  references: Reference[]
  /** 這份報告在講什麼，用於免責聲明的第一句 */
  subject: string
}

export function ReferencesSection({ references, subject }: Props) {
  const { t } = useLanguage()
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-extrabold text-foreground">{t('理論依據與參考文獻')}</h3>

      <p className="mt-2 text-xs leading-relaxed text-foreground/70">
        {t('{subject}的計分方式與建議內容，是依據下列已發表的心理學研究設計的。點擊任一筆可前往原始文獻。', {
          subject,
        })}
      </p>

      <ul className="mt-3 flex flex-col gap-2.5">
        {references.map((ref) => (
          <li key={ref.url} className="flex gap-2 text-xs leading-relaxed text-foreground/70">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary/60" />
            <span>
              {ref.citation}{' '}
              <a
                href={ref.url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-primary underline break-all"
              >
                {ref.url}
              </a>
            </span>
          </li>
        ))}
      </ul>

      {/* 免責聲明：措辭刻意具體到「不是診斷工具」與「求助管道」，
          泛泛的「僅供參考」不足以滿足 1.4.1。 */}
      <div className="mt-4 rounded-xl bg-muted/60 p-3">
        <p className="text-xs font-extrabold text-foreground">{t('重要提醒')}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground/70">
          {t('本報告是自我覺察的參考工具，不是醫療診斷，也不能取代專業的心理諮商或精神醫療。分數高低不代表任何疾病的有無。')}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground/70">
          {t('若你感到持續的低落、焦慮或有傷害自己的念頭，請尋求專業協助：衛福部安心專線 1925（24 小時免付費）、生命線 1995，或前往就近的身心科門診。緊急狀況請撥 119。')}
        </p>
      </div>
    </section>
  )
}
