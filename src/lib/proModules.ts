// 專業模組區（Professional Modules）— 個案端共用邏輯。
//
// 型別、RPC 包裝（走 anon key + RLS，敏感操作是 SECURITY DEFINER RPC）、後端呼叫
// （危機判讀，沿用 VITE_API_URL 慣例）、危機關鍵字 fallback，以及「模組已更新」判斷。
// 資料表與 RPC 定義見 supabase/pro_modules.sql，決策見 docs/plans/pro_modules_plan.md。
import { supabase } from './supabase'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

// ── 型別 ─────────────────────────────────────────────────────────────────

export type ProBlockType =
  | 'instruction' | 'short_text' | 'long_text' | 'choice' | 'scale' | 'checklist'

// 單一積木。未知的 type 由 BlockRenderer 當 instruction 顯示（前向相容鐵則）。
export interface ProBlock {
  id: string
  type: ProBlockType | string
  text?: string        // instruction：引導文字
  label?: string       // 題目
  placeholder?: string
  required?: boolean
  options?: string[]   // choice / checklist
  multi?: boolean      // choice：可否複選
  min?: number         // scale
  max?: number
  minLabel?: string
  maxLabel?: string
}

export interface ProModuleContent {
  v: number
  intro?: string
  blocks: ProBlock[]
  outro?: string
}

// answers 以 block id 為 key：短/長文字→string、scale→number、choice/checklist→string[]。
export type ProAnswerValue = string | number | string[]
export type ProAnswers = Record<string, ProAnswerValue>

export type ProModuleStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived'

export interface AiReviewFinding {
  severity?: string
  quote?: string
  reason?: string
}

// 後端 /api/pro/submit-module 產生的 AI 安全標籤（僅供管理員參考）。
export interface AiReview {
  risk_level?: 'low' | 'medium' | 'high'
  psych_safety?: AiReviewFinding[]
  info_safety?: AiReviewFinding[]
  psychology_basis_note?: string
  summary?: string
  error?: string
}

