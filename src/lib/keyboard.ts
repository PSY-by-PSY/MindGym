import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const SCROLL_MARGIN = 16 // px breathing room above keyboard

function isFormField(el: Element | null): el is HTMLElement {
  if (!el) return false
  return FORM_TAGS.has(el.tagName) || (el as HTMLElement).isContentEditable
}

// 把聚焦的輸入框捲入鍵盤上方可視區域。
// 先找最近的可滾動祖先（fixed modal 的 overflow-y:auto div），
// 沒有就滾 window。
function scrollActiveIntoView(keyboardHeight: number) {
  const el = document.activeElement as HTMLElement | null
  if (!isFormField(el)) return

  const rect = el.getBoundingClientRect()
  const visibleBottom = window.innerHeight - keyboardHeight - SCROLL_MARGIN

  // 已在可視區內則不動
  if (rect.bottom <= visibleBottom && rect.top >= 0) return

  // 找可滾動祖先
  let scrollParent: Element | null = el.parentElement
  while (scrollParent && scrollParent !== document.body) {
    const style = window.getComputedStyle(scrollParent)
    const overflow = style.overflowY
    if (overflow === 'auto' || overflow === 'scroll') {
      const parentRect = scrollParent.getBoundingClientRect()
      const containerBottom = Math.min(parentRect.bottom, visibleBottom)
      const delta = rect.bottom - containerBottom + SCROLL_MARGIN
      if (delta > 0) scrollParent.scrollBy({ top: delta, behavior: 'smooth' })
      return
    }
    scrollParent = scrollParent.parentElement
  }

  // 沒有可滾動祖先 → 滾 window
  if (rect.bottom > visibleBottom) {
    window.scrollBy({ top: rect.bottom - visibleBottom, behavior: 'smooth' })
  } else if (rect.top < 80) {
    window.scrollBy({ top: rect.top - 80, behavior: 'smooth' })
  }
}

export function useGlobalKeyboard(): void {
  // [2] 點輸入框外的任何空白處 → 自動收起鍵盤
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const active = document.activeElement
      if (!isFormField(active)) return
      const target = e.target as Element | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], button, a, label')) return
      ;(active as HTMLElement).blur()
      if (Capacitor.isNativePlatform()) void Keyboard.hide()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  // [5] 原生：管理 --keyboard-height，並在鍵盤完全展開後捲動到輸入框
  // 刻意在 keyboardDidShow（動畫結束、高度確定）而非 focusin 捲動，
  // 確保以精確的鍵盤高度計算捲動量，避免把輸入框捲到鍵盤後面。
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const subs: { remove: () => void }[] = []
    const setH = (h: number) =>
      document.documentElement.style.setProperty('--keyboard-height', `${h}px`)

    void Keyboard.addListener('keyboardWillShow', (info) => setH(info.keyboardHeight ?? 0)).then((s) => subs.push(s))
    void Keyboard.addListener('keyboardDidShow', (info) => {
      const kh = info.keyboardHeight ?? 0
      setH(kh)
      // 50ms 等版面重繪後再捲動，避免捲動量用到舊 rect
      setTimeout(() => scrollActiveIntoView(kh), 50)
    }).then((s) => subs.push(s))
    void Keyboard.addListener('keyboardWillHide', () => setH(0)).then((s) => subs.push(s))

    return () => {
      subs.forEach((s) => s.remove())
      document.documentElement.style.setProperty('--keyboard-height', '0px')
    }
  }, [])

  // [5] 網頁（非原生）：focusin 後捲動（無鍵盤高度可取，只補上邊界）
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Element | null
      if (!isFormField(t)) return
      setTimeout(() => scrollActiveIntoView(0), 120)
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])
}
