import { useEffect, useRef } from 'react'

// 讓「練習內部的分頁（stage/phase）」也能被瀏覽器返回、iOS 邊緣滑動手勢、
// 與畫面上的返回鍵一致地「退一層」，而不是直接離開整個路由跳回首頁。
//
// 原理：只要目前不在「最外層」畫面，就確保歷史堆疊上多墊一筆（guard）。
// 使用者一按返回／一滑，瀏覽器彈出這筆 guard，我們攔截 popstate、
// 呼叫呼叫端算好的 onBack（該階段該退到哪一步），再視情況補上新的 guard，
// 讓下一次返回還能繼續攔截；退到最外層畫面時則不再補 guard，
// 這樣「再按一次返回」才會真的離開這個練習、回到上一頁（例如首頁）。
//
// 畫面上的返回鍵請呼叫這個 hook 回傳的 goBack()，讓兩種操作走同一條路徑。
export function useStageBack<T>(stage: T, isBaseStage: (stage: T) => boolean, onBack: () => void): () => void {
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  const armedRef = useRef(false)

  useEffect(() => {
    if (isBaseStage(stage)) {
      armedRef.current = false
      return
    }
    if (!armedRef.current) {
      window.history.pushState({ __stageGuard: true }, '')
      armedRef.current = true
    }
  }, [stage, isBaseStage])

  useEffect(() => {
    function handlePopState() {
      if (!armedRef.current) return
      armedRef.current = false
      onBackRef.current()
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return () => window.history.back()
}
