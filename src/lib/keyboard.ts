import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

// ── 鍵盤高度：CSS 變數 + React 訂閱 ────────────────────────────────────
// 版面同時需要兩種形式：CSS 用 --keyboard-height 算高度，元件則要知道「鍵盤
// 開著沒」才能收起裝飾（不能只看輸入框 focus——iOS 上鍵盤還開著、focus 卻已
// 經掉了的狀態確實會發生，這時若還照「沒在打字」的版面排，按鈕會被裁掉）。
let keyboardHeight = 0
const keyboardListeners = new Set<() => void>()

function setKeyboardHeight(next: number) {
  const value = Math.max(0, Math.round(next))
  if (value === keyboardHeight) return
  keyboardHeight = value
  document.documentElement.style.setProperty('--keyboard-height', `${value}px`)
  keyboardListeners.forEach((fn) => fn())
}

function subscribeKeyboard(fn: () => void) {
  keyboardListeners.add(fn)
  return () => {
    keyboardListeners.delete(fn)
  }
}

/** 目前鍵盤高度（px）；沒有鍵盤／桌機恆為 0。 */
export function useKeyboardHeight(): number {
  return useSyncExternalStore(
    subscribeKeyboard,
    () => keyboardHeight,
    () => 0,
  )
}

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

// ── 主動收鍵盤 ────────────────────────────────────────────────────────────
// 練習頁多半是「同一個路由、換 stage」：按下一步時輸入框直接被卸載，iOS 不會
// 因此收鍵盤（沒有 blur 事件），使用者就會看到回顧頁／發佈頁上鍵盤還杵在那裡
// （學員回報）。凡是「接下來不需要打字」的畫面，都該主動收一次。

/** 主動收起鍵盤。網頁只能靠 blur；原生再叫一次 Keyboard.hide() 保險。 */
export function dismissKeyboard(): void {
  const el = document.activeElement as HTMLElement | null
  if (isFormField(el)) el.blur()
  if (Capacitor.isNativePlatform()) void Keyboard.hide()
}

/**
 * 多階段練習用：傳入「這個畫面需不需要打字」，一旦從『需要』變成『不需要』就
 * 收鍵盤。刻意只收在下降緣——進到書寫頁時不去動它，才不會把 autoFocus 叫出來
 * 的鍵盤又關掉。首次掛載不觸發。
 *
 * 例：useAutoDismissKeyboard(stage === 'WRITING')
 */
export function useAutoDismissKeyboard(needsTyping: boolean): void {
  const prevRef = useRef(needsTyping)
  useEffect(() => {
    const wasTyping = prevRef.current
    prevRef.current = needsTyping
    if (wasTyping && !needsTyping) dismissKeyboard()
  }, [needsTyping])
}

// 「點空白處收鍵盤」只認真正的『點一下』：按下與放開要在同一個位置附近、
// 而且夠短。用 pointerdown 直接收鍵盤的話，使用者想『把頁面往上滑一點、看
// 自己打了什麼』時，手指一按下去鍵盤就收掉，等於根本沒辦法邊打字邊捲動
// （TestFlight 回饋：要一直收鍵盤開鍵盤）。
const TAP_MOVE_TOLERANCE = 10 // px
const TAP_MAX_DURATION = 600 // ms

export function useGlobalKeyboard(): void {
  // [2] 點輸入框外的任何空白處 → 自動收起鍵盤（捲動手勢不算）
  useEffect(() => {
    let start: { x: number; y: number; time: number } | null = null

    const isDismissTarget = (target: Element | null) =>
      !target?.closest('input, textarea, select, [contenteditable="true"], button, a, label')

    const onPointerDown = (e: PointerEvent) => {
      if (!isFormField(document.activeElement)) return
      if (!isDismissTarget(e.target as Element | null)) return
      start = { x: e.clientX, y: e.clientY, time: Date.now() }
    }

    const onPointerUp = (e: PointerEvent) => {
      const down = start
      start = null
      if (!down) return
      const active = document.activeElement
      if (!isFormField(active)) return
      if (!isDismissTarget(e.target as Element | null)) return
      // 手指有移動＝捲動／滑動，不是點擊 → 鍵盤留著
      if (Math.abs(e.clientX - down.x) > TAP_MOVE_TOLERANCE) return
      if (Math.abs(e.clientY - down.y) > TAP_MOVE_TOLERANCE) return
      if (Date.now() - down.time > TAP_MAX_DURATION) return
      ;(active as HTMLElement).blur()
      if (Capacitor.isNativePlatform()) void Keyboard.hide()
    }

    const onPointerCancel = () => {
      start = null
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('pointercancel', onPointerCancel, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('pointercancel', onPointerCancel, true)
    }
  }, [])

  // [5] 原生：管理 --keyboard-height，並在鍵盤完全展開後捲動到輸入框
  // 刻意在 keyboardDidShow（動畫結束、高度確定）而非 focusin 捲動，
  // 確保以精確的鍵盤高度計算捲動量，避免把輸入框捲到鍵盤後面。
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const subs: { remove: () => void }[] = []
    const setH = setKeyboardHeight

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
      setKeyboardHeight(0)
    }
  }, [])

  // 安全網：鍵盤還開著、但畫面上已經沒有任何輸入框被聚焦（輸入框隨著換頁／換
  // stage 被卸載時就是這個狀態，iOS 不會自己收鍵盤）。監看 DOM 變動，發現這種
  // 「孤兒鍵盤」就收掉，不必每個練習頁各自記得處理。
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let timer: number | undefined
    const check = () => {
      if (keyboardHeight <= 0) return
      if (isFormField(document.activeElement)) return
      void Keyboard.hide()
    }
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(check, 150)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [])

  // [5] 網頁（非原生）：沒有 Keyboard plugin，改用 visualViewport 推算鍵盤高度，
  // 讓 --keyboard-height 在手機瀏覽器也有值——測驗頁的版面靠這個變數把輸入框
  // 留在鍵盤上方（見 QuestionnaireScreen），不然網頁版一樣會被鍵盤蓋住。
  // 桌機沒有虛擬鍵盤，算出來恆為 0，行為與過去一致。
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return
    const vv = window.visualViewport
    const setH = setKeyboardHeight

    const sync = () => {
      if (!vv) return
      // 使用者放大縮放時視覺視窗也會變小，那不是鍵盤，別誤判。
      if (vv.scale > 1.05) return
      // 視覺視窗被鍵盤蓋掉的那一段（含捲動偏移）。留 60px 門檻濾掉網址列收合。
      const covered = window.innerHeight - vv.height - vv.offsetTop
      setH(covered > 60 ? covered : 0)
    }

    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    sync()

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Element | null
      if (!isFormField(t)) return
      // 等鍵盤動畫與版面重繪完成，再用當下的鍵盤高度捲動
      setTimeout(() => {
        sync()
        scrollActiveIntoView(keyboardHeight)
      }, 250)
    }
    document.addEventListener('focusin', onFocusIn)

    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      document.removeEventListener('focusin', onFocusIn)
      setH(0)
    }
  }, [])
}
