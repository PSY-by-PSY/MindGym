// 使用者預覽（模組市集）——/admin 與 /therapist 共用的「以使用者視角」分頁。
// 讓管理員與專業夥伴體驗使用者如何探索、收藏、用 credits 預約來自不同專業夥伴的
// 模組（類 Coursera / ClassPass 的市集）。所有互動只動 local state、不寫資料庫；
// 模組與夥伴皆為示意用假資料，正式內容上線後再接真資料。
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

// ── 示意假資料 ──────────────────────────────────────────────────────────────

const START_CREDITS = 300

type PreviewCategory = 'counseling' | 'coaching' | 'spiritual' | 'assessment'
type EnrollStatus = 'enrolled' | 'applied'

type PreviewModule = {
  id: string
  title: string
  desc: string
  kindLabel: string
  kindCls: string
  category: PreviewCategory
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
  pro: {
    name: string
    title: string
    tags: string[]
    bio: string
    avatarCls: string
  }
}

const CATEGORY_LABEL: Record<PreviewCategory, string> = {
  counseling: '心理諮商',
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
    mode: 'instant',
    credits: 90,
    duration: '21 天 · 每天 5 分鐘',
    rating: 4.9,
    ratingCount: 214,
    joinedCount: 1320,
    includes: ['21 天引導式日記', '每日 Bouba 溫暖回饋', '每週小結週報', '心理師遠端關注'],
    coverCls: 'bg-tile-mint',
    coverEmoji: '🌱',
    pro: {
      name: '林曉暖',
      title: '諮商心理師',
      tags: ['焦點解決 SFBT', '溫暖務實'],
      bio: '執業 9 年。相信改變不用很大，把卡住的困境拆成做得到的下一步就好。',
      avatarCls: 'bg-tile-mint text-[#3f6b46]',
    },
  },
  {
    id: 'cbti-14',
    title: '睡眠重訓 · CBT-i 兩週計畫',
    desc: '用認知行為治療的失眠介入法（CBT-i），透過睡眠日誌與刺激控制，兩週內重建你和床的關係。',
    kindLabel: '練習',
    kindCls: 'bg-muted text-muted-foreground',
    category: 'counseling',
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
      tags: ['認知行為治療 CBT', '睡眠醫學'],
      bio: '專長失眠與焦慮的非藥物介入，喜歡把研究實證翻譯成日常做得到的練習。',
      avatarCls: 'bg-tile-blue text-[#3e6079]',
    },
  },
  {
    id: 'moon-cycle',
    title: '新月許願 · 月亮週期反思日記',
    desc: '跟著月相的節奏書寫：新月設定意圖、滿月盤點收穫。讓宇宙的時間感幫你安排自己的節奏。',
    kindLabel: '日記',
    kindCls: 'bg-tile-mint text-[#3f6b46]',
    category: 'spiritual',
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
    },
  },
  {
    id: 'okr-sprint',
    title: '職涯躍遷 · OKR 教練衝刺',
    desc: '四週一對一節奏：盤點現況、設定關鍵結果、每週行動承諾與復盤，把「想轉職／想升遷」變成進行式。',
    kindLabel: '教練',
    kindCls: 'bg-tile-peach text-[#8a6320]',
    category: 'coaching',
    mode: 'instant',
    credits: 320,
    duration: '4 週 · 每週練習＋復盤',
    rating: 5.0,
    ratingCount: 67,
    joinedCount: 289,
    includes: ['目標盤點工作表', '每週行動承諾', '教練式提問引導', '成果復盤模板'],
    coverCls: 'bg-tile-peach',
    coverEmoji: '🚀',
    pro: {
      name: 'Kai Chen',
      title: 'ICF 認證職涯教練',
      tags: ['OKR', '職涯轉換', '高效行動'],
      bio: '前科技業 PM 轉任教練，陪超過 200 位工作者完成轉職與升遷目標。',
      avatarCls: 'bg-tile-peach text-[#8a6320]',
    },
  },
  {
    id: 'mbsr-8w',
    title: '正念安頓 · 八週呼吸與身體掃描',
    desc: '經典 MBSR 八週架構：從 3 分鐘呼吸空間到完整身體掃描，練習和壓力共處而不是對抗。',
    kindLabel: '練習',
    kindCls: 'bg-muted text-muted-foreground',
    category: 'counseling',
    mode: 'instant',
    credits: 120,
    duration: '8 週 · 每天 15 分鐘',
    rating: 4.9,
    ratingCount: 301,
    joinedCount: 2041,
    includes: ['八週漸進式正念練習', '引導語音檔', '每週反思提問', '練習時數統計'],
    coverCls: 'bg-tile-lemon',
    coverEmoji: '🧘',
    pro: {
      name: '周芷晴',
      title: '諮商心理師',
      tags: ['正念減壓 MBSR', '安穩沉靜'],
      bio: '正念減壓合格師資。練習不是清空念頭，而是學會溫柔地回到當下。',
      avatarCls: 'bg-tile-lemon text-[#8a6320]',
    },
  },
  {
    id: 'ziwei-year',
    title: '紫微流年 · 人生節奏規劃書',
    desc: '回答 12 題人生盤點提問，搭配你的命盤流年，生成一份「今年適合把力氣放在哪」的節奏報告。',
    kindLabel: '測驗',
    kindCls: 'bg-tile-peach text-[#8a6320]',
    category: 'spiritual',
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
    },
  },
  {
    id: 'art-weather',
    title: '畫出心裡的天氣 · 藝術日記小團體',
    desc: '每週一個創作主題，不需要會畫畫——把說不出口的感受交給顏色和線條，並在小團體中被溫柔接住。',
    kindLabel: '日記',
    kindCls: 'bg-tile-mint text-[#3f6b46]',
    category: 'counseling',
    mode: 'apply',
    credits: 180,
    duration: '6 週 · 每週主題創作',
    rating: 4.8,
    ratingCount: 52,
    joinedCount: 187,
    includes: ['每週創作主題引導', '8 人小團體分享', '藝術治療師回應', '成果作品集'],
    coverCls: 'bg-tile-pink',
    coverEmoji: '🎨',
    applyHint: '小團體每期僅 8 個名額，需申請後由治療師依組成狀況配對，1–3 天內回覆。',
    pro: {
      name: '高子晏',
      title: '藝術治療師',
      tags: ['藝術治療', '小團體'],
      bio: '相信每個人心裡都有一種天氣。你不需要會畫畫，只需要願意拿起筆。',
      avatarCls: 'bg-tile-pink text-rust',
    },
  },
  {
    id: 'stress-check',
    title: '壓力源健檢 · 質性壓力測驗',
    desc: '12 題開放式作答，AI 幫你把散落的壓力源整理成看得懂的地圖。第一次使用平台的好起點。',
    kindLabel: '測驗',
    kindCls: 'bg-tile-peach text-[#8a6320]',
    category: 'assessment',
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
    },
  },
]

