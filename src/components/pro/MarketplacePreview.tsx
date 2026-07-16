// 使用者預覽（模組市集）——/admin 與 /therapist 共用的「以使用者視角」分頁。
// 讓管理員與專業夥伴體驗使用者如何探索、收藏、用 credits 預約來自不同專業夥伴的
// 模組（類 Coursera / ClassPass 的市集）。所有互動只動 local state、不寫資料庫；
// 模組與夥伴皆為示意用假資料，正式內容上線後再接真資料。
//
// 資訊架構依 docs/plans/marketplace_style_matching_plan.md：
// 頂層＝個案語言的狀態入口（睡不好/情緒好滿…），服務類型降為次篩選；
// 夥伴有五組風格光譜與多元背景；個案可選期待原型看相符度；部分模組可免費試玩。
import { useState } from 'react'
import { useLanguage } from '../../lib/i18n/context'

// ── icons ───────────────────────────────────────────────────────────────────

export function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function HeartIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  )
}

// ── 示意假資料 ──────────────────────────────────────────────────────────────

const START_CREDITS = 300

type PreviewCategory = 'counseling' | 'coaching' | 'spiritual' | 'assessment'
type EnrollStatus = 'enrolled' | 'applied'

/** 個案語言的狀態入口（頂層分類） */
type IssueKey = 'sleep' | 'mood' | 'stress' | 'relation' | 'direction' | 'loss' | 'self'

const ISSUE_FILTERS: { key: 'all' | IssueKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'sleep', label: '睡不好' },
  { key: 'mood', label: '情緒好滿' },
  { key: 'stress', label: '壓力爆表' },
  { key: 'relation', label: '關係卡住' },
  { key: 'direction', label: '找不到方向' },
  { key: 'loss', label: '重大失落' },
  { key: 'self', label: '想更認識自己' },
]

/** 五組風格光譜（雙方同尺，0 靠左端、100 靠右端） */
const SPECTRUM_DEFS: { left: string; right: string }[] = [
  { left: '陪伴傾聽', right: '主動指引' },
  { left: '溫柔婉轉', right: '直接明快' },
  { left: '慢熱深耕', right: '快速聚焦' },
  { left: '感受優先', right: '思考優先' },
  { left: '任務很少', right: '每週任務' },
]

/** 個案期待原型（預填滑桿用；demo 先只做原型選擇） */
type ArchetypeKey = 'gentle' | 'practical' | 'explore'

const ARCHETYPES: { key: ArchetypeKey; label: string; desc: string; spectrum: number[] }[] = [
  {
    key: 'gentle',
    label: '溫和陪伴型',
    desc: '希望被好好聽懂、慢慢整理感受',
    spectrum: [25, 25, 35, 25, 25],
  },
  {
    key: 'practical',
    label: '實務導向型',
    desc: '想要明確方向、行動計畫和回家任務',
    spectrum: [80, 60, 75, 70, 85],
  },
  {
    key: 'explore',
    label: '深度探索型',
    desc: '想弄懂模式從哪來，願意慢慢挖',
    spectrum: [40, 35, 20, 50, 35],
  },
]

type PreviewModule = {
  id: string
  title: string
  desc: string
  kindLabel: string
  kindCls: string
  category: PreviewCategory
  issues: IssueKey[]
  /** instant：直接扣 credits 加入；apply：先申請、由夥伴確認 */
  mode: 'instant' | 'apply'
  credits: number // 0 = 免費
  duration: string
  rating: number
  ratingCount: number
  joinedCount: number
  includes: string[]
  coverCls: string
  coverEmoji: string
  applyHint?: string
  /** 免費試玩小練習（每位夥伴限一個） */
  trial?: { title: string; minutes: number; prompt: string; feedback: string }
  pro: {
    name: string
    title: string
    tags: string[]
    bio: string
    avatarCls: string
    /** 「我的晤談像…」一句自述 */
    blurb: string
    /** 多元背景標籤（跨領域經歷、語言等） */
    backgrounds: string[]
    /** 五組風格光譜自評 */
    spectrum: number[]
  }
}

const CATEGORY_LABEL: Record<PreviewCategory, string> = {
  counseling: '心理諮詢',
  coaching: '生涯教練',
  spiritual: '身心靈',
  assessment: '測驗量表',
}

