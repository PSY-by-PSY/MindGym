import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router'
import { WorkshopTextarea } from '../components/workshop/WorkshopUI'
import { PrimaryCta } from '../components/PrimaryCta'
import { TheorySection } from '../components/TheorySection'
import { PermaGrowthCard } from '../components/PermaGrowthCard'
import { DateSwipeSheet } from '../components/DateSwipeSheet'
import woopBanner from '../assets/ui/WOOP目標實踐 封面與內頁.png'
import { supabase } from '../lib/supabase'
import { insertCommunityPost, markStreak, updateCommunityPrivacy } from '../lib/communityPost'
import { scheduleWoopReminder } from '../lib/localNotifications'
import { isoLocalDate } from '../lib/date'
import { downloadNodeAsPng, isMobileDevice } from '../lib/shareImage'
import { type Privacy, DEFAULT_PRIVACY, PRIVACY_OPTIONS } from '../lib/privacy'
import { useLanguage } from '../lib/i18n/context'
import type { Language } from '../lib/i18n/language'
import { useFoundingInviteGate } from '../lib/useFoundingInvite'
import { FoundingInviteModal } from '../components/paywall/FoundingInviteModal'
import { useAutoDismissKeyboard } from '../lib/keyboard'

export const Route = createFileRoute('/app/woop')({
  component: WoopFlow,
})

// ─── Bouba 教練回饋（完成頁）─────────────────────────────────────────────
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'
const COACH_TIMEOUT_MS = 20000

type CoachAlternative = { type: string; label: string; suggestion: string }
type CoachResult = { affirmation: string; plan_type: string; alternatives: CoachAlternative[] }

