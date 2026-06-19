import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { computeStreak, computeUnifiedStreak, streakFromDates } from '../lib/streak'
import { isoLocalDate } from '../lib/date'
import { PrimaryCta } from '../components/PrimaryCta'
import VoiceInput from '../components/pretest/VoiceInput'
import { FirstFeedbackSurvey } from '../components/FirstFeedbackSurvey'
import { track } from '../lib/analytics'
import { type Privacy, DEFAULT_PRIVACY, PRIVACY_OPTIONS, privacyToFields } from '../lib/privacy'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

const ANON_NAMES = ['溫暖的星火', '清晨的微風', '靜謐的月光', '晴天的微笑', '輕盈的雲朵']

function pickAnonName() {
  return ANON_NAMES[Math.floor(Math.random() * ANON_NAMES.length)]
}

export const Route = createFileRoute('/app/gratitude')({
  component: GratitudePage,
})

type Stage = 'INTRO' | 'WRITING' | 'SUMMARY' | 'CELEBRATE'
type Difficulty = 'basic' | 'advanced'
type ItemKey = 'item_1' | 'item_2' | 'item_3'
type TargetCode = 'others' | 'self' | 'environment' | 'experience' | 'custom'

interface GratitudeItems {
  item_1: string
  item_2: string
  item_3: string
}

interface TagResult {
  item: number
  target: TargetCode
  label: string
}

interface SummaryResult {
  emotional_summary: string
  action_suggestion: string
}

const TARGET_META: Record<TargetCode, { emoji: string; label: string }> = {
  others:      { emoji: '👥', label: '身邊他人' },
  self:        { emoji: '🙋', label: '自己' },
  environment: { emoji: '🌳', label: '環境' },
  experience:  { emoji: '✨', label: '體驗' },
  custom:      { emoji: '🏷️', label: '自訂' },
}


const DIFFICULTY_PROMPTS: Record<Difficulty, string> = {
  basic: '今天有什麼讓你心存感謝的事？可以是很小的事。',
  advanced: '這件事的哪個部分讓你感到感謝？它對你的意義是什麼？',
}

const FALLBACK_SUMMARIES: SummaryResult[] = [
  {
    emotional_summary: '你今天記下了珍貴的感恩，這份覺察本身就是一種溫柔的力量。',
    action_suggestion: '試著在今天再回味這三件事一次，讓正向感受在心中多停留一會兒。',
  },
  {
    emotional_summary: '能寫下感恩的事，代表你正在練習把目光放在生活中的光亮處。',
    action_suggestion: '今天找一個安靜的時刻，深呼吸，把這份溫暖帶進你的身體。',
  },
  {
    emotional_summary: '每一次記下感恩，大腦就多一次尋找美好事物的練習。',
    action_suggestion: '明天試著更具體描述其中一件事，問自己「它讓我感受到什麼？」',
  },
  {
    emotional_summary: '今天的三件感恩，是你送給明天自己的一份小禮物。',
    action_suggestion: '如果其中有一件感恩涉及到某個人，不妨讓對方知道你的感謝。',
  },
  {
    emotional_summary: '感恩練習最珍貴的地方，在於它讓你習慣把注意力放在值得珍惜的事。',
    action_suggestion: '今天睡前再想想：這三件事有沒有讓你想到一個值得感謝的人？',
  },
]

function pickFallbackSummary(items: GratitudeItems): SummaryResult {
  const key = items.item_1 + items.item_2 + items.item_3
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0
  }
  return FALLBACK_SUMMARIES[Math.abs(hash) % FALLBACK_SUMMARIES.length]
}

const PERMA_BOOSTS = [
  {
    key: 'P',
    label: '情緒力',
    delta: 3,
    badge: 'bg-tile-pink',
    bar: 'bg-tile-pink',
    description: '成功累積三次的正向情緒經驗！',
  },
  {
    key: 'M',
    label: '意義力',
    delta: 1,
    badge: 'bg-tile-peach',
    bar: 'bg-tile-peach',
    description: '感恩日記能幫助你發現自己真正重視的人事物，提升生活的意義感',
  },
  {
    key: 'R',
    label: '連結力',
    delta: 3,
    badge: 'bg-tile-blue',
    bar: 'bg-tile-blue',
    description: '進一步覺察自身的人際關係支持系統，更容易感受到身邊人或自己的支持',
  },
] as const

function todayDate(): Date {
  return new Date()
}

function formatDate(date: Date): string {
  const days = ['日', '一', '二', '三', '四', '五', '六']
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y} / ${m} / ${d}（星期${days[date.getDay()]}）`
}

function formatWritingDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y} / ${m} / ${d}（${days[date.getDay()]}）`
}

// 行動網路偶爾會讓連線卡住卻不結束，fetch 預設沒有逾時 → promise 永遠不 resolve，
// 使用者就「等不到回應」。用 AbortController 設上限，逾時就丟錯，讓呼叫端走既有的
// 失敗 fallback（顯示友善訊息 / 以 null ai_feedback 存檔），而不是無限轉圈。
const AI_FETCH_TIMEOUT_MS = 30000

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = AI_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchSummary(items: GratitudeItems, difficulty: Difficulty): Promise<SummaryResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const resp = await fetchWithTimeout(`${API_URL}/api/gratitude-summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ...items, difficulty }),
  })
  if (!resp.ok) throw new Error(`API error: ${resp.status}`)
  const data = await resp.json() as { emotional_summary?: string; action_suggestion?: string }
  if (!data.emotional_summary) throw new Error('Empty summary')
  return {
    emotional_summary: data.emotional_summary,
    action_suggestion: data.action_suggestion ?? '',
  }
}

async function fetchTags(items: GratitudeItems): Promise<TagResult[]> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const resp = await fetchWithTimeout(`${API_URL}/api/tag-gratitude-targets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(items),
  })
  if (!resp.ok) throw new Error(`API error: ${resp.status}`)
  const data = await resp.json() as { tags?: TagResult[] }
  return data.tags ?? []
}

