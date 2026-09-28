import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'
import { PublicFooter } from '../components/legal/PublicFooter'
import {
  cancelSubscription,
  fetchBillingOverview,
  type BillingOverview,
} from '../lib/billing'
import { formatAmount } from '../lib/pricing'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/settings/billing')({
  component: SettingsBillingPage,
})

function SettingsBillingPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<BillingOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 取消訂閱相關 State
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState<string | null>(null)

  const loadBillingData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        void navigate({ to: '/login', search: { redirect: '/settings/billing' } })
        return
      }

      const data = await fetchBillingOverview()
      setOverview(data)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入帳務資訊失敗')
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBillingData()
  }, [])

  const handleConfirmCancel = async () => {
    setCancelling(true)
    setCancelError(null)

    try {
      const res = await cancelSubscription()
      setCancelling(false)
      setShowCancelModal(false)

      const formattedEnd = res.currentPeriodEndsAt
        ? new Date(res.currentPeriodEndsAt).toLocaleDateString('zh-TW')
        : '當期結束日'
      setCancelSuccessMsg(`已成功取消自動續訂。您的 Pro 權益將完整保留至 ${formattedEnd} 止。`)

      // 重新整理資料
      void loadBillingData()
    } catch (err) {
      setCancelling(false)
      setCancelError(err instanceof Error ? err.message : '取消自動續訂失敗，請稍後再試')
    }
  }

  const renderStatusBadge = () => {
    if (!overview) return null

    if (overview.isPro) {
      if (overview.subscriptionStatus === 'active') {
        return (
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-extrabold text-emerald-600 border border-emerald-500/20">
            ● 自動續約中
          </span>
        )
      }
      if (overview.subscriptionStatus === 'cancel_scheduled') {
        return (
          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-3 py-1 text-xs font-extrabold text-amber-700 border border-amber-500/20">
            ● 已取消續訂（權益保留中）
          </span>
        )
      }
      return (
        <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-extrabold text-primary border border-primary/20">
          Pro 會員
        </span>
      )
    }

    return (
      <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
        免費方案
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-6 py-10 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-[calc(env(safe-area-inset-bottom)+3rem)]">
        <div className="flex items-center justify-between">
          <Link to="/app/profile" className="text-sm font-bold text-muted-foreground transition hover:text-foreground">
            ← 返回個人設定
          </Link>
          <LanguageSwitcherCompact />
        </div>

        <header className="mt-8">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">會員與帳務管理</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">訂閱與扣款管理</h1>
          <p className="mt-2 text-sm text-foreground/75 leading-relaxed">
            在此查看您的訂閱狀態、扣款週期、歷史繳費清單或隨時變更自動續約設定。
          </p>
        </header>

        {cancelSuccessMsg && (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-700">
            {cancelSuccessMsg}
          </div>
        )}

        {loading ? (
          <div className="mt-10 rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            正在載入帳務與訂閱資訊…
          </div>
        ) : error ? (
          <div className="mt-10 rounded-3xl border border-destructive/30 bg-destructive/10 p-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : overview ? (
          <div className="mt-8 space-y-6">
            {/* 會員方案資訊卡片 */}
            <div className="rounded-3xl border border-border bg-card p-6 shadow-soft space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
                <div>
                  <h2 className="text-xl font-black text-foreground">
                    {overview.isPro ? 'MindGym Pro 會員' : 'MindGym 免費方案'}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {overview.planCode === 'pro_yearly'
                      ? '年繳方案'
                      : overview.planCode === 'pro_monthly'
                      ? '月繳方案'
                      : '標準免費層'}
                  </p>
                </div>
                {renderStatusBadge()}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">權益到期時間</span>
                  <span className="font-bold text-foreground">
                    {overview.currentPeriodEndsAt
                      ? new Date(overview.currentPeriodEndsAt).toLocaleDateString('zh-TW', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : '無限制（免費使用中）'}
                  </span>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground block">下次扣款日期</span>
                  <span className="font-bold text-foreground">
                    {overview.subscriptionStatus === 'active' && overview.currentPeriodEndsAt
                      ? new Date(overview.currentPeriodEndsAt).toLocaleDateString('zh-TW', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : '無排定扣款'}
                  </span>
                </div>
              </div>

              {overview.subscriptionStatus === 'cancel_scheduled' && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950">
                  <p className="font-bold">提醒：自動續約已關閉</p>
                  <p className="mt-0.5">
                    您的 Pro 權益將保留至 {new Date(overview.currentPeriodEndsAt!).toLocaleDateString('zh-TW')} 止。期滿後系統不會自動扣款，並將轉為免費方案。
                  </p>
                </div>
              )}

              {/* 訂閱操作按鈕 (C4.3) */}
              <div className="pt-2 flex flex-wrap gap-3">
                {overview.subscriptionStatus === 'active' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelError(null)
                      setShowCancelModal(true)
                    }}
                    className="rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-2.5 text-sm font-bold text-destructive transition hover:bg-destructive/10"
                  >
                    取消自動續訂
                  </button>
                ) : !overview.isPro ? (
                  <Link
                    to="/pricing"
                    className="rounded-2xl bg-primary px-6 py-2.5 text-sm font-extrabold text-primary-foreground shadow-soft transition hover:bg-primary/90"
                  >
                    升級 Pro 方案
                  </Link>
                ) : null}
              </div>
            </div>

            {/* 歷史繳費清單 */}
            <div className="rounded-3xl border border-border bg-card p-6 shadow-soft space-y-4">
              <h3 className="text-lg font-extrabold text-foreground">繳費紀錄</h3>
              {overview.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">尚無付款或訂單紀錄。</p>
              ) : (
                <div className="divide-y divide-border/60 overflow-hidden">
                  {overview.orders.map((order) => (
                    <div key={order.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-foreground truncate">{order.id}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {new Date(order.createdAt).toLocaleDateString('zh-TW')} • {order.kind === 'recurring' ? '定期續扣' : '初始訂閱'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-extrabold text-foreground">
                          {formatAmount(order.amountCents, order.currency)}
                        </p>
                        <span
                          className={`text-[11px] font-bold ${
                            order.status === 'paid'
                              ? 'text-emerald-600'
                              : order.status === 'refunded'
                              ? 'text-amber-600'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {order.status === 'paid' ? '已付款' : order.status === 'refunded' ? '已退款' : order.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 政策與客服說明 */}
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground space-y-1">
              <p>• 7 天退款保障：如有重複扣款或欲辦理退款，請參閱 <Link to="/refund" className="text-primary underline">退款政策</Link>。</p>
              <p>• 如有帳務疑問或需要協助，請隨時聯繫 <Link to="/support" className="text-primary underline">客服中心</Link>。</p>
            </div>
          </div>
        ) : null}

        <PublicFooter />

        {/* 取消自動續訂確認 Modal (C4.3) */}
        {showCancelModal && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => !cancelling && setShowCancelModal(false)}
          >
            <div
              className="relative w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 text-2xl font-bold">
                !
              </div>

              <div>
                <h3 className="text-xl font-extrabold text-foreground">確定要取消自動續訂嗎？</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                  取消後，您目前的 Pro 權益仍將完整保留至{' '}
                  <span className="font-bold text-foreground">
                    {overview?.currentPeriodEndsAt
                      ? new Date(overview.currentPeriodEndsAt).toLocaleDateString('zh-TW')
                      : '當期結束日'}
                  </span>
                  ，期滿後將自動停止扣款，不再產生續約費用。
                </p>
              </div>

              {cancelError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  {cancelError}
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void handleConfirmCancel()}
                  disabled={cancelling}
                  className="w-full rounded-2xl bg-destructive py-3 text-sm font-extrabold text-destructive-foreground shadow-soft transition hover:bg-destructive/90 disabled:opacity-50"
                >
                  {cancelling ? '正在取消中…' : '確認取消自動續訂'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                  className="w-full rounded-2xl border border-border py-2.5 text-sm font-bold text-foreground transition hover:bg-muted"
                >
                  保持訂閱
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
