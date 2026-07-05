import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { WorkshopGate } from '../components/workshop/WorkshopGate'
import {
  WorkshopLayout,
  WorkshopTextarea,
  CompletionActions,
} from '../components/workshop/WorkshopUI'
import { supabase } from '../lib/supabase'
import { insertCommunityPost, markStreak } from '../lib/communityPost'
import { isoLocalDate } from '../lib/date'
import { getWorkshopId } from '../lib/workshop'
import { downloadNodeAsPng, isMobileDevice } from '../lib/shareImage'
import { DEFAULT_PRIVACY } from '../lib/privacy'
import { useLanguage } from '../lib/i18n/context'
import type { Language } from '../lib/i18n/language'

type TFn = (text: string, vars?: Record<string, string | number>) => string

export const Route = createFileRoute('/app/workshop/authentic-self')({
  component: AuthenticSelfModule,
})

function AuthenticSelfModule() {
  return (
    <WorkshopGate>
      <AuthenticSelfFlow />
    </WorkshopGate>
  )
}

const TOTAL_STEPS = 9

const getWorkLabels = (t: TFn) => [
  t('工作・第 1 件'),
  t('工作・第 2 件'),
  t('工作・第 3 件'),
]
const getLifeLabels = (t: TFn) => [
  t('生活・第 1 件'),
  t('生活・第 2 件'),
  t('生活・第 3 件'),
]

type Triple = [string, string, string]
const emptyTriple = (): Triple => ['', '', '']

interface Narrative {
  who: string
  did: string
  kind: string
}