const PREVIEW_MODULES: PreviewModule[] = [
  {
    id: 'sfbt-21',
    title: '焦點解決 · 21 天微行動日記',
    desc: '不追問「為什麼卡住」，每天用 5 分鐘找到一小步做得到的改變。適合想動起來、卻常被大目標嚇退的你。',
    kindLabel: '日記',
    kindCls: 'bg-tile-mint text-[#3f6b46]',
    category: 'counseling',
    issues: ['direction', 'stress', 'self'],
    mode: 'instant',
    credits: 90,
    duration: '21 天 · 每天 5 分鐘',
    rating: 4.9,
    ratingCount: 214,
    joinedCount: 1320,
    includes: ['21 天引導式日記', '每日 Bouba 溫暖回饋', '每週小結週報', '心理師遠端關注'],
    coverCls: 'bg-tile-mint',
    coverEmoji: '🌱',
    trial: {
      title: '一小步練習',
      minutes: 3,
      prompt: '想一件最近卡住的事。不用分析原因，直接寫下「明天就做得到的最小一步」——小到不可能失敗的那種。',
      feedback:
        '你寫下的這一步很具體，這正是改變開始的樣子。焦點解決的核心就是：先做得到，再談做得多。如果這種「拆小步」的節奏適合你，完整的 21 天版本會每天陪你走一步。',
    },
    pro: {
      name: '林曉暖',
      title: '心理師',
      tags: ['焦點解決 SFBT', '溫暖務實'],
      bio: '執業 9 年。相信改變不用很大，把卡住的困境拆成做得到的下一步就好。',
      avatarCls: 'bg-tile-mint text-[#3f6b46]',
      blurb: '像一起找「做得到的下一步」，我會陪你把大困境拆小。',
      backgrounds: ['前國中輔導老師', '台語'],
      spectrum: [65, 40, 70, 55, 75],
    },
  },
  {
    id: 'cbti-14',
    title: '睡眠重訓 · CBT-i 兩週計畫',
    desc: '用認知行為取向的失眠改善法（CBT-i），透過睡眠日誌與刺激控制，兩週內重建你和床的關係。',
    kindLabel: '練習',
    kindCls: 'bg-muted text-muted-foreground',
    category: 'counseling',
    issues: ['sleep', 'stress'],
    mode: 'apply',
    credits: 150,
    duration: '14 天 · 每天 10 分鐘',
    rating: 4.8,
    ratingCount: 156,
    joinedCount: 862,
    includes: ['睡眠日誌與刺激控制練習', '睡眠效率追蹤', '想法重建練習', '完成後個人化建議'],
    coverCls: 'bg-tile-blue',
    coverEmoji: '🌙',
    applyHint: '此計畫需先由心理師確認你的睡眠狀況適合自主練習，送出申請後 1–2 天內回覆。',
    pro: {
      name: '陳以叡',
      title: '臨床心理師',
      tags: ['認知行為取向 CBT', '睡眠科學'],
      bio: '專長失眠與焦慮的非藥物介入，喜歡把研究實證翻譯成日常做得到的練習。',
      avatarCls: 'bg-tile-blue text-[#3e6079]',
      blurb: '像睡眠教練，直接指出讓你睡不好的習慣，並給你替代方案。',
      backgrounds: ['醫院睡眠中心經歷', '英語'],
      spectrum: [75, 60, 75, 80, 85],
    },
  },
  {
    id: 'moon-cycle',
    title: '新月許願 · 月亮週期反思日記',
    desc: '跟著月相的節奏書寫：新月設定意圖、滿月盤點收穫。讓宇宙的時間感幫你安排自己的節奏。',
    kindLabel: '日記',
    kindCls: 'bg-tile-mint text-[#3f6b46]',
    category: 'spiritual',
    issues: ['self', 'direction'],
    mode: 'instant',
    credits: 60,
    duration: '29 天 · 跟著月相走',
    rating: 4.7,
    ratingCount: 98,
    joinedCount: 543,
    includes: ['每日月相提示與引導提問', '新月／滿月儀式指南', '月末能量回顧'],
    coverCls: 'bg-gradient-night',
    coverEmoji: '🔮',
    pro: {
      name: '蘇菲亞',
      title: '塔羅占星師',
      tags: ['塔羅', '占星', '儀式感'],
      bio: '以塔羅與占星為鏡，陪你在星象的節奏裡認識自己、安放心事。',
      avatarCls: 'bg-tile-pink text-rust',
      blurb: '像在星空下聊天，用牌卡當鏡子，答案由你自己說出來。',
      backgrounds: ['旅居歐洲 6 年', '英語'],
      spectrum: [45, 35, 40, 40, 30],
    },
  },
  {
    id: 'okr-sprint',
    title: '職涯躍遷 · OKR 教練衝刺',
    desc: '四週一對一節奏：盤點現況、設定關鍵結果、每週行動承諾與復盤，把「想轉職／想升遷」變成進行式。',
    kindLabel: '教練',
    kindCls: 'bg-tile-peach text-[#8a6320]',
    category: 'coaching',
    issues: ['direction', 'stress'],
    mode: 'instant',
    credits: 320,
    duration: '4 週 · 每週練習＋復盤',
    rating: 5.0,
    ratingCount: 67,
    joinedCount: 289,
    includes: ['目標盤點工作表', '每週行動承諾', '教練式提問引導', '成果復盤模板'],
    coverCls: 'bg-tile-peach',
    coverEmoji: '🚀',
    trial: {
      title: '目標一句話',
      minutes: 3,
      prompt: '用一句話寫下「一年後你希望別人怎麼介紹你」。不用完美，先寫出第一版。',
      feedback:
        '這句話裡藏著你真正在意的方向。教練的工作就是把它拆成每週做得到的行動承諾。如果你喜歡這種「先講清楚要去哪」的開場，四週衝刺會把它變成進行式。',
    },
    pro: {
      name: 'Kai Chen',
      title: 'ICF 認證職涯教練',
      tags: ['OKR', '職涯轉換', '高效行動'],
      bio: '前科技業 PM 轉任教練，陪超過 200 位工作者完成轉職與升遷目標。',
      avatarCls: 'bg-tile-peach text-[#8a6320]',
      blurb: '像衝刺教練，每週對齊目標、檢核行動，不讓你原地打轉。',
      backgrounds: ['前科技業 PM', '轉職過 3 次', '英語'],
      spectrum: [90, 70, 85, 85, 95],
    },
  },
  {
    id: 'mbsr-8w',
    title: '正念安頓 · 八週呼吸與身體掃描',
    desc: '經典 MBSR 八週架構：從 3 分鐘呼吸空間到完整身體掃描，練習和壓力共處而不是對抗。',
    kindLabel: '練習',
    kindCls: 'bg-muted text-muted-foreground',
    category: 'counseling',
    issues: ['stress', 'mood'],
    mode: 'instant',
    credits: 120,
    duration: '8 週 · 每天 15 分鐘',
    rating: 4.9,
    ratingCount: 301,
    joinedCount: 2041,
    includes: ['八週漸進式正念練習', '引導語音檔', '每週反思提問', '練習時數統計'],
    coverCls: 'bg-tile-lemon',
    coverEmoji: '🧘',
    trial: {
      title: '3 分鐘呼吸空間',
      minutes: 3,
      prompt: '閉上眼睛，做三個完整的呼吸。睜開眼後，寫下你注意到的一個身體感受——緊、鬆、熱、麻，什麼都可以。',
      feedback:
        '能夠「注意到」就是正念的第一步——你剛剛做到了。不需要清空念頭，只要像這樣一次次回到身體。八週的完整練習會帶你從 3 分鐘慢慢走到完整的身體掃描。',
    },
    pro: {
      name: '周芷晴',
      title: '心理師',
      tags: ['正念減壓 MBSR', '安穩沉靜'],
      bio: '正念減壓合格師資。練習不是清空念頭，而是學會溫柔地回到當下。',
      avatarCls: 'bg-tile-lemon text-[#8a6320]',
      blurb: '像一起靜下來的同伴，我說得很少，但會陪你回到呼吸。',
      backgrounds: ['前外商 HR', '日語'],
      spectrum: [30, 25, 35, 30, 55],
    },
  },
  {
    id: 'ziwei-year',
    title: '紫微流年 · 人生節奏規劃書',
    desc: '回答 12 題人生盤點提問，搭配你的命盤流年，生成一份「今年適合把力氣放在哪」的節奏報告。',
    kindLabel: '測驗',
    kindCls: 'bg-tile-peach text-[#8a6320]',
    category: 'spiritual',
    issues: ['direction', 'self'],
    mode: 'instant',
    credits: 200,
    duration: '單次 · 約 30 分鐘',
    rating: 4.6,
    ratingCount: 74,
    joinedCount: 412,
    includes: ['12 題開放式人生盤點', '命盤流年對照解讀', '年度節奏規劃報告'],
    coverCls: 'bg-gradient-soft',
    coverEmoji: '✨',
    pro: {
      name: '老陽',
      title: '紫微斗數命理師',
      tags: ['紫微斗數', '流年規劃'],
      bio: '命理是參考書不是判決書。用 30 年經驗陪你把選擇權拿回自己手上。',
      avatarCls: 'bg-accent text-[#8a6320]',
      blurb: '像看地圖的長輩，直話直說，但選擇權永遠在你手上。',
      backgrounds: ['30 年執業'],
      spectrum: [70, 75, 60, 70, 40],
    },
  },
  {
    id: 'art-weather',
    title: '畫出心裡的天氣 · 藝術日記小團體',
    desc: '每週一個創作主題，不需要會畫畫——把說不出口的感受交給顏色和線條，並在小團體中被溫柔接住。',
    kindLabel: '日記',
    kindCls: 'bg-tile-mint text-[#3f6b46]',
    category: 'counseling',
    issues: ['mood', 'loss', 'self'],
    mode: 'apply',
    credits: 180,
    duration: '6 週 · 每週主題創作',
    rating: 4.8,
    ratingCount: 52,
    joinedCount: 187,
    includes: ['每週創作主題引導', '8 人小團體分享', '藝術療癒師回應', '成果作品集'],
    coverCls: 'bg-tile-pink',
    coverEmoji: '🎨',
    applyHint: '小團體每期僅 8 個名額，需申請後由帶領者依組成狀況配對，1–3 天內回覆。',
    pro: {
      name: '高子晏',
      title: '藝術療癒師',
      tags: ['藝術療癒', '小團體'],
      bio: '相信每個人心裡都有一種天氣。你不需要會畫畫，只需要願意拿起筆。',
      avatarCls: 'bg-tile-pink text-rust',
      blurb: '像美術教室裡的陪伴者，不評價作品，只陪你看見感受。',
      backgrounds: ['視覺設計背景'],
      spectrum: [20, 20, 25, 15, 45],
    },
  },
  {
    id: 'stress-check',
    title: '壓力源健檢 · 質性壓力測驗',
    desc: '12 題開放式作答，AI 幫你把散落的壓力源整理成看得懂的地圖。第一次使用平台的好起點。',
    kindLabel: '測驗',
    kindCls: 'bg-tile-peach text-[#8a6320]',
    category: 'assessment',
    issues: ['stress', 'mood'],
    mode: 'instant',
    credits: 0,
    duration: '單次 · 約 15 分鐘',
    rating: 4.7,
    ratingCount: 388,
    joinedCount: 3150,
    includes: ['12 題開放式作答', 'AI 質性分析報告', '專業夥伴版報告（可選擇分享）'],
    coverCls: 'bg-accent',
    coverEmoji: '📋',
    pro: {
      name: '陳以叡',
      title: '臨床心理師',
      tags: ['質性測驗', '壓力管理'],
      bio: '專長失眠與焦慮的非藥物介入，喜歡把研究實證翻譯成日常做得到的練習。',
      avatarCls: 'bg-tile-blue text-[#3e6079]',
      blurb: '像睡眠教練，直接指出讓你睡不好的習慣，並給你替代方案。',
      backgrounds: ['醫院睡眠中心經歷', '英語'],
      spectrum: [75, 60, 75, 80, 85],
    },
  },
]

