import { createFileRoute, Link } from '@tanstack/react-router'
import { useLanguage } from '../lib/i18n/context'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'
import { TermsBody, TERMS_LAST_UPDATED } from '../components/legal/TermsBody'

export const Route = createFileRoute('/terms')({
  component: TermsPage,
})

// 使用者條款 / EULA（公開、免登入）。
//
// 為什麼需要這一頁：App Store 審查指南 1.2（使用者產生內容）要求
// 「使用者必須在註冊或登入前同意條款，且條款需明確載明對冒犯內容與濫用行為零容忍」。
// 2026-08-16 的退件即是因為缺少這一頁與登入頁的同意流程。
//
// 送審時 Apple 會要求錄影展示三件事：
//   1. 註冊／登入前呈現的條款同意（login.tsx 的勾選框 → 連到本頁）
//      另有登入後的 TermsConsentGate 讓使用者實際讀到全文並留下同意紀錄。
//   2. 檢舉冒犯內容的機制（社群貼文選單 → 檢舉，見 lib/communityModeration.ts）
//   3. 封鎖騷擾使用者的機制（社群貼文選單 → 封鎖；側邊欄可解除封鎖）
//
// ⚠️ 內文在 components/legal/TermsBody.tsx，與登入後的同意閘門共用同一份。
function TermsPage() {
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

        <h1 className="text-2xl font-extrabold text-foreground">{t('使用者條款')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('PSY by PSY 心理健身房')}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('最後更新：{date}', { date: t(TERMS_LAST_UPDATED) })}
        </p>

        <div className="mt-8">
          <TermsBody />
        </div>

        <div className="mt-7 border-t border-border pt-6">
          <Link to="/privacy" className="text-sm font-bold text-primary underline">
            {t('隱私政策')}
          </Link>
        </div>
      </div>
    </div>
  )
}
