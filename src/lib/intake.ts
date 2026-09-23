// ─────────────────────────────────────────────────────────────────────────
// 入門偏好問卷（Intake）— 題目定義與純函式。
//
// 歡迎導覽之後、InMind 測驗之前的 11 題點選問卷，由 Boaba 教練「陪你填」：
// 每題一句教練台詞（coach）、一張 Boaba 插圖（hero）、選項附圖示（icon）。
// 回答「為什麼來、想要什麼、能給多少、你是誰」；InMind 負責「狀態長什麼樣」
// （PERMA 分數），兩者互補。題目與選項 value 對應 supabase/intake.sql 的欄位；
// 設計理由與參考 App 見 docs/plans/intake_persona_survey_plan.md。
//
// 這裡只放資料與純函式，畫面在 src/routes/intake.tsx，圖示在
// src/components/intake/icons.tsx。
// ─────────────────────────────────────────────────────────────────────────

export type IntakeQuestionKey =
  | 'issues' | 'load' | 'goal' | 'tried' | 'counseling' | 'minutes' | 'format' | 'remind'
  | 'identity' | 'occupation' | 'age'

/** 插圖鍵：對應 src/routes/intake.tsx 裡的 HERO 圖片表 */
export type IntakeHero =
  | 'floating' | 'sleepy' | 'stars' | 'juggle' | 'chat' | 'flowers' | 'wave' | 'night' | 'hat'
  | 'badge' | 'star-head'

export interface IntakeOption {
  value: string
  /** 畫面文字（繁中原文，顯示時再過 t()） */
  label: string
  /** 圖示鍵（見 icons.tsx）；沒有圖示時用 badge 文字 */
  icon?: string
  /** 圖示位置改放短文字（例：「3'」「25–34」） */
  badge?: string
}

export interface IntakeQuestion {
  key: IntakeQuestionKey
  /** 頂部小標，把 9 題分成三段（比照 BetterMe 的 About You / Habits …） */
  section: string
  /** Boaba 教練的台詞（對話泡泡） */
  coach: string
  /** 題目本身（無障礙標題、分析用） */
  title: string
  /** 泡泡下方的小提示，例如「最多選 2 個」 */
  hint?: string
  hero: IntakeHero
  multi?: boolean
  max?: number
  /** 多選時「互斥」的選項：選了它就清掉其他、選其他就清掉它（例：沒特別做過） */
  exclusive?: string
  options: IntakeOption[]
}

