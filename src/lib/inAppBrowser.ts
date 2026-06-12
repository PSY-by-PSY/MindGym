// ─────────────────────────────────────────────────────────────────────────
// In-App Browser 偵測（解決 Google 登入「disallowed_useragent」問題）
//
// 為什麼需要這個檔案？
//   當使用者從 LINE、Facebook、Instagram… 等 App 內建的瀏覽器（WebView）
//   打開我們的網站，再按「用 Google 登入」時，Google 會基於安全考量直接
//   擋下，跳出「已封鎖存取權… 403：disallowed_useragent」的錯誤頁。
//   這是 Google 的政策，網站端無法繞過，只能「引導使用者改用外部瀏覽器」。
//
// 解法：
//   1. LINE 的 WebView 支援在網址後面加 `?openExternalBrowser=1`，
//      就會自動用手機預設瀏覽器（Safari／Chrome）重新開啟 → 一鍵跳出。
//   2. 其他 App（FB/IG…）沒有這種參數，只能提示使用者手動點右上角
//      「⋯」選單 →「在瀏覽器開啟」。
// ─────────────────────────────────────────────────────────────────────────

export type InAppBrowser =
  | 'line'
  | 'facebook'
  | 'instagram'
  | 'messenger'
  | 'other'
  | null

// 從 User-Agent 判斷目前是不是在某個 App 的內建瀏覽器裡。
// 回傳 null 代表是「正常的外部瀏覽器」（Safari / Chrome…），可以正常登入。
export function detectInAppBrowser(): InAppBrowser {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent || ''

  // LINE：UA 會包含「Line/」字樣
  if (/\bLine\//i.test(ua)) return 'line'

  // Facebook Messenger（用 \b 避免誤判微信的 MicroMessenger）
  // 先於 Facebook 判斷，因為 Messenger 的 UA 也含 FBAN。
  if (/\bMessenger/i.test(ua)) return 'messenger'

  // Facebook App（含內嵌瀏覽器）：FBAN / FBAV / FB_IAB
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook'

  // Instagram
  if (/Instagram/i.test(ua)) return 'instagram'

  // 其他常見的 App WebView（TikTok / 微信 / Twitter / KakaoTalk…）
  if (/(MicroMessenger|WeChat|Twitter|KAKAOTALK|TikTok|musical_ly|Snapchat)/i.test(ua)) {
    return 'other'
  }

  return null
}

// 是不是在「會擋掉 Google 登入」的 App 內建瀏覽器裡？
export function isInAppBrowser(): boolean {
  return detectInAppBrowser() !== null
}

// LINE 專用：用 `openExternalBrowser=1` 強制跳到手機預設外部瀏覽器，
// 在外部瀏覽器裡 Google 登入就能正常運作。
export function openInExternalBrowser(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set('openExternalBrowser', '1')
  window.location.href = url.toString()
}

// 把目前可見的網址整理成方便使用者「複製貼到瀏覽器」的純淨網址
// （移除 openExternalBrowser 這種內部參數）。
export function getShareableUrl(): string {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  url.searchParams.delete('openExternalBrowser')
  return url.toString()
}