// 專業夥伴端讀到的完整模組列（pro_modules 一整列）。
export interface ProModuleRow {
  id: string
  owner_id: string
  title: string
  description: string | null
  est_minutes: number | null
  draft_content: ProModuleContent | null
  published_content: ProModuleContent | null
  status: ProModuleStatus
  ai_review: AiReview | null
  admin_note: string | null
  submitted_at: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

// 個案端 get_my_modules() 回傳的一筆（含 published_content 供播放器渲染）。
export interface ProModuleInfo {
  module_id: string
  title: string
  description: string | null
  est_minutes: number | null
  published_content: ProModuleContent | null
  published_at: string | null
  practitioner_name: string | null
  enrolled_at: string | null
}

// preview / redeem 回傳的安全欄位（不含 published_content）。
export interface ProModulePreview {
  module_id: string
  title: string
  description: string | null
  est_minutes: number | null
  practitioner_name: string | null
}

export interface EntrySafetyResult {
  risk: 'none' | 'medium' | 'high'
  matched_terms?: string[]
}

// ── RPC 包裝 ─────────────────────────────────────────────────────────────

/** 兌換前預覽（同意視窗用）。查無 → null（前端顯示「邀請碼無效」）。 */
export async function previewInviteCode(code: string): Promise<ProModulePreview | null> {
  const { data, error } = await supabase.rpc('preview_invite_code', {
    p_code: code.trim().toUpperCase(),
  })
  if (error) {
    console.error('[pro preview]', error)
    return null
  }
  return (data as ProModulePreview | null) ?? null
}

/** 同意後建立/恢復追蹤關係。回傳模組安全欄位；失敗回 null。 */
export async function redeemInviteCode(
  code: string,
  sharePerma: boolean,
): Promise<ProModulePreview | null> {
  const { data, error } = await supabase.rpc('redeem_invite_code', {
    p_code: code.trim().toUpperCase(),
    p_share_perma: sharePerma,
  })
  if (error) {
    console.error('[pro redeem]', error)
    return null
  }
  return (data as ProModulePreview | null) ?? null
}

/** 個案看模組內容的唯一入口（只回 active enrollment 的可用模組）。 */
export async function getMyModules(): Promise<ProModuleInfo[]> {
  const { data, error } = await supabase.rpc('get_my_modules')
  if (error) {
    console.error('[pro getMyModules]', error)
    return []
  }
  return (data as ProModuleInfo[] | null) ?? []
}

/** 停止追蹤關係（個案只能單向停止；停止後專業夥伴立即看不到任何資料）。 */
export async function stopEnrollment(moduleId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('pro_enrollments')
    .update({ status: 'stopped', stopped_at: new Date().toISOString() })
    .eq('module_id', moduleId)
    .eq('user_id', userId)
  if (error) {
    console.error('[pro stop]', error)
    return false
  }
  return true
}

// ── 危機判讀（後端主路徑 + 前端 fallback）────────────────────────────────

/**
 * 呼叫後端危機判讀端點。任何失敗都會 throw，交由呼叫端跑 localCrisisCheck fallback。
 */
export async function entrySafetyCheck(entryId: string, texts: string[]): Promise<EntrySafetyResult> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('no session')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const resp = await fetch(`${API_URL}/api/pro/entry-safety-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ entry_id: entryId, texts }),
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`safety-check ${resp.status}`)
    return (await resp.json()) as EntrySafetyResult
  } finally {
    clearTimeout(timer)
  }
}

// 危機偵測關鍵字（保守、低誤報）。
// 注意：修改時要同步後端 backend/app.py 的 CRISIS_KEYWORDS。
// 刻意不收「要死」「死了」這類高誤報詞——語意層交給後端 AI（第二層）。
export const CRISIS_KEYWORDS = [
  '自殺', '自傷', '想死', '想不開', '不想活', '活不下去', '結束生命',
  '結束自己', '傷害自己', '割腕', '輕生', '尋短', '想消失', '沒有活下去',
  '燒炭', '跳樓', '了結',
]

/** 後端失敗時的關鍵字 fallback，回傳命中的關鍵字清單。 */
export function localCrisisCheck(texts: string[]): string[] {
  const joined = texts.filter(Boolean).join('\n')
  return CRISIS_KEYWORDS.filter((kw) => joined.includes(kw))
}

/**
 * 前端 fallback 寫入危機警示（後端掛掉時）。RLS 已允許「本人 + active enrollment」自建。
 * 先查自己的 enrollment 取 practitioner_id，再 INSERT。
 */
export async function insertCrisisAlertFallback(
  moduleId: string,
  userId: string,
  entryId: string,
  matchedTerms: string[],
): Promise<void> {
  try {
    const { data: enr } = await supabase
      .from('pro_enrollments')
      .select('practitioner_id')
      .eq('module_id', moduleId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()
    if (!enr) return
    await supabase.from('crisis_alerts').insert({
      user_id: userId,
      practitioner_id: enr.practitioner_id,
      module_id: moduleId,
      entry_id: entryId,
      source: 'keyword',
      severity: 'high',
      matched_terms: matchedTerms,
    })
  } catch (e) {
    console.error('[pro crisis fallback]', e)
  }
}

// ── 「模組已更新」判斷（沿用通知的「推導 + localStorage」模式，不建通知表）──────

const SEEN_PREFIX = 'pro_module_seen_'

/** 首次解鎖不算「更新」；曾看過、且 published_at 比上次看到的新 → 視為已更新。 */
export function isModuleUpdated(moduleId: string, publishedAt: string | null): boolean {
  if (!publishedAt) return false
  try {
    const seen = localStorage.getItem(SEEN_PREFIX + moduleId)
    if (!seen) return false
    return new Date(publishedAt).getTime() > new Date(seen).getTime()
  } catch {
    return false
  }
}

/** 記下「已看到某個 published_at 的版本」。 */
export function markModuleSeen(moduleId: string, publishedAt: string | null): void {
  try {
    localStorage.setItem(SEEN_PREFIX + moduleId, publishedAt ?? new Date().toISOString())
  } catch {
    /* 忽略（隱私模式等） */
  }
}

// ── 積木工具與內建模板（專業夥伴「從模板開始」用）──────────────────────────

/** 建立 block 時產生短 id；編輯時不變，answers 以 id 為 key。 */
export function newBlockId(): string {
  return 'b' + Math.random().toString(36).slice(2, 8)
}

export interface ModuleTemplate {
  key: string
  label: string
  hint: string
  build: () => ProModuleContent
}

export const MODULE_TEMPLATES: ModuleTemplate[] = [
  {
    key: 'reflection3',
    label: '三題引導反思',
    hint: '一段引導語 + 三個開放式問題（仿感恩日記）',
    build: () => ({
      v: 1,
      intro: '花幾分鐘，安靜地陪自己想想這三個問題。沒有標準答案。',
      blocks: [
        { id: newBlockId(), type: 'long_text', label: '今天，有什麼事情讓你印象深刻？', required: true },
        { id: newBlockId(), type: 'long_text', label: '那件事帶給你什麼感受？', required: false },
        { id: newBlockId(), type: 'long_text', label: '如果可以對自己說一句話，你想說什麼？', required: false },
      ],
      outro: '謝謝你願意花時間陪伴自己。',
    }),
  },
  {
    key: 'mood_scale',
    label: '每日心情量表',
    hint: '一個 1–5 心情量表 + 一句自由記錄',
    build: () => ({
      v: 1,
      intro: '',
      blocks: [
        { id: newBlockId(), type: 'scale', label: '今天的心情', min: 1, max: 5, minLabel: '低落', maxLabel: '飽滿' },
        { id: newBlockId(), type: 'short_text', label: '今天最想記下的一件事', required: false },
      ],
      outro: '',
    }),
  },
  {
    key: 'blank',
    label: '空白模組',
    hint: '只有開場與結語骨架，自由設計',
    build: () => ({ v: 1, intro: '', blocks: [], outro: '' }),
  },
]

/** 取用來顯示/預覽的內容：個案端優先 published，專業夥伴端看 draft。 */
export function excerptFromAnswers(content: ProModuleContent | null, answers: ProAnswers): string {
  if (!content) return ''
  for (const b of content.blocks) {
    const v = answers[b.id]
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80)
  }
  return ''
}
