import { Link } from '@tanstack/react-router'
import { CONTACT_EMAIL } from './PrivacyBody'

/** 公開法律頁共用 Footer。商家法定資料完成確認前，刻意不捏造公司／統編。 */
export function PublicFooter() {
  return (
    <footer className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
      <nav aria-label="公開資訊" className="flex flex-wrap gap-x-5 gap-y-3 font-bold text-primary">
        <Link to="/pricing" className="underline">方案與價格</Link>
        <Link to="/terms" className="underline">服務條款</Link>
        <Link to="/privacy" className="underline">隱私權政策</Link>
        <Link to="/refund" className="underline">退款政策</Link>
        <Link to="/support" className="underline">客服中心</Link>
      </nav>
      <p className="mt-5 leading-relaxed">
        客服信箱：<a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary underline">{CONTACT_EMAIL}</a>
      </p>
      <p className="mt-2 leading-relaxed">商家資訊將於正式收費前公告；本服務非醫療行為。若有立即危機，請撥打 1925 或 119。</p>
    </footer>
  )
}
