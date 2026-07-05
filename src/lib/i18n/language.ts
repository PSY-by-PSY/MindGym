// 全站語言設定。與 lib/fontScale.ts 同樣的 localStorage 存取模式。
export type Language = 'zh-TW' | 'zh-CN' | 'en'

const KEY = 'app_language'

export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
]

const HTML_LANG: Record<Language, string> = {
  'zh-TW': 'zh-Hant-TW',
  'zh-CN': 'zh-Hans-CN',
  en: 'en',
}

export function getLanguage(): Language {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'zh-TW' || v === 'zh-CN' || v === 'en') return v
  } catch {
    // localStorage 不可用時退回預設
  }
  return 'zh-TW'
}

export function persistLanguage(lang: Language): void {
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // 忽略寫入失敗（隱私模式等）
  }
  applyHtmlLang(lang)
}

export function applyHtmlLang(lang: Language): void {
  document.documentElement.lang = HTML_LANG[lang]
}
