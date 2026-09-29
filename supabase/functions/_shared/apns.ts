// ════════════════════════════════════════════════════════════════════════
// APNs 單一 token 發送（push-notify、broadcast-notify 共用）
//
// 為什麼要有「換環境重試」：
//   APNs 分 production（api.push.apple.com）與 sandbox（api.sandbox.push.apple.com）
//   兩個環境，token 只在「產生它的那個環境」有效。Xcode 直接跑到實機的 Debug build
//   拿到的是 sandbox token；TestFlight／App Store 拿到的是 production token。
//   token 送錯環境，APNs 回 400 BadDeviceToken——但 token 本身沒壞。
//
//   以前把 BadDeviceToken 當成「token 失效」直接刪掉，結果開發機的 token 一推就被刪，
//   症狀是「device_tokens 明明有寫進去，過一下又不見、永遠收不到」。
//
// 規則：
//   - 2xx                        → ok
//   - 410 / Unregistered         → gone（App 被刪或 token 過期，可以刪）
//   - 400 BadDeviceToken         → 換另一個環境再送一次；另一個環境成功 → ok，
//                                  兩個環境都 BadDeviceToken → gone（真的是壞 token）
//   - 其他（403 金鑰錯、429…）   → error，不刪 token（設定問題不該清掉使用者資料）
// ════════════════════════════════════════════════════════════════════════

export const APNS_PRODUCTION_HOST = 'api.push.apple.com'
export const APNS_SANDBOX_HOST = 'api.sandbox.push.apple.com'

export type ApnsResult = 'ok' | 'gone' | 'error'

export interface ApnsMessage {
  title: string
  body: string
  route?: string
}

type Fetch = typeof fetch

type Attempt = { status: number; reason: string }

export function otherHost(host: string): string {
  return host === APNS_SANDBOX_HOST ? APNS_PRODUCTION_HOST : APNS_SANDBOX_HOST
}

async function post(
  fetchFn: Fetch,
  host: string,
  token: string,
  providerJwt: string,
  bundleId: string,
  msg: ApnsMessage,
): Promise<Attempt> {
  const res = await fetchFn(`https://${host}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${providerJwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    },
    // route 放在 aps 外層（跟 aps 平行的自訂欄位）：App 端的
    // pushNotificationActionPerformed 監聽器會讀 notification.data.route，
    // 點擊推播時直接導到那個頁面（見 src/lib/pushNotifications.ts）。
    body: JSON.stringify({
      aps: { alert: { title: msg.title, body: msg.body }, sound: 'default' },
      ...(msg.route ? { route: msg.route } : {}),
    }),
  })
  if (res.ok) return { status: res.status, reason: '' }
  const reason = await res.text().catch(() => '')
  return { status: res.status, reason }
}

const isGone = (a: Attempt) => a.status === 410 || /Unregistered/.test(a.reason)
const isBadToken = (a: Attempt) => /BadDeviceToken/.test(a.reason)

export async function sendApns(
  token: string,
  providerJwt: string,
  bundleId: string,
  primaryHost: string,
  msg: ApnsMessage,
  fetchFn: Fetch = fetch,
): Promise<ApnsResult> {
  const first = await post(fetchFn, primaryHost, token, providerJwt, bundleId, msg)
  if (first.status >= 200 && first.status < 300) return 'ok'
  if (isGone(first)) return 'gone'
  if (!isBadToken(first)) {
    console.error('[apns]', primaryHost, first.status, first.reason)
    return 'error'
  }

  const fallbackHost = otherHost(primaryHost)
  const second = await post(fetchFn, fallbackHost, token, providerJwt, bundleId, msg)
  if (second.status >= 200 && second.status < 300) return 'ok'
  if (isGone(second) || isBadToken(second)) return 'gone'
  console.error('[apns]', fallbackHost, second.status, second.reason)
  return 'error'
}
