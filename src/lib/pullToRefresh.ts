import { useEffect, useRef, useState } from 'react'

// 下拉重整（規格 [3]）：比照 IG / Threads，在頁面頂端往下拉超過門檻就重整。
export const PULL_THRESHOLD = 70
const MAX_PULL = 110
// 阻尼：實際位移只反映一半，拉起來才有「橡皮筋」手感。
const DAMPING = 0.5

function scrollTop(): number {
  return window.scrollY || document.documentElement.scrollTop || 0
}

// 回傳目前下拉距離與是否重整中；onRefresh 應為穩定參考（用 useCallback 包）。
export function usePullToRefresh(onRefresh: () => void | Promise<void>) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const active = useRef(false)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)

  useEffect(() => {
    const set = (v: number) => {
      pullRef.current = v
      setPull(v)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return
      if (scrollTop() > 0) return
      startY.current = e.touches[0].clientY
      active.current = true
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!active.current || startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      // 往上滑、或頁面已不在頂端 → 取消（讓正常捲動接手）。
      if (dy <= 0 || scrollTop() > 0) {
        active.current = false
        set(0)
        return
      }
      set(Math.min(MAX_PULL, dy * DAMPING))
    }
    const onTouchEnd = () => {
      if (!active.current) return
      active.current = false
      startY.current = null
      if (pullRef.current >= PULL_THRESHOLD) {
        refreshingRef.current = true
        setRefreshing(true)
        set(PULL_THRESHOLD)
        void onRefresh()
      } else {
        set(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [onRefresh])

  return { pull, refreshing }
}
