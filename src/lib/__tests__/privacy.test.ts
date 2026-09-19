import { describe, expect, it } from 'vitest'

import { privacyFromFields, privacyToFields, type Privacy } from '../privacy'

describe('隱私設定與資料庫欄位轉換', () => {
  it.each<[Privacy, boolean, boolean]>([
    ['community', true, true],
    ['anonymous', true, false],
    ['private', false, false],
  ])('%s 轉成正確的分享欄位', (privacy, isShared, useRealName) => {
    expect(privacyToFields(privacy)).toEqual({
      is_shared: isShared,
      use_real_name: useRealName,
    })
  })

  it.each<Privacy>(['community', 'anonymous', 'private'])('%s 可以雙向轉換', (privacy) => {
    expect(privacyFromFields(privacyToFields(privacy))).toBe(privacy)
  })

  it('舊資料未標記實名時視為匿名分享', () => {
    expect(privacyFromFields({})).toBe('anonymous')
  })
})
