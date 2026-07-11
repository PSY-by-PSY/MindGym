import { useEffect, useState } from 'react'

interface Props {
  /** Time to reach RAMP_TARGET%, matches the typical AI response time. */
  durationMs?: number
  className?: string
}

const RAMP_TARGET = 95
const STALL_CAP = 99
const STALL_TAU_MS = 3000

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

// Progress eases 0 → 95% over `durationMs` (matches measured AI response
// time), then creeps asymptotically toward 99% if the response is still
// pending — never claims "done" before the data actually arrives.
export default function AiProgressBar({ durationMs = 4000, className = '' }: Props) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const start = performance.now()
    let raf = 0

    function tick(now: number) {
      const elapsed = now - start
      const next =
        elapsed < durationMs
          ? RAMP_TARGET * easeOutCubic(elapsed / durationMs)
          : RAMP_TARGET + (STALL_CAP - RAMP_TARGET) * (1 - Math.exp(-(elapsed - durationMs) / STALL_TAU_MS))
      setProgress(Math.min(next, STALL_CAP))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [durationMs])

  return (
    <div className={`w-full ${className}`}>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--muted)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${progress}%`,
            background: 'var(--gradient-primary)',
            transition: 'width 120ms linear',
          }}
        />
      </div>
    </div>
  )
}
