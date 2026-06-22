import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { WorkshopGate } from '../components/workshop/WorkshopGate'
import {
  WorkshopLayout,
  WorkshopTextarea,
  CompletionActions,
} from '../components/workshop/WorkshopUI'
import { supabase } from '../lib/supabase'
import { insertCommunityPost, markStreak } from '../lib/communityPost'
import { isoLocalDate } from '../lib/date'
import { getWorkshopId } from '../lib/workshop'
import { downloadNodeAsPng, isMobileDevice } from '../lib/shareImage'
import { type Privacy, DEFAULT_PRIVACY, PRIVACY_OPTIONS } from '../lib/privacy'

export const Route = createFileRoute('/app/workshop/woop')({
  component: WoopModule,
})

function WoopModule() {
  return (
    <WorkshopGate>
      <WoopFlow />
    </WorkshopGate>
  )
}

const TOTAL_STEPS = 4

// 四步驟（W／O／O／P）的設定：字母、雙語標題、副標、淺色 icon 底、主問題、輔助說明、placeholder。
type StepKey = 'wish' | 'outcome' | 'obstacle' | 'plan'

type StepMeta = {
  letter: string
  key: StepKey
  tab: string // Tab 導覽列中文小標
  titleEn: string
  titleZh: string
  subtitle: string
  iconBg: string // 淺色 icon 底（spec 指定的四種柔和色）
  accent: string // 對應深色（範例卡片強調、分頁膠囊）
  question: string
  hint: string
  placeholder: string
}

const STEPS: StepMeta[] = [
  {
    letter: 'W',
    key: 'wish',
    tab: '設定目標',
    titleEn: 'Wish',
    titleZh: '設定目標',
    subtitle: '你最想完成的一件事',
    iconBg: '#DCEBFE',
    accent: '#3F7BD6',
    question: '你最想完成的習慣／採取的行動是什麼？',
    hint: '重點是你「真心想要」或「目前最難做到」的一件事。',
    placeholder: '例如：每天早上起床不賴床',
  },
  {
    letter: 'O',
    key: 'outcome',
    tab: '看見結果',
    titleEn: 'Outcome',
    titleZh: '看見結果',
    subtitle: '想像完成後的美好畫面',
    iconBg: '#FEF3C7',
    accent: '#D9A23B',
    question: '完成後，你的成長、收穫或變化是什麼？',
    hint: '請在腦海中想像自己完成後的模樣。那是什麼感受？',
    placeholder: '例如：很有效率、有精神地出門，整個人神清氣爽，對自己充滿信心',
  },
  {
    letter: 'O',
    key: 'obstacle',
    tab: '覺察阻礙',
    titleEn: 'Obstacle',
    titleZh: '覺察阻礙',
    subtitle: '預見可能的內在障礙',
    iconBg: '#FCE2E8',
    accent: '#D26A86',
    question: '最可能阻礙你完成目標的會是什麼？',
    hint: '試著從過去的經驗中回想，哪些曾卡住你？',
    placeholder: '例如：當鬧鐘響起時，腦中出現「再睡 5 分鐘」的念頭',
  },
  {
    letter: 'P',
    key: 'plan',
    tab: '執行計畫',
    titleEn: 'Plan',
    titleZh: '執行計畫',
    subtitle: '制定你的 If-Then 應對策略',
    iconBg: '#D6F0E4',
    accent: '#2E9E8F',
    question: '當這個阻礙出現時，你會怎樣應對？',
    hint: '寫下一個具體的行動。',
    placeholder: '例如：在心中默念倒數 5-4-3-2-1，並立刻坐起身',
  },
]

// 內建範例庫：兩組，貫穿四步驟皆可參照。
type WoopExample = { name: string; wish: string; outcome: string; obstacle: string; plan: string }

