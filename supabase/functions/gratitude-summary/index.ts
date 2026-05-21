import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type SummaryRequest = {
  item_1: string
  item_2: string
  item_3: string
  difficulty?: 'basic' | 'advanced'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { item_1, item_2, item_3, difficulty } = (await req.json()) as SummaryRequest

    if (!item_1?.trim() || !item_2?.trim() || !item_3?.trim()) {
      return new Response(JSON.stringify({ error: 'Missing items' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const tone =
      difficulty === 'advanced'
        ? '使用者選擇了「進階」模式，請更深入地反映其覺察與內在意義。'
        : '使用者選擇了「初階」模式，請以溫柔、平實、簡短的語氣陪伴。'

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      system:
        '你是一位心理學取向的健心教練，回應請使用繁體中文，語氣溫暖、不批判、有陪伴感。只回傳純文字摘要，不要加標題、不要加引號、不要使用 Markdown。',
      messages: [
        {
          role: 'user',
          content: `以下是使用者今天寫下的三件感恩：

1. ${item_1}
2. ${item_2}
3. ${item_3}

${tone}

請用一段約 60–90 字的繁體中文，整體性地回應這三件感恩，反映使用者的正向情緒，點出整體的心理意義，讓人讀完後感到被理解與支持。`,
        },
      ],
    })

    const block = message.content[0]
    if (!block || block.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    const summary = block.text.trim()

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('gratitude-summary error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
