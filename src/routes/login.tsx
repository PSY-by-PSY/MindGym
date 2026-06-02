import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import coachWelcome from '../assets/brain-lifter.png'

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    if (context.session) {
      throw redirect({ to: '/app/home' })
    }
  },
  component: LoginPage,
})

// 'idle' = 還沒送驗證碼，'code' = 已送出、等待輸入驗證碼
type EmailStep = 'idle' | 'code'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<EmailStep>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/app/home`,
      },
    })
  }

  const handleSendCode = async () => {
    const trimmed = email.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    })
    setLoading(false)
    if (error) {
      setError('寄送失敗，請確認 email 後再試一次。')
      return
    }
    setStep('code')
  }

  const handleVerifyCode = async () => {
    const trimmedCode = code.trim()
    if (!trimmedCode) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: trimmedCode,
      type: 'email',
    })
    setLoading(false)
    if (error) {
      setError('驗證碼錯誤或已過期，請重新輸入。')
      return
    }
    // 成功後 onAuthStateChange 會更新 session，beforeLoad 自動導向 /app/home
  }

  return (
    <div className="relative flex h-screen flex-col items-center justify-end overflow-hidden px-6 pb-[360px]">
      {/* 教練手寫招呼 */}
      <div className="animate-fade-up mb-3 w-full max-w-sm">
        <div className="relative rounded-3xl bg-card px-6 py-5 shadow-soft">
          <p className="font-handwriting text-2xl leading-snug text-foreground">
            嗨，很高興認識你！歡迎來到 MindGym 心理健身房。
          </p>
          <SpeechTail />
        </div>
      </div>
      <p className="animate-fade-up mb-8 max-w-xs text-center font-handwriting text-xl leading-snug text-muted-foreground">
        照顧心理，就像照顧身體一樣自然，先從登入開始吧。
      </p>

      {/* 教練插畫 + 背後色塊 */}
      <div className="relative animate-float">
        <div className="absolute inset-0 -z-10 translate-x-5 translate-y-7 rounded-[45%] bg-primary-soft" />
        <div className="absolute inset-0 -z-10 -translate-x-4 translate-y-3 rounded-[45%] bg-primary-glow opacity-50" />
        <img src={coachWelcome} alt="MindGym 教練" className="relative h-52 w-auto drop-shadow-sm" />
      </div>

      {/* 底部固定 CTA */}
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent px-6 pb-10 pt-10">
        <div className="mx-auto w-full max-w-sm space-y-3">
          {step === 'idle' ? (
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="輸入 email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 w-full rounded-full bg-card px-6 text-center text-base font-semibold text-foreground shadow-soft outline-none placeholder:text-muted-foreground/60"
            />
          ) : (
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="輸入 6 位數驗證碼"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="h-14 w-full rounded-full bg-card px-6 text-center text-xl font-bold tracking-[0.4em] text-foreground shadow-soft outline-none placeholder:text-base placeholder:font-semibold placeholder:tracking-normal placeholder:text-muted-foreground/60"
            />
          )}

          {error && (
            <p className="text-center text-xs font-semibold text-red-500">{error}</p>
          )}

          {step === 'idle' ? (
            <button
              onClick={handleSendCode}
              disabled={loading || !email.trim()}
              className="flex h-16 w-full items-center justify-center rounded-full bg-primary text-base font-extrabold tracking-wide text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? '寄送中…' : '用 Email 登入'}
            </button>
          ) : (
            <>
              <button
                onClick={handleVerifyCode}
                disabled={loading || code.trim().length < 6}
                className="flex h-16 w-full items-center justify-center rounded-full bg-primary text-base font-extrabold tracking-wide text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? '驗證中…' : '確認驗證碼'}
              </button>
              <button
                onClick={() => {
                  setStep('idle')
                  setCode('')
                  setError(null)
                }}
                className="w-full text-center text-xs font-semibold text-muted-foreground underline"
              >
                重新輸入 email
              </button>
            </>
          )}

          {/* 分隔線 */}
          {step === 'idle' && (
            <>
              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-muted-foreground/20" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">或</span>
                <span className="h-px flex-1 bg-muted-foreground/20" />
              </div>
              <button
                onClick={handleGoogleLogin}
                className="flex h-16 w-full items-center justify-center gap-3 rounded-full bg-card text-base font-extrabold tracking-wide text-foreground shadow-soft transition active:scale-[0.98]"
              >
                <GoogleIcon />
                用 Google 登入
              </button>
            </>
          )}

          <p className="text-center text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
            MindGym · Train your mind
          </p>
        </div>
      </div>
    </div>
  )
}

function SpeechTail() {
  return (
    <svg
      className="absolute -bottom-3 left-10 h-4 w-8 text-card"
      viewBox="0 0 32 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M0 0c6 0 10 4 14 9 3 4 6 7 12 7H0z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}
