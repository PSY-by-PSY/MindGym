// 「翻譯粉粿」：社群貼文按需翻譯成目前選擇的介面語言（en / zh-CN）。
// 呼叫 supabase Edge Function `translate-post`，一次把一篇貼文的所有自由文字欄位
// 送進去翻譯，回傳同樣順序/長度的翻譯陣列。原文一律是繁體中文，zh-TW 不會呼叫這支。
import { supabase } from './supabase'

export type TranslateTargetLang = 'en' | 'zh-CN'

/** 依序翻譯 texts 陣列；任一環節失敗回 null（呼叫端應原樣顯示原文，不擋主流程）。 */
export async function translateTexts(
  texts: string[],
  targetLang: TranslateTargetLang,
): Promise<string[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke('translate-post', {
      body: { texts, targetLang },
    })
    if (error) {
      console.error('[translate] translate-post', error)
      return null
    }
    const translations = (data as { translations?: unknown })?.translations
    if (!Array.isArray(translations) || translations.length !== texts.length) return null
    return translations as string[]
  } catch (e) {
    console.error('[translate] translateTexts', e)
    return null
  }
}
