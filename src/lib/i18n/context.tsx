import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { getLanguage, persistLanguage, applyHtmlLang, type Language } from './language'
import { DICTIONARY } from './dictionary'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  // t(原文) 依目前語言查表回傳翻譯；原文即繁中，找不到翻譯（或目前就是繁中）時原樣回傳。
  // 第二個參數可傳入 {占位字:值} 取代原文/譯文裡的 {占位字}。
  t: (text: string, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const lang = getLanguage()
    applyHtmlLang(lang)
    return lang
  })

  const setLanguage = useCallback((lang: Language) => {
    persistLanguage(lang)
    setLanguageState(lang)
  }, [])

  const t = useCallback(
    (text: string, vars?: Record<string, string | number>) => {
      let result = text
      if (language !== 'zh-TW') {
        const entry = DICTIONARY[text]
        if (entry) result = entry[language]
      }
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          result = result.split(`{${k}}`).join(String(v))
        }
      }
      return result
    },
    [language],
  )

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
