// 同意視窗：輸入邀請碼預覽成功後彈出，載明專業夥伴將看到哪些資料。
// 同意才建立追蹤關係。也用於模組頁「查看同意內容」的唯讀重現（readOnly）。
import { useState } from 'react'
import type { ProModulePreview } from '../../lib/proModules'

function ConsentItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span className="text-[14px] leading-relaxed text-foreground-soft">{children}</span>
    </li>
  )
}

export function ConsentModal({
  preview,
  busy,
  onConsent,
  onClose,
  readOnly,
  sharePermaValue,
}: {
  preview: ProModulePreview
  busy?: boolean
  onConsent?: (sharePerma: boolean) => void
  onClose: () => void
  readOnly?: boolean
  sharePermaValue?: boolean
}) {
  const [sharePerma, setSharePerma] = useState(sharePermaValue ?? false)
  const name = preview.practitioner_name || '你的專業夥伴'

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#1c1714]/40 px-4 pb-6 pt-10 sm:items-center">
      <div className="flex max-h-[88vh] w-full max-w-md animate-slide-up flex-col overflow-hidden rounded-[26px] bg-background shadow-soft">
        <div className="overflow-y-auto px-6 pt-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">專業模組</p>
          <h2 className="mt-1 text-xl font-black leading-snug tracking-[0.02em] text-foreground">{preview.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>專業夥伴：{name}</span>
            {preview.est_minutes != null && <span>約 {preview.est_minutes} 分鐘</span>}
          </div>
          {preview.description?.trim() && (
            <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground-soft">
              {preview.description}
            </p>
          )}

          <div className="mt-5 rounded-2xl bg-cream p-4">
            <p className="mb-2.5 text-sm font-black text-foreground">開始前，請了解：</p>
            <ul className="flex flex-col gap-2.5">
              <ConsentItem>你在此模組的練習紀錄將提供給 {name} 查看。</ConsentItem>
              <ConsentItem>若練習內容出現高風險訊息，系統會同時通知 {name} 並提供你求助資源。</ConsentItem>
              <ConsentItem>
                你可以隨時在模組頁面停止追蹤關係，停止後 {name} 將無法再看到你的任何紀錄。
              </ConsentItem>
            </ul>
          </div>

          <label
            className={`mt-3 flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 ${
              readOnly ? 'opacity-90' : 'cursor-pointer active:scale-[0.99]'
            }`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                sharePerma ? 'border-foreground bg-foreground text-cream' : 'border-border'
              }`}
            >
              {sharePerma && (
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 6" />
                </svg>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-foreground">同時分享我的 PERMA 心理測驗結果</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                讓 {name} 更了解你的整體狀態（選填）。
              </span>
            </span>
            <input
              type="checkbox"
              className="sr-only"
              checked={sharePerma}
              disabled={readOnly}
              onChange={(e) => setSharePerma(e.target.checked)}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2 px-6 pb-6 pt-4">
          {readOnly ? (
            <button
              onClick={onClose}
              className="w-full rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98]"
            >
              關閉
            </button>
          ) : (
            <>
              <button
                onClick={() => onConsent?.(sharePerma)}
                disabled={busy}
                className="w-full rounded-full bg-gradient-primary py-3.5 text-base font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
              >
                {busy ? '處理中…' : '我同意，開始練習'}
              </button>
              <button
                onClick={onClose}
                disabled={busy}
                className="w-full rounded-full py-2.5 text-sm font-bold text-muted-foreground transition active:scale-[0.98] disabled:opacity-60"
              >
                先不要
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
