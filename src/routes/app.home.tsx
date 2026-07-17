import { useEffect, useState } from 'react'
import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import { recommendPractice, type Recommendation } from '../lib/recommend'
import { hasSkippedOnboarding } from '../lib/onboardingSkip'
import { checkAndGenerateReviews } from '../lib/reviews'
import { isoLocalDate } from '../lib/date'
import { ProModuleSection } from '../components/pro/ProModuleSection'
import { useLanguage } from '../lib/i18n/context'
import homeMascot from '../assets/ui/home-mascot.png'
import gratitudeMascot from '../assets/ui/gratitude-mascot.png'
import featuredGratitude from '../assets/ui/featured-gratitude.png'
import exerciseGratitude from '../assets/ui/exercise-gratitude-tight.png'
import processGoalExercise from '../assets/ui/process-goal-exercise.png'
import processGoalIcon from '../assets/ui/過程目標覺察icon.png'
import threeGoodThingsCover from '../assets/ui/three-good-things-cover.png'
import selfCompassionCover from '../assets/ui/self-compassion-cover.png'
import mindfulnessCover from '../assets/ui/mindfulness-cover.png'
import threeGoodThingsIcon from '../assets/ui/three-good-things-icon-tight.png'
import selfCompassionIcon from '../assets/ui/self-compassion-icon-tight.png'
import mindfulnessIcon from '../assets/ui/mindfulness-icon-tight.png'
import permaP from '../assets/ui/perma-p-tight.png'
import permaE from '../assets/ui/perma-e-tight.png'
import permaR from '../assets/ui/perma-r-tight.png'
import permaM from '../assets/ui/perma-m-tight.png'
import permaA from '../assets/ui/perma-a-tight.png'

export const Route = createFileRoute('/app/home')({
  beforeLoad: async ({ context }) => {
    const user = context.session!.user
    const userId = user.id
    const fallbackName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split('@')[0] ??
      '朋友'

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('id', userId)
      .maybeSingle()

    if (!profile) {
      await supabase.from('profiles').insert({ id: userId, name: fallbackName })
    } else if (!profile.name && fallbackName) {
      await supabase.from('profiles').update({ name: fallbackName }).eq('id', userId)
    }

    const userName = profile?.name || fallbackName

    const { data: scores } = await supabase
      .from('perma_scores')
      .select('p_score, e_score, r_score, m_score, a_score')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)

    // 心理測驗不再強制：使用者可以先跳過，之後不會每次回首頁都被攔下來重問。
    if ((!scores || scores.length === 0) && !hasSkippedOnboarding()) {
      throw redirect({ to: '/onboarding' })
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: todayGratitude } = await supabase
      .from('gratitude_entries')
      .select('id')
      .eq('user_id', userId)
      .eq('practice_type', 'gratitude')
      .gte('created_at', todayStart.toISOString())
      .limit(1)

    // 由雷達圖（最新 PERMA 分數）決定今天推薦的練習
    const recommendation = recommendPractice(scores?.[0] ?? null)

    return { userId, userName, hasGratitudeToday: (todayGratitude?.length ?? 0) > 0, recommendation }
  },
  component: HomePage,
})

// 順序：感恩日記 → 過程目標覺察 → 三件好事 → 自我慈悲 → 正念冥想
const modules = [
  {
    name: '感恩日記',
    meta: '初階 · 五分鐘',
    to: '/app/gratitude' as const,
    searchName: null,
    locked: false,
    featured: true,
  },
  {
    name: '過程目標覺察',
    meta: '初階 · 三分鐘',
    to: '/app/process-goal' as const,
    searchName: null,
    locked: false,
    featured: false,
    img: processGoalExercise,
    imgRotated: true,
  },
  {
    name: '三件好事',
    meta: '初階·五分鐘',
    to: '/app/placeholder' as const,
    searchName: '三件好事',
    locked: true,
    featured: false,
    img: threeGoodThingsCover,
    imgPosition: 'right' as const,
  },
  {
    name: '自我慈悲',
    meta: '初階·五分鐘',
    to: '/app/self-compassion' as const,
    searchName: '自我慈悲',
    locked: false,
    featured: false,
    img: selfCompassionCover,
    imgPosition: 'center' as const,
  },
  {
    name: '正念冥想',
    meta: '初階·五分鐘',
    to: '/app/placeholder' as const,
    searchName: '正念冥想',
    locked: true,
    featured: false,
    img: mindfulnessCover,
    imgPosition: 'center' as const,
  },
  {
    name: 'WOOP 目標實踐',
    meta: '初階·五分鐘',
    to: '/app/placeholder' as const,
    searchName: 'WOOP 目標實踐',
    locked: true,
    featured: false,
    // TODO: 目前沒有 WOOP 專屬插畫，暫用中性佔位色塊，正式插畫到位後補上 img
    imgPosition: 'center' as const,
  },
]

// 工作坊專屬練習：配合線上工作坊的限定模塊，首次點擊需輸入工作坊密碼
// （密碼閘門由各模塊路由的 WorkshopGate 處理，這裡只是入口卡片）。
const workshopModules = [
  { name: '暖身卡牌', to: '/app/workshop/warmup' as const },
  { name: '找尋真實自我', to: '/app/workshop/authentic-self' as const },
  { name: '生命最後一天', to: '/app/workshop/last-day' as const },
]

