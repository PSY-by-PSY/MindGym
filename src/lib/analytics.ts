// ─────────────────────────────────────────────────────────────────────────
// PostHog 行為分析（Analytics）
//
// 這個檔案把所有「追蹤使用者行為」的程式碼集中在一起，
// 其他頁面只要呼叫 track('事件名稱') 就好，不用碰 PostHog 細節。
//
// 後台查看數據：https://us.posthog.com
// ─────────────────────────────────────────────────────────────────────────
import posthog from 'posthog-js'

// Project token 是「可公開」的 write-only key（PostHog 官方說明：Safe to use in
// public apps）。優先讀環境變數，沒設定時用內建值，確保部署後一定能運作。
const POSTHOG_KEY =
  (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ??
  'phc_yBs8sZpYXx6nMUarke6yRKwnLuKFWgatsL4o6zCTodU8'

// US Cloud 的資料接收網址
const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com'

export const analyticsEnabled = Boolean(POSTHOG_KEY)

/**
 * 所有要追蹤的事件名稱集中在這裡，避免各頁面拼錯字導致數據對不起來。
 * 要新增追蹤項目時，先在這裡加一個名稱，再到對應頁面呼叫 track()。
 */
export type AnalyticsEvent =
  | 'login_completed'                // 完成登入
  | 'login_blocked_in_app_browser'   // 在 App 內建瀏覽器被擋下 Google 登入
  | 'quiz_started'         // 開始心理測驗
  | 'quiz_completed'       // 完成心理測驗
  | 'gratitude_started'    // 開始寫感恩日記
  | 'gratitude_completed'  // 完成感恩日記
  | 'module_opened'        // 點開訓練中心的某個模組

/** App 啟動時呼叫一次，初始化 PostHog。 */
export function initAnalytics() {
  if (!analyticsEnabled) return
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: 'https://us.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false, // 頁面瀏覽改由 router 手動上報（見 main.tsx）
    capture_pageleave: true,
  })
}

/** 記錄一個行為事件。props 是這個事件的額外資訊（例如測驗分數）。 */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  if (!analyticsEnabled) return
  posthog.capture(event, props)
}

/** 使用者登入後呼叫，把之後所有行為對應到這個人。 */
export function identifyUser(id: string, props?: Record<string, unknown>) {
  if (!analyticsEnabled) return
  posthog.identify(id, props)
}

/** 使用者登出後呼叫，斷開身分綁定。 */
export function resetUser() {
  if (!analyticsEnabled) return
  posthog.reset()
}

/** 上報一次頁面瀏覽（單頁式 App 換頁時手動呼叫）。 */
export function trackPageview(path: string) {
  if (!analyticsEnabled) return
  posthog.capture('$pageview', { $current_url: window.location.origin + path })
}
