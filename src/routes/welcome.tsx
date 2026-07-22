import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { track } from '../lib/analytics'
import { markWelcomeSeen } from '../lib/welcomeSeen'
import { useLanguage } from '../lib/i18n/context'
import gratitudeMascot from '../assets/ui/gratitude-mascot.png'
import exerciseGratitude from '../assets/ui/exercise-gratitude-tight.png'
import playingMascot from '../assets/ui/playing-mascot.png'
import heartsBanner from '../assets/ui/hearts-banner.png'
import permaP from '../assets/ui/perma-p-tight.png'
import permaE from '../assets/ui/perma-e-tight.png'
import permaR from '../assets/ui/perma-r-tight.png'
import permaM from '../assets/ui/perma-m-tight.png'
import permaA from '../assets/ui/perma-a-tight.png'

// ── Route ───────────────────────────────────────────────────────────────────
// 登入後、做 InMind 測驗前的「歡迎導覽」。一頁一頁介紹 App 價值，
// 用 story 式分段進度條 + 滑動手勢，讓使用者自然走完、不想跳過。
// 只在第一次登入時出現（/app/home 的 beforeLoad 依 hasSeenWelcome() 導向這裡）。
export const Route = createFileRoute('/welcome')({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
  },
  component: WelcomePage,
})

// ── Slides ──────────────────────────────────────────────────────────────────

interface Slide {
  key: string
  blob: string // 插圖背後的柔光色塊
  accent: string // 標題重點色
  eyebrow: string
  title: ReactNode
  body: string
  hero: ReactNode
}

const PERMA_ICONS = [
  { src: permaP, label: 'P', color: '#E26D5C' },
  { src: permaE, label: 'E', color: '#5C95FF' },
  { src: permaR, label: 'R', color: '#7FB77E' },
  { src: permaM, label: 'M', color: '#292F56' },
  { src: permaA, label: 'A', color: '#E0A93F' },
]

function heroImg(src: string, alt: string, size = 230) {
  return (
    <img
      src={src}
      alt={alt}
      className="animate-float relative z-10"
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        filter: 'drop-shadow(0 14px 22px rgba(40,24,12,0.16))',
      }}
    />
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