function GratitudePage() {
  const [stage, setStage] = useState<Stage>('INTRO')
  const [difficulty, setDifficulty] = useState<Difficulty>('basic')
  const [items, setItems] = useState<GratitudeItems>({ item_1: '', item_2: '', item_3: '' })
  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [tags, setTags] = useState<TagResult[]>([])
  // 保存進入 SUMMARY 時觸發的分類請求 promise，讓 saveEntry 能直接 await，
  // 避免使用者在 AI 分類回來前就按下繼續、導致 target_* 沒寫入（社群貼文缺標籤）。
  const tagsPromiseRef = useRef<Promise<TagResult[]> | null>(null)
  // 同理保存「安安回饋」請求的 promise。使用者常在 AI 還沒回來就按「下一步」，
  // 若只看 summaryResult（state）會是 null，貼文就會缺 ai_feedback（後臺看到沒回應的貼文）。
  // saveEntry 會 await 這個 promise，確保 AI 回饋寫得進去。
  const summaryPromiseRef = useRef<Promise<SummaryResult> | null>(null)
  // 送出鎖：saveEntry 牽涉多個 await（getSession / AI 標籤 / AI 回饋 / DB 寫入），
  // 期間 savedEntryId（state）尚未更新，使用者連點按鈕就會送出多筆。
  // 用 ref 存放進行中的 promise，第二次呼叫直接回傳同一個 promise，杜絕重複寫入。
  const savePromiseRef = useRef<Promise<string | null> | null>(null)
  // 記錄上一次「成功生成 AI 回饋」所對應的內容簽章（items + difficulty）。
  // 用來判斷返回 SUMMARY 時要不要重新生成：
  //  - 內容有改 → 簽章不同 → 重新生成（編輯後重生成）
  //  - 內容沒改（含從結束頁返回查看）→ 簽章相同 → 直接沿用，不重生成
  const lastGenSigRef = useRef<string | null>(null)
  const [privacy, setPrivacy] = useState<Privacy>(DEFAULT_PRIVACY)
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(todayDate())
  const [celebrateStreak, setCelebrateStreak] = useState<number | null>(null)
  const [summaryStreak, setSummaryStreak] = useState<number | null>(null)
  const navigate = useNavigate()
  const router = useRouter()



  useEffect(() => {
    if (stage !== 'SUMMARY') return
    // 內容未變（返回查看 / 從結束頁返回）就沿用既有結果，避免重複生成與新舊資料衝突。
    const sig = JSON.stringify({ items, difficulty })
    if (lastGenSigRef.current === sig) return

    let cancelled = false
    setSummaryResult(null)
    setSummaryError(null)
    setTags([])

    const summaryPromise = fetchSummary(items, difficulty)
    summaryPromiseRef.current = summaryPromise
    summaryPromise
      .then((r) => {
        if (!cancelled) {
          setSummaryResult(r)
          // 只有成功才記錄簽章：失敗時保持 null，讓再次進入能重試。
          lastGenSigRef.current = sig
        }
      })
      .catch((e) => {
        if (!cancelled) {
          console.error('[gratitude-summary]', e)
          setSummaryError('教練暫時無法整理你的感恩，稍後再試一次也沒關係。')
        }
      })

    const tagsPromise = fetchTags(items)
    tagsPromiseRef.current = tagsPromise
    tagsPromise
      .then((t) => { if (!cancelled) setTags(t) })
      .catch((e) => { console.error('[gratitude-tags]', e) })

    loadStreak()
      .then((s) => { if (!cancelled) setSummaryStreak(s + 1) })
      .catch(() => {})

    return () => { cancelled = true }
  }, [stage, items, difficulty])

  const performSave = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      alert('登入狀態已失效，請重新登入後再儲存')
      throw new Error('Not authenticated')
    }

    const userId = session.user.id
    // 確保 AI 回饋已就緒再寫入：summaryResult（state）可能還沒更新，
    // 因為使用者常在生成回來前就按下「下一步」。先 await 進行中的請求，
    // 必要時再即時重試一次，把「貼文缺 ai_feedback」的機率降到最低。
    let resolvedSummary = summaryResult
    if (!resolvedSummary) {
      try {
        resolvedSummary = (await summaryPromiseRef.current) ?? null
      } catch (e) {
        console.error('[gratitude-summary await]', e)
      }
      if (!resolvedSummary) {
        try {
          resolvedSummary = await fetchSummary(items, difficulty)
        } catch (e) {
          console.error('[gratitude-summary retry]', e)
        }
      }
      if (resolvedSummary) setSummaryResult(resolvedSummary)
    }
    const aiFeedback = resolvedSummary
      ? `${resolvedSummary.emotional_summary} ${resolvedSummary.action_suggestion}`.trim()
      : null
    // 確保分類標籤已就緒再寫入：先用已載入的 state，否則 await 背景請求；
    // 若背景請求失敗，最後再即時重試一次，把缺標籤的機率降到最低。
    let resolvedTags = tags
    if (resolvedTags.length === 0) {
      try {
        resolvedTags = (await tagsPromiseRef.current) ?? []
      } catch (e) {
        console.error('[gratitude-tags await]', e)
      }
      if (resolvedTags.length === 0) {
        try {
          resolvedTags = await fetchTags(items)
        } catch (e) {
          console.error('[gratitude-tags retry]', e)
        }
      }
      if (resolvedTags.length > 0) setTags(resolvedTags)
    }

    const t1 = resolvedTags.find((t) => t.item === 1)
    const t2 = resolvedTags.find((t) => t.item === 2)
    const t3 = resolvedTags.find((t) => t.item === 3)

    const profileRes = await supabase
      .from('profiles')
      .select('name, avatar')
      .eq('id', userId)
      .maybeSingle()

    const profileName = profileRes.data?.name ?? null
    const profileAvatar = profileRes.data?.avatar ?? null

    const fields = privacyToFields(privacy)
    const anonName = fields.use_real_name
      ? (profileName || session.user.user_metadata?.full_name || session.user.user_metadata?.name || pickAnonName())
      : pickAnonName()

    const payload: Record<string, unknown> = {
      user_id: userId,
      item_1: items.item_1,
      item_2: items.item_2,
      item_3: items.item_3,
      is_shared: fields.is_shared,
      use_real_name: fields.use_real_name,
      entry_date: isoLocalDate(selectedDate),
      anon_name: anonName,
    }
    if (aiFeedback) payload.ai_feedback = aiFeedback
    if (t1) payload.target_1 = t1.target
    if (t2) payload.target_2 = t2.target
    if (t3) payload.target_3 = t3.target
    if (profileAvatar) payload.avatar = profileAvatar

    const { data: inserted, error } = await supabase
      .from('gratitude_entries')
      .insert(payload)
      .select('id')
      .single()

    if (error) {
      console.error('[gratitude save]', error)
      const msg = error.message || JSON.stringify(error)
      alert(`儲存失敗：${msg}\n\n請截圖回報給工程師。`)
      throw new Error(msg)
    }

    const entryId = inserted?.id ?? null
    setSavedEntryId(entryId)

    // 安排機器人按讚（非同步，不阻塞主流程）
    if (entryId) {
      void supabase.rpc('schedule_bot_likes', { p_entry_id: entryId })
    }

    // 計算並更新連續打卡天數（跨練習統一計算，社群顯示才會一致）
    void (async () => {
      const streak = await computeUnifiedStreak(userId)
      await supabase
        .from('profiles')
        .upsert({ id: userId, current_streak: streak }, { onConflict: 'id' })
    })()

    return entryId
  }

  const saveEntry = async (): Promise<string | null> => {
    if (savedEntryId) return savedEntryId
    // 已在進行中就回傳同一個 promise，避免連點造成重複寫入。
    // savedEntryId 是非同步 state，光靠它擋不住同一輪的併發呼叫。
    if (savePromiseRef.current) return savePromiseRef.current
    const p = performSave()
    savePromiseRef.current = p
    try {
      return await p
    } finally {
      // 成功時 savedEntryId 已設定，會擋下後續呼叫；失敗時清掉以允許重試。
      savePromiseRef.current = null
    }
  }

  // CELEBRATE 階段的「隱私設定」：日記在進入此階段前就已寫入 DB，
  // 所以切換時必須同步更新該筆資料，否則選項只是裝飾（隱私問題）。
  const handlePrivacyChange = async (next: Privacy) => {
    setPrivacy(next)
    if (!savedEntryId) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const fields = privacyToFields(next)
      let anonName: string
      if (fields.use_real_name) {
        const prof = await supabase
          .from('profiles')
          .select('name')
          .eq('id', session.user.id)
          .maybeSingle()
        anonName =
          prof.data?.name ||
          session.user.user_metadata?.full_name ||
          session.user.user_metadata?.name ||
          pickAnonName()
      } else {
        anonName = pickAnonName()
      }
      const { error } = await supabase
        .from('gratitude_entries')
        .update({ is_shared: fields.is_shared, use_real_name: fields.use_real_name, anon_name: anonName })
        .eq('id', savedEntryId)
      if (error) console.error('[privacy update]', error)
    } catch (e) {
      console.error('[privacy update]', e)
    }
  }

  const handleFinalSave = async () => {
    await router.invalidate()
    navigate({ to: '/app/community', search: { showEntry: 1 } })
  }

  switch (stage) {
    case 'INTRO':
      return (
        <IntroStage
          difficulty={difficulty}
          onChangeDifficulty={setDifficulty}
          onStart={() => {
            track('gratitude_started', { difficulty })
            setStage('WRITING')
          }}
        />
      )
    case 'WRITING':
      return (
        <WritingStage
          difficulty={difficulty}
          items={items}
          selectedDate={selectedDate}
          onChangeSelectedDate={setSelectedDate}
          onChangeItem={(key, val) => setItems((prev) => ({ ...prev, [key]: val }))}
          onBack={() => setStage('INTRO')}
          onNext={() => setStage('SUMMARY')}
        />
      )
    case 'SUMMARY':
      return (
        <SummaryStage
          items={items}
          selectedDate={selectedDate}
          summaryResult={summaryResult}
          summaryError={summaryError}
          streak={summaryStreak}
          // 已存檔（從結束頁返回查看）→ 唯讀，返回結束頁；
          // 未存檔（剛寫完）→ 可返回編輯，回上一頁改日記內容。
          mode={savedEntryId ? 'view' : 'edit'}
          onBack={() => setStage(savedEntryId ? 'CELEBRATE' : 'WRITING')}
          onContinue={async () => {
            try {
              await saveEntry()
              const s = await loadStreak().catch(() => null)
              setCelebrateStreak(s)
              track('gratitude_completed', { difficulty, streak: s })
              setStage('CELEBRATE')
            } catch {
              // saveEntry already showed alert; stay on SUMMARY
            }
          }}
        />
      )
    case 'CELEBRATE':
      return (
        <CelebrateStage
          privacy={privacy}
          onPrivacyChange={handlePrivacyChange}
          onNavigate={handleFinalSave}
          onBack={() => setStage('SUMMARY')}
          streakOverride={celebrateStreak}
        />
      )
  }
}

