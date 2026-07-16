// 晤談前（Pre-Session）示意元件 —— 依 docs/plans/pre_session_mvp_plan.md。
// IntakeWorkbenchPreview：行政/管理端的媒合工作台（/staff 與 /admin 分頁共用）。
// MatchInvitesPreview：心理師端的媒合邀請收件匣（/therapist 分頁）。
// 全部為示意假資料、只動 local state、不寫資料庫；正式版接 intake_cases /
// match_assignments 後替換資料來源。文案遵守用語法遵規範（晤談/心理諮詢）。
import { useState } from 'react'
import { EyeIcon } from './MarketplacePreview'

// ── 型別與示意資料 ──────────────────────────────────────────────────────────

type CaseStatus = 'pending' | 'proposed' | 'accepted'

type IntakeSection = { title: string; body: string }

type PacketQuote = { text: string; quote?: string }

type IntakePacket = {
  summary: { chief: string; context: string; impact: string }
  coping: { emotion: string[]; behavior: string[]; ineffective: string[] }
  support: string[]
  language: string
  basicId: { key: string; label: string; item: PacketQuote }[]
  ppp: { kind: '易感' | '促發' | '維持'; text: string; confidence: '低' | '中' | '高'; evidence: string }[]
  fourChecks: { label: string; signal: string; quote: string }[]
}

type IntakeCase = {
  id: string
  alias: string
  ageGender: string
  issues: string[]
  /** 特殊議題（硬性過濾用） */
  specialIssues: string[]
  expectations: string[]
  dealbreakers: string[]
  bsrs: number
  bsrsSuicide: number
  crisisFlag: boolean
  submittedAt: string
  status: CaseStatus
  proposedTo?: string
  sections: IntakeSection[]
  packet: IntakePacket
}

type RecPractitioner = {
  name: string
  title: string
  orientation: string
  issueTags: string[]
  specialTags: string[]
  load: string
  loadRatio: number
}

const PRACTITIONERS: RecPractitioner[] = [
  {
    name: '吳靜蘭',
    title: '心理師',
    orientation: '人際歷程取向',
    issueTags: ['創傷議題', '情緒困擾', '悲傷失落'],
    specialTags: ['性創傷', '家庭暴力'],
    load: '3 / 6',
    loadRatio: 0.5,
  },
  {
    name: '許明遠',
    title: '心理師',
    orientation: '情緒取向（EFT）',
    issueTags: ['創傷議題', '親密關係', '情緒困擾'],
    specialTags: ['性創傷'],
    load: '5 / 6',
    loadRatio: 0.83,
  },
  {
    name: '陳以叡',
    title: '臨床心理師',
    orientation: '認知行為取向（CBT）',
    issueTags: ['睡眠困擾', '壓力調適', '情緒困擾'],
    specialTags: [],
    load: '4 / 8',
    loadRatio: 0.5,
  },
  {
    name: '林曉暖',
    title: '心理師',
    orientation: '焦點解決取向（SFBT）',
    issueTags: ['生涯規劃', '壓力調適', '自我探索'],
    specialTags: [],
    load: '6 / 10',
    loadRatio: 0.6,
  },
  {
    name: '周芷晴',
    title: '心理師',
    orientation: '正念取向（MBSR）',
    issueTags: ['壓力調適', '情緒困擾', '睡眠困擾'],
    specialTags: [],
    load: '7 / 8',
    loadRatio: 0.88,
  },
]

