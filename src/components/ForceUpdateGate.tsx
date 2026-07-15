// 全螢幕強制更新擋板。只在原生殼（iOS/Android）且版本低於後台設定門檻時出現，
// 無法關閉、沒有「稍後再說」——只有一顆按鈕去 App Store／Play Store。
// 純網頁使用者完全不受影響（checkForceUpdate 對網頁一律回傳 null）。
import { useEffect, useState } from 'react'
import { isNativeApp } from '../lib/nativeAuth'
import { checkForceUpdate, type ForceUpdateInfo } from '../lib/appVersion'
import { useLanguage } from '../lib/i18n/context'
import logoWordmark from '../assets/ui/logo-wordmark.png'

type GateState = 'checking' | 'ok' | ForceUpdateInfo

export function ForceUpdateGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>(isNativeApp() ? 'checking' : 'ok')

  useEffect(() => {
    if (!isNativeApp()) return
    let cancelled = false
    checkForceUpdate()
      .then((info) => {
        if (!cancelled) setState(info ?? 'ok')
      })
      .catch((e) => {
        console.error('[force-update] 檢查失敗，不擋畫面', e)
        if (!cancelled) setState('ok')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (state === 'ok') return <>{children}</>

  return <ForceUpdateScreen info={state} />
}

async function openUpdateUrl(url: string) {
  try {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
  } catch {
    window.location.href = url
  }
}

function ForceUpdateScreen({ info }: { info: ForceUpdateInfo }) {
  const { t } = useLanguage()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page px-8 text-center">
      <img src={logoWordmark} alt="PSY by PSY" className="h-6 w-auto object-contain" />
      <div className="mt-8 flex h-24 w-24 items-center justify-center rounded-full bg-tile-blue text-5xl">
        ⬆️
      </div>
      <h1 className="mt-6 text-xl font-black text-foreground">{t('有新版本囉！')}</h1>
      <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-muted-foreground">
        {info.message || t('這個版本已經停止支援，請更新到最新版本才能繼續使用。')}
      </p>
      {info.updateUrl && (
        <button
          onClick={() => openUpdateUrl(info.updateUrl!)}
          className="mt-8 w-full max-w-xs rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
        >
          {t('立即更新')}
        </button>
      )}
      <p className="mt-6 text-xs text-muted-foreground/70">
        {t('目前版本 {current} · 需要版本 {min} 以上', { current: info.currentVersion, min: info.minVersion })}
      </p>
    </div>
  )
}
