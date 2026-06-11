// ── 報告重建 ────────────────────────────────────────────────────────────────
// 舊版 perma_scores 列只存了五大分數、沒有 report_json（完整報告於 2026-06 之後
// 才開始落地）。本模組把後端 app.py 中「依分數決定」的設計模板忠實移植到前端，
// 讓沒有 report_json 的舊測驗也能呈現完整報告。
//
// 注意：individual_analysis 的逐項評語、summary_sentence、celeb_match 原本是
// LLM 依使用者作答即時生成，舊資料沒有保存原始作答，無法 100% 還原；以下對這三項
// 提供「依分數決定」的合理 fallback，確保畫面完整、不再出現空殼或破圖。

import type {
  DimensionKey,
  InMindReport,
  CelebMatch,
} from '../components/pretest/types'

const DIM_LABELS: Record<DimensionKey, string> = {
  P: '情緒力',
  E: '投入力',
  R: '連結力',
  M: '意義力',
  A: '成就力',
}

// 與 app.py DIMENSION_TEMPLATES 對齊
const DIMENSION_TEMPLATES: Record<
  DimensionKey,
  {
    short_term_plan: string
    long_term_plan: string
    daily_practice: string
    next_step_action: string
    partnership_profile: string
    daily_habit: string
    after_3_days: string
    after_1_week: string
    after_2_weeks: string
    after_1_month: string
  }
> = {
  P: {
    short_term_plan: '每晚睡前花 2 分鐘，寫下今天 3 件讓你心情變好的小事，培養感受愉悅的敏銳度。',
    long_term_plan: '建立每週 1-2 次的「情緒充電行程」，重複能讓你愉悅的活動，並嘗試擴展新的快樂來源。',
    daily_practice: '用 1 分鐘深呼吸，回想今天最舒服的瞬間，讓身體記住那種感覺。',
    next_step_action: '找一個容易感染你好心情的朋友，每週至少一次跟他輕鬆相處 30 分鐘。',
    partnership_profile: '樂觀開朗、容易被生活小事感動、笑點低、會主動分享美好瞬間的人。在你的同事、社群或興趣圈裡留意這種能量正向的人。',
    daily_habit: '每天起床後用 30 秒，回想一件今天值得期待的小事。',
    after_3_days: '你會開始注意到生活中原本被忽略的小確幸。',
    after_1_week: '面對日常壓力時，會更快找回平靜。',
    after_2_weeks: '身邊的人開始說你變得『比較好相處』。',
    after_1_month: '你的情緒底色從中性變得更明亮、更有彈性。',
  },
  E: {
    short_term_plan: '每天挑一個小任務，關掉通知、設定 25 分鐘專注時段，記錄完成後的感受。',
    long_term_plan: '每月嘗試一項新興趣或技能，找出讓你進入「心流」的活動類型。',
    daily_practice: '做事前先問自己：「我可以多投入 5% 嗎？」然後開始。',
    next_step_action: '找一個對某事物極度熱衷的朋友，邀請他帶你體驗他的世界。',
    partnership_profile: '對某個興趣或專業極度投入、聊起來眼睛會發光、能進入心流忘我工作的人。',
    daily_habit: '每天選 1 件事，全程專注做完不分心（手機放抽屜或開飛航模式）。',
    after_3_days: '你會驚訝於自己原本可以做到的效率。',
    after_1_week: '工作中分心被打斷的次數明顯下降。',
    after_2_weeks: '你開始能進入一種「時間飛逝」的專注狀態。',
    after_1_month: '你會找到至少一件能讓你完全沉浸其中的事。',
  },
  R: {
    short_term_plan: '本週主動聯絡 3 個你想念但很久沒聯絡的朋友，問候不需要有目的。',
    long_term_plan: '建立每月固定的「關係維繫日」，安排與重要的人深度相處的時間。',
    daily_practice: '每天傳一則溫暖訊息給某個人，告訴他你的感謝或想念。',
    next_step_action: '本週找一個讓你信任的人，分享一件你最近的真實感受。',
    partnership_profile: '善於傾聽、體貼他人感受、有穩定支持網絡、會記得你重要日子的人。',
    daily_habit: '每天主動向一個人問好或說一句感謝（家人、朋友、同事、店員都行）。',
    after_3_days: '你會發現有人開始更熱情地回應你。',
    after_1_week: '你會收到至少一個溫暖的回饋訊息。',
    after_2_weeks: '你的人際圈會出現一個新的或重新連結的關係。',
    after_1_month: '你會擁有 2-3 個能說真心話的「安全對象」。',
  },
  M: {
    short_term_plan: '每週寫下一個「為什麼我做這件事」，找出日常選擇背後的價值觀。',
    long_term_plan: '撰寫個人使命宣言，每月檢視自己的行動是否與真正在乎的事一致。',
    daily_practice: '睡前問自己：「今天有哪一刻覺得自己活得像自己？」',
    next_step_action: '本週與一位你欽佩的人聊聊，問問他做事的初衷與動力。',
    partnership_profile: '對人生有清晰使命感、能講出自己的價值觀、行動與信念一致的人。',
    daily_habit: '每天結束前用 1 分鐘問自己：「今天哪件事讓我覺得有意義？」並寫下一句。',
    after_3_days: '你會開始辨認出哪些事情其實只是「習慣」而非「重要」。',
    after_1_week: '你會更勇於拒絕不在乎的事情。',
    after_2_weeks: '你的時間分配會出現微妙但明確的轉移。',
    after_1_month: '你會逐漸構建出屬於自己的人生方向感。',
  },
  A: {
    short_term_plan: '本週設定一個小到不可能失敗的目標，並具體規劃每天怎麼達成。',
    long_term_plan: '每月設定一個 3 個月內可達成的中期目標，追蹤進度與調整方法。',
    daily_practice: '每天睡前寫下一件今天完成的事，再小都算。',
    next_step_action: '本週找一位執行力強的朋友，請他見證你的某個目標並定期檢查進度。',
    partnership_profile: '目標導向、執行力強、有自律習慣、能持續推進計畫不放棄的人。',
    daily_habit: '每天早上寫下「今日最重要的 1 件事」並優先完成。',
    after_3_days: '你會開始有「今天有把事情做完」的踏實感。',
    after_1_week: '拖延的次數明顯減少，行動阻力變低。',
    after_2_weeks: '你開始累積出可見的小成果。',
    after_1_month: '你會看見自己離某個目標明顯靠近一大步。',
  },
}

