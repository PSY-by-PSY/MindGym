import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import { useLanguage } from '../lib/i18n/context'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'
import { IntakeIcon } from '../components/intake/icons'
import { markIntakeDone } from '../lib/intakeDone'
import { markOnboardingSkipped } from '../lib/onboardingSkip'
import {
  EMPTY_INTAKE_ANSWERS,
  INTAKE_QUESTIONS,
  answersToRow,
  goalNote,
  suggestFirstPractice,
  type IntakeAnswers,
  type IntakeHero,
  type IntakeQuestion,
} from '../lib/intake'
import coachHello from '../assets/ui/gratitude-mascot.png'
import avatarHat from '../assets/ui/頭像1 Bouba脫帽禮.png'
import avatarFlowers from '../assets/ui/頭像2 Bouba種花.png'
import avatarSleepy from '../assets/ui/頭像3 Bouba打瞌睡.png'
import heroFloating from '../assets/ui/飄浮Bouba.png'
import heroStars from '../assets/ui/dancing-stars.png'
import heroJuggle from '../assets/ui/Boaba雜耍.png'
import heroWave from '../assets/ui/playing-mascot.png'
import heroNight from '../assets/ui/sleeping-mascot.png'
import heroStarHead from '../assets/ui/小工具 無字.png'
import heroCelebrate from '../assets/ui/celebrate-hearts.png'

// ── Route ───────────────────────────────────────────────────────────────────
// 入門偏好問卷：歡迎導覽之後、InMind 測驗之前，由 Boaba 教練陪你填的 11 題點選。
// 每題 Boaba 用對話泡泡把題目「說」出來，配一張插圖，選項是附圖示的卡片；
// 第 2 題選「蠻辛苦」與第 3 題選完目標後各有一頁 Boaba 插話（BetterMe 在問卷
// 中段插個人化文案的做法），答完馬上給一個「先幫你排了…」的練習。
// /app/home 的 beforeLoad 依 user_intake／hasIntakeDone() 決定要不要導來這裡；
// 直接開這個網址永遠會重新作答（方便日後「重新填寫」入口與測試）。
// 設計理由與參考對象見 docs/plans/intake_persona_survey_plan.md。
export const Route = createFileRoute('/intake')({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
  },
  component: IntakePage,
})

type Stage = 'intro' | 'quiz' | 'support' | 'note' | 'arranging' | 'done'

const SINGLE_SELECT_ADVANCE_MS = 280
const ARRANGING_MS = 1600

/** 每題的插圖：{ src, 背後柔光色塊 } */
const HERO: Record<IntakeHero, { src: string; blob: string; size?: number }> = {
  floating: { src: heroFloating, blob: '#cfe2ee', size: 150 },
  sleepy: { src: avatarSleepy, blob: '#cfe2ee', size: 120 },
  stars: { src: heroStars, blob: '#fbe7b8', size: 160 },
  juggle: { src: heroJuggle, blob: '#fbe7b8', size: 120 },
  chat: { src: coachHello, blob: '#f6d7dc', size: 140 },
  flowers: { src: avatarFlowers, blob: '#dfe9c8', size: 120 },
  wave: { src: heroWave, blob: '#f6d7dc', size: 130 },
  night: { src: heroNight, blob: '#cfe2ee', size: 170 },
  hat: { src: avatarHat, blob: '#fbe7b8', size: 120 },
  badge: { src: heroCelebrate, blob: '#fbe7b8', size: 130 },
  'star-head': { src: heroStarHead, blob: '#cfe2ee', size: 120 },
}

