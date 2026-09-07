import { useState } from 'react'
import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import type { AuthError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import {
  detectInAppBrowser,
  openInExternalBrowser,
  getShareableUrl,
  type InAppBrowser,
} from '../lib/inAppBrowser'
import { isNativeApp, signInWithGoogleNative } from '../lib/nativeAuth'
import { signInWithAppleNative } from '../lib/appleAuth'
import coachWelcome from '../assets/ui/gratitude-mascot.png'
import { useLanguage } from '../lib/i18n/context'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    if (context.session) {
      throw redirect({ to: '/app/home' })
    }
  },
  component: LoginPage,
})

// 登入方式：主推 Google／Apple，email 密碼登入收在次要入口（2026-08-29）。
//
// 為什麼拿掉 email「註冊」：Supabase 內建寄信服務只寄給專案 team 成員、且限
// 2 封/小時（官方明言僅供測試），所以驗證信對站外使用者根本寄不出去——這條路
// 從上線以來從來沒有為真實使用者運作過，測試者看到的是「驗證信寄送失敗」。
// 實際分佈：1,088 個帳號裡 Google 1,065、Apple 21，純 email／密碼只有 2 個
// （團隊自己開的，0 篇日記 0 次測驗）。要讓它能用得養一整條 email 管道
// （SMTP、網域驗證、退信、外加一個目前不存在的重設密碼頁），換 0.2% 的使用者。
//
// 為什麼「登入」要留著：App Store 送審要在 App Review Information 附 demo 帳號的
// email 與密碼（見 docs/plans/appstore_rejection_20260816_response.md）。審查員
// 雖然也能用 Sign in with Apple 自己註冊，但沒有帳密可給會多一輪來回。
// 收在「用 email 登入」這個次要入口：一般使用者看到的是乾淨的兩顆 OAuth 按鈕，
// 審查員照 Notes 的指示點一下就找得到。
//
// 忘記密碼一併拿掉：resetPasswordForEmail 寄得出去也沒用，全站沒有任何
// updateUser 的地方可以輸入新密碼。demo 帳號的密碼由管理者在 Supabase 後台重設。

// 使用者主動取消登入（Apple/Google 面板按「取消」）不是錯誤，不該跳紅字。
// Apple 的 ASAuthorizationError.canceled 是 1001；不同 plugin 版本包裝方式不一，
// 所以 code 與訊息都比對一次。
function isUserCancelled(err: unknown): boolean {
  const code = (err as { code?: string | number } | null)?.code
  if (code === 1001 || code === '1001') return true
  const message = (err as { message?: string } | null)?.message ?? ''
  return /cancel/i.test(message)
}

// 驗證信連結要導回的網址。App 內用線上版網域，讓在手機信箱點連結也開得起來。
function confirmRedirectTo() {
  return `${window.location.origin}/app/home`
}

// 註冊失敗的原因差很多（信箱已註冊 vs 驗證信根本寄不出去），
// 全部收斂成「請稍後再試」的話使用者與我們都查不出是哪一種，這裡把常見的分開講。
function signUpErrorMessage(error: AuthError, t: (text: string) => string) {
  const message = error.message.toLowerCase()
  if (error.code === 'user_already_exists' || message.includes('already registered')) {
    return t('這個 email 已經註冊過了，請直接登入。')
  }
  if (error.status === 429 || message.includes('rate limit') || message.includes('for security purposes')) {
    return t('驗證信寄送已達次數上限，請稍後再試，或改用 Google 登入。')
  }
  if (message.includes('sending confirmation email') || message.includes('sending email')) {
    return t('驗證信寄送失敗（信件服務異常），請改用 Google 登入或聯絡我們。')
  }
  return t('註冊失敗，請確認 email 格式或稍後再試。')
}

