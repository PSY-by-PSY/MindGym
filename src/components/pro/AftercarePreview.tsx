// 結案後（Aftercare）示意元件 —— 依 docs/plans/aftercare_subscription_plan.md。
// AftercarePreviewTab：/therapist「結案與延續」分頁，三步驟走完一條龍的最後一哩：
// 1. 結案交接（心理師發起）：畢業包——共創練習轉個人版、可見性強制轉私人、目標歸檔。
// 2. 個案端結案畫面（使用者視角預覽）：合作回顧＋訂閱方案（忠誠遞減）。
// 3. 自主使用與回流：每月自我健檢、溫和回流提示（個案自主，不自動轉介）。
// 全部為示意假資料、只動 local state、不寫資料庫。文案遵守用語法遵規範——
// 此階段屬「自我照顧層」，文案絕不可暗示專業服務仍在進行。
import { useState } from 'react'
import { DemoBanner, Chip, SectionCard } from './PreSessionPreview'

// ── 示意資料 ────────────────────────────────────────────────────────────────

const GRADUATION_ITEMS = [
  { title: '煩躁時刻的情緒覺察練習（三階段）', note: '轉為個人版：永久保留、可自行修改；可見性強制轉「完全私人」' },
  { title: '睡前煩惱清空', note: '轉為個人版：與心理師端徹底脫鉤' },
  { title: '狀態快照與成長軌跡', note: '完整保留在個案端，之後的自我健檢會接續同一條軌跡' },
]

const REVIEW_STATS = [
  { label: '合作週數', value: '8 週' },
  { label: '完成練習', value: '41 次' },
  { label: '情緒詞彙', value: '2 → 9 種' },
  { label: '困擾強度', value: '7 → 3' },
]

type Step = 'close' | 'clientView' | 'selfcare'

const STEPS: { key: Step; label: string }[] = [
  { key: 'close', label: '1 結案交接（心理師端）' },
  { key: 'clientView', label: '2 個案端結案畫面' },
  { key: 'selfcare', label: '3 自主使用與回流' },
]

// ── 主元件 ──────────────────────────────────────────────────────────────────