function AuthenticSelfFlow() {
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [workItems, setWorkItems] = useState<Triple>(emptyTriple)
  const [lifeItems, setLifeItems] = useState<Triple>(emptyTriple)
  const [workReflection, setWorkReflection] = useState('')
  const [lifeReflection, setLifeReflection] = useState('')
  const [narrative, setNarrative] = useState<Narrative>({ who: '', did: '', kind: '' })

  const [userId, setUserId] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [sharing, setSharing] = useState(false)

  const rankCardRef = useRef<HTMLDivElement>(null)
  const coreValueCardRef = useRef<HTMLDivElement>(null)
  const narrativeCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null))
  }, [])

  const restart = () => {
    setWorkItems(emptyTriple())
    setLifeItems(emptyTriple())
    setWorkReflection('')
    setLifeReflection('')
    setNarrative({ who: '', did: '', kind: '' })
    setPublishing(false)
    setPublished(false)
    setStep(1)
  }

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const back = () => setStep((s) => Math.max(s - 1, 1))

  const setWorkAt = (i: number, v: string) =>
    setWorkItems((prev) => prev.map((x, j) => (j === i ? v : x)) as Triple)
  const setLifeAt = (i: number, v: string) =>
    setLifeItems((prev) => prev.map((x, j) => (j === i ? v : x)) as Triple)

  const topWork = workItems[0]?.trim() ?? ''
  const topLife = lifeItems[0]?.trim() ?? ''

  const handleDownload = async (
    ref: React.RefObject<HTMLDivElement>,
    filename: string,
    title: string,
  ) => {
    if (!ref.current || sharing) return
    setSharing(true)
    try {
      await downloadNodeAsPng(ref.current, filename, title)
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') console.error('[share image]', e)
    } finally {
      setSharing(false)
    }
  }

  const publish = async () => {
    if (!userId || publishing) return
    setPublishing(true)
    try {
      const narrativeText = assembleNarrative(t, narrative)
      const workReason = workReflection.trim()
      const lifeReason = lifeReflection.trim()
      const workshopId = getWorkshopId()
      const entryId = await insertCommunityPost(
        userId,
        'workshop_authentic_self',
        {
          item_1: narrativeText,
          item_2: topWork ? t('工作：{v}', { v: topWork }) : '',
          item_3: topLife ? t('生活：{v}', { v: topLife }) : '',
          ai_feedback: null,
        },
        DEFAULT_PRIVACY,
        {
          v: 'authentic_self',
          top_work: topWork,
          top_life: topLife,
          work_reason: workReason,
          life_reason: lifeReason,
          narrative: narrativeText,
          workshop_id: workshopId,
        },
      )
      setPublished(true)
      await markStreak(userId)
      await router.invalidate()
      // 規格 [3]：發佈後導引至「當天工作坊貼文頁面」。
      navigate({
        to: '/app/community',
        search: { workshop: workshopId, ...(entryId ? { focus: entryId } : {}) },
      })
    } catch (e) {
      console.error('[authentic-self publish]', e)
      setPublishing(false)
      alert(t('發佈失敗，請稍後再試一次。'))
    }
  }

  const today = formatDate(new Date(), language)
  const downloadLabel = isMobileDevice() ? t('分享圖片') : t('儲存圖片')
  const workLabels = getWorkLabels(t)
  const lifeLabels = getLifeLabels(t)

  // ── 步驟 1：覺察重要生命事件（工作） ──────────────────────────────
  if (step === 1) {
    return (
      <WorkshopLayout step={1} total={TOTAL_STEPS} title={t('覺察重要生命事件')} onNext={next}>
        <AwarenessGuide />
        <FieldGroup title={t('工作上的 3 件事')} accent="bg-tile-blue">
          {workLabels.map((label, i) => (
            <LabeledField
              key={label}
              label={label}
              value={workItems[i]}
              onChange={(v) => setWorkAt(i, v)}
              placeholder={t('例如：主動爭取負責一個新專案')}
            />
          ))}
        </FieldGroup>
      </WorkshopLayout>
    )
  }

  // ── 步驟 2：覺察重要生命事件（生活） ──────────────────────────────
  if (step === 2) {
    return (
      <WorkshopLayout step={2} total={TOTAL_STEPS} title={t('覺察重要生命事件')} onBack={back} onNext={next}>
        <AwarenessGuide />
        <FieldGroup title={t('生活上的 3 件事')} accent="bg-tile-mint">
          {lifeLabels.map((label, i) => (
            <LabeledField
              key={label}
              label={label}
              value={lifeItems[i]}
              onChange={(v) => setLifeAt(i, v)}
              placeholder={t('例如：決定開始長期的運動習慣')}
            />
          ))}
        </FieldGroup>
      </WorkshopLayout>
    )
  }

  // ── 步驟 3：排序重要生命事件 ──────────────────────────────────────
  if (step === 3) {
    return (
      <WorkshopLayout step={3} total={TOTAL_STEPS} title={t('排序重要生命事件')} minutes={5} onBack={back} onNext={next}>
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          {t('用上下箭頭調整順序，把對你')}{' '}
          <strong className="font-bold text-foreground">{t('最有影響力、最重要')}</strong>{' '}
          {t('的事件排到第一名。工作與生活分開排序。')}
        </div>

        <RankList title={t('工作')} accent="bg-tile-blue" items={workItems} onReorder={setWorkItems} />
        <RankList title={t('生活')} accent="bg-tile-mint" items={lifeItems} onReorder={setLifeItems} />
      </WorkshopLayout>
    )
  }

  // ── 步驟 4：我重要的生命事件（生成圖 + 儲存） ──────────────────────
  if (step === 4) {
    return (
      <>
        {/* 畫面外高解析下載圖 */}
        <div ref={rankCardRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0" style={{ width: 1080, height: 1440 }}>
          <RankShareCard workItems={workItems} lifeItems={lifeItems} date={today} />
        </div>

        <WorkshopLayout step={4} total={TOTAL_STEPS} title={t('我在工作與生活中的重要生命事件')} onBack={back} onNext={next}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('這是你排序後的重要生命事件，你可以把它儲存下來，留作紀念。')}
          </p>

          <div className="mt-5 rounded-3xl bg-gradient-soft p-5 shadow-soft">
            <RankedColumn title={t('工作')} accent="bg-tile-blue" items={workItems} />
            <div className="my-4 h-px bg-foreground/10" />
            <RankedColumn title={t('生活')} accent="bg-tile-mint" items={lifeItems} />
          </div>

          <button
            type="button"
            onClick={() => handleDownload(rankCardRef, `life-events-${isoLocalDate(new Date())}.png`, t('我的重要生命事件'))}
            disabled={sharing}
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full border border-border bg-white text-sm font-extrabold tracking-[0.15em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {sharing ? t('正在生成圖片…') : downloadLabel}
          </button>
        </WorkshopLayout>
      </>
    )
  }

  // ── 步驟 5：分享你最重要的生命事件（討論環節，提問優化 1） ────────────
  if (step === 5) {
    return (
      <WorkshopLayout step={5} total={TOTAL_STEPS} title={t('分享你最重要的生命事件')} minutes={15} onBack={back} onNext={next}>
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          <p className="font-bold text-foreground">{t('為什麼這對你來說很重要？')}</p>
          <p className="mt-1.5">
            {t('兩人一組，針對排序第一的事件，分享你做這件事情的核心原因。時間為 15 分鐘，請大家輪流分享。')}
          </p>
          <p className="mt-3">
            {t('邀請你，試著進一步反思這個選擇背後的核心價值觀、信念或需求。')}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            <li className="flex gap-2">
              <span className="text-primary">・</span>{t('這個選擇之所以重要，是因為你在乎什麼呢？')}
            </li>
            <li className="flex gap-2">
              <span className="text-primary">・</span>{t('這個決定背後，你最重視的是什麼？')}
            </li>
            <li className="flex gap-2">
              <span className="text-primary">・</span>{t('這個經驗／決定，滿足了你哪方面的需求？')}
            </li>
          </ul>
        </div>

        <p className="mt-6 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          {t('我在工作與生活中最重要的生命事件')}
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <TopEventCard accent="bg-tile-blue" label={t('工作中，最重要的事件是')} value={topWork} />
          <TopEventCard accent="bg-tile-mint" label={t('生活中，最重要的事件是')} value={topLife} />
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 6：書寫核心原因（提問優化 2，範例置於引導語、不放進書寫框） ──
  if (step === 6) {
    return (
      <WorkshopLayout step={6} total={TOTAL_STEPS} title={t('書寫核心原因')} minutes={10} onBack={back} onNext={next}>
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          <p>
            {t('針對工作與生活各自排序第一名的事件，邀請你寫下：為何你覺得它如此重要、重大，背後的原因、反映的核心價值觀是什麼，以及它如何影響了你的生命。')}
          </p>
          <p className="mt-2">{t('邀請你，寫得越具體越好。你可以用打字，也可以用語音輸入。')}</p>
        </div>

        <div className="mt-4 rounded-3xl bg-gradient-soft p-4 shadow-soft">
          <p className="text-xs font-extrabold text-primary">{t('範例')}</p>
          <div className="mt-2 flex flex-col gap-2.5 text-sm leading-relaxed text-foreground/80">
            <div>
              <p className="font-bold text-foreground">{t('工作：選擇心理學學科')}</p>
              <p>{t('原因：了解人性，讓我去理解人生命的本質，促進對生命經驗的覺察。')}</p>
            </div>
            <div>
              <p className="font-bold text-foreground">{t('生活：拍照紀錄與朋友的生活，並與他人分享')}</p>
              <p>{t('原因：整理與生命重要他人的回憶，重視人與人之間的連結。')}</p>
            </div>
          </div>
        </div>

        <ReflectionField
          rank={t('工作・第一名')}
          accent="bg-tile-blue"
          item={workItems[0]}
          value={workReflection}
          onChange={setWorkReflection}
        />
        <ReflectionField
          rank={t('生活・第一名')}
          accent="bg-tile-mint"
          item={lifeItems[0]}
          value={lifeReflection}
          onChange={setLifeReflection}
        />
      </WorkshopLayout>
    )
  }

  // ── 步驟 7：核心價值字卡生成（工作＋原因、生活＋原因 → 下載圖） ───────
  if (step === 7) {
    return (
      <>
        {/* 畫面外高解析下載圖 */}
        <div ref={coreValueCardRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0" style={{ width: 1080, height: 1440 }}>
          <CoreValueShareCard
            topWork={topWork}
            topLife={topLife}
            workReason={workReflection}
            lifeReason={lifeReflection}
            date={today}
          />
        </div>

        <WorkshopLayout
          step={7}
          total={TOTAL_STEPS}
          title={t('我重要的生命經驗，以及背後的核心原因與價值觀')}
          onBack={back}
          onNext={next}
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('這是你覺察重要生命事件背後的核心原因，你可以把它儲存下來，留作紀念。')}
          </p>

          <div className="mt-5 flex flex-col gap-3">
            <CoreValuePreview
              accent="bg-tile-blue"
              label={t('工作')}
              event={topWork}
              reason={workReflection}
            />
            <CoreValuePreview
              accent="bg-tile-mint"
              label={t('生活')}
              event={topLife}
              reason={lifeReflection}
            />
          </div>

          <button
            type="button"
            onClick={() => handleDownload(coreValueCardRef, `core-value-${isoLocalDate(new Date())}.png`, t('我的核心價值'))}
            disabled={sharing}
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full border border-border bg-white text-sm font-extrabold tracking-[0.15em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {sharing ? t('正在生成圖片…') : downloadLabel}
          </button>
        </WorkshopLayout>
      </>
    )
  }

  // ── 步驟 8：撰寫自我敘事（範例置於引導語、書寫框不放預設範例） ────────
  if (step === 8) {
    return (
      <WorkshopLayout
        step={8}
        total={TOTAL_STEPS}
        title={t('撰寫自我敘事')}
        minutes={5}
        onBack={back}
        onNext={next}
        nextLabel={t('完成')}
        nextVariant="done"
      >
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          <p>{t('把前面的探索收斂成一段自我敘事，完成下面的填空：')}</p>
          <p className="mt-2 font-bold text-foreground">
            {t('我是＿＿＿＿（名字），')}<br />
            {t('因為我＿＿＿＿（做過最重要的哪些決定、事情）')}<br />
            {t('所以我是一個＿＿＿＿（什麼樣的人）')}
          </p>
        </div>

        <div className="mt-4 rounded-3xl bg-gradient-soft p-4 shadow-soft">
          <p className="text-xs font-extrabold text-primary">{t('舉例')}</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">
            {t('我是 王慈恩，因為我做了選擇心理學學科、常與朋友分享與聯繫的人，所以我是一個希望透過心理學促進自我與他人對生命的理解，重視人際連結，並熱衷於創造人與人相互連結的人。')}
          </p>
        </div>

        <NarrativePreview narrative={narrative} />

        <div className="mt-5 flex flex-col gap-4">
          <LabeledField
            label={t('我是＿＿＿＿（名字）')}
            value={narrative.who}
            onChange={(v) => setNarrative((n) => ({ ...n, who: v }))}
            placeholder=""
          />
          <LabeledField
            label={t('因為我＿＿＿＿（做過最重要的哪些決定、事情）')}
            value={narrative.did}
            onChange={(v) => setNarrative((n) => ({ ...n, did: v }))}
            placeholder=""
          />
          <LabeledField
            label={t('所以我是一個＿＿＿＿（什麼樣的人）')}
            value={narrative.kind}
            onChange={(v) => setNarrative((n) => ({ ...n, kind: v }))}
            placeholder=""
          />
        </div>
      </WorkshopLayout>
    )
  }

  // ── 步驟 9：你的自我敘事（下載圖 + 發佈到社群） ───────────────────
  return (
    <>
      {/* 畫面外高解析下載圖 */}
      <div ref={narrativeCardRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0" style={{ width: 1080, height: 1440 }}>
        <NarrativeShareCard narrative={assembleNarrative(t, narrative)} topWork={topWork} topLife={topLife} date={today} />
      </div>

      <WorkshopLayout step={9} total={TOTAL_STEPS} title={t('你的自我敘事')}>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('這是你今天為自己寫下的敘事：')}</p>

        <div className="mt-5 rounded-3xl bg-gradient-soft p-6 shadow-soft">
          <NarrativeText narrative={narrative} className="text-lg font-bold leading-relaxed text-foreground" />
        </div>

        <button
          type="button"
          onClick={() => handleDownload(narrativeCardRef, `self-narrative-${isoLocalDate(new Date())}.png`, t('我的自我敘事'))}
          disabled={sharing}
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full border border-border bg-white text-sm font-extrabold tracking-[0.15em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
        >
          {sharing ? t('正在生成圖片…') : downloadLabel}
        </button>

        {/* 發佈到工作坊貼文（規格 [1]：工作坊一定直接分享到工作坊貼文，不再選擇隱私） */}
        <div className="mt-6 rounded-3xl bg-card p-5 shadow-soft">
          <p className="text-sm font-extrabold text-foreground">{t('把你的自我敘事分享到工作坊')}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t('分享給工作坊夥伴，鼓勵彼此一起認識真實的自己。')}
          </p>
          <button
            type="button"
            onClick={publish}
            disabled={publishing || published || !userId}
            className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-primary text-base font-extrabold tracking-[0.15em] text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {publishing ? t('發佈中…') : published ? t('已發佈') : t('發佈到工作坊貼文')}
          </button>
          {!userId && (
            <p className="mt-2 text-center text-xs text-muted-foreground">{t('尚未登入，無法發佈到工作坊貼文。')}</p>
          )}
        </div>

        <CompletionActions onRestart={restart} />
      </WorkshopLayout>
    </>
  )
}

// ─── 子元件 ───────────────────────────────────────────────────────────────

// 覺察生命事件的引導語（工作頁與生活頁共用）。
function AwarenessGuide() {
  const { t } = useLanguage()
  return (
    <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
      <p className="font-bold text-foreground">{t('在過往的工作和生活中，有哪些選擇和行動對我來說：')}</p>
      <ul className="mt-2 flex flex-col gap-1">
        <li>{t('1）是重要的')}</li>
        <li>{t('2）是重大的（對我的人生發展有極大幫助的）')}</li>
        <li>{t('3）是我印象深刻的')}</li>
        <li>{t('4）且完全出自於我的個人決定')}</li>
      </ul>
    </div>
  )
}

function FieldGroup({
  title,
  accent,
  children,
}: {
  title: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${accent}`} />
        <h2 className="text-base font-extrabold text-foreground">{title}</h2>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

// 規格 [6]：書寫介面一律用多行 textarea，避免單行限制看不到完整內容。
function LabeledField({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-muted-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-y rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed text-foreground shadow-soft placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  )
}

// 步驟 7「核心價值字卡」的畫面內預覽：事件 + 背後原因。
function CoreValuePreview({
  accent,
  label,
  event,
  reason,
}: {
  accent: string
  label: string
  event: string
  reason: string
}) {
  const { t } = useLanguage()
  return (
    <div className="rounded-3xl bg-gradient-soft p-5 shadow-soft">
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${accent}`} />
        <span className="text-sm font-extrabold text-foreground">{label}</span>
      </div>
      <p className="text-base font-bold leading-relaxed text-foreground">
        {event.trim() || <span className="font-normal text-muted-foreground/60">{t('（第一名尚未填寫）')}</span>}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
        <span className="font-bold text-muted-foreground">{t('原因：')}</span>
        {reason.trim() || <span className="text-muted-foreground/60">{t('（尚未書寫核心原因）')}</span>}
      </p>
    </div>
  )
}

// 排序後的編號清單（畫面上的預覽用）。
function RankedColumn({ title, accent, items }: { title: string; accent: string; items: Triple }) {
  const { t } = useLanguage()
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${accent}`} />
        <h3 className="text-sm font-extrabold text-foreground">{title}</h3>
      </div>
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-3">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 text-sm text-foreground/85">
              {item.trim() || <span className="text-muted-foreground/50">{t('（未填寫）')}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// 討論頁的「排序第一名」卡片。
function TopEventCard({ accent, label, value }: { accent: string; label: string; value: string }) {
  const { t } = useLanguage()
  return (
    <div className="rounded-3xl bg-card p-4 shadow-soft">
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${accent}`} />
        <span className="text-xs font-bold text-muted-foreground">{label}</span>
      </div>
      <p className="text-base font-bold leading-relaxed text-foreground">
        {value || <span className="font-normal text-muted-foreground/60">{t('（第一名尚未填寫，可回上一步調整）')}</span>}
      </p>
    </div>
  )
}

