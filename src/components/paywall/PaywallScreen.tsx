// ─────────────────────────────────────────────────────────────────────────
// 付費牆（規格 §5，變體 A：個人化標頭在上）
//
// 版面由上到下：關閉鈕 → 個人化標頭 → 利益點 → 方案卡 → 主 CTA → 條款 → 底部連結
//
// 為了滿足規格 §5.2「iPhone SE 尺寸下不捲動即可看到主 CTA」，版面切成
// 「可捲動的內容區 + 固定在底部的 CTA 區」，CTA 永遠在畫面上。
//
// ⚠️ 這階段不接金流（見 docs 計畫）：主 CTA 只把付費意願寫進 paywall_intents，
//    接著立刻顯示說明，不會讓使用者走進一段其實不存在的試用流程。
//    規格 §8 也明令不得放任何導向官網結帳的連結——這裡完全沒有外部連結。
//
// ⚠️ 規格 §5.3 硬性限制：無倒數計時、無閃爍、無紅色警示、無 before/after 對比、
//    無恐懼訴求、無療效承諾；創始名額連動真實資料（founding_seats_remaining()）。
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { track } from '../../lib/analytics'
import { OPEN_FALLBACK, fetchEntitlements } from '../../lib/entitlements'
import { useLanguage } from '../../lib/i18n/context'
import {
  type PricingBundle,
  type PricingPlan,
  effectiveAmountCents,
  fetchPricing,
  formatAmount,
  foundingActive,
} from '../../lib/pricing'
import { DIMENSION_CONFIGS, type DimensionKey } from '../pretest/types'
import { PlanCard } from './PlanCard'

export type PaywallSource = 'onboarding' | 'settings' | 'soft_paywall'

/** 以 PERMA 維度鍵為索引的分數。onboarding 的報告本來就是這個形狀。 */
export type DimensionScores = Partial<Record<DimensionKey, number>>

interface PaywallScreenProps {
  source: PaywallSource
  /** 已知的 PERMA 分數（例如剛做完檢測）；沒給就自己抓最近一次 */
  scores?: DimensionScores | null
  /** 關閉付費牆（✕ 與「先自己逛逛」都走這裡） */
  onDismiss: () => void
}

// 資料庫欄位（p_score…）對應到維度鍵。
const DB_FIELD_BY_DIMENSION: Record<DimensionKey, string> = {
  P: 'p_score',
  E: 'e_score',
  R: 'r_score',
  M: 'm_score',
  A: 'a_score',
}

/** 找出分數最高與最低的兩個面向，供個人化標頭使用。分數不足時回 null。 */
function highLowDimensions(scores: DimensionScores | null): { high: DimensionKey; low: DimensionKey } | null {
  if (!scores) return null
  const keys: DimensionKey[] = ['P', 'E', 'R', 'M', 'A']
  const pairs = keys.map((key) => ({ key, value: Number(scores[key]) || 0 }))
  if (pairs.every((p) => p.value === 0)) return null
  const sorted = [...pairs].sort((a, b) => b.value - a.value)
  const high = sorted[0].key
  const low = sorted[sorted.length - 1].key
  if (high === low) return null
  return { high, low }
}