const CASES: IntakeCase[] = [
  {
    id: 'case-a',
    alias: '小禾',
    ageGender: '28 · 女',
    issues: ['創傷議題', '情緒困擾'],
    specialIssues: ['性創傷'],
    expectations: ['情緒支持與整理', '希望步調慢一點'],
    dealbreakers: ['不想被追問事件細節'],
    bsrs: 12,
    bsrsSuicide: 2,
    crisisFlag: true,
    submittedAt: '今天 09:41',
    status: 'pending',
    sections: [
      {
        title: '來談主訴',
        body: '「大概半年前發生了一些我不太想講的事，之後就常常突然很害怕、睡不好。最近連上班搭捷運都會胸悶。」（AI 追問脈絡後補充：症狀在人多的密閉空間特別明顯。）',
      },
      {
        title: '問題發展史',
        body: '事件後一至兩個月開始惡化；近一個月出現回避行為（改騎車通勤、推掉聚會）。',
      },
      {
        title: '過往晤談經驗',
        body: '無。曾想過求助但「不知道怎麼開口，也怕被一直問細節」。',
      },
      {
        title: '因應方式',
        body: '聽 podcast 轉移注意力（有點用）；深夜滑手機到累（隔天更糟）；跟一位大學好友講過一部分（講完有鬆一點）。',
      },
      {
        title: '支持系統',
        body: '大學好友一位（信任）；家人「不想讓他們知道」；同事關係普通。',
      },
      {
        title: '危機篩檢（BSRS-5）',
        body: '總分 12（中重度情緒困擾）；第 6 題（自殺想法）= 2。',
      },
      {
        title: '對晤談/心理師期待',
        body: '「希望有人可以接住我，不用急著要我好起來。」勾選：情緒支持與整理。雷點：不想被追問事件細節。',
      },
    ],
    packet: {
      summary: {
        chief: '疑似創傷事件後的焦慮與回避反應，伴隨睡眠困難與特定情境（密閉人多空間）的身體症狀。',
        context: '約半年前經歷當事人不願描述之事件，一至兩個月後症狀漸進惡化，近一個月回避行為明顯增加。',
        impact: '通勤方式改變、社交退縮、睡眠品質下降；工作出席尚可但自述「撐著」。',
      },
      coping: {
        emotion: ['向信任好友部分傾訴（有效，「講完有鬆一點」）'],
        behavior: ['聽 podcast 轉移注意力（部分有效）'],
        ineffective: ['深夜滑手機拖延入睡（自述隔天更糟）'],
      },
      support: ['大學好友一位（高信任）', '家人（刻意隔離：「不想讓他們知道」）', '同事（普通）'],
      language:
        '自我指涉比例高但情緒詞彙少而重複（「害怕」「不舒服」）；描述事件時轉為模糊代稱（「那件事」）——符合創傷敘事的迴避特徵。僅供臨床參考，不能取代行為觀察。',
      basicId: [
        { key: 'B', label: '行為', item: { text: '回避密閉人多空間、改變通勤方式、推辭聚會', quote: '改騎車通勤、推掉聚會' } },
        { key: 'A', label: '情感', item: { text: '突發性強烈恐懼、持續性緊張', quote: '常常突然很害怕' } },
        { key: 'S', label: '感覺', item: { text: '胸悶、睡眠困難', quote: '連上班搭捷運都會胸悶' } },
        { key: 'I', label: '心像', item: { text: '初談未涵蓋（文字自填未提及侵入性影像，首談需評估）' } },
        { key: 'C', label: '認知', item: { text: '對揭露的預期性恐懼', quote: '怕被一直問細節' } },
        { key: 'I2', label: '人際', item: { text: '選擇性隔離（對家人封鎖資訊、僅向一位好友部分揭露）', quote: '不想讓他們知道' } },
        { key: 'D', label: '生理/藥物', item: { text: '睡眠不足；用藥狀況初談未涵蓋' } },
      ],
      ppp: [
        { kind: '促發', text: '約半年前之未揭露事件', confidence: '高', evidence: '個案自陳時間線一致' },
        { kind: '維持', text: '回避行為阻斷修正性經驗', confidence: '中', evidence: '建議首談行為分析確認' },
        { kind: '易感', text: '求助門檻高（預期被追問、羞恥感）', confidence: '中', evidence: '建議以創傷知情原則建立安全感後評估' },
      ],
      fourChecks: [
        { label: '功能受損', signal: '疑似', quote: '通勤/社交模式改變，持續約一個月' },
        { label: '主觀痛苦', signal: '明確', quote: '「撐著」、BSRS 12 分' },
        { label: '造成他人困擾', signal: '無明顯訊號', quote: '—' },
        { label: '其他合理解釋', signal: '待排除', quote: '首談確認生理因素與物質使用' },
      ],
    },
  },
  {
    id: 'case-b',
    alias: '阿哲',
    ageGender: '34 · 男',
    issues: ['壓力調適', '睡眠困擾'],
    specialIssues: [],
    expectations: ['要具體行動方案', '希望每次有回家任務'],
    dealbreakers: ['只是聽沒有具體回饋'],
    bsrs: 7,
    bsrsSuicide: 0,
    crisisFlag: false,
    submittedAt: '昨天 21:18',
    status: 'pending',
    sections: [
      {
        title: '來談主訴',
        body: '「接了新專案之後每天睜眼就是工作，躺下腦子還在跑，睡四五個小時就醒。」（AI 追問影響後補充：開始對同事不耐煩，週末也無法放鬆。）',
      },
      { title: '問題發展史', body: '三個月前升任專案負責人後開始；近三週惡化，出現週日晚間強烈焦慮。' },
      { title: '過往晤談經驗', body: '兩年前因生涯議題晤談 4 次，「有幫助，但當時的老師比較多聽，我更想要方法」。' },
      { title: '因應方式', body: '運動（有效但最近沒時間）；睡前喝酒助眠（愈來愈沒用）；列待辦清單（有點用）。' },
      { title: '支持系統', body: '太太（支持但也開始擔心）；健身房朋友；父母（報喜不報憂）。' },
      { title: '危機篩檢（BSRS-5）', body: '總分 7（輕度情緒困擾）；第 6 題 = 0。' },
      {
        title: '對晤談/心理師期待',
        body: '勾選：找出解決方法、要行動建議、要回家任務。雷點：只是聽沒有具體回饋。',
      },
    ],
    packet: {
      summary: {
        chief: '職務轉換後的工作壓力與失眠，伴隨易怒與無法放鬆。',
        context: '三個月前升任專案負責人，責任範圍擴大；近三週症狀加劇並出現週日晚間預期性焦慮。',
        impact: '睡眠時數縮短（4–5 小時）、人際耐性下降、以酒助眠頻率上升。',
      },
      coping: {
        emotion: ['向太太傾訴（有效但開始擔心造成負擔）'],
        behavior: ['運動（有效，近期中斷）', '列待辦清單（部分有效）'],
        ineffective: ['睡前飲酒助眠（自述效果遞減）'],
      },
      support: ['太太（主要支持）', '健身房朋友', '父母（報喜不報憂）'],
      language:
        '任務導向詞彙密度高（「處理」「解決」「效率」），情緒詞出現時多伴隨自我批評（「不應該這麼沒用」）——與其明確表達的「要方法」期待一致。僅供臨床參考。',
      basicId: [
        { key: 'B', label: '行為', item: { text: '工時延長、運動中斷、睡前飲酒', quote: '睡前喝酒助眠' } },
        { key: 'A', label: '情感', item: { text: '焦慮、易怒、週日晚間預期性焦慮', quote: '對同事不耐煩' } },
        { key: 'S', label: '感覺', item: { text: '入睡困難、早醒', quote: '睡四五個小時就醒' } },
        { key: 'I', label: '心像', item: { text: '躺下後工作情境反覆浮現', quote: '躺下腦子還在跑' } },
        { key: 'C', label: '認知', item: { text: '高自我要求與自我批評傾向', quote: '不應該這麼沒用' } },
        { key: 'I2', label: '人際', item: { text: '支持系統可用但開始有耗損訊號', quote: '太太也開始擔心' } },
        { key: 'D', label: '生理/藥物', item: { text: '酒精使用頻率上升（助眠用途），需首談量化' } },
      ],
      ppp: [
        { kind: '促發', text: '升任專案負責人（角色與負荷改變）', confidence: '高', evidence: '時間線明確' },
        { kind: '維持', text: '以酒助眠干擾睡眠結構，形成惡性循環', confidence: '高', evidence: '個案自述效果遞減' },
        { kind: '易感', text: '高自我要求／表現連結自我價值', confidence: '中', evidence: '建議首談以量表或晤談確認' },
      ],
      fourChecks: [
        { label: '功能受損', signal: '輕度', quote: '工作可維持但人際耐性下降' },
        { label: '主觀痛苦', signal: '明確', quote: '主動求助、BSRS 7 分' },
        { label: '造成他人困擾', signal: '輕度訊號', quote: '太太開始擔心' },
        { label: '其他合理解釋', signal: '待排除', quote: '確認酒精使用量與其他生理因素' },
      ],
    },
  },
  {
    id: 'case-c',
    alias: '小魚',
    ageGender: '24 · 女',
    issues: ['自我探索', '人際關係'],
    specialIssues: [],
    expectations: ['釐清思緒', '想弄懂自己的模式'],
    dealbreakers: [],
    bsrs: 5,
    bsrsSuicide: 0,
    crisisFlag: false,
    submittedAt: '3 天前',
    status: 'proposed',
    proposedTo: '林曉暖',
    sections: [
      { title: '來談主訴', body: '「每段關係都在重複一樣的劇本，想知道問題是不是出在我身上。」' },
      { title: '危機篩檢（BSRS-5）', body: '總分 5（正常範圍上緣）；第 6 題 = 0。' },
      { title: '對晤談/心理師期待', body: '勾選：釐清思緒、整理感受。' },
    ],
    packet: {
      summary: {
        chief: '人際關係中的重複模式引發自我懷疑，主動尋求自我理解。',
        context: '近期一段友誼結束成為求助契機；自述「每段關係都走一樣的劇本」。',
        impact: '情緒低落但功能維持良好，動機清晰。',
      },
      coping: { emotion: ['寫日記（有效）'], behavior: ['閱讀心理相關書籍'], ineffective: [] },
      support: ['室友', '線上社群'],
      language: '後設認知詞彙多（「模式」「劇本」），自我觀察能力佳。僅供臨床參考。',
      basicId: [],
      ppp: [],
      fourChecks: [],
    },
  },
]