function RankList({
  title,
  accent,
  items,
  onReorder,
}: {
  title: string
  accent: string
  items: Triple
  onReorder: (next: Triple) => void
}) {
  const { t } = useLanguage()
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return
    const copy = [...items]
    const [x] = copy.splice(from, 1)
    copy.splice(to, 0, x)
    onReorder(copy as Triple)
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${accent}`} />
        <h2 className="text-base font-extrabold text-foreground">{title}</h2>
      </div>
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-foreground/85">
              {item.trim() || <span className="text-muted-foreground/50">{t('（未填寫）')}</span>}
            </span>
            <div className="flex shrink-0 flex-col gap-1">
              <MoveButton dir="up" disabled={i === 0} onClick={() => move(i, i - 1)} />
              <MoveButton dir="down" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function MoveButton({
  dir,
  disabled,
  onClick,
}: {
  dir: 'up' | 'down'
  disabled: boolean
  onClick: () => void
}) {
  const { t } = useLanguage()
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={dir === 'up' ? t('上移') : t('下移')}
      className={`flex h-6 w-7 items-center justify-center rounded-lg transition active:scale-90 ${
        disabled
          ? 'cursor-not-allowed text-muted-foreground/30'
          : 'bg-muted text-foreground/70 hover:bg-primary-soft'
      }`}
    >
      <svg
        className={`h-3.5 w-3.5 ${dir === 'down' ? 'rotate-180' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  )
}

