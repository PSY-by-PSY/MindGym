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
 */
export async function insertCommunityPost(
  userId: string,
  practiceType: string,
  content: ShareContent,
  privacy: Privacy,
  payload?: Record<string, unknown>,
): Promise<string | null> {
  const fields = privacyToFields(privacy)
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

/** 在完成頁切換隱私時，同步更新已建立的貼文。 */
export async function updateCommunityPrivacy(entryId: string, userId: string, privacy: Privacy) {
  const fields = privacyToFields(privacy)
  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', userId)
    .maybeSingle()
  const anonName = fields.use_real_name ? (profile?.name || pickAnonName()) : pickAnonName()
  await supabase
    .from('gratitude_entries')
    .update({ is_shared: fields.is_shared, use_real_name: fields.use_real_name, anon_name: anonName })
    .eq('id', entryId)
}
