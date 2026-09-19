import { describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: {} }))
vi.mock('../nativeAuth', () => ({ isNativeApp: () => false }))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web' } }))

import { compareVersions } from '../appVersion'

describe('App 版本比較', () => {
  it.each([
    ['1.2', '1.2.0'],
    ['1.0.0', '1.0.0'],
    ['1.beta.0', '1.0.0'],
    ['', '0'],
  ])('%s 與 %s 視為相同版本', (a, b) => {
    expect(compareVersions(a, b)).toBe(0)
  })

  it('較新的主版本回傳正數', () => {
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0)
  })

  it('較舊的修補版本回傳負數', () => {
    expect(compareVersions('1.2.2', '1.2.3')).toBeLessThan(0)
  })
})
