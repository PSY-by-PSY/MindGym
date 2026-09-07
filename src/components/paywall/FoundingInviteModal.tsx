// 完成任一健心模組打卡後的創始成員邀請小視窗（每次完成都跳，見 useFoundingInviteGate）。
import { useNavigate } from '@tanstack/react-router'
import { useLanguage } from '../../lib/i18n/context'
import { track } from '../../lib/analytics'

export function FoundingInviteModal({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  if (!open) return null

  const handleApply = () => {
    track('founding_invite_apply_clicked', {})
    onDismiss()
    navigate({ to: '/paywall' })
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#1c1714]/40 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      onClick={onDismiss}
    >
      <div
        className="relative w-full max-w-sm rounded-[24px] bg-card p-6 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onDismiss}
          aria-label={t('關閉')}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition active:scale-95"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2 className="pr-8 text-lg font-black text-foreground">{t('今天也完成練習了，太棒了！')}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-foreground/80">
          {t('申請加入創始成員，之後你可以：')}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {['健身房新菜單，搶先體驗', '每週一份 AI 個人化心理健康專屬週報'].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <CheckDot />
              <span className="text-sm font-bold text-foreground">{t(line)}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={handleApply}
          className="mt-5 w-full rounded-full bg-gradient-primary py-3 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
        >
          {t('申請加入創始成員')}
        </button>
      </div>
    </div>
  )
}

function CheckDot() {
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-soft">
      <svg className="h-2.5 w-2.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  )
}
