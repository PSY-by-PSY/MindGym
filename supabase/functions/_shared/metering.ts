// AI 成本自行計量（軌道一）—— Edge Function 共用版。
//
// 與後端 usage_metering.py 對應：每次 Claude 呼叫後把 token 數與換算金額
// 寫進 ai_usage_log。Edge Function 是 serverless，Response 回傳後背景任務會被
// 中止，所以這裡採「回傳前 await 寫入、但整段包 try/catch」——失敗只記 log，
// 絕不讓記帳弄壞主流程。
//
// 需先套用 supabase/usage_monitor.sql 建立 ai_usage_log。
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由 Supabase 自動注入 Edge Function。

// 每百萬 token 美元單價；未列出的模型走 DEFAULT。價格變動時改這裡。
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-opus-4-8': { input: 5.0, output: 25.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
}
const DEFAULT_RATES = { input: 3.0, output: 15.0 }

type ClaudeUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export function claudeCost(model: string, usage: ClaudeUsage): { cost: number; tokens: Record<string, number> } {
  const r = PRICING[model] ?? DEFAULT_RATES
  const inp = usage.input_tokens ?? 0
  const out = usage.output_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0

  const cost =
    (inp * r.input +
      out * r.output +
      cacheWrite * r.input * 1.25 + // cache 寫入 1.25×
      cacheRead * r.input * 0.1) / // cache 讀取 0.1×
    1_000_000

  return {
    cost: Math.round(cost * 1e6) / 1e6,
    tokens: {
      input_tokens: inp,
      output_tokens: out,
      cache_write_tokens: cacheWrite,
      cache_read_tokens: cacheRead,
    },
  }
}

// 記錄一次 Claude 呼叫的花費。整段不拋例外——回傳 void，失敗只 console.error。
export async function meterClaude(
  source: string,
  model: string,
  usage: ClaudeUsage,
  userId: string | null = null,
): Promise<void> {
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) return

    const { cost, tokens } = claudeCost(model, usage)
    await fetch(`${url}/rest/v1/ai_usage_log`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        provider: 'anthropic',
        source,
        model,
        user_id: userId,
        cost_usd: cost,
        ...tokens,
      }),
    })
  } catch (err) {
    console.error('meterClaude failed:', err)
  }
}