export function AftercarePreviewTab() {
  const [step, setStep] = useState<Step>('close')
  const [resetKey, setResetKey] = useState(0)

  return (
    <div>
      <DemoBanner
        note="這是結案與延續的示意。個案與內容皆為假資料，互動不會寫入資料庫。"
        onReset={() => {
          setStep('close')
          setResetKey((k) => k + 1)
        }}
      />
      <h1 className="text-xl font-black text-foreground">結案與延續</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        結案不是關係結束，是使用型態切換：個案帶著共創的練習回到日常，以訂閱持續使用。
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <button
            key={s.key}
            onClick={() => setStep(s.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
              step === s.key ? 'bg-foreground text-cream' : 'bg-card text-foreground hover:bg-muted'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {step === 'close' && <CloseCaseView key={`a-${resetKey}`} onDone={() => setStep('clientView')} />}
        {step === 'clientView' && <ClientClosureView onNext={() => setStep('selfcare')} />}
        {step === 'selfcare' && <SelfcareView key={`c-${resetKey}`} />}
      </div>
    </div>
  )
}

// ── 步驟 1：結案交接（心理師端） ─────────────────────────────────────────────

function CloseCaseView({ onDone }: { onDone: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [closed, setClosed] = useState(false)

  if (closed) {
    return (
      <div className="rounded-2xl bg-tile-mint px-4 py-6 text-center">
        <p className="text-base font-black text-[#3f6b46]">已完成結案。畢業包已送達個案端。</p>
        <p className="mt-1.5 text-sm text-[#3f6b46]/80">
          共創練習已全數轉為個人版、可見性轉完全私人；你的治療目標紀錄已歸檔（僅自己可見）。
        </p>
        <button
          onClick={onDone}
          className="mt-4 rounded-full bg-gradient-primary px-6 py-2.5 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
        >
          看個案端會看到什麼 →
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-black text-foreground">阿哲</span>
          <span className="text-sm text-muted-foreground">34 · 男</span>
          <Chip tone="mint">合作 8 週</Chip>
          <span className="ml-auto text-xs text-muted-foreground">上次晤談：3 天前</span>
        </div>
        <p className="mt-2 text-sm text-foreground/85">
          雙方已於上次晤談口頭確認目標達成、準備結案。按下「發起結案」後系統整理畢業包。
        </p>
      </div>

      <SectionCard title="畢業包內容（結案時自動整理）">
        <div className="flex flex-col gap-2">
          {GRADUATION_ITEMS.map((item) => (
            <div key={item.title} className="rounded-xl bg-muted/50 p-3">
              <p className="text-sm font-black text-foreground">{item.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] text-muted-foreground">
          結案後你將不再看到此個案的任何記錄或摘要；個案再次求助時需重新走媒合（可指定原夥伴）。
        </p>
      </SectionCard>

      {confirming ? (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-center text-sm font-bold text-foreground">
            確認結案？此動作會切斷你與個案資料的連結，無法自行復原。
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-full border border-border bg-background py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted"
            >
              再想想
            </button>
            <button
              onClick={() => setClosed(true)}
              className="flex-1 rounded-full bg-gradient-primary py-2.5 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
            >
              確認結案
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
        >
          發起結案
        </button>
      )}
    </div>
  )
}

// ── 步驟 2：個案端結案畫面（使用者視角預覽） ─────────────────────────────────

function ClientClosureView({ onNext }: { onNext: () => void }) {
  const [plan, setPlan] = useState<'free' | 'subscribe' | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">
        以下是個案在 App 裡看到的結案畫面（使用者視角預覽）。
      </p>

      <SectionCard title="這段合作的回顧">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {REVIEW_STATS.map((s) => (
            <div key={s.label} className="rounded-xl bg-primary-soft/40 p-3 text-center">
              <p className="text-lg font-black text-foreground">{s.value}</p>
              <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-sm leading-relaxed text-foreground/85">
          這 8 週你把「煩躁」拆成了 9 種可以被叫出名字的情緒，也找回了睡眠的節奏。
          這些練習現在完全屬於你——內容只有你自己看得到。
        </p>
      </SectionCard>

      <SectionCard title="接下來想怎麼繼續？">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setPlan('free')}
            className={`rounded-xl border p-3 text-left transition ${
              plan === 'free' ? 'border-primary bg-primary-soft/40' : 'border-border bg-card hover:bg-muted'
            }`}
          >
            <p className="text-sm font-black text-foreground">免費層</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              基本自我健檢（每月一次）＋已完成練習的歷史回顧（唯讀）。
            </p>
          </button>
          <button
            onClick={() => setPlan('subscribe')}
            className={`rounded-xl border p-3 text-left transition ${
              plan === 'subscribe' ? 'border-primary bg-primary-soft/40' : 'border-border bg-card hover:bg-muted'
            }`}
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-black text-foreground">訂閱層</p>
              <Chip tone="peach">連續訂閱第 4 個月起降價</Chip>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              個人版練習繼續使用與修改、AI 回饋與週摘要、完整成長軌跡、市集模板折扣。
            </p>
          </button>
        </div>
        {plan && (
          <p className="mt-2.5 rounded-xl bg-tile-mint px-3 py-2 text-xs font-bold text-[#3f6b46]">
            {plan === 'free'
              ? '已選擇免費層。之後隨時可以升級，成長軌跡都會保留。'
              : '已選擇訂閱層（示意，不進金流）。練習照舊、提醒照舊，只是不再有心理師在另一端。'}
          </p>
        )}
      </SectionCard>

      <button
        onClick={onNext}
        className="rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
      >
        看幾個月後的日常使用 →
      </button>
    </div>
  )
}

// ── 步驟 3：自主使用與回流 ───────────────────────────────────────────────────

const SELF_CHECK_TREND = [
  { label: '結案時', value: 3 },
  { label: '+1 月', value: 3 },
  { label: '+2 月', value: 4 },
  { label: '+3 月', value: 6 },
]

function SelfcareView() {
  const [checked, setChecked] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">
        個案結案三個月後的 App 畫面（使用者視角預覽）。練習與提醒照常運作，這裡只看自我健檢。
      </p>

      <SectionCard title="每月自我健檢（延續同一條成長軌跡）">
        <div className="flex items-end gap-5 px-2 pt-2">
          {SELF_CHECK_TREND.map((p) => (
            <div key={p.label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-sm font-black text-foreground">{p.value}</span>
              <div className="flex h-24 w-8 items-end overflow-hidden rounded-lg bg-muted">
                <div
                  className={`w-full rounded-lg ${p.value >= 6 ? 'bg-rust/70' : 'bg-primary/70'}`}
                  style={{ height: `${p.value * 10}%` }}
                />
              </div>
              <span className="text-[11px] font-bold text-muted-foreground">{p.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">困擾強度（0–10）。本月自評 6 分，越過回流提示門檻。</p>
        {!checked && (
          <button
            onClick={() => setChecked(true)}
            className="mt-3 w-full rounded-full bg-gradient-primary py-2.5 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
          >
            完成本月自我健檢
          </button>
        )}
      </SectionCard>

      {checked && (
        <div className="rounded-2xl border border-primary/40 bg-primary-soft/30 p-4">
          <p className="text-sm font-black text-foreground">最近好像比較辛苦，要不要找人聊聊？</p>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
            這三個月你的困擾強度慢慢往上走。這不代表退步——生活本來就有起伏。
            如果你想，隨時可以回來安排一次心理諮詢；也可以繼續用自己的步調練習。
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button className="flex-1 rounded-full bg-gradient-primary py-2.5 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]">
              重新安排媒合（可指定上次合作的夥伴）
            </button>
            <button className="flex-1 rounded-full border border-border bg-card py-2.5 text-sm font-bold text-foreground transition hover:bg-muted">
              先不用，繼續自己練習
            </button>
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
            提示由分數規則觸發、僅供參考，決定權在你。不會自動通知任何人（危機篩檢訊號除外，
            依同意書所載機制處理）。若有立即危險請撥打 119、1925 安心專線或 1995 生命線。
          </p>
        </div>
      )}
    </div>
  )
}