// 與 app.py CELEB_POOL 對齊（單一強項對應的名人，皆有對應 celeb-*.jpg 圖檔）
const CELEB_BY_DIM: Record<DimensionKey, CelebMatch> = {
  R: {
    name: '蔡康永',
    archetype: '同理主持人',
    description: '作家、主持人，以深刻同理心與人際敏感度著稱，擅長傾聽與創造有溫度的對話空間。',
    reason: '',
  },
  E: {
    name: '周杰倫',
    archetype: '心流創作者',
    description: '音樂創作人，對音樂有近乎偏執的專注與投入，多年來持續創造兼具深度與廣度的作品。',
    reason: '',
  },
  A: {
    name: '吳寶春',
    archetype: '意志型匠人',
    description: '世界麵包冠軍，從底層出發、憑藉堅定意志與持續自我突破，成為台灣職人精神的代表。',
    reason: '',
  },
  P: {
    name: '盧廣仲',
    archetype: '陽光創作者',
    description: '創作歌手，作品充滿生活溫度與正向能量，以真摯的生命態度感染許多人。',
    reason: '',
  },
  M: {
    name: '蔣勳',
    archetype: '美學意義家',
    description: '藝術家、作家，畢生探索生命美學與人文意義，引導無數人在日常中找到生命的厚度。',
    reason: '',
  },
}

// app.py compute_body_type
function computeBodyType(total: number): {
  body_type: 'C' | 'I' | 'D'
  body_type_label: string
  body_type_context: string
} {
  if (total <= 10) {
    return {
      body_type: 'C',
      body_type_label: '棉花糖',
      body_type_context:
        '你目前的心理能量可能正處於高內耗的狀態，像棉花糖碰到水一樣，外在承擔了許多，但內部的核心支撐力還需要慢慢建立。現在最重要的是找到一個讓你感到安全的角落，讓自己先好好補充能量。',
    }
  }
  if (total <= 17) {
    return {
      body_type: 'I',
      body_type_label: '吐司',
      body_type_context:
        '你的心理狀態中規中矩、結構穩定，能夠應付日常生活中的挑戰，但在面對更複雜的困境時，還有更多彈性可以被開發。就像一片吐司，加上不同的配料和鍛鍊，你可以變得更豐富有力。',
    }
  }
  return {
    body_type: 'D',
    body_type_label: '貝果',
    body_type_context:
      '你目前的心理狀態紮實而有韌性，像貝果一樣經得起外在壓力的考驗。五大指數都在高水位，你的心理核心肌力強健，具備高度的反脆弱性。繼續保持這份紮實，並將這股力量傳遞給身邊的人。',
  }
}

// app.py compute_balance
function computeBalance(scores: Record<DimensionKey, number>) {
  const entries = Object.entries(scores) as [DimensionKey, number][]
  const max_dim = entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  const min_dim = entries.reduce((a, b) => (b[1] < a[1] ? b : a))[0]
  const delta = Math.round((scores[max_dim] - scores[min_dim]) * 100) / 100
  const maxL = DIM_LABELS[max_dim]
  const minL = DIM_LABELS[min_dim]
  const d = delta.toFixed(1)

  if (delta > 2) {
    return {
      max_dim,
      min_dim,
      delta,
      level: 'unbalanced' as const,
      assessment: `你的「${maxL}」與「${minL}」之間落差達 ${d} 分，顯示五大指數分佈較不均衡，部分面向需要優先強化。`,
      advice: `建議優先關注「${minL}」，每天花 5 分鐘進行一個針對此面向的微型練習，持續累積就會看到變化。`,
    }
  }
  if (delta >= 1) {
    return {
      max_dim,
      min_dim,
      delta,
      level: 'moderate' as const,
      assessment: `各指數之間有一定落差（${d} 分），整體均衡度中等。「${minL}」仍有明顯的成長空間。`,
      advice: `試著在本週為「${minL}」安排一項具體的小行動，讓五大指數更趨均衡發展。`,
    }
  }
  return {
    max_dim,
    min_dim,
    delta,
    level: 'balanced' as const,
    assessment: `你的五大指數分佈相當均衡，最大差距僅 ${d} 分。心理幸福力的各個面向發展健康而全面。`,
    advice: '繼續維持這樣均衡的生活型態！均衡的心理幸福力往往比單一面向的高峰更加持久且穩健。',
  }
}

