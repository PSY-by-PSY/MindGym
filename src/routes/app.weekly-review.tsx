// 一週回顧頁：健心日記卡片底部小框的入口頁。
// 感恩／過程次數、感恩日記全文、感恩對象分佈、常提到的詞彙、這週收到的社群留言：
// 全部前端直查既有資料表（target_1..3／tag_1..3 寫日記當下就由 AI 標好了，純統計不必再呼叫 AI）。
// 只有「常見情緒」需要讀原文判斷，串接後端 /api/reviews/weekly-digest。
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { supabase } from '../lib/supabase'
import { mondayOf, requestWeeklyDigest, type GratitudeDepthLevel, type WeeklyDigestContent } from '../lib/reviews'
import { fetchWeeklyReviewData, type WeeklyReviewData } from '../lib/weeklyReview'
import { TARGET_COLORS, TARGET_META } from '../lib/gratitudeTargets'
import { downloadNodeAsPng } from '../lib/shareImage'
import { useLanguage } from '../lib/i18n/context'
import { track } from '../lib/analytics'

export const Route = createFileRoute('/app/weekly-review')({
  component: WeeklyReviewPage,
})

function formatRange(start: string, end: string): string {
  const s = start.slice(5).replace('-', '/')
  const e = end.slice(5).replace('-', '/')
  return `${s} – ${e}`
}

// 感恩深度四層次（Lin, 2015）：標籤固定由前端對應，方便 i18n，也不受 AI 回傳字樣影響
const DEPTH_META: { level: GratitudeDepthLevel; label: string }[] = [
  { level: 'recognize', label: '認知到善意' },
  { level: 'feel', label: '感受到感激' },
  { level: 'express', label: '表達感謝與反思' },
  { level: 'reciprocate', label: '回報善意' },
]

// 四段敘事依研究的心理反應層次遞進：準確性 → 驚喜感 → 自我覺察 → 洞察與行動
const NARRATIVE_META: { key: 'accuracy' | 'surprise' | 'awareness' | 'insight'; label: string }[] = [
  { key: 'accuracy', label: '準確性——你這週真實的樣子' },
  { key: 'surprise', label: '驚喜感——你沒注意到的模式' },
  { key: 'awareness', label: '自我覺察——還沒被意識到的需求' },
  { key: 'insight', label: '洞察與行動——接下來可以怎麼做' },
]

/** v3 起 narrative 各向度是條列陣列；容忍 v2 舊資料的單一字串。 */
function narrativeBullets(value: string[] | string | undefined): string[] {
  if (!value) return []
  return (Array.isArray(value) ? value : [value]).filter((s) => s && s.trim().length > 0)
}

type DigestState = 'loading' | 'ready' | 'unavailable'

