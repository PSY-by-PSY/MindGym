// ─────────────────────────────────────────────────────────────────────────
// 每日練習推薦 — 由「心理肌肉雷達圖」（PERMA 分數）決定今天推哪個練習。
//
// 原則（對應產品需求）：
//   - 每天優先推薦雷達圖中較缺乏的維度所對應的練習。
//   - 情緒力(P)低 → 三件好事 / 感恩日記；投入力(E)低 → 過程目標覺察；
//     意義力(M)低 → 感恩日記 / 過程目標覺察。
//   - 其他練習不是不推，而是出現頻率較低；原則上每天一個練習。
//   - 以日期做輕量輪替，讓一週內較有機會練到不同練習（完整的「一週覆蓋」
//     排程之後再迭代）。
//
// 這裡只是純函式，沒有副作用，方便單獨測試與之後擴充。
// ─────────────────────────────────────────────────────────────────────────

export type PracticeKey = 'gratitude' | 'three-good-things' | 'process-goal'
export type PermaLetter = 'P' | 'E' | 'R' | 'M' | 'A'

export type PermaScoreRow = {
  p_score?: number | null
  e_score?: number | null
  r_score?: number | null
  m_score?: number | null
  a_score?: number | null
}

export type Recommendation = {
  key: PracticeKey
  name: string
  emoji: string
  to: string
  search?: Record<string, string>
  /** 一句話：為什麼今天推薦這個練習 */
  reason: string
  /** 顯示用的 PERMA 標籤，例：['P 情緒力', 'M 意義力'] */
  permaTags: string[]
}

const DIM_LABEL: Record<PermaLetter, string> = {
  P: '情緒力',
  E: '投入力',
  R: '連結力',
  M: '意義力',
  A: '成就力',
}

const SCORE_KEY: Record<PermaLetter, keyof PermaScoreRow> = {
  P: 'p_score',
  E: 'e_score',
  R: 'r_score',
  M: 'm_score',
  A: 'a_score',
}

type PracticeMeta = {
  key: PracticeKey
  name: string
  emoji: string
  to: string
  search?: Record<string, string>
  /** 各 PERMA 維度的對應強度（1=主要對應、0.5=部分對應） */
  targets: Partial<Record<PermaLetter, number>>
  /** 目前是否已實作可用；未上架者不會被選為「今日練習」 */
  available: boolean
}

const PRACTICES: PracticeMeta[] = [
  {
    key: 'gratitude',
    name: '感恩日記',
    emoji: '⭐',
    to: '/app/gratitude',
    targets: { P: 1, R: 1, M: 1 },
    available: true,
  },
  {
    key: 'process-goal',
    name: '過程目標覺察',
    emoji: '🔍',
    to: '/app/process-goal',
    targets: { E: 1, M: 1, A: 1 },
    available: true,
  },
  {
    key: 'three-good-things',
    name: '三件好事',
    emoji: '☑️',
    to: '/app/placeholder',
    search: { name: '三件好事' },
    targets: { P: 1, A: 1 },
    available: false, // 尚未實作，待 prompt 補上後改 true
  },
]

const DIMS: PermaLetter[] = ['P', 'E', 'R', 'M', 'A']

/** 缺乏程度：分數越低越缺乏（5 分制 → 5-score）。無分數時視為中性 2.5。 */
function weakness(scores: PermaScoreRow | null, dim: PermaLetter): number {
  const raw = scores?.[SCORE_KEY[dim]]
  const s = typeof raw === 'number' && raw > 0 ? raw : 2.5
  return 5 - s
}

/** 一個 0~1 之間、隨「天」變動的小輪替值，用來在分數接近時讓推薦有變化。 */
function rotation(date: Date, idx: number, n: number): number {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000,
  )
  return ((dayOfYear + idx) % Math.max(1, n)) / (n * 100) // 很小，只當 tiebreak
}

/**
 * 依雷達圖分數挑出今天的推薦練習。
 * @param scores 最新一筆 PERMA 分數（可為 null → 退回預設）
 * @param date   以哪一天計算（預設今天），用於輕量輪替
 */
export function recommendPractice(
  scores: PermaScoreRow | null,
  date: Date = new Date(),
): Recommendation {
  const pool = PRACTICES.filter((p) => p.available)
  const n = pool.length

  const scored = pool.map((p, idx) => {
    let total = 0
    let bestDim: PermaLetter = 'P'
    let bestContribution = -Infinity
    for (const dim of DIMS) {
      const w = p.targets[dim]
      if (!w) continue
      const contribution = w * weakness(scores, dim)
      total += contribution
      if (contribution > bestContribution) {
        bestContribution = contribution
        bestDim = dim
      }
    }
    return { p, total: total + rotation(date, idx, n), bestDim }
  })

  scored.sort((a, b) => b.total - a.total)
  const winner = scored[0]

  const permaTags = DIMS.filter((d) => winner.p.targets[d]).map((d) => `${d} ${DIM_LABEL[d]}`)

  return {
    key: winner.p.key,
    name: winner.p.name,
    emoji: winner.p.emoji,
    to: winner.p.to,
    search: winner.p.search,
    reason: scores
      ? `你的「${DIM_LABEL[winner.bestDim]}」目前較需要加強，今天為你安排「${winner.p.name}」`
      : `先從「${winner.p.name}」開始，建立每天健心的節奏`,
    permaTags,
  }
}
