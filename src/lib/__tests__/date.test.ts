import { describe, expect, it } from 'vitest'

import { isoLocalDate, parseLocalDate } from '../date'

describe('本地日期工具', () => {
  it('將年月日補零成 YYYY-MM-DD', () => {
    expect(isoLocalDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('保留本地日期，不受時間部分影響', () => {
    expect(isoLocalDate(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31')
  })

  it('把 ISO 日期解析成本地午夜', () => {
    const result = parseLocalDate('2024-02-29')

    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(29)
    expect(result.getHours()).toBe(0)
  })
})
