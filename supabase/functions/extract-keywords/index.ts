import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0'
import { meterClaude } from '../_shared/metering.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type EntryInput = {
  id: string
  item_1: string | null
  item_2: string | null
  item_3: string | null
}

type KeywordTag = {
  word: string
  category: '感受' | '事件' | '對象' | '其他'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { entries } = (await req.json()) as { entries: EntryInput[] }

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ tags: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const entriesText = entries
      .map((e) => {
        const content = [e.item_1, e.item_2, e.item_3].filter(Boolean).join('；')
        return `ID: ${e.id}\n內容：${content}`
      })
      .join('\n\n')

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `你是一個繁體中文文本分析助手。請分析以下感恩日記條目，為每一則提取 2-3 個關鍵詞標籤。

每個標籤規則：
- 2-4 個繁體中文字的詞語
- 必須屬於以下四個類別之一：感受、事件、對象、其他
  - 感受：描述情緒或心理狀態（例如：溫暖、感動、平靜）
  - 事件：描述發生的事情（例如：聚餐、完成目標、下雨天）
  - 對象：描述人物或事物（例如：家人、朋友、貓咪）
  - 其他：不屬於以上三類的詞語

只回傳以下 JSON 格式，不要其他文字：
{
  "results": [
    {
      "id": "entry_id_here",
      "tags": [
        { "word": "關鍵詞", "category": "感受" },
        { "word": "關鍵詞", "category": "事件" }
      ]
    }
  ]
}

感恩日記條目：
${entriesText}`,
        },
      ],
    })

    await meterClaude('extract-keywords-edge', 'claude-haiku-4-5', message.usage)

    const block = message.content[0]
    if (block.type !== 'text') throw new Error('Unexpected response type')

    // Strip markdown code fences if present
    const raw = block.text.replace(/```(?:json)?\s*/g, '').trim()
    const parsed = JSON.parse(raw) as { results: { id: string; tags: KeywordTag[] }[] }

    const tags: Record<string, KeywordTag[]> = {}
    for (const result of parsed.results) {
      tags[result.id] = result.tags.slice(0, 3)
    }

    return new Response(JSON.stringify({ tags }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('extract-keywords error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
