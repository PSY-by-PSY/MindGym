// 全站字體大小設定（無障礙「大字」功能）。
// 透過設定 <html data-font-scale="...">，搭配 index.css 調整 html 的 font-size，
// 讓所有以 rem 為單位的 Tailwind 字級一起放大，眼睛不方便的使用者能看得更清楚。
export type FontScale = 'standard' | 'large' | 'xlarge'

const KEY = 'font_scale'

export const FONT_SCALE_OPTIONS: { value: FontScale; label: string }[] = [
  { value: 'standard', label: '標準' },
  { value: 'large', label: '大' },
  { value: 'xlarge', label: '特大' },
]

export function getFontScale(): FontScale {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'large' || v === 'xlarge' || v === 'standard') return v
  } catch {
    // localStorage 不可用時退回標準
  }
  return 'standard'
}

export function applyFontScale(scale: FontScale): void {
  document.documentElement.dataset.fontScale = scale
}

export function setFontScale(scale: FontScale): void {
  try {
    localStorage.setItem(KEY, scale)
  } catch {
    // 忽略寫入失敗（隱私模式等）
  }
  applyFontScale(scale)
}
