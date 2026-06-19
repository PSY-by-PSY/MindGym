// ─────────────────────────────────────────────────────────────────────────
// 連續打卡天數（streak）— 單一計算來源
//
// 過去 profile / gratitude 多處各自手刻同一套「從今天往回數」的迴圈，容易不一致。
// 這裡集中成一個純函式 streakFromDates() 與一個查 DB 的 computeStreak()，
// 其他地方一律呼叫這兩個，避免再出現第二套邏輯。
// ─────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'

/** 某個 Date 的本地 YYYY-MM-DD（與 gratitude_entries.entry_date 同語意）。 */
function isoLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 從一組「有打卡的日期字串」算出目前的連續天數。
 * 規則：從今天往回數；今天若還沒打卡，從昨天起算（不歸零），
 * 只要中間有一天斷掉就停止。
 */
export function streakFromDates(dates: Iterable<string>): number {
  const set = new Set<string>()
  for (const d of dates) set.add(String(d).slice(0, 10))

  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if (!set.has(isoLocalDate(cursor))) cursor.setDate(cursor.getDate() - 1)

  let count = 0
  while (set.has(isoLocalDate(cursor))) {
    count++
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
}

/** 查使用者所有 gratitude_entries 的日期，算出目前連續天數。 */
export async function computeStreak(userId: string): Promise<number> {
  const { data } = await supabase
    .from('gratitude_entries')
    .select('entry_date')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false })
  return streakFromDates((data ?? []).map((r) => String(r.entry_date)))
}

/**
 * 跨練習的「共用打卡天數」：感恩日記 + 過程目標覺察（晚間回顧／早晨啟動）。
 * 任一練習完成都算當天有打卡，符合「打卡 streak 共用同一個計數器」的設計。
 * 任何一張表查詢失敗都不致整個歸零（容錯：用拿得到的日期計算）。
 */
export async function computeUnifiedStreak(userId: string): Promise<number> {
  const [gratitude, focus, morning] = await Promise.all([
    supabase.from('gratitude_entries').select('entry_date').eq('user_id', userId),
    supabase.from('focus_logs').select('log_date').eq('user_id', userId),
    supabase.from('morning_logs').select('log_date').eq('user_id', userId),
  ])
  const dates: string[] = [
    ...(gratitude.data ?? []).map((r) => String(r.entry_date)),
    ...(focus.data ?? []).map((r) => String(r.log_date)),
    ...(morning.data ?? []).map((r) => String(r.log_date)),
  ]
  return streakFromDates(dates)
}
