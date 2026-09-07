// 一週回顧頁：健心日記卡片底部小框的入口頁。
// 日記次數、感恩日記全文、人生主題、情緒趨勢／文字雲與社群留言都在此彙整；
// AI 週統整仍保留準確性、驚喜感、自我覺察、洞察與行動四段研究架構。
// 超出 AI 週分析額度時，統整回饋改用軟性付費牆呈現前 30%（見 digestLocked）。
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { supabase } from '../lib/supabase'
import { mondayOf, requestWeeklyDigest, isSunday, type GratitudeDepthLevel, type LifeThemeKey, type WeeklyDigestContent } from '../lib/reviews'
import { fetchWeeklyReviewData, type WeeklyReviewData } from '../lib/weeklyReview'
import { downloadNodeAsPng } from '../lib/shareImage'
import { useLanguage } from '../lib/i18n/context'
import { track } from '../lib/analytics'
import { isNativeApp } from '../lib/nativeAuth'
import { enableNotifications, getLocalNotifPermission, type NotifPermission } from '../lib/localNotifications'
import { SoftPaywallSheet } from '../components/paywall/SoftPaywallSheet'
import { ReferencesSection } from '../components/ReferencesSection'
import { WEEKLY_REVIEW_REFERENCES } from '../lib/references'

// 這個提示只問一次：按過「稍後再說」就不再於本頁詢問（仍可在側邊欄「通知」開關開啟）。
const WEEKLY_REVIEW_NOTIF_DISMISS_KEY = 'weekly_review_notif_prompt_dismissed_v1'

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

/**
 * 把週分析的敘事段落攤平成純文字，給軟性付費牆取前 30% 用。
 * 規格 §9 要求那必須是「真實生成內容」，所以這裡組的是報告本身的文字，
 * 不是另外寫的行銷文案。
 */
function digestToPlainText(
  content: WeeklyDigestContent | null,
  t: (s: string) => string,
): string {
  if (!content?.narrative) return ''
  const parts: string[] = []
  for (const { key, label } of NARRATIVE_META) {
    const bullets = narrativeBullets(content.narrative[key])
    if (bullets.length === 0) continue
    parts.push(t(label))
    for (const b of bullets) parts.push(`・${b}`)
    parts.push('')
  }
  return parts.join('\n').trim()
}

const LIFE_THEME_META: Record<LifeThemeKey, { label: string; color: string }> = {
  work: { label: '工作／學業', color: '#88B8CE' },
  relationships: { label: '人際關係', color: '#C68597' },
  health: { label: '身心健康', color: '#6F9875' },
  rest: { label: '休息與恢復', color: '#C9A75D' },
  growth: { label: '自我成長', color: '#9A82B2' },
  other: { label: '生活日常', color: '#A69A8E' },
}

type TFn = (text: string, vars?: Record<string, string | number>) => string

