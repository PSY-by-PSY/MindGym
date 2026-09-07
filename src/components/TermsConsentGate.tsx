// ─────────────────────────────────────────────────────────────────────────
// 登入後的條款同意畫面（App Store 審查指南 1.2）
//
// 為什麼是「登入後」才出現：
//   登入頁是在登入「之前」，那時還沒有帳號，系統無從記住「這個人同意過了」。
//   把同意紀錄寫在 profiles 上，就能做到「只問一次」——這也是產品方要的體驗
//   （參考同類 App：登入後跳出政策全文 + 「我已了解」）。
//
// ⚠️ 登入頁的勾選框「不能」因此拿掉。Apple 的退件信原文要求錄影展示
//    「The EULA or terms of use agreement presented to users **before
//    registering or logging in**」——同意必須發生在登入前。這一頁是額外的
//    第二道（也是使用者真正會讀到內容的那一道），不是替代品。
//
// 只在下列情況出現：
//   1. 已登入
//   2. profiles.terms_accepted_at 是空的，或同意的版本比 TERMS_VERSION 舊
// 出現時會蓋住整個 App，不給關閉——這是同意閘門，不是提示。
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { TERMS_VERSION } from '../lib/termsVersion'
import { useLanguage } from '../lib/i18n/context'
import { LanguageSwitcherCompact } from './LanguageSwitcher'
import { TermsBody } from './legal/TermsBody'
import { PrivacyBody } from './legal/PrivacyBody'

type Tab = 'terms' | 'privacy'

export function TermsConsentGate({ session }: { session: Session }) {
  const { t } = useLanguage()
  // null = 還在查，true = 需要同意，false = 已同意過（不顯示）
  const [needsConsent, setNeedsConsent] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('terms')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const userId = session.user.id

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('terms_accepted_at, terms_accepted_version')
        .eq('id', userId)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        // 查不到就不要擋人——寧可少問一次，也不要因為網路抖動把所有人鎖在門外。
        // 登入頁的勾選框仍然是 Apple 要看的那一道，這裡漏掉不影響審查。
        console.error('[terms] 讀取同意紀錄失敗', error)
        setNeedsConsent(false)
        return
      }
      const accepted = data?.terms_accepted_at
      const version = data?.terms_accepted_version
      setNeedsConsent(!accepted || version !== TERMS_VERSION)
    })()
    return () => { cancelled = true }
  }, [userId])

  const accept = async () => {
    setSaving(true)
    setError(null)
    // upsert：profiles 這一列是「用到才建立」的，新使用者可能還沒有。
    const { error } = await supabase.from('profiles').upsert(
      {
        id: userId,
        terms_accepted_at: new Date().toISOString(),
        terms_accepted_version: TERMS_VERSION,
      },
      { onConflict: 'id' },
    )
    setSaving(false)
    if (error) {
      console.error('[terms] 寫入同意紀錄失敗', error)
      setError(t('儲存失敗，請檢查網路後再試一次。'))
      return
    }
    setNeedsConsent(false)
  }

  if (needsConsent !== true) return null

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* 標頭 */}
      <div className="shrink-0 border-b border-border px-5 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-black text-foreground">
            {tab === 'terms' ? t('使用者條款') : t('隱私政策')}
          </h1>
          <LanguageSwitcherCompact />
        </div>
        {/* 兩份文件切換：使用者要能兩份都讀到，才算真的「已了解」 */}
        <div className="flex gap-2">
          {([['terms', '使用者條款'], ['privacy', '隱私政策']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-full px-4 py-1.5 text-xs font-extrabold transition ${
                tab === key
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </div>

      {/* 內文（可捲動） */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto w-full max-w-2xl">
          {tab === 'terms' ? <TermsBody /> : <PrivacyBody />}
        </div>
      </div>

      {/* 底部：同意按鈕。刻意沒有「拒絕」或關閉鈕——不同意就不能使用本服務，
          使用者若不同意，可以直接登出（側邊欄）或關掉 App。 */}
      <div className="shrink-0 border-t border-border px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
        <div className="mx-auto w-full max-w-2xl">
          {error && <p className="mb-2 text-center text-xs font-semibold text-red-500">{error}</p>}
          <button
            onClick={() => void accept()}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? t('儲存中…') : t('我已了解')}
            {!saving && (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            )}
          </button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
            {t('點選「我已了解」即表示你已閱讀並同意使用者條款與隱私政策。')}
          </p>
        </div>
      </div>
    </div>
  )
}
