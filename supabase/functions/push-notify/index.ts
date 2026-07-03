// ════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: push-notify
//
// 由 likes / comments 的 AFTER INSERT 觸發器（pg_net）呼叫，向貼文主人的
// 裝置發 APNs 遠端推播 —— 讓「按讚／留言」在 App 關閉時也收得到。
//
// 需要的 Function secrets（supabase secrets set ...）：
//   APNS_KEY_ID        Apple Developer 的 APNs Auth Key ID（.p8 檔名裡那串）
//   APNS_TEAM_ID       Apple Developer Team ID
//   APNS_PRIVATE_KEY   .p8 內容（含 -----BEGIN PRIVATE KEY----- 整段）
//   APNS_BUNDLE_ID     com.psybypsy.app（預設值，可省）
//   APNS_HOST          api.push.apple.com（正式）/ api.sandbox.push.apple.com（開發/TestFlight 用 sandbox）
//   WEBHOOK_SECRET     與 SQL 觸發器 header 的 x-webhook-secret 相同
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  讀 device_tokens、gratitude_entries（繞過 RLS）
//
// 部署：supabase functions deploy push-notify --no-verify-jwt
//   （--no-verify-jwt：改用 WEBHOOK_SECRET 自行驗證，方便 pg_net 直接呼叫）
// ════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// ── APNs provider JWT（ES256），快取重用（APNs 允許 ~1 小時）─────────────
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

function snippet(text: string | null | undefined, n = 20): string {
  if (!text) return ''
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

// 送一則推播給單一 token。回傳 'ok' | 'gone'（token 失效，應刪除）| 'error'
async function sendToToken(
  token: string,
  providerJwt: string,
  title: string,
  body: string,
): Promise<'ok' | 'gone' | 'error'> {
  const res = await fetch(`https://${APNS_HOST}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${providerJwt}`,
      'apns-topic': BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    },
    body: JSON.stringify({
      aps: { alert: { title, body }, sound: 'default' },
    }),
  })
  if (res.ok) return 'ok'
  const reason = await res.text().catch(() => '')
  // 410 Unregistered / 400 BadDeviceToken → token 已失效，清掉
  if (res.status === 410 || /BadDeviceToken|Unregistered/.test(reason)) return 'gone'
  console.error('[apns]', res.status, reason)
  return 'error'
}

Deno.serve(async (req) => {
  // 驗證來源（pg_net 觸發器帶的共用密碼）
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  try {
    const payload = await req.json()
    const table: string = payload.table
    const record = payload.record ?? {}
    const entryId: string | undefined = record.entry_id
    const actorId: string | undefined = record.user_id
    if (!entryId || (table !== 'likes' && table !== 'comments')) {
      return new Response('ignored', { status: 200 })
    }
    // 機器人讚不推播（觸發器通常已過濾，這裡再保險一次）
    if (record.is_bot === true) {
      return new Response('skip bot', { status: 200 })
    }

    // 找出貼文主人
    const { data: entry } = await supabase
      .from('gratitude_entries')
      .select('user_id, item_1')
      .eq('id', entryId)
      .maybeSingle()
    const ownerId: string | undefined = entry?.user_id
    if (!ownerId || ownerId === actorId) {
      // 找不到貼文，或自己對自己互動 → 不通知
      return new Response('skip', { status: 200 })
    }

    // 通知文案
    const title = 'PSY by PSY'
    let body: string
    if (table === 'likes') {
      body = '有人為你的感恩貼文按讚 ❤️'
    } else {
      const name = record.anon_name || '有人'
      body = `${name} 留言：${snippet(record.content)}`
    }

    // 取得主人的所有裝置 token
    const { data: tokens } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('user_id', ownerId)
    if (!tokens || tokens.length === 0) {
      return new Response('no tokens', { status: 200 })
    }

    const jwt = await getProviderToken()
    const dead: string[] = []
    await Promise.all(
      tokens.map(async ({ token }) => {
        const r = await sendToToken(token as string, jwt, title, body)
        if (r === 'gone') dead.push(token as string)
      }),
    )
    if (dead.length > 0) {
      await supabase.from('device_tokens').delete().in('token', dead)
    }

    return new Response(
      JSON.stringify({ sent: tokens.length - dead.length, pruned: dead.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[push-notify]', e)
    return new Response('error', { status: 500 })
  }
})
