// 量表上傳與轉化建構器（專業夥伴端）：上傳量表 → AI 轉譯 → 編修維度/題目 → 設定 → 預覽＋送審。
// 送審沿用既有 /api/pro/submit-module（AI 安全標籤對任何 kind 的 draft_content 皆適用）。
import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { track } from '../../lib/analytics'
import { useLanguage } from '../../lib/i18n/context'
import {
  COMMON_SCALE_PRESETS,
  emptyAssessmentContent,
  newBlockId,
  type AssessmentModuleContent,
  type AssessmentDimension,
  type AssessmentQuestion,
  type ProModuleRow,
} from '../../lib/proModules'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'
const MAX_SOFT_QUESTIONS = 20

type Step = 1 | 2 | 3 | 4

const COLOR_TILES = ['bg-tile-mint', 'bg-tile-blue', 'bg-tile-peach', 'bg-tile-pink', 'bg-tile-lemon']

function newDimensionKey(existing: AssessmentDimension[]): string {
  return `D${existing.length + 1}`
}

export function AssessmentBuilder({
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
  const [estMinutes, setEstMinutes] = useState(module?.est_minutes != null ? String(module.est_minutes) : '10')
  const existing = (module?.draft_content ?? module?.published_content) as AssessmentModuleContent | undefined
  const [content, setContent] = useState<AssessmentModuleContent>(existing ?? emptyAssessmentContent())
  const [scaleText, setScaleText] = useState('')
  const [transforming, setTransforming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isPublished = !!module?.published_content

  const setScaleName = (name: string) => setContent((c) => ({ ...c, source_scale: { ...c.source_scale, name } }))

  const runTransform = async () => {
    if (!content.source_scale.name.trim() || !scaleText.trim()) {
      setError(t('請填寫量表名稱與內容'))
      return
    }
    setTransforming(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(`${API_URL}/api/pro/scale-transform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ scale_name: content.source_scale.name, scale_text: scaleText }),
      })
      if (!resp.ok) throw new Error(`transform ${resp.status}`)
      const data = (await resp.json()) as { dimensions: AssessmentDimension[]; questions: AssessmentQuestion[] }
      setContent((c) => ({ ...c, dimensions: data.dimensions, questions: data.questions }))
      track('pro_scale_transform_run', { question_count: data.questions.length })
      if (!title.trim()) setTitle(content.source_scale.name)
      setStep(2)
    } catch (e) {
      console.error('[scale transform]', e)
      setError(t('轉譯失敗，請稍後再試。'))
    } finally {
      setTransforming(false)
    }
  }

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => setScaleText(String(reader.result ?? ''))
    reader.readAsText(file)
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
        console.error('[assessment save draft]', rpcError)
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
        kind: 'assessment',
      })
      .select('id')
      .single()
    if (insertError || !data) {
      console.error('[assessment create]', insertError)
      setError(t('建立失敗，請稍後再試。'))
      return null
    }
    const newId = data.id as string
    setModuleId(newId)
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
      track('pro_module_submitted', { module_id: id, kind: 'assessment' })
      onDone()
    } catch (e) {
      console.error('[assessment submit]', e)
      setError(t('送審失敗，請稍後再試。'))
    } finally {
      setBusy(false)
      setConfirmSubmit(false)
    }
  }

  const steps: { key: Step; label: string }[] = [
    ...(isNew ? [{ key: 1 as Step, label: t('上傳量表') }] : []),
    { key: 2, label: t('編修') },
    { key: 3, label: t('設定') },
    { key: 4, label: t('預覽') },
  ]

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button onClick={onCancel} className="text-sm font-bold text-muted-foreground transition hover:text-foreground">
          {t('← 返回列表')}
        </button>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm font-bold text-[#3f6b46]">{t('已儲存')}</span>}
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

      {step === 1 && (
        <StepUpload
          scaleName={content.source_scale.name}
          onScaleName={setScaleName}
          scaleText={scaleText}
          onScaleText={setScaleText}
          transforming={transforming}
          onTransform={runTransform}
          fileInputRef={fileInputRef}
          onFile={handleFile}
        />
      )}
      {step === 2 && (
        <StepEdit
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
      {step === 3 && <StepSettings content={content} onContent={setContent} />}
      {step === 4 && <StepPreview title={title} content={content} />}

      {confirmSubmit && (
        <ConfirmDialog
          title={t('送審這個模組？')}
          body={t('送審後將由管理員依心理學標準審核（含版權與臨床風險備註），通過後個案才能使用新內容。')}
          confirmLabel={busy ? t('送審中…') : t('確認送審')}
          onConfirm={handleSubmit}
          onCancel={() => !busy && setConfirmSubmit(false)}
        />
      )}
    </div>
  )
}

// ── Step 1：上傳量表 ────────────────────────────────────────────────────────

function StepUpload({
  scaleName,
  onScaleName,
  scaleText,
  onScaleText,
  transforming,
  onTransform,
  fileInputRef,
  onFile,
}: {
  scaleName: string
  onScaleName: (v: string) => void
  scaleText: string
  onScaleText: (v: string) => void
  transforming: boolean
  onTransform: () => void
  fileInputRef: React.RefObject<HTMLInputElement>
  onFile: (file: File) => void
}) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-foreground">
          {t('量表名稱')}
          <span className="ml-1 text-rust">*</span>
        </span>
        <input
          value={scaleName}
          onChange={(e) => onScaleName(e.target.value)}
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-[15px] text-foreground outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>

      <div>
        <p className="mb-2 text-xs font-bold text-muted-foreground">{t('常用量表快速帶入（僅帶入名稱與維度骨架，需自行貼上完整題目）')}</p>
        <div className="flex flex-wrap gap-2">
          {COMMON_SCALE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => {
                onScaleName(preset.label)
                onScaleText(`（${preset.hint}）\n\n請在此貼上完整量表題目全文……`)
              }}
              className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-bold text-foreground transition hover:bg-muted"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-bold text-foreground">
          {t('量表全文（題目＋維度說明）')}
          <span className="ml-1 text-rust">*</span>
        </span>
        <textarea
          value={scaleText}
          onChange={(e) => onScaleText(e.target.value)}
          rows={12}
          placeholder={t('貼上量表全文，包含各題題目與維度分類說明……')}
          className="w-full resize-y rounded-xl border border-border bg-card px-4 py-2.5 text-[14px] leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>

      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-full border border-dashed border-border bg-card px-4 py-2 text-sm font-bold text-muted-foreground transition hover:bg-muted"
        >
          {t('上傳 .txt 檔（選填）')}
        </button>
      </div>

      <button
        onClick={onTransform}
        disabled={transforming}
        className="mt-2 w-full rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
      >
        {transforming ? t('AI 轉譯中…') : t('AI 轉譯')}
      </button>
    </div>
  )
}

// ── Step 2：編修 ────────────────────────────────────────────────────────────

function StepEdit({
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
  content: AssessmentModuleContent
  onContent: (updater: (c: AssessmentModuleContent) => AssessmentModuleContent) => void
}) {
  const { t } = useLanguage()

  const patchDimension = (key: string, patch: Partial<AssessmentDimension>) =>
    onContent((c) => ({ ...c, dimensions: c.dimensions.map((d) => (d.key === key ? { ...d, ...patch } : d)) }))
  const removeDimension = (key: string) =>
    onContent((c) => ({ ...c, dimensions: c.dimensions.filter((d) => d.key !== key) }))
  const addDimension = () =>
    onContent((c) => {
      const key = newDimensionKey(c.dimensions)
      return { ...c, dimensions: [...c.dimensions, { key, name: t('新維度'), description: '', color_index: c.dimensions.length % 5 }] }
    })

  const patchQuestion = (id: string, patch: Partial<AssessmentQuestion>) =>
    onContent((c) => ({ ...c, questions: c.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }))
  const removeQuestion = (id: string) =>
    onContent((c) => ({ ...c, questions: c.questions.filter((q) => q.id !== id) }))
  const addQuestion = () =>
    onContent((c) => ({
      ...c,
      questions: [
        ...c.questions,
        {
          id: newBlockId(),
          dimension: c.dimensions[0]?.key ?? '',
          original: '',
          translated: '',
          hints: [],
          required: true,
        },
      ],
    }))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
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
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('預估時間（分鐘）')}</span>
          <input
            type="number"
            value={estMinutes}
            onChange={(e) => onEstMinutes(e.target.value)}
            className="w-32 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-foreground">{t('模組說明')}</span>
        <textarea
          value={description}
          rows={2}
          onChange={(e) => onDescription(e.target.value)}
          className="w-full resize-none rounded-xl border border-border bg-card px-4 py-2.5 text-[15px] leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-black text-foreground">{t('維度')}</p>
          <button onClick={addDimension} className="text-sm font-bold text-primary">
            ＋ {t('新增維度')}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {content.dimensions.map((d, i) => (
            <div key={d.key} className={`rounded-2xl ${COLOR_TILES[i % COLOR_TILES.length]} p-3`}>
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-black text-foreground">{d.key}</span>
                <input
                  value={d.name}
                  onChange={(e) => patchDimension(d.key, { name: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-border/50 bg-background/70 px-2.5 py-1.5 text-sm font-bold text-foreground outline-none"
                />
                <button onClick={() => removeDimension(d.key)} className="shrink-0 text-sm font-bold text-rust">
                  ✕
                </button>
              </div>
              <textarea
                value={d.description}
                onChange={(e) => patchDimension(d.key, { description: e.target.value })}
                rows={1}
                placeholder={t('維度描述（選填）')}
                className="mt-2 w-full resize-none rounded-lg border border-border/50 bg-background/70 px-2.5 py-1.5 text-xs text-foreground outline-none"
              />
            </div>
          ))}
          {content.dimensions.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              {t('還沒有維度。先在「上傳量表」步驟執行 AI 轉譯，或手動新增。')}
            </p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-black text-foreground">{t('題目（{n} 題）', { n: content.questions.length })}</p>
          <button onClick={addQuestion} className="text-sm font-bold text-primary">
            ＋ {t('新增題目')}
          </button>
        </div>
        {content.questions.length > MAX_SOFT_QUESTIONS && (
          <p className="mb-2 rounded-xl bg-tile-pink px-3 py-2 text-xs font-bold text-rust">
            {t('題數超過建議上限 {n} 題，可考慮精簡（送審不會強制擋）。', { n: MAX_SOFT_QUESTIONS })}
          </p>
        )}
        <div className="flex flex-col gap-3">
          {content.questions.map((q) => (
            <div key={q.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="mb-2 flex items-center gap-2">
                <select
                  value={q.dimension}
                  onChange={(e) => patchQuestion(q.id, { dimension: e.target.value })}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-bold text-foreground"
                >
                  {content.dimensions.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.key} · {d.name}
                    </option>
                  ))}
                </select>
                {q.sensitive && (
                  <span className="rounded-full bg-tile-pink px-2 py-0.5 text-[11px] font-extrabold text-rust">{t('敏感題')}</span>
                )}
                <button onClick={() => removeQuestion(q.id)} className="ml-auto shrink-0 text-sm font-bold text-rust">
                  ✕
                </button>
              </div>
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('原題（唯讀）')}</p>
                <p className="mt-0.5 text-sm text-foreground/70">{q.original || t('（無）')}</p>
              </div>
              <div className="mt-2">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('轉譯題')}</p>
                <textarea
                  value={q.translated}
                  onChange={(e) => patchQuestion(q.id, { translated: e.target.value })}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="mt-2">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('引導提示（每行一條）')}</p>
                <textarea
                  value={q.hints.join('\n')}
                  onChange={(e) => patchQuestion(q.id, { hints: e.target.value.split('\n').filter((h) => h.trim()) })}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Step 3：設定 ────────────────────────────────────────────────────────────

function StepSettings({
  content,
  onContent,
}: {
  content: AssessmentModuleContent
  onContent: (updater: (c: AssessmentModuleContent) => AssessmentModuleContent) => void
}) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('開場引導語')}</span>
        <textarea
          value={content.intro}
          rows={3}
          onChange={(e) => onContent((c) => ({ ...c, intro: e.target.value }))}
          className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>

      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold text-foreground">
        <span
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
            content.review_before_send ? 'bg-foreground' : 'bg-muted'
          }`}
        >
          <span
            className={`inline-block h-4.5 w-4.5 transform rounded-full bg-cream shadow transition ${
              content.review_before_send ? 'translate-x-[22px]' : 'translate-x-[3px]'
            }`}
          />
        </span>
        {t('個案版報告需我確認後才發送')}
        <input
          type="checkbox"
          className="sr-only"
          checked={content.review_before_send}
          onChange={(e) => onContent((c) => ({ ...c, review_before_send: e.target.checked }))}
        />
      </label>

      <div className="flex items-start gap-2.5 rounded-2xl bg-tile-blue px-4 py-3">
        <InfoIcon />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-foreground/70">{t('知情同意文案（無法關閉）')}</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/85">{content.consent_text}</p>
        </div>
      </div>
    </div>
  )
}

function InfoIcon() {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0 text-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.01" />
    </svg>
  )
}

// ── Step 4：預覽 ────────────────────────────────────────────────────────────

function StepPreview({ title, content }: { title: string; content: AssessmentModuleContent }) {
  const { t } = useLanguage()
  const first = content.questions[0]
  const dim = content.dimensions.find((d) => d.key === first?.dimension)
  return (
    <div className="mx-auto max-w-sm rounded-[32px] border border-border bg-background p-5 shadow-soft">
      <p className="mb-3 text-center text-[15px] font-black text-foreground">{title || t('（未命名模組）')}</p>
      {content.intro?.trim() && <p className="mb-3 text-sm leading-relaxed text-foreground-soft">{content.intro}</p>}
      <div className="mb-3 rounded-2xl bg-tile-blue px-4 py-3">
        <p className="text-xs font-bold text-foreground/80">{content.consent_text}</p>
      </div>
      {first ? (
        <div className="rounded-2xl bg-card p-4 shadow-soft">
          <p className="mb-2 text-xs font-bold text-muted-foreground">
            1 / {content.questions.length} · {dim?.name ?? first.dimension}
          </p>
          <p className="text-[15px] font-bold text-foreground">{first.translated}</p>
          {first.hints.length > 0 && (
            <div className="mt-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              {first.hints.map((h) => (
                <p key={h}>・{h}</p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('還沒有題目可預覽。')}</p>
      )}
    </div>
  )
}

// ── 共用：確認對話框 ────────────────────────────────────────────────────────

function ConfirmDialog({
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