const EXAMPLES: WoopExample[] = [
  {
    name: '不賴床',
    wish: '每天早上起床不賴床',
    outcome:
      '很有效率、有精神地出門，不會拖拖拉拉，整個人神清氣爽，感覺接下來的一天都在掌控之中，對自己充滿信心',
    obstacle: '當鬧鐘響起時，腦中出現「再睡 5 分鐘」的念頭',
    plan: '在心中默念倒數 5-4-3-2-1，並立刻坐起身',
  },
  {
    name: '下班健身',
    wish: '下班後直接去健身房運動，不先回家',
    outcome:
      '體力變好、精神更穩定，下班後不再只是癱在沙發上滑手機。運動完那種充實又放鬆的感覺，讓我對自己更滿意',
    obstacle: '一坐回辦公桌收東西，就想著「今天太累了，明天再去吧」',
    plan: '先把運動服換上、把包包背好，直接走向健身房，不繞回家',
  },
]

// 自動組合 If-Then 句型：如果 [阻礙]，那麼我就 [計畫]。
function assembleIfThen(obstacle: string, plan: string): string {
  const o = obstacle.trim() || '＿＿＿＿＿'
  const p = plan.trim() || '＿＿＿＿＿'
  return `如果${o}，那麼我就${p}。`
}

function WoopFlow() {
  const navigate = useNavigate()
  const router = useRouter()
  // phase：intro（開場介紹）→ 1~4（W/O/O/P）→ done（完成頁）
  const [phase, setPhase] = useState<'intro' | 1 | 2 | 3 | 4 | 'done'>('intro')
  const [wish, setWish] = useState('')
  const [outcome, setOutcome] = useState('')
  const [obstacle, setObstacle] = useState('')
  const [plan, setPlan] = useState('')

  // 範例切換：是否展開、目前看哪一組。
  const [showExample, setShowExample] = useState(false)
  const [exampleIdx, setExampleIdx] = useState(0)

  const [userId, setUserId] = useState<string | null>(null)
  const [privacy, setPrivacy] = useState<Privacy>(DEFAULT_PRIVACY)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [sharing, setSharing] = useState(false)

  const mapCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null))
  }, [])

  const values: Record<StepKey, string> = { wish, outcome, obstacle, plan }
  const setters: Record<StepKey, (v: string) => void> = {
    wish: setWish,
    outcome: setOutcome,
    obstacle: setObstacle,
    plan: setPlan,
  }

  const next = () =>
    setPhase((p) => (p === 'intro' ? 1 : p === 4 ? 'done' : ((p as number) + 1) as 2 | 3 | 4))
  const back = () =>
    setPhase((p) => (p === 1 ? 'intro' : (((p as number) - 1) as 1 | 2 | 3)))

  const restart = () => {
    setWish('')
    setOutcome('')
    setObstacle('')
    setPlan('')
    setShowExample(false)
    setExampleIdx(0)
    setPrivacy(DEFAULT_PRIVACY)
    setPublishing(false)
    setPublished(false)
    setPhase('intro')
  }

  const today = formatDate(new Date())
  const downloadLabel = isMobileDevice() ? '📲 分享 WOOP 地圖' : '⬇️ 下載 WOOP 地圖'

  const handleDownload = async () => {
    if (!mapCardRef.current || sharing) return
    setSharing(true)
    try {
      await downloadNodeAsPng(mapCardRef.current, `woop-map-${isoLocalDate(new Date())}.png`, '我的 WOOP 地圖')
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') console.error('[share image]', e)
    } finally {
      setSharing(false)
    }
  }

  const publish = async () => {
    if (!userId || publishing) return
    setPublishing(true)
    try {
      const ifThen = assembleIfThen(obstacle, plan)
      const workshopId = getWorkshopId()
      const entryId = await insertCommunityPost(
        userId,
        'workshop_woop',
        {
          item_1: wish.trim() || '我的 WOOP 目標',
          item_2: ifThen,
          item_3: '',
          ai_feedback: null,
        },
        privacy,
        {
          v: 'woop',
          wish: wish.trim(),
          outcome: outcome.trim(),
          obstacle: obstacle.trim(),
          plan: plan.trim(),
          workshop_id: workshopId,
        },
      )
      setPublished(true)
      await markStreak(userId)
      await router.invalidate()
      // 規格 [3]：發佈後導引至「當天工作坊貼文頁面」。
      navigate({
        to: '/app/community',
        search: { workshop: workshopId, ...(entryId ? { focus: entryId } : {}) },
      })
    } catch (e) {
      console.error('[woop publish]', e)
      setPublishing(false)
      alert('發佈失敗，請稍後再試一次。')
    }
  }

  // ── 開場介紹頁 ───────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return <IntroScreen onStart={() => setPhase(1)} />
  }

  // ── 完成頁 ───────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const ifThen = assembleIfThen(obstacle, plan)
    return (
      <>
        {/* 畫面外高解析下載圖 */}
        <div ref={mapCardRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0" style={{ width: 1080, height: 1440 }}>
          <WoopMapCard wish={wish} outcome={outcome} obstacle={obstacle} plan={plan} ifThen={ifThen} date={today} />
        </div>

        <WorkshopLayout step={TOTAL_STEPS} total={TOTAL_STEPS} title="WOOP 完成！🎯">
          <p className="text-sm leading-relaxed text-muted-foreground">
            你已經完成了一次完整的 WOOP 目標規劃。記住，最重要的是當阻礙出現時，你已經有了應對計畫。
          </p>

          {/* 你的 WOOP 地圖 摘要卡 */}
          <div className="mt-5 rounded-3xl bg-gradient-soft p-5 shadow-soft">
            <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-primary">你的 WOOP 地圖</p>
            <div className="flex flex-col gap-2.5">
              {STEPS.map((s) => (
                <MapRow key={s.key + s.tab} meta={s} value={values[s.key]} />
              ))}
            </div>

            {/* If-Then 計畫 */}
            <div className="mt-4 rounded-2xl bg-white/70 p-4">
              <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#2E9E8F]">
                你的 If-Then 計畫
              </p>
              <p className="text-sm font-bold leading-relaxed text-foreground">{ifThen}</p>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-[11px] font-extrabold tracking-[0.2em] text-muted-foreground">PSYbyPSY</span>
              <span className="text-[11px] text-muted-foreground">{today}</span>
            </div>
          </div>

          {/* 下載 WOOP 地圖 */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={sharing}
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full border border-border bg-white text-sm font-extrabold tracking-[0.15em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {sharing ? '正在生成圖片…' : downloadLabel}
          </button>

          {/* PSYbyPSY 洞察 */}
          <div className="mt-5 rounded-3xl bg-card p-5 shadow-soft">
            <p className="text-sm font-extrabold text-foreground">💡 PSYbyPSY 洞察</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              研究顯示，使用 WOOP 的人比僅設定目標的人，目標達成率高出許多。「心智對比」能活化大腦的目標追求系統，而「執行意圖」（If-Then）能在關鍵時刻自動觸發行動。
            </p>
          </div>

          {/* 發佈到社群 */}
          <div className="mt-5 rounded-3xl bg-card p-5 shadow-soft">
            <p className="text-sm font-extrabold text-foreground">把你的 WOOP 地圖分享到社群</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              分享你的目標與應對計畫，讓大家一起為你加油，也彼此督促前進。
            </p>
            <PrivacyPicker privacy={privacy} onChange={setPrivacy} disabled={publishing || published} />
            <button
              type="button"
              onClick={publish}
              disabled={publishing || published || !userId}
              className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-primary text-base font-extrabold tracking-[0.15em] text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
            >
              {publishing ? '發佈中…' : published ? '已發佈 ✓' : '🎯 發佈並前往社群'}
            </button>
            {!userId && (
              <p className="mt-2 text-center text-xs text-muted-foreground">尚未登入，無法發佈到社群。</p>
            )}
          </div>

          <CompletionActions onRestart={restart} />
        </WorkshopLayout>
      </>
    )
  }

  // ── 步驟 1~4：W / O / O / P ───────────────────────────────────────────────
  const idx = (phase as number) - 1
  const meta = STEPS[idx]
  const isLast = phase === 4
  const example = EXAMPLES[exampleIdx]

  return (
    <WorkshopLayout
      step={phase as number}
      total={TOTAL_STEPS}
      title={`${meta.titleEn} ${meta.titleZh}`}
      onBack={back}
      onNext={next}
      nextLabel={isLast ? '完成' : '下一步'}
      nextVariant={isLast ? 'done' : 'next'}
    >
      {/* W / O / O / P 分頁導覽列 */}
      <WoopTabs current={idx} />

      {/* 步驟標題區：色塊字母 icon + 雙語標題 + 副標 */}
      <div className="mt-5 flex items-start gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold"
          style={{ background: meta.iconBg, color: meta.accent }}
        >
          {meta.letter}
        </span>
        <div className="min-w-0">
          <p className="text-lg font-extrabold leading-tight text-foreground">
            {meta.titleEn}　{meta.titleZh}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{meta.subtitle}</p>
        </div>
      </div>

      {/* 提問卡片 */}
      <div className="mt-5 rounded-3xl bg-card p-4 shadow-soft">
        <p className="text-base font-bold leading-relaxed text-foreground">{meta.question}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{meta.hint}</p>
      </div>

      {/* 輸入框 */}
      <div className="mt-4">
        <WorkshopTextarea
          value={values[meta.key]}
          onChange={setters[meta.key]}
          placeholder={meta.placeholder}
          rows={5}
          voice
        />
      </div>

      {/* 範例切換區 */}
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setShowExample((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-bold text-primary"
        >
          <EyeIcon off={showExample} />
          {showExample ? '隱藏範例' : '查看範例'}
        </button>

        {showExample && (
          <div className="mt-3">
            {/* 範例切換 chip */}
            <div className="flex gap-2">
              {EXAMPLES.map((ex, i) => {
                const active = i === exampleIdx
                return (
                  <button
                    key={ex.name}
                    type="button"
                    onClick={() => setExampleIdx(i)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      active
                        ? 'bg-primary text-primary-foreground shadow-soft'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    範例 {i + 1}：{ex.name}
                  </button>
                )
              })}
            </div>

            {/* 範例展示卡片：完整 W/O/O/P 四欄 */}
            <div className="mt-3 rounded-3xl bg-muted/50 p-4">
              <ExampleRow letter="W" label="設定目標" accent="#3F7BD6" value={example.wish} />
              <ExampleRow letter="O" label="看見結果" accent="#D9A23B" value={example.outcome} />
              <ExampleRow letter="O" label="覺察阻礙" accent="#D26A86" value={example.obstacle} />
              <ExampleRow letter="P" label="執行計畫" accent="#2E9E8F" value={example.plan} last />
            </div>
          </div>
        )}
      </div>
    </WorkshopLayout>
  )
}

// ─── 子元件 ───────────────────────────────────────────────────────────────

// 開場介紹頁：理論說明、適用情境、四步驟預覽、開始 CTA。
function IntroScreen({ onStart }: { onStart: () => void }) {
  const scenarios = [
    { emoji: '🛏️', name: '起步困難', desc: '想運動、讀書，卻總是癱在沙發上' },
    { emoji: '📱', name: '誘惑干擾', desc: '總是被手機訊息導致分心' },
    { emoji: '😰', name: '焦慮停滯', desc: '壓力大到想逃避' },
    { emoji: '🧘', name: '建立習慣', desc: '讓冥想、閱讀或健身持久實踐' },
  ]
  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-8 pb-40 md:px-10">
      <header className="mt-2">
        <p className="text-sm font-bold tracking-wider text-primary">目標實踐地圖</p>
        <h1 className="mt-1 text-3xl font-extrabold leading-tight text-foreground">你 WOOP 了嗎？</h1>
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary">
          ⏱ 約 5 分鐘・引導書寫
        </p>
      </header>

      {/* 理論說明 */}
      <div className="mt-6 rounded-3xl bg-muted/60 p-5 text-sm leading-relaxed text-foreground/80">
        <p>
          心理學家 Gabriele Oettingen 經過 20 年研究發現，單純想像成功的喜悅，反而會讓大腦誤以為「目標已達成」，降低行動能量。
        </p>
        <p className="mt-3">
          WOOP 是一個成本極低、5 分鐘以內就能完成的高效工具。它不只讓你想像完成後的樣子，也帶你的大腦預見「可能的阻礙」，降低不確定性。
        </p>
      </div>

      {/* 適用情境 */}
      <h2 className="mt-7 text-base font-extrabold text-foreground">什麼時候適合用？</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {scenarios.map((s) => (
          <div key={s.name} className="rounded-3xl bg-card p-4 shadow-soft">
            <span className="text-2xl leading-none">{s.emoji}</span>
            <p className="mt-2 text-sm font-extrabold text-foreground">{s.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* 四步驟預覽 */}
      <h2 className="mt-7 text-base font-extrabold text-foreground">四個步驟</h2>
      <div className="mt-3 flex flex-col gap-2.5">
        {STEPS.map((s) => (
          <div key={s.key} className="flex items-center gap-3 rounded-3xl bg-card p-3.5 shadow-soft">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold"
              style={{ background: s.iconBg, color: s.accent }}
            >
              {s.letter}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-foreground">
                {s.letter}｜{s.titleEn} {s.titleZh}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 開始 WOOP */}
      <button
        type="button"
        onClick={onStart}
        className="mt-8 flex h-16 w-full items-center justify-center gap-2 rounded-full bg-gradient-primary text-base font-extrabold tracking-[0.2em] text-primary-foreground shadow-soft transition active:scale-[0.98]"
      >
        開始 WOOP
      </button>
    </div>
  )
}

// W / O / O / P 分頁導覽列：當前步驟為色底膠囊（含中文小標），其餘灰階。
function WoopTabs({ current }: { current: number }) {
  return (
    <div className="flex gap-2">
      {STEPS.map((s, i) => {
        const active = i === current
        const done = i < current
        return (
          <div
            key={s.key + i}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-center transition ${
              active ? '' : done ? 'bg-muted' : 'bg-muted/50'
            }`}
            style={active ? { background: s.iconBg } : undefined}
          >
            <span
              className="text-sm font-extrabold"
              style={{ color: active ? s.accent : undefined }}
            >
              <span className={active ? '' : done ? 'text-foreground/60' : 'text-muted-foreground/60'}>
                {s.letter}
              </span>
            </span>
            {active && (
              <span className="hidden text-[11px] font-bold sm:inline" style={{ color: s.accent }}>
                {s.tab}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// 完成頁 WOOP 地圖摘要卡的單列。
function MapRow({ meta, value }: { meta: StepMeta; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white/60 p-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold"
        style={{ background: meta.iconBg, color: meta.accent }}
      >
        {meta.letter}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold" style={{ color: meta.accent }}>
          {meta.titleEn}・{meta.tab}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
          {value.trim() || '（未填寫）'}
        </p>
      </div>
    </div>
  )
}

// 範例展示卡片的單列。
function ExampleRow({
  letter,
  label,
  accent,
  value,
  last = false,
}: {
  letter: string
  label: string
  accent: string
  value: string
  last?: boolean
}) {
  return (
    <div className={last ? '' : 'mb-3'}>
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-extrabold text-white"
          style={{ background: accent }}
        >
          {letter}
        </span>
        <span className="text-[11px] font-bold text-muted-foreground">{label}</span>
      </div>
      <p className="text-xs leading-relaxed text-foreground/80">{value}</p>
    </div>
  )
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  )
}

// 隱私三選一（與其他練習一致）。
function PrivacyPicker({
  privacy,
  onChange,
  disabled,
}: {
  privacy: Privacy
  onChange: (p: Privacy) => void
  disabled?: boolean
}) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {PRIVACY_OPTIONS.map((opt) => {
        const active = privacy === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            aria-pressed={active}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60 ${
              active ? 'border-primary bg-primary/10' : 'border-border bg-muted/40 hover:bg-muted'
            }`}
          >
            <span className="text-lg leading-none">{opt.emoji}</span>
            <span className="flex-1">
              <span className={`block text-sm font-bold ${active ? 'text-primary' : 'text-foreground'}`}>
                {opt.label}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{opt.hint}</span>
            </span>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                active ? 'border-primary' : 'border-border'
              }`}
            >
              {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function formatDate(date: Date): string {
  const days = ['日', '一', '二', '三', '四', '五', '六']
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y} / ${m} / ${d}（星期${days[date.getDay()]}）`
}

// ════════════════════════════════════════════════════════════════════════
// 下載圖卡（html-to-image 用，畫面外 1080×1440）
// ════════════════════════════════════════════════════════════════════════

const CARD_BASE: React.CSSProperties = {
  width: 1080,
  height: 1440,
  background: 'linear-gradient(155deg,#dbeafe 0%,#e6f3ec 50%,#fdf3d6 100%)',
  padding: '72px 72px 60px',
  boxSizing: 'border-box',
  fontFamily: 'PingFang TC, Microsoft JhengHei, sans-serif',
  color: '#1f2742',
  display: 'flex',
  flexDirection: 'column',
  gap: 22,
}

function CardLogo() {
  return (
    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
      <img
        src="/assets/logo-full-color.png"
        alt="PSYbyPSY"
        style={{ height: 48, objectFit: 'contain', opacity: 0.75 }}
        crossOrigin="anonymous"
      />
    </div>
  )
}

function CardWoopBlock({
  letter,
  label,
  accent,
  iconBg,
  value,
}: {
  letter: string
  label: string
  accent: string
  iconBg: string
  value: string
}) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.72)', borderRadius: 28, padding: '24px 30px', display: 'flex', gap: 22 }}>
      <span
        style={{
          width: 60,
          height: 60,
          flexShrink: 0,
          borderRadius: 18,
          background: iconBg,
          color: accent,
          fontSize: 30,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {letter}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: accent, marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 26, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{value.trim() || '—'}</div>
      </div>
    </div>
  )
}

function WoopMapCard({
  wish,
  outcome,
  obstacle,
  plan,
  ifThen,
  date,
}: {
  wish: string
  outcome: string
  obstacle: string
  plan: string
  ifThen: string
  date: string
}) {
  return (
    <div style={CARD_BASE}>
      <div>
        <div style={{ fontSize: 16, letterSpacing: 8, fontWeight: 800, opacity: 0.55 }}>PSY BY PSY · WOOP</div>
        <div style={{ fontSize: 50, fontWeight: 800, marginTop: 14, lineHeight: 1.2 }}>我的 WOOP 地圖</div>
        <div style={{ fontSize: 22, opacity: 0.65, marginTop: 8 }}>{date}</div>
      </div>
      <CardWoopBlock letter="W" label="Wish・設定目標" accent="#3F7BD6" iconBg="#DCEBFE" value={wish} />
      <CardWoopBlock letter="O" label="Outcome・看見結果" accent="#C7902F" iconBg="#FEF3C7" value={outcome} />
      <CardWoopBlock letter="O" label="Obstacle・覺察阻礙" accent="#D26A86" iconBg="#FCE2E8" value={obstacle} />
      <CardWoopBlock letter="P" label="Plan・執行計畫" accent="#2E9E8F" iconBg="#D6F0E4" value={plan} />

      {/* If-Then 計畫 */}
      <div style={{ background: 'rgba(46,158,143,0.12)', borderRadius: 28, padding: '26px 32px' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#2E9E8F', marginBottom: 10 }}>你的 If-Then 計畫</div>
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.5 }}>{ifThen}</div>
      </div>

      <CardLogo />
    </div>
  )
}