function ReflectionField({
  rank,
  accent,
  item,
  value,
  onChange,
}: {
  rank: string
  accent: string
  item: string
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useLanguage()
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${accent}`} />
        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{rank}</span>
      </div>
      <div className="mb-3 rounded-2xl bg-muted/40 p-3 text-sm font-bold text-foreground">
        {item.trim() || <span className="font-normal text-muted-foreground/60">{t('（第一名尚未填寫，可回上一步調整）')}</span>}
      </div>
      <WorkshopTextarea
        value={value}
        onChange={onChange}
        placeholder={t('為何覺得它重要、重大？它如何影響了我的生命？')}
        rows={5}
        voice
      />
    </div>
  )
}

// 自我敘事：固定句型 + 使用者填入（藍色標記，規格 [6]）。空白以底線佔位。
function FilledText({ children }: { children: React.ReactNode }) {
  return <span className="font-bold text-blue-600">{children}</span>
}

// 句型以 {who}/{did}/{kind} 三個佔位字組成，t() 依語言回傳不同語序的句子模板，
// 再用 split 把模板切成片段，於佔位字位置插入 JSX（藍字或未填佔位符）。
function NarrativeText({ narrative, className }: { narrative: Narrative; className?: string }) {
  const { t } = useLanguage()
  const blank = (v: string, placeholder: string) =>
    v.trim() ? (
      <FilledText>{v.trim()}</FilledText>
    ) : (
      <span className="text-muted-foreground/50">{placeholder}</span>
    )
  const template = t('我是{who}，因為我{did}，所以我是一個{kind}。')
  const [beforeWho, rest1] = template.split('{who}')
  const [beforeDid, rest2] = rest1.split('{did}')
  const [beforeKind, afterKind] = rest2.split('{kind}')
  return (
    <p className={`leading-relaxed ${className ?? ''}`}>
      {beforeWho}
      {blank(narrative.who, '＿＿＿')}
      {beforeDid}
      {blank(narrative.did, '＿＿＿＿＿')}
      {beforeKind}
      {blank(narrative.kind, '＿＿＿＿＿＿＿')}
      {afterKind}
    </p>
  )
}

function NarrativePreview({ narrative }: { narrative: Narrative }) {
  const { t } = useLanguage()
  return (
    <div className="mt-4 rounded-3xl bg-gradient-soft p-5 shadow-soft">
      <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-primary">{t('即時預覽')}</p>
      <NarrativeText narrative={narrative} className="text-base font-bold text-foreground" />
    </div>
  )
}

function assembleNarrative(t: TFn, n: Narrative): string {
  const who = n.who.trim() || '＿＿＿'
  const did = n.did.trim() || '＿＿＿＿＿'
  const kind = n.kind.trim() || '＿＿＿＿＿＿＿'
  return t('我是{who}，因為我{did}，所以我是一個{kind}。', { who, did, kind })
}

// 日期格式依語言呈現不同的星期寫法（純資料轉換，非畫面文字查表，故直接依語言分支）。
function formatDate(date: Date, language: Language): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const base = `${y} / ${m} / ${d}`
  if (language === 'en') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return `${base} (${days[date.getDay()]})`
  }
  const days = ['日', '一', '二', '三', '四', '五', '六']
  return `${base}（星期${days[date.getDay()]}）`
}

// ════════════════════════════════════════════════════════════════════════
// 下載圖卡（html-to-image 用，畫面外 1080×1440）
// ════════════════════════════════════════════════════════════════════════

const CARD_BASE: React.CSSProperties = {
  width: 1080,
  height: 1440,
  background: 'linear-gradient(150deg,#dbeafe 0%,#e0f2f1 55%,#ede9fe 100%)',
  padding: '72px 72px 60px',
  boxSizing: 'border-box',
  fontFamily: 'PingFang TC, Microsoft JhengHei, sans-serif',
  color: '#1f2742',
  display: 'flex',
  flexDirection: 'column',
  gap: 32,
}

function CardLogo() {
  return (
    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
      <img
        src="/assets/logo-full-color.png"
        alt="PSYbyPSY"
        style={{ height: 48, objectFit: 'contain', opacity: 0.75 }}
        crossOrigin="anonymous"
      />
    </div>
  )
}

function CardRankColumn({ title, color, items }: { title: string; color: string; items: Triple }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.72)', borderRadius: 32, padding: '28px 36px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginBottom: 16 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span
              style={{
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: '50%',
                background: i === 0 ? color : '#e7e7ef',
                color: i === 0 ? '#fff' : '#8a8a9a',
                fontSize: 22,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontSize: 26, lineHeight: 1.4 }}>{item.trim() || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RankShareCard({
  workItems,
  lifeItems,
  date,
}: {
  workItems: Triple
  lifeItems: Triple
  date: string
}) {
  const { t } = useLanguage()
  return (
    <div style={CARD_BASE}>
      <div>
        <div style={{ fontSize: 16, letterSpacing: 8, fontWeight: 800, opacity: 0.55 }}>PSY BY PSY · LIFE EVENTS</div>
        <div style={{ fontSize: 46, fontWeight: 800, marginTop: 18, lineHeight: 1.25 }}>
          {t('我在工作與生活中的重要生命事件')}
        </div>
        <div style={{ fontSize: 22, opacity: 0.65, marginTop: 10 }}>{date}</div>
      </div>
      <CardRankColumn title={t('工作')} color="#3F7BD6" items={workItems} />
      <CardRankColumn title={t('生活')} color="#2E9E8F" items={lifeItems} />
      <CardLogo />
    </div>
  )
}

// 步驟 7：核心價值字卡 —— [工作]＋[對應原因]、[生活]＋[對應原因]。
function CoreValueShareCard({
  topWork,
  topLife,
  workReason,
  lifeReason,
  date,
}: {
  topWork: string
  topLife: string
  workReason: string
  lifeReason: string
  date: string
}) {
  const { t } = useLanguage()
  return (
    <div style={CARD_BASE}>
      <div>
        <div style={{ fontSize: 16, letterSpacing: 8, fontWeight: 800, opacity: 0.55 }}>PSY BY PSY · CORE VALUES</div>
        <div style={{ fontSize: 42, fontWeight: 800, marginTop: 18, lineHeight: 1.25 }}>
          {t('我重要的生命經驗與背後的核心原因')}
        </div>
        <div style={{ fontSize: 22, opacity: 0.65, marginTop: 10 }}>{date}</div>
      </div>

      <CoreValueCardBlock title={t('工作')} color="#3F7BD6" event={topWork} reason={workReason} />
      <CoreValueCardBlock title={t('生活')} color="#2E9E8F" event={topLife} reason={lifeReason} />

      <CardLogo />
    </div>
  )
}

function CoreValueCardBlock({
  title,
  color,
  event,
  reason,
}: {
  title: string
  color: string
  event: string
  reason: string
}) {
  const { t } = useLanguage()
  return (
    <div style={{ background: 'rgba(255,255,255,0.72)', borderRadius: 32, padding: '28px 36px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginBottom: 14 }}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.45, marginBottom: 14 }}>
        {event.trim() || '—'}
      </div>
      <div style={{ fontSize: 25, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        <span style={{ fontWeight: 800, color }}>{t('原因 · ')}</span>
        {reason.trim() || '—'}
      </div>
    </div>
  )
}

function NarrativeShareCard({
  narrative,
  topWork,
  topLife,
  date,
}: {
  narrative: string
  topWork: string
  topLife: string
  date: string
}) {
  const { t } = useLanguage()
  return (
    <div style={CARD_BASE}>
      <div>
        <div style={{ fontSize: 16, letterSpacing: 8, fontWeight: 800, opacity: 0.55 }}>PSY BY PSY · SELF NARRATIVE</div>
        <div style={{ fontSize: 52, fontWeight: 800, marginTop: 18, lineHeight: 1.2 }}>{t('我的自我敘事')}</div>
        <div style={{ fontSize: 22, opacity: 0.65, marginTop: 10 }}>{date}</div>
      </div>

      <div
        style={{
          background: 'rgba(255,255,255,0.78)',
          borderRadius: 32,
          padding: '44px 40px',
          display: 'flex',
          alignItems: 'center',
          minHeight: 360,
        }}
      >
        <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.6 }}>{narrative}</div>
      </div>

      {(topWork || topLife) && (
        <div style={{ background: 'rgba(255,255,255,0.55)', borderRadius: 32, padding: '28px 36px' }}>
          {topWork && (
            <div style={{ fontSize: 24, lineHeight: 1.6, marginBottom: topLife ? 14 : 0 }}>
              <span style={{ fontWeight: 800, color: '#3F7BD6', marginRight: 12 }}>{t('工作・最重要的事件')}</span>
              {topWork}
            </div>
          )}
          {topLife && (
            <div style={{ fontSize: 24, lineHeight: 1.6 }}>
              <span style={{ fontWeight: 800, color: '#2E9E8F', marginRight: 12 }}>{t('生活・最重要的事件')}</span>
              {topLife}
            </div>
          )}
        </div>
      )}

      <CardLogo />
    </div>
  )
}
