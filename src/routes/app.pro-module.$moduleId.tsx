// 專業模組播放器：渲染已上架內容（published_content）→ 個案作答 → 完成練習。
// 完成時：寫 pro_entries、跑危機判讀（後端優先，失敗走前端關鍵字 fallback）、可選擇分享到社群。
// 右上「⋯」：查看同意內容（唯讀）、停止追蹤關係。首次進入若已更新先彈提示。
// 需登入由父路由 /app 的 beforeLoad 擋下（比照 app.gratitude.tsx）。
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useLanguage } from '../lib/i18n/context'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import { DEFAULT_PRIVACY } from '../lib/privacy'
import { insertCommunityPost, markStreak } from '../lib/communityPost'
import {
  getMyModules,
  stopEnrollment,
  entrySafetyCheck,
  localCrisisCheck,
  insertCrisisAlertFallback,
  isModuleUpdated,
  markModuleSeen,
  excerptFromAnswers,
  type ProModuleInfo,
  type ProAnswers,
  type ProAnswerValue,
  type ProBlock,
  type ProModuleContent,
  type DiaryModuleContent,
  type AssessmentModuleContent,
} from '../lib/proModules'
import { BlockRenderer } from '../components/pro/BlockRenderer'
import { ConsentModal } from '../components/pro/ConsentModal'
import { CrisisResourcesModal } from '../components/pro/CrisisResourcesModal'
import { DiaryPlayer } from '../components/pro/DiaryPlayer'
import { AssessmentPlayer } from '../components/pro/AssessmentPlayer'

export const Route = createFileRoute('/app/pro-module/$moduleId')({
  component: ProModulePlayer,
})

type Stage = 'writing' | 'done'

function isAnswered(block: ProBlock, value: ProAnswerValue | undefined): boolean {
  switch (block.type) {
    case 'short_text':
    case 'long_text':
      return typeof value === 'string' && value.trim().length > 0
    case 'choice':
    case 'checklist':
      return Array.isArray(value) && value.length > 0
    case 'scale':
      return typeof value === 'number'
    default:
      return true
  }
}

