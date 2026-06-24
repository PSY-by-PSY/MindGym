import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

// 表單欄位判斷：input / textarea / select / contenteditable。
const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isFormField(el: Element | null): el is HTMLElement {
  if (!el) return false
  return FORM_TAGS.has(el.tagName) || (el as HTMLElement).isContentEditable
}

// 全站鍵盤行為（規格 [2][5]）：
//   [2] 點輸入框以外的任何空白處 → 自動收起鍵盤。
//   [5] 鍵盤彈出時，於底部加上等高留白，並把聚焦的輸入框捲入可視範圍，
//       避免靠近頁面底端的留言框被鍵盤蓋住、無法看到或送出。
//
// Capacitor Keyboard resize 設為 'none'（鍵盤覆蓋在 WebView 上、不縮小視窗），
// 因此需自行補底部留白才有空間把輸入框捲上來。透過 CSS 變數 --keyboard-height
// 提供給版面（app shell 的 <main> 會把它加進 padding-bottom）。
export function useGlobalKeyboard(): void {
  // [2] 點外面收鍵盤
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const active = document.activeElement
      if (!isFormField(active)) return
      const target = e.target as Element | null
      // 點在輸入框／送出鈕／連結／label 上不收（讓這些控制項照常運作）。
      if (target?.closest('input, textarea, select, [contenteditable="true"], button, a, label')) {
        return
      }
      ;(active as HTMLElement).blur()
      if (Capacitor.isNativePlatform()) void Keyboard.hide()
    }
    // capture 階段攔截，確保任何空白處點擊都能收鍵盤。
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  // [5] 鍵盤彈出 → 設定 --keyboard-height（原生）。
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const subs: { remove: () => void }[] = []
    const setH = (h: number) =>
      document.documentElement.style.setProperty('--keyboard-height', `${h}px`)

    void Keyboard.addListener('keyboardWillShow', (info) => setH(info.keyboardHeight ?? 0)).then((s) => subs.push(s))
    void Keyboard.addListener('keyboardDidShow', (info) => setH(info.keyboardHeight ?? 0)).then((s) => subs.push(s))
    void Keyboard.addListener('keyboardWillHide', () => setH(0)).then((s) => subs.push(s))
    return () => {
      subs.forEach((s) => s.remove())
      document.documentElement.style.setProperty('--keyboard-height', '0px')
    }
  }, [])

  // [5] 聚焦輸入框 → 捲入可視範圍（網頁與原生都做，原生延遲久一點等鍵盤動畫）。
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Element | null
      if (!isFormField(t)) return
      const delay = Capacitor.isNativePlatform() ? 300 : 120
      setTimeout(() => {
        ;(t as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' })
      }, delay)
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])
}
