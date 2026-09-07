import { createFileRoute, Link } from '@tanstack/react-router'
import { useLanguage } from '../lib/i18n/context'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'
import { CONTACT_EMAIL, INSTAGRAM_URL } from '../components/legal/PrivacyBody'

export const Route = createFileRoute('/support')({
  component: SupportPage,
})

// 支援頁（公開、免登入）。
//
// 為什麼需要這一頁：App Store 上架必填「支援網址（Support URL）」,而
// 2026-09-05 的退件明確指出原本填的 LinkedIn 個人檔案不算數——
//   "The Support URL provided in App Store Connect ... does not direct to a
//    website with information users can use to ask questions and request support."
//
// Apple 要看到的是「使用者能在這裡發問與求助」,所以這一頁至少要有：
//   1. 可直接聯絡的管道（email 必備，點了就能寄信）
//   2. 常見問題的實際解答，不能只有一句「請來信」
//   3. 緊急求助資源（本 App 屬心理健康類，這條同時也和指南 1.4.1 相關）
//
// ⚠️ 這一頁必須維持免登入可讀。審查員不會登入就會點這個網址。
//    網址：https://mind-gym-kappa.vercel.app/support
function SupportPage() {
  const { t } = useLanguage()

  const faqs: [string, string][] = [
    [
      t('我要怎麼刪除帳號？'),
      t('登入後前往「我的健心檔案 → 帳號設定 → 刪除帳號」。刪除會立即生效，你的日記、測驗結果與社群貼文都會永久移除且無法復原，不需要來信申請。'),
    ],
    [
      t('我忘記密碼了怎麼辦？'),
      t('目前重設密碼請直接來信，我們會協助處理。多數使用者是用 Google 或 Apple 登入，這種情況請用原本的登入方式即可，不需要密碼。'),
    ],
    [
      t('Apple 或 Google 登入失敗怎麼辦？'),
      t('請先確認裝置已登入 iCloud 或 Google 帳號、且網路正常，然後再試一次。若仍然失敗，可以改用另一種登入方式，或來信告訴我們你的裝置型號與系統版本。'),
    ],
    [
      t('我的日記內容會被拿去訓練 AI 嗎？'),
      t('不會。我們使用 Anthropic Claude 與 OpenAI Whisper 生成回饋與語音轉文字，傳送的內容不含任何個人識別資訊，服務商也不會用這些資料訓練模型。詳見隱私政策。'),
    ],
    [
      t('社群裡看到不當內容怎麼辦？'),
      t('在該則貼文右上角的選單中選擇「檢舉」並填寫原因，我們會盡快處理。你也可以在同一個選單選擇「封鎖」，該使用者的內容就不會再出現在你的動態中。'),
    ],
    [
      t('報告或分數代表我有心理疾病嗎？'),
      t('不代表。App 內的檢測與週報是自我覺察的參考工具，不是醫療診斷，也不能取代專業的心理諮商或精神醫療。'),
    ],
  ]

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

        <h1 className="text-2xl font-extrabold text-foreground">{t('支援與聯絡我們')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('PSY by PSY 心理健身房')}</p>

        {/* 聯絡管道擺最上面：審查員與使用者第一眼就要看到怎麼找到人。 */}
        <section className="mt-7 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-base font-extrabold text-foreground">{t('直接聯絡我們')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/75">
            {t('有任何問題、建議或需要協助，歡迎透過以下管道與我們聯絡。我們通常會在 2 個工作天內回覆。')}
          </p>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm">
            <li>
              <span className="font-semibold text-foreground">{t('Email：')}</span>
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary underline">
                {CONTACT_EMAIL}
              </a>
            </li>
            <li>
              <span className="font-semibold text-foreground">{t('Instagram：')}</span>
              <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">
                @psy_by_psy
              </a>
            </li>
          </ul>
        </section>

        <section className="mt-7">
          <h2 className="text-base font-extrabold text-foreground">{t('常見問題')}</h2>
          <div className="mt-3 flex flex-col gap-3">
            {faqs.map(([q, a]) => (
              <div key={q} className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-extrabold text-foreground">{q}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/75">{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 緊急求助：心理健康類 App 該有的，也呼應指南 1.4.1。 */}
        <section className="mt-7 rounded-2xl border border-border bg-muted/60 p-5">
          <h2 className="text-base font-extrabold text-foreground">{t('需要立即協助？')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/75">
            {t('本 App 無法提供緊急危機處理。若你感到持續低落、焦慮，或有傷害自己的念頭，請立即尋求專業協助：')}
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-foreground/75">
            <li>{t('衛福部安心專線：1925（24 小時免付費）')}</li>
            <li>{t('生命線：1995')}</li>
            <li>{t('張老師專線：1980')}</li>
            <li>{t('緊急狀況請撥 119 或前往就近急診。')}</li>
          </ul>
        </section>

        <div className="mt-8 flex gap-5 border-t border-border pt-6">
          <Link to="/terms" className="text-sm font-bold text-primary underline">
            {t('使用者條款')}
          </Link>
          <Link to="/privacy" className="text-sm font-bold text-primary underline">
            {t('隱私政策')}
          </Link>
        </div>
      </div>
    </div>
  )
}
