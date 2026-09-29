// deno test supabase/functions/_shared/apns_test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { APNS_PRODUCTION_HOST, APNS_SANDBOX_HOST, sendApns } from './apns.ts'

type Reply = { status: number; reason?: string }

function fakeFetch(replies: Record<string, Reply>) {
  const calls: string[] = []
  const fn = ((url: string) => {
    const host = new URL(url).host
    calls.push(host)
    const r = replies[host] ?? { status: 500, reason: 'unexpected host' }
    const body = r.reason ? JSON.stringify({ reason: r.reason }) : null
    return Promise.resolve(new Response(body, { status: r.status }))
  }) as unknown as typeof fetch
  return { fn, calls }
}

const MSG = { title: 't', body: 'b' }
const send = (fn: typeof fetch) => sendApns('abc', 'jwt', 'com.psybypsy.app', APNS_PRODUCTION_HOST, MSG, fn)

Deno.test('200 on primary host is ok without retry', async () => {
  const { fn, calls } = fakeFetch({ [APNS_PRODUCTION_HOST]: { status: 200 } })
  assertEquals(await send(fn), 'ok')
  assertEquals(calls, [APNS_PRODUCTION_HOST])
})

Deno.test('410 Unregistered is gone', async () => {
  const { fn, calls } = fakeFetch({ [APNS_PRODUCTION_HOST]: { status: 410, reason: 'Unregistered' } })
  assertEquals(await send(fn), 'gone')
  assertEquals(calls, [APNS_PRODUCTION_HOST])
})

Deno.test('BadDeviceToken retries sandbox and keeps a sandbox token', async () => {
  const { fn, calls } = fakeFetch({
    [APNS_PRODUCTION_HOST]: { status: 400, reason: 'BadDeviceToken' },
    [APNS_SANDBOX_HOST]: { status: 200 },
  })
  assertEquals(await send(fn), 'ok')
  assertEquals(calls, [APNS_PRODUCTION_HOST, APNS_SANDBOX_HOST])
})

Deno.test('BadDeviceToken on both hosts is gone', async () => {
  const { fn } = fakeFetch({
    [APNS_PRODUCTION_HOST]: { status: 400, reason: 'BadDeviceToken' },
    [APNS_SANDBOX_HOST]: { status: 400, reason: 'BadDeviceToken' },
  })
  assertEquals(await send(fn), 'gone')
})

Deno.test('key/config errors never delete the token', async () => {
  const { fn, calls } = fakeFetch({ [APNS_PRODUCTION_HOST]: { status: 403, reason: 'InvalidProviderToken' } })
  assertEquals(await send(fn), 'error')
  assertEquals(calls, [APNS_PRODUCTION_HOST])
})

Deno.test('fallback host config error keeps the token', async () => {
  const { fn } = fakeFetch({
    [APNS_PRODUCTION_HOST]: { status: 400, reason: 'BadDeviceToken' },
    [APNS_SANDBOX_HOST]: { status: 403, reason: 'BadEnvironmentKeyInToken' },
  })
  assertEquals(await send(fn), 'error')
})
