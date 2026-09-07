// 隱私政策的「內文」——只有內容，不含頁面外框。
//
// 為什麼抽成獨立元件：這段內容同時出現在兩個地方——
//   1. /privacy 公開頁（src/routes/privacy.tsx，也是 App Store 必填的隱私政策 URL）
//   2. 登入後的同意閘門（src/components/TermsConsentGate.tsx）
// 兩邊共用同一份，才不會改了一邊、另一邊悄悄過時。
//
// ⚠️ 第四節的第三方清單必須與「實際用到的服務」一致。這份清單也是回覆
//    App Store「你們用了哪些第三方 AI」時的依據，兩邊對不上會被抓。
import { useLanguage } from '../../lib/i18n/context'

export const PRIVACY_LAST_UPDATED = '2026 年 9 月 2 日'
export const CONTACT_EMAIL = 'psybypsy01@gmail.com'
export const INSTAGRAM_URL = 'https://www.instagram.com/psy_by_psy/'

export function PrivacyBody() {
  const { t } = useLanguage()
  return (
    <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
      <Section title={t('一、前言')}>
        <p>
          {t('PSY by PSY（以下稱「我們」或「本服務」）重視你的隱私。本政策說明我們在你使用本 App 與網站時，會蒐集哪些資料、如何使用，以及你對自己資料擁有哪些權利。使用本服務即表示你同意本政策的內容。')}
        </p>
      </Section>

      <Section title={t('二、我們蒐集的資料')}>
        <List
          items={[
            [t('帳號資料'), t('你註冊時提供的 Email 與密碼；若使用 Google 或 Apple 登入，我們會取得該服務提供的 Email 與名稱（使用 Apple 登入時，你可以選擇隱藏真實 Email，我們只會收到 Apple 提供的轉發信箱）。這些資料用於建立並辨識你的帳號。')],
            [t('你建立的內容'), t('感恩日記、心理健康測驗的作答與結果、社群貼文與留言、專注紀錄等你主動輸入的內容。')],
            [t('語音輸入'), t('若你使用「語音輸入」回答問卷，錄音會傳送到我們的伺服器轉換成文字（透過 OpenAI 語音辨識）。我們不會長期保存原始錄音。')],
            [t('使用數據'), t('為了改善產品，我們透過 PostHog 蒐集匿名的使用行為（例如你瀏覽了哪些頁面、點擊了哪些功能）。')],
            [t('技術資料'), t('維持登入狀態所需的驗證憑證（token），以及裝置與瀏覽器的基本技術資訊。')],
          ]}
        />
      </Section>

      <Section title={t('三、我們如何使用這些資料')}>
        <List
          items={[
            [t('提供服務'), t('讓你登入、保存並同步你的心理健身紀錄。')],
            [t('社群互動'), t('在你選擇分享時，於社群打卡牆顯示你的內容（你可選擇實名、匿名或僅自己可見）。')],
            [t('改善體驗'), t('分析整體使用情況，優化功能與內容。')],
            [t('通知提醒'), t('在你同意後，發送與練習、習慣養成相關的提醒。')],
          ]}
        />
      </Section>

      {/* ⚠️ 這份清單必須與實際使用的服務一致，也要與回覆 App Store 的 AI 說明對得上。 */}
      <Section title={t('四、第三方服務')}>
        <p>{t('本服務透過以下受信任的第三方提供商運作。它們各自有其隱私政策：')}</p>
        <List
          items={[
            ['Supabase', t('資料儲存與帳號登入。')],
            ['Google', t('第三方登入（OAuth）。')],
            ['Apple', t('第三方登入（Sign in with Apple）。')],
            ['Anthropic', t('生成練習回饋、週分析報告與內容標記（Claude）。')],
            ['OpenAI', t('語音輸入的語音轉文字（Whisper）。')],
            ['PostHog', t('匿名行為分析。')],
            ['Vercel / Render', t('網站與後端服務代管。')],
          ]}
        />
        <p className="mt-3">{t('我們不會將你的個人資料販售給任何第三方。')}</p>
      </Section>

      <Section title={t('五、資料的保存與安全')}>
        <p>
          {t('我們僅在提供服務所需的期間內保存你的資料，並採取合理的技術與管理措施保護資料安全。資料透過 HTTPS 加密傳輸。')}
        </p>
      </Section>

      <Section title={t('六、你的權利')}>
        <p>
          {t('你有權查詢、更正或刪除你的個人資料。你可以在 App 內刪除自己的紀錄與貼文，也可以直接在「我的健心檔案」頁面的帳號設定中刪除整個帳號與相關資料。')}
        </p>
      </Section>

      <Section title={t('七、兒童隱私')}>
        <p>{t('本服務並非針對 13 歲以下兒童設計，我們不會在知情的情況下蒐集兒童的個人資料。')}</p>
      </Section>

      <Section title={t('八、政策更新')}>
        <p>{t('我們可能會不時更新本政策。重大變更時會於本頁公告，並更新上方的「最後更新」日期。')}</p>
      </Section>

      <Section title={t('九、聯絡我們')}>
        <p>{t('對本政策或你的資料有任何疑問，歡迎透過以下方式聯絡我們：')}</p>
        <ul className="mt-2 space-y-1">
          <li>
            {t('Email：')}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary underline">
              {CONTACT_EMAIL}
            </a>
          </li>
          <li>
            {t('Instagram：')}
            <a href={INSTAGRAM_URL} className="font-semibold text-primary underline" target="_blank" rel="noreferrer">
              @psy_by_psy
            </a>
          </li>
        </ul>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-extrabold text-foreground">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function List({ items }: { items: [string, string][] }) {
  return (
    <ul className="space-y-2">
      {items.map(([label, desc]) => (
        <li key={label} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
          <span>
            <span className="font-semibold text-foreground">{label}</span>
            <span className="text-foreground/80">：{desc}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
