// 日記模組建構器（專業夥伴端）：四步驟精靈 — 選日記類型／記錄格式／AI 回饋／預覽。
// 新建模組從 step 1（選模板）開始；編輯既有 diary 模組直接從 step 2 起（型態已定，不可更改）。
// 送審沿用既有 /api/pro/submit-module（AI 安全標籤對任何 kind 的 draft_content 皆適用）。
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { track } from '../../lib/analytics'
import { useLanguage } from '../../lib/i18n/context'
import { BlockEditor } from './BlockEditor'
import { BlockRenderer } from './BlockRenderer'
import {
  DIARY_TEMPLATES,
  emptyDiaryContent,
  type DiaryTemplate,
  type DiaryModuleContent,
  type DiaryFeedbackStyle,
  type OverallFocus,
  type ProModuleRow,
  type ProAnswers,
  type ProAnswerValue,
} from '../../lib/proModules'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

type Step = 1 | 2 | 3 | 4

const DAILY_STYLES: { key: DiaryFeedbackStyle; label: string; hint: string }[] = [
  { key: 'warm', label: '溫暖肯定', hint: '像朋友一樣給你溫暖的肯定' },
  { key: 'reflective', label: '深度反思', hint: '多問一個開放式問題，帶你想深一點' },
  { key: 'brief', label: '簡短鼓勵', hint: '一句話的輕巧鼓勵' },
  { key: 'zen', label: '禪意留白', hint: '留白的短句，給你呼吸空間' },
  { key: 'celebrate', label: '活力慶祝', hint: '用熱情的語氣為你慶祝' },
]

const OVERALL_FOCUS_OPTIONS: { key: OverallFocus; label: string }[] = [
  { key: 'themes', label: '重複主題' },
  { key: 'emotion_arc', label: '情緒變化' },
  { key: 'depth_growth', label: '深度成長' },
  { key: 'unsaid', label: '未說出口的' },
]

const THRESHOLD_PRESETS = [3, 5, 10]

const REMINDER_PRESETS: { label: string; time: string }[] = [
  { label: '早上 8:00', time: '08:00' },
  { label: '晚上 21:00', time: '21:00' },
]