// ─────────────────────────── INTRO ───────────────────────────

function IntroStage({
  difficulty,
  onChangeDifficulty,
  onStart,
}: {
  difficulty: Difficulty
  onChangeDifficulty: (d: Difficulty) => void
  onStart: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const difficultyLabel = difficulty === 'basic' ? '初階' : '進階'

  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-8 pb-36 md:px-10">
      {/* 3-A 大標題 */}
      <h1 className="text-[1.9rem] font-extrabold leading-tight text-foreground">
        感恩日記練習
      </h1>

      {/* 3-B 基本資訊行 */}
      <div className="mt-5 flex items-end gap-8">
        <div>
          <p className="text-3xl font-extrabold text-foreground">5</p>
          <p className="mt-0.5 text-xs text-muted-foreground">分鐘</p>
        </div>
        <div>
          <p className="text-3xl font-extrabold text-foreground">{difficultyLabel}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">難度</p>
        </div>
      </div>

      {/* 3-C 常駐描述 */}
      <div className="mt-5 rounded-2xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
        感恩日記（Gratitude Journal）是正向心理學中最具代表性的練習之一，透過每天有意識地回顧值得感謝的事件，幫助大腦重新聚焦於生活中的支持、善意與美好經驗。
      </div>

      {/* 3-C2 查看更多展開 */}
      <div className="mt-3">
        {!expanded ? (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs font-bold text-primary"
          >
            查看更多 ▾
          </button>
        ) : (
          <div className="rounded-2xl bg-card p-4 shadow-soft text-sm leading-relaxed flex flex-col gap-4">
            <div>
              <p className="font-extrabold text-foreground mb-1.5">核心目標</p>
              <ul className="flex flex-col gap-1 text-foreground/75 pl-3">
                <li>・建立覺察生活中的美好以及練習表達感恩的習慣</li>
                <li>・透過簡單、低負擔的書寫，引導我們開始留意：</li>
                <ul className="pl-3 mt-1 flex flex-col gap-1">
                  <li>・今天有哪些事情值得被感謝？</li>
                  <li>・哪些人、環境與體驗支持了自己？</li>
                  <li>・自己是否也值得被感謝？</li>
                </ul>
              </ul>
            </div>
            <div>
              <p className="font-extrabold text-foreground mb-1.5">練前準備</p>
              <ul className="flex flex-col gap-2 text-foreground/75 pl-3">
                <li>
                  <strong className="font-bold text-foreground">練習時長</strong>
                  <div className="mt-0.5">建議每日 5–10 分鐘。</div>
                </li>
                <li>
                  <strong className="font-bold text-foreground">時段推薦</strong>
                  <div className="mt-0.5">建議在 19:00–24:00 之間練習，幫助自己：</div>
                  <ul className="pl-3 mt-1 flex flex-col gap-1">
                    <li>・回顧一天發生的事件</li>
                    <li>・整理自己的思緒與情緒</li>
                    <li>・建立睡前的感恩儀式感</li>
                  </ul>
                </li>
                <li>
                  <strong className="font-bold text-foreground">環境營造</strong>
                  <div className="mt-0.5">建議開始前：</div>
                  <ul className="pl-3 mt-1 flex flex-col gap-1">
                    <li>・暫停所有訊息通知</li>
                    <li>・找一個舒服且安靜的空間</li>
                    <li>・將注意力回到自己身上</li>
                  </ul>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-extrabold text-foreground mb-1.5">不建議練習的時刻</p>
              <ul className="flex flex-col gap-2 text-foreground/75 pl-3">
                <li>
                  <strong className="font-bold text-foreground">情緒極端崩潰時</strong>
                  <div className="mt-0.5">若當下正處於劇烈創傷或憤怒中，不應強迫感恩，應先進行情緒宣洩或尋求專業諮商協助。</div>
                </li>
                <li>
                  <strong className="font-bold text-foreground">極度疲憊時</strong>
                  <div className="mt-0.5">感恩書寫需要一定心理能量。若過度疲勞，容易變成應付式紀錄，同時難以書寫真實感受，可能增加心理負擔。</div>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-extrabold text-foreground mb-1.5">研究指出的效益</p>
              <p className="text-foreground/75 mb-2">持續性的感恩練習有助於提升：</p>
              <ul className="flex flex-col gap-1 text-foreground/75 pl-3 mb-3">
                <li>・情緒力（Positive Emotion）</li>
                <li>・連結力（Relationships）</li>
                <li>・意義力（Meaning）</li>
                <li>・心理韌性與幸福感</li>
                <li>・壓力調節與睡眠品質</li>
              </ul>
              <p className="font-extrabold text-foreground mb-1.5 mt-3">相關文獻</p>
              <ul className="flex flex-col gap-1.5 text-foreground/60 text-xs pl-3">
                <li>Choi, H., Cha, Y., McCullough, M. E., Coles, N. A., & Oishi, S. (2025). A meta-analysis of the effectiveness of gratitude interventions on well-being across cultures. <em>Proceedings of the National Academy of Sciences, 122</em>(28), e2425193122.</li>
                <li>Folk, D., & Dunn, E. (2023). A systematic review of the strength of evidence for the most commonly recommended happiness strategies in mainstream media. <em>Nature Human Behaviour, 7</em>(10), 1697–1707.</li>
              </ul>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-xs font-bold text-primary text-left"
            >
              收合 ▴
            </button>
          </div>
        )}
      </div>

      {/* 3-D 練習內容清單 */}
      <div className="mt-5 flex flex-col gap-2.5">
        {['選擇練習難度', '寫下三件感恩的事', '閱讀 AI 教練回饋'].map((item) => (
          <div key={item} className="flex items-center gap-2.5 text-sm text-foreground/80">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-primary/70 text-[10px] font-extrabold text-primary">
              ✓
            </span>
            {item}
          </div>
        ))}
      </div>

      {/* 3-E 難度選擇 */}
      <p className="mt-7 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
        CHOOSE INTENSITY
      </p>
      <div className="mt-1 flex items-baseline justify-between">
        <h3 className="text-base font-extrabold text-foreground">依今天的能量挑一個強度</h3>
        <div className="whitespace-nowrap text-xs text-muted-foreground">
          {PERMA_BOOSTS.map(({ label, delta }) => (
            <span key={label} className="mr-3">
              {label} <strong className="text-foreground">+{delta}</strong>
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          onClick={() => onChangeDifficulty('basic')}
          className={`relative flex flex-col items-start rounded-2xl bg-tile-mint p-4 text-left transition active:scale-[0.98] ${
            difficulty === 'basic' ? 'ring-2 ring-orange-400' : ''
          }`}
        >
          <span className="absolute right-3 top-3 rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            輕量
          </span>
          <span className="mt-5 text-[0.95rem] font-extrabold text-emerald-800">初階練習</span>
          <span className="mt-1 text-xs font-medium text-emerald-700">5 分 能量值</span>
        </button>
        <div className="relative flex flex-col items-start rounded-2xl bg-muted/50 p-4 text-left grayscale opacity-50 cursor-not-allowed select-none">
          <span className="absolute right-3 top-3 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            施工中
          </span>
          <span className="mt-5 text-[0.95rem] font-extrabold text-muted-foreground">進階練習</span>
          <span className="mt-1 text-xs font-medium text-muted-foreground">10 分 能量值</span>
        </div>
      </div>

      {/* 開始練習 CTA */}
      <div className="mt-6">
        <PrimaryCta onClick={onStart} variant="next">
          開始練習
        </PrimaryCta>
      </div>
    </div>
  )
}

// ─────────────────────────── WRITING (single page) ───────────────────────────

const CARD_PLACEHOLDERS = [
  {
    title: '第一件感恩的事情是…',
    example:
      '舉例：我很感激工作夥伴幫忙來回溝通開會事項，交給對方處理我感到很安心',
  },
  {
    title: '第二件感恩的事情是…',
    example:
      '舉例：我很感謝自己今天面對一整天繁忙的行程並沒有退縮或放棄，真的好難得～',
  },
  {
    title: '第三件感恩的事情是…',
    example:
      '舉例：今天的公車準時抵達，讓我有餘裕不匆忙地去上班，還可以欣賞沿途風景',
  },
]

async function loadStreak(): Promise<number> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return 0
  return computeStreak(session.user.id)
}

function formatSheetDate(date: Date): string {
  const days = ['日', '一', '二', '三', '四', '五', '六']
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}，星期${days[date.getDay()]}`
}

function WritingStage({
  difficulty,
  items,
  selectedDate,
  onChangeSelectedDate,
  onChangeItem,
  onBack,
  onNext,
}: {
  difficulty: Difficulty
  items: GratitudeItems
  selectedDate: Date
  onChangeSelectedDate: (d: Date) => void
  onChangeItem: (key: ItemKey, val: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const dateStr = useMemo(() => formatWritingDate(selectedDate), [selectedDate])
  const [streak, setStreak] = useState(0)
  const [activeCard, setActiveCard] = useState<number>(1)
  const [showDateSheet, setShowDateSheet] = useState(false)

  const today = useMemo(() => todayDate(), [])
  const yesterday = useMemo(() => {
    const d = todayDate()
    d.setDate(d.getDate() - 1)
    return d
  }, [])
  const selectedIso = isoLocalDate(selectedDate)

  useEffect(() => {
    loadStreak().then(setStreak).catch(() => {})
  }, [])

  const values = [items.item_1, items.item_2, items.item_3]
  const filledCount = values.filter((v) => v.trim().length > 0).length
  const totalChars = values.join('').replace(/\s/g, '').length
  const allFilled = filledCount === 3

  return (
    <>
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-8 pb-40 md:px-10">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground shadow-soft transition active:scale-90"
        aria-label="返回"
      >
        <BackIcon />
      </button>

      {/* 4-B ① Date & streak */}
      <div className="mt-5">
        <div className="flex items-center gap-2">
          <p className="text-lg font-extrabold text-foreground">{dateStr}</p>
          <button
            onClick={() => setShowDateSheet(true)}
            className="rounded-full bg-card px-3 py-1 text-xs font-bold text-primary shadow-soft transition active:scale-95"
          >
            修改日期
          </button>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          已連續紀錄 {streak} 天 🔥
        </p>
      </div>

      {/* 4-B ② Circular progress */}
      <div className="mt-6 flex justify-center">
        <CircularProgress filled={filledCount} chars={totalChars} />
      </div>

      {/* 4-C Guiding text */}
      <div className="mt-6 rounded-3xl bg-card p-4 shadow-soft">
        <p className="text-sm leading-relaxed text-foreground/80">
          今天發生了哪三件值得你感謝的事情呢？
          <br />
          請寫得越具體越好。感恩的對象可以是：身邊的人、自己、大自然與環境、一段體驗，或任何讓你感到被支持的事情。
        </p>
      </div>

      {/* 4-C Cards */}
      <div className="mt-4 flex flex-col gap-3">
        {([1, 2, 3] as const).map((i) => (
          <GratitudeCard
            key={i}
            index={i}
            value={values[i - 1]}
            difficulty={difficulty}
            isActive={activeCard === i}
            onActivate={() => setActiveCard(i)}
            onChange={(v) => onChangeItem(`item_${i}` as ItemKey, v)}
          />
        ))}
      </div>

      {/* CTA */}
      <div className="mt-6">
        <PrimaryCta onClick={onNext} disabled={!allFilled} variant="done">
          完成三件感恩
        </PrimaryCta>
      </div>
    </div>

    {/* 修改日期 bottom sheet — outside animate-fade-up to fix fixed-position offset */}
    {showDateSheet && (
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
        onClick={() => setShowDateSheet(false)}
      >
        <div
          className="animate-slide-up w-full max-w-md rounded-t-3xl bg-card p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-soft"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-extrabold text-foreground">選擇紀錄日期</p>
            <button
              onClick={() => setShowDateSheet(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {[
              { label: '今天', date: today },
              { label: '昨天', date: yesterday },
            ].map(({ label, date }) => {
              const active = selectedIso === isoLocalDate(date)
              return (
                <button
                  key={label}
                  onClick={() => {
                    onChangeSelectedDate(date)
                    setShowDateSheet(false)
                  }}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left transition active:scale-[0.98] ${
                    active ? 'bg-primary/10 ring-1 ring-primary' : 'bg-muted/50'
                  }`}
                >
                  <span className="text-sm font-bold text-foreground">
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatSheetDate(date)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function CircularProgress({ filled, chars }: { filled: number; chars: number }) {
  const r = 52
  const circumference = 2 * Math.PI * r
  const strokeDashoffset = circumference * (1 - filled / 3)
  const isComplete = filled === 3

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <svg
          width="140"
          height="140"
          viewBox="0 0 140 140"
          style={
            isComplete
              ? { filter: 'drop-shadow(0 0 10px rgba(245,158,11,0.65))' }
              : undefined
          }
        >
          {/* Track */}
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            className="text-muted-foreground/20"
          />
          {/* Progress */}
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={isComplete ? '#f59e0b' : '#3b56a8'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 70 70)"
            style={{ transition: 'stroke-dashoffset 0.7s ease, stroke 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-2xl font-extrabold ${
              isComplete ? 'text-amber-500' : 'text-foreground'
            }`}
          >
            {filled}/3
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            今日進度
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">今日已寫 {chars} 字</p>
    </div>
  )
}

function GratitudeCard({
  index,
  value,
  difficulty,
  isActive,
  onActivate,
  onChange,
}: {
  index: 1 | 2 | 3
  value: string
  difficulty: Difficulty
  isActive: boolean
  onActivate: () => void
  onChange: (v: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { title, example } = CARD_PLACEHOLDERS[index - 1]
  const filled = value.trim().length > 0

  useEffect(() => {
    if (isActive) textareaRef.current?.focus()
  }, [isActive])

  return (
    <div
      role={!isActive ? 'button' : undefined}
      tabIndex={!isActive ? 0 : undefined}
      onClick={!isActive ? onActivate : undefined}
      onKeyDown={
        !isActive ? (e) => e.key === 'Enter' && onActivate() : undefined
      }
      className={`rounded-3xl bg-card shadow-soft transition-all duration-200 ${
        !isActive ? 'cursor-pointer active:scale-[0.99]' : ''
      } ${filled && !isActive ? 'ring-1 ring-primary/30' : ''}`}
    >
      <div className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
              filled
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {filled ? '✓' : index}
          </span>
          <span className="text-sm font-bold text-foreground">{title}</span>
        </div>

        {isActive ? (
          <>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={example}
              rows={5}
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
            <div className="mt-2">
              <VoiceInput
                accent="hsl(var(--primary))"
                onTranscript={(text) => {
                  const sep = value && !/\s$/.test(value) ? ' ' : ''
                  onChange(value + sep + text)
                }}
              />
            </div>
            {difficulty === 'advanced' && (
              <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-primary/70">
                💡 {DIFFICULTY_PROMPTS[difficulty]}
              </p>
            )}
          </>
        ) : filled ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-foreground/70">
            {value}
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground/50">
            {example}
          </p>
        )}
      </div>
    </div>
  )
}

function BackIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

// ─────────────────────────── SUMMARY ───────────────────────────

function SummaryStage({
  items,
  selectedDate,
  summaryResult,
  summaryError,
  streak,
  mode,
  onBack,
  onContinue,
}: {
  items: GratitudeItems
  selectedDate: Date
  summaryResult: SummaryResult | null
  summaryError: string | null
  streak: number | null
  mode: 'edit' | 'view'
  onBack: () => void
  onContinue: () => void
}) {
  const shareCardRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  // 送出中狀態：按下「下一步」後立即鎖住按鈕，避免使用者見畫面沒反應就連點，
  // 造成同一篇日記被寫入多筆（後臺看到重複貼文）。
  const [submitting, setSubmitting] = useState(false)
  // 日期跟著使用者在書寫頁選的「紀錄日期」走，而非永遠用今天（修正分享圖／回顧頁日期不一致）
  const date = useMemo(() => formatDate(selectedDate), [selectedDate])

  const handleContinue = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onContinue()
    } finally {
      setSubmitting(false)
    }
  }

  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent)

  const handleShare = async () => {
    if (!shareCardRef.current || sharing) return
    setSharing(true)
    try {
      const node = shareCardRef.current
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      // 動態載入 html-to-image，讓它從主包切出去（只有按下分享才載入）
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(node, {
        width: 1080,
        height: 1440,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
        skipFonts: true,
        style: {
          position: 'static',
          left: '0',
          top: '0',
          transform: 'none',
          margin: '0',
        },
      })
      const filename = `gratitude-${isoLocalDate(selectedDate)}.png`
      if (isMobile) {
        const blob = await fetch(dataUrl).then((r) => r.blob())
        const file = new File([blob], filename, { type: 'image/png' })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: '今天的感恩日記' })
          return
        }
      }
      const link = document.createElement('a')
      link.download = filename
      link.href = dataUrl
      link.click()
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') {
        console.error('[share image]', e)
      }
    } finally {
      setSharing(false)
    }
  }

  const entries = [items.item_1, items.item_2, items.item_3]
  const isLoading = summaryResult === null && !summaryError
  const fallbackResult = summaryError ? pickFallbackSummary(items) : null
  const displayResult = summaryResult ?? fallbackResult
  const isFallback = !summaryResult && !!fallbackResult

  return (
    <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-8 md:px-10">
      {/* 返回鍵：編輯模式回上一頁改日記、唯讀模式回結束頁 */}
      <button
        onClick={onBack}
        disabled={submitting}
        className="mb-5 flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground shadow-soft transition active:scale-90 disabled:opacity-50"
        aria-label={mode === 'edit' ? '返回編輯日記' : '返回'}
      >
        <BackIcon />
      </button>

      <p className="font-handwriting text-2xl text-muted-foreground">今天的回顧</p>
      <h2 className="mb-1 mt-1 text-2xl font-extrabold leading-tight text-foreground md:text-3xl">
        寫下你的感恩日記 ✨
      </h2>
      <p className="text-xs text-muted-foreground">{date}</p>

      {/* Entries with target tag badges */}
      <div className="mb-6 mt-6 flex flex-col gap-3">
        {entries.map((text, i) => {
          return (
            <div key={i} className="rounded-3xl bg-card p-4 shadow-soft">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm leading-relaxed text-foreground/85">{text}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* AI Coach feedback - 2-part */}
      <div className="mb-6 rounded-3xl bg-gradient-soft p-5 shadow-soft">
        <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.25em] text-primary">
          安安回饋
        </p>
        {isLoading ? (
          <FeedbackLoading />
        ) : displayResult ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-foreground">
              {displayResult.emotional_summary}
            </p>
            {displayResult.action_suggestion && (
              <div className="rounded-2xl bg-white/40 px-3.5 py-2.5">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary/60 mb-1">
                  行動建議
                </p>
                <p className="text-sm leading-relaxed text-foreground/80">
                  {displayResult.action_suggestion}
                </p>
              </div>
            )}
            {isFallback && (
              <p className="text-[10px] text-muted-foreground/50">※ 安安今天稍忙，以通用回饋陪伴你</p>
            )}
          </div>
        ) : null}
      </div>

      <div
        ref={shareCardRef}
        aria-hidden
        className="pointer-events-none fixed -left-[9999px] top-0"
        style={{ width: '1080px', height: '1440px' }}
      >
        <ShareCard
          items={items}
          emotionalSummary={displayResult?.emotional_summary ?? null}
          actionSuggestion={displayResult?.action_suggestion ?? null}
          date={date}
          streak={streak}
        />
      </div>

      {/* 回饋生成前：不顯示「下載圖片／下一步」，只提示請耐心等候 */}
      {isLoading ? (
        <p className="pb-6 text-center text-sm font-bold leading-relaxed text-muted-foreground">
          ⏳ 等回饋生成完之後，才能進行下一步喔！
        </p>
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          {/* 下載圖片：白底黑字 */}
          <button
            onClick={handleShare}
            disabled={sharing || !displayResult}
            className="flex h-16 w-full items-center justify-center gap-3 rounded-full border border-border bg-white text-base font-extrabold tracking-[0.2em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {sharing ? '正在生成圖片…' : isMobile ? '分享圖片' : '下載圖片'}
          </button>
          {mode === 'edit' ? (
            /* 下一步：藍底白字 */
            <button
              onClick={handleContinue}
              disabled={submitting}
              className="h-14 w-full rounded-full bg-gradient-primary text-sm font-extrabold tracking-[0.2em] text-white shadow-soft transition active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? '處理中…' : '下一步'}
            </button>
          ) : (
            <button
              onClick={onBack}
              className="h-14 w-full rounded-full bg-card text-sm font-extrabold tracking-[0.2em] text-foreground shadow-soft transition active:scale-[0.98]"
            >
              返回完成頁面
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const FEEDBACK_LOADING_MESSAGES = [
  '正在分析你的感恩日記…',
  '安安正在為你生成專屬回饋…',
  '正在喚醒 AI 教練…',
  '正在啟動伺服器（首次回應可能需要多等幾秒）…',
  '快好了，謝謝你的耐心等待 💛',
]

// AI 回饋生成期間的等待畫面：循環播放訊息，讓使用者不會覺得卡住或無聊。
function FeedbackLoading() {
  const [msgIndex, setMsgIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setMsgIndex((i) => (i + 1) % FEEDBACK_LOADING_MESSAGES.length)
    }, 2200)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
        </span>
        <p key={msgIndex} className="animate-fade-up text-sm font-bold leading-relaxed text-foreground">
          {FEEDBACK_LOADING_MESSAGES[msgIndex]}
        </p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        等回饋生成完之後，才能進行下一步喔！
      </p>
    </div>
  )
}

function ShareCard({
  items,
  emotionalSummary,
  actionSuggestion,
  date,
  streak,
}: {
  items: GratitudeItems
  emotionalSummary: string | null
  actionSuggestion: string | null
  date: string
  streak: number | null
}) {
  const totalChars = (items.item_1?.length ?? 0) + (items.item_2?.length ?? 0) + (items.item_3?.length ?? 0)
  const itemFontSize = totalChars < 60 ? 26 : totalChars < 120 ? 22 : 18
  const itemPadding = totalChars < 60 ? '32px 36px' : totalChars < 120 ? '26px 32px' : '20px 28px'
  const itemGap = totalChars < 60 ? 28 : totalChars < 120 ? 22 : 16

  return (
    <div
      style={{
        width: '1080px',
        height: '1440px',
        background: 'linear-gradient(150deg,#dfe7f5 0%,#e8d6e8 55%,#f1d6c2 100%)',
        padding: '72px 72px 60px',
        boxSizing: 'border-box',
        fontFamily: 'PingFang TC, Microsoft JhengHei, sans-serif',
        color: '#1f2742',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}
    >
      <div>
        <div style={{ fontSize: 16, letterSpacing: 8, fontWeight: 800, opacity: 0.55 }}>
          PSY BY PSY · GRATITUDE
        </div>
        <div style={{ fontSize: 52, fontWeight: 800, marginTop: 18, lineHeight: 1.2 }}>
          今天的三件感恩
        </div>
        <div style={{ fontSize: 22, opacity: 0.65, marginTop: 10 }}>{date}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: itemGap }}>
        {[items.item_1, items.item_2, items.item_3].map((text, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(255,255,255,0.72)',
              borderRadius: 32,
              padding: itemPadding,
              display: 'flex',
              gap: 22,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: '#3b56a8',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <div style={{ fontSize: itemFontSize, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{text}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: 'rgba(255,255,255,0.55)',
          borderRadius: 32,
          padding: '28px 32px',
        }}
      >
        <div
          style={{
            fontSize: 14,
            letterSpacing: 6,
            fontWeight: 800,
            color: '#3b56a8',
            marginBottom: 14,
          }}
        >
          安安回饋
        </div>
        <div style={{ fontSize: 20, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {emotionalSummary ?? '——'}
        </div>
        {actionSuggestion && (
          <div
            style={{
              marginTop: 18,
              background: 'rgba(255,255,255,0.55)',
              borderRadius: 20,
              padding: '18px 24px',
            }}
          >
            <div
              style={{
                fontSize: 13,
                letterSpacing: 5,
                fontWeight: 800,
                color: '#3b56a8',
                opacity: 0.7,
                marginBottom: 8,
              }}
            >
              行動建議
            </div>
            <div style={{ fontSize: 19, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {actionSuggestion}
            </div>
          </div>
        )}
      </div>

      {streak !== null && (
        <div
          style={{
            background: 'linear-gradient(135deg,#3b56a8 0%,#6b7fd4 100%)',
            borderRadius: 32,
            padding: '26px 36px',
            textAlign: 'center',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 2, lineHeight: 1.3 }}>
            恭喜完成第 {streak} 天感恩日記 🎉
          </div>
        </div>
      )}

      {/* PSYbyPSY logo */}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
        <img
          src="/assets/logo-full-color.png"
          alt="PSYbyPSY"
          style={{ height: 48, objectFit: 'contain', opacity: 0.75 }}
          crossOrigin="anonymous"
        />
      </div>
    </div>
  )
}

// ─────────────────────────── CELEBRATE ───────────────────────────

const TARGET_COLORS: Record<TargetCode, string> = {
  others:      '#6BAED6',
  self:        '#FD8D3C',
  environment: '#74C476',
  experience:  '#9E9AC8',
  custom:      '#BDBDBD',
}

const TARGET_INSIGHT: Record<TargetCode, string> = {
  others:      '你的幸福感有很大一部分來自身邊的人，珍惜這些連結吧。',
  self:        '你非常懂得欣賞自己的努力與成長，這是很珍貴的自我覺察。',
  environment: '你對生活中的細微美好特別敏感，這份覺察讓你隨時都能找到禮物。',
  experience:  '你善於從日常的小體驗中找到喜悅，生活對你來說充滿驚喜。',
  custom:      '你的感恩來自各種面向，這份多元的覺察豐富了你的內在世界。',
}

const TARGET_INFO: Record<TargetCode, { title: string; desc: string }> = {
  others:      { title: '👥 身邊他人', desc: '感謝身邊的人能強化社會連結感（Relatedness），是 PERMA 中「R」的核心。研究顯示，表達感謝能同時提升給予者與接受者的幸福感。' },
  self:        { title: '🙋 自己', desc: '對自己的努力心存感謝，能培養自我同情（Self-Compassion）與成長型思維（Growth Mindset），減少自我批評，增加心理韌性。' },
  environment: { title: '🌳 環境', desc: '對自然與空間的感謝能喚起「敬畏感」（Awe），研究發現敬畏感能降低壓力荷爾蒙，並擴展我們對世界的視野。' },
  experience:  { title: '✨ 體驗', desc: '感謝日常體驗能強化「正向情緒記憶」，讓大腦更容易在未來注意到美好的事物，形成正向情緒的上升螺旋。' },
  custom:      { title: '🏷️ 自訂', desc: '多元的感恩來源代表你的覺察力不受限制，能從生活的各個角落汲取力量。' },
}

function DonutChart({ segments }: { segments: { code: TargetCode; count: number; pct: number }[] }) {
  const r = 38
  const cx = 50
  const cy = 50
  const circumference = 2 * Math.PI * r

  if (segments.length === 0) {
    return (
      <svg viewBox="0 0 100 100" className="h-32 w-32">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="16" />
      </svg>
    )
  }

  let cumulative = 0
  return (
    <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
      {segments.map(({ code, pct }) => {
        const dash = Math.max(0, pct * circumference - 2)
        const gap = circumference - dash
        const offset = -(cumulative * circumference)
        cumulative += pct
        return (
          <circle
            key={code}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={TARGET_COLORS[code]}
            strokeWidth="16"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={offset}
          />
        )
      })}
    </svg>
  )
}

function CelebrateStage({
  privacy,
  onPrivacyChange,
  onNavigate,
  onBack,
  streakOverride,
}: {
  privacy: Privacy
  onPrivacyChange: (v: Privacy) => void
  onNavigate: () => void | Promise<void>
  onBack: () => void
  streakOverride?: number | null
}) {
  const [streak, setStreak] = useState<number | null>(streakOverride ?? null)
  const [todayCount, setTodayCount] = useState<number | null>(null)
  const [targetSegments, setTargetSegments] = useState<{ code: TargetCode; count: number; pct: number }[]>([])
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [saving, setSaving] = useState(false)
  // 首次回饋問卷：尚未填過 → 結束練習時先跳問卷
  const [feedbackNeeded, setFeedbackNeeded] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const userId = session.user.id
      const today = isoLocalDate(todayDate())

      const [allDatesRes, todayRes] = await Promise.all([
        supabase
          .from('gratitude_entries')
          .select('entry_date')
          .eq('user_id', userId)
          .order('entry_date', { ascending: false }),
        supabase
          .from('gratitude_entries')
          .select('id', { count: 'exact' })
          .eq('user_id', userId)
          .eq('entry_date', today),
      ])

      if (cancelled) return

      if (streakOverride == null) {
        setStreak(streakFromDates((allDatesRes.data ?? []).map((e) => String(e.entry_date))))
      }
      setTodayCount(todayRes.count ?? 0)

      const tagsRes = await supabase
        .from('gratitude_entries')
        .select('target_1, target_2, target_3')
        .eq('user_id', userId)
      if (cancelled) return

      const counts: Partial<Record<TargetCode, number>> = {}
      for (const row of tagsRes.data ?? []) {
        for (const val of [row.target_1, row.target_2, row.target_3]) {
          if (val) counts[val as TargetCode] = (counts[val as TargetCode] ?? 0) + 1
        }
      }
      const total = Object.values(counts).reduce((s, v) => s + v, 0)
      if (total > 0) {
        const segs = (Object.entries(counts) as [TargetCode, number][])
          .sort((a, b) => b[1] - a[1])
          .map(([code, count]) => ({ code, count, pct: count / total }))
        setTargetSegments(segs)
      }
    })()
    return () => { cancelled = true }
  }, [streakOverride])

  // 是否需要顯示首次回饋問卷：查 first_feedback 有沒有這個人的紀錄。
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('first_feedback')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (!cancelled) setFeedbackNeeded(!data)
    })()
    return () => { cancelled = true }
  }, [])

  const topCode = targetSegments[0]?.code ?? null
  const insight = topCode ? TARGET_INSIGHT[topCode] : null

  const handleNavigate = async () => {
    if (saving) return
    // 第一次完成練習：先跳三題回饋問卷，答完再離開。
    if (feedbackNeeded) {
      setShowFeedback(true)
      return
    }
    setSaving(true)
    await onNavigate()
  }

  const handleFeedbackDone = async () => {
    setShowFeedback(false)
    setFeedbackNeeded(false)
    setSaving(true)
    await onNavigate()
  }

  return (
    <div className="animate-fade-up mx-auto flex max-w-3xl flex-col items-center px-6 pt-8 pb-12 md:px-10">
      {/* 返回鍵：回到 AI 日記頁面查看（唯讀，不重新生成） */}
      <button
        onClick={onBack}
        className="mb-3 flex h-9 w-9 items-center justify-center self-start rounded-full bg-card text-foreground shadow-soft transition active:scale-90"
        aria-label="返回查看 AI 日記"
      >
        <BackIcon />
      </button>

      <div className="celebrate-pop mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-primary text-5xl shadow-soft">
        🎉
      </div>
      <h2 className="mb-2 text-center text-2xl font-extrabold text-foreground">
        今日感恩練習完成！
      </h2>
      <p className="mb-6 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        願意停下來留意身邊的美好，這份覺察本身就是一份很大的禮物。
      </p>

      {/* 6-A 完成統計 */}
      <div className="mb-6 flex w-full gap-3">
        <div className="flex flex-1 flex-col items-center rounded-2xl bg-card px-4 py-3 shadow-soft">
          <span className="text-xl font-extrabold text-primary">
            {todayCount !== null ? todayCount : '—'}
          </span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            今日完成
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center rounded-2xl bg-card px-4 py-3 shadow-soft">
          <span className="text-xl font-extrabold text-primary">
            {streak !== null ? streak : '—'} 🔥
          </span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            連續紀錄
          </span>
        </div>
      </div>

      {/* PERMA 加分 */}
      <div className="mb-6 w-full rounded-3xl bg-card p-6 shadow-soft">
        <p className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
          練習後 PERMA 加分
        </p>
        <div className="flex flex-col gap-5">
          {PERMA_BOOSTS.map(({ label, delta, bar, description }, i) => (
            <div
              key={label}
              className="celebrate-row flex flex-col gap-2"
              style={{ animationDelay: `${0.15 + i * 0.18}s` }}
            >
              <div className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-sm font-extrabold text-foreground">
                  {label}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${bar} celebrate-bar`}
                    style={{ width: `${(delta / 3) * 100}%`, animationDelay: `${0.25 + i * 0.18}s` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-extrabold text-primary">
                  +{delta}
                </span>
              </div>
              <p className="pl-[68px] text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 6-B 感恩對象地圖 */}
      <div className="mb-6 w-full rounded-3xl bg-card p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
            感恩對象地圖
          </p>
          <button
            onClick={() => setShowInfoModal(true)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-xs font-bold text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            ?
          </button>
        </div>
        <div className="flex items-center gap-5">
          <DonutChart segments={targetSegments} />
          <div className="flex flex-1 flex-col gap-2">
            {targetSegments.length === 0 ? (
              <p className="text-xs text-muted-foreground">完成更多練習後，這裡會顯示你的感恩對象分佈。</p>
            ) : (
              <>
                {targetSegments.map(({ code, pct }) => {
                  const meta = TARGET_META[code]
                  return (
                    <div key={code} className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: TARGET_COLORS[code] }}
                      />
                      <span className="flex-1 text-xs text-foreground/80">
                        {meta.emoji} {meta.label}
                      </span>
                      <span className="text-xs font-bold text-foreground">
                        {Math.round(pct * 100)}%
                      </span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
        {insight && (
          <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            {insight}
          </p>
        )}
      </div>

      {/* 6-C 隱私設定 */}
      <div className="mb-7 w-full rounded-3xl bg-card px-5 py-4 shadow-soft">
        <p className="text-sm font-extrabold text-foreground">隱私設定</p>
        <div className="mt-3 flex flex-col gap-2">
          {PRIVACY_OPTIONS.map((opt) => {
            const active = privacy === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onPrivacyChange(opt.value)}
                aria-pressed={active}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-muted/40 hover:bg-muted'
                }`}
              >
                <span className="text-lg leading-none">{opt.emoji}</span>
                <span className="flex-1">
                  <span className={`block text-sm font-bold ${active ? 'text-primary' : 'text-foreground'}`}>
                    {opt.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {opt.hint}
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

      {/* 6-D 結束練習按鈕 */}
      <div className="flex w-full flex-col gap-3">
        <button
          onClick={() => handleNavigate()}
          disabled={saving}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-primary text-sm font-extrabold tracking-[0.15em] text-white shadow-soft transition active:scale-[0.98] disabled:opacity-60"
        >
          ✅ 結束今天練習
        </button>
      </div>

      {/* 首次回饋問卷（一題一題問，答完才離開） */}
      {showFeedback && <FirstFeedbackSurvey onDone={handleFeedbackDone} />}

      {/* "?" 說明 Modal */}
      {showInfoModal && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          onClick={() => setShowInfoModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-card p-6 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-extrabold text-foreground">感恩對象的心理學意義</p>
              <button
                onClick={() => setShowInfoModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {(Object.entries(TARGET_INFO) as [TargetCode, { title: string; desc: string }][]).map(([, info]) => (
                <div key={info.title}>
                  <p className="text-xs font-extrabold text-foreground">{info.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{info.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