function HomePage() {
  const { userId, userName, recommendation } = Route.useRouteContext()
  const { t } = useLanguage()

  // lazy 檢查是否有新的回顧報告可生成（每人每天最多一次，見 reviews.ts）。
  // 不 await、不阻塞畫面：純背景檢查。
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user.id
      if (uid) void checkAndGenerateReviews(uid)
    })
  }, [])

  return (
    <div className="mx-auto max-w-md animate-fade-up px-5 pt-3 pb-28">
      {/* 標題 + 吉祥物 */}
      <div className="relative min-h-[118px]">
        <img
          src={homeMascot}
          alt=""
          className="pointer-events-none absolute -right-2 -top-4 w-[140px] opacity-95"
        />
        <p className="pt-1.5 text-base font-light tracking-[0.05em] text-foreground">{t('嗨，歡迎回來')}</p>
        <h1 className="mt-3 max-w-[64%] text-[25px] font-black leading-[1.32] tracking-[0.03em] text-muted-foreground">
          {t('{name}，今天想練哪塊心理肌肉？', { name: userName })}
        </h1>
      </div>

      {/* 健心訓練模組—大卡、左右滑動 */}
      <SectionTitle zh={t('PSY by PSY 健心訓練模組')} />
      <div className="scroll -mx-5 flex gap-3.5 overflow-x-auto px-5 pb-1.5 no-scrollbar">
        {modules.map((mod) =>
          mod.featured ? (
            <FeaturedModuleCard key={mod.name} {...mod} />
          ) : mod.locked ? (
            <WipModuleCard key={mod.name} {...mod} />
          ) : (
            <ActiveModuleCard key={mod.name} {...mod} />
          ),
        )}
      </div>
      <p className="mt-2.5 text-center text-xs text-[#a99a86]">{t('← 左右滑動瀏覽更多模組 →')}</p>

      {/* 工作坊專屬練習 */}
      <WorkshopSection />

      {/* 專業模組區 */}
      <ProModuleSection />

      {/* 健心訓練中心 */}
      <TrainingCenter recommendation={recommendation} userId={userId} />

      {/* 今日練習廣告浮標—依雷達圖推薦，固定在畫面角落，關閉後本次瀏覽不再顯示 */}
      <TodayPracticeBadge recommendation={recommendation} />
    </div>
  )
}

// ─── shared bits ──────────────────────────────────────────────────────────────

function SectionTitle({ zh }: { zh: string }) {
  return (
    <div className="mb-3.5 mt-7">
      <h2 className="text-[23px] font-black tracking-[0.03em] text-foreground">{zh}</h2>
    </div>
  )
}

function ArrowCircle() {
  return (
    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 border-foreground">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </span>
  )
}

function CloudIcon() {
  return (
    <svg width="34" height="26" viewBox="0 0 34 26" fill="none" stroke="#88B8CE" strokeWidth="2" className="shrink-0">
      <path d="M9 22h16a6 6 0 0 0 1-11.9A8 8 0 0 0 10 9 6 6 0 0 0 9 22Z" fill="#eaf3f7" />
    </svg>
  )
}

// ─── module carousel cards ─────────────────────────────────────────────────────

type ModuleProps = (typeof modules)[number]

function FeaturedModuleCard({ name, meta }: ModuleProps) {
  const { t } = useLanguage()
  return (
    <Link
      to="/app/gratitude"
      onClick={() => track('module_opened', { module: name })}
      className="relative flex h-[336px] w-[300px] shrink-0 snap-center flex-col justify-end overflow-hidden rounded-[22px] text-left shadow-[0_5px_14px_rgba(0,0,0,0.16)] transition active:scale-[0.98]"
      style={{ background: '#FEFAF0' }}
    >
      <img
        src={featuredGratitude}
        alt=""
        className="pointer-events-none absolute -left-40 -top-[143px] h-[560px] w-[560px] max-w-none object-cover"
      />
      {/* 米白色底板：確保標題無論長短都落在卡片下半部，不會蓋到上方插畫 */}
      <div className="absolute inset-x-0 bottom-0 z-[5] h-[104px]" style={{ background: '#FEFAF0' }} />
      <div className="relative z-10 p-5 pb-6">
        <div className="text-[22px] font-black leading-[1.15] tracking-[0.04em] text-foreground">{t(name)}</div>
        <div className="mt-1.5 text-[15px] font-bold tracking-[0.04em] text-muted-foreground">{t(meta)}</div>
      </div>
    </Link>
  )
}

