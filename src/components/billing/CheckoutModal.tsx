import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { createCheckoutSession, submitPayuniForm } from '../../lib/billing'
import { formatAmount, type PricingPlan } from '../../lib/pricing'

interface CheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  plan: PricingPlan | null
}

const PERIOD_TEXT: Record<PricingPlan['period'], string> = {
  month: '月',
  year: '年',
}

export function CheckoutModal({ isOpen, onClose, plan }: CheckoutModalProps) {
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [agreedRecurring, setAgreedRecurring] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen || !plan) return null

  const handleCheckout = async () => {
    if (!agreedTerms || !agreedRecurring || loading) return

    setLoading(true)
    setErrorMessage(null)

    try {
      const res = await createCheckoutSession({
        planCode: plan.planCode,
        termsVersion: '2026-09-28',
        recurringConsent: agreedRecurring,
        recurringConsentVersion: '2026-09-28',
      })

      if (res.formAction && res.formFields) {
        // C3.4 隱藏 DOM 表單自動 .submit() 導向 PAYUNi UPP
        submitPayuniForm(res.formAction, res.formFields)
      } else if (res.redirectUrl) {
        window.location.href = res.redirectUrl
      } else {
        setErrorMessage('建單成功，但未取得付款導轉目標。請稍後再試。')
        setLoading(false)
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '建立結帳訂單發生未知錯誤')
      setLoading(false)
    }
  }

  const isButtonDisabled = !agreedTerms || !agreedRecurring || loading

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-6 pb-4">
          <div>
            <span className="text-xs font-bold tracking-wider text-primary uppercase">結帳確認</span>
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
              Pro {PERIOD_TEXT[plan.period]}繳訂閱
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label="關閉"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[calc(85vh-120px)] overflow-y-auto p-6 space-y-6">
          {/* 訂單金額摘要 */}
          <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-foreground/80">當期扣款金額</span>
              <span className="text-2xl font-black text-foreground">
                {formatAmount(plan.amountCents, plan.currency)}
                <span className="text-xs font-normal text-muted-foreground"> ／{PERIOD_TEXT[plan.period]}</span>
              </span>
            </div>
            <div className="border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground space-y-1">
              <p>• 計費週期：每{PERIOD_TEXT[plan.period]}自動續訂扣款直至主動取消。</p>
              <p>• 7 天鑑賞期：可於付款後 7 天內聯繫客服申請全額退款（詳見 <Link to="/refund" className="underline text-primary" target="_blank">退款政策</Link>）。</p>
            </div>
          </div>

          {/* 條款與同意 Checkbox 區塊 */}
          <div className="space-y-4 rounded-2xl border border-border/80 p-4 bg-background">
            {/* C3.1: 服務條款 / 隱私權 / 退款政策同意 Checkbox */}
            <label className="flex items-start space-x-3 cursor-pointer select-none">
              <input
                id="checkout-terms-consent"
                type="checkbox"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                disabled={loading}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-xs leading-relaxed text-foreground/80">
                我已閱讀並同意{' '}
                <Link to="/terms" className="font-bold text-primary underline" target="_blank">
                  服務條款
                </Link>
                、{' '}
                <Link to="/privacy" className="font-bold text-primary underline" target="_blank">
                  隱私權政策
                </Link>{' '}
                與{' '}
                <Link to="/refund" className="font-bold text-primary underline" target="_blank">
                  退款政策
                </Link>
                。
              </span>
            </label>

            {/* C3.2: 獨立信用卡約定自動續扣同意 Checkbox (PAYUNi Token / CreditHash 約定卡授權) */}
            <div className="border-t border-border/50 pt-3 space-y-2">
              <label className="flex items-start space-x-3 cursor-pointer select-none">
                <input
                  id="checkout-recurring-consent"
                  type="checkbox"
                  checked={agreedRecurring}
                  onChange={(e) => setAgreedRecurring(e.target.checked)}
                  disabled={loading}
                  className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-xs leading-relaxed text-foreground/90 font-medium">
                  <strong>【信用卡約定自動續扣同意】</strong>本人同意授權 MindGym 透過「PAYUNi 統一金流」安全保存信用卡約定授權代碼（CreditHash/Token），於每期方案到期時自動扣款，<strong>續期無需重複輸入卡號</strong>。本人得隨時於個人設定中關閉自動續約。
                </span>
              </label>

              {/* 展開式：信用卡約定授權扣款約定細則 (Token / CreditHash 合規說明) */}
              <details className="text-[11px] text-muted-foreground group pl-7">
                <summary className="cursor-pointer font-semibold text-primary/80 hover:text-primary list-none flex items-center justify-between py-1">
                  <span>檢視「信用卡定期約定扣款授權約定說明」</span>
                  <span className="text-xs transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="mt-2 space-y-1.5 rounded-xl bg-muted/40 p-3 leading-relaxed text-foreground/75 border border-border/40">
                  <p><strong>1. 授權目的與方式：</strong>本人同意授權 PSY by PSY 心理健身房委託「統一金流 PAYUNi」於首期刷卡成功時，安全代碼化儲存信用卡授權標記（CreditHash／Token）。本平台完全不留存您的完整信用卡號與 CVC 安全碼。</p>
                  <p><strong>2. 續期扣款免輸卡號：</strong>於每一訂閱週期（{PERIOD_TEXT[plan.period]}）屆滿之日，系統將使用該授權代碼自動向發卡銀行請款 {formatAmount(plan.amountCents, plan.currency)}，續約期間您毋須再次輸入卡號與簡訊驗證。</p>
                  <p><strong>3. 隨時中止約定：</strong>您可於下一期扣款日前隨時至「個人設定 → 訂閱與扣款管理」一鍵點選「取消自動續訂」，系統將即刻停止後續任何自動扣款，您的 Pro 權益將保留至當期期滿為止。</p>
                </div>
              </details>
            </div>
          </div>

          {/* Error Notice */}
          {errorMessage && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive leading-relaxed">
              {errorMessage}
            </div>
          )}

          {/* 付款按鈕 (C3.3 & C3.4) */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleCheckout}
              disabled={isButtonDisabled}
              className="w-full rounded-2xl bg-primary py-3.5 px-4 text-center font-extrabold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {loading ? (
                <span className="flex items-center justify-center space-x-2">
                  <svg className="h-4 w-4 animate-spin text-current" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>正前往 PAYUNi 刷卡頁…</span>
                </span>
              ) : (
                '前往付款 (PAYUNi)'
              )}
            </button>
            <p className="text-center text-[11px] text-muted-foreground">
              點擊將經由 256-bit SSL 安全加密傳輸至 PAYUNi UPP 閘道完成授權
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
