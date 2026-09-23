import { describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: {} }))

import {
  effectiveAmountCents,
  formatAmount,
  foundingActive,
  monthlyEquivalent,
  savingsPercent,
  type PricingBundle,
  type PricingPlan,
} from '../pricing'

const monthly: PricingPlan = {
  planCode: 'monthly',
  period: 'month',
  amountCents: 9900,
  foundingAmountCents: 7900,
  currency: 'TWD',
  sortOrder: 1,
}

const yearly: PricingPlan = {
  planCode: 'yearly',
  period: 'year',
  amountCents: 94800,
  foundingAmountCents: 79200,
  currency: 'TWD',
  sortOrder: 2,
}

function bundle(foundingEnabled: boolean, seats: number | null): PricingBundle {
  return {
    plans: [monthly, yearly],
    config: { foundingQuotaTotal: 100, foundingEnabled, variant: 'A' },
    foundingSeatsRemaining: seats,
  }
}

describe('價格計算', () => {
  it('將 TWD 分轉成不含小數的金額', () => {
    expect(formatAmount(9900, 'TWD')).toBe('NT$99')
  })

  it('只有啟用創始價時才使用創始金額', () => {
    expect(effectiveAmountCents(monthly, true)).toBe(7900)
    expect(effectiveAmountCents(monthly, false)).toBe(9900)
  })

  it('年繳創始價可換算成每月等價金額', () => {
    expect(monthlyEquivalent(yearly, true)).toBe('NT$66')
  })

  it('計算年繳相對月繳的折扣百分比', () => {
    expect(savingsPercent(yearly, monthly, false)).toBe(20)
  })

  it('缺少方案或月繳為零時不產生折扣', () => {
    expect(savingsPercent(undefined, monthly, false)).toBeNull()
    expect(savingsPercent(yearly, { ...monthly, amountCents: 0 }, false)).toBeNull()
  })

  it('創始方案必須同時開啟且仍有名額', () => {
    expect(foundingActive(bundle(true, 1))).toBe(true)
    expect(foundingActive(bundle(false, 1))).toBe(false)
    expect(foundingActive(bundle(true, 0))).toBe(false)
    expect(foundingActive(bundle(true, null))).toBe(false)
  })
})