function LoginPage() {
  const { t } = useLanguage()
  // email 密碼登入（僅供既有帳號與 App Store 審查用的 demo 帳號；不開放註冊）
  const [showEmailLogin, setShowEmailLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 從 LINE / FB / IG… App 內建瀏覽器打開時，Google 會擋下登入，
  // 這裡記錄是哪一種 App，好顯示對應的引導畫面（null = 不顯示）。
  const [inAppNotice, setInAppNotice] = useState<InAppBrowser>(null)
  const [copied, setCopied] = useState(false)
  // App Store 審查指南 1.2：使用者必須在「註冊或登入前」同意條款。
  // 未勾選時所有登入方式（帳密／Apple／Google）一律擋下，不是只擋其中一種。
  const [agreed, setAgreed] = useState(false)
  const [showAgreeHint, setShowAgreeHint] = useState(false)

  /** 未同意條款就擋下，並提示使用者。回傳 true 代表可以繼續。 */
  const requireAgreement = (): boolean => {
    if (agreed) return true
    setShowAgreeHint(true)
    return false
  }

  const handleGoogleLogin = async () => {
    if (!requireAgreement()) return
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
        if (!isUserCancelled(err)) {
          setError(t('Google 登入沒有完成。你可以再試一次，或改用下方的 email 登入。'))
          setShowEmailLogin(true)
        }
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

  // Sign in with Apple 只在原生 iOS App 裡顯示（見 src/lib/appleAuth.ts），
  // 網頁版沒有這顆按鈕，故這裡不用像 handleGoogleLogin 一樣處理網頁版分支。
  const handleAppleLogin = async () => {
    if (!requireAgreement()) return
    setError(null)
    try {
      track('login_started', { method: 'apple', platform: 'native' })
      await signInWithAppleNative()
      track('login_completed', { method: 'apple' })
    } catch (err) {
      track('login_error', { method: 'apple', platform: 'native' })
      console.error('[login] native apple login failed', err)
      // 使用者自己按取消不算錯誤，不要嚇他。
      if (isUserCancelled(err)) return
      // ⚠️ 這裡「一定」要給使用者看得到的訊息並打開 email 登入。
      //    2026-09-05 被 Apple 以 2.1(a) 退件，原因是 Sign in with Apple 在
      //    審查機上失敗後畫面毫無反應，審查員直接進不了 App（"We were unable
      //    to access the app"）。失敗本身可能是 Apple 端狀況（Apple ID 未開
      //    兩階段驗證、iCloud 未登入、Apple 伺服器暫時性錯誤），我們控制不了；
      //    但「失敗後沒有出口」是我們的錯，這才是被判定為 bug 的部分。
      setError(t('Apple 登入沒有完成。你可以再試一次，或改用下方的 Google／email 登入。'))
      setShowEmailLogin(true)
    }
  }

  const handleEmailLogin = async () => {
    if (!requireAgreement()) return
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) return
    setLoading(true)
    setError(null)
    track('login_started', { method: 'password', mode: 'login' })
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    })
    setLoading(false)
    if (signInError) {
      track('login_error', { method: 'password', mode: 'login' })
      setError(t('Email 或密碼錯誤，請再試一次。'))
      return
    }
    track('login_completed', { method: 'password' })
    // 成功後 onAuthStateChange 會更新 session，beforeLoad 自動導向 /app/home
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
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-end overflow-x-hidden px-6 pt-12">
      {/* 外層 frame-width：把語言鈕收進手機外框的欄位（詳見 index.css 的
          .frame-width 說明）。App 版這層就是整個螢幕寬，位置沒有變。 */}
      <div className="frame-width pointer-events-none fixed inset-x-0 top-0 z-20">
        <LanguageSwitcherCompact className="pointer-events-auto absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)]" />
      </div>
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
            {t('嗨，很高興認識你！歡迎來到 PSY by PSY 心理健身房。')}
          </p>
          <SpeechTail />
        </div>
      </div>
      <p className="animate-fade-up mb-8 max-w-xs text-center font-handwriting text-xl leading-snug text-muted-foreground">
        {t('照顧心理，就像照顧身體一樣自然，先從登入開始吧。')}
      </p>

      {/* 教練插畫 + 背後色塊 */}
      <div className="relative animate-float">
        <div className="absolute inset-0 -z-10 translate-x-5 translate-y-7 rounded-[45%] bg-primary-soft" />
        <div className="absolute inset-0 -z-10 -translate-x-4 translate-y-3 rounded-[45%] bg-primary-glow opacity-50" />
        <img src={coachWelcome} alt={t('PSY by PSY 教練')} className="relative h-52 w-auto drop-shadow-sm" />
      </div>

      {/* 底部 CTA：走正常排版流，不用 fixed —— 否則面板高度一變（例如多一顆
          Apple 按鈕）就得同步改上面的預留 padding，改漏就會蓋住插圖與文案。 */}
      <div className="w-full pb-10 pt-8">
        <div className="mx-auto w-full max-w-sm space-y-3">
          {/* 三種登入方式共用的錯誤區。刻意放在按鈕「上方」且不限於 email 面板——
              原本只在 email 面板內渲染，導致 OAuth 失敗時畫面完全沒有回饋。 */}
          {error && (
            <p role="alert" className="text-center text-sm font-semibold text-red-500">
              {error}
            </p>
          )}

          {isNativeApp() && (
            <button
              onClick={handleAppleLogin}
              className="flex h-16 w-full items-center justify-center gap-3 rounded-full bg-black text-base font-extrabold tracking-wide text-white shadow-soft transition active:scale-[0.98]"
            >
              <AppleIcon />
              {t('用 Apple 登入')}
            </button>
          )}

          <button
            onClick={handleGoogleLogin}
            className="flex h-16 w-full items-center justify-center gap-3 rounded-full bg-card text-base font-extrabold tracking-wide text-foreground shadow-soft transition active:scale-[0.98]"
          >
            <GoogleIcon />
            {t('用 Google 登入')}
          </button>

          {/* email 密碼登入：收在次要入口。給既有帳號與 App Store 審查的 demo 帳號用，
              不開放註冊（原因見檔案開頭）。 */}
          {showEmailLogin ? (
            <div className="space-y-3 pt-1">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t('輸入 email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-14 w-full rounded-full bg-card px-6 text-center text-base font-semibold text-foreground shadow-soft outline-none placeholder:text-muted-foreground/60"
              />
              <input
                type="password"
                autoComplete="current-password"
                placeholder={t('輸入密碼')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-14 w-full rounded-full bg-card px-6 text-center text-base font-semibold text-foreground shadow-soft outline-none placeholder:text-muted-foreground/60"
              />
              <button
                onClick={handleEmailLogin}
                disabled={loading || !email.trim() || !password}
                className="flex h-14 w-full items-center justify-center rounded-full bg-primary text-base font-extrabold tracking-wide text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? t('登入中…') : t('登入')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowEmailLogin(true)}
              className="block w-full pt-1 text-center text-xs font-semibold text-muted-foreground underline"
            >
              {t('用 email 登入')}
            </button>
          )}

          {/* 條款同意（App Store 審查指南 1.2）。
              放在所有登入按鈕「下方」但仍在同一個面板內，讓審查錄影一次拍到
              「同意項 + 登入按鈕」；未勾選時按任何登入方式都會被 requireAgreement() 擋下。 */}
          <label className="flex cursor-pointer items-start gap-2.5 px-1 pt-1">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked)
                if (e.target.checked) setShowAgreeHint(false)
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--primary)]"
            />
            <span className="text-[11px] leading-relaxed text-muted-foreground">
              {t('我已閱讀並同意')}
              <Link to="/terms" className="mx-1 font-bold text-foreground underline">
                {t('使用者條款')}
              </Link>
              {t('與')}
              <Link to="/privacy" className="mx-1 font-bold text-foreground underline">
                {t('隱私政策')}
              </Link>
              {t('，並瞭解本服務對冒犯內容與濫用行為採取零容忍政策。')}
            </span>
          </label>
          {showAgreeHint && !agreed && (
            <p className="px-1 text-[11px] font-semibold text-red-500">
              {t('請先勾選同意使用者條款，才能繼續。')}
            </p>
          )}

          {/* 支援頁入口。刻意「不」放進上面的同意句裡——那句是 Apple 指南 1.2
              要看的 EULA 同意文字，混進其他連結會模糊焦點。 */}
          <p className="text-center text-[11px] text-muted-foreground">
            <Link to="/support" className="font-bold underline">
              {t('需要協助？聯絡我們')}
            </Link>
          </p>

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
  const { t } = useLanguage()
  const isLine = browser === 'line'

  // 各 App「在外部瀏覽器開啟」的位置提示
  const manualHint =
    browser === 'facebook' || browser === 'messenger'
      ? t('請點右下角／右上角的「⋯」選單，選擇「用外部瀏覽器開啟」。')
      : browser === 'instagram'
        ? t('請點右上角的「⋯」選單，選擇「在瀏覽器中開啟」。')
        : t('請點畫面上的選單按鈕（通常是「⋯」），選擇「在瀏覽器開啟」。')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="w-full max-w-sm space-y-4 rounded-3xl bg-card p-6 shadow-soft">
        <h2 className="text-lg font-extrabold text-foreground">
          {t('請用外部瀏覽器開啟')}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t('為讓使用者有更佳心理健身體驗，完整保存您的心理健身紀錄，本App僅限使用外部瀏覽器開啟。')}
          {isLine
            ? t('請按下方按鈕，用手機的瀏覽器重新開啟。')
            : manualHint}
        </p>

        {isLine && (
          <button
            onClick={onOpenExternal}
            className="flex h-14 w-full items-center justify-center rounded-full bg-primary text-base font-extrabold tracking-wide text-primary-foreground shadow-soft transition active:scale-[0.98]"
          >
            {t('用外部瀏覽器開啟')}
          </button>
        )}

        <button
          onClick={onCopy}
          className="flex h-12 w-full items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground transition active:scale-[0.98]"
        >
          {copied ? t('已複製網址 ✓') : t('複製網址，自行貼到瀏覽器')}
        </button>

        <button
          onClick={onClose}
          className="w-full text-center text-xs font-semibold text-muted-foreground underline"
        >
          {t('關閉')}
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

// Apple 官方標誌，依 Human Interface Guidelines 要求 Sign in with Apple 按鈕須用此圖示。
function AppleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.462 2.11-1.212 2.86-.82.82-2.06 1.45-3.09 1.36-.14-1.1.44-2.24 1.19-2.96.83-.82 2.24-1.4 3.11-1.26zM20.35 17.4c-.55 1.25-.81 1.81-1.51 2.91-.98 1.53-2.36 3.44-4.07 3.46-1.51.02-1.9-.98-3.94-.97-2.04.01-2.47.99-3.98.97-1.71-.02-3.02-1.74-4-3.27-2.74-4.22-3.03-9.17-1.34-11.81 1.2-1.87 3.09-2.96 4.87-2.96 1.81 0 2.95 1 4.45 1 1.45 0 2.34-1 4.44-1 1.58 0 3.26.86 4.45 2.35-3.91 2.14-3.28 7.73.63 9.32z" />
    </svg>
  )
}
