// 個人頁面「回顧集」小模組：整體回饋／週報／內建感恩日記週回顧的統一顯示入口。
// 顯現條件（自動顯現）：本人 pro_reviews 紀錄 ≥ 2 筆才渲染；0–1 筆完全不出現、不佔位。
import { useEffect, useState } from 'react'
import { useLanguage } from '../lib/i18n/context'
import { track } from '../lib/analytics'
import { fetchMyReviews, markReviewRead, type ReviewRow } from '../lib/reviews'

function formatPeriod(row: ReviewRow): string {
  const s = row.period_start.slice(5).replace('-', '/')
  const e = row.period_end.slice(5).replace('-', '/')
  return s === e ? s : `${s} ~ ${e}`
}

export function ReviewsSection({ userId }: { userId: string }) {
  const { t } = useLanguage()
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null)
  const [opened, setOpened] = useState<ReviewRow | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMyReviews(userId).then((rows) => {
      if (!cancelled) setReviews(rows)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (reviews && reviews.length >= 2) track('profile_reviews_section_shown')
  }, [reviews])

  if (!reviews || reviews.length < 2) return null

  const openReview = (row: ReviewRow) => {
    setOpened(row)
    track('review_opened', { type: row.review_type })
    if (!row.read_at) {
      void markReviewRead(row.id)
      setReviews((prev) => (prev ? prev.map((r) => (r.id === row.id ? { ...r, read_at: new Date().toISOString() } : r)) : prev))
    }
  }

  return (
    <div>
      <p className="mb-2 text-sm font-black text-foreground">{t('我的回顧集')}</p>
      <div className="scroll -mx-5 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar">
        {reviews.map((row) => (
          <button
            key={row.id}
            onClick={() => openReview(row)}
            className="relative w-[200px] shrink-0 rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition active:scale-[0.98]"
          >
            {!row.read_at && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-rust" />}
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{formatPeriod(row)}</p>
            <p className="mt-1 text-[15px] font-black text-foreground">{row.content.title}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {row.content.summary.slice(0, 40)}
              {row.content.summary.length > 40 ? '…' : ''}
            </p>
          </button>
        ))}
      </div>

      {opened && <ReviewSheet row={opened} onClose={() => setOpened(null)} />}
    </div>
  )
}

function TrendChart({ trend }: { trend: { date: string; score: number }[] }) {
  if (!trend || trend.length === 0) return null
  const w = 280
  const h = 80
  const max = Math.max(1, ...trend.map((p) => p.score))
  const step = trend.length > 1 ? w / (trend.length - 1) : 0
  const points = trend.map((p, i) => `${i * step},${h - (p.score / max) * (h - 10) - 5}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }}>
      <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {trend.map((p, i) => (
        <circle key={p.date} cx={i * step} cy={h - (p.score / max) * (h - 10) - 5} r="3" fill="var(--primary)" />
      ))}
    </svg>
  )
}

function ReviewSheet({ row, onClose }: { row: ReviewRow; onClose: () => void }) {
  const { t } = useLanguage()
  const { content } = row
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#1c1714]/40 sm:items-center sm:px-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-md animate-slide-up flex-col overflow-hidden rounded-t-[26px] bg-background shadow-soft sm:rounded-[26px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto px-6 pb-6 pt-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{formatPeriod(row)}</p>
          <h2 className="mt-1 text-xl font-black leading-snug text-foreground">{content.title}</h2>
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground-soft">{content.summary}</p>

          {content.trend && content.trend.length > 0 && (
            <div className="mt-4 rounded-2xl bg-card p-4 shadow-soft">
              <TrendChart trend={content.trend} />
            </div>
          )}

          {content.themes && content.themes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {content.themes.map((theme) => (
                <span key={theme} className="rounded-full bg-tile-mint px-3 py-1.5 text-sm font-bold text-[#3f6b46]">
                  {theme}
                </span>
              ))}
            </div>
          )}

          {content.quote && (
            <div className="mt-4 rounded-2xl bg-tile-peach px-5 py-4 text-center">
              <p className="text-[15px] italic leading-relaxed text-foreground/85">「{content.quote.text}」</p>
              <p className="mt-1.5 text-xs text-foreground/60">{content.quote.source_date}</p>
            </div>
          )}

          {content.challenge && (
            <div className="mt-4 rounded-2xl border border-dashed border-border px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('下週小挑戰')}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-foreground/85">{content.challenge}</p>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-2">
          <button
            onClick={onClose}
            className="w-full rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
          >
            {t('關閉')}
          </button>
        </div>
      </div>
    </div>
  )
}
