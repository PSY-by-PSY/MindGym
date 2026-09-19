import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: {} }))

import { streakFromDates } from '../streak'

describe('連續打卡天數', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 19, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('今天有打卡時從今天開始計算', () => {
    expect(streakFromDates(['2026-09-19', '2026-09-18', '2026-09-17'])).toBe(3)
  })

  it('今天尚未打卡時允許從昨天延續', () => {
    expect(streakFromDates(['2026-09-18', '2026-09-17'])).toBe(2)
  })

  it('中間缺一天時停止計算', () => {
    expect(streakFromDates(['2026-09-19', '2026-09-17', '2026-09-16'])).toBe(1)
  })

  it('重複日期不會重複計算', () => {
    expect(streakFromDates(['2026-09-19', '2026-09-19', '2026-09-18'])).toBe(2)
  })

  it('接受帶時間的日期字串', () => {
    expect(streakFromDates(['2026-09-19T08:00:00+08:00'])).toBe(1)
  })
})