function WelcomePage() {
  const { t } = useLanguage()
  const navigate = useNavigate()

  const slides: Slide[] = [
    {
      key: 'welcome',
      blob: '#cfe2ee',
      accent: '#88B8CE',
      eyebrow: t('歡迎加入'),
      title: (
        <>
          {t('嗨，歡迎來到')}
          <br />
          <span style={{ color: '#88B8CE' }}>PSY by PSY</span>
          <br />
          {t('心理健身房')}
        </>
      ),
      body: t('就像上健身房鍛鍊身體，這裡陪你一天練一點，把心理練得更強壯、更有彈性。'),
      hero: heroImg(gratitudeMascot, t('PSY by PSY 教練')),
    },
    {
      key: 'why',
      blob: '#f3e3c4',
      accent: '#B79858',
      eyebrow: t('為什麼是這裡'),
      title: (
        <>
          {t('你照顧身體，')}
          <br />
          {t('也值得')}
          <span style={{ color: '#a13a1e' }}>{t('好好照顧心理')}</span>
        </>
      ),
      body: t('壓力、情緒、關係…心理狀態看不見，卻一直影響著你。我們把它變成看得見、也練得動的。'),
      hero: heroImg(playingMascot, t('照顧自己的心理')),
    },
    {
      key: 'perma',
      blob: '#dce9f6',
      accent: '#5C95FF',
      eyebrow: t('有科學根據'),
      title: (
        <>
          {t('用 ')}
          <span style={{ color: '#5C95FF' }}>PERMA</span>
          {t(' 五大指數')}
          <br />
          {t('看懂你的幸福狀態')}
        </>
      ),
      body: t('正向情緒、投入、關係、意義、成就 — 正向心理學的黃金框架，量出你的隱藏心理優勢。'),
      hero: (
        <div className="relative z-10 flex items-end justify-center gap-2.5">
          {PERMA_ICONS.map((p, i) => (
            <div
              key={p.label}
              className="animate-float flex flex-col items-center"
              style={{ animationDelay: `${i * 0.18}s` }}
            >
              <img
                src={p.src}
                alt={p.label}
                style={{
                  width: 52,
                  height: 52,
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 8px 12px rgba(40,24,12,0.16))',
                }}
              />
              <span
                className="mt-2 font-en text-sm font-black"
                style={{ color: p.color }}
              >
                {p.label}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'practice',
      blob: '#d7ebd9',
      accent: '#71744F',
      eyebrow: t('每天五分鐘'),
      title: (
        <>
          {t('用小小的練習')}
          <br />
          {t('累積')}
          <span style={{ color: '#71744F' }}>{t('大大的改變')}</span>
        </>
      ),
      body: t('感恩日記、過程目標覺察、三件好事…每天一個微練習，輕鬆養成好心情的習慣。'),
      hero: heroImg(exerciseGratitude, t('每日練習'), 240),
    },
    {
      key: 'together',
      blob: '#FEFAF0', // 用愛心橫幅（自帶奶油底），不需要背後色塊
      accent: '#D18197',
      eyebrow: t('你不是一個人'),
      title: (
        <>
          {t('和大家')}
          <span style={{ color: '#D18197' }}>{t('一起')}</span>
          <br />
          {t('堅持下去')}
        </>
      ),
      body: t('連續打卡累積連勝、在社群裡互相打氣，把好習慣變得更有溫度、更走得遠。'),
      hero: (
        <img
          src={heartsBanner}
          alt={t('社群夥伴互相打氣')}
          className="animate-float relative z-10"
          style={{ width: 'min(360px, 88vw)', height: 'auto', objectFit: 'contain' }}
        />
      ),
    },
    {
      key: 'cta',
      blob: '#fbe6b8',
      accent: '#E0A93F',
      eyebrow: t('最後一步'),
      title: (
        <>
          {t('先來測出')}
          <br />
          {t('你的')}
          <span style={{ color: '#E26D5C' }}>{t('幸福指數')}</span>
        </>
      ),
      body: t('花 5 分鐘完成 InMind 心理測驗，我們就能為你量身推薦最適合的練習，開始你的心理健身旅程。'),
      hero: heroImg('/assets/brain-lifter.png', t('InMind 心理測驗'), 240),
    },
  ]

  const total = slides.length
  const [index, setIndex] = useState(0)
  const [drag, setDrag] = useState(0)
  const startX = useRef<number | null>(null)
  const dragging = useRef(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const isLast = index === total - 1

  useEffect(() => {
    track('welcome_started')
  }, [])

  const finish = () => {
    markWelcomeSeen()
    track('welcome_completed', { last_slide: slides[index].key })
    navigate({ to: '/app/home' })
  }

  const skip = () => {
    markWelcomeSeen()
    track('welcome_skipped', { at_slide: slides[index].key, at_index: index })
    navigate({ to: '/app/home' })
  }

  const goTo = (i: number) => {
    if (i < 0 || i >= total) return
    setIndex(i)
  }

  const next = () => {
    if (isLast) {
      finish()
      return
    }
    goTo(index + 1)
  }

  // ── 滑動手勢 ───────────────────────────────────────────────────────────────
  const onDown = (clientX: number) => {
    startX.current = clientX
    dragging.current = true
  }
  const onMove = (clientX: number) => {
    if (!dragging.current || startX.current === null) return
    let delta = clientX - startX.current
    // 邊界加阻力：第一頁往右、最後一頁往左時滑動變「重」
    if ((index === 0 && delta > 0) || (isLast && delta < 0)) delta *= 0.35
    setDrag(delta)
  }
  const onUp = () => {
    if (!dragging.current) return
    dragging.current = false
    const width = trackRef.current?.offsetWidth ?? window.innerWidth
    const threshold = Math.min(80, width * 0.2)
    if (drag <= -threshold) goTo(index + 1)
    else if (drag >= threshold) goTo(index - 1)
    setDrag(0)
    startX.current = null
  }

  // 鍵盤左右鍵（桌機／無障礙）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goTo(index + 1)
      else if (e.key === 'ArrowLeft') goTo(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index])

  return (
    <div className="relative mx-auto flex h-[100dvh] max-w-[430px] flex-col overflow-hidden bg-background">
      {/* 頂部：story 式分段進度條 + 略過 */}
      <div className="relative z-30 px-5 pt-[calc(env(safe-area-inset-top)+0.9rem)]">
        <div className="flex items-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.key}
              aria-label={t('第 {n} 頁', { n: i + 1 })}
              onClick={() => goTo(i)}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10"
            >
              <span
                className="block h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: i < index ? '100%' : i === index ? '100%' : '0%',
                  background: i <= index ? 'var(--foreground)' : 'transparent',
                  opacity: i < index ? 0.35 : 1,
                }}
              />
            </button>
          ))}
        </div>
        <div className="mt-2 flex h-5 items-center justify-between">
          <span className="font-en text-[11px] font-bold tracking-[0.2em] text-muted-foreground">
            {index + 1} / {total}
          </span>
          {!isLast && (
            <button
              onClick={skip}
              className="text-xs font-semibold text-muted-foreground/70 transition active:scale-95"
            >
              {t('略過')}
            </button>
          )}
        </div>
      </div>

      {/* 滑動軌道 */}
      <div
        ref={trackRef}
        className="relative flex-1 touch-pan-y select-none overflow-hidden"
        onTouchStart={(e) => onDown(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={onUp}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') onDown(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') onMove(e.clientX)
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'mouse') onUp()
        }}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translateX(calc(${-index * 100}% + ${drag}px))`,
            transition: dragging.current ? 'none' : 'transform 0.45s cubic-bezier(0.32,0.72,0,1)',
          }}
        >
          {slides.map((s, i) => (
            <SlideView key={s.key} slide={s} active={i === index} />
          ))}
        </div>
      </div>

      {/* 底部 CTA */}
      <div className="relative z-30 px-6 pb-[calc(env(safe-area-inset-bottom)+1.4rem)] pt-2">
        <button
          onClick={next}
          className="flex h-16 w-full items-center justify-center gap-2 rounded-full text-lg font-extrabold tracking-wide text-primary-foreground shadow-soft transition active:scale-[0.98]"
          style={{ background: isLast ? '#292F56' : 'var(--primary)' }}
        >
          {isLast ? t('開始我的第一次測驗') : t('繼續')}
          {!isLast && <ArrowRight />}
        </button>
      </div>
    </div>
  )
}

function SlideView({ slide, active }: { slide: Slide; active: boolean }) {
  return (
    <div className="flex h-full w-full shrink-0 flex-col items-center justify-center px-8">
      {/* 插圖 + 背後柔光色塊 */}
      <div
        className="relative flex items-center justify-center transition-transform duration-500"
        style={{
          minHeight: 260,
          transform: active ? 'scale(1)' : 'scale(0.9)',
          opacity: active ? 1 : 0.5,
        }}
      >
        <div
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: 300,
            height: 300,
            background: `radial-gradient(circle, ${slide.blob} 0%, ${slide.blob}00 68%)`,
            filter: 'blur(6px)',
          }}
        />
        {slide.hero}
      </div>

      {/* 文案：切換到這頁時重播進場動畫（key 依 active 改變） */}
      <div key={active ? 'on' : 'off'} className="mt-8 w-full text-center">
        <span
          className="animate-fade-up inline-block rounded-full px-3.5 py-1.5 text-[11px] font-black tracking-[0.18em]"
          style={{
            animationDelay: '0.05s',
            color: slide.accent,
            background: `${slide.accent}22`,
          }}
        >
          {slide.eyebrow}
        </span>
        <h2
          className="animate-fade-up mt-4 text-[28px] font-black leading-[1.28] tracking-[-0.01em] text-foreground"
          style={{ animationDelay: '0.14s' }}
        >
          {slide.title}
        </h2>
        <p
          className="animate-fade-up mx-auto mt-4 max-w-[19rem] text-[15px] leading-relaxed text-foreground-soft"
          style={{ animationDelay: '0.24s' }}
        >
          {slide.body}
        </p>
      </div>
    </div>
  )
}

function ArrowRight() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
