// ─────────────────────────────────────────────────────────────────────────
// 原生 App（Capacitor / iOS）專用的 Google 登入流程
//
// 為什麼需要這個檔案？
//   Google 基於安全考量，會直接封鎖「嵌入式 WebView」內的 OAuth 登入
//   （跳出 403：disallowed_useragent）。Capacitor 的 WKWebView 正是嵌入式
//   WebView，所以網頁版那套「直接在當前頁面導去 Google」的做法在 App 內會失敗。
//
// 解法（業界標準做法）：
//   1. 用「系統瀏覽器」SFSafariViewController（@capacitor/browser）開登入頁。
//      系統瀏覽器不算嵌入式 WebView，Google 允許登入。
//   2. 登入完成後，Supabase 會把使用者導回自訂 URL scheme
//      （com.mindgym.app://login-callback，已在 Info.plist 註冊）。
//   3. App 透過 @capacitor/app 的 appUrlOpen 事件接住這個 deep link，
//      把 session 寫回 WebView，再關掉系統瀏覽器。onAuthStateChange 會自動導向。
//
// ⚠️ 純網頁（一般瀏覽器）完全不走這條路 —— 全部以 isNativeApp() 把關。
//    因此這份檔案 deploy 到 Vercel 後「不影響網頁版任何行為」。
//
// 🧑 需要你在 Supabase 後台做一次設定（只此一次）：
//    Authentication → URL Configuration → Redirect URLs 新增：
//      com.mindgym.app://login-callback
//    （Google Cloud Console 不需改，OAuth client 仍是 Supabase。）
// ─────────────────────────────────────────────────────────────────────────

import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

// ⚠️ 這個 OAuth deep-link scheme 「故意」保持 com.mindgym.app（與 Bundle ID
//    com.psybypsy.app 不同）：scheme 只是一個註冊在 Info.plist 的字串、與 Bundle ID
//    無關，且 Supabase Redirect URLs 已設定這組。改了反而要動 Supabase、會弄壞登入。
export const NATIVE_OAUTH_REDIRECT = 'com.mindgym.app://login-callback'

// 是否運行在原生 App（iOS/Android）殼裡。網頁瀏覽器回傳 false。
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

// 用系統瀏覽器開 Google 登入。回傳 true 表示已由原生流程接手。
export async function signInWithGoogleNative(): Promise<boolean> {
  if (!isNativeApp()) return false
  const { Browser } = await import('@capacitor/browser')
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: NATIVE_OAUTH_REDIRECT,
      // 不要在當前 WebView 直接導頁；改成拿到網址後用系統瀏覽器開。
      skipBrowserRedirect: true,
    },
  })
  if (error || !data?.url) {
    throw error ?? new Error('無法取得 Google 登入網址')
  }
  await Browser.open({ url: data.url })
  return true
}

let listenerReady = false

// App 啟動時呼叫一次：監聽登入完成後導回 App 的 deep link，並建立 session。
export async function setupNativeAuthListener(): Promise<void> {
  if (!isNativeApp() || listenerReady) return
  listenerReady = true

  const { App } = await import('@capacitor/app')
  const { Browser } = await import('@capacitor/browser')

  await App.addListener('appUrlOpen', async ({ url }) => {
    if (!url || !url.includes('login-callback')) return
    try {
      const parsed = new URL(url)
      const code = parsed.searchParams.get('code')
      if (code) {
        // PKCE flow：用同一個 WebView localStorage 內的 code_verifier 換 session
        await supabase.auth.exchangeCodeForSession(code)
      } else {
        // implicit flow：token 放在 URL fragment
        const frag = new URLSearchParams(parsed.hash.replace(/^#/, ''))
        const access_token = frag.get('access_token')
        const refresh_token = frag.get('refresh_token')
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token })
        }
      }
    } catch (e) {
      console.error('[nativeAuth] 登入回呼處理失敗', e)
    } finally {
      // 關掉系統瀏覽器回到 App；onAuthStateChange 會接手導向 /app/home。
      try {
        await Browser.close()
      } catch {
        /* 某些情況系統瀏覽器已自動關閉，忽略 */
      }
    }
  })
}
