// 社群安全（檢舉 / 封鎖）的共用資料流。
//
// App Store 審查指南 1.2（UGC）要求 App 提供「檢舉冒犯內容」與「封鎖騷擾使用者」。
// 對應兩張表：reports（檢舉）、blocks（封鎖），SQL 在 supabase/community_safety.sql，
// 需手動在 Supabase SQL Editor 執行。沿用最新慣例：前端 anon key + RLS 直接寫入
// （auth.uid() = reporter_id / blocker_id）。
//
// 降級：若 migration 尚未執行（表不存在），讀取一律回空、寫入回 false 並 console.warn，
// 確保社群頁照常載入、不會 crash（比照 communityPost.ts 的 fallback 風格）。
import { supabase } from './supabase'

// 檢舉原因（多選）。code 寫進 reports.reasons，label 顯示於 UI。
export const REPORT_REASONS: { code: string; label: string }[] = [
  { code: 'harassment',    label: '騷擾或霸凌' },
  { code: 'spam',          label: '垃圾訊息或廣告' },
  { code: 'inappropriate', label: '不當或冒犯內容' },
  { code: 'self_harm',     label: '自我傷害疑慮' },
  { code: 'other',         label: '其他' },
]

export type ReportTargetType = 'entry' | 'comment'

export interface SubmitReportArgs {
  reporterId: string
  targetType: ReportTargetType
  entryId?: string | null
  commentId?: string | null
  reportedUserId?: string | null
  reasons: string[]
  note?: string | null
}

/** 送出一則檢舉。成功回 true。 */
export async function submitReport(args: SubmitReportArgs): Promise<boolean> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: args.reporterId,
    target_type: args.targetType,
    entry_id: args.targetType === 'entry' ? args.entryId ?? null : null,
    comment_id: args.targetType === 'comment' ? args.commentId ?? null : null,
    reported_user_id: args.reportedUserId ?? null,
    reasons: args.reasons,
    note: args.note?.trim() ? args.note.trim() : null,
  })
  if (error) {
    console.error('[community report]', error)
    return false
  }
  return true
}

/** 封鎖某使用者。blockedLabel 為封鎖當下畫面上顯示的名稱（給管理清單用）。成功回 true。 */
export async function blockUser(
  blockerId: string,
  blockedId: string,
  blockedLabel: string | null,
): Promise<boolean> {
  const { error } = await supabase
    .from('blocks')
    .upsert(
      { blocker_id: blockerId, blocked_id: blockedId, blocked_label: blockedLabel },
      { onConflict: 'blocker_id,blocked_id' },
    )
  if (error) {
    console.error('[community block]', error)
    return false
  }
  return true
}

/** 解除封鎖。成功回 true。 */
export async function unblockUser(blockerId: string, blockedId: string): Promise<boolean> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
  if (error) {
    console.error('[community unblock]', error)
    return false
  }
  return true
}

/** 取得目前使用者封鎖的 user_id 集合（用於過濾貼文/留言）。錯誤或未登入回空 Set。 */
export async function fetchBlockedIds(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set()
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', userId)
  if (error) {
    // 表尚未建立（migration 未跑）等情況：回空集合，社群頁照常運作。
    console.warn('[community blocks] 讀取封鎖名單失敗（請確認已執行 community_safety.sql）', error.message)
    return new Set()
  }
  return new Set((data ?? []).map((r) => r.blocked_id as string))
}

export interface BlockedListItem {
  blocked_id: string
  blocked_label: string | null
  created_at: string
}

/** 取得封鎖名單（給個人檔案頁管理）。錯誤或未登入回空陣列。 */
export async function fetchBlockedList(userId: string | null): Promise<BlockedListItem[]> {
  if (!userId) return []
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id, blocked_label, created_at')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('[community blocks] 讀取封鎖名單失敗（請確認已執行 community_safety.sql）', error.message)
    return []
  }
  return (data ?? []) as BlockedListItem[]
}
