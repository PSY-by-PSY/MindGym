// 危機求助資源視窗：個案練習內容出現高風險訊息時，當下直接顯示（雙向警示的個案端）。
// 語氣溫暖、不驚嚇；不阻擋後續流程（單一「我知道了」關閉）。
// 資源與文案見 docs/plans/pro_modules_plan.md §8。
import { useLanguage } from '../../lib/i18n/context'

const RESOURCES = [
  { name: '安心專線', tel: '1925', note: '24 小時免付費' },
  { name: '生命線', tel: '1995', note: '' },
  { name: '張老師專線', tel: '1980', note: '' },
]

export function CrisisResourcesModal({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#1c1714]/40 px-4 pb-6 pt-10 sm:items-center">
      <div className="w-full max-w-md animate-slide-up rounded-[26px] bg-background p-6 shadow-soft">
        <h2 className="text-xl font-black tracking-[0.02em] text-foreground">{t('你並不孤單')}</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-soft">
          {t('謝謝你願意把這些寫下來。看起來你現在承受著不小的辛苦——你不需要一個人撐著。')}
        </p>

        <div className="mt-5 flex flex-col gap-2.5">
          {RESOURCES.map((r) => (
            <a
              key={r.tel}
              href={`tel:${r.tel}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-soft transition active:scale-[0.98]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tile-mint text-foreground">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.5-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-black text-foreground">{t(r.name)}</span>
                {r.note && <span className="block text-xs text-muted-foreground">{t(r.note)}</span>}
              </span>
              <span className="shrink-0 text-lg font-black tracking-[0.1em] text-foreground">{r.tel}</span>
            </a>
          ))}
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          {t('若有立即危險，請撥打')} <a href="tel:119" className="font-bold text-foreground underline">119</a> {t('或')}{' '}
          <a href="tel:110" className="font-bold text-foreground underline">110</a>
          {t('。')}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {t('你的專業夥伴也會收到提醒，可能會主動關心你。')}
        </p>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
        >
          {t('我知道了')}
        </button>
      </div>
    </div>
  )
}
