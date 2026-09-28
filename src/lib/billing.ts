// ─────────────────────────────────────────────────────────────────────────
// 帳務金流 Client 庫 —— 串接 FastAPI /v1/billing API 與 PAYUNi UPP 自動導轉
// ─────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export interface CreateCheckoutParams {
  planCode: string
  termsVersion?: string
  recurringConsentVersion?: string
}

export interface CheckoutSessionResult {
  orderId: string
  status: string
  expiresAt: string
  redirectUrl?: string | null
  formAction?: string | null
  formFields?: Record<string, string> | null
}

/**
 * 呼叫 POST /v1/billing/checkout-sessions 建立初始結帳訂單
 */
export async function createCheckoutSession(
  params: CreateCheckoutParams
): Promise<CheckoutSessionResult> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  if (!token) {
    throw new Error('未登入或 Session 已過期，請重新登入')
  }

  const termsVersion = params.termsVersion ?? '2026-09-28'
  const recurringConsentVersion = params.recurringConsentVersion ?? '2026-09-28'

  const res = await fetch(`${API_URL}/v1/billing/checkout-sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      plan_code: params.planCode,
      terms_version: termsVersion,
      recurring_consent: true,
      recurring_consent_version: recurringConsentVersion,
    }),
  })

  if (!res.ok) {
    let errorDetail = '建立結帳訂單失敗'
    try {
      const errJson = await res.json()
      if (errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail)
      }
    } catch {
      // parse fail fallback
    }

    if (res.status === 503) {
      throw new Error('線上付款服務整備中，暫無法建立訂單 (503 Service Unavailable)')
    }
    throw new Error(errorDetail)
  }

  const data = await res.json()
  return {
    orderId: data.order_id,
    status: data.status,
    expiresAt: data.expires_at,
    redirectUrl: data.redirect_url,
    formAction: data.form_action,
    formFields: data.form_fields,
  }
}

/**
 * 在記憶體動態建立隱藏 DOM 表單並自動 .submit() 跳轉至 PAYUNi UPP 刷卡頁
 */
export function submitPayuniForm(formAction: string, formFields: Record<string, string>): void {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = formAction
  form.style.display = 'none'

  Object.entries(formFields).forEach(([key, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = value
    form.appendChild(input)
  })

  document.body.appendChild(form)
  form.submit()
}

export interface OrderStatus {
  id: string
  status: string
  paidAt: string | null
  expiresAt: string
  canResume: boolean
}

/**
 * 呼叫 GET /v1/billing/orders/{id} 查詢訂單狀態
 */
export async function fetchOrderStatus(orderId: string): Promise<OrderStatus> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  if (!token) {
    throw new Error('未登入或 Session 已過期')
  }

  const res = await fetch(`${API_URL}/v1/billing/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    throw new Error(`無法查詢訂單狀態 (HTTP ${res.status})`)
  }

  const data = await res.json()
  return {
    id: data.id,
    status: data.status,
    paidAt: data.paid_at,
    expiresAt: data.expires_at,
    canResume: data.can_resume,
  }
}

export interface OrderHistoryItem {
  id: string
  status: string
  kind: string
  amountCents: number
  currency: string
  createdAt: string
  paidAt: string | null
  expiresAt: string
}

export interface BillingOverview {
  tier: string
  isPro: boolean
  subscriptionId: string | null
  planCode: string | null
  subscriptionStatus: string | null
  currentPeriodEndsAt: string | null
  nextChargeAt: string | null
  cancelAt: string | null
  orders: OrderHistoryItem[]
}

/**
 * 呼叫 GET /v1/billing/me 取得帳務與訂閱總覽
 */
export async function fetchBillingOverview(): Promise<BillingOverview> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  if (!token) {
    throw new Error('未登入或 Session 已過期')
  }

  const res = await fetch(`${API_URL}/v1/billing/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    throw new Error(`無法取得帳務資訊 (HTTP ${res.status})`)
  }

  const data = await res.json()
  return {
    tier: data.tier ?? 'free',
    isPro: Boolean(data.is_pro),
    subscriptionId: data.subscription_id,
    planCode: data.plan_code,
    subscriptionStatus: data.subscription_status,
    currentPeriodEndsAt: data.current_period_ends_at,
    nextChargeAt: data.next_charge_at,
    cancelAt: data.cancel_at,
    orders: (data.orders ?? []).map((o: any) => ({
      id: o.id,
      status: o.status,
      kind: o.kind,
      amountCents: o.amount_cents,
      currency: o.currency,
      createdAt: o.created_at,
      paidAt: o.paid_at,
      expiresAt: o.expires_at,
    })),
  }
}

export interface CancelSubscriptionResult {
  subscriptionId: string
  status: string
  currentPeriodEndsAt: string
  cancelAt: string
}

/**
 * 呼叫 POST /v1/billing/subscription/cancel 取消自動續約
 */
export async function cancelSubscription(): Promise<CancelSubscriptionResult> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  if (!token) {
    throw new Error('未登入或 Session 已過期')
  }

  const res = await fetch(`${API_URL}/v1/billing/subscription/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    let errorDetail = '取消自動續訂失敗'
    try {
      const errJson = await res.json()
      if (errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail)
      }
    } catch {
      // parse fallback
    }
    throw new Error(errorDetail)
  }

  const data = await res.json()
  return {
    subscriptionId: data.subscription_id,
    status: data.status,
    currentPeriodEndsAt: data.current_period_ends_at,
    cancelAt: data.cancel_at,
  }
}

