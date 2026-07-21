import { useEffect, useState, type ReactNode } from 'react'
import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import { recommendPractice, type Recommendation } from '../lib/recommend'
import { hasSkippedOnboarding } from '../lib/onboardingSkip'
import { hasSeenWelcome } from '../lib/welcomeSeen'
import { checkAndGenerateReviews } from '../lib/reviews'
import { ProModuleSection } from '../components/pro/ProModuleSection'
import { useLanguage } from '../lib/i18n/context'
import homeMascot from '../assets/ui/home-mascot.png'
import gratitudeMascot from '../assets/ui/gratitude-mascot.png'
import sleepingMascot from '../assets/ui/sleeping-mascot.png'
import featuredGratitude from '../assets/ui/featured-gratitude.png'
import exerciseGratitude from '../assets/ui/exercise-gratitude-tight.png'
import processGoalExercise from '../assets/ui/process-goal-exercise.png'
import permaP from '../assets/ui/perma-p-tight.png'
import permaE from '../assets/ui/perma-e-tight.png'
import permaR from '../assets/ui/perma-r-tight.png'
import permaM from '../assets/ui/perma-m-tight.png'
import permaA from '../assets/ui/perma-a-tight.png'

export const Route = createFileRoute('/app/home')({
  beforeLoad: async ({ context }) => {
    // 第一次登入：先看「歡迎導覽」（一頁一頁介紹 App），看過一次後就不再出現。
    if (!hasSeenWelcome()) {
      throw redirect({ to: '/welcome' })
    }

    const user = context.session!.user
    const userId = user.id
    const userName =
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
      await supabase.from('profiles').insert({ id: userId, name: userName })
    } else if (!profile.name && userName) {
      await supabase.from('profiles').update({ name: userName }).eq('id', userId)
    }

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

    return { userName, hasGratitudeToday: (todayGratitude?.length ?? 0) > 0, recommendation }
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
    meta: '情緒力 · 成就力',
    to: '/app/placeholder' as const,
    searchName: '三件好事',
    locked: true,
    featured: false,
  },
  {
    name: '自我慈悲',
    meta: '連結力 · 意義力',
    to: '/app/placeholder' as const,
    searchName: '自我慈悲',
    locked: true,
    featured: false,
  },
  {
    name: '正念冥想',
    meta: '情緒力 · 投入力',
    to: '/app/placeholder' as const,
    searchName: '正念冥想',
    locked: true,
    featured: false,
  },
]

// 工作坊專屬練習：配合線上工作坊的限定模塊，首次點擊需輸入工作坊密碼
// （密碼閘門由各模塊路由的 WorkshopGate 處理，這裡只是入口卡片）。
const workshopModules = [
  { name: '暖身卡牌', to: '/app/workshop/warmup' as const },
  { name: '找尋真實自我', to: '/app/workshop/authentic-self' as const },
  { name: '生命最後一天', to: '/app/workshop/last-day' as const },
  { name: 'WOOP 目標實踐地圖', to: '/app/workshop/woop' as const },
]

function HomePage() {
  const { userName, recommendation } = Route.useRouteContext()
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
      <SectionTitle zh={t('PSY by PSY 健心訓練模組')} en="PSY by PSY Training Modules" />
      <div className="scroll -mx-5 flex gap-3.5 overflow-x-auto px-5 pb-1.5 no-scrollbar">
        {modules.map((mod) =>
          mod.featured ? (
            <FeaturedModuleCard key={mod.name} {...mod} />
          ) : mod.locked ? (
            <LockedModuleCard key={mod.name} {...mod} />
          ) : (
            <ActiveModuleCard key={mod.name} {...mod} />
          ),
        )}
      </div>
      <p className="mt-2.5 text-center text-xs text-[#a99a86]">{t('← 左右滑動瀏覽更多模組 →')}</p>

      {/* 今日練習快速啟動橫幅—依雷達圖推薦 */}
      <TodayPracticeBanner recommendation={recommendation} />

      {/* 工作坊專屬練習 */}
      <WorkshopSection />

      {/* 專業模組區 */}
      <ProModuleSection />

      {/* 健心訓練中心 */}
      <TrainingCenter recommendation={recommendation} />
    </div>
  )
}

// ─── shared bits ──────────────────────────────────────────────────────────────