// app.py _normal_cdf / compute_percentile
function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

function normalCdf(x: number, mu: number, sigma: number): number {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)))
}

function computePercentile(total: number) {
  const general = Math.round(normalCdf(total, 14.0, 3.5) * 100)
  const youth = Math.round(normalCdf(total, 13.0, 3.8) * 100)
  return {
    general: Math.max(1, Math.min(99, general)),
    youth: Math.max(1, Math.min(99, youth)),
  }
}

// app.py build_advanced_analysis
function buildAdvancedAnalysis(weak_dim: DimensionKey, max_dim: DimensionKey) {
  const tpl = DIMENSION_TEMPLATES[weak_dim]
  const weakL = DIM_LABELS[weak_dim]
  const maxL = DIM_LABELS[max_dim]
  return {
    complementary_dim: weak_dim,
    synergy_explanation:
      `你優勢的「${maxL}」能為關係注入價值與動力，` +
      `而對方強大的「${weakL}」能補足你最不足的部分，` +
      `兩種特質結合能讓你們彼此撐持、互相填滿。`,
    next_step_action: tpl.next_step_action,
    partnership_profile: tpl.partnership_profile,
  }
}

// 逐項評語 fallback（LLM 原文不可還原，依分數高低給出合理敘述）
function buildIndividualAnalysis(scores: Record<DimensionKey, number>) {
  const out = {} as InMindReport['individual_analysis']
  ;(Object.keys(scores) as DimensionKey[]).forEach((k) => {
    const label = DIM_LABELS[k]
    const s = scores[k]
    let comment: string
    if (s >= 4) {
      comment = `你的「${label}」表現亮眼，是你目前最穩固的心理資源。好好善用並維持它，它會成為你面對挑戰時的底氣。`
    } else if (s >= 2.5) {
      comment = `你的「${label}」處於中等水準，已有不錯的基礎，再多一點刻意練習就能明顯往上提升。`
    } else {
      comment = `你的「${label}」目前較為不足，但這也是最值得優先投入、最容易看見成長的面向。`
    }
    out[k] = {
      score_reason: '',
      comment,
      exercise_suggestion: DIMENSION_TEMPLATES[k].daily_practice,
    }
  })
  return out
}

/**
 * 從只有五大分數的舊資料重建一份完整報告。
 * individual_analysis / summary_sentence / celeb_match 為依分數決定的合理 fallback。
 */
export function reconstructReportFromScores(row: {
  p_score: number
  e_score: number
  r_score: number
  m_score: number
  a_score: number
}): InMindReport {
  const scores: Record<DimensionKey, number> = {
    P: row.p_score,
    E: row.e_score,
    R: row.r_score,
    M: row.m_score,
    A: row.a_score,
  }
  const total_score = Math.round(Object.values(scores).reduce((s, v) => s + v, 0) * 100) / 100

  const bodyType = computeBodyType(total_score)
  const balance = computeBalance(scores)
  const percentile = computePercentile(total_score)
  const weak_dim = balance.min_dim
  const max_dim = balance.max_dim

  const tplWeak = DIMENSION_TEMPLATES[weak_dim]
  const constitution_advice = {
    weak_dim,
    short_term_plan: tplWeak.short_term_plan,
    long_term_plan: tplWeak.long_term_plan,
    daily_practice: tplWeak.daily_practice,
  }
  const take_action = {
    daily_habit: tplWeak.daily_habit,
    after_3_days: tplWeak.after_3_days,
    after_1_week: tplWeak.after_1_week,
    after_2_weeks: tplWeak.after_2_weeks,
    after_1_month: tplWeak.after_1_month,
  }

  const maxL = DIM_LABELS[max_dim]
  const celebBase = CELEB_BY_DIM[max_dim]
  const celeb_match: CelebMatch = {
    ...celebBase,
    reason: `你的 PERMA 強項落在「${maxL}」，與 ${celebBase.name}（${celebBase.archetype}）的特質最為相近。`,
  }

  return {
    scores,
    individual_analysis: buildIndividualAnalysis(scores),
    total_score,
    body_type: bodyType.body_type,
    body_type_label: bodyType.body_type_label,
    body_type_context: bodyType.body_type_context,
    balance,
    percentile,
    summary_sentence: `你的整體幸福體質偏向「${maxL}」，這是你最閃亮的力量；帶著它，繼續把其他面向一起養壯吧。`,
    celeb_match,
    constitution_advice,
    advanced_analysis: buildAdvancedAnalysis(weak_dim, max_dim),
    take_action,
  }
}