function ProModulePlayer() {
  const { moduleId } = Route.useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()

  const [userId, setUserId] = useState<string | null>(null)
  const [module, setModule] = useState<ProModuleInfo | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [sharePerma, setSharePerma] = useState(false)

  const [answers, setAnswers] = useState<ProAnswers>({})
  const [stage, setStage] = useState<Stage>('writing')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [showUpdated, setShowUpdated] = useState(false)
  const [showCrisis, setShowCrisis] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const [sharing, setSharing] = useState(false)
  const [shared, setShared] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user.id ?? null
      if (cancelled) return
      setUserId(uid)
      const list = await getMyModules()
      if (cancelled) return
      const found = list.find((m) => m.module_id === moduleId) ?? null
      if (!found || !found.published_content) {
        setNotFound(true)
        return
      }
      setModule(found)
      if (isModuleUpdated(found.module_id, found.published_at)) setShowUpdated(true)
      markModuleSeen(found.module_id, found.published_at)
      if (uid) {
        const { data: enr } = await supabase
          .from('pro_enrollments')
          .select('share_perma')
          .eq('module_id', moduleId)
          .eq('user_id', uid)
          .maybeSingle()
        if (!cancelled) setSharePerma(!!enr?.share_perma)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [moduleId])

  useEffect(() => {
    if (notFound) navigate({ to: '/app/home' })
  }, [notFound, navigate])

  if (!module || !module.published_content) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  // practice/diary 共用 BlockRenderer/pro_entries 流程（DiaryModuleContent 結構上相容 ProModuleContent，
  // 含 blocks）；assessment 沒有 blocks，自己的 AssessmentPlayer 走獨立資料表，這裡防禦性地當空陣列處理。
  const content = module.published_content as ProModuleContent
  const blocks = Array.isArray(content.blocks) ? content.blocks : []
  const setAnswer = (id: string, value: ProAnswerValue) =>
    setAnswers((prev) => ({ ...prev, [id]: value }))

  const requiredMissing = blocks.some((b) => b.required && !isAnswered(b, answers[b.id]))

  const collectTexts = (): string[] =>
    blocks
      .map((b) => answers[b.id])
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

  const complete = async () => {
    if (!userId || submitting) return
    if (requiredMissing) {
      setFormError(t('請先完成所有必填題目。'))
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const { data, error } = await supabase
        .from('pro_entries')
        .insert({ module_id: moduleId, user_id: userId, answers })
        .select('id')
        .single()
      if (error || !data) throw error ?? new Error('insert failed')
      const entryId = data.id as string

      // 危機判讀：後端優先，任何失敗改跑前端關鍵字 fallback。
      const texts = collectTexts()
      let hasRisk = false
      if (texts.length > 0) {
        try {
          const r = await entrySafetyCheck(entryId, texts)
          hasRisk = r.risk !== 'none'
        } catch {
          const matched = localCrisisCheck(texts)
          if (matched.length > 0) {
            await insertCrisisAlertFallback(moduleId, userId, entryId, matched)
            hasRisk = true
          }
        }
      }

      track('pro_module_completed', { module_id: moduleId })
      if (hasRisk) setShowCrisis(true)
      setStage('done')
    } catch (e) {
      console.error('[pro complete]', e)
      setFormError(t('儲存失敗，請稍後再試一次。'))
    } finally {
      setSubmitting(false)
    }
  }

  const share = async () => {
    if (!userId || sharing || shared) return
    setSharing(true)
    try {
      const excerpt = excerptFromAnswers(content, answers)
      await insertCommunityPost(
        userId,
        'pro_module',
        { item_1: excerpt, item_2: '', item_3: '', ai_feedback: null },
        DEFAULT_PRIVACY,
        { v: 'pro_module', module_title: module.title, excerpt },
      )
      await markStreak(userId)
      track('pro_module_shared', { module_id: moduleId })
      setShared(true)
    } catch (e) {
      console.error('[pro share]', e)
    } finally {
      setSharing(false)
    }
  }

  const doStop = async () => {
    if (!userId) return
    const ok = await stopEnrollment(moduleId, userId)
    if (ok) {
      track('pro_enrollment_stopped', { module_id: moduleId })
      navigate({ to: '/app/home' })
    } else {
      setShowStopConfirm(false)
    }
  }

  const previewForConsent = {
    module_id: module.module_id,
    title: module.title,
    description: module.description,
    est_minutes: module.est_minutes,
    kind: module.kind,
    practitioner_name: module.practitioner_name,
  }
  const name = module.practitioner_name || t('你的專業夥伴')

  return (
    <div className="mx-auto max-w-md animate-fade-up px-5 pb-28 pt-3">
      {/* 頁首列：返回 + 標題 + ⋯選單 */}
      <div className="mb-4 flex items-center gap-2">
        <button
          aria-label={t('返回')}
          onClick={() => navigate({ to: '/app/home' })}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition hover:bg-muted active:scale-90"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <p className="min-w-0 flex-1 truncate text-lg font-black tracking-[0.02em] text-foreground">{module.title}</p>
        <div className="relative shrink-0">
          <button
            aria-label={t('更多選項')}
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition hover:bg-muted active:scale-90"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-10 z-20 min-w-[200px] rounded-2xl border border-border bg-card p-2 shadow-soft">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setShowConsent(true)
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-foreground transition hover:bg-muted"
                >
                  {t('查看同意內容')}
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setShowStopConfirm(true)
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-rust transition hover:bg-muted"
                >
                  {t('停止追蹤關係')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {module.kind === 'assessment' ? (
        <AssessmentPlayer
          moduleId={module.module_id}
          estMinutes={module.est_minutes}
          content={module.published_content as AssessmentModuleContent}
        />
      ) : module.kind === 'diary' ? (
        <DiaryPlayer
          moduleId={module.module_id}
          userId={userId as string}
          content={content as DiaryModuleContent}
          practitionerName={module.practitioner_name}
        />
      ) : stage === 'writing' ? (
        <>
          <p className="mb-4 text-sm text-muted-foreground">{t('來自 {name}', { name })}</p>
          <BlockRenderer content={content} answers={answers} onChange={setAnswer} />

          {formError && <p className="mt-4 text-sm font-bold text-rust">{formError}</p>}

          <button
            onClick={complete}
            disabled={submitting}
            className="mt-6 w-full rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? t('儲存中…') : t('完成練習')}
          </button>
        </>
      ) : (
        <DoneScreen
          outro={content.outro}
          sharing={sharing}
          shared={shared}
          onShare={share}
          onHome={() => navigate({ to: '/app/home' })}
        />
      )}

      {/* 模組已更新提示 */}
      {showUpdated && (
        <CenterDialog onClose={() => setShowUpdated(false)}>
          <h2 className="text-lg font-black text-foreground">{t('模組已更新')}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground-soft">
            {t('{title} 的內容已由專業夥伴更新，以下是最新版本。', { title: module.title })}
          </p>
          <button
            onClick={() => setShowUpdated(false)}
            className="mt-5 w-full rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
          >
            {t('知道了')}
          </button>
        </CenterDialog>
      )}

      {/* 查看同意內容（唯讀重現） */}
      {showConsent && (
        <ConsentModal
          preview={previewForConsent}
          readOnly
          sharePermaValue={sharePerma}
          onClose={() => setShowConsent(false)}
        />
      )}

      {/* 停止追蹤關係確認 */}
      {showStopConfirm && (
        <CenterDialog onClose={() => setShowStopConfirm(false)}>
          <h2 className="text-lg font-black text-rust">{t('停止追蹤關係？')}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground-soft">
            {t('停止後 {name} 將無法看到你的任何練習紀錄，模組也會從你的列表移除。若要恢復，需要重新輸入邀請碼。', { name })}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={doStop}
              className="w-full rounded-full bg-rust py-3 text-base font-extrabold text-white shadow-soft transition active:scale-[0.98]"
            >
              {t('確定停止')}
            </button>
            <button
              onClick={() => setShowStopConfirm(false)}
              className="w-full rounded-full py-2.5 text-sm font-bold text-muted-foreground transition active:scale-[0.98]"
            >
              {t('取消')}
            </button>
          </div>
        </CenterDialog>
      )}

      {/* 危機求助資源 */}
      {showCrisis && <CrisisResourcesModal onClose={() => setShowCrisis(false)} />}
    </div>
  )
}

function DoneScreen({
  outro,
  sharing,
  shared,
  onShare,
  onHome,
}: {
  outro?: string
  sharing: boolean
  shared: boolean
  onShare: () => void
  onHome: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="animate-fade-up flex flex-col items-center pt-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-tile-mint text-[#71744F]">
        <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 6" />
        </svg>
      </span>
      <h2 className="mt-5 text-2xl font-black tracking-[0.02em] text-foreground">{t('完成了')}</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-foreground-soft">
        {outro?.trim() || t('謝謝你今天陪伴了自己，這份紀錄已經保存下來了。')}
      </p>

      <div className="mt-8 flex w-full flex-col gap-2.5">
        <button
          onClick={onShare}
          disabled={sharing || shared}
          className="w-full rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
        >
          {shared ? t('已分享到社群') : sharing ? t('分享中…') : t('分享到社群')}
        </button>
        <button
          onClick={onHome}
          className="w-full rounded-full border border-border bg-card py-3 text-base font-bold text-foreground transition active:scale-[0.98]"
        >
          {t('返回首頁')}
        </button>
      </div>
    </div>
  )
}

function CenterDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1c1714]/40 px-6" onClick={onClose}>
      <div
        className="w-full max-w-sm animate-slide-up rounded-[24px] bg-background p-6 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