export function PaywallScreen({ source, scores: scoresProp, onDismiss }: PaywallScreenProps) {
  const { t } = useLanguage()
  const [bundle, setBundle] = useState<PricingBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [scores, setScores] = useState<DimensionScores | null>(scoresProp ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [showIntentNotice, setShowIntentNotice] = useState(false)
  const [showRestoreNotice, setShowRestoreNotice] = useState(false)
  const [isFoundingMember, setIsFoundingMember] = useState(false)
  const [showAlreadyFoundingNotice, setShowAlreadyFoundingNotice] = useState(false)

  // 已核准的創始成員再點一次 CTA 時要讓他們知道「已經是了」，而不是看起來像沒反應。
  useEffect(() => {
    let cancelled = false
    void fetchEntitlements().then((ent) => {
      // fetchEntitlements 查詢失敗時回傳 OPEN_FALLBACK 這個常數本身（預設值）。
      // 那是給「要不要顯示付費功能」用的，不能拿來當「不是創始成員」的證據。
      if (cancelled || ent === OPEN_FALLBACK) return
      setIsFoundingMember(ent.is_founding_member)
    })
    return () => { cancelled = true }
  }, [])

  // 價格與名額
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const b = await fetchPricing()
      if (cancelled) return
      setBundle(b)
      // 規格 §5.1.4：年繳預設選中。
      const yearly = b?.plans.find((p) => p.period === 'year')
      setSelectedPlan(yearly?.planCode ?? b?.plans[0]?.planCode ?? null)
      setLoading(false)
      if (b) track('paywall_viewed', { source, variant: b.config.variant })
    })()
    return () => { cancelled = true }
  }, [source])

  // 沒有傳入分數時，抓最近一次檢測結果做個人化標頭。
  useEffect(() => {
    if (scoresProp) return
    let cancelled = false
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user.id
      if (!userId) return
      const { data } = await supabase
        .from('perma_scores')
        .select('p_score, e_score, r_score, m_score, a_score')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled || !data) return
      const row = data as Record<string, number>
      const normalized: DimensionScores = {}
      for (const [dim, field] of Object.entries(DB_FIELD_BY_DIMENSION)) {
        normalized[dim as DimensionKey] = Number(row[field]) || 0
      }
      setScores(normalized)
    })()
    return () => { cancelled = true }
  }, [scoresProp])

  const useFounding = bundle ? foundingActive(bundle) : false
  const yearlyPlan = bundle?.plans.find((p) => p.period === 'year')
  const monthlyPlan = bundle?.plans.find((p) => p.period === 'month')
  const selected: PricingPlan | undefined = bundle?.plans.find((p) => p.planCode === selectedPlan)

  const handleSelect = (planCode: string) => {
    setSelectedPlan(planCode)
    track('paywall_plan_selected', { source, plan_code: planCode })
  }

  // 主 CTA：記錄付費意願，然後立刻說明目前的開放狀況。不扣款、不跳外部連結。
  // 提示視窗一定要跳出來，讓使用者知道「有點到」——背景記錄失敗與否不影響這個承諾。
  const handleCta = async () => {
    if (!selected || submitting) return
    if (isFoundingMember) {
      track('paywall_already_founding_member', { source })
      setShowAlreadyFoundingNotice(true)
      return
    }
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user.id
      if (userId) {
        const { error } = await supabase.from('paywall_intents').insert({
          user_id: userId,
          plan_code: selected.planCode,
          variant: bundle?.config.variant ?? 'A',
          source,
        })
        if (error) console.error('[paywall] 記錄付費意願失敗', error)
      }
      track('paywall_intent_recorded', { source, plan_code: selected.planCode })
    } catch (err) {
      console.error('[paywall] 記錄付費意願發生例外', err)
    } finally {
      setSubmitting(false)
      setShowIntentNotice(true)
    }
  }

  const handleDismiss = () => {
    track('paywall_dismissed', { source })
    onDismiss()
  }

  const hl = highLowDimensions(scores)

  return (
    <div className="fixed-viewport-h fixed inset-x-0 top-0 z-50 flex flex-col bg-background">
      {/* 1. 關閉鈕：左上角，第一秒即可見（規格 §5.1.1，不做延遲顯示） */}
      <div className="shrink-0 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button
          onClick={handleDismiss}
          aria-label={t('關閉')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition active:scale-95"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* 內容區可捲動，CTA 固定在下方，確保小螢幕不捲動也看得到 CTA */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
        <div className="mx-auto w-full max-w-sm">
          {/* 2. 個人化標頭（規格 §5.1.2：帶入剛完成的檢測結果，不用通用行銷插圖） */}
          {hl && (
            <p className="mt-1 text-xs font-bold tracking-wide text-primary">
              {t('你的{high}最亮，{low}正在長', {
                high: t(DIMENSION_CONFIGS[hl.high].label),
                low: t(DIMENSION_CONFIGS[hl.low].label),
              })}
            </p>
          )}
          <h1 className="mt-2 text-2xl font-black leading-snug text-foreground">
            {t('立即申請加入 PSY by PSY 心理健身房 創始成員')}
          </h1>
          <p className="mt-2 text-sm font-bold text-foreground/80">
            {t('我們開放訂閱會員的時候，你就可以擁有以下權益：')}
          </p>

          {/* 3. 利益點：完整列出創始成員權益，讓使用者在看到方案價格前就先知道能拿到什麼 */}
          <ul className="mt-5 flex flex-col gap-2.5">
            {[
              '每週一份 AI 個人化心理健康專屬週報',
              '社群功能無限瀏覽，不受免費層次數限制',
              '健身房新菜單，搶先體驗',
              '基線檢測（PERMA 測驗）無限次重測',
              '貼文掛上「創始成員」專屬徽章',
            ].map((line) => (
              <li key={line} className="flex items-center gap-2.5">
                <CheckIcon />
                <span className="text-sm font-bold text-foreground">{t(line)}</span>
              </li>
            ))}
          </ul>

          {/* 4. 方案卡：年繳在上（預設選中）、月繳在下，兩個價格同時可見 */}
          <div role="radiogroup" aria-label={t('訂閱方案')} className="mt-6 flex flex-col gap-3">
            {loading && <div className="h-24 animate-pulse rounded-3xl bg-primary-soft" />}
            {!loading && !bundle && (
              <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                {t('訂閱功能尚未開放，敬請期待。')}
              </p>
            )}
            {bundle?.plans.map((plan) => (
              <PlanCard
                key={plan.planCode}
                plan={plan}
                selected={plan.planCode === selectedPlan}
                onSelect={() => handleSelect(plan.planCode)}
                useFounding={useFounding}
                comparisonPlan={plan.period === 'year' ? monthlyPlan : yearlyPlan}
                foundingSeatsRemaining={bundle.foundingSeatsRemaining}
                foundingQuotaTotal={bundle.config.foundingQuotaTotal}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 5–7. CTA、條款行、底部連結（固定在畫面下方） */}
      <div className="shrink-0 border-t border-border bg-background px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
        <div className="mx-auto w-full max-w-sm">
          <button
            onClick={() => void handleCta()}
            disabled={!selected || submitting}
            className="flex h-14 w-full items-center justify-center rounded-full bg-gradient-primary text-base font-extrabold tracking-wide text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-50"
          >
            {submitting
              ? t('處理中…')
              : isFoundingMember
                ? t('你已經是創始成員')
                : t('申請加入創始成員')}
          </button>

          {/* 6. 條款行：說明未來的收費方式。目前尚未接金流，所以不寫「到期後扣款」
                 這種還不存在的行為，只誠實預告開放訂閱後的價格。 */}
          {selected && (
            <p className="mt-2.5 text-center text-[11px] leading-relaxed text-muted-foreground">
              {t('開放訂閱後為 {price}，屆時會先通知你，不會自動扣款。', {
                price:
                  formatAmount(effectiveAmountCents(selected, useFounding), selected.currency) +
                  (selected.period === 'year' ? t('／年') : t('／月')),
              })}
            </p>
          )}

          {/* 7. 底部兩個純文字連結，並排、低調 */}
          <div className="mt-3 flex items-center justify-center gap-6">
            <button
              onClick={() => setShowRestoreNotice(true)}
              className="text-xs font-semibold text-muted-foreground underline"
            >
              {t('恢復購買')}
            </button>
            <button onClick={handleDismiss} className="text-xs font-semibold text-muted-foreground underline">
              {t('先自己逛逛')}
            </button>
          </div>
        </div>
      </div>

      {showIntentNotice && (
        <NoticeSheet
          title={t('全部功能已為你解鎖！')}
          body={
            <>
              <p>{t('非常開心有你的加入，成為 PSY by PSY 心理健身房的創始成員！')}</p>
              {/* ⚠️ 權益是「立即」生效的（見 supabase/subscriptions.sql 的 is_pro()），
                  不要再寫成「開放訂閱後才有」或「審核中」——那會與實際行為不符。 */}
              <p className="mt-3">{t('以下權益現在就可以使用：')}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {[
                  '每週一份 AI 個人化心理健康專屬週報',
                  '社群功能無限瀏覽，不受免費層次數限制',
                  '健身房新菜單，搶先體驗',
                  '基線檢測（PERMA 測驗）無限次重測',
                  '貼文掛上「創始成員」專屬徽章',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <CheckIcon />
                    <span className="text-sm font-bold text-foreground">{t(line)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                {t('未來開放訂閱時我們會先通知你，不會自動扣款。')}
              </p>
            </>
          }
          onClose={() => { setShowIntentNotice(false); onDismiss() }}
        />
      )}
      {showRestoreNotice && (
        <NoticeSheet
          title={t('恢復購買')}
          body={t('訂閱功能尚未開放，敬請期待。')}
          onClose={() => setShowRestoreNotice(false)}
        />
      )}
      {showAlreadyFoundingNotice && (
        <NoticeSheet
          title={t('你已經是創始成員了！')}
          body={
            <>
              <p>{t('你已經是 PSY by PSY 心理健身房的創始成員，我們開放訂閱後，以下權益會生效：')}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {[
                  '每週一份 AI 個人化心理健康專屬週報',
                  '社群功能無限瀏覽，不受免費層次數限制',
                  '健身房新菜單，搶先體驗',
                  '基線檢測（PERMA 測驗）無限次重測',
                  '貼文掛上「創始成員」專屬徽章',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <CheckIcon />
                    <span className="text-sm font-bold text-foreground">{t(line)}</span>
                  </li>
                ))}
              </ul>
            </>
          }
          onClose={() => setShowAlreadyFoundingNotice(false)}
        />
      )}
    </div>
  )
}

function NoticeSheet({ title, body, onClose }: { title: string; body: ReactNode; onClose: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#1c1714]/40 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]" onClick={onClose}>
      <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-[24px] bg-card p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-foreground">{title}</h2>
        <div className="mt-2 text-[15px] leading-relaxed text-foreground/80">{body}</div>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
        >
          {t('知道了')}
        </button>
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft">
      <svg className="h-3 w-3 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  )
}
