// 首頁「專業模組區」：載入 get_my_modules()、顯示已解鎖模組卡片、底部邀請碼輸入列。
// 輸入邀請碼 → previewInviteCode → 同意視窗 → redeemInviteCode → 進入模組播放器。
// 視覺仿 WorkshopSection（見 app.home.tsx）。
import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { track } from '../../lib/analytics'
import {
  getMyModules,
  previewInviteCode,
  redeemInviteCode,
  isModuleUpdated,
  type ProModuleInfo,
  type ProModulePreview,
} from '../../lib/proModules'
import { ConsentModal } from './ConsentModal'
import { useLanguage } from '../../lib/i18n/context'

const TEASER_RATING_KEY = 'proModuleTeaserRating'

export function ProModuleSection() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [modules, setModules] = useState<ProModuleInfo[] | null>(null)
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ProModulePreview | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [teaserRating, setTeaserRating] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem(TEASER_RATING_KEY))
    return saved >= 1 && saved <= 5 ? saved : null
  })

  const handleTeaserRate = (value: number) => {
    setTeaserRating(value)
    localStorage.setItem(TEASER_RATING_KEY, String(value))
    track('pro_module_teaser_rated', { rating: value })
  }

  useEffect(() => {
    let cancelled = false
    getMyModules().then((list) => {
      if (!cancelled) setModules(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleUnlock = async () => {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed || checking) return
    setChecking(true)
    setCodeError(null)
    const p = await previewInviteCode(trimmed)
    setChecking(false)
    if (!p) {
      setCodeError(t('邀請碼無效，請確認後再試一次。'))
      return
    }
    setPreview(p)
  }

  const handleConsent = async (sharePerma: boolean) => {
    if (!preview || redeeming) return
    setRedeeming(true)
    const result = await redeemInviteCode(code, sharePerma)
    setRedeeming(false)
    if (!result) {
      setCodeError(t('解鎖失敗，請稍後再試。'))
      setPreview(null)
      return
    }
    track('pro_module_redeemed', { module_id: result.module_id })
    setPreview(null)
    setCode('')
    void navigate({ to: '/app/pro-module/$moduleId', params: { moduleId: result.module_id } })
  }

  return (
    <section>
      <div className="mb-3.5 mt-7">
        <h2 className="text-[23px] font-black tracking-[0.03em] text-foreground">{t('專業模組區')}</h2>
        <p className="font-en text-sm font-medium tracking-[0.02em] text-muted-foreground">Professional Modules</p>
      </div>

      <div className="rounded-[22px] bg-[#B9B078]/45 p-4">
        {modules === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('讀取中…')}</p>
        ) : modules.length === 0 ? (
          <div className="px-1 py-1">
            <p className="text-[14px] font-bold leading-relaxed text-foreground">
              {t('職人模組・敬請期待')}
            </p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-foreground-soft">
              {t('PSY by PSY 正在與專業助人工作者合作，打造由他們親自設計、為你量身安排的練習模組。未來會陸續邀請不同領域的夥伴加入，帶來更多元的陪伴內容，敬請期待。')}
            </p>
            <div className="mt-4 border-t border-foreground/10 pt-3.5">
              <p className="text-[13px] font-bold text-foreground-soft">
                {t('你對於此功能的期待程度')}
              </p>
              <div className="mt-2 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleTeaserRate(value)}
                    aria-label={t('{n} 顆星', { n: value })}
                    className="p-0.5 transition active:scale-90"
                  >
                    <StarIcon filled={teaserRating != null && value <= teaserRating} />
                  </button>
                ))}
              </div>
              {teaserRating != null && (
                <p className="mt-1.5 text-[12px] font-medium text-foreground-soft/80">
                  {t('謝謝你的回饋！')}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {modules.map((m) => (
              <ModuleCard key={m.module_id} m={m} />
            ))}
          </div>
        )}

        {/* 邀請碼輸入列 */}
        <div className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              if (codeError) setCodeError(null)
            }}
            placeholder={t('輸入邀請碼')}
            aria-label={t('邀請碼')}
            className="min-w-0 flex-1 rounded-2xl border border-border bg-cream px-4 py-3 text-[15px] font-bold tracking-[0.12em] text-foreground shadow-soft outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={handleUnlock}
            disabled={checking || !code.trim()}
            className="shrink-0 rounded-2xl bg-foreground px-5 py-3 text-[15px] font-extrabold text-cream shadow-soft transition active:scale-[0.98] disabled:opacity-50"
          >
            {checking ? '…' : t('解鎖')}
          </button>
        </div>
        {codeError && <p className="mt-2 px-1 text-sm font-bold text-rust">{codeError}</p>}
      </div>

      {preview && (
        <ConsentModal
          preview={preview}
          busy={redeeming}
          onConsent={handleConsent}
          onClose={() => {
            if (!redeeming) setPreview(null)
          }}
        />
      )}
    </section>
  )
}

function ModuleCard({ m }: { m: ProModuleInfo }) {
  const { t } = useLanguage()
  const updated = isModuleUpdated(m.module_id, m.published_at)
  return (
    <Link
      to="/app/pro-module/$moduleId"
      params={{ moduleId: m.module_id }}
      onClick={() => track('module_opened', { module: m.title })}
      className="flex items-center gap-3.5 rounded-2xl bg-cream px-4 py-3.5 shadow-[0_2px_5px_rgba(0,0,0,0.08)] transition active:scale-[0.98]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#B9B078]/35 text-foreground">
        <ModuleIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <b className="truncate text-[17px] font-black tracking-[0.02em] text-foreground">{m.title}</b>
          {updated && (
            <span className="shrink-0 rounded-full bg-[#d7ebd9] px-2 py-0.5 text-[10px] font-extrabold text-[#3f6b46]">
              {t('已更新')}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {m.practitioner_name || t('專業夥伴')}
          {m.est_minutes != null ? ` · ${t('約 {n} 分鐘', { n: m.est_minutes })}` : ''}
        </span>
      </span>
      <ArrowCircle />
    </Link>
  )
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={filled ? 'h-7 w-7 text-[#B9862E]' : 'h-7 w-7 text-foreground/25'}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2.8l2.85 5.78 6.37.93-4.61 4.5 1.09 6.35L12 17.3l-5.7 3.06 1.09-6.35-4.61-4.5 6.37-.93z" />
    </svg>
  )
}

function ModuleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6a2 2 0 0 1 2-2h9l5 5v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M14 4v5h5M8 13h8M8 17h5" />
    </svg>
  )
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={filled ? 'h-7 w-7 text-[#B9862E]' : 'h-7 w-7 text-foreground/25'}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2.8l2.85 5.78 6.37.93-4.61 4.5 1.09 6.35L12 17.3l-5.7 3.06 1.09-6.35-4.61-4.5 6.37-.93z" />
    </svg>
  )
}

function ArrowCircle() {
  return (
    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 border-foreground">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </span>
  )
}
