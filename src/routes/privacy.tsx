import { createFileRoute, Link } from '@tanstack/react-router'
import { useLanguage } from '../lib/i18n/context'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'
import { PrivacyBody, PRIVACY_LAST_UPDATED } from '../components/legal/PrivacyBody'

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
})

// 隱私政策頁（公開、免登入）。
// 用途：App Store 上架強制要求提供「隱私政策 URL」；此頁即為該 URL：
//   https://app.psybypsy.com/privacy
//
// ⚠️ 內文在 components/legal/PrivacyBody.tsx，與登入後的同意閘門
//    （components/TermsConsentGate.tsx）共用同一份，避免兩邊內容漂移。
function PrivacyPage() {
  const { t } = useLanguage()
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-10 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-[calc(env(safe-area-inset-bottom)+3rem)]">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground transition hover:text-foreground"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            {t('返回')}
          </Link>
          <LanguageSwitcherCompact />
        </div>

        <h1 className="text-2xl font-extrabold text-foreground">{t('隱私政策')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('PSY by PSY 心理健身房')}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('最後更新：{date}', { date: t(PRIVACY_LAST_UPDATED) })}
        </p>

        <div className="mt-8">
          <PrivacyBody />
        </div>

        <div className="mt-8 border-t border-border pt-6">
          <Link to="/terms" className="text-sm font-bold text-primary underline">
            {t('使用者條款')}
          </Link>
        </div>
      </div>
    </div>
  )
}