function WeeklyReviewPage() {
  const { t } = useLanguage()
  const [userId, setUserId] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0) // 0 = 本週，負數 = 過去週
  const [data, setData] = useState<WeeklyReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [entriesExpanded, setEntriesExpanded] = useState(false)
  const [digest, setDigest] = useState<WeeklyDigestContent | null>(null)
  const [digestState, setDigestState] = useState<DigestState>('loading')
  const [sharing, setSharing] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null))
  }, [])

  useEffect(() => { track('weekly_review_opened') }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    setExpanded(false)
    setEntriesExpanded(false)
    setDigest(null)
    setDigestState('loading')

    const monday = mondayOf(new Date())
    monday.setDate(monday.getDate() + weekOffset * 7)

    fetchWeeklyReviewData(userId, monday).then((d) => {
      if (cancelled) return
      setData(d)
      setLoading(false)

      if (d.gratitudeCount < 2) {
        setDigestState('unavailable')
        return
      }
      requestWeeklyDigest(d.periodStart).then((row) => {
        if (cancelled) return
        if (row) {
          setDigest(row.content)
          setDigestState('ready')
        } else {
          setDigestState('unavailable')
        }
      })
    })
    return () => { cancelled = true }
  }, [userId, weekOffset])

  const switchWeek = (delta: number) => {
    setWeekOffset((o) => Math.min(0, o + delta))
    track('weekly_review_week_switched')
  }

  const toggleExpanded = () => {
    setExpanded((e) => {
      if (!e) track('weekly_review_feedback_expanded')
      return !e
    })
  }

  const toggleEntriesExpanded = () => {
    setEntriesExpanded((e) => {
      if (!e) track('weekly_review_entries_expanded')
      return !e
    })
  }

  const totalCount = (data?.gratitudeCount ?? 0) + (data?.processCount ?? 0)
  const visibleComments = expanded ? (data?.comments ?? []) : (data?.comments ?? []).slice(0, 2)
  const visibleEntries = entriesExpanded ? (data?.gratitudeEntries ?? []) : (data?.gratitudeEntries ?? []).slice(0, 2)

  // 生成分享圖 → 原生分享面板（Line／IG）或下載；使用者取消視為正常結束。
  // 高度依實際內容量測（scrollHeight），而非寫死 1440——AI 分析的段落數（對象／深度／
  // 詞彙／情緒）隨資料量變動，寫死高度會讓內容被畫布邊界裁切、看起來像文字被遮住。
  const handleShare = async () => {
    if (!shareRef.current || !data || sharing) return
    setSharing(true)
    track('weekly_review_shared')
    try {
      const width = 1080
      const height = Math.ceil(shareRef.current.scrollHeight)
      await downloadNodeAsPng(
        shareRef.current,
        `psybypsy-weekly-${data.periodStart}.png`,
        t('本週回顧'),
        { width, height },
      )
    } catch (e) {
      console.error('[weekly-review share]', e)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-5 pb-10 md:px-10">
      <div className="flex items-center gap-3 pt-2">
        <Link
          to="/app/profile"
          aria-label={t('返回')}
          className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-black text-foreground transition active:scale-90"
        >
          ‹
        </Link>
        <h1 className="text-lg font-extrabold text-foreground">{t('本週回顧')}</h1>
      </div>

      {/* 週切換 */}
      <div className="mt-3 flex items-center justify-center gap-4">
        <button
          onClick={() => switchWeek(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground transition active:scale-95"
        >
          ‹
        </button>
        <span className="font-en text-sm font-extrabold tracking-[0.04em] text-foreground">
          {data ? formatRange(data.periodStart, data.periodEnd) : '…'}
        </span>
        <button
          onClick={() => switchWeek(1)}
          disabled={weekOffset >= 0}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground transition active:scale-95 disabled:opacity-30"
        >
          ›
        </button>
      </div>

      {loading ? (
        <div className="mt-6 flex flex-col gap-4">
          <div className="h-24 animate-pulse rounded-3xl bg-primary-soft" />
          <div className="h-32 animate-pulse rounded-3xl bg-primary-soft" />
        </div>
      ) : totalCount === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-3xl bg-card py-14 text-center shadow-soft">
          <p className="text-sm font-bold text-muted-foreground">{t('這週還沒有紀錄')}</p>
          {weekOffset === 0 && (
            <Link
              to="/app/gratitude"
              className="mt-5 rounded-full bg-gradient-primary px-6 py-2.5 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
            >
              {t('寫下第一篇 →')}
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {/* 感恩／過程次數：沿用日曆詳情列的色點圓圈語言（mint+深綠點＝感恩、blue+primary 點＝過程） */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-tile-mint p-5 text-center">
              <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-card">
                <span className="h-2.5 w-2.5 rounded-full bg-[#3f6b46]" />
              </span>
              <p className="mt-2 text-2xl font-extrabold text-foreground">
                {data!.gratitudeCount}<span className="text-sm font-bold">{t('次')}</span>
              </p>
              <p className="mt-0.5 text-xs font-bold text-foreground/70">{t('感恩日記')}</p>
            </div>
            <div className="rounded-3xl bg-tile-blue p-5 text-center">
              <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-card">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              <p className="mt-2 text-2xl font-extrabold text-foreground">
                {data!.processCount}<span className="text-sm font-bold">{t('次')}</span>
              </p>
              <p className="mt-0.5 text-xs font-bold text-foreground/70">{t('過程目標覺察')}</p>
            </div>
          </div>

          {/* 這週寫下的感恩日記（全文） */}
          {data!.gratitudeEntries.length > 0 && (
            <div className="rounded-3xl bg-card p-5 shadow-soft">
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
                Weekly Gratitude
              </p>
              <h2 className="mb-3 text-lg font-extrabold text-foreground">{t('這週寫下的感恩日記')}</h2>
              <div className="flex flex-col gap-3">
                {visibleEntries.map((e) => (
                  <div key={e.id} className="rounded-2xl bg-tile-mint p-4">
                    <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.15em] text-foreground/60">
                      {e.entryDate}
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {e.items.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground">
                          <span className="mt-0.5 shrink-0 text-foreground/40">{i + 1}.</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {data!.gratitudeEntries.length > 2 && (
                <button
                  onClick={toggleEntriesExpanded}
                  className="mt-2 w-full text-center text-xs font-extrabold text-muted-foreground"
                >
                  {entriesExpanded ? t('收合 ▴') : t('展開全部日記 ▾')}
                </button>
              )}
            </div>
          )}

          {/* 這週收到的留言 */}
          {data!.comments.length > 0 && (
            <div className="rounded-3xl bg-card p-5 shadow-soft">
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
                Community Feedback
              </p>
              <h2 className="mb-3 text-lg font-extrabold text-foreground">{t('這週收到的留言')}</h2>
              <div className="flex flex-col gap-2">
                {visibleComments.map((c) => (
                  <div key={c.id} className="rounded-2xl bg-tile-peach px-4 py-3">
                    <p className="text-sm leading-relaxed text-foreground">「{c.content}」</p>
                    <p className="mt-1 text-[11px] text-foreground/60">
                      {c.anonName ? `${c.anonName} · ` : ''}
                      {c.createdAt.slice(5, 10).replace('-', '/')}
                    </p>
                  </div>
                ))}
              </div>
              {data!.comments.length > 2 && (
                <button
                  onClick={toggleExpanded}
                  className="mt-2 w-full text-center text-xs font-extrabold text-muted-foreground"
                >
                  {expanded ? t('收合 ▴') : t('展開全部回饋 ▾')}
                </button>
              )}
            </div>
          )}

          {/* AI 週分析：對象／詞彙（前端統計）＋ 情緒（後端 AI） */}
          <div className="rounded-3xl bg-card p-5 shadow-soft">
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
              AI Weekly Analysis
            </p>
            <h2 className="mb-3 text-lg font-extrabold text-foreground">{t('AI 週分析')}</h2>

            {data!.targets.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-xs font-bold text-muted-foreground">{t('最常感恩的對象')}</p>
                <div className="flex h-3.5 overflow-hidden rounded-full bg-muted">
                  {data!.targets.map((seg) => (
                    <span
                      key={seg.code}
                      style={{ width: `${seg.pct * 100}%`, background: TARGET_COLORS[seg.code] }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {data!.targets.map((seg) => (
                    <span key={seg.code} className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ background: TARGET_COLORS[seg.code] }} />
                      {t(TARGET_META[seg.code].label)} {Math.round(seg.pct * 100)}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 感恩深度：Lin (2015) 四層次的件數分布（AI 逐件編碼） */}
            {(() => {
              const depth = digest?.depth ?? []
              const total = depth.reduce((s, d) => s + d.count, 0)
              if (total === 0) return null
              return (
                <div className="mb-4">
                  <p className="mb-1.5 text-xs font-bold text-muted-foreground">{t('感恩深度')}</p>
                  <div className="flex flex-col gap-1.5">
                    {DEPTH_META.map(({ level, label }) => {
                      const count = depth.find((d) => d.level === level)?.count ?? 0
                      const pct = Math.round((count / total) * 100)
                      return (
                        <div key={level} className="flex items-center gap-2">
                          <span className="w-[104px] shrink-0 text-xs font-bold text-foreground">{t(label)}</span>
                          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                            {/* 注意：全站色票是 var(--primary) 字串，Tailwind 的 /alpha 修飾符（如 bg-primary/70）不會生效 */}
                            <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </span>
                          <span className="w-16 shrink-0 text-right text-xs font-bold text-muted-foreground">
                            {count} · {pct}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* 詞彙：優先用 AI 分析結果（舊資料沒存 tag_1..3 也能出現），沒有時退回 tag 統計 */}
            {(() => {
              const keywords = digest?.keywords?.length ? digest.keywords : data!.keywords
              if (keywords.length === 0) return null
              return (
                <div className="mb-4">
                  <p className="mb-1.5 text-xs font-bold text-muted-foreground">{t('常提到的詞彙')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {keywords.slice(0, 8).map((k) => (
                      <span key={k.label} className="rounded-full bg-tile-lemon px-3 py-1 text-xs font-bold text-foreground">
                        {k.label}{k.count > 1 ? ` ×${k.count}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })()}

            <div>
              <p className="mb-1.5 text-xs font-bold text-muted-foreground">{t('常見情緒')}</p>
              {digestState === 'loading' ? (
                <p className="text-sm text-muted-foreground">{t('AI 正在分析中…')}</p>
              ) : digest && digest.emotions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {digest.emotions.map((e) => (
                    <span key={e.label} className="rounded-full bg-tile-pink px-3 py-1 text-xs font-bold text-foreground">
                      {e.label}{e.count > 1 ? ` ×${e.count}` : ''}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('再多寫幾篇，AI 情緒分析就會出現')}</p>
              )}
            </div>
          </div>

          {/* AI 週統整回饋：四段敘事，依「準確性→驚喜感→自我覺察→洞察與行動」遞進 */}
          {(digestState === 'loading' ||
            (digest?.narrative && NARRATIVE_META.some(({ key }) => narrativeBullets(digest.narrative?.[key]).length > 0))) && (
            <div className="rounded-3xl bg-card p-5 shadow-soft">
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
                Weekly Integrative Feedback
              </p>
              <h2 className="mb-3 text-lg font-extrabold text-foreground">{t('AI 週統整回饋')}</h2>
              {digestState === 'loading' ? (
                <p className="text-sm text-muted-foreground">{t('AI 正在整理你這一週的日記…')}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {NARRATIVE_META.map(({ key, label }) => {
                    const bullets = narrativeBullets(digest?.narrative?.[key])
                    if (bullets.length === 0) return null
                    return (
                      <div key={key} className="rounded-2xl bg-muted p-4">
                        <p className="mb-2 text-xs font-extrabold text-primary">{t(label)}</p>
                        <ul className="flex flex-col gap-1.5">
                          {bullets.map((line, i) => (
                            <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground">
                              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 分享成果圖：生成 PNG 後叫出系統分享面板（Line／IG）；桌面退回下載 */}
          <button
            onClick={handleShare}
            disabled={sharing}
            className="w-full rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {sharing ? t('圖片生成中…') : t('分享本週成果')}
          </button>
        </div>
      )}

      {/* 畫面外的分享卡（html-to-image 截圖來源） */}
      {data && totalCount > 0 && (
        <div aria-hidden className="pointer-events-none fixed left-[-3000px] top-0">
          <ShareCard data={data} digest={digest} t={t} cardRef={shareRef} />
        </div>
      )}
    </div>
  )
}

// ── 分享卡（寬 1080、高度隨內容自動撐開，inline style 用品牌色票，避免 Tailwind rem 在大畫布下失準）──

const SHARE_INK = '#542916'
const SHARE_MUTED = '#876B5F'

function ShareCard({
  data,
  digest,
  t,
  cardRef,
}: {
  data: WeeklyReviewData
  digest: WeeklyDigestContent | null
  t: (text: string, vars?: Record<string, string | number>) => string
  cardRef: RefObject<HTMLDivElement>
}) {
  const depth = digest?.depth ?? []
  const depthTotal = depth.reduce((s, d) => s + d.count, 0)
  const keywords = (digest?.keywords?.length ? digest.keywords : data.keywords).slice(0, 6)
  const emotions = (digest?.emotions ?? []).slice(0, 4)

  const sectionLabel = (text: string) => (
    <p style={{ fontSize: 28, fontWeight: 800, color: SHARE_MUTED, margin: '0 0 16px' }}>{text}</p>
  )

  // flexShrink:0 + whiteSpace:'nowrap' 是必要的：這個 chip 列是 flexWrap 容器，
  // 若不鎖住，瀏覽器在畫布邊界前空間不夠時會把單一 chip「壓窄」，字就在 chip 內部斷行，
  // 撐高該 chip 卻不影響同列其他 chip，看起來像文字被裁切/錯位（html-to-image 的
  // foreignObject 轉譯對這種擠壓換行特別容易算錯高度，導致下一列疊上來）。
  const chips = (items: { label: string; count: number }[], bg: string) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
      {items.map((k) => (
        <span
          key={k.label}
          style={{
            background: bg, color: SHARE_INK, borderRadius: 999,
            padding: '10px 26px', fontSize: 28, fontWeight: 800,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {k.label}{k.count > 1 ? ` ×${k.count}` : ''}
        </span>
      ))}
    </div>
  )

  const statTile = (bg: string, dot: string, n: number, unit: string, label: string) => (
    <div style={{ flex: 1, background: bg, borderRadius: 32, padding: '30px 16px', textAlign: 'center' }}>
      <span style={{
        margin: '0 auto', width: 44, height: 44, borderRadius: 999, background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ width: 14, height: 14, borderRadius: 999, background: dot }} />
      </span>
      <p style={{ fontSize: 56, fontWeight: 900, color: SHARE_INK, margin: '14px 0 0', lineHeight: 1.1 }}>
        {n}<span style={{ fontSize: 28, fontWeight: 800 }}>{unit}</span>
      </p>
      <p style={{ fontSize: 26, fontWeight: 800, color: `${SHARE_INK}B3`, margin: '6px 0 0' }}>{label}</p>
    </div>
  )

  return (
    <div
      ref={cardRef}
      style={{
        // 寬度固定（社群限動比例），高度依內容自然撐開——AI 分析段落數會隨資料量變動，
        // 寫死高度會讓內容在畫布邊界被裁切／文字看起來被遮住（見 handleShare 的量測邏輯）。
        width: 1080, background: '#FEFAF0', color: SHARE_INK,
        padding: 64, display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <p style={{ fontSize: 26, fontWeight: 800, letterSpacing: '0.3em', color: SHARE_MUTED, margin: 0 }}>
        PSY BY PSY · WEEKLY REVIEW
      </p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 28, marginTop: 14 }}>
        <h1 style={{ fontSize: 64, fontWeight: 900, margin: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>{t('本週回顧')}</h1>
        <span style={{ fontSize: 34, fontWeight: 800, color: SHARE_MUTED, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {formatRange(data.periodStart, data.periodEnd)}
        </span>
      </div>

      {/* 數據 tiles */}
      <div style={{ display: 'flex', gap: 22, marginTop: 44 }}>
        {statTile('#d7ebd9', '#3f6b46', data.gratitudeCount, t('次'), t('感恩日記'))}
        {statTile('#cfe2ee', '#88B8CE', data.processCount, t('次'), t('過程目標覺察'))}
        {statTile('#f3e3c4', '#a13a1e', data.comments.length, t('則'), t('收到留言'))}
      </div>

      {/* AI 週分析（自然高度，不用 flex:1 撐滿固定畫布——畫布本身已改為隨內容自動撐高） */}
      <div style={{ background: '#fff', borderRadius: 36, padding: 44, marginTop: 32 }}>
        {data.targets.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            {sectionLabel(t('最常感恩的對象'))}
            <div style={{ display: 'flex', height: 30, borderRadius: 999, overflow: 'hidden', background: '#f1e8d8' }}>
              {data.targets.map((seg) => (
                <span key={seg.code} style={{ width: `${seg.pct * 100}%`, background: TARGET_COLORS[seg.code] }} />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 30px', marginTop: 18 }}>
              {data.targets.map((seg) => (
                <span key={seg.code} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 26, fontWeight: 800, color: SHARE_MUTED, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 999, background: TARGET_COLORS[seg.code], flexShrink: 0 }} />
                  {t(TARGET_META[seg.code].label)} {Math.round(seg.pct * 100)}%
                </span>
              ))}
            </div>
          </div>
        )}

        {depthTotal > 0 && (
          <div style={{ marginBottom: 40 }}>
            {sectionLabel(t('感恩深度'))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {DEPTH_META.map(({ level, label }) => {
                const count = depth.find((d) => d.level === level)?.count ?? 0
                const pct = Math.round((count / depthTotal) * 100)
                return (
                  <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <span style={{ width: 230, fontSize: 26, fontWeight: 800, flexShrink: 0, whiteSpace: 'nowrap' }}>{t(label)}</span>
                    <span style={{ flex: 1, minWidth: 0, height: 22, borderRadius: 999, background: '#f1e8d8', overflow: 'hidden', display: 'block' }}>
                      <span style={{ display: 'block', height: '100%', borderRadius: 999, background: '#88B8CE', width: `${pct}%` }} />
                    </span>
                    {/* width:120 曾經在雙位數（如「10 · 42%」）時擠出換行，換行後的高度沒被
                        html-to-image 的 foreignObject 轉譯正確撐開，導致疊到下一列。
                        nowrap + 加寬到 160 保證單行，flexShrink:0 保證不再被壓窄。 */}
                    <span style={{ width: 160, fontSize: 26, fontWeight: 800, color: SHARE_MUTED, textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {count} · {pct}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {keywords.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            {sectionLabel(t('常提到的詞彙'))}
            {chips(keywords, '#ece0c8')}
          </div>
        )}

        {emotions.length > 0 && (
          <div>
            {sectionLabel(t('常見情緒'))}
            {chips(emotions, '#f3d9df')}
          </div>
        )}
      </div>

      {/* Footer */}
      <p style={{ textAlign: 'center', fontSize: 26, fontWeight: 800, letterSpacing: '0.35em', color: SHARE_MUTED, margin: '36px 0 0' }}>
        PSY BY PSY · TRAIN YOUR MIND
      </p>
    </div>
  )
}
