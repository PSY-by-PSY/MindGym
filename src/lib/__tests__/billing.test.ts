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

import { createCheckoutSession, submitPayuniForm } from '../billing'

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
})

