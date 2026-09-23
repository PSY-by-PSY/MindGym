// ─────────────────────────────────────────────────────────────────────────
// 入門偏好問卷（Intake）— 題目定義與純函式。
//
// 歡迎導覽之後、InMind 測驗之前的 6 題點選問卷，回答「為什麼來、想要什麼、
// 能給多少」。InMind 負責「狀態長什麼樣」（PERMA 分數），兩者互補。
// 題目與選項 value 對應 supabase/intake.sql 的欄位；設計理由見
// docs/plans/intake_persona_survey_plan.md。
//
// 這裡只放資料與純函式，畫面在 src/routes/intake.tsx。
// ─────────────────────────────────────────────────────────────────────────

export type IntakeQuestionKey = 'issues' | 'load' | 'goal' | 'tried' | 'minutes' | 'format'

export interface IntakeOption {
  value: string
  /** 畫面文字（繁中原文，顯示時再過 t()） */
  label: string
}

export interface IntakeQuestion {
  key: IntakeQuestionKey
  title: string
  /** 題目下方的小提示，例如「最多選 2 個」 */
  hint?: string
  multi?: boolean
  /** 多選上限（multi 才有意義） */
  max?: number
  /** 多選時「互斥」的選項：選了它就清掉其他、選其他就清掉它（例：沒特別做過） */
  exclusive?: string
  options: IntakeOption[]
}

export const INTAKE_VERSION = 1

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    key: 'issues',
    title: '最近是什麼讓你想打開這個 App？',
    hint: '最多選 2 個',
    multi: true,
    max: 2,
    options: [
      { value: 'stress', label: '壓力爆表' },
      { value: 'mood', label: '情緒起伏大' },
      { value: 'sleep', label: '睡不好' },
      { value: 'relationship', label: '關係卡住' },
      { value: 'direction', label: '提不起勁、找不到方向' },
      { value: 'self', label: '想更認識自己' },
      { value: 'curious', label: '只是好奇看看' },
    ],
  },
  {
    key: 'load',
    title: '現在的你比較像？',
    options: [
      { value: 'ok', label: '還撐得住，想先預防' },
      { value: 'tired', label: '有點累，想調整一下' },
      { value: 'hard', label: '蠻辛苦的，需要一些支持' },
      { value: 'unsure', label: '說不上來' },
    ],
  },
  {
    key: 'goal',
    title: '你希望這裡幫你做到什麼？',
    options: [
      { value: 'habit', label: '每天有個小習慣穩住自己' },
      { value: 'emotion', label: '學會處理某種情緒' },
      { value: 'partner', label: '有專業夥伴陪我走一段' },
      { value: 'track', label: '記錄下來，看見自己的變化' },
    ],
  },
  {
    key: 'tried',
    title: '你之前試過哪些方式？',
    hint: '可以複選',
    multi: true,
    exclusive: 'none',
    options: [
      { value: 'journal', label: '寫日記' },
      { value: 'meditation', label: '冥想或呼吸練習' },
      { value: 'exercise', label: '運動' },
      { value: 'friends', label: '找朋友聊' },
      { value: 'consult', label: '心理諮詢或晤談' },
      { value: 'none', label: '沒特別做過' },
    ],
  },
  {
    key: 'minutes',
    title: '一天能留給自己多久？',
    options: [
      { value: '3', label: '3 分鐘' },
      { value: '5', label: '5 分鐘' },
      { value: '10', label: '10 分鐘以上' },
      { value: '0', label: '看那天心情' },
    ],
  },
  {
    key: 'format',
    title: '你比較喜歡哪種練習方式？',
    options: [
      { value: 'write', label: '寫下來' },
      { value: 'listen', label: '聽引導' },
      { value: 'tap', label: '點選就好，不想打字' },
      { value: 'any', label: '都可以' },
    ],
  },
]

/** 作答狀態：每題都存陣列，單選就是長度 ≤ 1，省得兩套型別。 */
export type IntakeAnswers = Record<IntakeQuestionKey, string[]>

export const EMPTY_INTAKE_ANSWERS: IntakeAnswers = {
  issues: [],
  load: [],
  goal: [],
  tried: [],
  minutes: [],
  format: [],
}

/** 對應 user_intake 表的一列（不含 user_id / 時間欄位）。 */
export interface IntakeRow {
  issues: string[]
  load_level: string | null
  goal: string | null
  tried: string[]
  daily_minutes: number | null
  format_pref: string | null
  version: number
  skipped: boolean
}

export function answersToRow(a: IntakeAnswers): IntakeRow {
  const minutes = a.minutes[0]
  const row: IntakeRow = {
    issues: a.issues,
    load_level: a.load[0] ?? null,
    goal: a.goal[0] ?? null,
    tried: a.tried,
    daily_minutes: minutes === undefined ? null : Number(minutes),
    format_pref: a.format[0] ?? null,
    version: INTAKE_VERSION,
    skipped: false,
  }
  row.skipped =
    row.issues.length === 0 &&
    row.load_level === null &&
    row.goal === null &&
    row.tried.length === 0 &&
    row.daily_minutes === null &&
    row.format_pref === null
  return row
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
