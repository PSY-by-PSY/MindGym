// ─────────────────────────────────────────────────────────────────────────
// 「完成任一健心模組後邀請加入創始成員」
//
// ⚠️ 2026-09-01 起改為「**每次完成練習都邀請一次**」（產品決策）。
//    在此之前是用 profiles.founding_invite_shown_at 當搶占鎖，一個使用者一輩子
//    只跳一次；現在功能全開、創始成員只剩標籤，這個視窗變成純粹的邀請，
//    所以每次打卡完成都會出現。
//    （founding_invite_shown_at 欄位刻意保留不刪，之後若要改回節流可以直接用。）
//
//    唯一的例外是「已經是創始成員的人」——對他們再邀請一次沒有意義。
// ─────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'
import { OPEN_FALLBACK, fetchEntitlements } from './entitlements'

/** 該不該顯示創始成員邀請視窗。已經是創始成員、或未登入 → false，其餘 → true。 */
export async function shouldShowFoundingInvite(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user.id) return false

  const ent = await fetchEntitlements()
  // 查詢失敗時回傳的是 OPEN_FALLBACK 這個常數本身，它的 is_founding_member
  // 只是預設值，不能拿來當「不是創始成員」的證據——寧可這次不打擾。
  if (ent === OPEN_FALLBACK) return false
  return !ent.is_founding_member
}