export function DiaryBuilder({
  ownerId,
  module,
  onDone,
  onCancel,
}: {
  ownerId: string
  module: ProModuleRow | null
  onDone: () => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  const isNew = !module
  const [moduleId, setModuleId] = useState<string | null>(module?.id ?? null)
  const [step, setStep] = useState<Step>(isNew ? 1 : 2)
  const [title, setTitle] = useState(module?.title ?? '')
  const [description, setDescription] = useState(module?.description ?? '')
  const [estMinutes, setEstMinutes] = useState(module?.est_minutes != null ? String(module.est_minutes) : '5')
  const existing = (module?.draft_content ?? module?.published_content) as DiaryModuleContent | undefined
  const [content, setContent] = useState<DiaryModuleContent>(existing ?? emptyDiaryContent())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmSubmit, setConfirmSubmit] = useState(false)

  const isPublished = !!module?.published_content

  const patchFeedback = (patch: Partial<DiaryModuleContent['feedback']>) =>
    setContent((c) => ({ ...c, feedback: { ...c.feedback, ...patch } }))

  const pickTemplate = (tpl: DiaryTemplate) => {
    const built = tpl.build()
    setContent(built)
    if (!title.trim()) setTitle(t(tpl.label))
    setStep(2)
  }

  const parseEst = (): number | null => {
    const n = parseInt(estMinutes, 10)
    return Number.isFinite(n) ? n : null
  }

  const saveDraft = async (): Promise<string | null> => {
    if (!title.trim()) {
      setError(t('請填寫模組標題'))
      setStep(2)
      return null
    }
    setError(null)
    if (moduleId) {
      const { error: rpcError } = await supabase.rpc('update_module_draft', {
        p_module_id: moduleId,
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_est_minutes: parseEst(),
        p_draft_content: content,
      })
      if (rpcError) {
        console.error('[diary save draft]', rpcError)
        setError(t('儲存失敗，請稍後再試。'))
        return null
      }
      return moduleId
    }
    const { data, error: insertError } = await supabase
      .from('pro_modules')
      .insert({
        owner_id: ownerId,
        title: title.trim(),
        description: description.trim() || null,
        est_minutes: parseEst(),
        draft_content: content,
        status: 'draft',
        kind: 'diary',
      })
      .select('id')
      .single()
    if (insertError || !data) {
      console.error('[diary create]', insertError)
      setError(t('建立失敗，請稍後再試。'))
      return null
    }
    const newId = data.id as string
    setModuleId(newId)
    track('pro_diary_created', { module_id: newId })
    return newId
  }

  const handleSave = async () => {
    setBusy(true)
    const id = await saveDraft()
    setBusy(false)
    if (id) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleSubmit = async () => {
    setBusy(true)
    const id = await saveDraft()
    if (!id) {
      setBusy(false)
      setConfirmSubmit(false)
      return
    }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(`${API_URL}/api/pro/submit-module`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ module_id: id }),
      })
      if (!resp.ok) throw new Error(`submit ${resp.status}`)
      track('pro_module_submitted', { module_id: id, kind: 'diary' })
      onDone()
    } catch (e) {
      console.error('[diary submit]', e)
      setError(t('送審失敗，請稍後再試。'))
    } finally {
      setBusy(false)
      setConfirmSubmit(false)
    }
  }

  const steps: { key: Step; label: string }[] = [
    ...(isNew ? [{ key: 1 as Step, label: t('選日記類型') }] : []),
    { key: 2, label: t('記錄格式') },
    { key: 3, label: t('Bouba 回饋') },
    { key: 4, label: t('預覽') },
  ]

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button onClick={onCancel} className="text-sm font-bold text-muted-foreground transition hover:text-foreground">
          {t('← 返回列表')}
        </button>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm font-bold text-[#71744F]">{t('已儲存')}</span>}
          <button
            onClick={handleSave}
            disabled={busy}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-bold text-foreground transition hover:bg-muted disabled:opacity-60"
          >
            {t('儲存草稿')}
          </button>
          <button
            onClick={() => setConfirmSubmit(true)}
            disabled={busy}
            className="rounded-full bg-gradient-primary px-5 py-2 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {t('送審')}
          </button>
        </div>
      </div>

      {isPublished && (
        <p className="mb-4 rounded-2xl bg-tile-peach px-4 py-3 text-sm font-medium text-[#8a6320]">
          {t('個案目前使用的是已上架版本；修改內容需重新審核通過後才會生效。')}
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {steps.map((s) => (
          <button
            key={s.key}
            onClick={() => setStep(s.key)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              step === s.key ? 'bg-foreground text-cream shadow-soft' : 'bg-card text-foreground hover:bg-muted'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm font-bold text-rust">{error}</p>}

      {step === 1 && <StepPickTemplate onPick={pickTemplate} />}
      {step === 2 && (
        <StepFormat
          title={title}
          onTitle={setTitle}
          description={description}
          onDescription={setDescription}
          estMinutes={estMinutes}
          onEstMinutes={setEstMinutes}
          content={content}
          onContent={setContent}
        />
      )}
      {step === 3 && <StepFeedback content={content} onPatchFeedback={patchFeedback} />}
      {step === 4 && <StepPreview title={title} content={content} />}

      {confirmSubmit && (
        <DiaryConfirmDialog
          title={t('送審這個模組？')}
          body={t('送審後將由管理員依心理學標準審核，通過後個案才能使用新內容。')}
          confirmLabel={busy ? t('送審中…') : t('確認送審')}
          onConfirm={handleSubmit}
          onCancel={() => !busy && setConfirmSubmit(false)}
        />
      )}
    </div>
  )
}

// ── Step 1：選日記類型 ──────────────────────────────────────────────────────

function StepPickTemplate({ onPick }: { onPick: (tpl: DiaryTemplate) => void }) {
  const { t } = useLanguage()
  const categories = [...new Set(DIARY_TEMPLATES.filter((tpl) => tpl.category).map((tpl) => tpl.category))]
  const blanks = DIARY_TEMPLATES.filter((tpl) => !tpl.category)

  return (
    <div className="flex flex-col gap-6">
      {categories.map((cat) => (
        <div key={cat}>
          <h3 className="mb-2.5 text-sm font-black text-foreground">{t(cat)}</h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {DIARY_TEMPLATES.filter((tpl) => tpl.category === cat).map((tpl) => (
              <button
                key={tpl.key}
                onClick={() => onPick(tpl)}
                className="rounded-2xl border border-border bg-card px-4 py-3 text-left transition hover:bg-muted hover:border-primary active:scale-[0.99]"
              >
                <p className="text-[15px] font-black text-foreground">
                  <span className="mr-1.5">{tpl.emoji}</span>
                  {t(tpl.label)}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{t(tpl.hint)}</p>
              </button>
            ))}
          </div>
        </div>
      ))}
      {blanks.length > 0 && (
        <div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {blanks.map((tpl) => (
              <button
                key={tpl.key}
                onClick={() => onPick(tpl)}
                className="rounded-2xl border border-dashed border-border bg-card px-4 py-3 text-left transition hover:bg-muted hover:border-primary active:scale-[0.99]"
              >
                <p className="text-[15px] font-black text-foreground">
                  <span className="mr-1.5">{tpl.emoji}</span>
                  {t(tpl.label)}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{t(tpl.hint)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Step 2：記錄格式 ────────────────────────────────────────────────────────

function StepFormat({
  title,
  onTitle,
  description,
  onDescription,
  estMinutes,
  onEstMinutes,
  content,
  onContent,
}: {
  title: string
  onTitle: (v: string) => void
  description: string
  onDescription: (v: string) => void
  estMinutes: string
  onEstMinutes: (v: string) => void
  content: DiaryModuleContent
  onContent: (updater: (c: DiaryModuleContent) => DiaryModuleContent) => void
}) {
  const { t } = useLanguage()
  const reminder = content.reminder ?? { enabled: true, time: '21:00' }

  const setReminder = (next: { enabled: boolean; time: string }) =>
    onContent((c) => ({ ...c, reminder: next }))

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-foreground">
            {t('模組標題')}
            <span className="ml-1 text-rust">*</span>
          </span>
          <input
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-[15px] text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-foreground">{t('模組說明')}</span>
          <textarea
            value={description}
            rows={3}
            onChange={(e) => onDescription(e.target.value)}
            className="w-full resize-none rounded-xl border border-border bg-card px-4 py-2.5 text-[15px] leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('預估時間（分鐘）')}</span>
          <input
            type="number"
            value={estMinutes}
            onChange={(e) => onEstMinutes(e.target.value)}
            className="w-32 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('開場引導語（選填）')}</span>
          <textarea
            value={content.intro ?? ''}
            rows={2}
            onChange={(e) => onContent((c) => ({ ...c, intro: e.target.value }))}
            className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>

        <div>
          <p className="mb-2 text-sm font-black text-foreground">{t('每日要填的題目')}</p>
          <BlockEditor blocks={content.blocks} onChange={(blocks) => onContent((c) => ({ ...c, blocks }))} />
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('結語（選填）')}</span>
          <textarea
            value={content.outro ?? ''}
            rows={2}
            onChange={(e) => onContent((c) => ({ ...c, outro: e.target.value }))}
            className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>

        <div>
          <p className="mb-2 text-sm font-black text-foreground">{t('提醒時間')}</p>
          <div className="flex flex-wrap gap-2">
            {REMINDER_PRESETS.map((p) => (
              <button
                key={p.time}
                onClick={() => setReminder({ enabled: true, time: p.time })}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-bold transition ${
                  reminder.enabled && reminder.time === p.time
                    ? 'border-foreground bg-foreground text-cream'
                    : 'border-border bg-card text-foreground hover:bg-muted'
                }`}
              >
                {t(p.label)}
              </button>
            ))}
            <button
              onClick={() => setReminder({ enabled: false, time: reminder.time })}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-bold transition ${
                !reminder.enabled ? 'border-foreground bg-foreground text-cream' : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
            >
              {t('不提醒')}
            </button>
            <label
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-bold transition ${
                reminder.enabled && !REMINDER_PRESETS.some((p) => p.time === reminder.time)
                  ? 'border-foreground bg-foreground text-cream'
                  : 'border-border bg-card text-foreground'
              }`}
            >
              {t('自訂')}
              <input
                type="time"
                value={reminder.time}
                onChange={(e) => setReminder({ enabled: true, time: e.target.value })}
                className="w-[92px] bg-transparent text-sm outline-none [color-scheme:light] [&::-webkit-calendar-picker-indicator]:opacity-60"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-sm font-black text-foreground">{t('個案看到的樣子')}</p>
        <div className="rounded-[22px] border border-border bg-background p-5 shadow-soft">
          {content.blocks.length === 0 && !content.intro && !content.outro ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('新增題目後這裡會即時預覽。')}</p>
          ) : (
            <DiaryReadOnlyPreview content={content} />
          )}
        </div>
      </div>
    </div>
  )
}

function DiaryReadOnlyPreview({ content }: { content: DiaryModuleContent }) {
  const [answers, setAnswers] = useState<ProAnswers>({})
  const onChange = (id: string, value: ProAnswerValue) => setAnswers((prev) => ({ ...prev, [id]: value }))
  return <BlockRenderer content={content} answers={answers} onChange={onChange} />
}

// ── Step 3：AI 回饋 ─────────────────────────────────────────────────────────

function FeedbackTierCard({
  tile,
  title,
  hint,
  children,
}: {
  tile: string
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-2xl ${tile} p-4`}>
      <p className="text-sm font-black text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-foreground/70">{hint}</p>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-bold transition ${
        active ? 'border-foreground bg-foreground text-cream' : 'border-border bg-card text-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold text-foreground">
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          checked ? 'bg-foreground' : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block h-4.5 w-4.5 transform rounded-full bg-cream shadow transition ${
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
          }`}
        />
      </span>
      {label}
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function StepFeedback({
  content,
  onPatchFeedback,
}: {
  content: DiaryModuleContent
  onPatchFeedback: (patch: Partial<DiaryModuleContent['feedback']>) => void
}) {
  const { t } = useLanguage()
  const { daily, overall, weekly } = content.feedback
  const [customThreshold, setCustomThreshold] = useState(
    THRESHOLD_PRESETS.includes(overall.threshold) ? '' : String(overall.threshold),
  )

  return (
    <div className="flex flex-col gap-4">
      <FeedbackTierCard tile="bg-tile-mint" title={t('每日即時回饋')} hint={t('個案每次填寫完，立即看到一段簡短回饋')}>
        <div className="flex flex-wrap gap-2">
          {DAILY_STYLES.map((s) => (
            <Chip key={s.key} active={daily.style === s.key} onClick={() => onPatchFeedback({ daily: { ...daily, style: s.key } })}>
              {t(s.label)}
            </Chip>
          ))}
        </div>
      </FeedbackTierCard>

      <FeedbackTierCard tile="bg-tile-blue" title={t('整體回饋 · 滿 N 則解鎖')} hint={t('累積一定則數後，生成一份跨紀錄的整體觀察')}>
        <div className="flex flex-col gap-3">
          <Toggle checked={overall.enabled} onChange={(v) => onPatchFeedback({ overall: { ...overall, enabled: v } })} label={t('啟用整體回饋')} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">{t('門檻')}</span>
            {THRESHOLD_PRESETS.map((n) => (
              <Chip key={n} active={overall.threshold === n} onClick={() => onPatchFeedback({ overall: { ...overall, threshold: n } })}>
                {t('{n} 則', { n })}
              </Chip>
            ))}
            <input
              type="number"
              min={1}
              placeholder={t('自訂')}
              value={customThreshold}
              onChange={(e) => {
                setCustomThreshold(e.target.value)
                const n = parseInt(e.target.value, 10)
                if (Number.isFinite(n) && n > 0) onPatchFeedback({ overall: { ...overall, threshold: n } })
              }}
              className="w-20 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">{t('聚焦')}</span>
            {OVERALL_FOCUS_OPTIONS.map((f) => {
              const active = overall.focus.includes(f.key)
              return (
                <Chip
                  key={f.key}
                  active={active}
                  onClick={() =>
                    onPatchFeedback({
                      overall: {
                        ...overall,
                        focus: active ? overall.focus.filter((x) => x !== f.key) : [...overall.focus, f.key],
                      },
                    })
                  }
                >
                  {t(f.label)}
                </Chip>
              )
            })}
          </div>
        </div>
      </FeedbackTierCard>

      <FeedbackTierCard tile="bg-tile-peach" title={t('一週成長報告 · 滿 7 天解鎖')} hint={t('累積 7 個不同日期的紀錄後，生成一份週報')}>
        <div className="flex flex-col gap-3">
          <Toggle checked={weekly.enabled} onChange={(v) => onPatchFeedback({ weekly: { ...weekly, enabled: v } })} label={t('啟用一週成長報告')} />
          <div className="flex flex-wrap gap-2">
            <Toggle
              checked={weekly.sections.trend}
              onChange={(v) => onPatchFeedback({ weekly: { ...weekly, sections: { ...weekly.sections, trend: v } } })}
              label={t('趨勢')}
            />
            <Toggle
              checked={weekly.sections.quotes}
              onChange={(v) => onPatchFeedback({ weekly: { ...weekly, sections: { ...weekly.sections, quotes: v } } })}
              label={t('金句回顧')}
            />
            <Toggle
              checked={weekly.sections.challenge}
              onChange={(v) => onPatchFeedback({ weekly: { ...weekly, sections: { ...weekly.sections, challenge: v } } })}
              label={t('下週小挑戰')}
            />
          </div>
          <Toggle
            checked={weekly.sync_to_practitioner}
            onChange={(v) => onPatchFeedback({ weekly: { ...weekly, sync_to_practitioner: v } })}
            label={t('同步週報摘要給我（專業夥伴）')}
          />
        </div>
      </FeedbackTierCard>

      <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3">
        <ShieldIcon />
        <p className="text-sm font-bold text-foreground">{t('情緒風險偵測常駐啟用（無法關閉）')}</p>
      </div>
    </div>
  )
}

function ShieldIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 text-[#71744F]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

// ── Step 4：預覽 ────────────────────────────────────────────────────────────

function StepPreview({ title, content }: { title: string; content: DiaryModuleContent }) {
  const { t } = useLanguage()
  const [answers, setAnswers] = useState<ProAnswers>({})
  const onChange = (id: string, value: ProAnswerValue) => setAnswers((prev) => ({ ...prev, [id]: value }))
  const weekLabels = [t('一'), t('二'), t('三'), t('四'), t('五'), t('六'), t('日')]

  return (
    <div className="mx-auto max-w-sm rounded-[32px] border border-border bg-background p-5 shadow-soft">
      <p className="mb-3 text-center text-[15px] font-black text-foreground">{title || t('（未命名模組）')}</p>

      <div className="mb-4 flex justify-between rounded-2xl bg-card px-3 py-2.5 shadow-soft">
        {weekLabels.map((d, i) => (
          <span
            key={d}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              i < 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {d}
          </span>
        ))}
      </div>

      <BlockRenderer content={content} answers={answers} onChange={onChange} />

      {content.feedback.daily.enabled && (
        <div className="mt-4 rounded-2xl bg-tile-mint p-4">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-[#71744F]">{t('Bouba 即時回饋')}</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/85">{t('（範例）謝謝你今天願意好好陪自己看看這些感受。')}</p>
        </div>
      )}
      {content.feedback.overall.enabled && (
        <div className="mt-3 rounded-2xl bg-tile-blue p-4">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-foreground/70">{t('整體回饋')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('還差 {n} 則解鎖', { n: content.feedback.overall.threshold })}</p>
        </div>
      )}
      {content.feedback.weekly.enabled && (
        <div className="mt-3 rounded-2xl bg-tile-peach p-4 opacity-55">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-foreground/70">{t('一週成長報告')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('還差 7 天解鎖')}</p>
        </div>
      )}
    </div>
  )
}

// ── 共用：確認對話框（與 therapist.tsx 內部樣式一致，獨立元件避免跨檔耦合） ──────

function DiaryConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1c1714]/40 px-6" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-[24px] bg-background p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-foreground">{title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-foreground-soft">{body}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="w-full rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
          >
            {confirmLabel}
          </button>
          <button onClick={onCancel} className="w-full rounded-full py-2.5 text-sm font-bold text-muted-foreground">
            {t('取消')}
          </button>
        </div>
      </div>
    </div>
  )
}