// ── 共用小元件 ──────────────────────────────────────────────────────────────

function DemoBanner({ note, onReset }: { note: string; onReset: () => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-dashed border-primary/70 bg-primary-soft/40 px-4 py-3">
      <span className="flex items-center gap-1.5 text-sm font-black text-foreground">
        <EyeIcon className="h-4 w-4" />
        示意模式
      </span>
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">{note}</p>
      <button
        onClick={onReset}
        className="rounded-full border border-border bg-card px-3.5 py-1 text-xs font-bold text-foreground transition hover:bg-muted"
      >
        重設示意
      </button>
    </div>
  )
}

function CrisisBanner({ c }: { c: IntakeCase }) {
  if (!c.crisisFlag) return null
  return (
    <div className="rounded-2xl bg-rust px-4 py-3 text-white">
      <p className="text-sm font-black">危機標記：BSRS-5 = {c.bsrs}，第 6 題（自殺想法）= {c.bsrsSuicide}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/85">
        個案端已於送出當下顯示 119／1925／1995 求助資源。此標記為輔助提示（同意書已載明無即時人工回應承諾）。
        排序建議：優先處理、優先媒合具相應專長之心理師。
      </p>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-black text-foreground">{title}</p>
      <div className="mt-2 text-sm leading-relaxed text-foreground/85">{children}</div>
    </div>
  )
}

