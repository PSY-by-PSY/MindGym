// 練習完成後「發佈到社群」的共用邏輯。
//
// 感恩日記、過程目標覺察都把貼文寫進 gratitude_entries（以 practice_type 區分
// 來源、payload 承載各自的客製版型）。工作坊練習（找尋真實自我、生命最後一天）
// 也走同一張表，因此把 process-goal 內既有的發文流程抽成共用，避免每個練習各複製
// 一份：差別只在 practice_type 與 payload 形狀。
//
// 注意：item_1~3 在正式 DB 有 NOT NULL 約束（感恩日記固定填三項，schema.sql 沒寫
// 但線上有），未用到的欄位一律補空字串而非 null；社群卡片以 filter(Boolean) 過濾，
// 不會顯示空泡泡。
import { supabase } from './supabase'
import { assertPublishable, toContentBlockedError, ContentBlockedError } from './contentFilter'
import { type Privacy, privacyToFields } from './privacy'
import { computeUnifiedStreak } from './streak'
import { isoLocalDate } from './date'

const ANON_NAMES = ['溫暖的星火', '清晨的微風', '靜謐的月光', '晴天的微笑', '輕盈的雲朵']

export function pickAnonName(): string {
  return ANON_NAMES[Math.floor(Math.random() * ANON_NAMES.length)]
}

export interface ShareContent {
  /** 退回版（payload 欄位不存在時）顯示的條列第一項；也滿足 item_1 的 NOT NULL。 */
  item_1: string
  item_2?: string | null
  item_3?: string | null
  ai_feedback?: string | null
}

/**
 * 在 gratitude_entries 建立一則社群貼文。
 * @param practiceType  例如 'workshop_authentic_self'、'workshop_last_day'
 * @param payload       客製版型的結構化欄位（存進 jsonb payload）
 * @returns 新貼文 id；失敗回 null
 * @throws ContentBlockedError 內容含違規字眼（App Store 1.2 要求的發佈前過濾）。
 *         呼叫端要用 instanceof 判斷並顯示 e.message，別跟一般失敗混在一起——
 *         使用者需要知道「是內容被擋」而不是「系統壞了」。
 */
export async function insertCommunityPost(
  userId: string,
  practiceType: string,
  content: ShareContent,
  privacy: Privacy,
  payload?: Record<string, unknown>,
): Promise<string | null> {
  const fields = privacyToFields(privacy)
  // 發佈前過濾：公開貼文才擋。私人日記寫什麼是使用者的事，不該被審查
  // （這也是為什麼過濾放在這裡、而不是無差別套在所有寫入上）。
  // DB 端還有一層同規則的 trigger（community_safety.sql），前端這層只是提早給回饋。
  if (fields.is_shared) {
    assertPublishable(
      content.item_1,
      content.item_2,
      content.item_3,
      ...(payload ? Object.values(payload).map((v) => (typeof v === 'string' ? v : null)) : []),
    )
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, avatar')
    .eq('id', userId)
    .maybeSingle()
  const anonName = fields.use_real_name ? (profile?.name || pickAnonName()) : pickAnonName()

  const baseRow: Record<string, unknown> = {
    user_id: userId,
    practice_type: practiceType,
    item_1: content.item_1 || '',
    item_2: content.item_2 ?? '',
    item_3: content.item_3 ?? '',
    ai_feedback: content.ai_feedback ?? null,
    is_shared: fields.is_shared,
    use_real_name: fields.use_real_name,
    anon_name: anonName,
    avatar: profile?.avatar ?? null,
    entry_date: isoLocalDate(new Date()),
  }

  const attempt = (row: Record<string, unknown>) =>
    supabase.from('gratitude_entries').insert(row).select('id').single()

  let { data, error } = await attempt(payload ? { ...baseRow, payload } : baseRow)

  // payload 欄位尚未建立（migration 未跑）→ 退回不含 payload 的寫入，
  // 確保貼文照樣發得出去（顯示退回 item 條列版）。
  if (error && payload && (error.code === '42703' || /payload/i.test(error.message ?? ''))) {
    console.warn('[community] payload 欄位不存在，請在 Supabase 跑 process_goal.sql；本次以退回版發佈')
    ;({ data, error } = await attempt(baseRow))
  }

  if (error) {
    // DB trigger 擋下（管理員可能在後台加了前端還沒有的詞）→ 轉成同一種錯誤丟出去，
    // 讓呼叫端顯示「內容被擋」而不是「發佈失敗」。
    const blocked = toContentBlockedError(error)
    if (blocked) throw blocked
    console.error('[community insert]', error)
    return null
  }
  const id = data?.id ?? null
  if (id && fields.is_shared) void supabase.rpc('schedule_bot_likes', { p_entry_id: id })
  return id
}

/**
 * 練習完成後重算並寫回連續健心天數。工作坊貼文寫進 gratitude_entries（帶今天的
 * entry_date），computeUnifiedStreak 會讀到，因此完成工作坊也算當天打卡。
 */
export async function markStreak(userId: string): Promise<void> {
  try {
    const streak = await computeUnifiedStreak(userId)
    await supabase.from('profiles').upsert({ id: userId, current_streak: streak }, { onConflict: 'id' })
  } catch (e) {
    console.error('[community streak]', e)
  }
}

/**
 * 在完成頁切換隱私時，同步更新已建立的貼文。
 *
 * 「先存成私人、再切成公開」是發佈前過濾最容易被繞過的路徑（私人內容當初沒被檢查），
 * 所以這裡在轉公開時要重新檢查一次。回傳 ContentBlockedError 代表擋下、DB 沒有被改動，
 * 呼叫端要把畫面上的選項切回去並提示使用者；成功回 null。
 */
export async function updateCommunityPrivacy(
  entryId: string,
  userId: string,
  privacy: Privacy,
): Promise<ContentBlockedError | null> {
  const fields = privacyToFields(privacy)
  if (fields.is_shared) {
    const { data: entry } = await supabase
      .from('gratitude_entries')
      .select('item_1, item_2, item_3, payload')
      .eq('id', entryId)
      .maybeSingle()
    if (entry) {
      const payloadTexts = entry.payload && typeof entry.payload === 'object'
        ? Object.values(entry.payload as Record<string, unknown>).map((v) => (typeof v === 'string' ? v : null))
        : []
      try {
        assertPublishable(entry.item_1, entry.item_2, entry.item_3, ...payloadTexts)
      } catch (e) {
        if (e instanceof ContentBlockedError) return e
        throw e
      }
    }
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', userId)
    .maybeSingle()
  const anonName = fields.use_real_name ? (profile?.name || pickAnonName()) : pickAnonName()
  const { error } = await supabase
    .from('gratitude_entries')
    .update({ is_shared: fields.is_shared, use_real_name: fields.use_real_name, anon_name: anonName })
    .eq('id', entryId)
  if (error) {
    const blocked = toContentBlockedError(error)
    if (blocked) return blocked
    console.error('[community privacy]', error)
  }
  return null
}
