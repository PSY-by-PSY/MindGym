// 感恩日記的「寫入一筆日記」與 AI 輔助請求。
//
// 原本這些都寫在 app.gratitude.tsx 裡，但草稿自動存檔（見 gratitudeDraft）也需要
// 同一條寫入路徑——不能為了自動存檔複製一份、之後兩邊各自改到走鐘，所以抽出來共用。
import { supabase } from './supabase'
import { assertPublishable, toContentBlockedError } from './contentFilter'
import { computeUnifiedStreak } from './streak'
import { isoLocalDate } from './date'
import { privacyToFields, type Privacy } from './privacy'
import {
  clearGratitudeDraft,
  gratitudeDraftKey,
  loadGratitudeDraft,
  markAutoSaved,
} from './gratitudeDraft'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export type Difficulty = 'basic' | 'advanced'
export type TargetCode = 'others' | 'self' | 'environment' | 'experience' | 'custom'

export interface GratitudeItems {
  item_1: string
  item_2: string
  item_3: string
}

export interface TagResult {
  item: number
  target: TargetCode
  label: string
}

export interface SummaryResult {
  emotional_summary: string
  resonance_story: string
}

// 匿名顯示名稱：直接寫入 DB 的 anon_name 欄位，故意不走 t() 翻譯——
// 這是儲存進資料庫的資料值（非畫面即時渲染文字），若隨語言切換翻譯，
// 同一篇貼文在不同語言使用者眼中會顯示不同名字，並非預期行為。
const ANON_NAMES = ['溫暖的星火', '清晨的微風', '靜謐的月光', '晴天的微笑', '輕盈的雲朵']

export function pickAnonName(): string {
  return ANON_NAMES[Math.floor(Math.random() * ANON_NAMES.length)]
}

// 行動網路偶爾會讓連線卡住卻不結束，fetch 預設沒有逾時 → promise 永遠不 resolve，
// 使用者就「等不到回應」。用 AbortController 設上限，逾時就丟錯，讓呼叫端走既有的
// 失敗 fallback（顯示友善訊息 / 以 null ai_feedback 存檔），而不是無限轉圈。
const AI_FETCH_TIMEOUT_MS = 30000

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = AI_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchGratitudeSummary(
  items: GratitudeItems,
  difficulty: Difficulty,
): Promise<SummaryResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const resp = await fetchWithTimeout(`${API_URL}/api/gratitude-summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ...items, difficulty }),
  })
  if (!resp.ok) throw new Error(`API error: ${resp.status}`)
  const data = await resp.json() as { emotional_summary?: string; resonance_story?: string }
  if (!data.emotional_summary) throw new Error('Empty summary')
  return {
    emotional_summary: data.emotional_summary,
    resonance_story: data.resonance_story ?? '',
  }
}

export async function fetchGratitudeTags(items: GratitudeItems): Promise<TagResult[]> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const resp = await fetchWithTimeout(`${API_URL}/api/tag-gratitude-targets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(items),
  })
  if (!resp.ok) throw new Error(`API error: ${resp.status}`)
  const data = await resp.json() as { tags?: TagResult[] }
  return data.tags ?? []
}

export interface SaveGratitudeInput {
  userId: string
  items: GratitudeItems
  /** YYYY-MM-DD（當地時區） */
  entryDate: string
  privacy: Privacy
  aiFeedback: string | null
  tags: TagResult[]
  /** 實名顯示時，profiles.name 抓不到就用這個（通常是 OAuth 帶回來的名字） */
  realNameFallback?: string | null
}

/**
 * 寫入一筆感恩日記，回傳 entry id。
 * 錯誤直接往上丟（呼叫端決定要不要跳提示）；內容違規時丟的是 ContentBlockedError，
 * 呼叫端要用 instanceof 判斷，顯示「內容被擋」而不是「儲存失敗」。
 */
