import { createFileRoute, Link } from '@tanstack/react-router'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'
import { PublicFooter } from '../components/legal/PublicFooter'

export const Route = createFileRoute('/refund')({
  component: RefundPage,
})

function RefundPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-6 py-10 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-[calc(env(safe-area-inset-bottom)+3rem)]">
        <div className="flex items-center justify-between">
          <Link to="/login" className="text-sm font-bold text-muted-foreground transition hover:text-foreground">← 返回</Link>
          <LanguageSwitcherCompact />
        </div>
        <h1 className="mt-10 text-3xl font-extrabold text-foreground">退款政策</h1>
        <p className="mt-2 text-sm text-muted-foreground">PSY by PSY 心理健身房｜草案，將於正式收費前確認並公告生效日期</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground/90">
          <PolicySection title="一、可以申請全額退款的情況">
            <ul className="list-disc space-y-2 pl-5">
              <li>首次訂閱或每次自動續訂扣款後 7 天內（含第 7 天）提出申請。</li>
              <li>因系統錯誤造成的重複扣款或金額錯誤，不受 7 天限制。</li>
              <li>因我們的原因終止整個服務時，按剩餘天數比例退款。</li>
            </ul>
          </PolicySection>
          <PolicySection title="二、不提供退款的情況">
            <ul className="list-disc space-y-2 pl-5">
              <li>扣款已超過 7 天；你仍可取消自動續訂並使用至該期結束。</li>
              <li>帳號因違反服務條款而遭停權。</li>
              <li>透過 Apple App Store 購買的訂閱；退款須依 Apple 的程序申請。</li>
            </ul>
          </PolicySection>
          <PolicySection title="三、申請方式">
            <p>請寄信至 <a className="font-semibold text-primary underline" href="mailto:psybypsy01@gmail.com">psybypsy01@gmail.com</a>，主旨為「退款申請」，並提供註冊帳號 Email、訂單編號、扣款日期與退款原因（選填）。</p>
          </PolicySection>
          <PolicySection title="四、退款後的會員權益">
            <p>退款完成後，該期 Pro 權益會終止，且後續自動續訂會停止。帳號將回到免費會員；日記、測驗結果與其他個人紀錄不會被刪除。</p>
          </PolicySection>
          <PolicySection title="五、取消訂閱與退款的差別">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead><tr className="border-b border-border"><th className="p-2">項目</th><th className="p-2">取消自動續訂</th><th className="p-2">申請退款</th></tr></thead>
                <tbody><tr className="border-b border-border"><td className="p-2 font-semibold">結果</td><td className="p-2">停止下一次扣款，使用至期滿</td><td className="p-2">退還本期費用，權益立即終止</td></tr><tr><td className="p-2 font-semibold">方式</td><td className="p-2">未來在訂閱管理操作</td><td className="p-2">寄信申請</td></tr></tbody>
              </table>
            </div>
          </PolicySection>
        </div>
        <PublicFooter />
      </main>
    </div>
  )
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="text-lg font-extrabold text-foreground">{title}</h2><div className="mt-3">{children}</div></section>
}