function SectionTitle({ zh, en }: { zh: string; en: string }) {
  return (
    <div className="mb-3.5 mt-7">
      <h2 className="text-[23px] font-black tracking-[0.03em] text-foreground">{zh}</h2>
      <p className="font-en text-sm font-medium tracking-[0.02em] text-muted-foreground">{en}</p>
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
      <div className="relative z-10 p-5 pb-6">
        <div className="text-[34px] font-black tracking-[0.04em] text-foreground">{t(name)}</div>
        <div className="mt-2 text-[15px] font-bold tracking-[0.04em] text-muted-foreground">{t(meta)}</div>
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
      <div className="relative z-10 p-5 pb-6">
        <div className="text-[34px] font-black tracking-[0.04em] text-foreground">{t(name)}</div>
        <div className="mt-2 text-[15px] font-bold tracking-[0.04em] text-muted-foreground">{t(meta)}</div>
      </div>
    </Link>
  )
}

function LockedModuleCard({ name }: ModuleProps) {
  const { t } = useLanguage()
  return (
    <div className="relative flex h-[336px] w-[300px] shrink-0 snap-center flex-col items-center justify-center gap-3.5 overflow-hidden rounded-[22px] bg-[#B79858] shadow-[0_5px_14px_rgba(0,0,0,0.16)]">
      <span className="rounded-[18px] border-2 border-[#FEFAF0] px-4 py-1 text-[19px] font-semibold tracking-[0.04em] text-[#FEFAF0]">
        {t(name)}
      </span>
      <span className="text-[42px] font-black tracking-[0.05em] text-[#FEFAF0]">{t('施工中…')}</span>
      <img src={sleepingMascot} alt="" className="mt-1 h-[120px] w-auto object-contain opacity-90" />
    </div>
  )
}

// ─── today practice banner ──────────────────────────────────────────────────────

function TodayPracticeBanner({ recommendation }: { recommendation: Recommendation }) {
  const { t } = useLanguage()
  const linkProps = recommendation.search
    ? { to: recommendation.to, search: recommendation.search }
    : { to: recommendation.to }

  return (
    <Link
      {...(linkProps as Parameters<typeof Link>[0])}
      onClick={() => track('today_practice_opened', { module: recommendation.name })}
      className="relative mt-6 block h-[150px]"
    >
      <div className="absolute left-2 top-1.5 z-10 max-w-[200px] rounded-[22px] border-2 border-foreground bg-cream px-4 py-3.5">
        <p className="text-base font-bold leading-[1.5] tracking-[0.02em] text-foreground">
          {t('點擊直接開始')}<br />{t('今天的{name}！', { name: t(recommendation.name) })}
        </p>
      </div>
      <img
        src={gratitudeMascot}
        alt=""
        className="pointer-events-none absolute -top-2 right-2 w-[148px]"
      />
      <span className="absolute bottom-3 right-[78px] z-20 flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-foreground bg-cream">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#542916" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </span>
    </Link>
  )
}

// ─── Workshop Section ─────────────────────────────────────────────────────────

function WorkshopSection() {
  const { t } = useLanguage()
  return (
    <section>
      <SectionTitle zh={t('工作坊專屬練習')} en="Workshop Exclusive Practice" />
      <div className="flex flex-col gap-3 rounded-[22px] bg-[#88B8CE]/55 p-4">
        {workshopModules.map((mod) => (
          <Link
            key={mod.name}
            to={mod.to}
            onClick={() => track('module_opened', { module: mod.name })}
            className="flex items-center gap-3.5 rounded-2xl bg-cream px-4 py-3.5 shadow-[0_2px_5px_rgba(0,0,0,0.08)] transition active:scale-[0.98]"
          >
            <CloudIcon />
            <span className="flex-1 text-[20px] font-bold tracking-[0.03em] text-foreground">{t(mod.name)}</span>
            <ArrowCircle />
          </Link>
        ))}
      </div>
    </section>
  )
}

// ─── PERMA cards ────────────────────────────────────────────────────────────────