async function fetchWoopCoach(input: {
  wish: string
  outcome: string
  obstacle: string
  plan: string
}): Promise<CoachResult | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), COACH_TIMEOUT_MS)
    try {
      const resp = await fetch(`${API_URL}/api/woop/coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      })
      if (!resp.ok) return null
      return (await resp.json()) as CoachResult
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    console.error('[woop coach]', e)
    return null
  }
}

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

// STEPS／EXAMPLES 含大量畫面文字，且是在元件渲染前就需要的資料表，因此改為
// 「接受 t 當參數的函式」而非模組層級常數，避免在一般函式裡呼叫 useLanguage()。
type TFn = (text: string, vars?: Record<string, string | number>) => string

function getSteps(t: TFn): StepMeta[] {
  return [
    {
      letter: 'W',
      key: 'wish',
      tab: t('設定目標'),
      titleEn: 'Wish',
      titleZh: t('設定目標'),
      subtitle: t('你近期最想完成的一件事'),
      iconBg: '#DCEBFE',
      accent: '#3F7BD6',
      question: t('你最想完成的習慣／採取的行動是什麼？'),
      hint: t('這個目標可以是一天中很小的目標，重點是你「發自內心希望自己完成的重要事項」或「目前較難做到」的一件事。'),
      placeholder: t('例如：每天早上起床不賴床'),
    },
    {
      letter: 'O',
      key: 'outcome',
      tab: t('看見結果'),
      titleEn: 'Outcome',
      titleZh: t('看見結果'),
      subtitle: t('想像完成後的具體樣貌'),
      iconBg: '#FEF3C7',
      accent: '#D9A23B',
      question: t('完成後，你的成長、收穫或變化是什麼？'),
      hint: t('請在腦海中想像自己完成後的模樣。那是什麼感受？你會變成怎樣或得到什麼？那是一個怎樣的狀態？你怎樣看待這樣的自己？'),
      placeholder: t('例如：很有效率、有精神地出門，整個人神清氣爽，對自己充滿信心'),
    },
    {
      letter: 'O',
      key: 'obstacle',
      tab: t('覺察阻礙'),
      titleEn: 'Obstacle',
      titleZh: t('覺察阻礙'),
      subtitle: t('思考可能的阻礙或困難'),
      iconBg: '#FCE2E8',
      accent: '#D26A86',
      question: t('最可能阻礙你完成目標的會是什麼？'),
      hint: t('試著從過去的經驗中回想，哪些曾卡住你？'),
      placeholder: t('例如：當鬧鐘響起時，腦中出現「再睡 5 分鐘」的念頭'),
    },
    {
      letter: 'P',
      key: 'plan',
      tab: t('執行計畫'),
      titleEn: 'Plan',
      titleZh: t('執行計畫'),
      subtitle: t('制定你的 If-Then 因應策略'),
      iconBg: '#D6F0E4',
      accent: '#2E9E8F',
      question: t('當這個阻礙出現時，你會怎樣應對？'),
      hint: t('寫下一個具體的行動。'),
      placeholder: t('例如：在心中默念倒數 5-4-3-2-1，並立刻坐起身'),
    },
  ]
}

// 內建範例庫：兩組，貫穿四步驟皆可參照。
type WoopExample = { name: string; wish: string; outcome: string; obstacle: string; plan: string }

function getExamples(t: TFn): WoopExample[] {
  return [
    {
      name: t('不賴床'),
      wish: t('每天早上起床不賴床'),
      outcome: t(
        '很有效率、有精神地出門，不會拖拖拉拉，整個人神清氣爽，感覺接下來的一天都在掌控之中，對自己充滿信心',
      ),
      obstacle: t('當鬧鐘響起時，腦中出現「再睡 5 分鐘」的念頭'),
      plan: t('在心中默念倒數 5-4-3-2-1，並立刻坐起身'),
    },
    {
      name: t('下班健身'),
      wish: t('下班後直接去健身房運動，不先回家'),
      outcome: t(
        '體力變好、精神更穩定，下班後不再只是癱在沙發上滑手機。運動完那種充實又放鬆的感覺，讓我對自己更滿意',
      ),
      obstacle: t('一坐回辦公桌收東西，就想著「今天太累了，明天再去吧」'),
      plan: t('先把運動服換上、把包包背好，直接走向健身房，不繞回家'),
    },
  ]
}

// PERMA 幸福力加分（投入力 +4／意義力 +3／成就力 +5）。
function getPermaBoosts(t: TFn) {
  return [
    {
      key: 'E',
      label: t('投入力'),
      delta: 4,
      bar: 'bg-tile-mint',
      description: t('把目標想成看得見的畫面，讓你更容易真正投入其中。'),
    },
    {
      key: 'M',
      label: t('意義力'),
      delta: 3,
      bar: 'bg-tile-peach',
      description: t('想清楚今天為什麼而努力，讓每一天多一份方向感。'),
    },
    {
      key: 'A',
      label: t('成就力'),
      delta: 5,
      bar: 'bg-tile-blue',
      description: t('If-Then 計畫讓行動在關鍵時刻自動啟動，大幅提高完成率。'),
    },
  ] as const
}

// 這次 WOOP 是為哪一天設定的目標。以日期本身（而非 today/tomorrow 字串）為準，
// 存進 payload 的 target_date；首頁的 If-Then 提醒卡與推播都靠它決定何時出現。
const EVENING_HOUR = 20

/** 把時間歸零，只留日期，方便比對「是不是同一天」。 */
function atMidnight(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function addDays(d: Date, n: number): Date {
  const c = atMidnight(d)
  c.setDate(c.getDate() + n)
  return c
}

// 預設值依當下時間判斷：晚上 8 點後多半是在為明天做準備（呼應進入頁「睡前先想
// 清楚明天希望完成的一件事」），其餘時間預設今天。使用者仍可自行切換。
function defaultTargetDate(now: Date = new Date()): Date {
  return now.getHours() >= EVENING_HOUR ? addDays(now, 1) : atMidnight(now)
}

/** 膠囊與標籤用的短日期：8/2（日）／8/2 (Sun)。 */
function formatShortDate(date: Date, language: Language): string {
  const base = `${date.getMonth() + 1}/${date.getDate()}`
  const days = language === 'en'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['日', '一', '二', '三', '四', '五', '六']
  return language === 'en' ? `${base} (${days[date.getDay()]})` : `${base}（${days[date.getDay()]}）`
}

// 自動組合 If-Then 句型：如果 [阻礙]，那麼我就 [計畫]。
// 匯出給首頁 If-Then 提醒卡（WoopReminderCard）共用，句型只維護一份。
export function assembleIfThen(t: TFn, obstacle: string, plan: string): string {
  const o = obstacle.trim() || '＿＿＿＿＿'
  const p = plan.trim() || '＿＿＿＿＿'
  return t('如果{o}，那麼我就{p}。', { o, p })
}

function WoopFlow() {
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const router = useRouter()
  const foundingInvite = useFoundingInviteGate()
  // phase：intro（開場介紹）→ 1~4（W/O/O/P）→ done（完成頁）
  const [phase, setPhase] = useState<'intro' | 1 | 2 | 3 | 4 | 'done'>('intro')
  // 離開需要打字的階段就收鍵盤（輸入框被卸載時 iOS 不會自己收）。
  useAutoDismissKeyboard(phase !== 'intro' && phase !== 'done')
  const [wish, setWish] = useState('')
  const [outcome, setOutcome] = useState('')
  const [obstacle, setObstacle] = useState('')
  const [plan, setPlan] = useState('')
  const [targetDate, setTargetDate] = useState<Date>(() => defaultTargetDate())
  const [showDateSheet, setShowDateSheet] = useState(false)

  // 範例切換：是否展開、目前看哪一組。
  const [showExample, setShowExample] = useState(false)
  const [exampleIdx, setExampleIdx] = useState(0)

  const [userId, setUserId] = useState<string | null>(null)
  // 完成頁機制與感恩日記／自我慈悲一致：一到完成頁就用預設隱私自動存檔，
  // 「把你的 WOOP 地圖分享出去」的選項改成即時更新已存檔的那筆貼文，
  // 不再有獨立的「發佈」按鈕。
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false) // P 步驟按「完成」時，存檔中的 loading
  const [finishing, setFinishing] = useState(false) // 「結束今天練習」按下後的 loading
  const [sharing, setSharing] = useState(false)
  const [privacy, setPrivacy] = useState<Privacy>(DEFAULT_PRIVACY)

  // Bouba 教練回饋：完成頁自動叫一次（affirmation 直接顯示；alternatives 先拿到手，
  // 但藏在「更多備案」按鈕後面，不要一次塞太多）。使用者選擇加入的備案存在這裡，
  // 發佈時一併寫進 payload.backup_plans。
  const [coach, setCoach] = useState<CoachResult | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [showAlternatives, setShowAlternatives] = useState(false)
  const [backupPlans, setBackupPlans] = useState<string[]>([])

  const mapCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null))
  }, [])

  // 一到完成頁就叫一次 Bouba（只叫一次：coach/coachLoading 當鎖）。失敗就靜默不顯示
  // 那張卡，不影響完成頁其他部分——這不是關鍵路徑，只是錦上添花。
  useEffect(() => {
    if (phase !== 'done' || coach || coachLoading) return
    setCoachLoading(true)
    fetchWoopCoach({ wish, outcome, obstacle, plan })
      .then((result) => setCoach(result))
      .finally(() => setCoachLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // 貼文在完成頁一出現就已存檔，這時 Bouba 的口袋方案通常還沒回來；使用者
  // 事後才加入的備案，即時補寫回同一筆貼文的 payload.backup_plans。
  useEffect(() => {
    if (!savedEntryId) return
    void supabase
      .from('gratitude_entries')
      .update({
        payload: {
          v: 'woop',
          wish: wish.trim(),
          outcome: outcome.trim(),
          obstacle: obstacle.trim(),
          plan: plan.trim(),
          target_date: targetIso,
          ...(backupPlans.length > 0 ? { backup_plans: backupPlans } : {}),
        },
      })
      .eq('id', savedEntryId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backupPlans, savedEntryId])

  const values: Record<StepKey, string> = { wish, outcome, obstacle, plan }
  const setters: Record<StepKey, (v: string) => void> = {
    wish: setWish,
    outcome: setOutcome,
    obstacle: setObstacle,
    plan: setPlan,
  }

  // 目標日期相對於今天是哪一天，決定題目與標籤的措辭。
  const targetIso = isoLocalDate(targetDate)
  const isToday = targetIso === isoLocalDate(new Date())
  const isTomorrow = targetIso === isoLocalDate(addDays(new Date(), 1))
  // 完成頁地圖右上角的標籤：今天／明天以外就直接顯示日期。
  const targetLabel = isToday
    ? t('今天的目標')
    : isTomorrow
      ? t('明天的目標')
      : t('{date}的目標', { date: formatShortDate(targetDate, language) })

  const next = async () => {
    if (phase === 4) {
      // 完成第四步時就存檔（跟感恩日記一致：完成頁出現前就先寫進 DB，之後
      // 「分享出去」的隱私選項只是即時更新這筆已存在的貼文）。
      if (completing) return
      setCompleting(true)
      await performSave()
      setCompleting(false)
      setPhase('done')
      return
    }
    setPhase((p) => (p === 'intro' ? 1 : ((p as number) + 1) as 2 | 3 | 4))
  }
  const back = () =>
    setPhase((p) => (p === 1 ? 'intro' : (((p as number) - 1) as 1 | 2 | 3)))

  const today = formatDate(new Date(), language)
  const downloadLabel = isMobileDevice() ? t('分享 WOOP 地圖') : t('下載 WOOP 地圖')

  const handleDownload = async () => {
    if (!mapCardRef.current || sharing) return
    setSharing(true)
    try {
      await downloadNodeAsPng(mapCardRef.current, `woop-map-${isoLocalDate(new Date())}.png`, t('我的 WOOP 地圖'))
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') console.error('[share image]', e)
    } finally {
      setSharing(false)
    }
  }

  // 完成第四步時呼叫一次：用當下的隱私設定（預設值）把貼文寫進 DB，並核發
  // 成就力經驗值、更新連續天數、排程隔天提醒。之後使用者切換隱私選項或加入
  // Bouba 的備案，都是對這筆已存在的貼文做即時更新，不再重新建立一筆。
  const performSave = async (): Promise<string | null> => {
    if (!userId) return null
    try {
      const ifThen = assembleIfThen(t, obstacle, plan)
      const entryId = await insertCommunityPost(
        userId,
        'woop',
        {
          item_1: wish.trim() || t('我的 WOOP 目標'),
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
          target_date: targetIso,
        },
      )
      if (!entryId) return null
      setSavedEntryId(entryId)
      void markStreak(userId)
      // 幸福經驗值累加（與自我慈悲同一支 RPC）；migration 未跑時吞掉錯誤，不影響存檔。
      const boosts = getPermaBoosts(t)
      const deltaOf = (key: string) => boosts.find((b) => b.key === key)?.delta ?? 0
      const { error: xpError } = await supabase.rpc('increment_perma_xp', {
        p_user_id: userId,
        p_delta_p: deltaOf('P'),
        p_delta_e: deltaOf('E'),
        p_delta_r: deltaOf('R'),
        p_delta_m: deltaOf('M'),
        p_delta_a: deltaOf('A'),
      })
      if (xpError) console.warn('[woop save] increment_perma_xp 尚未建立，本次未累加經驗值', xpError)
      // 原生 App 才會真的排程（isNativeApp() 把關，純網頁靜默不做事）；早上 8:00
      // 響一次，內容就是這句 If-Then 原文，不多不少。
      void scheduleWoopReminder(entryId, ifThen, targetIso)
      return entryId
    } catch (e) {
      console.error('[woop save]', e)
      return null
    }
  }

  // 完成頁切換隱私：即時更新已存檔的那筆貼文（跟感恩日記／過程目標覺察一致）。
  const handlePrivacyChange = (next: Privacy) => {
    setPrivacy(next)
    if (savedEntryId && userId) void updateCommunityPrivacy(savedEntryId, userId, next)
  }

  // 「結束今天練習」：貼文已經存在，這裡只是離開到社群動態牆。
  const handleFinish = async () => {
    if (finishing) return
    setFinishing(true)
    await router.invalidate()
    foundingInvite.gate(() => navigate({
      to: '/app/community',
      search: savedEntryId ? { focus: savedEntryId } : { showEntry: 1 },
    }))
  }

  // ── 開場介紹頁 ───────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return <IntroScreen onStart={() => setPhase(1)} />
  }

  // ── 完成頁 ───────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const ifThen = assembleIfThen(t, obstacle, plan)
    const steps = getSteps(t)
    return (
      <>
        {/* 畫面外高解析下載圖 */}
        <div ref={mapCardRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0" style={{ width: 1080, height: 1440 }}>
          <WoopMapCard wish={wish} outcome={outcome} obstacle={obstacle} plan={plan} ifThen={ifThen} date={today} />
        </div>

        <div className="animate-fade-up mx-auto max-w-3xl px-5 pt-4 pb-8">
          <Link
            to="/app/home"
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#542916] bg-[#FEFAF0] text-[#542916] shadow-soft transition active:scale-90"
            aria-label={t('返回訓練中心')}
          >
            <BackIcon />
          </Link>

          {/* 恭喜＋PERMA 加分（與自我慈悲／感恩日記的完成頁一致） */}
          <div className="mt-4 flex flex-col items-center text-center">
            <div className="celebrate-pop mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-primary shadow-soft">
              <CelebrateCheckIcon />
            </div>
            <h1 className="mb-2 text-2xl font-extrabold text-foreground">{t('WOOP 完成！')}</h1>
            <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
              {t('你已經完成了一次完整的 WOOP 目標規劃。記住，最重要的是當阻礙出現時，你已經有了應對計畫。')}
            </p>
            <PermaGrowthCard title={t('練習後 PERMA 加分')} items={getPermaBoosts(t)} />
          </div>

          {/* Bouba 的回饋：優勢視角 affirmation 直接顯示；口袋方案（其他類型的 then）
              藏在「查看更多」按鈕後面，不強迫使用者一次看完，也保護他自己寫的計畫
              永遠是主位——備案是加選，不是取代。畫面上完全不出現「AI 分析」字樣。 */}
          {coachLoading && !coach && (
            <div className="mt-5 flex items-center gap-3 rounded-3xl bg-card p-5 shadow-soft">
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
              <p className="text-sm text-muted-foreground">{t('Bouba 想跟你說…')}</p>
            </div>
          )}
          {coach?.affirmation && (
            <div className="mt-5 rounded-3xl bg-card p-5 shadow-soft">
              <p className="mb-2.5 text-sm font-extrabold text-primary">{t('Bouba 想跟你說')}</p>
              <div className="flex flex-col gap-3">
                {coach.affirmation
                  .split('\n\n')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((para, i) => (
                    <p key={i} className="text-sm leading-relaxed text-foreground/85">
                      {para}
                    </p>
                  ))}
              </div>

              {coach.alternatives.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAlternatives((v) => !v)}
                    aria-expanded={showAlternatives}
                    className="mt-4 flex h-11 w-full items-center justify-center gap-1.5 rounded-full border-2 border-primary/25 bg-primary/5 text-sm font-extrabold tracking-[0.08em] text-primary transition active:scale-[0.98]"
                  >
                    {showAlternatives ? t('收合口袋方案') : t('Bouba 的口袋方案')}
                    <ChevronIcon rotated={showAlternatives} />
                  </button>

                  {showAlternatives && (
                    <div className="mt-3 flex flex-col gap-2.5">
                      {coach.alternatives.map((alt) => {
                        const added = backupPlans.includes(alt.suggestion)
                        return (
                          <div key={alt.type} className="rounded-2xl bg-muted/50 p-3.5">
                            <span className="inline-block rounded-full bg-tile-mint px-2.5 py-1 text-[11px] font-extrabold tracking-[0.05em] text-foreground/70">
                              {alt.label}
                            </span>
                            <p className="mt-2 text-sm leading-relaxed text-foreground/85">{alt.suggestion}</p>
                            <button
                              type="button"
                              onClick={() =>
                                setBackupPlans((cur) =>
                                  added ? cur.filter((p) => p !== alt.suggestion) : [...cur, alt.suggestion],
                                )
                              }
                              aria-pressed={added}
                              className={`mt-2.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
                                added ? 'bg-primary text-primary-foreground' : 'bg-card text-primary shadow-soft'
                              }`}
                            >
                              {added ? t('已加入備案') : t('加入我的備案')}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 你的 WOOP 地圖 摘要卡 */}
          <div className="mt-5 rounded-3xl bg-gradient-soft p-5 shadow-soft">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-primary">{t('你的 WOOP 地圖')}</p>
              <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-extrabold text-foreground/70">
                {targetLabel}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {steps.map((s) => (
                <MapRow key={s.key + s.tab} meta={s} value={values[s.key]} />
              ))}
            </div>

            {/* If-Then 計畫 */}
            <div className="mt-4 rounded-2xl bg-white/70 p-4">
              <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#2E9E8F]">
                {t('你的 If-Then 計畫')}
              </p>
              <p className="text-sm font-bold leading-relaxed text-foreground">{ifThen}</p>
            </div>

            {/* 備案（從 Bouba 的口袋方案加入的）：只是加選，主計畫永遠在上面。 */}
            {backupPlans.length > 0 && (
              <div className="mt-3 rounded-2xl bg-white/70 p-4">
                <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-foreground/50">
                  {t('備案')}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {backupPlans.map((p, i) => (
                    <li key={i} className="text-xs leading-relaxed text-foreground/70">
                      ・{p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
            {sharing ? t('正在生成圖片…') : downloadLabel}
          </button>

          {/* PSYbyPSY 洞察 */}
          <div className="mt-5 rounded-3xl bg-card p-5 shadow-soft">
            <p className="text-sm font-extrabold text-foreground">PSYbyPSY {t('洞察')}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t('研究顯示，使用 WOOP 的人比僅設定目標的人，目標達成率高出許多。「心智對比」能活化大腦的目標追求系統，而「執行意圖」（If-Then）能在關鍵時刻自動觸發行動。')}
            </p>
          </div>

          {/* 分享到社群動態＋隱私設定（與感恩日記／自我慈悲一致，不再強制分享） */}
          <div className="mt-5 rounded-3xl bg-card p-5 shadow-soft">
            <p className="text-sm font-extrabold text-foreground">{t('把你的 WOOP 地圖分享出去')}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t('分享你的目標與應對計畫，讓夥伴一起為你加油，也彼此督促前進。')}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {PRIVACY_OPTIONS.map((opt) => {
                const active = privacy === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handlePrivacyChange(opt.value)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                      active ? 'border-primary bg-primary/10' : 'border-border bg-muted/40 hover:bg-muted'
                    }`}
                  >
                    <span className="flex-1">
                      <span className={`block text-sm font-bold ${active ? 'text-primary' : 'text-foreground'}`}>
                        {t(opt.label)}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {t(opt.hint)}
                      </span>
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
          </div>

          {/* 結束今天練習（跟感恩日記／自我慈悲／過程目標覺察一致：貼文已經存好了，
              這裡只是離開去社群動態牆） */}
          <div className="mt-5 flex w-full flex-col gap-3">
            <button
              type="button"
              onClick={handleFinish}
              disabled={finishing}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-primary text-sm font-extrabold tracking-[0.15em] text-white shadow-soft transition active:scale-[0.98] disabled:opacity-60"
            >
              {t('結束今天練習')}
            </button>
          </div>
        </div>
        <FoundingInviteModal open={foundingInvite.open} onDismiss={foundingInvite.dismiss} />
      </>
    )
  }

  // ── 步驟 1~4：W / O / O / P ───────────────────────────────────────────────
  const idx = (phase as number) - 1
  const steps = getSteps(t)
  const meta = steps[idx]
  const isLast = phase === 4
  const examples = getExamples(t)
  const example = examples[exampleIdx]
  const isWish = meta.key === 'wish'
  // W 這題的提問跟著目標日期走，讓選擇不只是一個表單欄位，而是題目的一部分。
  const question = isWish
    ? isToday
      ? t('你今天最想完成的習慣／採取的行動是什麼？')
      : isTomorrow
        ? t('你明天最想完成的習慣／採取的行動是什麼？')
        : meta.question
    : meta.question

  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-5 pt-4 pb-8">
      {/* 返回鈕（跟感恩日記／自我慈悲一致：咖啡色描邊圓圈，回上一步；第一步時回開場介紹） */}
      <button
        type="button"
        onClick={back}
        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#542916] bg-[#FEFAF0] text-[#542916] shadow-soft transition active:scale-90"
        aria-label={t('返回')}
      >
        <BackIcon />
      </button>

      {/* W / O / O / P 分頁導覽列 */}
      <div className="mt-5">
        <WoopTabs current={idx} />
      </div>

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
            {meta.titleEn}{'　'}{meta.titleZh}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{meta.subtitle}</p>
        </div>
      </div>

      {/* 目標日期（只在 W 出現）：今天／明天兩顆快捷膠囊帶出實際日期，其他日子走
          「修改日期」的 bottom sheet。這個日期決定首頁提醒卡與推播何時出現。 */}
      {isWish && (
        <div className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t('我想設定的是')}</span>
            <button
              type="button"
              onClick={() => setShowDateSheet(true)}
              className="rounded-full bg-card px-3 py-1 text-xs font-bold text-primary shadow-soft transition active:scale-95"
            >
              {t('修改日期')}
            </button>
          </div>
          <div className="mt-2 flex gap-1 rounded-2xl bg-muted/60 p-1">
            {[
              { label: t('今天'), date: atMidnight(new Date()), active: isToday },
              { label: t('明天'), date: addDays(new Date(), 1), active: isTomorrow },
            ].map(({ label, date, active }) => (
              <button
                key={label}
                type="button"
                onClick={() => setTargetDate(date)}
                aria-pressed={active}
                className={`flex-1 rounded-xl py-2 transition ${
                  active ? 'bg-card shadow-soft' : ''
                }`}
              >
                <span className={`block text-sm font-extrabold ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                  {label}
                </span>
                <span className={`mt-0.5 block text-[11px] ${active ? 'text-primary/70' : 'text-muted-foreground/70'}`}>
                  {formatShortDate(date, language)}
                </span>
              </button>
            ))}
          </div>
          {!isToday && !isTomorrow && (
            <p className="mt-2 text-center text-xs font-bold text-primary">
              {t('目標日期：{date}', { date: formatShortDate(targetDate, language) })}
            </p>
          )}
        </div>
      )}

      {/* 提問卡片 */}
      <div className="mt-5 rounded-3xl bg-card p-4 shadow-soft">
        <p className="text-base font-bold leading-relaxed text-foreground">{question}</p>
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
          {showExample ? t('隱藏範例') : t('查看範例')}
        </button>

        {showExample && (
          <div className="mt-3">
            {/* 範例切換 chip */}
            <div className="flex gap-2">
              {examples.map((ex, i) => {
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
                    {t('範例 {n}：{name}', { n: i + 1, name: ex.name })}
                  </button>
                )
              })}
            </div>

            {/* 範例展示卡片：完整 W/O/O/P 四欄 */}
            <div className="mt-3 rounded-3xl bg-muted/50 p-4">
              <ExampleRow letter="W" label={t('設定目標')} accent="#3F7BD6" value={example.wish} />
              <ExampleRow letter="O" label={t('看見結果')} accent="#D9A23B" value={example.outcome} />
              <ExampleRow letter="O" label={t('覺察阻礙')} accent="#D26A86" value={example.obstacle} />
              <ExampleRow letter="P" label={t('執行計畫')} accent="#2E9E8F" value={example.plan} last />
            </div>
          </div>
        )}
      </div>

      {/* 上一步／下一步／完成：O／O／P 三步（idx > 0）左右並排多一顆「上一步」，
          讓使用者不用回去點左上角小圖示，也能直接改前面的答案。 */}
      <div className="mt-8 flex gap-3">
        {idx > 0 && (
          <button
            type="button"
            onClick={back}
            disabled={completing}
            className="flex h-16 flex-1 items-center justify-center rounded-full border-2 border-[#542916]/25 text-sm font-extrabold tracking-[0.1em] text-[#542916]/70 transition active:scale-[0.98] disabled:opacity-60"
          >
            {t('上一步')}
          </button>
        )}
        <div className={idx > 0 ? 'flex-[2]' : 'flex-1'}>
          <PrimaryCta onClick={() => void next()} disabled={completing} variant={isLast ? 'done' : 'next'}>
            {isLast ? (completing ? t('儲存中…') : t('完成')) : t('下一步')}
          </PrimaryCta>
        </div>
      </div>

      {/* 修改日期 bottom sheet（版型同感恩日記）：今天起算的一週，讓「這週四要跟主管談」
          這種目標也放得進來。 */}
      {showDateSheet && (
        <DateSwipeSheet
          title={t('選擇目標日期')}
          hint={t('↑ 上下滑動選擇日期 ↓')}
          confirmLabel={t('確定')}
          selectedIso={targetIso}
          onClose={() => setShowDateSheet(false)}
          onConfirm={(date) => {
            setTargetDate(date)
            setShowDateSheet(false)
          }}
          options={Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)).map((date, i) => ({
            iso: isoLocalDate(date),
            label: i === 0 ? t('今天') : i === 1 ? t('明天') : formatShortDate(date, language),
            sublabel: formatDate(date, language),
            date,
          }))}
        />
      )}
    </div>
  )
}

// ─── 子元件 ───────────────────────────────────────────────────────────────

// 開場介紹頁：版型與自我慈悲／感恩日記一致——滿版插畫 banner（含返回鈕與時間徽章）、
// 金色說明框、四步驟常駐露出＋「查看更多」展開心態提醒與文獻、重點條列、PERMA 加分、開始 CTA。
function IntroScreen({ onStart }: { onStart: () => void }) {
  const { t } = useLanguage()
  const steps = getSteps(t)
  const permaBoosts = getPermaBoosts(t)

  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-5 pt-4 pb-8">
      <div className="relative left-1/2 right-1/2 -mx-[50cqw] -mt-4 w-[100cqw] overflow-hidden">
        <img
          src={woopBanner}
          alt=""
          className="pointer-events-none block h-auto w-full"
        />
        <Link
          to="/app/home"
          className="absolute left-1 top-1 z-[2] flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#542916] bg-[#FEFAF0] text-[#542916] shadow-soft transition active:scale-90"
          aria-label={t('返回訓練中心')}
        >
          <BackIcon />
        </Link>
        <div className="absolute right-5 top-16 z-[2] flex h-[70px] w-[70px] flex-col items-center justify-center rounded-xl border-[3px] border-[#88B8CE] bg-cream">
          <span className="font-en text-[30px] font-bold leading-none text-foreground">5</span>
          <span className="mt-0.5 text-xs text-muted-foreground">{t('分鐘')}</span>
        </div>
      </div>

      <h1 className="mt-3.5 text-[27px] font-black leading-[1.3] tracking-[0.03em] text-foreground">
        {t('你今天 WOOP 了嗎？')}
      </h1>
      <p className="mt-1 text-[15px] font-bold tracking-[0.03em] text-muted-foreground">{t('目標實踐地圖')}</p>

      <div className="mt-4 rounded-[20px] bg-gold p-4 text-[15px] leading-[1.75] text-[#5b4226]">
        <p>
          {t('心理學家 Gabriele Oettingen 經過 20 年研究發現，單純想像成功的喜悅，反而會讓大腦誤以為「目標已達成」，降低行動能量。')}
        </p>
        <p className="mt-3">
          {t('WOOP 是一個成本極低、5 分鐘以內就能完成的高效工具。它不只讓你想像完成後的樣子，也帶你的大腦預見「可能的阻礙」，降低不確定性。')}
        </p>
      </div>

      {/* 什麼時候可以用？——放在第一屏顯眼處，讓人一眼知道怎麼把 WOOP 用進每天的生活。 */}
      <div className="mt-4 rounded-[20px] border-2 border-[#88B8CE] bg-tile-blue/40 p-4">
        <p className="text-[15px] font-extrabold text-foreground">{t('什麼時候可以用 WOOP？')}</p>
        <p className="mt-2 text-sm leading-[1.75] text-foreground/80">
          {t('鼓勵你每天早上起來，先 WOOP 一下今天最重要要完成的一件事情是什麼。你也可以在睡覺以前，先想清楚明天希望完成的一件事。')}
        </p>
      </div>

      {/* 四個步驟常駐露出，心態提醒與相關文獻由「查看更多」展開（三個練習共用版型）。 */}
      <TheorySection>
        {(expanded) => (
          <>
            <div className="flex flex-col gap-2.5">
              {steps.map((s) => (
                <div key={s.key} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold"
                    style={{ background: s.iconBg, color: s.accent }}
                  >
                    {s.letter}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-extrabold text-foreground">
                      {s.letter}｜{s.titleEn} {s.titleZh}
                    </p>
                    <p className="mt-0.5 text-sm text-foreground/75">{s.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
            {expanded && (
              <>
                <div className="mt-2.5 rounded-2xl bg-card p-4 shadow-soft">
                  <p className="mb-1.5 text-sm font-extrabold text-foreground">{t('心態提醒')}</p>
                  <p className="text-sm leading-relaxed text-foreground/75">
                    {t('WOOP 並不是要你強迫自己設定很多、很高、很艱難、很長遠的目標，而更是你每一天日常生活的目標，這個目標是非常小、非常具體的。可以是工作中很重要的一件事情或待辦事項、也可以是生活中很重要的一個習慣培養；也可以是你近期想要改變自己的一個小目標行動。')}
                  </p>
                  <p className="mt-2.5 text-sm leading-relaxed text-foreground/75">
                    {t('如果當天沒有順利完成，鼓勵你不要灰心。WOOP 並不是用來放大自己不足的工具，而是幫助你想清楚每一天的人生目標感；比起漫無目的的生活，我們只是多了一小份對每一天為何而活、為什麼而努力的小覺察。')}
                  </p>
                </div>
                <div className="mt-2.5 rounded-2xl bg-card p-4 shadow-soft">
                  <p className="mb-1.5 text-xs font-extrabold text-foreground">{t('相關文獻')}</p>
                  <ul className="flex flex-col gap-1.5 pl-3 text-xs text-foreground/60">
                    <li>
                      Oettingen, G. (2012). Future thought and behaviour change. <em>European Review of Social Psychology, 23</em>(1), 1–63. https://doi.org/10.1080/10463283.2011.643698
                    </li>
                    <li>
                      Gollwitzer, P. M., &amp; Sheeran, P. (2006). Implementation intentions and goal achievement. <em>Advances in Experimental Social Psychology, 38</em>, 69–119. https://doi.org/10.1016/S0065-2601(06)38002-1
                    </li>
                    <li>
                      Sheeran, P., Listrom, O., &amp; Gollwitzer, P. M. (2025). The when and how of planning: Meta-analysis of the scope and components of implementation intentions in 642 tests. <em>European Review of Social Psychology, 36</em>(1), 162–194.
                    </li>
                  </ul>
                </div>
              </>
            )}
          </>
        )}
      </TheorySection>

      <div className="mt-5 flex flex-col gap-3.5">
        {[
          t('依序完成 W／O／O／P 四段小小書寫'),
          t('設定每天的小目標，幫助你增加每天的人生目標感'),
          t('完成後可下載你的 WOOP 地圖'),
        ].map((item) => (
          <div key={item} className="flex items-center gap-3 text-base text-foreground">
            <span className="h-[22px] w-[22px] shrink-0 rounded-full bg-[#88B8CE]" />
            {item}
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {permaBoosts.map(({ key, label, delta }) => (
          <span key={key} className="mr-3">
            {label} <strong className="text-foreground">+{delta}</strong>
          </span>
        ))}
      </p>

      <button
        onClick={onStart}
        className="mt-7 flex h-[60px] w-full items-center justify-center gap-3 rounded-full bg-[#88B8CE] text-xl font-black tracking-[0.08em] text-cream shadow-[0_4px_10px_rgba(136,184,206,0.4)] transition active:scale-[0.98]"
      >
        {t('開始練習')}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9 8l4 4-4 4" />
        </svg>
      </button>
    </div>
  )
}

// W / O / O / P 分頁導覽列：當前步驟為色底膠囊（含中文小標），其餘灰階。
function WoopTabs({ current }: { current: number }) {
  const { t } = useLanguage()
  const steps = getSteps(t)
  return (
    <div className="flex gap-2">
      {steps.map((s, i) => {
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
  const { t } = useLanguage()
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
          {value.trim() || t('（未填寫）')}
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

function CelebrateCheckIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="#FEFAF0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronIcon({ rotated }: { rotated: boolean }) {
  return (
    <svg
      className={`transition-transform ${rotated ? 'rotate-180' : ''}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
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

// 日期格式依語言呈現不同的星期寫法（純資料轉換，非畫面文字查表，故直接依語言分支）。
function formatDate(date: Date, language: Language): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const base = `${y} / ${m} / ${d}`
  if (language === 'en') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return `${base} (${days[date.getDay()]})`
  }
  const days = ['日', '一', '二', '三', '四', '五', '六']
  return `${base}（星期${days[date.getDay()]}）`
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
  const { t } = useLanguage()
  return (
    <div style={CARD_BASE}>
      <div>
        <div style={{ fontSize: 16, letterSpacing: 8, fontWeight: 800, opacity: 0.55 }}>PSY BY PSY · WOOP</div>
        <div style={{ fontSize: 50, fontWeight: 800, marginTop: 14, lineHeight: 1.2 }}>{t('我的 WOOP 地圖')}</div>
        <div style={{ fontSize: 22, opacity: 0.65, marginTop: 8 }}>{date}</div>
      </div>
      <CardWoopBlock letter="W" label={`Wish・${t('設定目標')}`} accent="#3F7BD6" iconBg="#DCEBFE" value={wish} />
      <CardWoopBlock letter="O" label={`Outcome・${t('看見結果')}`} accent="#C7902F" iconBg="#FEF3C7" value={outcome} />
      <CardWoopBlock letter="O" label={`Obstacle・${t('覺察阻礙')}`} accent="#D26A86" iconBg="#FCE2E8" value={obstacle} />
      <CardWoopBlock letter="P" label={`Plan・${t('執行計畫')}`} accent="#2E9E8F" iconBg="#D6F0E4" value={plan} />

      {/* If-Then 計畫 */}
      <div style={{ background: 'rgba(46,158,143,0.12)', borderRadius: 28, padding: '26px 32px' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#2E9E8F', marginBottom: 10 }}>{t('你的 If-Then 計畫')}</div>
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.5 }}>{ifThen}</div>
      </div>

      <CardLogo />
    </div>
  )
}
