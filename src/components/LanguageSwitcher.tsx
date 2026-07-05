import { useLanguage } from '../lib/i18n/context'
import { LANGUAGE_OPTIONS, type Language } from '../lib/i18n/language'

// 側邊選單版：跟字體大小選項同樣的按鈕列樣式。
export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage()

  return (
    <div className="px-3 py-1">
      <div className="flex items-center gap-3">
        <LanguageIcon />
        <span className="text-lg font-black tracking-[0.03em] text-foreground">{t('語言')}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {LANGUAGE_OPTIONS.map((opt) => {
          const active = language === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setLanguage(opt.value)}
              aria-pressed={active}
              className={`rounded-2xl px-4 py-2.5 text-sm font-bold transition active:scale-95 ${
                active
                  ? 'border-2 border-[#88B8CE] bg-white text-foreground shadow-soft'
                  : 'border border-[#d8cdbb] bg-[#e7e0d2] text-muted-foreground'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// 精簡版：桌機頁首（Therapist / Admin）用的下拉選單，或無側邊選單頁面的角落控制。
export function LanguageSwitcherCompact({ className = '' }: { className?: string }) {
  const { language, setLanguage, t } = useLanguage()

  return (
    <select
      aria-label={t('語言')}
      value={language}
      onChange={(e) => setLanguage(e.target.value as Language)}
      className={`rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground ${className}`}
    >
      {LANGUAGE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

function LanguageIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z" />
    </svg>
  )
}
