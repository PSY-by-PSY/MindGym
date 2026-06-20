import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
})

// 隱私政策頁（公開、免登入）。
// 用途：App Store 上架強制要求提供「隱私政策 URL」；此頁即為該 URL：
//   https://mind-gym-kappa.vercel.app/privacy
// 內容涵蓋：蒐集哪些資料、第三方服務、用途、使用者權利、聯絡方式。
//
// 🧑 上架前請確認／替換：下方標 ⚠️ 的聯絡 Email 與公司／團隊正式名稱。
const LAST_UPDATED = '2026 年 6 月 19 日'
const CONTACT_EMAIL = 'psybypsy01@gmail.com'

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div
        className="mx-auto max-w-2xl px-6 py-10 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-[calc(env(safe-area-inset-bottom)+3rem)]"
      >
        <Link
          to="/login"
          className="mb-6 inline-flex items-center gap-1 text-sm font-bold text-muted-foreground transition hover:text-foreground"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回
        </Link>

        <h1 className="text-2xl font-extrabold text-foreground">隱私政策</h1>
        <p className="mt-1 text-sm text-muted-foreground">PSY by PSY 心理健身房</p>
        <p className="mt-1 text-xs text-muted-foreground">最後更新：{LAST_UPDATED}</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground/90">
          <Section title="一、前言">
            <p>
              PSY by PSY（以下稱「我們」或「本服務」）重視你的隱私。本政策說明我們在你使用本 App 與網站時，
              會蒐集哪些資料、如何使用，以及你對自己資料擁有哪些權利。使用本服務即表示你同意本政策的內容。
            </p>
          </Section>

          <Section title="二、我們蒐集的資料">
            <List
              items={[
                ['帳號資料', '當你使用 Google 登入時，我們會取得你的 Email、姓名與頭像，用於建立並辨識你的帳號。'],
                ['你建立的內容', '感恩日記、心理健康測驗的作答與結果、社群貼文與留言、專注紀錄等你主動輸入的內容。'],
                ['語音輸入', '若你使用「語音輸入」回答問卷，錄音會傳送到我們的伺服器轉換成文字（透過 OpenAI 語音辨識）。我們不會長期保存原始錄音。'],
                ['使用數據', '為了改善產品，我們透過 PostHog 蒐集匿名的使用行為（例如你瀏覽了哪些頁面、點擊了哪些功能）。'],
                ['技術資料', '維持登入狀態所需的驗證憑證（token），以及裝置與瀏覽器的基本技術資訊。'],
              ]}
            />
          </Section>

          <Section title="三、我們如何使用這些資料">
            <List
              items={[
                ['提供服務', '讓你登入、保存並同步你的心理健身紀錄。'],
                ['社群互動', '在你選擇分享時，於社群打卡牆顯示你的內容（你可選擇實名、匿名或僅自己可見）。'],
                ['改善體驗', '分析整體使用情況，優化功能與內容。'],
                ['通知提醒', '在你同意後，發送與練習、習慣養成相關的提醒。'],
              ]}
            />
          </Section>

          <Section title="四、第三方服務">
            <p>本服務透過以下受信任的第三方提供商運作。它們各自有其隱私政策：</p>
            <List
              items={[
                ['Supabase', '資料儲存與帳號登入。'],
                ['Google', '第三方登入（OAuth）。'],
                ['OpenAI', '語音輸入的語音轉文字。'],
                ['PostHog', '匿名行為分析。'],
                ['Vercel / Render', '網站與後端服務代管。'],
              ]}
            />
            <p className="mt-3">
              我們不會將你的個人資料販售給任何第三方。
            </p>
          </Section>

          <Section title="五、資料的保存與安全">
            <p>
              我們僅在提供服務所需的期間內保存你的資料，並採取合理的技術與管理措施保護資料安全。
              資料透過 HTTPS 加密傳輸。
            </p>
          </Section>

          <Section title="六、你的權利">
            <p>
              你有權查詢、更正或刪除你的個人資料。你可以在 App 內刪除自己的紀錄與貼文，
              或透過下方聯絡方式要求刪除整個帳號與相關資料。
            </p>
          </Section>

          <Section title="七、兒童隱私">
            <p>
              本服務並非針對 13 歲以下兒童設計，我們不會在知情的情況下蒐集兒童的個人資料。
            </p>
          </Section>

          <Section title="八、政策更新">
            <p>
              我們可能會不時更新本政策。重大變更時會於本頁公告，並更新上方的「最後更新」日期。
            </p>
          </Section>

          <Section title="九、聯絡我們">
            <p>
              對本政策或你的資料有任何疑問，歡迎透過以下方式聯絡我們：
            </p>
            <ul className="mt-2 space-y-1">
              <li>
                Email：
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary underline">
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                Instagram：
                <a
                  href="https://www.instagram.com/psy_by_psy/"
                  className="font-semibold text-primary underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  @psy_by_psy
                </a>
              </li>
            </ul>
          </Section>
        </div>
      </div>
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