function Chip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'mint' | 'peach' | 'pink' }) {
  const cls =
    tone === 'mint'
      ? 'bg-tile-mint text-[#3f6b46]'
      : tone === 'peach'
        ? 'bg-tile-peach text-[#8a6320]'
        : tone === 'pink'
          ? 'bg-tile-pink text-rust'
          : 'bg-muted text-muted-foreground'
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${cls}`}>{children}</span>
}

/** AI 初談包（全部標示草稿、附引用出處） */
function IntakePacketView({ c }: { c: IntakeCase }) {
  const p = c.packet
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        以下為 AI 根據個案自填資料整理之草稿，僅供專業人員參考，非診斷、非臨床結論。
        專業判斷與正式紀錄以心理師確認之內容為準。
      </p>
      <SectionCard title="主訴三段摘要（草稿）">
        <p><span className="font-bold">主訴：</span>{p.summary.chief}</p>
        <p className="mt-1"><span className="font-bold">脈絡：</span>{p.summary.context}</p>
        <p className="mt-1"><span className="font-bold">影響：</span>{p.summary.impact}</p>
      </SectionCard>
      <SectionCard title="因應清單（草稿）">
        <p><span className="font-bold">情緒因應：</span>{p.coping.emotion.join('；') || '—'}</p>
        <p className="mt-1"><span className="font-bold">行為因應：</span>{p.coping.behavior.join('；') || '—'}</p>
        <p className="mt-1"><span className="font-bold">已嘗試且無效：</span>{p.coping.ineffective.join('；') || '—'}</p>
      </SectionCard>
      <SectionCard title="支持系統摘要（草稿）">
        <div className="flex flex-wrap gap-1.5">
          {p.support.map((s) => (
            <Chip key={s}>{s}</Chip>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="語言特徵分析（僅供臨床參考，不能取代行為觀察）">{p.language}</SectionCard>
      {p.basicId.length > 0 && (
        <SectionCard title="BASIC-ID 草稿（每格附個案原句出處）">
          <div className="flex flex-col gap-2">
            {p.basicId.map((row) => (
              <div key={row.key} className="rounded-xl bg-muted/60 px-3 py-2">
                <p className="text-xs font-black text-foreground">
                  {row.key} · {row.label}
                </p>
                <p className="mt-0.5 text-sm text-foreground/85">{row.item.text}</p>
                {row.item.quote && (
                  <p className="mt-0.5 text-xs text-muted-foreground">出處：「{row.item.quote}」</p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {p.ppp.length > 0 && (
        <SectionCard title="易感／促發／維持因素草稿（附推論等級與佐證建議）">
          <div className="flex flex-col gap-2">
            {p.ppp.map((row, i) => (
              <div key={i} className="flex items-start gap-2">
                <Chip tone={row.kind === '促發' ? 'peach' : row.kind === '維持' ? 'pink' : 'mint'}>{row.kind}</Chip>
                <div className="min-w-0">
                  <p className="text-sm text-foreground/85">{row.text}</p>
                  <p className="text-xs text-muted-foreground">
                    推論信心：{row.confidence} · {row.evidence}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
      {p.fourChecks.length > 0 && (
        <SectionCard title="四項標準待驗證清單（供首談驗證）">
          <div className="flex flex-col gap-1.5">
            {p.fourChecks.map((row) => (
              <p key={row.label} className="text-sm text-foreground/85">
                <span className="font-bold">{row.label}：</span>
                {row.signal}
                <span className="ml-1 text-xs text-muted-foreground">（{row.quote}）</span>
              </p>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

function RawAnswersView({ c }: { c: IntakeCase }) {
  return (
    <div className="flex flex-col gap-3">
      {c.sections.map((s) => (
        <SectionCard key={s.title} title={s.title}>
          {s.body}
        </SectionCard>
      ))}
    </div>
  )
}

// ── 行政端：媒合工作台 ──────────────────────────────────────────────────────

export function IntakeWorkbenchPreview() {
  const [cases, setCases] = useState<IntakeCase[]>(CASES)
  const [selectedId, setSelectedId] = useState<string>(CASES[0].id)
  const [detailTab, setDetailTab] = useState<'packet' | 'raw'>('packet')

  const reset = () => {
    setCases(CASES)
    setSelectedId(CASES[0].id)
    setDetailTab('packet')
  }

  const selected = cases.find((c) => c.id === selectedId)!

  // 特殊議題硬性過濾；其餘依議題匹配數 → 接案量排序
  const recs = PRACTITIONERS.filter((pr) =>
    selected.specialIssues.length > 0
      ? selected.specialIssues.every((si) => pr.specialTags.includes(si))
      : true,
  )
    .map((pr) => ({
      pr,
      matched: pr.issueTags.filter((tg) => selected.issues.includes(tg)).length,
    }))
    .sort((a, b) => b.matched - a.matched || a.pr.loadRatio - b.pr.loadRatio)

  const assign = (name: string) => {
    setCases((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, status: 'proposed' as const, proposedTo: name } : c)),
    )
  }

  const sorted = [...cases].sort(
    (a, b) => Number(b.crisisFlag) - Number(a.crisisFlag) || Number(a.status !== 'pending') - Number(b.status !== 'pending'),
  )

  return (
    <div>
      <DemoBanner note="這是媒合工作台的示意。案件與心理師皆為假資料，互動不會寫入資料庫。" onReset={reset} />
      <h1 className="text-xl font-black text-foreground">媒合工作台</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        初談案件檢視與人工指派。危機標記案件置頂；特殊議題自動硬性過濾推薦名單。
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* 案件列表 */}
        <div className="flex flex-col gap-2.5">
          {sorted.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`rounded-2xl border p-3.5 text-left transition ${
                selectedId === c.id ? 'border-foreground bg-card shadow-soft' : 'border-border bg-card hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-black text-foreground">{c.alias}</span>
                <span className="text-xs text-muted-foreground">{c.ageGender}</span>
                {c.crisisFlag && <Chip tone="pink">危機</Chip>}
                <span className="ml-auto text-[10px] text-muted-foreground">{c.submittedAt}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {c.specialIssues.map((s) => (
                  <Chip key={s} tone="pink">
                    {s}
                  </Chip>
                ))}
                {c.issues.map((s) => (
                  <Chip key={s}>{s}</Chip>
                ))}
              </div>
              <p className="mt-1.5 text-xs font-bold">
                {c.status === 'pending' ? (
                  <span className="text-[#8a6320]">待處理</span>
                ) : c.status === 'proposed' ? (
                  <span className="text-muted-foreground">已指派 {c.proposedTo}，等待回覆</span>
                ) : (
                  <span className="text-[#3f6b46]">已接受 · 待首談</span>
                )}
              </p>
            </button>
          ))}
        </div>

        {/* 案件詳情 */}
        <div className="min-w-0 flex flex-col gap-3">
          <CrisisBanner c={selected} />

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-black text-foreground">{selected.alias}</span>
              <span className="text-sm text-muted-foreground">{selected.ageGender}</span>
              <span className="ml-auto text-xs text-muted-foreground">BSRS-5：{selected.bsrs} · 第 6 題：{selected.bsrsSuicide}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="text-xs font-bold text-muted-foreground">期待：</span>
              {selected.expectations.map((e) => (
                <Chip key={e} tone="mint">
                  {e}
                </Chip>
              ))}
              {selected.dealbreakers.map((d) => (
                <Chip key={d} tone="pink">
                  雷點：{d}
                </Chip>
              ))}
            </div>
          </div>

          {/* 原始回答 / AI 初談包 切換 */}
          <div className="inline-flex self-start rounded-full border border-border bg-card p-1">
            {(
              [
                { key: 'packet', label: 'AI 初談包' },
                { key: 'raw', label: '初談原始回答' },
              ] as const
            ).map((tb) => (
              <button
                key={tb.key}
                onClick={() => setDetailTab(tb.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                  detailTab === tb.key ? 'bg-foreground text-cream' : 'text-foreground hover:bg-muted'
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {detailTab === 'packet' ? <IntakePacketView c={selected} /> : <RawAnswersView c={selected} />}

          {/* 推薦心理師 */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-black text-foreground">推薦心理師（規則式排序：專長匹配 → 接案量）</p>
            {selected.specialIssues.length > 0 && (
              <p className="mt-1 text-xs font-bold text-rust">
                此案件含特殊議題「{selected.specialIssues.join('、')}」——僅顯示具相應專長的心理師。
              </p>
            )}
            <div className="mt-3 flex flex-col gap-2.5">
              {recs.map(({ pr, matched }) => (
                <div key={pr.name} className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground">
                      {pr.name} <span className="ml-1 text-xs font-bold text-muted-foreground">{pr.title} · {pr.orientation}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {pr.specialTags.map((tg) => (
                        <Chip key={tg} tone="pink">
                          {tg}
                        </Chip>
                      ))}
                      {pr.issueTags.map((tg) => (
                        <Chip key={tg} tone={selected.issues.includes(tg) ? 'mint' : 'muted'}>
                          {tg}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      議題匹配 {matched} · 接案 {pr.load}
                    </span>
                    {selected.status === 'pending' ? (
                      <button
                        onClick={() => assign(pr.name)}
                        className="rounded-full bg-gradient-primary px-4 py-1.5 text-xs font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
                      >
                        指派
                      </button>
                    ) : selected.proposedTo === pr.name ? (
                      <Chip tone="peach">等待回覆</Chip>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 心理師端：媒合邀請收件匣 ────────────────────────────────────────────────

type InviteState = 'incoming' | 'accepted' | 'declined'

export function MatchInvitesPreview() {
  const [state, setState] = useState<InviteState>('incoming')
  const [declineNote, setDeclineNote] = useState('')
  const [declining, setDeclining] = useState(false)
  const [detailTab, setDetailTab] = useState<'packet' | 'raw'>('packet')
  const invite = CASES[1] // 阿哲：職場壓力＋睡眠

  const reset = () => {
    setState('incoming')
    setDeclineNote('')
    setDeclining(false)
    setDetailTab('packet')
  }

  return (
    <div>
      <DemoBanner note="這是媒合邀請的示意。案件為假資料，互動不會寫入資料庫。" onReset={reset} />
      <h1 className="text-xl font-black text-foreground">媒合邀請</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        行政端依專長與期待為你配對的初談案件。接受後案件進入「待首談」，可先閱讀初談包做準備。
      </p>

      {state === 'declined' ? (
        <div className="mt-5 rounded-2xl border border-dashed border-border px-4 py-12 text-center">
          <p className="text-sm font-bold text-muted-foreground">已婉拒此配對，案件退回行政重新媒合。</p>
          <p className="mt-1 text-xs text-muted-foreground">婉拒理由：{declineNote || '（未填）'}</p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-black text-foreground">{invite.alias}</span>
              <span className="text-sm text-muted-foreground">{invite.ageGender}</span>
              {invite.issues.map((s) => (
                <Chip key={s}>{s}</Chip>
              ))}
              {state === 'accepted' && <Chip tone="mint">已接受 · 待首談</Chip>}
              <span className="ml-auto text-xs text-muted-foreground">指派時間：{invite.submittedAt}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="text-xs font-bold text-muted-foreground">個案期待：</span>
              {invite.expectations.map((e) => (
                <Chip key={e} tone="mint">
                  {e}
                </Chip>
              ))}
              {invite.dealbreakers.map((d) => (
                <Chip key={d} tone="pink">
                  雷點：{d}
                </Chip>
              ))}
            </div>
            <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              媒合理由（行政備註）：個案明確期待行動導向與回家任務，與你的工作風格及「壓力調適／睡眠困擾」專長相符。
            </p>
          </div>

          <div className="inline-flex self-start rounded-full border border-border bg-card p-1">
            {(
              [
                { key: 'packet', label: 'AI 初談包' },
                { key: 'raw', label: '初談原始回答' },
              ] as const
            ).map((tb) => (
              <button
                key={tb.key}
                onClick={() => setDetailTab(tb.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                  detailTab === tb.key ? 'bg-foreground text-cream' : 'text-foreground hover:bg-muted'
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {detailTab === 'packet' ? <IntakePacketView c={invite} /> : <RawAnswersView c={invite} />}

          {state === 'incoming' &&
            (declining ? (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-black text-foreground">婉拒理由（將回饋給行政）</p>
                <textarea
                  value={declineNote}
                  rows={2}
                  placeholder="例：近期接案已滿／此議題建議轉介更合適的專長"
                  onChange={(e) => setDeclineNote(e.target.value)}
                  className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setDeclining(false)}
                    className="flex-1 rounded-full border border-border bg-background py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted"
                  >
                    返回
                  </button>
                  <button
                    onClick={() => setState('declined')}
                    className="flex-1 rounded-full bg-rust py-2.5 text-sm font-extrabold text-white shadow-soft transition active:scale-[0.98]"
                  >
                    確認婉拒
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setDeclining(true)}
                  className="flex-1 rounded-full border border-border bg-card py-3 text-sm font-bold text-muted-foreground transition hover:bg-muted"
                >
                  婉拒
                </button>
                <button
                  onClick={() => setState('accepted')}
                  className="flex-1 rounded-full bg-gradient-primary py-3 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
                >
                  接受配對
                </button>
              </div>
            ))}

          {state === 'accepted' && (
            <div className="rounded-2xl bg-tile-mint px-4 py-3">
              <p className="text-sm font-black text-[#3f6b46]">已接受配對。個案將出現在「個案追蹤」，可開始安排首談。</p>
              <p className="mt-1 text-xs text-[#3f6b46]/80">正式版將同步通知行政端與個案端。</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