// ── 主元件 ──────────────────────────────────────────────────────────────────

type View = 'explore' | 'saved' | 'mine'

export function MarketplacePreview() {
  const { t } = useLanguage()
  const [view, setView] = useState<View>('explore')
  const [category, setCategory] = useState<'all' | PreviewCategory>('all')
  const [credits, setCredits] = useState(START_CREDITS)
  const [saved, setSaved] = useState<string[]>([])
  const [status, setStatus] = useState<Record<string, EnrollStatus>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const reset = () => {
    setView('explore')
    setCategory('all')
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

  const selected = PREVIEW_MODULES.find((m) => m.id === selectedId) ?? null
  const savedModules = PREVIEW_MODULES.filter((m) => saved.includes(m.id))
  const mine = PREVIEW_MODULES.filter((m) => status[m.id])
  const explored =
    category === 'all' ? PREVIEW_MODULES : PREVIEW_MODULES.filter((m) => m.category === category)

  const CATEGORY_FILTERS: { key: 'all' | PreviewCategory; label: string }[] = [
    { key: 'all', label: t('全部') },
    { key: 'counseling', label: t('心理諮商') },
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
          <div className="mt-4 flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setCategory(f.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
                  category === f.key ? 'bg-foreground text-cream' : 'bg-card text-foreground hover:bg-muted'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <ModuleGrid
            modules={explored}
            saved={saved}
            status={status}
            onToggleSave={toggleSave}
            onOpen={setSelectedId}
          />
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
  onToggleSave,
  onOpen,
}: {
  modules: PreviewModule[]
  saved: string[]
  status: Record<string, EnrollStatus>
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

// ── 模組詳情（預約／申請）────────────────────────────────────────────────────

function ModuleSheet({
  module: m,
  credits,
  status,
  saved,
  onToggleSave,
  onEnroll,
  onApply,
  onClose,
}: {
  module: PreviewModule
  credits: number
  status: EnrollStatus | undefined
  saved: boolean
  onToggleSave: () => void
  onEnroll: () => void
  onApply: () => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [confirming, setConfirming] = useState(false)
  const [applyNote, setApplyNote] = useState('')
  const insufficient = m.credits > credits
  const dark = m.coverCls === 'bg-gradient-night'

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

          {/* 專業夥伴 */}
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
              <div className="ml-auto flex flex-wrap justify-end gap-1">
                {m.pro.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-foreground/80">{m.pro.bio}</p>
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
