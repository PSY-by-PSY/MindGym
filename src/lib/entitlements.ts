// ─────────────────────────────────────────────────────────────────────────
// 權益（entitlements）—— client 端的唯一來源是伺服器
//
// ⚠️ 這個檔案回傳的東西「只能拿來決定畫面怎麼顯示」，不能當成安全邊界。
//    真正的把關在三個地方，全部在伺服器：
//      1. supabase/subscriptions.sql 的 RLS policy（社群貼文讀取權）
//      2. get_my_entitlements() SECURITY DEFINER RPC（對象固定 auth.uid()）
//      3. backend/app.py 的額度檢查（週分析、基線重測，超額回 402）
//    使用者在 devtools 改本機狀態頂多讓自己看到一個按鈕，按下去伺服器照樣擋。
//
// ⚠️ 2026-09-01 起：**全功能對所有登入者開放**，上面那三道把關的判斷式目前都恆真
//    （機制仍在原地，見 supabase/subscriptions.sql 的 is_pro()）。
//    「創始成員」（is_founding_member）降級為純標籤／徽章，不再牽動任何權益。
// ─────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'

export type Tier = 'anonymous' | 'free' | 'pro' | 'pass'

export interface Entitlements {
  tier: Tier
  status: string
  is_pro: boolean
  is_founding_member: boolean
  expires_at: string | null
  weekly_analysis: {
    period: 'week' | 'month'
    period_start: string
    /** true 時 limit／remaining 是 -1，不要拿去顯示或做比較 */
    unlimited: boolean
    limit: number
    used: number
    remaining: number
  }
  community: {
    unlimited: boolean
    unlocked: boolean
    contributed_this_week: boolean
    free_view_limit: number
  }
  baseline_assessment: {
    used: number
    can_retake: boolean
  }
  can_view_trends: boolean
  can_view_growth_comparison: boolean
}

// 拿不到權益時的預設。
//
// ⚠️ 這個常數原本是「保守預設」（一律當免費層、額度視為已用完），因為當時把功能
//    送錯人比擋錯人嚴重。2026-09-01 全功能開放後這個取捨反過來了：現在沒有任何
//    功能需要被鎖，若還退回免費層，只要 RPC 掉一次就會憑空長出一道付費牆給
//    本來就該看到全部內容的人。所以改成「開放」預設。
//    ⚠️ 接金流、恢復付費分層時，這裡必須改回保守預設（rename 成 FREE_FALLBACK）。
export const OPEN_FALLBACK: Entitlements = {
  tier: 'free',
  status: 'active',
  is_pro: true,
  is_founding_member: false,   // 徽章不能靠猜的，查不到就當沒有
  expires_at: null,
  weekly_analysis: { period: 'week', period_start: '', unlimited: true, limit: -1, used: 0, remaining: -1 },
  community: { unlimited: true, unlocked: true, contributed_this_week: false, free_view_limit: 15 },
  baseline_assessment: { used: 0, can_retake: true },
  can_view_trends: true,
  can_view_growth_comparison: true,
}

// 同一次頁面停留內重複問同一份權益很常見（多個元件各自要用），
// 這裡做極短命的快取：避免同一畫面連打好幾次 RPC，但也不會拿到過期太久的狀態。
let cache: { at: number; value: Entitlements } | null = null
const CACHE_MS = 30_000

/** 讀取目前使用者的權益。查詢失敗一律回 OPEN_FALLBACK（不會 throw）。 */
export async function fetchEntitlements(force = false): Promise<Entitlements> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value

  const { data, error } = await supabase.rpc('get_my_entitlements')
  if (error || !data) {
    console.error('[entitlements] 取得權益失敗，退回開放預設', error)
    return OPEN_FALLBACK
  }

  const value = data as Entitlements
  cache = { at: Date.now(), value }
  return value
}

/** 權益可能改變時（生成報告、發文、登出）呼叫，讓下次讀取重新問伺服器。 */
export function invalidateEntitlements(): void {
  cache = null
}
