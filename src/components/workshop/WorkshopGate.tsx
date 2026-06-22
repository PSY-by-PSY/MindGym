import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  parseWorkshopPassword,
  isWorkshopUnlocked,
  unlockWorkshop,
} from '../../lib/workshop'

// 工作坊模塊的密碼閘門：未通過驗證時顯示密碼輸入畫面，通過後才渲染 children
// （也就是該模塊的練習內容）。三個工作坊模塊共用同一個 sessionStorage 解鎖狀態，
// 因此通過一次後，本次使用階段內切換其他模塊都不會再被擋下。
export function WorkshopGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => isWorkshopUnlocked())

  if (unlocked) return <>{children}</>
  return <PasswordScreen onUnlock={() => setUnlocked(true)} />
}

function PasswordScreen({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const { ok, workshopId } = parseWorkshopPassword(value)
    if (ok && workshopId) {
      unlockWorkshop(workshopId)
      onUnlock()
    } else {
      setError(true)
    }
  }

  return (
    <div className="animate-fade-up mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl flex-col items-center justify-center px-6 text-center md:px-10">
      <div className="relative mb-7 animate-float">
        <div className="absolute inset-0 -z-10 translate-x-3 translate-y-4 rounded-[45%] bg-primary-soft" />
        <div className="flex h-28 w-28 items-center justify-center rounded-[45%] bg-gradient-soft text-5xl">
          🔒
        </div>
      </div>

      <p className="font-handwriting text-2xl text-muted-foreground">工作坊專屬</p>
      <h1 className="mt-1 text-2xl font-extrabold text-foreground md:text-3xl">
        請輸入工作坊密碼
      </h1>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
        這些練習是為線上工作坊設計的限定內容，請輸入帶領者提供的當日密碼後開始。
      </p>

      <form onSubmit={handleSubmit} className="mt-8 w-full max-w-sm">
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(false)
          }}
          placeholder="輸入密碼"
          autoFocus
          className={`w-full rounded-2xl bg-card px-5 py-4 text-center text-base font-bold text-foreground shadow-soft placeholder:font-normal placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 ${
            error ? 'ring-2 ring-red-400' : 'focus:ring-primary/40'
          }`}
        />
        {error && (
          <p className="mt-2 text-sm font-bold text-red-500">
            密碼不正確，請再試一次
          </p>
        )}

        <button
          type="submit"
          disabled={value.trim().length === 0}
          className={`mt-5 flex h-16 w-full items-center justify-center gap-3 rounded-full text-base font-extrabold tracking-[0.2em] transition active:scale-[0.98] ${
            value.trim().length === 0
              ? 'cursor-not-allowed bg-primary-soft text-foreground/40'
              : 'bg-gradient-primary text-primary-foreground shadow-soft'
          }`}
        >
          進入練習
        </button>
      </form>

      <Link
        to="/app/home"
        className="mt-6 text-sm font-bold text-muted-foreground transition hover:text-foreground"
      >
        ← 返回訓練中心
      </Link>
    </div>
  )
}
