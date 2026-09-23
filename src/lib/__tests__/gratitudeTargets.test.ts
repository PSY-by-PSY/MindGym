import { describe, expect, it } from 'vitest'

import { targetBreakdown } from '../gratitudeTargets'

describe('感恩對象統計', () => {
  it('空值不會產生分類', () => {
    expect(targetBreakdown([null, undefined])).toEqual([])
  })

  it('依次數由高到低排序並計算比例', () => {
    expect(targetBreakdown(['self', 'others', 'self', 'experience'])).toEqual([
      { code: 'self', count: 2, pct: 0.5 },
      { code: 'others', count: 1, pct: 0.25 },
      { code: 'experience', count: 1, pct: 0.25 },
    ])
  })

  it('單一分類的比例為百分之百', () => {
    expect(targetBreakdown(['environment', 'environment'])).toEqual([
      { code: 'environment', count: 2, pct: 1 },
    ])
  })
})
