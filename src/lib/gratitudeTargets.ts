// 感恩對象（target_1..3）的共用中繼資料：配色、標籤、心理學說明。
// 「感恩對象地圖」（app.profile.tsx）與「一週回顧」頁共用同一套，避免兩處各刻一份。
export type TargetCode = 'others' | 'self' | 'environment' | 'experience' | 'custom'

export const TARGET_META: Record<TargetCode, { label: string }> = {
  others:      { label: '身邊他人' },
  self:        { label: '自己' },
  environment: { label: '環境' },
  experience:  { label: '體驗' },
  custom:      { label: '自訂' },
}

// 暖色重設計：對齊附圖五（自己=金、身邊他人=藍、自訂=粉），其餘沿用全站語意色
export const TARGET_COLORS: Record<TargetCode, string> = {
  self:        '#F1C166',
  others:      '#88B8CE',
  environment: '#7BA86E',
  experience:  '#C99A6A',
  custom:      '#D18197',
}

export const TARGET_INSIGHT: Record<TargetCode, string> = {
  others:      '你的幸福感有很大一部分來自身邊的人，珍惜這些連結吧。',
  self:        '你非常懂得欣賞自己的努力與成長，這是很珍貴的自我覺察。',
  environment: '你對生活中的細微美好特別敏感，這份覺察讓你隨時都能找到禮物。',
  experience:  '你善於從日常的小體驗中找到喜悅，生活對你來說充滿驚喜。',
  custom:      '你的感恩來自各種面向，這份多元的覺察豐富了你的內在世界。',
}

export const TARGET_INFO: Record<TargetCode, { title: string; desc: string }> = {
  others:      { title: '身邊他人', desc: '感謝身邊的人能強化社會連結感（Relatedness），是 PERMA 中「R」的核心。研究顯示，表達感謝能同時提升給予者與接受者的幸福感。' },
  self:        { title: '自己', desc: '對自己的努力心存感謝，能培養自我同情（Self-Compassion）與成長型思維（Growth Mindset），減少自我批評，增加心理韌性。' },
  environment: { title: '環境', desc: '對自然與空間的感謝能喚起「敬畏感」（Awe），研究發現敬畏感能降低壓力荷爾蒙，並擴展我們對世界的視野。' },
  experience:  { title: '體驗', desc: '感謝日常體驗能強化「正向情緒記憶」，讓大腦更容易在未來注意到美好的事物，形成正向情緒的上升螺旋。' },
  custom:      { title: '自訂', desc: '多元的感恩來源代表你的覺察力不受限制，能從生活的各個角落汲取力量。' },
}

/** 從一批 target_1..3 陣列算出出現次數與佔比，依次數由高到低排序。 */
export function targetBreakdown(
  targets: (TargetCode | null | undefined)[],
): { code: TargetCode; count: number; pct: number }[] {
  const counts: Partial<Record<TargetCode, number>> = {}
  for (const val of targets) {
    if (val) counts[val] = (counts[val] ?? 0) + 1
  }
  const total = Object.values(counts).reduce((s, v) => s + v, 0)
  if (total === 0) return []
  return (Object.entries(counts) as [TargetCode, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, count, pct: count / total }))
}
