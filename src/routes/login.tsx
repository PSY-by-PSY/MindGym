import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import {
  detectInAppBrowser,
  openInExternalBrowser,
  getShareableUrl,
  type InAppBrowser,
} from '../lib/inAppBrowser'
import { isNativeApp, signInWithGoogleNative } from '../lib/nativeAuth'
import coachWelcome from '../assets/ui/gratitude-mascot.png'

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    if (context.session) {
      throw redirect({ to: '/app/home' })
    }
  },
  component: LoginPage,
})

// 暫時隱藏 Email 登入，待團隊討論後決定是否恢復
const SHOW_EMAIL_LOGIN = false

// 'idle' = 還沒送驗證碼，'code' = 已送出、等待輸入驗證碼
type EmailStep = 'idle' | 'code'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<EmailStep>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 從 LINE / FB / IG… App 內建瀏覽器打開時，Google 會擋下登入，
  // 這裡記錄是哪一種 App，好顯示對應的引導畫面（null = 不顯示）。
  const [inAppNotice, setInAppNotice] = useState<InAppBrowser>(null)
  const [copied, setCopied] = useState(false)

  const handleGoogleLogin = async () => {
    // 原生 App（iOS）：Google 會擋嵌入式 WebView，改用系統瀏覽器 + deep link。
    // 詳見 src/lib/nativeAuth.ts。網頁版不走這條路（isNativeApp() 為 false）。
    if (isNativeApp()) {
      try {
        track('login_started', { method: 'google', platform: 'native' })
        await signInWithGoogleNative()
      } catch (err) {
        track('login_error', { method: 'google', platform: 'native' })
        console.error('[login] native google login failed', err)
        setInAppNotice(null)
      }
      return
    }

    // 在 App 內建瀏覽器（LINE/FB/IG…）裡，Google 會直接擋下 OAuth，
    // 跳出「disallowed_useragent」錯誤。先攔截下來引導使用者改用外部瀏覽器。
    const browser = detectInAppBrowser()
    if (browser) {
      track('login_blocked_in_app_browser', { browser })
      setInAppNotice(browser)
      // LINE 支援一鍵跳出到外部瀏覽器
      if (browser === 'line') {
        openInExternalBrowser()
      }
      return
    }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/app/home`,
      },
    })
  }

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(getShareableUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
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
    track('login_completed', { method: 'email' })
    // 成功後 onAuthStateChange 會更新 session，beforeLoad 自動導向 /app/home
  }

  return (
    <div className="relative flex h-screen flex-col items-center justify-end overflow-hidden px-6 pb-[200px]">
      {inAppNotice && (
        <InAppBrowserNotice
          browser={inAppNotice}
          copied={copied}
          onCopy={handleCopyUrl}
          onOpenExternal={openInExternalBrowser}
          onClose={() => setInAppNotice(null)}
        />
      )}
      {/* 教練手寫招呼 */}
      <div className="animate-fade-up mb-3 w-full max-w-sm">
        <div className="relative rounded-3xl bg-card px-6 py-5 shadow-soft">
          <p className="font-handwriting text-2xl leading-snug text-foreground">
            嗨，很高興認識你！歡迎來到 PSY by PSY 心理健身房。
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
        <img src={coachWelcome} alt="PSY by PSY 教練" className="relative h-52 w-auto drop-shadow-sm" />
      </div>

      {/* 底部固定 CTA */}
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent px-6 pb-10 pt-10">
        <div className="mx-auto w-full max-w-sm space-y-3">
          {SHOW_EMAIL_LOGIN && step === 'idle' && (
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="輸入 email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 w-full rounded-full bg-card px-6 text-center text-base font-semibold text-foreground shadow-soft outline-none placeholder:text-muted-foreground/60"
            />
          )}
          {SHOW_EMAIL_LOGIN && step === 'code' && (
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

          {SHOW_EMAIL_LOGIN && error && (
            <p className="text-center text-xs font-semibold text-red-500">{error}</p>
          )}

          {SHOW_EMAIL_LOGIN && step === 'idle' && (
            <button
              onClick={handleSendCode}
              disabled={loading || !email.trim()}
              className="flex h-16 w-full items-center justify-center rounded-full bg-primary text-base font-extrabold tracking-wide text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? '寄送中…' : '用 Email 登入'}
            </button>
          )}
          {SHOW_EMAIL_LOGIN && step === 'code' && (
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

          {/* 分隔線只在 email 登入顯示時才需要 */}
          {SHOW_EMAIL_LOGIN && step === 'idle' && (
            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-muted-foreground/20" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">或</span>
              <span className="h-px flex-1 bg-muted-foreground/20" />
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            className="flex h-16 w-full items-center justify-center gap-3 rounded-full bg-card text-base font-extrabold tracking-wide text-foreground shadow-soft transition active:scale-[0.98]"
          >
            <GoogleIcon />
            用 Google 登入
          </button>

          <p className="text-center text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
            PSY by PSY · Train your mind
          </p>
        </div>
      </div>
    </div>
  )
}

function InAppBrowserNotice({
  browser,
  copied,
  onCopy,
  onOpenExternal,
  onClose,
}: {
  browser: InAppBrowser
  copied: boolean
  onCopy: () => void
  onOpenExternal: () => void
  onClose: () => void
}) {
  const isLine = browser === 'line'

  // 各 App「在外部瀏覽器開啟」的位置提示
  const manualHint =
    browser === 'facebook' || browser === 'messenger'
      ? '請點右下角／右上角的「⋯」選單，選擇「用外部瀏覽器開啟」。'
      : browser === 'instagram'
        ? '請點右上角的「⋯」選單，選擇「在瀏覽器中開啟」。'
        : '請點畫面上的選單按鈕（通常是「⋯」），選擇「在瀏覽器開啟」。'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="w-full max-w-sm space-y-4 rounded-3xl bg-card p-6 shadow-soft">
        <h2 className="text-lg font-extrabold text-foreground">
          請用外部瀏覽器開啟
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          為讓使用者有更佳心理健身體驗，完整保存您的心理健身紀錄，本App僅限使用外部瀏覽器開啟。
          {isLine
            ? '請按下方按鈕，用手機的瀏覽器重新開啟。'
            : manualHint}
        </p>

        {isLine && (
          <button
            onClick={onOpenExternal}
            className="flex h-14 w-full items-center justify-center rounded-full bg-primary text-base font-extrabold tracking-wide text-primary-foreground shadow-soft transition active:scale-[0.98]"
          >
            用外部瀏覽器開啟
          </button>
        )}

        <button
          onClick={onCopy}
          className="flex h-12 w-full items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground transition active:scale-[0.98]"
        >
          {copied ? '已複製網址 ✓' : '複製網址，自行貼到瀏覽器'}
        </button>

        <button
          onClick={onClose}
          className="w-full text-center text-xs font-semibold text-muted-foreground underline"
        >
          關閉
        </button>
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