function IntakePage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { session } = Route.useRouteContext()

  const total = INTAKE_QUESTIONS.length
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<IntakeAnswers>(EMPTY_INTAKE_ANSWERS)
  const [stage, setStage] = useState<Stage>('intro')
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const question = INTAKE_QUESTIONS[index]
  const selected = answers[question.key]
  const isLast = index === total - 1

  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
    }
  }, [])

  const startQuiz = () => {
    track('intake_started')
    setStage('quiz')
  }

  // ── 作答 ──────────────────────────────────────────────────────────────
  const toggle = (q: IntakeQuestion, value: string) => {
    const current = answers[q.key]
    let next: string[]
    if (!q.multi) {
      next = [value]
    } else if (current.includes(value)) {
      next = current.filter((v) => v !== value)
    } else if (q.exclusive && value === q.exclusive) {
      next = [value] // 「沒特別做過」與其他互斥
    } else {
      const base = q.exclusive ? current.filter((v) => v !== q.exclusive) : current
      if (q.max && base.length >= q.max) return // 到上限就不再加
      next = [...base, value]
    }
    const latest = { ...answers, [q.key]: next }
    setAnswers(latest)

    // 單選：點了就自動往下一題，跟 BetterMe／Nüli 的手感一樣
    if (!q.multi) {
      track('intake_question_answered', { question: q.key, value })
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      advanceTimer.current = setTimeout(() => goNext(latest), SINGLE_SELECT_ADVANCE_MS)
    }
  }

  const goNext = (latest: IntakeAnswers = answers) => {
    if (question.multi) {
      track('intake_question_answered', { question: question.key, value: latest[question.key] })
    }
    // Boaba 插話：第 2 題選「蠻辛苦」→ 支持頁；第 3 題選完目標 → 小筆記頁。
    if (question.key === 'load' && latest.load[0] === 'hard') {
      setStage('support')
      return
    }
    if (question.key === 'goal') {
      setStage('note')
      return
    }
    advance(latest)
  }

  const advance = (latest: IntakeAnswers = answers) => {
    setStage('quiz')
    if (isLast) {
      finish(latest)
      return
    }
    setIndex((i) => Math.min(total - 1, i + 1))
  }

  const goBack = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (index === 0) {
      setStage('intro')
      return
    }
    setIndex((i) => Math.max(0, i - 1))
  }

  // 「先跳過」= 這一題不作答，往下一題；最後一題跳過就直接完成。
  const skipQuestion = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    const cleared: IntakeAnswers = { ...answers, [question.key]: [] }
    setAnswers(cleared)
    if (isLast) finish(cleared)
    else setIndex((i) => i + 1)
  }

  // 整份跳過（intro 頁）：留一列 skipped，之後不再問。
  const skipAll = () => {
    track('intake_skipped', { at_question: 'intro' })
    finish(EMPTY_INTAKE_ANSWERS, true)
  }

  // ── 完成：寫入 user_intake → 過場 → 完成頁 ───────────────────────────
  const finish = async (finalAnswers: IntakeAnswers, silent = false) => {
    setStage('arranging')
    const row = answersToRow(finalAnswers)
    const practice = suggestFirstPractice(finalAnswers)
    const skippedCount = INTAKE_QUESTIONS.filter((q) => finalAnswers[q.key].length === 0).length

    // 本機 flag 先記，資料表還沒建好或離線時流程也不會卡在這一頁。
    markIntakeDone()
    if (!silent) {
      if (row.skipped) track('intake_skipped', { at_question: question.key })
      else track('intake_completed', { ...row, skipped_count: skippedCount, first_practice: practice.key })
    }

    const started = Date.now()
    if (session) {
      const { error } = await supabase
        .from('user_intake')
        .upsert({ user_id: session.user.id, ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) console.warn('[intake] save failed:', error.message)
    }
    // 過場至少停 ARRANGING_MS，讓「正在為你安排」看得到（BetterMe 的 analyzing 過場）。
    const remain = ARRANGING_MS - (Date.now() - started)
    setTimeout(() => setStage('done'), Math.max(0, remain))
  }

  // ── 完成頁的兩條路 ────────────────────────────────────────────────────
  const startInMind = () => navigate({ to: '/onboarding' })
  const skipToPractice = () => {
    const practice = suggestFirstPractice(answers)
    markOnboardingSkipped()
    track('quiz_skipped', { reassess: false, from: 'intake' })
    navigate({ to: practice.to })
  }

  if (stage === 'intro') return <IntroScreen onStart={startQuiz} onSkip={skipAll} />
  if (stage === 'support') return <SupportScreen onContinue={() => advance()} />
  if (stage === 'note') return <NoteScreen goal={answers.goal[0]} onContinue={() => advance()} />
  if (stage === 'arranging') return <ArrangingScreen />
  if (stage === 'done') return <DoneScreen answers={answers} onStart={startInMind} onSkip={skipToPractice} />

  const canNext = selected.length > 0
  const hero = HERO[question.hero]

  return (
    <div className="relative mx-auto flex h-[100dvh] max-w-[430px] flex-col overflow-hidden bg-background">
      {/* 頂部：分段進度條（沿用 /welcome）+ 上一題 / 先跳過 */}
      <div className="relative z-30 px-5 pt-[calc(env(safe-area-inset-top)+0.9rem)]">
        <div className="flex items-center gap-1.5">
          {INTAKE_QUESTIONS.map((q, i) => (
            <span key={q.key} className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
              <span
                className="block h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: i <= index ? '100%' : '0%', background: 'var(--foreground)', opacity: i < index ? 0.35 : 1 }}
              />
            </span>
          ))}
        </div>
        <div className="mt-2 flex h-6 items-center justify-between">
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground/70 transition active:scale-95"
          >
            <ArrowLeft />
            {t('上一題')}
          </button>
          <span className="font-en text-[11px] font-bold tracking-[0.2em] text-muted-foreground">
            {t(question.section)} · {index + 1} / {total}
          </span>
          <div className="flex items-center gap-3">
            <LanguageSwitcherCompact />
            <button onClick={skipQuestion} className="text-xs font-semibold text-muted-foreground/70 transition active:scale-95">
              {t('先跳過')}
            </button>
          </div>
        </div>
      </div>

      {/* 題目（切題時 key 改變 → 重播進場動畫） */}
      <div key={question.key} className="flex-1 overflow-y-auto px-5 pb-4 pt-3">
        <h1 className="sr-only">{t(question.title)}</h1>

        {/* Boaba 教練：頭像 + 對話泡泡 */}
        <CoachBubble avatar={avatarHat} delay={0.05}>
          {t(question.coach)}
        </CoachBubble>
        {question.hint && (
          <p className="animate-fade-up ml-[3.6rem] mt-2 text-[12px] font-semibold text-muted-foreground" style={{ animationDelay: '0.15s' }}>
            {t(question.hint)}
          </p>
        )}

        {/* 插圖 + 背後柔光色塊 */}
        <div className="animate-fade-up relative mx-auto my-3 flex items-center justify-center" style={{ animationDelay: '0.2s', height: (hero.size ?? 130) + 10 }}>
          <div
            aria-hidden
            className="absolute rounded-full"
            style={{
              width: (hero.size ?? 130) * 1.5,
              height: (hero.size ?? 130) * 1.1,
              background: `radial-gradient(ellipse, ${hero.blob} 0%, ${hero.blob}00 70%)`,
              filter: 'blur(6px)',
            }}
          />
          <img
            src={hero.src}
            alt=""
            className="animate-float relative z-10 object-contain"
            style={{ height: hero.size ?? 130, width: 'auto', maxWidth: '100%', filter: 'drop-shadow(0 10px 18px rgba(40,24,12,0.14))', borderRadius: 24 }}
          />
        </div>

        {/* 選項卡片：兩欄、圖示在上（Nüli／BetterMe 的圖卡式選項） */}
        <div className="grid grid-cols-2 gap-3">
          {question.options.map((opt, i) => {
            const on = selected.includes(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggle(question, opt.value)}
                aria-pressed={on}
                className="animate-fade-up relative flex min-h-[96px] flex-col items-start justify-between rounded-[22px] border-2 px-4 py-3 text-left transition active:scale-[0.97]"
                style={{
                  animationDelay: `${0.25 + i * 0.05}s`,
                  borderColor: on ? '#292F56' : 'rgba(41,47,86,0.10)',
                  background: on ? '#292F56' : '#fff',
                  color: on ? '#fff' : 'var(--foreground)',
                  boxShadow: on ? '0 10px 22px -12px rgba(41,47,86,0.6)' : '0 6px 16px -12px rgba(40,24,12,0.25)',
                }}
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full font-en text-[13px] font-black"
                  style={{ background: on ? 'rgba(255,255,255,0.16)' : 'rgba(136,184,206,0.22)', color: on ? '#fff' : '#292F56' }}
                >
                  {opt.icon ? <IntakeIcon name={opt.icon} /> : opt.badge}
                </span>
                <span className="mt-2 text-[15px] font-bold leading-snug">{t(opt.label)}</span>
                {question.multi && (
                  <span
                    aria-hidden
                    className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-md border-2"
                    style={{ borderColor: on ? '#fff' : 'rgba(41,47,86,0.22)', background: on ? '#fff' : 'transparent' }}
                  >
                    {on && <Check />}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {index === 0 && (
          <p className="animate-fade-up mt-5 text-center text-[12px] leading-relaxed text-muted-foreground/80" style={{ animationDelay: '0.6s' }}>
            {t('這些答案只用來安排你的練習，不會公開。')}
          </p>
        )}
      </div>

      {/* 多選題才需要底部「下一步」；單選點了就自動往下 */}
      {question.multi && (
        <div className="relative z-30 px-6 pb-[calc(env(safe-area-inset-bottom)+1.2rem)] pt-2">
          <button
            onClick={() => goNext()}
            disabled={!canNext}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full text-[17px] font-extrabold tracking-wide text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-40"
            style={{ background: 'var(--primary)' }}
          >
            {t('下一步')}
            <ArrowRight />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Boaba 對話泡泡（頭像在左、手寫字泡泡在右） ──────────────────────────────

function CoachBubble({ avatar, children, delay = 0 }: { avatar: string; children: ReactNode; delay?: number }) {
  const { t } = useLanguage()
  return (
    <div className="animate-fade-up flex items-end gap-2.5" style={{ animationDelay: `${delay}s` }}>
      <img
        src={avatar}
        alt={t('Boaba 教練')}
        className="h-12 w-12 shrink-0 rounded-full border-2 border-white object-cover shadow-soft"
      />
      <div className="relative flex-1 rounded-3xl rounded-bl-md bg-card px-4 py-3 shadow-soft">
        <p className="font-handwriting text-[21px] leading-snug text-foreground">{children}</p>
      </div>
    </div>
  )
}

// ── 全頁式畫面共用外框（intro / 插話 / 完成） ──────────────────────────────

function FullScreen({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <div className="relative mx-auto flex h-[100dvh] max-w-[430px] flex-col bg-background">
      <div className="frame-width pointer-events-none fixed inset-x-0 top-0 z-40">
        <LanguageSwitcherCompact className="pointer-events-auto absolute right-4 top-[calc(env(safe-area-inset-top)+0.75rem)]" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-7 pt-[calc(env(safe-area-inset-top)+2.5rem)] text-center">
        {children}
      </div>
      <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+1.4rem)] pt-2">{footer}</div>
    </div>
  )
}

function PrimaryButton({ onClick, children, dark }: { onClick: () => void; children: ReactNode; dark?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="flex h-16 w-full items-center justify-center gap-2 rounded-full text-lg font-extrabold tracking-wide text-white shadow-soft transition active:scale-[0.98]"
      style={{ background: dark ? '#292F56' : 'var(--primary)' }}
    >
      {children}
      <ArrowRight />
    </button>
  )
}

function GhostButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="mt-3 flex h-12 w-full items-center justify-center text-[14px] font-bold text-muted-foreground transition active:scale-95">
      {children}
    </button>
  )
}

function HeroImage({ src, blob, height = 200 }: { src: string; blob: string; height?: number }) {
  return (
    <div className="relative flex items-center justify-center" style={{ minHeight: height + 30 }}>
      <div aria-hidden className="absolute rounded-full" style={{ width: height * 1.4, height: height * 1.2, background: `radial-gradient(circle, ${blob} 0%, ${blob}00 68%)`, filter: 'blur(6px)' }} />
      <img src={src} alt="" className="animate-float relative z-10 object-contain" style={{ height, width: 'auto', maxWidth: '100%', filter: 'drop-shadow(0 14px 22px rgba(40,24,12,0.16))', borderRadius: 28 }} />
    </div>
  )
}

// ── 開場：Boaba 自我介紹 ──────────────────────────────────────────────────

function IntroScreen({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const { t } = useLanguage()
  return (
    <FullScreen
      footer={
        <>
          <PrimaryButton onClick={onStart}>{t('好，開始吧')}</PrimaryButton>
          <GhostButton onClick={onSkip}>{t('整份跳過，直接進 App')}</GhostButton>
        </>
      }
    >
      <div className="animate-fade-up w-full">
        <div className="relative rounded-3xl bg-card px-6 py-5 text-left shadow-soft">
          <p className="font-handwriting text-2xl leading-snug text-foreground">
            {t('嗨，我是 Boaba，你的心理健身教練。')}
          </p>
          <p className="mt-2 font-handwriting text-xl leading-snug text-foreground-soft">
            {t('先讓我認識你一下，大概一分鐘，好幫你排第一個練習。')}
          </p>
          <SpeechTail />
        </div>
      </div>
      <div className="mt-6">
        <HeroImage src={coachHello} blob="#f6d7dc" height={210} />
      </div>
      <p className="animate-fade-up mt-4 text-[13px] text-muted-foreground" style={{ animationDelay: '0.3s' }}>
        {t('11 題 · 全部用點的 · 每題都可以跳過')}
      </p>
    </FullScreen>
  )
}

// ── 插話 1：選了「蠻辛苦」→ 支持與資源 ──────────────────────────────────────

function SupportScreen({ onContinue }: { onContinue: () => void }) {
  const { t } = useLanguage()
  return (
    <FullScreen footer={<PrimaryButton onClick={onContinue}>{t('我知道了，繼續')}</PrimaryButton>}>
      <CoachBubble avatar={avatarFlowers}>{t('謝謝你願意說。這陣子辛苦了。')}</CoachBubble>
      <div className="mt-5">
        <HeroImage src={avatarFlowers} blob="#dfe9c8" height={170} />
      </div>
      <p className="animate-fade-up mt-4 max-w-[20rem] text-[15px] leading-relaxed text-foreground-soft" style={{ animationDelay: '0.25s' }}>
        {t('這裡的練習是陪伴，不是治療。我會先幫你排溫柔一點的練習，一次一小步就好。')}
      </p>
      <p
        className="animate-fade-up mt-4 rounded-2xl border border-[#E26D5C]/30 bg-[#E26D5C]/10 px-4 py-3 text-[13px] leading-relaxed text-foreground"
        style={{ animationDelay: '0.35s' }}
      >
        {t('如果此刻真的很難撐，你不用一個人扛：安心專線 1925（24 小時）、生命線 1995 都在。')}
      </p>
    </FullScreen>
  )
}

// ── 插話 2：選完目標 → Boaba 的小筆記 ─────────────────────────────────────

function NoteScreen({ goal, onContinue }: { goal: string | undefined; onContinue: () => void }) {
  const { t } = useLanguage()
  return (
    <FullScreen footer={<PrimaryButton onClick={onContinue}>{t('繼續')}</PrimaryButton>}>
      <span className="animate-fade-up inline-block rounded-full bg-primary/20 px-3.5 py-1.5 text-[11px] font-black tracking-[0.18em] text-primary">
        {t('Boaba 的小筆記')}
      </span>
      <div className="mt-4">
        <HeroImage src={heroStars} blob="#fbe7b8" height={190} />
      </div>
      <p className="animate-fade-up mt-3 max-w-[21rem] font-handwriting text-[22px] leading-snug text-foreground" style={{ animationDelay: '0.25s' }}>
        {t(goalNote(goal))}
      </p>
    </FullScreen>
  )
}

// ── 過場：正在為你安排 ───────────────────────────────────────────────────────

function ArrangingScreen() {
  const { t } = useLanguage()
  return (
    <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col items-center justify-center bg-background px-6">
      <div className="relative mb-6 h-40 w-40">
        <div className="absolute inset-0 rounded-full border-2 border-dashed border-foreground/10" style={{ animation: 'spin360 12s linear infinite' }} />
        <img
          src={heroStarHead}
          alt=""
          className="absolute inset-3 h-[136px] w-[136px] rounded-full object-cover"
          style={{ animation: 'pulse 1.6s ease-in-out infinite', filter: 'drop-shadow(0 8px 16px rgba(201,148,99,.3))' }}
        />
      </div>
      <div className="font-handwriting text-2xl text-foreground">{t('Boaba 正在為你安排…')}</div>
    </div>
  )
}

// ── 完成頁：你告訴我們… → 先幫你排了… ─────────────────────────────────────────

function DoneScreen({ answers, onStart, onSkip }: { answers: IntakeAnswers; onStart: () => void; onSkip: () => void }) {
  const { t } = useLanguage()
  const practice = suggestFirstPractice(answers)

  // 摘要 chips：把使用者選過的「議題」與「目標」原樣回放，讓人感覺有被聽到。
  const chips = INTAKE_QUESTIONS.filter((q) => q.key === 'issues' || q.key === 'goal').flatMap((q) =>
    q.options.filter((o) => answers[q.key].includes(o.value)).map((o) => ({ label: t(o.label), icon: o.icon })),
  )

  return (
    <FullScreen
      footer={
        <>
          <PrimaryButton onClick={onStart} dark>{t('開始 InMind 測驗')}</PrimaryButton>
          <GhostButton onClick={onSkip}>{t('先跳過，直接練習')}</GhostButton>
        </>
      }
    >
      <HeroImage src={heroCelebrate} blob="#f6d7dc" height={150} />
      <h2 className="animate-fade-up mt-4 text-[28px] font-black leading-[1.28] text-foreground" style={{ animationDelay: '0.1s' }}>
        {t('為你安排好了')}
      </h2>

      {chips.length > 0 && (
        <div className="animate-fade-up mt-5 w-full" style={{ animationDelay: '0.2s' }}>
          <div className="text-[12px] font-bold tracking-[0.12em] text-muted-foreground">{t('你告訴我：')}</div>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {chips.map((c) => (
              <span key={c.label} className="flex items-center gap-1.5 rounded-full border border-foreground/15 bg-white px-3 py-1.5 text-[13px] font-bold text-foreground">
                {c.icon && <IntakeIcon name={c.icon} size={15} color="#292F56" />}
                {c.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="animate-fade-up mx-auto mt-6 max-w-[20rem] text-[15px] leading-relaxed text-foreground-soft" style={{ animationDelay: '0.3s' }}>
        {t('我先幫你排了「{practice}」。接下來 5 題 InMind 測驗，會讓安排更準。', { practice: t(practice.name) })}
      </p>
    </FullScreen>
  )
}

// ── Icons ───────────────────────────────────────────────────────────────────

function SpeechTail() {
  return (
    <svg className="absolute -bottom-3 left-10 h-4 w-8 text-card" viewBox="0 0 32 16" fill="currentColor" aria-hidden="true">
      <path d="M0 0c6 0 10 4 14 9 3 4 6 7 12 7H0z" />
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function ArrowLeft() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  )
}

function Check() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="#292F56" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l4 4L19 7" />
    </svg>
  )
}
