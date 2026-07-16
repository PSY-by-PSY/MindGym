// 晤談後（Post-Session）示意元件 —— 依 docs/plans/post_session_mvp_plan.md。
// PostSessionPreviewTab：/therapist「晤談後追蹤」分頁，含兩個子頁：
// 1. 練習共創：知識庫檢索（附「為什麼適合這位個案」脈絡建議）＋口述生成（push-to-talk
//    示意）→ 三階段練習方案（覺察→涵容→調節，階段升級由心理師確認）→ 目標掛勾檢查
//    → 隱私四級選擇 → 指派。
// 2. 週報素材庫：切換隱私層級即時看「心理師能看到什麼」的差異——摘要可見層只有
//    AI 週摘要與完成度，原文鎖死；含快照趨勢與情緒詞彙分析示意。
// 全部為示意假資料、只動 local state、不寫資料庫。文案遵守用語法遵規範。
import { useState } from 'react'
import { DemoBanner, Chip, SectionCard } from './PreSessionPreview'

// ── 型別與示意資料 ──────────────────────────────────────────────────────────

type LibraryItem = {
  id: string
  title: string
  orientation: string
  desc: string
  whyFit: string
}

const PRACTICE_LIBRARY: LibraryItem[] = [
  {
    id: 'lib-emotion-granularity',
    title: '情緒粒度日記',
    orientation: '正向心理學',
    desc: '每次情緒浮現時，練習用更精準的詞彙命名它——從「不舒服」到「悶、緊繃、被逼著跑」。',
    whyFit: '初談包語言特徵顯示情緒詞彙少而重複，且個案期待「要具體行動方案」——從命名練習切入門檻低、回饋快。',
  },
  {
    id: 'lib-three-good-things',
    title: '三件好事',
    orientation: '正向心理學（PERMA）',
    desc: '每晚睡前記下今天三件還不錯的事與自己的貢獻，重訓注意力的預設方向。',
    whyFit: '個案自我批評傾向明顯（「不應該這麼沒用」），適合作為平衡自我對話的第二階段練習。',
  },
  {
    id: 'lib-worry-dump',
    title: '睡前煩惱清空',
    orientation: '認知行為取向',
    desc: '睡前 10 分鐘把腦中盤旋的事項全部寫下，並為每項標記「今天能做／明天再說」。',
    whyFit: '直接對應主訴「躺下腦子還在跑」——把反芻外部化，降低入睡前的認知激發。',
  },
  {
    id: 'lib-breathing-space',
    title: '3 分鐘呼吸空間',
    orientation: '正念取向',
    desc: '覺察當下—聚焦呼吸—擴展到全身，三步驟的迷你正念練習。',
    whyFit: '適合搭配「煩躁時刻」使用的即時調節工具，可作為第三階段（調節）的候選。',
  },
]

const MOCK_GOALS = ['提升情緒粒度覺察', '重建睡眠節奏']

const DICTATION_SAMPLE =
  '我想讓阿哲每次覺得煩躁的時候，先停下來記錄當下的情緒，用自己的話描述就好，一天至少一次。之後我們再慢慢加上停留跟涵容的部分，最後才是調節，先不用急。'

type Stage = { name: string; desc: string; freq: string; locked: boolean }

const PLAN_STAGES: Stage[] = [
  { name: '階段 1 · 覺察', desc: '每次注意到煩躁，用一句自己的話寫下當下的情緒與情境。', freq: '想到就記，一天至少 1 次', locked: false },
  { name: '階段 2 · 接觸涵容', desc: '在覺察之後多停留 30 秒，描述身體的感覺，不急著趕走它。', freq: '升階後開啟', locked: true },
  { name: '階段 3 · 調節', desc: '選一個當下做得到的安撫行動（呼吸空間、離開座位走走）。', freq: '升階後開啟', locked: true },
]

type Visibility = 'full' | 'summary' | 'completion' | 'private'

const VISIBILITY_OPTIONS: { key: Visibility; label: string; desc: string }[] = [
  { key: 'full', label: '全部可見', desc: '心理師可以看到每一篇記錄的完整內容。' },
  { key: 'summary', label: '摘要可見', desc: '心理師只看到 AI 週摘要與完成度，看不到任何原文。' },
  { key: 'completion', label: '僅完成度', desc: '心理師只知道你有沒有做，看不到內容也沒有摘要。' },
  { key: 'private', label: '完全私人', desc: '這個練習的一切只有你自己看得到。' },
]

