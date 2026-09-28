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
