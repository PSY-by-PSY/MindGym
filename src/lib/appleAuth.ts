// ─────────────────────────────────────────────────────────────────────────
// 原生 App（Capacitor / iOS）專用的 Sign in with Apple 流程
//
// 為什麼只做原生、不做網頁版？
//   Apple Guideline 4.8 只針對「這次審查的 App 本體」（iOS binary）——網頁版
//   不受 App Store 審查規範管。網頁版要做 Apple 登入需要另外申請 Services ID、
//   設定 return URL、私鑰，走 Supabase 的網頁 OAuth 流程，複雜度高出許多且
//   非這次退件需要的範圍，故刻意不做。詳見 src/routes/login.tsx 的
//   isNativeApp() 判斷——Apple 按鈕只在原生 App 顯示。
//
// 原理：
//   1. 用 @capacitor-community/apple-sign-in 呼叫原生 ASAuthorizationAppleIDProvider，
//      直接跳出系統的 Apple 登入面板（不是瀏覽器、不是 deep link，跟 Google 那套
//      系統瀏覽器 + URL scheme 完全不同），完成後直接在 App 內拿到 identityToken。
//   2. 把 identityToken 交給 supabase.auth.signInWithIdToken() 換成 Supabase session。
//
// 🧑 需要你在 Supabase 後台做一次設定（只此一次）：
//    Authentication → Providers → Apple → 啟用，並在 Client IDs 填入
//    com.psybypsy.app（只做原生登入，不需要 Services ID / return URL / 私鑰）。
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'
import { isNativeApp } from './nativeAuth'

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function randomNonce(len = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// 用系統的 Apple 登入面板完成登入。回傳 true 表示已成功建立 Supabase session。
export async function signInWithAppleNative(): Promise<boolean> {
  if (!isNativeApp()) return false

  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')

  // ⚠️ nonce 方向不可搞反：
  //   - hashedNonce 交給 Apple 的 authorize()，Apple 會把它原封不動放進
  //     identityToken 的 nonce claim 裡。
  //   - rawNonce（沒雜湊過的原始值）交給 supabase.auth.signInWithIdToken()，
  //     Supabase 會自己把 rawNonce 雜湊一次，去比對 identityToken 裡的 nonce claim。
  //   兩者搞反會在真機上跑出「nonce mismatch」這種只有 runtime 才看得到的錯誤，
  //   tsc 或瀏覽器完全測不出來，寫完務必重點覆核這段。
  const rawNonce = randomNonce()
  const hashedNonce = await sha256Hex(rawNonce)

  // clientId / redirectURI 是這個 plugin 的 TS 型別要求填的欄位，但 iOS 原生
  // 實作完全不會讀它們（只有 web / Android fallback 才用得到，這個 App 用不到）。
  // 不要因為看到這兩個欄位就誤以為要去 Apple Developer 設定 Services ID 或
  // return URL——原生流程完全不需要那一套。
  const { response } = await SignInWithApple.authorize({
    clientId: 'com.psybypsy.app',
    redirectURI: 'https://app.psybypsy.com/login',
    scopes: 'email name',
    nonce: hashedNonce,
  })

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: response.identityToken,
    nonce: rawNonce,
  })
  if (error) throw error
  return true
}
