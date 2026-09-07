import { useCallback, useState } from 'react'
import { shouldShowFoundingInvite } from './foundingInvite'

/**
 * 模組完成時用來攔截原本要做的導覽（通常是跳去社群）：先問一次該不該顯示創始成員邀請，
 * 該顯示就先攔下導覽、跳邀請視窗，使用者關掉視窗後才真的執行原本要做的事。
 *
 * ⚠️ 2026-09-01 起「**每次**完成練習都會跳」，不再是一輩子一次——
 *    只有已經是創始成員的人不會再看到（見 foundingInvite.ts）。
 */
export function useFoundingInviteGate() {
  const [open, setOpen] = useState(false)
  const [proceed, setProceed] = useState<(() => void) | null>(null)

  const gate = useCallback((onProceed: () => void) => {
    void shouldShowFoundingInvite().then((shouldShow) => {
      if (shouldShow) {
        setProceed(() => onProceed)
        setOpen(true)
      } else {
        onProceed()
      }
    })
  }, [])

  const dismiss = useCallback(() => {
    setOpen(false)
    proceed?.()
    setProceed(null)
  }, [proceed])

  return { open, gate, dismiss }
}