// ── 主元件 ──────────────────────────────────────────────────────────────────

type SubTab = 'cocreate' | 'digest'

export function PostSessionPreviewTab() {
  const [sub, setSub] = useState<SubTab>('cocreate')
  const [resetKey, setResetKey] = useState(0)

  return (
    <div>
      <DemoBanner
        note="這是晤談後追蹤的示意。個案與內容皆為假資料，互動不會寫入資料庫。"
        onReset={() => setResetKey((k) => k + 1)}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-foreground">晤談後追蹤</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            與阿哲的晤談結束後：共創回家練習、依隱私授權接收週報素材。
          </p>
        </div>
        <div className="inline-flex rounded-full border border-border bg-card p-1">
          {(
            [
              { key: 'cocreate', label: '練習共創' },
              { key: 'digest', label: '週報素材庫' },
            ] as const
          ).map((tb) => (
            <button
              key={tb.key}
              onClick={() => setSub(tb.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                sub === tb.key ? 'bg-foreground text-cream' : 'text-foreground hover:bg-muted'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {sub === 'cocreate' ? <CoCreateView key={`c-${resetKey}`} /> : <DigestView key={`d-${resetKey}`} />}
      </div>
    </div>
  )
}

// ── 練習共創 ────────────────────────────────────────────────────────────────

type CoCreateStep = 'source' | 'draft' | 'privacy' | 'assigned'

function CoCreateView() {
  const [step, setStep] = useState<CoCreateStep>('source')
  const [query, setQuery] = useState('')
  const [dictating, setDictating] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [sourceNote, setSourceNote] = useState('')
  const [goal, setGoal] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<Visibility | null>(null)

  const filtered = query.trim()
    ? PRACTICE_LIBRARY.filter(
        (i) => i.title.includes(query.trim()) || i.orientation.includes(query.trim()) || i.desc.includes(query.trim()),
      )
    : PRACTICE_LIBRARY

  if (step === 'source') {
    return (
      <div className="flex flex-col gap-4">
        {/* 路徑一：知識庫檢索 */}
        <SectionCard title="路徑一 · 從練習庫開始（AI 依個案脈絡建議）">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋練習庫，例：情緒、睡眠、正念"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="mt-3 flex flex-col gap-2.5">
            {filtered.map((item) => (
              <div key={item.id} className="rounded-xl bg-muted/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-black text-foreground">{item.title}</p>
                  <Chip tone="peach">{item.orientation}</Chip>
                </div>
                <p className="mt-1 text-sm text-foreground/80">{item.desc}</p>
                <p className="mt-1.5 rounded-lg bg-primary-soft/40 px-2.5 py-1.5 text-xs leading-relaxed text-foreground/80">
                  <span className="font-black">為什麼適合這位個案：</span>
                  {item.whyFit}
                </p>
                <button
                  onClick={() => {
                    setSourceNote(`來源：練習庫「${item.title}」（${item.orientation}），依個案脈絡調整`)
                    setStep('draft')
                  }}
                  className="mt-2 rounded-full border border-primary/50 bg-primary-soft/40 px-3 py-1 text-xs font-bold text-foreground transition hover:bg-primary-soft/70"
                >
                  以此為起點共創
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                找不到相符的練習，換個關鍵字，或改用下方口述生成。
              </p>
            )}
          </div>
        </SectionCard>

        {/* 路徑二：口述生成 */}
        <SectionCard title="路徑二 · 口述生成（push-to-talk 示意，非環境錄音）">
          <p className="text-xs text-muted-foreground">
            按住說話（示意按鈕），把想給個案的練習用口語描述，AI 轉成結構化模板；語音檔轉完即刪，只留文字草稿。
          </p>
          {!transcript ? (
            <button
              onClick={() => {
                setDictating(true)
                setTimeout(() => {
                  setDictating(false)
                  setTranscript(DICTATION_SAMPLE)
                }, 900)
              }}
              disabled={dictating}
              className={`mt-3 w-full rounded-full py-3 text-base font-extrabold shadow-soft transition active:scale-[0.98] ${
                dictating ? 'bg-muted text-muted-foreground' : 'bg-gradient-primary text-primary-foreground'
              }`}
            >
              {dictating ? '聆聽中…（示意）' : '按住說話'}
            </button>
          ) : (
            <>
              <textarea
                value={transcript}
                rows={3}
                onChange={(e) => setTranscript(e.target.value)}
                className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                onClick={() => {
                  setSourceNote('來源：心理師口述生成（逐字稿已確認）')
                  setStep('draft')
                }}
                className="mt-2 w-full rounded-full bg-gradient-primary py-2.5 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
              >
                生成結構化模板
              </button>
            </>
          )}
        </SectionCard>
      </div>
    )
  }

  if (step === 'draft') {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">{sourceNote}</p>
        <SectionCard title="練習方案草稿：煩躁時刻的情緒覺察練習（共視確認中）">
          <div className="flex flex-col gap-2">
            {PLAN_STAGES.map((s) => (
              <div
                key={s.name}
                className={`rounded-xl p-3 ${s.locked ? 'bg-muted/40' : 'border border-primary/40 bg-primary-soft/30'}`}
              >
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-black ${s.locked ? 'text-muted-foreground' : 'text-foreground'}`}>{s.name}</p>
                  {s.locked ? <Chip>升階後開啟</Chip> : <Chip tone="mint">進行中</Chip>}
                </div>
                <p className={`mt-1 text-sm ${s.locked ? 'text-muted-foreground' : 'text-foreground/85'}`}>{s.desc}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">頻率：{s.freq}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            階段升級由心理師確認（系統依完成度建議、不自動升階）。記錄形式：文字（語音／繪畫為 v2）。
          </p>
        </SectionCard>

        <SectionCard title="目標掛勾（AI 提示：這個練習服務哪個目標？）">
          <div className="flex flex-wrap gap-2">
            {MOCK_GOALS.map((g) => (
              <button
                key={g}
                onClick={() => setGoal(g)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-bold transition ${
                  goal === g ? 'border-primary bg-primary-soft text-foreground' : 'border-border bg-card text-foreground hover:bg-muted'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          {goal && (
            <p className="mt-2 text-xs font-bold text-[#3f6b46]">
              已掛在「{goal}」之下——治療目標本身只有你看得到，個案端只會看到練習內容。
            </p>
          )}
        </SectionCard>

        <button
          onClick={() => setStep('privacy')}
          disabled={!goal}
          className="rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-50"
        >
          下一步：與個案一起選隱私層級
        </button>
      </div>
    )
  }

  if (step === 'privacy') {
    return (
      <div className="flex flex-col gap-3">
        <SectionCard title="隱私層級（共視畫面，由雙方一起選、個案拍板）">
          <p className="text-sm text-foreground/85">這個練習的記錄，你希望心理師看到多少？之後隨時可以調整，不用說明理由。</p>
          <div className="mt-3 flex flex-col gap-2">
            {VISIBILITY_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => setVisibility(o.key)}
                className={`rounded-xl border p-3 text-left transition ${
                  visibility === o.key ? 'border-primary bg-primary-soft/40' : 'border-border bg-card hover:bg-muted'
                }`}
              >
                <p className="text-sm font-black text-foreground">{o.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{o.desc}</p>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            任何層級下，危機篩檢訊號仍會依同意書所載機制處理（危機例外）。
          </p>
        </SectionCard>
        <button
          onClick={() => setStep('assigned')}
          disabled={!visibility}
          className="rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-50"
        >
          確認並指派練習
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-tile-mint px-4 py-6 text-center">
      <p className="text-base font-black text-[#3f6b46]">已指派「煩躁時刻的情緒覺察練習」給阿哲。</p>
      <p className="mt-1.5 text-sm text-[#3f6b46]/80">
        隱私層級：{VISIBILITY_OPTIONS.find((o) => o.key === visibility)?.label}。個案 App 將收到練習與提醒排程；
        週報素材庫會依這個層級生成內容——切到右上「週報素材庫」看效果。
      </p>
    </div>
  )
}

// ── 週報素材庫 ──────────────────────────────────────────────────────────────

const SNAPSHOT_TREND = [
  { label: '首談', value: 7 },
  { label: '第 2 週', value: 6 },
  { label: '本週', value: 5 },
]

const MOCK_ENTRIES = [
  { day: '週一 22:41', text: '開會被主管當眾唸，整個下午都很悶，回家路上才發現拳頭一直握著。' },
  { day: '週三 12:10', text: '午休前趕文件又煩躁了，這次有停下來寫，好像有鬆一點。' },
  { day: '週日 21:03', text: '明天要週會，又開始緊繃。至少這次知道自己是「預期性的緊繃」。' },
]

function DigestView() {
  const [level, setLevel] = useState<Visibility>('summary')

  return (
    <div className="flex flex-col gap-3">
      <SectionCard title="隱私層級對照（切換看看心理師端會看到什麼）">
        <div className="flex flex-wrap gap-2">
          {VISIBILITY_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setLevel(o.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
                level === o.key ? 'bg-foreground text-cream' : 'bg-card text-foreground hover:bg-muted'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          目前示意：阿哲把「煩躁時刻的情緒覺察練習」設為「{VISIBILITY_OPTIONS.find((o) => o.key === level)?.label}」。
        </p>
      </SectionCard>

      {level === 'private' ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          此練習為完全私人，週報不包含任何內容。
          <br />
          <span className="text-xs">（危機篩檢訊號仍依同意書機制處理，不受此層級影響。）</span>
        </p>
      ) : (
        <>
          <SectionCard title="完成度">
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[71%] rounded-full bg-primary" />
              </div>
              <span className="text-sm font-black text-foreground">5 / 7 天</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">連續記錄 3 天；週日晚間仍是規律出現的高張力時段。</p>
          </SectionCard>

          {level !== 'completion' && (
            <>
              <SectionCard title="AI 週摘要（依授權生成；摘要層不逐字引用原文）">
                <p className="text-sm leading-relaxed text-foreground/85">
                  本週共記錄 5 次煩躁時刻，多集中在工作情境（會議與趕件），其中 2 次在記錄後自評「有鬆一點」。
                  值得注意的變化：個案開始能區分「當下的煩躁」與「預期性的緊繃」——情緒詞彙從上週的 2 種
                  增加到本週 5 種（悶、煩躁、緊繃、鬆一口氣、預期性緊張）。週日晚間的預期性焦慮仍明顯，
                  可作為下次晤談切入點。
                </p>
              </SectionCard>

              <SectionCard title="情緒詞彙分析（個人化）">
                <div className="flex flex-wrap gap-1.5">
                  {['悶', '煩躁', '緊繃', '鬆一口氣', '預期性緊張'].map((w) => (
                    <Chip key={w} tone="mint">
                      {w}
                    </Chip>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  情緒粒度：2 種 → 5 種（週增 +3）。與「提升情緒粒度覺察」目標的階段 1 進展一致，
                  可考慮下次晤談討論升階到階段 2（接觸涵容）。
                </p>
              </SectionCard>
            </>
          )}

          <SectionCard title="狀態快照趨勢（困擾強度，0–10）">
            <div className="flex items-end gap-6 px-2 pt-2">
              {SNAPSHOT_TREND.map((p) => (
                <div key={p.label} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-sm font-black text-foreground">{p.value}</span>
                  <div className="flex h-24 w-8 items-end overflow-hidden rounded-lg bg-muted">
                    <div className="w-full rounded-lg bg-primary/70" style={{ height: `${p.value * 10}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-muted-foreground">{p.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">7 → 6 → 5：下降趨勢，成長軌跡的前三個資料點。</p>
          </SectionCard>

          {level === 'full' ? (
            <SectionCard title="原文記錄（全部可見層級）">
              <div className="flex flex-col gap-2">
                {MOCK_ENTRIES.map((e) => (
                  <div key={e.day} className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs font-bold text-muted-foreground">{e.day}</p>
                    <p className="mt-0.5 text-sm text-foreground/85">{e.text}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : level === 'summary' ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              原文不可見（摘要可見層級）——資料層直接擋下，並非前端隱藏。
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