const PERMA_CARDS = [
  { en: 'POSITIVE EMOTION', zh: '情緒力', bg: '#88B8CE', img: permaP, tags: [{ t: '三件好事', c: '#a13a1e' }, { t: '感恩日記', c: '#71744F' }, { t: '正念冥想', c: '#F1C166' }] },
  { en: 'ENGAGEMENT', zh: '投入力', bg: '#B9B078', img: permaE, tags: [{ t: '過程目標覺察', c: '#88B8CE' }, { t: '正念冥想', c: '#F1C166' }] },
  { en: 'RELATIONSHIPS', zh: '連結力', bg: '#88B8CE', img: permaR, tags: [{ t: '感恩日記', c: '#71744F' }, { t: '自我慈悲', c: '#D18197' }] },
  { en: 'MEANING', zh: '意義力', bg: '#B9B078', img: permaM, tags: [{ t: '感恩日記', c: '#71744F' }, { t: '過程目標覺察', c: '#88B8CE' }, { t: '自我慈悲', c: '#D18197' }] },
  { en: 'ACCOMPLISHMENT', zh: '成就力', bg: '#88B8CE', img: permaA, tags: [{ t: '三件好事', c: '#a13a1e' }, { t: '過程目標覺察', c: '#88B8CE' }] },
]

