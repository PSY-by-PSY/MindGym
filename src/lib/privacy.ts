// 感恩日記的隱私設定（三選一）。底層仍沿用既有的兩個欄位：
//   is_shared     —— 是否出現在社群打卡牆
//   use_real_name —— 在社群中以實名還是「能量代號」匿名顯示
// 三個選項對應如下，因此不需要任何資料庫遷移：
//   community  分享到社群  → is_shared=true,  use_real_name=true
//   anonymous  匿名分享    → is_shared=true,  use_real_name=false
//   private    僅限本人    → is_shared=false（use_real_name 不影響顯示）
export type Privacy = 'community' | 'anonymous' | 'private'

export const DEFAULT_PRIVACY: Privacy = 'community'

export const PRIVACY_OPTIONS: { value: Privacy; label: string; hint: string }[] = [
  { value: 'community', label: '分享到社群', hint: '你的名字會顯示在打卡牆上' },
  { value: 'anonymous', label: '匿名分享',   hint: '以「能量代號」匿名出現在打卡牆' },
  { value: 'private',   label: '僅限本人',   hint: '只有你看得到，不會出現在打卡牆' },
]

// 由隱私選項推回兩個資料庫欄位的值
export function privacyToFields(privacy: Privacy): { is_shared: boolean; use_real_name: boolean } {
  return {
    is_shared: privacy !== 'private',
    use_real_name: privacy === 'community',
  }
}

// 由資料庫欄位推回隱私選項（給既有貼文用；舊資料不會受影響）
export function privacyFromFields(fields: {
  is_shared?: boolean | null
  use_real_name?: boolean | null
}): Privacy {
  if (fields.is_shared === false) return 'private'
  return fields.use_real_name ? 'community' : 'anonymous'
}