export const INTAKE_VERSION = 3

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    key: 'issues',
    section: '認識你',
    coach: '先聊聊，最近是什麼讓你想來健心房的？',
    title: '最近是什麼讓你想打開這個 App？',
    hint: '最多選 2 個',
    hero: 'floating',
    multi: true,
    max: 2,
    options: [
      { value: 'stress', label: '壓力爆表', icon: 'flame' },
      { value: 'mood', label: '情緒起伏大', icon: 'wave' },
      { value: 'sleep', label: '睡不好', icon: 'moon' },
      { value: 'relationship', label: '關係卡住', icon: 'link' },
      { value: 'direction', label: '提不起勁、找不到方向', icon: 'compass' },
      { value: 'self', label: '想更認識自己', icon: 'search' },
      { value: 'curious', label: '只是好奇看看', icon: 'eye' },
    ],
  },
  {
    key: 'load',
    section: '認識你',
    coach: '這陣子的你，大概是哪一種狀態？沒有標準答案。',
    title: '現在的你比較像？',
    hero: 'sleepy',
    options: [
      { value: 'ok', label: '還撐得住，想先預防', icon: 'shield' },
      { value: 'tired', label: '有點累，想調整一下', icon: 'battery' },
      { value: 'hard', label: '蠻辛苦的，需要一些支持', icon: 'umbrella' },
      { value: 'unsure', label: '說不上來', icon: 'question' },
    ],
  },
  {
    key: 'goal',
    section: '認識你',
    coach: '那你希望我在這裡幫你做到什麼？',
    title: '你希望這裡幫你做到什麼？',
    hero: 'stars',
    options: [
      { value: 'habit', label: '每天有個小習慣穩住自己', icon: 'calendar' },
      { value: 'emotion', label: '學會處理某種情緒', icon: 'heart' },
      { value: 'partner', label: '有專業夥伴陪我走一段', icon: 'people' },
      { value: 'track', label: '記錄下來，看見自己的變化', icon: 'chart' },
    ],
  },
  {
    key: 'tried',
    section: '生活習慣',
    coach: '以前有試過哪些照顧自己的方法嗎？',
    title: '你之前試過哪些方式？',
    hint: '可以複選',
    hero: 'juggle',
    multi: true,
    exclusive: 'none',
    options: [
      { value: 'journal', label: '寫日記', icon: 'pen' },
      { value: 'meditation', label: '冥想或呼吸練習', icon: 'wind' },
      { value: 'exercise', label: '運動', icon: 'run' },
      { value: 'friends', label: '找朋友聊', icon: 'chat' },
      { value: 'none', label: '沒特別做過', icon: 'ban' },
    ],
  },
  {
    key: 'counseling',
    section: '生活習慣',
    coach: '想多問一句：你有心理諮詢或教練晤談的經驗嗎？這題只是想更了解你，不會影響你能不能用這個 App。',
    title: '你有心理諮詢或教練晤談的經驗嗎？',
    hero: 'chat',
    options: [
      { value: 'current_counseling', label: '目前有心理師，正在定期晤談', icon: 'sofa' },
      { value: 'past_counseling', label: '以前找過心理師，現在沒有', icon: 'clock' },
      { value: 'coaching', label: '找過教練（生涯、人生教練等）', icon: 'compass' },
      { value: 'both', label: '心理師和教練都找過', icon: 'layers' },
      { value: 'interested', label: '沒試過，但有興趣', icon: 'sparkles' },
      { value: 'no', label: '沒試過，也還沒想過', icon: 'ban' },
    ],
  },
  {
    key: 'minutes',
    section: '生活習慣',
    coach: '一天大概能留多少時間給自己？我照這個幫你排。',
    title: '一天能留給自己多久？',
    hero: 'flowers',
    options: [
      { value: '3', label: '3 分鐘', badge: "3'" },
      { value: '5', label: '5 分鐘', badge: "5'" },
      { value: '10', label: '10 分鐘以上', badge: "10'+" },
      { value: '0', label: '看那天心情', icon: 'shuffle' },
    ],
  },
  {
    key: 'format',
    section: '生活習慣',
    coach: '練習的方式，你比較喜歡哪一種？',
    title: '你比較喜歡哪種練習方式？',
    hero: 'wave',
    options: [
      { value: 'write', label: '寫下來', icon: 'pen' },
      { value: 'listen', label: '聽引導', icon: 'headphones' },
      { value: 'tap', label: '點選就好，不想打字', icon: 'tap' },
      { value: 'any', label: '都可以', icon: 'sparkles' },
    ],
  },
  {
    key: 'remind',
    section: '生活習慣',
    coach: '要不要我在固定時間提醒你？選一個最順手的時段。',
    title: '想在什麼時候收到練習提醒？',
    hero: 'night',
    options: [
      { value: 'morning', label: '早上出門前', icon: 'sunrise' },
      { value: 'noon', label: '午休', icon: 'sun' },
      { value: 'night', label: '睡前', icon: 'moon' },
      { value: 'none', label: '先不用', icon: 'bell-off' },
    ],
  },
  {
    key: 'identity',
    section: '關於你',
    coach: '最後幾題，讓我更了解你一點。你現在主要是？',
    title: '你現在的身份主要是？',
    hero: 'hat',
    options: [
      { value: 'student', label: '學生', icon: 'book' },
      { value: 'worker', label: '上班族', icon: 'briefcase' },
      { value: 'caregiver', label: '照顧者或家長', icon: 'home' },
      { value: 'freelancer', label: '自由工作者', icon: 'laptop' },
      { value: 'other', label: '其他', icon: 'dots' },
    ],
  },
  {
    key: 'occupation',
    section: '關於你',
    coach: '你的工作領域大概是？之後幫你配對專業夥伴也用得上。',
    title: '你的職業類別是？',
    hero: 'badge',
    options: [
      { value: 'student', label: '學生', icon: 'book' },
      { value: 'tech', label: '科技／工程', icon: 'laptop' },
      { value: 'medical', label: '醫療／護理', icon: 'cross' },
      { value: 'education', label: '教育', icon: 'graduation' },
      { value: 'business', label: '金融／商業', icon: 'briefcase' },
      { value: 'service', label: '服務／零售', icon: 'store' },
      { value: 'creative', label: '藝術／設計／媒體', icon: 'palette' },
      { value: 'helping', label: '社工／助人工作', icon: 'people' },
      { value: 'other', label: '其他', icon: 'dots' },
    ],
  },
  {
    key: 'age',
    section: '關於你',
    coach: '你的年齡層大概是？這題只用來讓練習內容更貼近你。',
    title: '你的年齡層是？',
    hero: 'star-head',
    options: [
      { value: '18-24', label: '18–24 歲', badge: '18+' },
      { value: '25-34', label: '25–34 歲', badge: '25+' },
      { value: '35-44', label: '35–44 歲', badge: '35+' },
      { value: '45+', label: '45 歲以上', badge: '45+' },
    ],
  },
]

