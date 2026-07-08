// 定期回顧功能（User 端）— 內建感恩日記週回顧 ＋ 專業日記模組整體/週報回顧，共用 pro_reviews。
// 生成採「lazy on-open」：App 進入 /app/home 或 /app/profile 時檢查一次（每人每天節流），
// 後端會再驗證門檻與期間（不信前端判斷），撞到 UNIQUE 就回既有那筆，不重複生成。
import { supabase } from './supabase'
import { isoLocalDate } from './date'
import { getMyModules, type DiaryModuleContent } from './proModules'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export interface ReviewContent {
  v: number
  title: string
  summary: string
  trend?: { date: string; score: number }[]
  themes?: string[]
  quote?: { text: string; source_date: string }
  challenge?: string
}

export type ReviewType = 'overall' | 'weekly' | 'gratitude_weekly'

export interface ReviewRow {
  id: string
  user_id: string
  module_id: string | null
  review_type: ReviewType
  period_start: string
  period_end: string
  entry_count: number
  content: ReviewContent
  created_at: string
  read_at: string | null
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
}

/** 呼叫後端生成整體/週報回饋；後端自行判斷門檻，未達門檻回 409（視為「還沒到」，非錯誤）。 */
export async function requestDiaryReview(moduleId: string, reviewType: 'overall' | 'weekly'): Promise<ReviewRow | null> {
  try {
    const headers = await authHeaders()
    if (!headers) return null
    const resp = await fetch(`${API_URL}/api/pro/diary-review`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ module_id: moduleId, review_type: reviewType }),
    })
    if (!resp.ok) return null
    return (await resp.json()) as ReviewRow
  } catch (e) {
    console.error('[reviews] requestDiaryReview', e)
    return null
  }
}

/** periodStart：該週週一（YYYY-MM-DD）。 */
export async function requestGratitudeWeekly(periodStart: string): Promise<ReviewRow | null> {
  try {
    const headers = await authHeaders()
    if (!headers) return null
    const resp = await fetch(`${API_URL}/api/reviews/gratitude-weekly`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ period_start: periodStart }),
    })
    if (!resp.ok) return null
    return (await resp.json()) as ReviewRow
  } catch (e) {
    console.error('[reviews] requestGratitudeWeekly', e)
    return null
  }
}

/** 累積筆數是否「剛好跨過」門檻的整數倍（用來決定要不要嘗試呼叫生成端點）。 */
export function crossedThreshold(count: number, threshold: number): boolean {
  return threshold > 0 && count > 0 && count % threshold === 0
}

export async function fetchMyReviews(userId: string): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from('pro_reviews')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[reviews] fetchMyReviews', error)
    return []
  }
  return (data as ReviewRow[]) ?? []
}

export async function markReviewRead(id: string): Promise<void> {
  const { error } = await supabase.from('pro_reviews').update({ read_at: new Date().toISOString() }).eq('id', id)
  if (error) console.error('[reviews] markReviewRead', error)
}

// ── App 進入 /app/home 或 /app/profile 時的 lazy 檢查（每人每天最多一次）──────

function checkedKey(userId: string): string {
  return `reviews_checked_${userId}_${isoLocalDate(new Date())}`
}

function alreadyCheckedToday(userId: string): boolean {
  try {
    return localStorage.getItem(checkedKey(userId)) === '1'
  } catch {
    return false
  }
}

function markCheckedToday(userId: string): void {
  try {
    localStorage.setItem(checkedKey(userId), '1')
  } catch {
    /* 忽略（隱私模式等） */
  }
}

/** 該日期所在週的週一（本地時區）。 */
function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=週日..6=週六
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * lazy 檢查：上一個完整週的內建感恩日記週回顧 ＋ 每個 active 日記模組 enrollment 的整體/週報。
 * 每個使用者每天最多跑一次（localStorage 節流）；後端會再驗證一次，不信任這裡的判斷。
 */
export async function checkAndGenerateReviews(userId: string): Promise<void> {
  if (alreadyCheckedToday(userId)) return
  markCheckedToday(userId)

  // 1. 內建感恩日記：上一個完整週（週一–週日）。
  try {
    const lastMonday = mondayOf(new Date())
    lastMonday.setDate(lastMonday.getDate() - 7)
    const lastSunday = new Date(lastMonday)
    lastSunday.setDate(lastSunday.getDate() + 6)
    const periodStart = isoLocalDate(lastMonday)

    const { data } = await supabase
      .from('gratitude_entries')
      .select('id')
      .eq('user_id', userId)
      .eq('practice_type', 'gratitude')
      .gte('entry_date', periodStart)
      .lte('entry_date', isoLocalDate(lastSunday))
    if ((data?.length ?? 0) >= 3) {
      await requestGratitudeWeekly(periodStart)
    }
  } catch (e) {
    console.error('[reviews] gratitude_weekly check', e)
  }

  // 2. 每個 active 日記模組 enrollment：overall（累積達 threshold 整數倍）＋ weekly（不同 entry_date 達 7 的倍數）。
  try {
    const modules = await getMyModules()
    for (const m of modules) {
      if (m.kind !== 'diary') continue
      const content = m.published_content as DiaryModuleContent | null
      const feedback = content?.feedback
      if (!feedback) continue

      const { data: entries } = await supabase
        .from('pro_entries')
        .select('entry_date')
        .eq('module_id', m.module_id)
        .eq('user_id', userId)
      const rows = entries ?? []
      const total = rows.length
      const distinctDates = new Set(rows.map((r) => String(r.entry_date))).size

      if (feedback.overall.enabled && crossedThreshold(total, feedback.overall.threshold)) {
        await requestDiaryReview(m.module_id, 'overall')
      }
      if (feedback.weekly.enabled && crossedThreshold(distinctDates, 7)) {
        await requestDiaryReview(m.module_id, 'weekly')
      }
    }
  } catch (e) {
    console.error('[reviews] diary review check', e)
  }
}