function ActiveModuleCard(props: ModuleProps) {
  const { name, meta, to } = props
  const img = 'img' in props && props.img ? props.img : featuredGratitude
  const imgRotated = 'imgRotated' in props && props.imgRotated
  const { t } = useLanguage()
  return (
    <Link
      to={to}
      onClick={() => track('module_opened', { module: name })}
      className="relative flex h-[336px] w-[300px] shrink-0 snap-center flex-col justify-end overflow-hidden rounded-[22px] text-left shadow-[0_5px_14px_rgba(0,0,0,0.16)] transition active:scale-[0.98]"
      style={{ background: '#FEFAF0' }}
    >
      {imgRotated ? (
        <img
          src={img}
          alt=""
          className="pointer-events-none absolute left-1/2 h-[300px] w-[230px] max-w-none object-cover"
          style={{ top: '110px', transform: 'translate(-50%, -50%) rotate(-90deg)', objectPosition: '50% 8%' }}
        />
      ) : (
        <img
          src={img}
          alt=""
          className="pointer-events-none absolute -left-40 -top-32 h-[560px] w-[560px] max-w-none object-cover"
        />
      )}
      {/* 米白色底板：確保標題無論長短都落在卡片下半部，不會蓋到上方插畫 */}
      <div className="absolute inset-x-0 bottom-0 z-[5] h-[104px]" style={{ background: '#FEFAF0' }} />
      <div className="relative z-10 p-5 pb-6">
        <div className="text-[22px] font-black leading-[1.15] tracking-[0.04em] text-foreground">{t(name)}</div>
        <div className="mt-1.5 text-[15px] font-bold tracking-[0.04em] text-muted-foreground">{t(meta)}</div>
      </div>
    </Link>
  )
}

function WipModuleCard(props: ModuleProps) {
  const { name, meta } = props
  const img = 'img' in props ? props.img : undefined
  const imgPosition = 'imgPosition' in props && props.imgPosition === 'right' ? 'right top' : 'center top'
  const { t } = useLanguage()
  return (
    <div
      className="relative flex h-[336px] w-[300px] shrink-0 snap-center flex-col justify-end overflow-hidden rounded-[22px] text-left shadow-[0_5px_14px_rgba(0,0,0,0.16)]"
      style={{ background: '#FEFAF0' }}
    >
      {/* 圖片高度精準卡在文字底板上緣（336 - 104 = 232px），上緣切齊卡片頂部、下緣切齊底板頂部，不留白 */}
      {img ? (
        <img
          src={img}
          alt=""
          className="pointer-events-none absolute inset-x-0 top-0 h-[232px] w-full object-cover"
          style={{ objectPosition: imgPosition }}
        />
      ) : (
        // 尚無專屬插畫時的中性佔位色塊，等插畫到位後改回 img
        <div className="absolute inset-x-0 top-0 h-[232px] w-full bg-tile-lemon" />
      )}
      {/* 米白色底板：確保標題無論長短都落在卡片下半部，不會蓋到上方插畫 */}
      <div className="absolute inset-x-0 bottom-0 z-[5] h-[104px]" style={{ background: '#FEFAF0' }} />
      <div className="relative z-10 p-5 pb-6">
        <div className="text-[22px] font-black leading-[1.15] tracking-[0.04em] text-foreground">{t(name)}</div>
        <div className="mt-1.5 text-[15px] font-bold tracking-[0.04em] text-muted-foreground">{t(meta)}</div>
      </div>
      <span className="absolute right-3.5 top-3.5 z-10 flex items-center gap-1.5 rounded-full bg-[#1c1714]/60 px-3 py-1.5 text-[13px] font-bold text-cream backdrop-blur-sm">
        <LockIcon className="h-3.5 w-3.5" />
        {t('敬請期待')}
      </span>
    </div>
  )
}

// ─── today practice floating badge（廣告浮標） ──────────────────────────────────