function LifeThemeDonut({ themes, t }: { themes: NonNullable<WeeklyDigestContent['themes']>; t: TFn }) {
  const usable = themes.filter((theme) => theme.count > 0).sort((a, b) => b.count - a.count)
  const total = usable.reduce((sum, theme) => sum + theme.count, 0)
  if (total === 0) return null

  const radius = 37
  const circumference = 2 * Math.PI * radius
  const gapPx = usable.length > 1 ? 9 : 0
  let cumulative = 0

  return (
    <div className="flex items-center gap-4">
      <div className="shrink-0">
        <svg viewBox="0 0 100 100" className="h-36 w-36 -rotate-90" role="img" aria-label={t('人生主題分布')}>
          {usable.map((theme) => {
            const pct = theme.count / total
            const dash = Math.max(0.5, pct * circumference - gapPx)
            const gap = circumference - dash
            const offset = -(cumulative * circumference)
            cumulative += pct
            return (
              <circle
                key={theme.key}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={LIFE_THEME_META[theme.key].color}
                strokeWidth="17"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={offset}
              />
            )
          })}
        </svg>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {usable.map((theme) => (
          <div key={theme.key} className="flex items-center gap-2.5">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: LIFE_THEME_META[theme.key].color }} />
            <span className="min-w-0 flex-1 text-sm font-bold text-foreground">{t(LIFE_THEME_META[theme.key].label)}</span>
            <span className="text-sm font-extrabold text-foreground">{Math.round((theme.count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmotionTrendChart({ points, t }: { points: NonNullable<WeeklyDigestContent['emotion_trend']>; t: TFn }) {
  const data = points
    .map((point) => ({ ...point, score: Math.max(-100, Math.min(100, Number(point.score) || 0)) }))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('再多寫幾篇，情緒趨勢就會出現')}</p>
  }

  const width = 360
  const height = 180
  const pad = { left: 38, right: 14, top: 20, bottom: 34 }
  const innerWidth = width - pad.left - pad.right
  const innerHeight = height - pad.top - pad.bottom
  const x = (index: number) => data.length === 1 ? pad.left + innerWidth / 2 : pad.left + (index / (data.length - 1)) * innerWidth
  const y = (score: number) => pad.top + ((100 - score) / 200) * innerHeight
  const path = data.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.score)}`).join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={t('本週情緒折線圖')}>
        <rect x={pad.left} y={pad.top} width={innerWidth} height={innerHeight / 2} fill="#EDF5F0" />
        <rect x={pad.left} y={pad.top + innerHeight / 2} width={innerWidth} height={innerHeight / 2} fill="#FAF0F2" />
        <text
          x={width - pad.right - 6}
          y={pad.top + 13}
          textAnchor="end"
          fontSize="9"
          fontWeight="700"
          fill="#3F6B46"
        >
          {t('正向情緒')}
        </text>
        <text
          x={width - pad.right - 6}
          y={pad.top + innerHeight - 8}
          textAnchor="end"
          fontSize="9"
          fontWeight="700"
          fill="#A85A72"
        >
          {t('負面情緒')}
        </text>
        {[100, 0, -100].map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#D9CEC2" strokeWidth={tick === 0 ? 1.5 : 1} />
            <text x={pad.left - 7} y={y(tick) + 3} textAnchor="end" fontSize="9" fill="#876B5F">
              {tick > 0 ? `+${tick}` : tick}
            </text>
          </g>
        ))}
        {data.length > 1 && <path d={path} fill="none" stroke="#6FA8C1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {data.map((point, index) => (
          <g key={`${point.date}-${index}`}>
            <circle cx={x(index)} cy={y(point.score)} r="5" fill="#FEFAF0" stroke="#6FA8C1" strokeWidth="3" />
            <text
              x={x(index) + (index === 0 ? 7 : index === data.length - 1 ? -7 : 0)}
              y={point.score > 70 ? y(point.score) + 17 : y(point.score) - 10}
              textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}
              fontSize="10"
              fontWeight="700"
              fill="#542916"
            >
              {point.score > 0 ? `+${point.score}` : point.score}
            </text>
            <text x={x(index)} y={height - 12} textAnchor="middle" fontSize="10" fontWeight="700" fill="#876B5F">
              {point.date.slice(5).replace('-', '/')}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-center text-[11px] leading-relaxed text-muted-foreground">
        {t('依日記文字分析情緒效價，0 代表平穩，越高越正向。')}
      </p>
    </div>
  )
}

function EmotionWordCloud({ emotions, t }: { emotions: WeeklyDigestContent['emotions']; t: TFn }) {
  if (emotions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('再多寫幾篇，情緒文字雲就會出現')}</p>
  }
  const maxCount = Math.max(...emotions.map((emotion) => Math.max(1, emotion.count)))
  const colors = { positive: '#3F6B46', negative: '#A85A72', neutral: '#876B5F' }
  const ordered = [...emotions].sort((a, b) => b.count - a.count)

  return (
    <div>
      <div className="flex min-h-32 flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl bg-[#FCF7EE] px-5 py-6">
        {ordered.map((emotion, index) => {
          const ratio = Math.max(1, emotion.count) / maxCount
          const size = 15 + ratio * 18
          const valence = emotion.valence ?? 'neutral'
          return (
            <span
              key={emotion.label}
              style={{
                color: colors[valence],
                fontSize: `${size}px`,
                fontWeight: ratio > 0.6 ? 900 : 700,
                opacity: 0.72 + ratio * 0.28,
                transform: `translateY(${index % 3 === 1 ? -3 : index % 3 === 2 ? 3 : 0}px)`,
              }}
            >
              {emotion.label}
            </span>
          )
        })}
      </div>
      <div className="mt-2 flex justify-center gap-4 text-[11px] font-bold text-muted-foreground">
        <span className="text-[#3F6B46]">{t('正向')}</span>
        <span>{t('中性')}</span>
        <span className="text-[#A85A72]">{t('負向')}</span>
      </div>
    </div>
  )
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
  // 這份報告是否超出額度（後端標記）。true 時只顯示前 30% + 軟性付費牆。
  const [digestLocked, setDigestLocked] = useState(false)
  const [showSoftPaywall, setShowSoftPaywall] = useState(false)
  const navigate = useNavigate()
  const [sharing, setSharing] = useState(false)
  const [isCurrentWeekSunday, setIsCurrentWeekSunday] = useState(false)
  const [nextSundayDate, setNextSundayDate] = useState<string>('')
  const [notifState, setNotifState] = useState<NotifPermission | 'loading'>('loading')
  const [notifBusy, setNotifBusy] = useState(false)
  const [notifDismissed, setNotifDismissed] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null))
  }, [])

  // 週日前的等待卡片：順便問一次要不要開啟通知，開了才能在週日 21:00 收到「回來看分析」提醒。
  useEffect(() => {
    try { setNotifDismissed(localStorage.getItem(WEEKLY_REVIEW_NOTIF_DISMISS_KEY) === '1') } catch { /* 忽略 */ }

    const refreshNotifState = async () => {
      if (isNativeApp()) {
        setNotifState(await getLocalNotifPermission())
      } else if (typeof Notification !== 'undefined') {
        const p = Notification.permission
        setNotifState(p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt')
      } else {
        setNotifState('unsupported')
      }
    }
    void refreshNotifState()
  }, [])

  const enableWeeklyReviewNotif = async () => {
    setNotifBusy(true)
    track('weekly_review_notif_enable_clicked')
    try {
      if (isNativeApp()) {
        await enableNotifications()
        setNotifState(await getLocalNotifPermission())
      } else if (typeof Notification !== 'undefined') {
        const result = await Notification.requestPermission()
        setNotifState(result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'prompt')
      }
    } finally {
      setNotifBusy(false)
    }
  }

  const dismissNotifPrompt = () => {
    try { localStorage.setItem(WEEKLY_REVIEW_NOTIF_DISMISS_KEY, '1') } catch { /* 忽略 */ }
    setNotifDismissed(true)
  }

  useEffect(() => { track('weekly_review_opened') }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    setExpanded(false)
    setEntriesExpanded(false)
    setDigest(null)
    setDigestState('loading')
    setDigestLocked(false)
    setShowSoftPaywall(false)

    const now = new Date()
    const monday = mondayOf(now)
    monday.setDate(monday.getDate() + weekOffset * 7)

    // 檢查本週是否為周日，以及下個周日的日期（用於提示文字）
    const isThisWeekSunday = weekOffset === 0 && isSunday(now)
    setIsCurrentWeekSunday(isThisWeekSunday)

    if (weekOffset === 0) {
      const nextSunday = new Date(now)
      const daysUntilSunday = (7 - now.getDay()) % 7 || 7
      nextSunday.setDate(nextSunday.getDate() + daysUntilSunday)
      const month = nextSunday.getMonth() + 1
      const date = nextSunday.getDate()
      setNextSundayDate(`${month}/${date}`)
    }

    fetchWeeklyReviewData(userId, monday).then((d) => {
      if (cancelled) return
      setData(d)
      setLoading(false)

      const diaryCount = d.gratitudeCount + d.processCount + d.selfCompassionCount + d.woopCount
      if (diaryCount < 2) {
        setDigestState('unavailable')
        return
      }
      requestWeeklyDigest(d.periodStart).then((row) => {
        if (cancelled) return
        if (row) {
          setDigest(row.content)
          // 超出額度時後端會標 locked：報告有生成，但只給看前 30%（規格 §3）。
          setDigestLocked(row.locked === true)
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

  const totalCount = (data?.gratitudeCount ?? 0) + (data?.processCount ?? 0) + (data?.selfCompassionCount ?? 0) + (data?.woopCount ?? 0)
  const emotionTrendPoints = digest?.emotion_trend?.length ? digest.emotion_trend : (data?.fallbackEmotionTrend ?? [])
  const lifeThemes = digest?.themes?.some((theme) => theme.count > 0) ? digest.themes : (data?.fallbackThemes ?? [])
  const emotionWords = digest?.emotions?.length ? digest.emotions : (data?.fallbackEmotions ?? [])
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

      {/* 本週但還沒到周日時的提示 */}
      {weekOffset === 0 && !isCurrentWeekSunday && (
        <div className="mt-6 rounded-3xl bg-gradient-to-br from-primary/10 to-primary-soft p-6 text-center shadow-soft">
          <p className="text-lg font-bold text-foreground">{t('本週 AI 分析將在本周日更新')}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('請在')} <span className="font-bold text-primary">{nextSundayDate}</span> {t('回來查看')}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-foreground">
            {t('本週的紀錄會照常累積，AI 統整分析會在週日整理完整一週後才顯示。')}
          </p>

          {notifState === 'prompt' && !notifDismissed && (
            <div className="mt-5 flex flex-col items-center gap-3 border-t border-border/50 pt-4">
              <p className="text-sm text-foreground">{t('想在週日分析完成時收到通知嗎？')}</p>
              <div className="flex gap-3">
                <button
                  onClick={dismissNotifPrompt}
                  className="rounded-full border border-border px-5 py-2 text-xs font-bold text-muted-foreground transition hover:bg-muted"
                >
                  {t('稍後再說')}
                </button>
                <button
                  onClick={enableWeeklyReviewNotif}
                  disabled={notifBusy}
                  className="rounded-full bg-gradient-primary px-5 py-2 text-xs font-bold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-60"
                >
                  {notifBusy ? t('處理中…') : t('開啟通知')}
                </button>
              </div>
            </div>
          )}
          {notifState === 'granted' && (
            <p className="mt-4 text-xs font-bold text-emerald-600">{t('✓ 週日會提醒你回來看分析')}</p>
          )}
        </div>
      )}

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
          {/* 感恩／過程／自我慈悲／WOOP 次數：沿用日曆詳情列的色點圓圈語言
              （mint+深綠點＝感恩、blue+primary 點＝過程、pink+玫瑰點＝自我慈悲、lemon+金點＝WOOP） */}
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
            <div className="rounded-3xl bg-tile-pink p-5 text-center">
              <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-card">
                <span className="h-2.5 w-2.5 rounded-full bg-[#a85a72]" />
              </span>
              <p className="mt-2 text-2xl font-extrabold text-foreground">
                {data!.selfCompassionCount}<span className="text-sm font-bold">{t('次')}</span>
              </p>
              <p className="mt-0.5 text-xs font-bold text-foreground/70">{t('自我慈悲')}</p>
            </div>
            <div className="rounded-3xl bg-tile-lemon p-5 text-center">
              <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-card">
                <span className="h-2.5 w-2.5 rounded-full bg-[#8a7a3f]" />
              </span>
              <p className="mt-2 text-2xl font-extrabold text-foreground">
                {data!.woopCount}<span className="text-sm font-bold">{t('次')}</span>
              </p>
              <p className="mt-0.5 text-xs font-bold text-foreground/70">{t('WOOP 目標實踐')}</p>
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

          {/* AI 週分析：彙整所有日記的人生主題、情緒趨勢與情緒詞雲。 */}
          <div className="rounded-3xl bg-card p-5 shadow-soft">
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
              AI Weekly Analysis
            </p>
            <h2 className="mb-3 text-lg font-extrabold text-foreground">{t('AI 週分析')}</h2>

            <div className="mb-5">
              <p className="mb-1.5 text-xs font-bold text-muted-foreground">{t('情緒變化')}</p>
              {digestState === 'loading' ? (
                <div className="h-40 animate-pulse rounded-2xl bg-muted" />
              ) : (
                <EmotionTrendChart points={emotionTrendPoints} t={t} />
              )}
            </div>

            <div className="mb-5">
              <p className="mb-1.5 text-xs font-bold text-muted-foreground">{t('人生主題')}</p>
              {digestState === 'loading' ? (
                <div className="h-14 animate-pulse rounded-2xl bg-muted" />
              ) : lifeThemes.some((theme) => theme.count > 0) ? (
                <LifeThemeDonut themes={lifeThemes} t={t} />
              ) : (digest?.keywords?.length ?? data!.keywords.length) > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {(digest?.keywords?.length ? digest.keywords : data!.keywords).slice(0, 8).map((theme) => (
                    <span key={theme.label} className="rounded-full bg-tile-lemon px-3 py-1 text-xs font-bold text-foreground">
                      {theme.label}{theme.count > 1 ? ` ×${theme.count}` : ''}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('再多寫幾篇，人生主題分析就會出現')}</p>
              )}
            </div>

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
              <p className="mb-1.5 text-xs font-bold text-muted-foreground">{t('情緒文字雲')}</p>
              {digestState === 'loading' ? (
                <div className="h-32 animate-pulse rounded-2xl bg-muted" />
              ) : emotionWords.length > 0 ? (
                <EmotionWordCloud emotions={emotionWords} t={t} />
              ) : weekOffset === 0 && !isCurrentWeekSunday ? (
                <p className="text-sm text-muted-foreground">{t('AI 情緒分析會在本週日整理後顯示')}</p>
              ) : (
                <EmotionWordCloud emotions={[]} t={t} />
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
              <h2 className="mb-3 text-lg font-extrabold text-foreground">{t('Bouba 週統整回饋')}</h2>
              {digestState === 'loading' ? (
                <p className="text-sm text-muted-foreground">{t('AI 正在整理你這一週的日記…')}</p>
              ) : digestLocked ? (
                // 超出額度：報告已生成但只給看前 30%，其餘由軟性付費牆的模糊遮罩處理。
                <button
                  onClick={() => setShowSoftPaywall(true)}
                  className="w-full rounded-2xl bg-muted p-4 text-left"
                >
                  <p className="line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-foreground">
                    {digestToPlainText(digest, t)}
                  </p>
                  <p className="mt-3 text-xs font-extrabold text-primary underline">{t('查看方案')}</p>
                </button>
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

          {/* 理論依據與參考文獻（App Store 審查指南 1.4.1）。
              週報同樣是「健康資訊」，不是只有基線檢測要掛。 */}
          <ReferencesSection
            references={WEEKLY_REVIEW_REFERENCES}
            subject={t('每週 AI 統整回饋')}
          />

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

      {/* 軟性付費牆（規格 §5.4）：半高 sheet，呈現這份報告真實內容的前 30%。 */}
      {showSoftPaywall && (
        <SoftPaywallSheet
          content={digestToPlainText(digest, t)}
          source="weekly_review"
          onUpgrade={() => navigate({ to: '/paywall' })}
          onClose={() => setShowSoftPaywall(false)}
        />
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
  const emotions = (digest?.emotions?.length ? digest.emotions : data.fallbackEmotions).slice(0, 4)
  const shareThemes = digest?.themes?.some((theme) => theme.count > 0) ? digest.themes : data.fallbackThemes
  const lifeThemes = shareThemes.filter((theme) => theme.count > 0).map((theme) => ({
    label: t(LIFE_THEME_META[theme.key].label),
    count: theme.count,
  }))

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
        {lifeThemes.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            {sectionLabel(t('人生主題'))}
            {chips(lifeThemes, '#e5eee7')}
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
            {sectionLabel(t('情緒文字雲'))}
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