function PermaCards() {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col gap-4">
      {PERMA_CARDS.map((c) => (
        <div
          key={c.en}
          className="relative h-[166px] overflow-hidden rounded-[20px] shadow-[0_4px_8px_rgba(0,0,0,0.2)]"
          style={{ background: c.bg }}
        >
          <img
            src={c.img}
            alt=""
            className="pointer-events-none absolute -left-3 bottom-[-6px] h-[176px] w-auto max-w-none object-contain opacity-95"
          />
          <div className="absolute left-3.5 right-3.5 top-4 text-center">
            <div className="text-[23px] font-black leading-[1.1] text-foreground">{c.en}</div>
            <div className="mt-1.5 text-[15px] font-bold text-[#6f5547]">·{t(c.zh)}·</div>
          </div>
          <div className="absolute bottom-4 right-3.5 flex flex-col items-end gap-2">
            {c.tags.map((tag) => (
              <span
                key={tag.t}
                className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[#6f5547] bg-cream px-3 py-1 text-sm font-bold text-foreground"
              >
                <i className="h-2 w-2 rounded-full" style={{ background: tag.c }} />
                {t(tag.t)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Training Center ──────────────────────────────────────────────────────────

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日']

function getWeekDays(): Date[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dow = today.getDay() // 0=Sun
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function WeekCalendar({
  selectedDay,
  onSelectDay,
}: {
  selectedDay: Date
  onSelectDay: (d: Date) => void
}) {
  const { t } = useLanguage()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = getWeekDays()

  return (
    <div className="mb-3.5 flex gap-1.5">
      {days.map((day, i) => {
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
  )
}

type ExerciseCardProps = {
  to: string
  search?: Record<string, string>
  img: string
  name: string
  meta: string
  badge?: string
  tone?: 'cream' | 'gold'
  rotateImage?: boolean
}

function ExerciseCard({ to, search, img, name, meta, badge, tone = 'cream', rotateImage }: ExerciseCardProps) {
  const { t } = useLanguage()
  const linkProps = search ? { to, search } : { to }
  const isGold = tone === 'gold'
  return (
    <Link
      {...(linkProps as Parameters<typeof Link>[0])}
      onClick={() => track('module_opened', { module: name })}
      className="relative flex items-center gap-4 overflow-hidden rounded-[22px] px-5 py-4 shadow-[0_4px_10px_rgba(40,24,12,0.14)] transition active:scale-[0.98]"
      style={isGold ? { background: 'linear-gradient(135deg,#f6e4ad 0%,#eccd7e 100%)' } : undefined}
    >
      {!isGold && <span className="absolute inset-0 -z-10 bg-cream" />}
      <img
        src={img}
        alt=""
        className={`shrink-0 object-contain ${isGold ? 'h-[88px] w-[88px]' : 'h-[72px] w-[72px]'}`}
        style={rotateImage ? { transform: 'rotate(-90deg)' } : undefined}
      />
      <span className="min-w-0 flex-1">
        <b className={`text-[25px] font-black tracking-[0.03em] ${isGold ? 'text-[#5b3a12]' : 'text-foreground'}`}>{t(name)}</b>
        <span className={`mt-1 block text-[15px] font-light tracking-[0.03em] ${isGold ? 'text-[#8a6320]' : 'text-foreground'}`}>{t(meta)}</span>
      </span>
      {badge && (
        <span className="absolute right-3.5 top-3 rounded-full bg-[#d7ebd9] px-2.5 py-1 text-[11px] font-extrabold text-[#3f6b46]">
          {t(badge)}
        </span>
      )}
    </Link>
  )
}

type TrainingTab = 'schedule' | 'perma' | 'new' | 'hot'

const TABS: { key: TrainingTab; label: string }[] = [
  { key: 'schedule', label: '我的日程' },
  { key: 'perma', label: 'PERMA' },
  { key: 'new', label: '最新上架' },
  { key: 'hot', label: '最熱門' },
]

function TrainingCenter({ recommendation }: { recommendation: Recommendation }) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<TrainingTab>('schedule')
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })

  return (
    <section className="pb-4">
      <SectionTitle zh={t('健心訓練中心')} en="PSY by PSY Training Center" />

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
        <div>
          <WeekCalendar selectedDay={selectedDay} onSelectDay={setSelectedDay} />
          <div className="flex flex-col gap-3">
            <ExerciseCard
              to="/app/gratitude"
              img={exerciseGratitude}
              name="感恩日記"
              meta="初階·五分鐘"
              tone="gold"
              badge={recommendation.key === 'gratitude' ? '今日推薦' : undefined}
            />
            <ExerciseCard
              to="/app/process-goal"
              img={processGoalExercise}
              name="過程目標覺察"
              meta="初階·三分鐘"
              badge={recommendation.key === 'process-goal' ? '今日推薦' : undefined}
              rotateImage={true}
            />
          </div>
        </div>
      )}

      {activeTab === 'perma' && <PermaCards />}

      {activeTab === 'new' && (
        <div className="flex flex-col gap-2.5">
          <NewRow icon={<SearchIcon />} iconBg="#cfe2ee" name="過程目標覺察" meta="新上架 · 找回你的專注狀態" tag="NEW" to="/app/process-goal" />
          <NewRow icon={<CheckSquareIcon />} iconBg="#f3e3c4" name="三件好事" meta="即將上架 · 情緒力 · 成就力" dimmed />
        </div>
      )}

      {activeTab === 'hot' && (
        <Link
          to="/app/gratitude"
          className="flex items-center gap-3.5 rounded-[22px] bg-[#d7ebd9] px-[18px] py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition active:scale-[0.98]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/60 text-[#5b6b4a]">
            <StarIcon />
          </span>
          <span className="min-w-0 flex-1">
            <b className="text-[15px] font-black text-foreground">{t('感恩日記')}</b>
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {['P 情緒力', 'R 連結力', 'M 意義力'].map((tag) => (
                <i key={tag} className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-extrabold not-italic text-[#5b6b4a]">
                  {t(tag)}
                </i>
              ))}
            </span>
          </span>
        </Link>
      )}
    </section>
  )
}

function NewRow({
  icon,
  iconBg,
  name,
  meta,
  tag,
  to,
  dimmed,
}: {
  icon: ReactNode
  iconBg: string
  name: string
  meta: string
  tag?: string
  to?: '/app/process-goal'
  dimmed?: boolean
}) {
  const { t } = useLanguage()
  const body: ReactNode = (
    <>
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
        style={{ background: iconBg }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <b className="text-base font-extrabold text-foreground">{t(name)}</b>
          {tag && (
            <i className="rounded-full bg-[#cfe2ee] px-2 py-0.5 text-[10px] font-extrabold not-italic text-[#2f5b78]">{tag}</i>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-[#a99a86]">{t(meta)}</span>
      </span>
    </>
  )

  const cls = `flex items-center gap-3.5 rounded-[18px] border border-[#efe7d6] bg-white px-4 py-3.5 shadow-[0_2px_6px_rgba(0,0,0,0.05)] ${
    dimmed ? 'opacity-60' : 'transition active:scale-[0.98]'
  }`

  if (to && !dimmed) {
    return (
      <Link to={to} search={{ mod: undefined }} className={cls}>
        {body}
      </Link>
    )
  }
  return <div className={cls}>{body}</div>
}

function SearchIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

function CheckSquareIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8.5 12.5l2.2 2.2L16 9.5" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.5l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.7 5.9 21.1l1.4-6.8-5.1-4.7 6.9-.8z" />
    </svg>
  )
}