// 關閉只作用於這次瀏覽（單純 component state，不存 storage）：重新整理或下次再進首頁就會再出現。
function TodayPracticeBadge({ recommendation }: { recommendation: Recommendation }) {
  const { t } = useLanguage()
  const [dismissed, setDismissed] = useState(false)
  const linkProps = recommendation.search
    ? { to: recommendation.to, search: recommendation.search }
    : { to: recommendation.to }

  if (dismissed) return null

  const label = t(recommendation.name)
  const labelSizeCls = label.length > 10 ? 'text-base leading-[1.15]' : 'text-2xl leading-[1.15]'

  return (
    // 外層貼齊視窗兩側、內層 mx-auto max-w-md 與其餘頁面內容同一欄位對齊（比照 BottomNav 的做法），
    // 避免畫面比手機版面寬時，浮標貼著瀏覽器邊緣、跟置中的內容欄位對不齊。
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-40">
      <div className="pointer-events-none relative mx-auto max-w-md">
        <div className="pointer-events-auto absolute right-4 bottom-0">
          <Link
            {...(linkProps as Parameters<typeof Link>[0])}
            onClick={() => track('today_practice_opened', { module: recommendation.name })}
            aria-label={t('今天的{name}！', { name: t(recommendation.name) })}
            className="relative flex h-44 w-44 items-center justify-center rounded-full bg-[#88B8CE] shadow-[0_10px_24px_rgba(40,24,12,0.35)] transition active:scale-95"
          >
            {/* 文字獨立一層並裁切，避免超出藍色圓圈；吉祥物圖片留在外層才能露出圓圈之外 */}
            <div className="absolute inset-0 flex flex-col items-center overflow-hidden rounded-full pt-8 text-center">
              <span className="-rotate-3 text-xs font-bold leading-tight tracking-[0.02em] text-cream">
                {t('點擊直接開始今天的')}
              </span>
              <span className={`mt-1.5 max-w-[140px] px-2 font-black tracking-[0.02em] text-cream ${labelSizeCls}`}>
                {label}
              </span>
            </div>
            {/* 露出圓圈外的量只取決於 -bottom 位移，跟圖片高度無關：位移縮小到只露出腳尖，
                同時把高度跟著縮小，才能維持跟上方文字的淨空間距 */}
            <img
              src={gratitudeMascot}
              alt=""
              className="pointer-events-none absolute -bottom-3 left-1/2 h-20 w-auto -translate-x-1/2 object-contain"
            />
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t('關閉')}
            className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-foreground bg-cream shadow-[0_2px_5px_rgba(40,24,12,0.3)] transition active:scale-90"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#542916" strokeWidth="3" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Workshop Section ─────────────────────────────────────────────────────────

function WorkshopSection() {
  const { t } = useLanguage()
  return (
    <section>
      <SectionTitle zh={t('工作坊專屬練習')} />
      <div className="flex flex-col gap-3 rounded-[22px] bg-[#88B8CE]/55 p-4">
        {workshopModules.map((mod) => (
          <Link
            key={mod.name}
            to={mod.to}
            onClick={() => track('module_opened', { module: mod.name })}
            className="flex items-center gap-3.5 rounded-2xl bg-cream px-4 py-3.5 shadow-[0_2px_5px_rgba(0,0,0,0.08)] transition active:scale-[0.98]"
          >
            <CloudIcon />
            <span className="flex-1 text-[17px] font-black tracking-[0.02em] text-foreground">{t(mod.name)}</span>
            <ArrowCircle />
          </Link>
        ))}
      </div>
    </section>
  )
}

// ─── PERMA cards ────────────────────────────────────────────────────────────────

const PERMA_CARDS = [
  {
    en: 'POSITIVE EMOTION',
    zh: '情緒力',
    bg: '#88B8CE',
    img: permaP,
    tags: [{ t: '三件好事', c: '#a13a1e' }, { t: '感恩日記', c: '#71744F' }, { t: '正念冥想', c: '#F1C166' }],
    backTitle: 'P｜Positive Emotion 正向情緒',
    backBody:
      '理論基礎來自 Barbara Fredrickson 的擴展建構理論（Broaden-and-Build Theory）：正向情緒不只是感受的終點，更是一種心理資源，能擴展個體的思考彈性與行動範疇，長期累積成韌性、創造力與社會連結。',
  },
  {
    en: 'ENGAGEMENT',
    zh: '投入力',
    bg: '#B9B078',
    img: permaE,
    tags: [{ t: '過程目標覺察', c: '#88B8CE' }, { t: '正念冥想', c: '#F1C166' }],
    backTitle: 'E｜Engagement 投入',
    backBody:
      '對應 Mihaly Csikszentmihalyi 提出的心流（Flow）概念。當個人技能與挑戰難度達到平衡時，便容易進入全神貫注、渾然忘我的心理狀態，這也是提升專注力與生活滿足感的核心機制。',
  },
  {
    en: 'RELATIONSHIPS',
    zh: '連結力',
    bg: '#88B8CE',
    img: permaR,
    tags: [{ t: '感恩日記', c: '#71744F' }, { t: '自我慈悲', c: '#D18197' }],
    backTitle: 'R｜Relationships 正向關係',
    backBody:
      '根植於依附理論（Attachment Theory）與社會支持研究。真誠、支持性的人際連結，是心理健康最強的保護因子之一，也是逆境中緩衝壓力的重要資源。',
  },
  {
    en: 'MEANING',
    zh: '意義力',
    bg: '#B9B078',
    img: permaM,
    tags: [{ t: '感恩日記', c: '#71744F' }, { t: '過程目標覺察', c: '#88B8CE' }, { t: '自我慈悲', c: '#D18197' }],
    backTitle: 'M｜Meaning 意義',
    backBody:
      '呼應 Viktor Frankl 的意義治療（Logotherapy）：個體隸屬於並服務於超越自身的事物（信念、家庭、志業），能建立連貫的自我敘事，是對抗存在焦慮的心理基石。',
  },
  {
    en: 'ACCOMPLISHMENT',
    zh: '成就力',
    bg: '#88B8CE',
    img: permaA,
    tags: [{ t: '三件好事', c: '#a13a1e' }, { t: '過程目標覺察', c: '#88B8CE' }],
    backTitle: 'A｜Accomplishment 成就',
    backBody:
      '連結自我決定理論（Self-Determination Theory）中的「勝任感」需求。為目標本身而努力、達成並精熟任務的歷程，能提升自我效能感，是獨立於情緒與人際之外的幸福構面。',
  },
]

const PERMA_CARD_H = 166
const PERMA_GAP = 16
const PERMA_STACK_OFFSET = 14

function PermaCards() {
  const { t, language } = useLanguage()
  const [expanded, setExpanded] = useState(false)
  const [flipped, setFlipped] = useState<Set<number>>(new Set())
  const count = PERMA_CARDS.length
  const containerHeight = expanded
    ? count * PERMA_CARD_H + (count - 1) * PERMA_GAP
    : PERMA_CARD_H + (count - 1) * PERMA_STACK_OFFSET

  const collapse = () => {
    setExpanded(false)
    setFlipped(new Set())
  }

  const handleCardClick = (i: number) => {
    if (!expanded) {
      setExpanded(true)
      return
    }
    setFlipped((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div
      className="relative transition-[height] duration-500 ease-in-out"
      style={{ height: containerHeight }}
    >
      {PERMA_CARDS.map((c, i) => {
        const y = expanded ? i * (PERMA_CARD_H + PERMA_GAP) : i * PERMA_STACK_OFFSET
        const isFlipped = flipped.has(i)
        return (
          <div
            key={c.en}
            className="absolute left-0 right-0 h-[166px] transition-transform duration-500 ease-in-out"
            style={{ transform: `translateY(${y}px)`, zIndex: count - i, perspective: 1000, WebkitPerspective: 1000 }}
          >
            <div
              className="relative h-full w-full transition-transform duration-500 ease-in-out [transform-style:preserve-3d]"
              style={{
                transform: isFlipped ? 'rotateY(-180deg)' : 'rotateY(0deg)',
                WebkitTransformStyle: 'preserve-3d',
              }}
            >
              {/* front */}
              {/* -webkit-mask-image 是修 iOS WebView 已知 bug 的寫法：同一個元素同時有
                  overflow-hidden + border-radius + backface-visibility 時，Safari 有時不會正確
                  裁切／隱藏背面，套用一個等效（全白→全白）的 mask 會強迫它用對的方式合成圖層 */}
              <button
                type="button"
                onClick={() => handleCardClick(i)}
                aria-expanded={expanded}
                className="absolute inset-0 flex flex-col overflow-hidden rounded-[20px] text-left shadow-[0_4px_8px_rgba(0,0,0,0.2)] [backface-visibility:hidden]"
                style={{
                  background: c.bg,
                  WebkitBackfaceVisibility: 'hidden',
                  WebkitMaskImage: '-webkit-radial-gradient(circle, #fff 100%, #000 100%)',
                }}
              >
                <img
                  src={c.img}
                  alt=""
                  className="pointer-events-none absolute -left-3 bottom-[-16px] h-[138px] w-auto max-w-none object-contain opacity-95"
                />
                <div className="relative z-[1] w-full px-3.5 pt-4 text-center">
                  <div className="text-[20px] font-black leading-[1.1] text-foreground">{c.en}</div>
                  {language !== 'en' && (
                    <div className="mt-1 text-[13px] font-bold leading-tight text-[#6f5547]">·{t(c.zh)}·</div>
                  )}
                </div>
                <div className="relative z-[1] mt-auto flex w-full flex-col items-end gap-1 px-3.5 pb-3.5">
                  {c.tags.map((tag) => (
                    <span
                      key={tag.t}
                      className="flex max-w-full items-center gap-1 overflow-hidden rounded-full border-[1.5px] border-[#6f5547] bg-cream px-2.5 py-0.5 text-xs font-bold text-foreground"
                    >
                      <i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tag.c }} />
                      <span className="min-w-0 truncate">{t(tag.t)}</span>
                    </span>
                  ))}
                </div>
                {i === 0 && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      collapse()
                    }}
                    className={`absolute right-3.5 top-4 z-[1] flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-[#6f5547] bg-cream transition-transform duration-500 ease-in-out ${expanded ? 'rotate-180' : ''}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6f5547" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                )}
              </button>
              {/* back */}
              <button
                type="button"
                onClick={() => handleCardClick(i)}
                className="absolute inset-0 flex flex-col overflow-hidden rounded-[20px] text-left shadow-[0_4px_8px_rgba(0,0,0,0.2)] [backface-visibility:hidden] [transform:rotateY(-180deg)]"
                style={{
                  background: c.bg,
                  WebkitBackfaceVisibility: 'hidden',
                  WebkitTransform: 'rotateY(-180deg)',
                  WebkitMaskImage: '-webkit-radial-gradient(circle, #fff 100%, #000 100%)',
                }}
              >
                <div className="flex h-full w-full flex-col items-center justify-center overflow-y-auto px-4 py-3.5">
                  <p className="mb-1 text-center text-[13px] font-bold leading-tight text-[#542916]">
                    {t(c.backTitle)}
                  </p>
                  <p className="text-left text-xs leading-relaxed text-[#542916]">{t(c.backBody)}</p>
                </div>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Training Center ──────────────────────────────────────────────────────────

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日']

function getWeekDays(weekOffset: number): Date[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dow = today.getDay() // 0=Sun
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function WeekArrowIcon({ direction }: { direction: 'prev' | 'next' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === 'prev' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}

function WeekCalendar({
  weekDays,
  selectedDay,
  onSelectDay,
  onPrevWeek,
  onNextWeek,
}: {
  weekDays: Date[]
  selectedDay: Date
  onSelectDay: (d: Date) => void
  onPrevWeek: () => void
  onNextWeek: () => void
}) {
  const { t } = useLanguage()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monthName = selectedDay.toLocaleDateString('en-US', { month: 'long' })

  return (
    <>
      <p className="mb-2 text-center font-sans text-[26px] font-black tracking-[0.03em] text-foreground">{monthName}</p>
      <div className="mb-3.5 flex items-center gap-1">
        <button
          type="button"
          onClick={onPrevWeek}
          aria-label={t('上一週')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#a99a86] transition active:scale-90"
        >
          <WeekArrowIcon direction="prev" />
        </button>
        <div className="flex flex-1 gap-1.5">
          {weekDays.map((day, i) => {
            const isToday = day.getTime() === today.getTime()
            const isSelected = day.getTime() === selectedDay.getTime()
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelectDay(day)}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <div
                  className={`flex h-[38px] w-[38px] items-center justify-center rounded-full text-sm font-bold transition ${
                    isSelected
                      ? 'bg-foreground text-cream'
                      : 'border border-[#e3dccd] bg-cream text-muted-foreground'
                  }`}
                >
                  {isToday ? t('今') : t(DAY_NAMES[i])}
                </div>
                <span className="text-[11px] text-[#a99a86]">{day.getDate()}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={onNextWeek}
          aria-label={t('下一週')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#a99a86] transition active:scale-90"
        >
          <WeekArrowIcon direction="next" />
        </button>
      </div>
    </>
  )
}

type ExerciseCardProps = {
  to?: string
  search?: Record<string, string>
  img?: string
  name: string
  meta: string
  badge?: string
  tone?: 'cream' | 'gold'
  locked?: boolean
  rotateImage?: boolean
  completed?: boolean
}

function LockIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ExerciseCard({ to, search, img, name, meta, badge, tone = 'cream', locked, rotateImage, completed }: ExerciseCardProps) {
  const { t } = useLanguage()
  const isGold = tone === 'gold'
  const style = isGold ? { backgroundColor: '#FEFAF0' } : undefined
  const inner = (
    <>
      {!isGold && <span className="absolute inset-0 -z-10 bg-cream" />}
      <span className="relative shrink-0">
        {img ? (
          <img
            src={img}
            alt=""
            className="h-[72px] w-[72px] object-contain"
            style={rotateImage ? { transform: 'rotate(-90deg)' } : undefined}
          />
        ) : (
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <LockIcon />
          </span>
        )}
        {locked && img && (
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-cream bg-[#1c1714]/70 text-cream">
            <LockIcon className="h-3.5 w-3.5" />
          </span>
        )}
        {completed && !locked && (
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-cream bg-[#71744F] text-cream">
            <CheckIcon className="h-3.5 w-3.5" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <b className={`text-[17px] font-black tracking-[0.02em] ${isGold ? 'text-foreground' : 'text-foreground'}`}>{t(name)}</b>
        <span className={`mt-0.5 block text-xs font-light tracking-[0.02em] ${isGold ? 'text-foreground' : 'text-foreground'}`}>{t(meta)}</span>
      </span>
      {badge && (
        <span className="absolute right-3.5 top-3 rounded-full bg-tile-mint px-2.5 py-1 text-[11px] font-extrabold text-[#71744F]">
          {t(badge)}
        </span>
      )}
    </>
  )

  if (locked || !to) {
    return (
      <div
        className="relative flex items-center gap-3.5 overflow-hidden rounded-2xl px-4 py-3.5 opacity-60"
        style={style}
      >
        {inner}
      </div>
    )
  }

  const linkProps = search ? { to, search } : { to }
  return (
    <Link
      {...(linkProps as Parameters<typeof Link>[0])}
      onClick={() => track('module_opened', { module: name })}
      className={`relative flex items-center gap-3.5 overflow-hidden rounded-2xl px-4 py-3.5 transition active:scale-[0.98] ${isGold ? 'shadow-[0_2px_5px_rgba(0,0,0,0.08)]' : 'shadow-[0_2px_5px_rgba(0,0,0,0.08)]'}`}
      style={style}
    >
      {inner}
    </Link>
  )
}

// ─── 我的日程：每天可勾選要做的練習 ───────────────────────────────────────

type SchedulePracticeKey = 'gratitude' | 'process-goal' | 'three-good-things' | 'self-compassion' | 'mindfulness' | 'woop'

type PracticeDef = {
  key: SchedulePracticeKey
  name: string
  meta: string
  to?: '/app/gratitude' | '/app/process-goal' | '/app/self-compassion'
  img?: string
  locked: boolean
}

const PRACTICE_CATALOG: PracticeDef[] = [
  { key: 'gratitude', name: '感恩日記', meta: '初階 · 五分鐘', to: '/app/gratitude', img: exerciseGratitude, locked: false },
  { key: 'process-goal', name: '過程目標覺察', meta: '初階 · 三分鐘', to: '/app/process-goal', img: processGoalIcon, locked: false },
  { key: 'three-good-things', name: '三件好事', meta: '情緒力 · 成就力', img: threeGoodThingsIcon, locked: true },
  { key: 'self-compassion', name: '自我慈悲', meta: '連結力 · 意義力', to: '/app/self-compassion', img: selfCompassionIcon, locked: false },
  { key: 'mindfulness', name: '正念冥想', meta: '情緒力 · 投入力', img: mindfulnessIcon, locked: true },
  { key: 'woop', name: 'WOOP 目標實踐地圖', meta: '意義力 · 成就力', locked: true },
]

const PRACTICE_MAP = new Map(PRACTICE_CATALOG.map((p) => [p.key, p]))

async function fetchSchedule(userId: string, dateStr: string): Promise<SchedulePracticeKey[]> {
  const { data, error } = await supabase
    .from('daily_schedule')
    .select('practice_key')
    .eq('user_id', userId)
    .eq('schedule_date', dateStr)
  if (error) {
    console.error('[daily_schedule fetch]', error)
    return []
  }
  return (data ?? []).map((r) => r.practice_key as SchedulePracticeKey)
}

async function saveSchedule(userId: string, dateStr: string, keys: SchedulePracticeKey[]) {
  await supabase.from('daily_schedule').delete().eq('user_id', userId).eq('schedule_date', dateStr)
  if (keys.length === 0) return
  const rows = keys.map((practice_key) => ({ user_id: userId, schedule_date: dateStr, practice_key }))
  const { error } = await supabase.from('daily_schedule').insert(rows)
  if (error) console.error('[daily_schedule save]', error)
}

async function fetchCompletedKeys(
  userId: string,
  dateStr: string,
  keys: SchedulePracticeKey[],
): Promise<Set<SchedulePracticeKey>> {
  const completed = new Set<SchedulePracticeKey>()
  if (keys.includes('gratitude')) {
    const { data } = await supabase
      .from('gratitude_entries')
      .select('id')
      .eq('user_id', userId)
      .eq('practice_type', 'gratitude')
      .eq('entry_date', dateStr)
      .limit(1)
    if (data && data.length > 0) completed.add('gratitude')
  }
  if (keys.includes('process-goal')) {
    const { data } = await supabase
      .from('focus_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('log_date', dateStr)
      .limit(1)
    if (data && data.length > 0) completed.add('process-goal')
  }
  return completed
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function AddPracticeModal({
  initialSelected,
  onClose,
  onConfirm,
}: {
  initialSelected: SchedulePracticeKey[]
  onClose: () => void
  onConfirm: (keys: SchedulePracticeKey[]) => void
}) {
  const { t } = useLanguage()
  const [selected, setSelected] = useState<Set<SchedulePracticeKey>>(new Set(initialSelected))

  const toggle = (p: PracticeDef) => {
    if (p.locked) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(p.key)) next.delete(p.key)
      else next.add(p.key)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#1c1714]/40 px-4 pb-6 pt-10 sm:items-center">
      <div className="flex max-h-[88vh] w-full max-w-md animate-slide-up flex-col overflow-hidden rounded-[26px] bg-background shadow-soft">
        <div className="overflow-y-auto px-6 pt-6">
          <h2 className="text-xl font-black leading-snug tracking-[0.02em] text-foreground">{t('安排今天的練習')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('勾選你今天想做的練習')}</p>
          <div className="mt-4 flex flex-col gap-2.5 pb-2">
            {PRACTICE_CATALOG.map((p) => {
              const isChecked = selected.has(p.key)
              return (
                <button
                  key={p.key}
                  type="button"
                  disabled={p.locked}
                  onClick={() => toggle(p)}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    p.locked
                      ? 'cursor-not-allowed border-[#e3dccd] bg-cream/60 opacity-50'
                      : 'border-[#e3dccd] bg-cream active:scale-[0.98]'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                      isChecked && !p.locked ? 'border-foreground bg-foreground text-cream' : 'border-[#6f5547] text-transparent'
                    }`}
                  >
                    {p.locked ? <LockIcon className="h-3.5 w-3.5 text-muted-foreground" /> : <CheckIcon className="h-3.5 w-3.5" />}
                  </span>
                  <span className="flex-1">
                    <b className="block text-[15px] font-black text-foreground">{t(p.name)}</b>
                    <span className="block text-xs text-muted-foreground">{p.locked ? t('敬請期待') : t(p.meta)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex gap-3 border-t border-[#e3dccd] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-foreground py-3 text-sm font-bold text-foreground"
          >
            {t('取消')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(Array.from(selected))}
            className="flex-1 rounded-full bg-foreground py-3 text-sm font-bold text-cream"
          >
            {t('確定')}
          </button>
        </div>
      </div>
    </div>
  )
}

function DailySchedule({
  userId,
  recommendation,
  weekDays,
  selectedDay,
  onSelectDay,
  onPrevWeek,
  onNextWeek,
}: {
  userId: string
  recommendation: Recommendation
  weekDays: Date[]
  selectedDay: Date
  onSelectDay: (d: Date) => void
  onPrevWeek: () => void
  onNextWeek: () => void
}) {
  const { t } = useLanguage()
  const dateStr = isoLocalDate(selectedDay)
  const [scheduled, setScheduled] = useState<SchedulePracticeKey[]>([])
  const [completed, setCompleted] = useState<Set<SchedulePracticeKey>>(new Set())
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const keys = await fetchSchedule(userId, dateStr)
      const done = await fetchCompletedKeys(userId, dateStr, keys)
      if (!cancelled) {
        setScheduled(keys)
        setCompleted(done)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, dateStr])

  const handleConfirm = async (keys: SchedulePracticeKey[]) => {
    setModalOpen(false)
    setScheduled(keys)
    await saveSchedule(userId, dateStr, keys)
    const done = await fetchCompletedKeys(userId, dateStr, keys)
    setCompleted(done)
  }

  const allDone = !loading && scheduled.length > 0 && scheduled.every((key) => completed.has(key))

  return (
    <div>
      <WeekCalendar
        weekDays={weekDays}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
        onPrevWeek={onPrevWeek}
        onNextWeek={onNextWeek}
      />

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-muted-foreground">
          {allDone ? t('哇！你都做完了~~Bouba覺得你好強！！！') : t('你想為自己安排哪些練習？')}
        </p>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-label={t('安排練習')}
          className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-foreground text-foreground transition active:scale-90"
        >
          <PlusIcon />
        </button>
      </div>

      {!loading && scheduled.length === 0 && (
        <p className="rounded-2xl bg-cream px-4 py-6 text-center text-sm text-muted-foreground">
          {t('這天還沒安排練習，點右上角的 + 開始吧')}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {scheduled.map((key) => {
          const def = PRACTICE_MAP.get(key)
          if (!def) return null
          return (
            <ExerciseCard
              key={key}
              to={def.to}
              img={def.img}
              name={def.name}
              meta={def.meta}
              tone={def.key === 'gratitude' ? 'gold' : 'cream'}
              badge={recommendation.key === def.key ? '今日推薦' : undefined}
              completed={completed.has(key)}
              locked={def.locked}
            />
          )
        })}
      </div>

      {modalOpen && (
        <AddPracticeModal
          initialSelected={scheduled}
          onClose={() => setModalOpen(false)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  )
}

type TrainingTab = 'schedule' | 'perma' | 'new' | 'hot'

const TABS: { key: TrainingTab; label: string }[] = [
  { key: 'schedule', label: '我的日程' },
  { key: 'perma', label: 'PERMA' },
  { key: 'new', label: '最新上架' },
  { key: 'hot', label: '最熱門' },
]

function TrainingCenter({ recommendation, userId }: { recommendation: Recommendation; userId: string }) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<TrainingTab>('schedule')
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const weekDays = getWeekDays(weekOffset)

  const changeWeek = (delta: number) => {
    const dow = selectedDay.getDay()
    const idx = dow === 0 ? 6 : dow - 1
    const nextOffset = weekOffset + delta
    setWeekOffset(nextOffset)
    setSelectedDay(getWeekDays(nextOffset)[idx])
  }

  return (
    <section className="pb-4">
      <SectionTitle zh={t('健心訓練中心')} />

      <div className="scroll -mx-5 mb-3.5 flex gap-3.5 overflow-x-auto px-5 pb-1 no-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 rounded-full border border-foreground px-4 py-1.5 font-en text-[13px] font-semibold tracking-[0.04em] transition ${
              activeTab === tab.key ? 'bg-foreground text-cream' : 'bg-cream text-foreground'
            }`}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>

      {activeTab === 'schedule' && (
        <DailySchedule
          userId={userId}
          recommendation={recommendation}
          weekDays={weekDays}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onPrevWeek={() => changeWeek(-1)}
          onNextWeek={() => changeWeek(1)}
        />
      )}

      {activeTab === 'perma' && (
        <>
          <p className="mb-3 text-center text-sm font-bold" style={{ color: '#876B5F' }}>
            {t('想知道 PERMA是什麼嗎？點點看這些卡片吧~')}
          </p>
          <PermaCards />
        </>
      )}

      {activeTab === 'new' && (
        <div className="flex flex-col gap-3">
          <ExerciseCard
            to="/app/process-goal"
            img={processGoalIcon}
            name="過程目標覺察"
            meta="新上架 · 找回你的專注狀態"
            badge="NEW"
          />
          <ExerciseCard
            img={threeGoodThingsIcon}
            name="三件好事"
            meta="即將上架 · 情緒力 · 成就力"
            locked
          />
          <ExerciseCard
            to="/app/self-compassion"
            img={selfCompassionIcon}
            name="自我慈悲"
            meta="新上架 · 連結力 · 意義力"
            badge="NEW"
          />
          <ExerciseCard
            img={mindfulnessIcon}
            name="正念冥想"
            meta="即將上架 · 情緒力 · 投入力"
            locked
          />
          <ExerciseCard
            name="WOOP 目標實踐地圖"
            meta="即將上架 · 意義力 · 成就力"
            locked
          />
        </div>
      )}

      {activeTab === 'hot' && (
        <div className="flex flex-col gap-3">
          <ExerciseCard
            to="/app/gratitude"
            img={exerciseGratitude}
            name="感恩日記"
            meta="P 情緒力 · R 連結力 · M 意義力"
            tone="gold"
            badge="熱門"
          />
        </div>
      )}
    </section>
  )
}
