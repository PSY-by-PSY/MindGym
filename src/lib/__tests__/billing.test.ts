import { describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'fake-jwt-token-for-test',
          },
        },
      }),
    },
  },
}))

import {
  createCheckoutSession,
  submitPayuniForm,
  fetchOrderStatus,
  fetchBillingOverview,
  cancelSubscription,
} from '../billing'


describe('billing client library', () => {
  it('建立結帳 Session 並正確發送 JWT 與同意版本', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        order_id: 'order_123',
        status: 'pending',
        expires_at: '2026-09-29T16:00:00Z',
        form_action: 'https://upp.payuni.com.tw/api/upp',
        form_fields: { MerID: '123456', EncryptInfo: 'abc' },
      }),
    })
    vi.stubGlobal('fetch', fakeFetch)

    const res = await createCheckoutSession({ planCode: 'pro_monthly' })

    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [url, options] = fakeFetch.mock.calls[0]
    expect(url).toContain('/v1/billing/checkout-sessions')
    expect(options.headers.Authorization).toBe('Bearer fake-jwt-token-for-test')

    const body = JSON.parse(options.body)
    expect(body.plan_code).toBe('pro_monthly')
    expect(body.recurring_consent).toBe(true)
    expect(body.terms_version).toBe('2026-09-28')

    expect(res.orderId).toBe('order_123')
    expect(res.formAction).toBe('https://upp.payuni.com.tw/api/upp')
    expect(res.formFields).toEqual({ MerID: '123456', EncryptInfo: 'abc' })

    vi.unstubAllGlobals()
  })

  it('自動建立隱藏 Form 並調用 submit', () => {
    const createdElements: Array<{ tag: string; action?: string; method?: string; inputs: Array<{ name: string; value: string }> }> = []
    let submitted = false

    const fakeForm = {
      tag: 'form',
      action: '',
      method: '',
      style: { display: '' },
      inputs: [] as Array<{ name: string; value: string }>,
      appendChild(child: any) {
        this.inputs.push(child)
      },
      submit() {
        submitted = true
      },
    }

    const fakeDocument = {
      createElement(tag: string) {
        if (tag === 'form') {
          createdElements.push(fakeForm)
          return fakeForm
        }
        return { type: '', name: '', value: '' }
      },
      body: {
        appendChild: vi.fn(),
      },
    }

    vi.stubGlobal('document', fakeDocument)

    submitPayuniForm('https://upp.payuni.com.tw/api/upp', {
      MerID: 'TEST_MERCHANT',
      Version: '2.0',
    })

    expect(fakeForm.action).toBe('https://upp.payuni.com.tw/api/upp')
    expect(fakeForm.method).toBe('POST')
    expect(fakeForm.inputs.length).toBe(2)
    expect(fakeForm.inputs[0].name).toBe('MerID')
    expect(fakeForm.inputs[0].value).toBe('TEST_MERCHANT')
    expect(fakeForm.inputs[1].name).toBe('Version')
    expect(fakeForm.inputs[1].value).toBe('2.0')
    expect(submitted).toBe(true)

    vi.unstubAllGlobals()
  })

  it('fetchOrderStatus 正確查詢特定訂單狀態', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'ord_123',
        status: 'paid',
        paid_at: '2026-09-28T16:00:00Z',
        expires_at: '2026-09-29T16:00:00Z',
        can_resume: false,
      }),
    })
    vi.stubGlobal('fetch', fakeFetch)

    const res = await fetchOrderStatus('ord_123')

    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [url, options] = fakeFetch.mock.calls[0]
    expect(url).toContain('/v1/billing/orders/ord_123')
    expect(options.headers.Authorization).toBe('Bearer fake-jwt-token-for-test')

    expect(res.id).toBe('ord_123')
    expect(res.status).toBe('paid')
    expect(res.paidAt).toBe('2026-09-28T16:00:00Z')

    vi.unstubAllGlobals()
  })

  it('fetchBillingOverview 正確獲取帳務總覽與訂單歷史', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tier: 'pro',
        is_pro: true,
        subscription_id: 'sub_999',
        plan_code: 'pro_monthly',
        subscription_status: 'active',
        current_period_ends_at: '2026-10-28T16:00:00Z',
        next_charge_at: '2026-10-28T16:00:00Z',
        cancel_at: null,
        orders: [
          {
            id: 'ord_init',
            status: 'paid',
            kind: 'initial_with_token',
            amount_cents: 9900,
            currency: 'TWD',
            created_at: '2026-09-28T16:00:00Z',
            paid_at: '2026-09-28T16:01:00Z',
            expires_at: '2026-09-29T16:00:00Z',
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fakeFetch)

    const res = await fetchBillingOverview()

    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [url, options] = fakeFetch.mock.calls[0]
    expect(url).toContain('/v1/billing/me')
    expect(options.headers.Authorization).toBe('Bearer fake-jwt-token-for-test')

    expect(res.isPro).toBe(true)
    expect(res.tier).toBe('pro')
    expect(res.subscriptionStatus).toBe('active')
    expect(res.orders.length).toBe(1)
    expect(res.orders[0].amountCents).toBe(9900)

    vi.unstubAllGlobals()
  })

  it('cancelSubscription 正確呼叫取消自動續訂 API', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        subscription_id: 'sub_999',
        status: 'cancel_scheduled',
        current_period_ends_at: '2026-10-28T16:00:00Z',
        cancel_at: '2026-10-28T16:00:00Z',
      }),
    })
    vi.stubGlobal('fetch', fakeFetch)

    const res = await cancelSubscription()

    expect(fakeFetch).toHaveBeenCalledTimes(1)
    const [url, options] = fakeFetch.mock.calls[0]
    expect(url).toContain('/v1/billing/subscription/cancel')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer fake-jwt-token-for-test')

    expect(res.status).toBe('cancel_scheduled')
    expect(res.subscriptionId).toBe('sub_999')

    vi.unstubAllGlobals()
  })
})


