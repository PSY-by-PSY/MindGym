// ─────────────────────────────────────────────────────────────────────────
// 方案價格 —— 一律來自遠端設定（supabase/subscriptions.sql 的 pricing_config）
//
// ⚠️ 規格 §8 明令「不要在 client 端硬寫價格字串」。這個檔案裡不會出現任何
//    NT$99／NT$790 之類的字面值——改價只要動 Supabase 的 pricing_config，
//    網頁重新整理就生效，不需要重新送審。
//
// 金額在資料庫以「分」儲存並記錄幣別（規格 §6），顯示時才換算。
// ─────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'

export type PlanPeriod = 'month' | 'year'

export interface PricingPlan {
  planCode: string
  period: PlanPeriod
  amountCents: number
  foundingAmountCents: number | null
  currency: string
  sortOrder: number
}

export interface PaywallConfig {
  foundingQuotaTotal: number
  foundingEnabled: boolean
  variant: 'A' | 'B'
}

export interface PricingBundle {
  plans: PricingPlan[]
  config: PaywallConfig
  /** 創始會員剩餘名額。連動真實訂閱數（規格 §5.3 禁止假數字）；取不到時為 null。 */
  foundingSeatsRemaining: number | null
}

/** 依幣別格式化金額。cents → 顯示字串，例如 9900 →「NT$99」。 */
export function formatAmount(cents: number, currency: string): string {
  const major = cents / 100
  // TWD 慣例上不顯示小數；其他幣別保留兩位。
  if (currency === 'TWD') {
    return `NT$${Math.round(major).toLocaleString('zh-TW')}`
  }
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency }).format(major)
}

/**
 * 年繳方案的「每月等價金額」。規格 §1.2 要求年繳一律以「每月只要 NT$66」為主要呈現。
 * 用實際生效價（有創始價就用創始價）除以 12。
 */
export function monthlyEquivalent(plan: PricingPlan, useFounding: boolean): string {
  const cents = effectiveAmountCents(plan, useFounding)
  return formatAmount(Math.round(cents / 12), plan.currency)
}

/** 實際生效金額：創始名額還有、且該方案有創始價時用創始價，否則用標準定價。 */
export function effectiveAmountCents(plan: PricingPlan, useFounding: boolean): number {
  if (useFounding && plan.foundingAmountCents != null) return plan.foundingAmountCents
  return plan.amountCents
}

/** 年繳相對月繳省下的百分比（四捨五入到整數），資料不足時回 null。 */
export function savingsPercent(
  yearly: PricingPlan | undefined,
  monthly: PricingPlan | undefined,
  useFounding: boolean,
): number | null {
  if (!yearly || !monthly) return null
  const yearlyCents = effectiveAmountCents(yearly, useFounding)
  const monthlyTimesTwelve = effectiveAmountCents(monthly, useFounding) * 12
  if (monthlyTimesTwelve <= 0) return null
  return Math.round((1 - yearlyCents / monthlyTimesTwelve) * 100)
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

const DEFAULT_PLANS: PricingPlan[] = [
  {
    planCode: 'monthly',
    period: 'month',
    amountCents: 39900,
    foundingAmountCents: null,
    currency: 'TWD',
    sortOrder: 1,
  },
  {
    planCode: 'yearly',
    period: 'year',
    amountCents: 399000,
    foundingAmountCents: null,
    currency: 'TWD',
    sortOrder: 2,
  },
]

/** 一次取回付費牆需要的所有遠端資料。任何一項失敗都不會 throw。 */
export async function fetchPricing(): Promise<PricingBundle | null> {
  const isConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

  if (isConfigured) {
    try {
      const [plansRes, configRes, seatsRes] = await Promise.all([
        supabase
          .from('pricing_config')
          .select('plan_code, period, amount_cents, founding_amount_cents, currency, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('paywall_config')
          .select('founding_quota_total, founding_enabled, variant')
          .eq('id', 1)
          .maybeSingle(),
        supabase.rpc('founding_seats_remaining'),
      ])

      if (!plansRes.error && plansRes.data && plansRes.data.length > 0) {
        const plans: PricingPlan[] = plansRes.data.map((r) => ({
          planCode: r.plan_code as string,
          period: r.period as PlanPeriod,
          amountCents: r.amount_cents as number,
          foundingAmountCents: (r.founding_amount_cents ?? null) as number | null,
          currency: (r.currency ?? 'TWD') as string,
          sortOrder: (r.sort_order ?? 0) as number,
        }))

        const config: PaywallConfig = {
          foundingQuotaTotal: (configRes.data?.founding_quota_total ?? 0) as number,
          foundingEnabled: (configRes.data?.founding_enabled ?? false) as boolean,
          variant: ((configRes.data?.variant ?? 'A') as 'A' | 'B'),
        }

        const foundingSeatsRemaining =
          seatsRes.error || seatsRes.data == null ? null : (seatsRes.data as number)

        return { plans, config, foundingSeatsRemaining }
      }
    } catch {
      // Proceed to FastAPI fallback
    }
  }

  // Fallback: Fetch from FastAPI /v1/billing/plans or use local plans
  try {
    const res = await fetch(`${API_URL}/v1/billing/plans`)
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        const plans: PricingPlan[] = data.map((r: Record<string, unknown>, idx: number) => ({
          planCode: (r.code || r.planCode) as string,
          period: ((r.period as string) || (r.code === 'yearly' ? 'year' : 'month')) as PlanPeriod,
          amountCents: (r.amount_cents ?? r.amountCents) as number,
          foundingAmountCents: null,
          currency: (r.currency || 'TWD') as string,
          sortOrder: idx + 1,
        }))
        return {
          plans,
          config: { foundingQuotaTotal: 0, foundingEnabled: false, variant: 'A' },
          foundingSeatsRemaining: null,
        }
      }
    }
  } catch {
    // Proceed to default plans
  }

  return {
    plans: DEFAULT_PLANS,
    config: { foundingQuotaTotal: 0, foundingEnabled: false, variant: 'A' },
    foundingSeatsRemaining: null,
  }
}

/** 創始會員價目前是否適用：後台開關開著、名額查得到且還有剩。 */
export function foundingActive(bundle: PricingBundle): boolean {
  return (
    bundle.config.foundingEnabled &&
    bundle.foundingSeatsRemaining != null &&
    bundle.foundingSeatsRemaining > 0
  )
}
