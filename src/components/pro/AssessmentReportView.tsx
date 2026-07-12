// 專業夥伴版質性測驗報告視圖：量化側寫（分數/信心度/原文證據）＋需要人工確認區＋反思方向。
// review_before_send=true 且 pending_release 時，底部提供個案版預覽＋「確認並發送」動作。
import { useState } from 'react'
import { track } from '../../lib/analytics'
import { useLanguage } from '../../lib/i18n/context'
import { releaseAssessmentResult, type AssessmentResultRow } from '../../lib/proModules'

const CONFIDENCE_META: Record<string, { label: string; cls: string }> = {
  high: { label: '高信心', cls: 'bg-tile-mint text-[#71744F]' },
  medium: { label: '中信心', cls: 'bg-tile-peach text-[#8a6320]' },
  low: { label: '低信心', cls: 'bg-muted text-muted-foreground' },
}

export function AssessmentReportView({ result, onReleased }: { result: AssessmentResultRow; onReleased: () => void }) {
  const { t } = useLanguage()
  const [busy, setBusy] = useState(false)

  const report = result.practitioner_report
  const canRelease = result.status === 'pending_release' && !report?.error

  const release = async () => {
    setBusy(true)
    const ok = await releaseAssessmentResult(result.id)
    setBusy(false)
    if (ok) {
      track('pro_assessment_report_released', { result_id: result.id })
      onReleased()
    }
  }

  if (!report || report.error) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        {t('報告生成失敗，請聯繫平台。')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 量化側寫區 */}
      <div className="rounded-2xl border-2 border-[#71744F]/30 bg-card p-4 shadow-soft">
        <p className="mb-3 text-sm font-black text-foreground">{t('量化側寫')}</p>
        <div className="flex flex-col gap-3">
          {report.dimensions.map((d) => {
            const conf = CONFIDENCE_META[d.confidence] ?? CONFIDENCE_META.medium
            const pct = Math.max(0, Math.min(100, (d.estimated_score / (d.max_score || 10)) * 100))
            return (
              <div key={d.key}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-foreground">{d.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${conf.cls}`}>{t(conf.label)}</span>
                  <span className="ml-auto text-sm font-bold text-foreground/70">
                    {d.estimated_score.toFixed(1)} / {d.max_score}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                {d.evidence.length > 0 && (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {d.evidence.map((e, i) => (
                      <p key={i} className="border-l-2 border-border pl-2.5 text-xs italic leading-relaxed text-foreground/70">
                        {e}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">{report.disclaimer}</p>
      </div>

      {/* 需要人工確認區 */}
      {report.needs_confirmation.length > 0 && (
        <div className="rounded-2xl border-2 border-rust/40 bg-tile-pink p-4">
          <p className="mb-2 text-sm font-black text-rust">
            {t('需要人工確認')} <span className="font-normal text-foreground/60">（{t('個案版不顯示此區塊')}）</span>
          </p>
          <ul className="flex flex-col gap-1.5">
            {report.needs_confirmation.map((n, i) => (
              <li key={i} className="text-sm leading-relaxed text-foreground/85">
                ・{n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 反思與方向區 */}
      {report.reflection_prompts.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="mb-2 text-sm font-black text-foreground">{t('反思與方向')}</p>
          <ol className="flex flex-col gap-1.5">
            {report.reflection_prompts.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/85">
                <span className="shrink-0 font-bold text-primary">{i + 1}.</span>
                {p}
              </li>
            ))}
          </ol>
        </div>
      )}

      {canRelease && result.client_report && (
        <div className="rounded-2xl border border-dashed border-border p-4">
          <p className="mb-2 text-sm font-black text-foreground">{t('個案版預覽')}</p>
          <div className="rounded-xl bg-gradient-primary p-4 text-center">
            <p className="text-2xl">{result.client_report.hero.emoji}</p>
            <p className="mt-1 text-sm font-black text-primary-foreground">{result.client_report.hero.title}</p>
          </div>
          <button
            onClick={release}
            disabled={busy}
            className="mt-3 w-full rounded-full bg-gradient-primary py-3 text-sm font-extrabold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? t('發送中…') : t('確認並發送個案版')}
          </button>
        </div>
      )}
      {result.status === 'released' && (
        <p className="text-center text-xs font-bold text-[#71744F]">{t('個案版已發送')}</p>
      )}
    </div>
  )
}