/** 作答狀態：每題都存陣列，單選就是長度 ≤ 1，省得兩套型別。 */
export type IntakeAnswers = Record<IntakeQuestionKey, string[]>

export const EMPTY_INTAKE_ANSWERS: IntakeAnswers = {
  issues: [], load: [], goal: [], tried: [], counseling: [], minutes: [], format: [], remind: [],
  identity: [], occupation: [], age: [],
}

/** 對應 user_intake 表的一列（不含 user_id / 時間欄位）。 */
export interface IntakeRow {
  issues: string[]
  load_level: string | null
  goal: string | null
  tried: string[]
  counseling_status: string | null
  daily_minutes: number | null
  format_pref: string | null
  remind_slot: string | null
  identity: string | null
  occupation: string | null
  age_band: string | null
  version: number
  skipped: boolean
}

export function answersToRow(a: IntakeAnswers): IntakeRow {
  const minutes = a.minutes[0]
  const skipped = (Object.keys(a) as IntakeQuestionKey[]).every((k) => a[k].length === 0)
  return {
    issues: a.issues,
    load_level: a.load[0] ?? null,
    goal: a.goal[0] ?? null,
    tried: a.tried,
    counseling_status: a.counseling[0] ?? null,
    daily_minutes: minutes === undefined ? null : Number(minutes),
    format_pref: a.format[0] ?? null,
    remind_slot: a.remind[0] ?? null,
    identity: a.identity[0] ?? null,
    occupation: a.occupation[0] ?? null,
    age_band: a.age[0] ?? null,
    version: INTAKE_VERSION,
    skipped,
  }
}

// ── 第一個練習 ────────────────────────────────────────────────────────────
// 問卷完成頁要立刻給一個「先幫你排了…」的練習，讓答案有即時回報。
// 這是最簡單的規則版；首頁每日推薦（recommend.ts）接入問卷權重是下一步。

export interface FirstPractice {
  key: 'gratitude' | 'self-compassion' | 'woop' | 'process-goal'
  name: string
  to: '/app/gratitude' | '/app/self-compassion' | '/app/woop' | '/app/process-goal'
}

const PRACTICE: Record<FirstPractice['key'], FirstPractice> = {
  gratitude: { key: 'gratitude', name: '感恩日記', to: '/app/gratitude' },
  'self-compassion': { key: 'self-compassion', name: '自我慈悲', to: '/app/self-compassion' },
  woop: { key: 'woop', name: 'WOOP 目標實踐', to: '/app/woop' },
  'process-goal': { key: 'process-goal', name: '過程目標覺察', to: '/app/process-goal' },
}

export function suggestFirstPractice(a: IntakeAnswers): FirstPractice {
  const goal = a.goal[0]
  const minutes = a.minutes[0]
  // 想處理情緒 → 自我慈悲；蠻辛苦的人也先從溫柔的練習開始。
  if (goal === 'emotion' || a.load[0] === 'hard') return PRACTICE['self-compassion']
  // 找不到方向 → WOOP（把想要的事變成可以做的計畫）。
  if (a.issues.includes('direction')) return PRACTICE.woop
  // 只有 3 分鐘 → 三分鐘的過程目標覺察。
  if (minutes === '3') return PRACTICE['process-goal']
  // 其餘（想養小習慣、想記錄變化、想找夥伴、沒填）→ 感恩日記，免費核心、最好上手。
  return PRACTICE.gratitude
}

/** 選完「目標」後 Boaba 插話的一句（BetterMe 在 Habits 段落中間插入個人化文案的做法）。 */
export function goalNote(goal: string | undefined): string {
  switch (goal) {
    case 'habit':
      return '想每天有個小習慣穩住自己，這是最好上手的目標。我會先幫你排五分鐘就能完成的練習。'
    case 'emotion':
      return '想學會處理情緒，很棒的起點。我會先帶你做溫柔一點的練習，再慢慢加強度。'
    case 'partner':
      return '想有專業夥伴陪你走一段。這裡有心理師設計的模組，我先讓你熟悉基本練習，之後再帶你認識夥伴。'
    case 'track':
      return '想記錄並看見自己的變化，那每週回顧會是你的好朋友。我們先從每天一點點開始累積。'
    default:
      return '沒關係，不確定也可以。我先幫你排最容易上手的練習，做著做著方向會慢慢清楚。'
  }
}
