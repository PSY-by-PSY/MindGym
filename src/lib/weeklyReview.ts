// 一週回顧：健心日記底部入口框 ＋ 獨立回顧頁共用的資料查詢。
// 次數、留言、感恩全文、對象分佈、常見詞彙全部前端直查既有資料表（target_1..3／tag_1..3
// 是既有結構化欄位，寫日記當下就由 AI 標好了，這裡純統計不必再呼叫 AI）。
// 只有「常見情緒」需要讀原文判斷，交給後端 /api/reviews/weekly-digest（見 reviews.ts）。
import { supabase } from './supabase'
import { isoLocalDate } from './date'
import { type TargetCode, targetBreakdown } from './gratitudeTargets'

/** 該日期所在週的週日（本地時區），與 reviews.ts 的 mondayOf 搭配使用。 */
export function sundayOf(monday: Date): Date {
  const d = new Date(monday)
  d.setDate(d.getDate() + 6)
  return d
}

export interface WeeklyCounts {
  gratitudeCount: number
  processCount: number
  selfCompassionCount: number
}

export interface WeeklyComment {
  id: string
  entryId: string
  content: string
  createdAt: string
  anonName: string | null
}

export interface WeeklyGratitudeEntry {
  id: string
  entryDate: string
  items: string[]
  targets: TargetCode[]
}

export interface WeeklyReviewData extends WeeklyCounts {
  periodStart: string
  periodEnd: string
  comments: WeeklyComment[]
  gratitudeEntries: WeeklyGratitudeEntry[]
  keywords: { label: string; count: number }[]
  targets: { code: TargetCode; count: number; pct: number }[]
}

/** 感恩次數 + 過程目標次數（本週範圍，date 型別以字串比較）。 */
export async function fetchWeeklyCounts(userId: string, monday: Date): Promise<WeeklyCounts> {
  const start = isoLocalDate(monday)
  const end = isoLocalDate(sundayOf(monday))

  const [gratitudeRes, focusRes, morningRes, selfCompassionRes] = await Promise.all([
    supabase
      .from('gratitude_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('practice_type', 'gratitude')
      .gte('entry_date', start)
      .lte('entry_date', end),
    supabase
      .from('focus_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('log_date', start)
      .lte('log_date', end),
    supabase
      .from('morning_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('log_date', start)
      .lte('log_date', end),
    supabase
      .from('gratitude_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('practice_type', 'self_compassion')
      .gte('entry_date', start)
      .lte('entry_date', end),
  ])

  return {
    gratitudeCount: gratitudeRes.count ?? 0,
    processCount: (focusRes.count ?? 0) + (morningRes.count ?? 0),
    selfCompassionCount: selfCompassionRes.count ?? 0,
  }
}

/** 本週感恩日記的常提到詞彙：彙整 tag_1..3（寫日記當下已由 AI 標好的 2-4 字關鍵詞），依出現次數排序。 */
function keywordFrequency(tagRows: (string | null)[][]): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const tags of tagRows) {
    for (const tag of tags) {
      const label = tag?.trim()
      if (!label) continue
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }))
}

/** 完整週回顧頁資料：次數、感恩全文、對象分佈、常見詞彙、這週收到的留言。 */
export async function fetchWeeklyReviewData(userId: string, monday: Date): Promise<WeeklyReviewData> {
  const sunday = sundayOf(monday)
  const start = isoLocalDate(monday)
  const end = isoLocalDate(sunday)

  const weekStart = new Date(monday)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(sunday)
  weekEnd.setHours(23, 59, 59, 999)

  const [focusRes, morningRes, gratitudeWeekRes, myEntriesRes, selfCompassionRes] = await Promise.all([
    supabase
      .from('focus_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('log_date', start)
      .lte('log_date', end),
    supabase
      .from('morning_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('log_date', start)
      .lte('log_date', end),
    supabase
      .from('gratitude_entries')
      .select('id, entry_date, item_1, item_2, item_3, target_1, target_2, target_3, tag_1, tag_2, tag_3')
      .eq('user_id', userId)
      .eq('practice_type', 'gratitude')
      .gte('entry_date', start)
      .lte('entry_date', end)
      .order('entry_date', { ascending: true }),
    supabase.from('gratitude_entries').select('id').eq('user_id', userId),
    supabase
      .from('gratitude_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('practice_type', 'self_compassion')
      .gte('entry_date', start)
      .lte('entry_date', end),
  ])

  const gratitudeRows = gratitudeWeekRes.data ?? []
  const gratitudeEntries: WeeklyGratitudeEntry[] = gratitudeRows.map((r) => ({
    id: r.id as string,
    entryDate: String(r.entry_date).slice(0, 10),
    items: [r.item_1, r.item_2, r.item_3].filter((v): v is string => !!v && v.trim().length > 0),
    targets: [r.target_1, r.target_2, r.target_3].filter((v): v is TargetCode => !!v),
  }))

  const targets = targetBreakdown(gratitudeRows.flatMap((r) => [r.target_1, r.target_2, r.target_3] as (TargetCode | null)[]))
  const keywords = keywordFrequency(gratitudeRows.map((r) => [r.tag_1, r.tag_2, r.tag_3] as (string | null)[]))

  const entryIds = (myEntriesRes.data ?? []).map((e) => e.id as string)

  let comments: WeeklyComment[] = []
  if (entryIds.length > 0) {
    const { data } = await supabase
      .from('comments')
      .select('id, entry_id, content, created_at, anon_name')
      .in('entry_id', entryIds)
      .gte('created_at', weekStart.toISOString())
      .lte('created_at', weekEnd.toISOString())
      .order('created_at', { ascending: false })

    comments = (data ?? []).map((c) => ({
      id: c.id as string,
      entryId: c.entry_id as string,
      content: c.content as string,
      createdAt: c.created_at as string,
      anonName: (c.anon_name as string | null) ?? null,
    }))
  }

  return {
    gratitudeCount: gratitudeRows.length,
    processCount: (focusRes.count ?? 0) + (morningRes.count ?? 0),
    selfCompassionCount: selfCompassionRes.count ?? 0,
    periodStart: start,
    periodEnd: end,
    comments,
    gratitudeEntries,
    keywords,
    targets,
  }
}