// ── 相符度計算（規則式示意：100 − 五光譜平均距離） ─────────────────────────

function matchScore(userSpectrum: number[], proSpectrum: number[]): number {
  const avgDiff =
    userSpectrum.reduce((sum, v, i) => sum + Math.abs(v - proSpectrum[i]), 0) / userSpectrum.length
  return Math.round(100 - avgDiff)
}

/** 挑「個案最在意（最偏離中間）且雙方最接近」的維度，翻譯成一句媒合理由 */
function matchReason(userSpectrum: number[], proSpectrum: number[]): string {
  let best = 0
  let bestWeight = -Infinity
  for (let i = 0; i < userSpectrum.length; i++) {
    const care = Math.abs(userSpectrum[i] - 50)
    const close = 100 - Math.abs(userSpectrum[i] - proSpectrum[i])
    const weight = care + close
    if (weight > bestWeight) {
      bestWeight = weight
      best = i
    }
  }
  const def = SPECTRUM_DEFS[best]
  const side = userSpectrum[best] >= 50 ? def.right : def.left
  return `你偏好「${side}」，這位夥伴在這一點與你相近。`
}

// ── 主元件 ──────────────────────────────────────────────────────────────────

type View = 'explore' | 'saved' | 'mine'

export function MarketplacePreview() {
  const { t } = useLanguage()
  const [view, setView] = useState<View>('explore')
  const [issue, setIssue] = useState<'all' | IssueKey>('all')
  const [category, setCategory] = useState<'all' | PreviewCategory>('all')
  const [archetype, setArchetype] = useState<ArchetypeKey | null>(null)
  const [credits, setCredits] = useState(START_CREDITS)
  const [saved, setSaved] = useState<string[]>([])
  const [status, setStatus] = useState<Record<string, EnrollStatus>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const reset = () => {
    setView('explore')
    setIssue('all')
    setCategory('all')
    setArchetype(null)
    setCredits(START_CREDITS)
    setSaved([])
    setStatus({})
    setSelectedId(null)
  }

  const toggleSave = (id: string) =>
    setSaved((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const enroll = (m: PreviewModule) => {
    setCredits((c) => c - m.credits)
    setStatus((prev) => ({ ...prev, [m.id]: 'enrolled' }))
  }

  const apply = (m: PreviewModule) => {
    setStatus((prev) => ({ ...prev, [m.id]: 'applied' }))
  }

  const cancelApply = (id: string) =>
    setStatus((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

  const userSpectrum = archetype ? ARCHETYPES.find((a) => a.key === archetype)!.spectrum : null

  const selected = PREVIEW_MODULES.find((m) => m.id === selectedId) ?? null
  const savedModules = PREVIEW_MODULES.filter((m) => saved.includes(m.id))
  const mine = PREVIEW_MODULES.filter((m) => status[m.id])
  let explored = PREVIEW_MODULES.filter(
    (m) =>
      (issue === 'all' || m.issues.includes(issue)) &&
      (category === 'all' || m.category === category),
  )
  if (userSpectrum) {
    explored = [...explored].sort(
      (a, b) => matchScore(userSpectrum, b.pro.spectrum) - matchScore(userSpectrum, a.pro.spectrum),
    )
  }

  const CATEGORY_FILTERS: { key: 'all' | PreviewCategory; label: string }[] = [
    { key: 'all', label: t('全部類型') },
    { key: 'counseling', label: t('心理諮詢') },
    { key: 'coaching', label: t('生涯教練') },
    { key: 'spiritual', label: t('身心靈') },
    { key: 'assessment', label: t('測驗量表') },
  ]

  const VIEWS: { key: View; label: string; count?: number }[] = [
    { key: 'explore', label: t('探索') },
    { key: 'saved', label: t('收藏'), count: saved.length },
    { key: 'mine', label: t('我的課程'), count: mine.length },
  ]

  return (
    <div>
      {/* 預覽模式提示 */}
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-dashed border-primary/70 bg-primary-soft/40 px-4 py-3">
        <span className="flex items-center gap-1.5 text-sm font-black text-foreground">
          <EyeIcon className="h-4 w-4" />
          {t('預覽模式')}
        </span>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {t('這是使用者在 App 裡看到的模組市集。互動僅供體驗，不會寫入任何資料。')}
        </p>
        <button
          onClick={reset}
          className="rounded-full border border-border bg-card px-3.5 py-1 text-xs font-bold text-foreground transition hover:bg-muted"
        >
          {t('重設預覽')}
        </button>
      </div>

      {/* 使用者視角的市集標頭 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground">{t('探索健心市集')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('來自不同專業夥伴的練習、日記與測驗模組，用 credits 預約加入。')}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-gold px-4 py-1.5 text-sm font-black text-[#5b3a12] shadow-soft">
          🪙 {credits} <span className="font-en font-bold">credits</span>
        </span>
      </div>

      {/* 探索／收藏／我的課程 */}
      <div className="mt-4 inline-flex rounded-full border border-border bg-card p-1 shadow-soft">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
              view === v.key ? 'bg-foreground text-cream' : 'text-foreground hover:bg-muted'
            }`}
          >
            {v.label}
            {v.count != null && v.count > 0 && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                  view === v.key ? 'bg-cream/25 text-cream' : 'bg-muted text-muted-foreground'
                }`}
              >
                {v.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {view === 'explore' && (
        <>
          {/* 期待原型快篩：選了之後全站顯示相符度與媒合理由 */}
          <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-3 shadow-soft">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm font-black text-foreground">
                <SparkIcon className="h-4 w-4 text-gold-deep" />
                {t('你希望遇到什麼樣的夥伴？')}
              </span>
              {ARCHETYPES.map((a) => (
                <button
                  key={a.key}
                  onClick={() => setArchetype(archetype === a.key ? null : a.key)}
                  title={a.desc}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    archetype === a.key
                      ? 'bg-foreground text-cream'
                      : 'bg-muted text-foreground hover:bg-border'
                  }`}
                >
                  {a.label}
                </button>
              ))}
              {archetype && (
                <button
                  onClick={() => setArchetype(null)}
                  className="text-xs font-bold text-muted-foreground hover:text-rust"
                >
                  {t('清除')}
                </button>
              )}
            </div>
            {archetype && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {ARCHETYPES.find((a) => a.key === archetype)!.desc}
                {t('——已依相符度排序，點進模組可看夥伴的風格光譜。')}
              </p>
            )}
          </div>

          {/* 頂層：狀態/議題白話入口 */}
          <div className="mt-4 flex flex-wrap gap-2">
            {ISSUE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setIssue(f.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
                  issue === f.key ? 'bg-foreground text-cream' : 'bg-card text-foreground hover:bg-muted'
                }`}
              >
                {t(f.label)}
              </button>
            ))}
          </div>

          {/* 次篩選：服務類型 */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CATEGORY_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setCategory(f.key)}
                className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${
                  category === f.key
                    ? 'bg-primary-soft text-foreground ring-1 ring-primary/50'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {explored.length === 0 ? (
            <EmptyHint>{t('這個組合目前沒有模組，換個分類試試。')}</EmptyHint>
          ) : (
            <ModuleGrid
              modules={explored}
              saved={saved}
              status={status}
              userSpectrum={userSpectrum}
              onToggleSave={toggleSave}
              onOpen={setSelectedId}
            />
          )}
        </>
      )}

      {view === 'saved' &&
        (savedModules.length === 0 ? (
          <EmptyHint>{t('還沒有收藏。點卡片右上角的 ♡，把喜歡的模組收進這裡。')}</EmptyHint>
        ) : (
          <ModuleGrid
            modules={savedModules}
            saved={saved}
            status={status}
            userSpectrum={userSpectrum}
            onToggleSave={toggleSave}
            onOpen={setSelectedId}
          />
        ))}

      {view === 'mine' &&
        (mine.length === 0 ? (
          <EmptyHint>{t('還沒有加入任何課程。到「探索」用 credits 預約第一個模組吧！')}</EmptyHint>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            {mine.map((m) => (
              <MyCourseRow
                key={m.id}
                module={m}
                status={status[m.id]}
                onOpen={() => setSelectedId(m.id)}
                onCancelApply={() => cancelApply(m.id)}
              />
            ))}
          </div>
        ))}

      {selected && (
        <ModuleSheet
          module={selected}
          credits={credits}
          status={status[selected.id]}
          saved={saved.includes(selected.id)}
          userSpectrum={userSpectrum}
          onToggleSave={() => toggleSave(selected.id)}
          onEnroll={() => enroll(selected)}
          onApply={() => apply(selected)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

// ── 卡片網格 ────────────────────────────────────────────────────────────────

function ModuleGrid({
  modules,
  saved,
  status,
  userSpectrum,
  onToggleSave,
  onOpen,
}: {
  modules: PreviewModule[]
  saved: string[]
  status: Record<string, EnrollStatus>
  userSpectrum: number[] | null
  onToggleSave: (id: string) => void
  onOpen: (id: string) => void
}) {
  const { t } = useLanguage()
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map((m) => {
        const st = status[m.id]
        const isSaved = saved.includes(m.id)
        const dark = m.coverCls === 'bg-gradient-night'
        const score = userSpectrum ? matchScore(userSpectrum, m.pro.spectrum) : null
        return (
          <div
            key={m.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(m.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen(m.id)
              }
            }}
            className="group flex cursor-pointer flex-col overflow-hidden rounded-[22px] border border-border bg-card text-left shadow-soft transition hover:-translate-y-0.5"
          >
            <div className={`relative flex h-28 items-center justify-center ${m.coverCls}`}>
              <span className="text-[42px] transition group-hover:scale-110">{m.coverEmoji}</span>
              <span
                className={`absolute left-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                  dark ? 'bg-cream/90 text-foreground' : 'bg-background/90 text-foreground'
                }`}
              >
                {t(m.kindLabel)}
              </span>
              {m.trial && (
                <span
                  className={`absolute bottom-3 left-3 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                    dark ? 'bg-cream/90 text-foreground' : 'bg-background/90 text-foreground'
                  }`}
                >
                  {t('可免費試玩')}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleSave(m.id)
                }}
                aria-label={isSaved ? t('取消收藏') : t('收藏')}
                className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 transition active:scale-90"
              >
                <HeartIcon filled={isSaved} className={`h-4 w-4 ${isSaved ? 'text-rust' : 'text-foreground/50'}`} />
              </button>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-center gap-1.5">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${m.pro.avatarCls}`}
                >
                  {m.pro.name[0]}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {m.pro.name} · {m.pro.title}
                </span>
                {score != null && (
                  <span className="ml-auto shrink-0 rounded-full bg-tile-mint px-2 py-0.5 text-[10px] font-extrabold text-[#3f6b46]">
                    {t('相符 {n}%', { n: score })}
                  </span>
                )}
              </div>
              <h3 className="mt-1.5 text-[16px] font-black leading-snug text-foreground">{m.title}</h3>
              <p className="mt-1 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">{m.desc}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-bold text-gold-deep">★ {m.rating.toFixed(1)}</span>
                <span className="ml-1">({m.ratingCount})</span>
                <span className="mx-1.5">·</span>
                {m.duration}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                {m.credits === 0 ? (
                  <span className="rounded-full bg-tile-mint px-2.5 py-0.5 text-sm font-black text-[#3f6b46]">
                    {t('免費')}
                  </span>
                ) : (
                  <span className="text-[15px] font-black text-foreground">
                    🪙 {m.credits}
                    <span className="ml-1 font-en text-xs font-bold text-muted-foreground">credits</span>
                  </span>
                )}
                {st === 'enrolled' ? (
                  <span className="rounded-full bg-tile-mint px-2.5 py-1 text-xs font-extrabold text-[#3f6b46]">
                    {t('已加入')}
                  </span>
                ) : st === 'applied' ? (
                  <span className="rounded-full bg-tile-peach px-2.5 py-1 text-xs font-extrabold text-[#8a6320]">
                    {t('審核中')}
                  </span>
                ) : (
                  <span className="text-xs font-bold text-muted-foreground transition group-hover:text-foreground">
                    {t('查看詳情')} ›
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 我的課程列 ──────────────────────────────────────────────────────────────

function MyCourseRow({
  module: m,
  status,
  onOpen,
  onCancelApply,
}: {
  module: PreviewModule
  status: EnrollStatus
  onOpen: () => void
  onCancelApply: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl ${m.coverCls}`}>
        {m.coverEmoji}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-black text-foreground">{m.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {m.pro.name} · {m.pro.title} · {m.duration}
        </p>
        {status === 'enrolled' && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[4%] rounded-full bg-primary" />
            </div>
            <span className="text-[11px] text-muted-foreground">{t('進度 0% · 剛開始')}</span>
          </div>
        )}
      </div>
      {status === 'enrolled' ? (
        <button
          onClick={onOpen}
          className="shrink-0 rounded-full bg-gradient-primary px-4 py-2 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
        >
          {t('開始練習')}
        </button>
      ) : (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="rounded-full bg-tile-peach px-2.5 py-1 text-xs font-extrabold text-[#8a6320]">
            {t('審核中')}
          </span>
          <button onClick={onCancelApply} className="text-xs font-bold text-muted-foreground hover:text-rust">
            {t('取消申請')}
          </button>
        </div>
      )}
    </div>
  )
}

// ── 風格光譜（夥伴自評 + 個案期待對照） ────────────────────────────────────

function SpectrumBars({
  proSpectrum,
  userSpectrum,
}: {
  proSpectrum: number[]
  userSpectrum: number[] | null
}) {
  const { t } = useLanguage()
  return (
    <div className="mt-3 flex flex-col gap-2">
      {SPECTRUM_DEFS.map((def, i) => (
        <div key={def.left} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-right text-[10px] font-bold text-muted-foreground">
            {t(def.left)}
          </span>
          <div className="relative h-1.5 min-w-0 flex-1 rounded-full bg-muted">
            {/* 夥伴自評（實心點） */}
            <span
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-soft"
              style={{ left: `${proSpectrum[i]}%` }}
            />
            {/* 個案期待（空心圈，選了原型才顯示） */}
            {userSpectrum && (
              <span
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold-deep bg-transparent"
                style={{ left: `${userSpectrum[i]}%` }}
              />
            )}
          </div>
          <span className="w-16 shrink-0 text-[10px] font-bold text-muted-foreground">{t(def.right)}</span>
        </div>
      ))}
      {userSpectrum && (
        <p className="text-[10px] text-muted-foreground">
          {t('實心點＝夥伴自評，空心圈＝你的期待。')}
        </p>
      )}
    </div>
  )
}

// ── 試玩小練習 ──────────────────────────────────────────────────────────────

function TrialSheet({
  module: m,
  saved,
  onToggleSave,
  onClose,
}: {
  module: PreviewModule
  saved: boolean
  onToggleSave: () => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [answer, setAnswer] = useState('')
  const [done, setDone] = useState(false)
  const trial = m.trial!

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-[#1c1714]/50 px-4 py-8"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div
        className="mx-auto w-full max-w-md overflow-hidden rounded-[24px] bg-background shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-tile-mint px-2.5 py-0.5 text-[11px] font-extrabold text-[#3f6b46]">
              {t('免費試玩 · 約 {n} 分鐘', { n: trial.minutes })}
            </span>
            <button
              onClick={onClose}
              aria-label={t('關閉')}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-lg font-bold text-foreground"
            >
              ×
            </button>
          </div>
          <h2 className="mt-3 text-lg font-black text-foreground">{trial.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('由 {name}（{title}）設計', { name: m.pro.name, title: m.pro.title })}
          </p>

          {!done ? (
            <>
              <p className="mt-4 rounded-2xl bg-card p-4 text-[15px] leading-relaxed text-foreground/85 shadow-soft">
                {trial.prompt}
              </p>
              <textarea
                value={answer}
                rows={3}
                placeholder={t('在這裡寫下來…')}
                onChange={(e) => setAnswer(e.target.value)}
                className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                onClick={() => setDone(true)}
                disabled={answer.trim().length === 0}
                className="mt-3 w-full rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-50"
              >
                {t('完成練習')}
              </button>
            </>
          ) : (
            <>
              <div className="mt-4 rounded-2xl bg-primary-soft/50 p-4">
                <p className="flex items-center gap-1.5 text-xs font-black text-foreground">
                  <SparkIcon className="h-3.5 w-3.5 text-gold-deep" />
                  {t('AI 回饋（示意）')}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/85">{trial.feedback}</p>
              </div>
              <p className="mt-4 text-center text-sm font-bold text-foreground">
                {t('這是 {name} 設計的練習，覺得有幫助嗎？', { name: m.pro.name })}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={onToggleSave}
                  className={`flex-1 rounded-full border py-2.5 text-sm font-bold transition ${
                    saved
                      ? 'border-rust/40 bg-tile-pink text-rust'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  {saved ? t('已收藏') : t('收藏這個模組')}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 rounded-full bg-gradient-primary py-2.5 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
                >
                  {t('查看完整模組')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 模組詳情（預約／申請）────────────────────────────────────────────────────

function ModuleSheet({
  module: m,
  credits,
  status,
  saved,
  userSpectrum,
  onToggleSave,
  onEnroll,
  onApply,
  onClose,
}: {
  module: PreviewModule
  credits: number
  status: EnrollStatus | undefined
  saved: boolean
  userSpectrum: number[] | null
  onToggleSave: () => void
  onEnroll: () => void
  onApply: () => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [confirming, setConfirming] = useState(false)
  const [applyNote, setApplyNote] = useState('')
  const [trialOpen, setTrialOpen] = useState(false)
  const insufficient = m.credits > credits
  const dark = m.coverCls === 'bg-gradient-night'
  const score = userSpectrum ? matchScore(userSpectrum, m.pro.spectrum) : null

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-[#1c1714]/40 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="mx-auto w-full max-w-lg overflow-hidden rounded-[24px] bg-background shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 封面 */}
        <div className={`relative flex h-32 items-center justify-center ${m.coverCls}`}>
          <span className="text-[56px]">{m.coverEmoji}</span>
          <button
            onClick={onClose}
            aria-label={t('關閉')}
            className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold ${
              dark ? 'bg-cream/90 text-foreground' : 'bg-background/90 text-foreground'
            }`}
          >
            ×
          </button>
          <button
            onClick={onToggleSave}
            aria-label={saved ? t('取消收藏') : t('收藏')}
            className="absolute right-12 top-3 mr-1 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 transition active:scale-90"
          >
            <HeartIcon filled={saved} className={`h-4 w-4 ${saved ? 'text-rust' : 'text-foreground/50'}`} />
          </button>
        </div>

        <div className="p-6">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${m.kindCls}`}>{t(m.kindLabel)}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-extrabold text-muted-foreground">
              {t(CATEGORY_LABEL[m.category])}
            </span>
            <span className="text-xs text-muted-foreground">{m.duration}</span>
          </div>
          <h2 className="mt-2 text-xl font-black leading-snug text-foreground">{m.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-bold text-gold-deep">★ {m.rating.toFixed(1)}</span> ({m.ratingCount}) ·{' '}
            {t('{n} 人參與過', { n: m.joinedCount.toLocaleString() })}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-foreground/85">{m.desc}</p>

          {/* 專業夥伴：頭像列 + 一句自述 + 多元背景 + 風格光譜 + 相符度 */}
          <div className="mt-4 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-black ${m.pro.avatarCls}`}
              >
                {m.pro.name[0]}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-black text-foreground">{m.pro.name}</p>
                <p className="text-xs text-muted-foreground">{m.pro.title}</p>
              </div>
              {score != null && (
                <span className="ml-auto shrink-0 rounded-full bg-tile-mint px-2.5 py-1 text-xs font-extrabold text-[#3f6b46]">
                  {t('與你的期待相符 {n}%', { n: score })}
                </span>
              )}
            </div>
            <p className="mt-2.5 rounded-xl bg-muted/60 px-3 py-2 text-sm leading-relaxed text-foreground/85">
              「{m.pro.blurb}」
            </p>
            {score != null && userSpectrum && (
              <p className="mt-2 text-xs font-bold text-[#3f6b46]">
                {matchReason(userSpectrum, m.pro.spectrum)}
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap gap-1">
              {m.pro.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {tag}
                </span>
              ))}
              {m.pro.backgrounds.map((bg) => (
                <span
                  key={bg}
                  className="rounded-full bg-tile-lemon/70 px-2 py-0.5 text-[10px] font-bold text-[#8a6320]"
                >
                  {bg}
                </span>
              ))}
            </div>
            <SpectrumBars proSpectrum={m.pro.spectrum} userSpectrum={userSpectrum} />
            <p className="mt-2.5 text-sm leading-relaxed text-foreground/80">{m.pro.bio}</p>
            {m.trial && !status && (
              <button
                onClick={() => setTrialOpen(true)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-primary/50 bg-primary-soft/40 py-2.5 text-sm font-extrabold text-foreground transition hover:bg-primary-soft/70 active:scale-[0.98]"
              >
                <SparkIcon className="h-4 w-4 text-gold-deep" />
                {t('先免費試玩：{title}（約 {n} 分鐘）', { title: m.trial.title, n: m.trial.minutes })}
              </button>
            )}
          </div>

          {/* 內容包含 */}
          <p className="mt-4 text-sm font-black text-foreground">{t('這個模組包含')}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {m.includes.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-foreground/85">
                <span className="mt-0.5 text-[#3f6b46]">✓</span>
                {item}
              </li>
            ))}
          </ul>

          {/* 預約／申請動作區 */}
          <div className="mt-5 rounded-2xl bg-card p-4 shadow-soft">
            {status === 'enrolled' ? (
              <div className="rounded-xl bg-tile-mint px-4 py-3 text-center">
                <p className="text-sm font-black text-[#3f6b46]">{t('✓ 已加入！到「我的課程」隨時開始練習。')}</p>
              </div>
            ) : status === 'applied' ? (
              <div className="rounded-xl bg-tile-peach px-4 py-3 text-center">
                <p className="text-sm font-black text-[#8a6320]">{t('已送出申請，等待專業夥伴確認。')}</p>
                <p className="mt-1 text-xs text-[#8a6320]/80">{t('可在「我的課程」追蹤申請狀態。')}</p>
              </div>
            ) : m.mode === 'apply' ? (
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-black text-foreground">
                    {m.credits === 0 ? t('免費') : <>🪙 {m.credits} <span className="font-en text-xs font-bold text-muted-foreground">credits</span></>}
                  </span>
                  <span className="text-xs text-muted-foreground">{t('通過後才會扣除')}</span>
                </div>
                {m.applyHint && (
                  <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    {m.applyHint}
                  </p>
                )}
                <textarea
                  value={applyNote}
                  rows={2}
                  placeholder={t('簡單說說你的期待或狀況（選填）')}
                  onChange={(e) => setApplyNote(e.target.value)}
                  className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  onClick={onApply}
                  className="mt-3 w-full rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
                >
                  {t('送出申請')}
                </button>
              </div>
            ) : confirming ? (
              <div>
                <p className="text-center text-sm font-bold text-foreground">
                  {m.credits === 0
                    ? t('確認加入「{title}」？免費模組不扣 credits。', { title: m.title })
                    : t('確認用 {n} credits 預約「{title}」？', { n: m.credits, title: m.title })}
                </p>
                {m.credits > 0 && (
                  <p className="mt-1 text-center text-xs text-muted-foreground">
                    {t('餘額將剩下 {n} credits。', { n: credits - m.credits })}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 rounded-full border border-border bg-background py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted"
                  >
                    {t('再想想')}
                  </button>
                  <button
                    onClick={onEnroll}
                    className="flex-1 rounded-full bg-gradient-primary py-2.5 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
                  >
                    {t('確認預約')}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-black text-foreground">
                    {m.credits === 0 ? (
                      <span className="rounded-full bg-tile-mint px-3 py-1 text-base font-black text-[#3f6b46]">
                        {t('免費')}
                      </span>
                    ) : (
                      <>🪙 {m.credits} <span className="font-en text-xs font-bold text-muted-foreground">credits</span></>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{t('目前餘額 {n}', { n: credits })}</span>
                </div>
                {insufficient && (
                  <p className="mt-2 rounded-xl bg-tile-pink px-3 py-2 text-xs font-bold text-rust">
                    {t('credits 不足，還差 {n}。儲值後即可預約。', { n: m.credits - credits })}
                  </p>
                )}
                <button
                  onClick={() => setConfirming(true)}
                  disabled={insufficient}
                  className="mt-3 w-full rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-50"
                >
                  {m.credits === 0 ? t('免費加入') : t('用 {n} credits 預約', { n: m.credits })}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {trialOpen && m.trial && (
        <TrialSheet module={m} saved={saved} onToggleSave={onToggleSave} onClose={() => setTrialOpen(false)} />
      )}
    </div>
  )
}

// ── 小元件 ──────────────────────────────────────────────────────────────────

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