export async function saveGratitudeEntry(input: SaveGratitudeInput): Promise<string | null> {
  const { userId, items, entryDate, privacy, aiFeedback, tags, realNameFallback } = input

  // 發佈前過濾（App Store 1.2）：只擋要公開到打卡牆的內容，私人日記不審查。
  // DB 端有同規則的 trigger，這裡只是提早給回饋。
  if (privacyToFields(privacy).is_shared) {
    assertPublishable(items.item_1, items.item_2, items.item_3)
  }

  const t1 = tags.find((t) => t.item === 1)
  const t2 = tags.find((t) => t.item === 2)
  const t3 = tags.find((t) => t.item === 3)

  const profileRes = await supabase
    .from('profiles')
    .select('name, avatar')
    .eq('id', userId)
    .maybeSingle()

  const profileName = profileRes.data?.name ?? null
  const profileAvatar = profileRes.data?.avatar ?? null

  const fields = privacyToFields(privacy)
  const anonName = fields.use_real_name
    ? (profileName || realNameFallback || pickAnonName())
    : pickAnonName()

  const payload: Record<string, unknown> = {
    user_id: userId,
    item_1: items.item_1,
    item_2: items.item_2,
    item_3: items.item_3,
    is_shared: fields.is_shared,
    use_real_name: fields.use_real_name,
    entry_date: entryDate,
    anon_name: anonName,
  }
  if (aiFeedback) payload.ai_feedback = aiFeedback
  if (t1) payload.target_1 = t1.target
  if (t2) payload.target_2 = t2.target
  if (t3) payload.target_3 = t3.target
  // 詞彙標籤（2–4 字，如「同事」）一併存入 tag_1..3，供「一週回顧」的常提到詞彙統計使用
  if (t1?.label) payload.tag_1 = t1.label
  if (t2?.label) payload.tag_2 = t2.label
  if (t3?.label) payload.tag_3 = t3.label
  if (profileAvatar) payload.avatar = profileAvatar

  const { data: inserted, error } = await supabase
    .from('gratitude_entries')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    const blocked = toContentBlockedError(error)
    if (blocked) throw blocked
    console.error('[gratitude save]', error)
    throw new Error(error.message || JSON.stringify(error))
  }

  const entryId = inserted?.id ?? null

  // 安排機器人按讚（非同步，不阻塞主流程）
  if (entryId) {
    void supabase.rpc('schedule_bot_likes', { p_entry_id: entryId })
  }

  // 計算並更新連續打卡天數（跨練習統一計算，社群顯示才會一致）
  void (async () => {
    const streak = await computeUnifiedStreak(userId)
    await supabase
      .from('profiles')
      .upsert({ id: userId, current_streak: streak }, { onConflict: 'id' })
  })()

  return entryId
}

// ── 逾時草稿自動存檔 ──────────────────────────────────────────────────────
// 超過兩小時沒回來的草稿，直接幫使用者存成「僅限本人」的日記，讓內容至少留在
// 「我的貼文」與「我的健心日記」，不會白寫。刻意用 private：系統代替使用者寫入，
// 就不該替他決定要公開——想分享到打卡牆隨時可以自己改。

let flushInFlight: Promise<boolean> | null = null

/**
 * 檢查並處理逾時草稿。回傳是否真的存了一筆。
 * 同時間只會有一個在跑（React 嚴格模式會重跑 effect，不擋會寫進兩筆）。
 */
export function flushStaleGratitudeDraft(userId: string | undefined): Promise<boolean> {
  if (!userId) return Promise.resolve(false)
  if (flushInFlight) return flushInFlight
  flushInFlight = doFlush(userId).finally(() => {
    flushInFlight = null
  })
  return flushInFlight
}

async function doFlush(userId: string): Promise<boolean> {
  const key = gratitudeDraftKey(userId)
  const loaded = loadGratitudeDraft(key)
  if (!loaded || !loaded.isStale) return false

  const { draft } = loaded
  const entryDate = draft.entryDate || isoLocalDate()

  // AI 回饋與標籤盡量補上，但拿不到也照存——內容本身比裝飾重要。
  let aiFeedback: string | null = null
  try {
    const summary = await fetchGratitudeSummary(draft.items, draft.difficulty)
    aiFeedback = `${summary.emotional_summary} ${summary.resonance_story}`.trim()
  } catch (e) {
    console.error('[gratitude auto-save summary]', e)
  }
  let tags: TagResult[] = []
  try {
    tags = await fetchGratitudeTags(draft.items)
  } catch (e) {
    console.error('[gratitude auto-save tags]', e)
  }

  try {
    await saveGratitudeEntry({
      userId,
      items: draft.items,
      entryDate,
      privacy: 'private',
      aiFeedback,
      tags,
    })
  } catch (e) {
    // 存不進去（沒網路／DB 出錯）就把草稿留著，下次進 App 再試一次。
    console.error('[gratitude auto-save]', e)
    return false
  }

  // 上面那幾個 await 期間，使用者可能已經回到感恩日記頁開始寫新的一篇，
  // 草稿會被覆蓋成新內容——那就不能清掉，否則等於把新的心血刪了。
  const still = loadGratitudeDraft(key)
  if (still && still.savedAt === loaded.savedAt) clearGratitudeDraft(key)

  markAutoSaved(userId, entryDate)
  // 首頁的提示卡可能已經掛載，發個事件讓它即時顯示（沒人聽也無妨）。
  window.dispatchEvent(new CustomEvent('gratitude-auto-saved'))
  return true
}
