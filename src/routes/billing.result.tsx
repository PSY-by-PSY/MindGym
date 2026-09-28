import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'
import { PublicFooter } from '../components/legal/PublicFooter'
import { fetchOrderStatus, type OrderStatus } from '../lib/billing'
import { fetchEntitlements, invalidateEntitlements } from '../lib/entitlements'
import { supabase } from '../lib/supabase'

export interface BillingResultSearch {
  order_id?: string
  orderId?: string
}

export const Route = createFileRoute('/billing/result')({
  validateSearch: (search: Record<string, unknown>): BillingResultSearch => ({
    order_id: typeof search.order_id === 'string' ? search.order_id : undefined,
    orderId: typeof search.orderId === 'string' ? search.orderId : undefined,
  }),
  component: BillingResultPage,
})

function BillingResultPage() {
  const search = Route.useSearch() as BillingResultSearch
  const orderId = search.order_id || search.orderId


  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<OrderStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollCount, setPollCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    if (!orderId) {
      setLoading(false)
      setError('缺少訂單編號，無法查詢付款狀態。')
      return
    }

    const checkStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          if (!cancelled) {
            setLoading(false)
            setError('請先登入帳號以查看付款結果。')
          }
          return
        }

        const res = await fetchOrderStatus(orderId)
        if (cancelled) return

        setOrder(res)
        setLoading(false)

        if (res.status === 'paid') {
          // 即時刷新權益快取
          invalidateEntitlements()
          void fetchEntitlements(true)
        } else if (res.status === 'pending' || res.status === 'processing') {
          // 繼續輪詢最多 6 次 (約 12 秒)
          if (pollCount < 6) {
            setTimeout(() => {
              if (!cancelled) setPollCount((prev) => prev + 1)
            }, 2000)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoading(false)
          setError(err instanceof Error ? err.message : '查詢訂單狀態發生錯誤')
        }
      }
    }

    void checkStatus()

    return () => {
      cancelled = true
    }
  }, [orderId, pollCount])

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-6 py-10 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-[calc(env(safe-area-inset-bottom)+3rem)]">
        <div className="flex items-center justify-between">
          <Link to="/pricing" className="text-sm font-bold text-muted-foreground transition hover:text-foreground">
            ← 方案頁面
          </Link>
          <LanguageSwitcherCompact />
        </div>

        <div className="mt-12">
          {loading ? (
            <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-soft">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <svg className="h-7 w-7 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <h1 className="text-2xl font-extrabold text-foreground">確認付款結果中…</h1>
              <p className="mt-2 text-sm text-muted-foreground">正在同步 PAYUNi 金流授權狀態，請稍候。</p>
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-destructive/30 bg-destructive/10 p-8 text-center shadow-soft">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/20 text-destructive text-2xl font-black">
                ✕
              </div>
              <h1 className="text-2xl font-extrabold text-destructive">無法確認付款結果</h1>
              <p className="mt-2 text-sm text-destructive/90">{error}</p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Link
                  to="/pricing"
                  className="rounded-2xl bg-primary px-6 py-3 font-extrabold text-primary-foreground shadow-soft transition hover:bg-primary/90"
                >
                  返回方案頁
                </Link>
                <Link
                  to="/support"
                  className="rounded-2xl border border-border bg-card px-6 py-3 font-bold text-foreground transition hover:bg-muted"
                >
                  聯繫客服
                </Link>
              </div>
            </div>
          ) : order?.status === 'paid' ? (
            <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-soft animate-fade-in">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 text-3xl font-black">
                ✓
              </div>
              <span className="text-xs font-bold tracking-wider text-emerald-600 uppercase">付款成功</span>
              <h1 className="mt-1 text-3xl font-extrabold text-foreground">恭喜升級 MindGym Pro！</h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-foreground/80">
                您的訂閱已成功開通。所有 Pro 進階練習、AI 週報分析與完整社群功能已為您全面解鎖。
              </p>

              <div className="my-6 rounded-2xl border border-border bg-muted/40 p-4 text-left text-xs leading-relaxed text-foreground/80 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">訂單編號：</span>
                  <span className="font-mono font-bold text-foreground">{order.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">付款狀態：</span>
                  <span className="font-extrabold text-emerald-600">已完成付款 (Paid)</span>
                </div>
                {order.paidAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">開通時間：</span>
                    <span>{new Date(order.paidAt).toLocaleString('zh-TW')}</span>
                  </div>
                )}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link
                  to="/app/home"
                  className="rounded-2xl bg-primary px-8 py-3.5 text-center font-extrabold text-primary-foreground shadow-soft transition hover:bg-primary/90"
                >
                  開始 Pro 健心練習
                </Link>
                <Link
                  to="/settings/billing"
                  className="rounded-2xl border border-border bg-card px-6 py-3.5 text-center font-bold text-foreground transition hover:bg-muted"
                >
                  管理訂閱方案
                </Link>
              </div>
            </div>
          ) : order?.status === 'pending' || order?.status === 'processing' ? (
            <div className="rounded-3xl border border-amber-300 bg-amber-50 p-8 text-center shadow-soft">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-200 text-amber-900 text-2xl font-black">
                ⏳
              </div>
              <h1 className="text-2xl font-extrabold text-amber-950">訂單處理中</h1>
              <p className="mt-2 text-sm text-amber-900/90 leading-relaxed">
                我們正在等待銀行與 PAYUNi 閘道完成交易授權回傳。若您剛在刷卡頁完成付款，系統將於數秒內自動為您開通。
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setPollCount((prev) => prev + 1)}
                  className="rounded-2xl bg-amber-600 px-6 py-3 text-sm font-extrabold text-white shadow-soft transition hover:bg-amber-700"
                >
                  重新整理狀態
                </button>
                <Link
                  to="/settings/billing"
                  className="rounded-2xl border border-amber-300 bg-white px-6 py-3 text-sm font-bold text-amber-950 transition hover:bg-amber-100"
                >
                  前往訂閱管理
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-soft">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground text-2xl font-black">
                !
              </div>
              <h1 className="text-2xl font-extrabold text-foreground">付款未完成</h1>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                交易未完成或已被取消，系統未扣取任何款項。您可以重新選取方案進行結帳。
              </p>
              <div className="mt-6 flex justify-center">
                <Link
                  to="/pricing"
                  className="rounded-2xl bg-primary px-8 py-3.5 font-extrabold text-primary-foreground shadow-soft transition hover:bg-primary/90"
                >
                  重新選擇方案
                </Link>
              </div>
            </div>
          )}
        </div>

        <PublicFooter />
      </main>
    </div>
  )
}
