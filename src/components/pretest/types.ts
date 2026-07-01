// ── PERMA Dimension Keys ──────────────────────────────────────────────────────

export type DimensionKey = 'P' | 'E' | 'R' | 'M' | 'A'

export const DIMENSION_ORDER: DimensionKey[] = ['P', 'E', 'R', 'M', 'A']

// ── Dimension Display Config ──────────────────────────────────────────────────

export interface DimensionConfig {
  key: DimensionKey
  label: string
  sublabel: string
  description: string
  question: string
  hints: string[]
  textColor: string
  bgLight: string
  bgMed: string
  borderLight: string
  borderSolid: string
  gradientBar: string
  ring: string
}

export const DIMENSION_CONFIGS: Record<DimensionKey, DimensionConfig> = {
  P: {
    key: 'P',
    label: '情緒力',
    sublabel: 'Positive Emotion',
    description: '感受日常喜悅、享受生命美好時刻的能力。',
    question: '請分享你上一次發自內心感到愉悅的經驗。',
    hints: [
      '那個時刻具體發生了什麼事？',
      '當時你的身體或心理感覺到了什麼？（例如：放鬆、輕盈、心跳加速）',
      '這個愉悅感對你當天後續的狀態有什麼影響？',
    ],
    textColor: 'text-amber-600',
    bgLight: 'bg-amber-500/10',
    bgMed: 'bg-amber-500/20',
    borderLight: 'border-amber-500/30',
    borderSolid: 'border-amber-500',
    gradientBar: 'from-amber-500 to-amber-300',
    ring: 'ring-amber-500/50',
  },
  E: {
    key: 'E',
    label: '投入力',
    sublabel: 'Engagement',
    description: '全神貫注投入一件事、進入心流狀態的能力。',
    question: '請分享你最近一次全神貫注做一件事的感受。',
    hints: [
      '當時你在處理什麼任務？是什麼讓你如此入迷？',
      '在那個過程中，你有感覺到時間流逝的快慢嗎？',
      '結束任務後，你感到的是精神飽滿還是疲憊？',
    ],
    textColor: 'text-cyan-600',
    bgLight: 'bg-cyan-500/10',
    bgMed: 'bg-cyan-500/20',
    borderLight: 'border-cyan-500/30',
    borderSolid: 'border-cyan-500',
    gradientBar: 'from-cyan-500 to-cyan-300',
    ring: 'ring-cyan-500/50',
  },
  R: {
    key: 'R',
    label: '連結力',
    sublabel: 'Relationships',
    description: '與他人建立深刻連結、感受支持與歸屬感的能力。',
    question: '分享一次你在日常生活中感受到被身邊的人支持、被愛的時刻。',
    hints: [
      '他們通常是以什麼方式提供支持？（例如：傾聽理解、付出行動、耐心陪伴）',
      '你上一次向他們尋求支持或分享脆弱是什麼時候？',
      '他們都會如何回應你？這是你滿意的嗎？',
    ],
    textColor: 'text-rose-600',
    bgLight: 'bg-rose-500/10',
    bgMed: 'bg-rose-500/20',
    borderLight: 'border-rose-500/30',
    borderSolid: 'border-rose-500',
    gradientBar: 'from-rose-500 to-rose-300',
    ring: 'ring-rose-500/50',
  },
  M: {
    key: 'M',
    label: '意義力',
    sublabel: 'Meaning',
    description: '找到生命目的、讓行動與內在價值觀一致的能力。',
    question: '在你的生命中，有哪些活動或重要的時刻對你來說是有意義的？',
    hints: [
      '在日常生活中，哪些時刻會讓你覺得「這一切都是值得的」？',
      '你最重視的價值觀是什麼？它如何體現在你的行動中？',
      '如果你可以為這世界留下一點改變，那會是什麼？',
    ],
    textColor: 'text-violet-600',
    bgLight: 'bg-violet-500/10',
    bgMed: 'bg-violet-500/20',
    borderLight: 'border-violet-500/30',
    borderSolid: 'border-violet-500',
    gradientBar: 'from-violet-500 to-violet-300',
    ring: 'ring-violet-500/50',
  },
  A: {
    key: 'A',
    label: '成就力',
    sublabel: 'Accomplishment',
    description: '設定目標、持續推進並看見自身成長的能力。',
    question: '在過去三個月，你覺得你是離你的目標越來越近，還是越來越遠？',
    hints: [
      '是什麼關鍵事件讓你產生「靠近」或「遠離」的感覺？',
      '在追求目標的過程中，你發現自己最具優勢的特質是什麼？',
      '無論遠近，你覺得下一個階段你可以跨出的小小一步是什麼？',
    ],
    textColor: 'text-emerald-600',
    bgLight: 'bg-emerald-500/10',
    bgMed: 'bg-emerald-500/20',
    borderLight: 'border-emerald-500/30',
    borderSolid: 'border-emerald-500',
    gradientBar: 'from-emerald-500 to-emerald-300',
    ring: 'ring-emerald-500/50',
  },
}

// ── API Shapes ────────────────────────────────────────────────────────────────

export interface NarrativeAnswers {
  P: string
  E: string
  R: string
  M: string
  A: string
  // email 欄位移除，因為 App 使用者已登入
}

export interface PermaScores {
  P: number
  E: number
  R: number
  M: number
  A: number
}

export interface DimensionAnalysis {
  score_reason: string
  comment: string
  exercise_suggestion: string
}

export interface BalanceInfo {
  max_dim: DimensionKey
  min_dim: DimensionKey
  delta: number
  level: 'unbalanced' | 'moderate' | 'balanced'
  assessment: string
  advice: string
}

export interface PercentileInfo {
  general: number
  youth: number
}

export interface CelebMatch {
  name: string
  archetype: string
  description: string
  reason: string
}

export interface ConstitutionAdvice {
  weak_dim: string
  short_term_plan: string
  long_term_plan: string
  daily_practice: string
}

export interface AdvancedAnalysis {
  complementary_dim: string
  synergy_explanation: string
  next_step_action: string
  partnership_profile: string
}

export interface TakeActionPlan {
  daily_habit: string
  after_3_days: string
  after_1_week: string
  after_2_weeks: string
  after_1_month: string
}

export interface InMindReport {
  scores: PermaScores
  individual_analysis: Record<DimensionKey, DimensionAnalysis>
  total_score: number
  body_type: 'C' | 'I' | 'D'
  body_type_label: string
  body_type_context: string
  balance: BalanceInfo
  percentile: PercentileInfo
  summary_sentence: string
  celeb_match: CelebMatch
  constitution_advice: ConstitutionAdvice
  advanced_analysis: AdvancedAnalysis
  take_action: TakeActionPlan
}
