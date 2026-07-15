// 「翻譯粉粿」：社群貼文按需翻譯。使用者在貼文上點擊翻譯粉粿，把該篇貼文的所有
// 自由文字欄位（感恩三件事 / 過程目標覺察的事件描述、AI 回饋等）一次送進來，
// 翻譯成目前所選的介面語言（en 或 zh-CN；zh-TW 原文不會呼叫這支函式）。
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0'
import { meterClaude } from '../_shared/metering.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type TargetLang = 'en' | 'zh-CN'

type TranslateRequest = {
  texts: string[]
  targetLang: TargetLang
}

const TARGET_LANG_NAME: Record<TargetLang, string> = {
  en: 'English',
  'zh-CN': 'Simplified Chinese (简体中文)',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { texts, targetLang } = (await req.json()) as TranslateRequest

    if (!Array.isArray(texts) || texts.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing texts' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (targetLang !== 'en' && targetLang !== 'zh-CN') {
      return new Response(JSON.stringify({ error: 'Invalid targetLang' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })
    const langName = TARGET_LANG_NAME[targetLang]

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: `你是專業翻譯。輸入是一個 JSON 字串陣列，內容是繁體中文。請將陣列中「每一個元素」翻譯成${langName}，保留原本的語氣、情緒與標點風格，不要加任何解釋或註解。只回傳一個跟輸入長度相同的 JSON 字串陣列，不要加 Markdown code fence、不要加任何其他文字。空字串就回傳空字串。`,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(texts),
        },
      ],
    })

    await meterClaude('translate-post-edge', 'claude-haiku-4-5', message.usage)

    const block = message.content[0]
    if (!block || block.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    let translations: unknown
    try {
      translations = JSON.parse(block.text.trim())
    } catch {
      throw new Error('Model did not return valid JSON')
    }
    if (!Array.isArray(translations) || translations.length !== texts.length) {
      throw new Error('Translation array length mismatch')
    }

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('translate-post error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
