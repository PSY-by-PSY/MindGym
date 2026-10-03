// ════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: broadcast-notify
//
// 對「所有」已註冊裝置發同一則 APNs 推播——用於新功能上架這類公告，
// 跟 push-notify（單一使用者、由按讚/留言觸發）是兩支獨立函式，
// 但共用同一組已經設定好的 APNs secrets（不需要重新設定）。
//
// 呼叫方式：POST，帶 header `x-webhook-secret`（跟 push-notify 同一組 WEBHOOK_SECRET），
// body 是 { "title": "...", "body": "..." }。設計上由 pg_cron 排程呼叫（見
// supabase/broadcast_notify.sql），也可以在 Supabase Dashboard 手動測試呼叫。
//
// 部署：supabase functions deploy broadcast-notify --no-verify-jwt
//   （沿用 push-notify 已設定好的 secrets，不需要重新 supabase secrets set）
// ════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { type ApnsResult, sendApns } from '../_shared/apns.ts'

const KEY_ID = Deno.env.get('APNS_KEY_ID')!
const TEAM_ID = Deno.env.get('APNS_TEAM_ID')!
const PRIVATE_KEY_PEM = Deno.env.get('APNS_PRIVATE_KEY')!
const BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID') ?? 'com.psybypsy.app'
const APNS_HOST = Deno.env.get('APNS_HOST') ?? 'api.push.apple.com'
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// ── APNs provider JWT（ES256），快取重用（跟 push-notify 完全相同的做法）─────
let cachedJwt: { token: string; iat: number } | null = null

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function base64urlStr(str: string): string {
  return base64url(new TextEncoder().encode(str))
}
function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

async function getProviderToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedJwt && now - cachedJwt.iat < 50 * 60) return cachedJwt.token

  const header = base64urlStr(JSON.stringify({ alg: 'ES256', kid: KEY_ID }))
  const claims = base64urlStr(JSON.stringify({ iss: TEAM_ID, iat: now }))
  const signingInput = `${header}.${claims}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(PRIVATE_KEY_PEM),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  )
  const token = `${signingInput}.${base64url(new Uint8Array(sig))}`
  cachedJwt = { token, iat: now }
  return token
}

// 送一則推播給單一 token。回傳 'ok' | 'gone'（token 失效，應刪除）| 'error'
// BadDeviceToken 會自動換 sandbox/production 環境重試，見 _shared/apns.ts。
function sendToToken(
  token: string,
  providerJwt: string,
  title: string,
  body: string,
  route?: string,
): Promise<ApnsResult> {
  return sendApns(token, providerJwt, BUNDLE_ID, APNS_HOST, { title, body, route })
}

// APNs 一個 provider JWT 底下同時間發太多平行請求容易撞限流，分批送、
// 批次之間留一點間隔——公告推播不急著在幾百毫秒內全部送完。
const BATCH_SIZE = 50

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  try {
    const payload = await req.json().catch(() => ({}))
    const title: string = payload.title || 'PSY by PSY'
    const body: string = payload.body || ''
    // 點擊推播要跳去的頁面（例如 '/app/woop'）；不帶就不加這個欄位，行為跟以前一樣。
    const route: string | undefined = payload.route || undefined
    if (!body) {
      return new Response('missing body', { status: 400 })
    }

    // 同一個裝置只留最新一筆（token 是 PK，本來就不會重複），跨所有使用者。
    const { data: tokens, error: fetchErr } = await supabase
      .from('device_tokens')
      .select('token')
    if (fetchErr) {
      console.error('[broadcast] fetch tokens', fetchErr)
      return new Response('error', { status: 500 })
    }
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, pruned: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const jwt = await getProviderToken()
    const dead: string[] = []
    let sent = 0

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(({ token }) => sendToToken(token as string, jwt, title, body, route)),
      )
      results.forEach((r, idx) => {
        if (r === 'ok') sent += 1
        else if (r === 'gone') dead.push(batch[idx].token as string)
      })
    }

    if (dead.length > 0) {
      await supabase.from('device_tokens').delete().in('token', dead)
    }

    return new Response(
      JSON.stringify({ total: tokens.length, sent, pruned: dead.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[broadcast-notify]', e)
    return new Response('error', { status: 500 })
  }
})
