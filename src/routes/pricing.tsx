import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CheckoutModal } from '../components/billing/CheckoutModal'
import { LanguageSwitcherCompact } from '../components/LanguageSwitcher'
import { PublicFooter } from '../components/legal/PublicFooter'
import { fetchPricing, formatAmount, type PricingPlan } from '../lib/pricing'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export const Route = createFileRoute('/pricing')({
  component: PricingPage,
})

const PERIOD_LABEL: Record<PricingPlan['period'], string> = {
  month: '月',
  year: '年',
}

function PricingPage() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<PricingPlan[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null)
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setIsLoggedIn(!!data.session)
    })

    void fetchPricing().then((bundle) => {
      if (cancelled) return
      setPlans(bundle?.plans ?? null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSelectPlan = (plan: PricingPlan) => {
    if (!isLoggedIn && !import.meta.env.DEV) {
      void navigate({ to: '/login', search: { redirect: '/pricing' } })
      return
    }
    setSelectedPlan(plan)
    setCheckoutModalOpen(true)
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-6 py-10 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-[calc(env(safe-area-inset-bottom)+3rem)]">
        <div className="flex items-center justify-between">
          <Link to="/login" className="text-sm font-bold text-muted-foreground transition hover:text-foreground">← 返回</Link>
          <LanguageSwitcherCompact />
        </div>

        <header className="mt-10 text-center">
          <p className="text-sm font-bold text-primary">PSY by PSY 心理健身房</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground">讓心理健康，像上健身房一樣日常</h1>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-foreground/75">
            以正向心理學為基礎的自我照顧練習工具。核心練習永遠免費；Pro 方案提供進階練習、完整社群與個人化 AI 週報。
          </p>
        </header>

        <section className="mt-10">
          <h2 className="text-xl font-extrabold text-foreground">MindGym 提供什麼</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ['每日練習', '感恩日記、過程目標覺察、自我慈悲、WOOP 目標實踐等。'],
              ['心理健康追蹤', '透過 PERMA 幸福感檢測，看見正向情緒、投入、關係、意義與成就的變化。'],
              ['AI 週報', '依一週練習紀錄產生個人化回顧與建議。'],
              ['社群', '分享打卡與心得，可選擇實名、匿名或僅自己可見。'],
            ].map(([title, body]) => (
              <article key={title} className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-extrabold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/75">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-extrabold text-foreground">方案與價格</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">價格由系統公開方案設定提供。選取方案後將開啟結帳確認與條款同意畫面。</p>
          {loading ? (
            <p className="mt-4 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">正在載入方案資料…</p>
          ) : plans === null ? (
            <p className="mt-4 rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
              {isSupabaseConfigured
                ? '目前無法載入方案資料，請稍後再試。'
                : '目前是本機公開頁預覽，尚未設定 Supabase，因此不顯示真實方案價格。設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY 後重新啟動即可載入。'}
            </p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {plans.map((plan) => (
                <article key={plan.planCode} className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div>
                    <h3 className="font-extrabold text-foreground text-lg">Pro {PERIOD_LABEL[plan.period]}繳</h3>
                    <p className="mt-3 text-3xl font-extrabold text-foreground">
                      {formatAmount(plan.amountCents, plan.currency)}
                      <span className="text-base font-semibold text-muted-foreground">／{PERIOD_LABEL[plan.period]}</span>
                    </p>
                    <p className="mt-3 text-xs leading-relaxed text-foreground/75">
                      解鎖所有進階練習模組、無限制社群發文與專屬 AI 週報分析。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectPlan(plan)}
                    className="mt-5 w-full rounded-xl bg-primary py-2.5 px-4 text-center text-sm font-extrabold text-primary-foreground transition hover:bg-primary/90"
                  >
                    {isLoggedIn || import.meta.env.DEV ? `選擇 ${PERIOD_LABEL[plan.period]}繳方案` : '登入以訂閱方案'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10 rounded-2xl border border-border bg-muted/50 p-5">
          <h2 className="font-extrabold text-foreground">這不是醫療服務</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/75">本服務是自我照顧練習工具，不能取代心理諮商或精神醫療。若你正處於危急狀況，請立即撥打 1925 安心專線或 119。</p>
        </section>

        <PublicFooter />

        <CheckoutModal
          isOpen={checkoutModalOpen}
          onClose={() => setCheckoutModalOpen(false)}
          plan={selectedPlan}
        />
      </main>
    </div>
  )
}

