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
  voice?: boolean      // short_text / long_text：是否顯示語音輸入（預設 true，僅日記模組使用）
}

export interface ProModuleContent {
  v: number
  intro?: string
  blocks: ProBlock[]
  outro?: string
}

// ── kind 分流：一張表承載三種模組型態 ───────────────────────────────────────
export type ProModuleKind = 'practice' | 'diary' | 'assessment'

export type DiaryFeedbackStyle = 'warm' | 'reflective' | 'brief' | 'zen' | 'celebrate'
export type OverallFocus = 'themes' | 'emotion_arc' | 'depth_growth' | 'unsaid'

export interface DiaryFeedbackConfig {
  daily: { enabled: boolean; style: DiaryFeedbackStyle }
  overall: { enabled: boolean; threshold: number; focus: OverallFocus[] }
  weekly: {
    enabled: boolean
    sections: { trend: boolean; quotes: boolean; challenge: boolean }
    sync_to_practitioner: boolean
  }
}

// 日記模組內容（kind='diary'）。blocks 沿用 ProBlock（即每日要填的欄位）。
export interface DiaryModuleContent extends ProModuleContent {
  kind: 'diary'
  template_key?: string
  reminder?: { enabled: boolean; time: string }
  feedback: DiaryFeedbackConfig
}

// 質性測驗模組內容（kind='assessment'）。與 ProModuleContent 形狀不同（無 blocks），獨立定義。
export interface AssessmentDimension {
  key: string
  name: string
  description: string
  color_index: number // 0–4，對應站內五色
}

export interface AssessmentQuestion {
  id: string
  dimension: string
  original: string
  translated: string
  hints: string[]
  required: boolean
  sensitive?: boolean // 高風險量表題（如自傷題）：作答頁顯示求助資源列
}

export interface AssessmentModuleContent {
  v: number
  kind: 'assessment'
  source_scale: { name: string; note?: string; origin: 'pasted' | 'file' }
  dimensions: AssessmentDimension[]
  questions: AssessmentQuestion[]
  intro: string
  consent_text: string
  review_before_send: boolean
}

export type AnyModuleContent = ProModuleContent | DiaryModuleContent | AssessmentModuleContent

// 質性測驗雙報告 schema（後端 /api/pro/assessment-report 一次生成）。
export interface PractitionerReportDimension {
  key: string
  name: string
  estimated_score: number
  max_score: number
  confidence: 'high' | 'medium' | 'low'
  evidence: string[]
}

export interface PractitionerReportContent {
  v: number
  dimensions: PractitionerReportDimension[]
  needs_confirmation: string[]
  reflection_prompts: string[]
  disclaimer: string
  error?: string
}

export interface ClientReportContent {
  v: number
  hero: { emoji: string; title: string; subtitle: string }
  highlights: { emoji: string; title: string; text: string }[]
  quote?: { text: string; source: string }
  hope: string
  mission: { title: string; text: string }
  footer_note: string
  error?: string
}

export type AssessmentResultStatus = 'pending_release' | 'released'

// 個案端 get_my_assessment_results() 回傳的一筆（pending_release 時 client_report 為 null）。
export interface AssessmentResultInfo {
  id: string
  created_at: string
  status: AssessmentResultStatus
  client_report: ClientReportContent | null
}

// 專業夥伴端讀到的完整結果列（含 practitioner_report，僅 owner enrollment 可見）。
export interface AssessmentResultRow {
  id: string
  module_id: string
  user_id: string
  answers: Record<string, string>
  practitioner_report: PractitionerReportContent | null
  client_report: ClientReportContent | null
  status: AssessmentResultStatus
  created_at: string
  released_at: string | null
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
  // kind='assessment' 額外輸出：疑似逐字收錄受版權保護量表題目 / 含診斷性宣稱。
  copyright_note?: string
  clinical_risk_note?: string
  error?: string
}

// 專業夥伴端讀到的完整模組列（pro_modules 一整列）。
export interface ProModuleRow {
  id: string
  owner_id: string
  title: string
  description: string | null
  est_minutes: number | null
  kind: ProModuleKind
  draft_content: AnyModuleContent | null
  published_content: AnyModuleContent | null
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
  kind: ProModuleKind
  published_content: AnyModuleContent | null
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
  kind: ProModuleKind
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

/** 個案讀自己某個質性測驗模組的所有結果（pending_release 時 client_report 為 null）。 */
export async function getMyAssessmentResults(moduleId: string): Promise<AssessmentResultInfo[]> {
  const { data, error } = await supabase.rpc('get_my_assessment_results', { p_module_id: moduleId })
  if (error) {
    console.error('[pro getMyAssessmentResults]', error)
    return []
  }
  return (data as AssessmentResultInfo[] | null) ?? []
}

/** 專業夥伴發布個案版報告（review_before_send=true 時的確認動作）。 */
export async function releaseAssessmentResult(resultId: string): Promise<boolean> {
  const { error } = await supabase.rpc('release_assessment_result', { p_result_id: resultId })
  if (error) {
    console.error('[pro releaseAssessmentResult]', error)
    return false
  }
  return true
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

// ── 日記模板（專業夥伴「日記模組建構器」第一步用）──────────────────────────

function defaultDiaryFeedback(): DiaryFeedbackConfig {
  return {
    daily: { enabled: true, style: 'warm' },
    overall: { enabled: true, threshold: 3, focus: ['themes', 'emotion_arc'] },
    weekly: {
      enabled: true,
      sections: { trend: true, quotes: true, challenge: false },
      sync_to_practitioner: true,
    },
  }
}

export interface DiaryTemplate {
  key: string
  emoji: string
  label: string
  hint: string
  category: string // 分類標題；'' 代表獨立於四大分類之外（空白日記）
  build: () => DiaryModuleContent
}

function diaryBase(templateKey: string, intro: string, blocks: ProBlock[], outro: string): DiaryModuleContent {
  return {
    v: 2,
    kind: 'diary',
    template_key: templateKey,
    intro,
    blocks,
    outro,
    reminder: { enabled: true, time: '21:00' },
    feedback: defaultDiaryFeedback(),
  }
}

export const DIARY_TEMPLATES: DiaryTemplate[] = [
  // ── 情感與關係 ──
  {
    key: 'gratitude',
    emoji: '🙏',
    label: '感恩日記',
    hint: '記錄值得感謝的事，練習把目光放在生活中的美好',
    category: '情感與關係',
    build: () =>
      diaryBase(
        'gratitude',
        '花幾分鐘，寫下今天讓你心存感謝的事。',
        [
          { id: newBlockId(), type: 'long_text', label: '今天有什麼讓你心存感謝的事？', required: true, voice: true },
          { id: newBlockId(), type: 'long_text', label: '這件事帶給你什麼感受？', required: false, voice: true },
          { id: newBlockId(), type: 'scale', label: '這件事讓你感恩的程度', min: 1, max: 7, minLabel: '一點點', maxLabel: '非常感恩' },
          { id: newBlockId(), type: 'choice', label: '這件事屬於哪個分類？', options: ['人際', '成就', '小確幸', '自然'] },
        ],
        '謝謝你願意花時間陪伴自己。',
      ),
  },
  {
    key: 'romance',
    emoji: '💕',
    label: '戀愛日記',
    hint: '記錄與伴侶之間的互動與感受',
    category: '情感與關係',
    build: () =>
      diaryBase(
        'romance',
        '寫下今天你和另一半（或心裡想著的那個人）之間的點滴。',
        [
          { id: newBlockId(), type: 'long_text', label: '今天你們之間發生了什麼？', required: true, voice: true },
          { id: newBlockId(), type: 'long_text', label: '有沒有讓你感到被愛或安心的瞬間？', required: false, voice: true },
          { id: newBlockId(), type: 'scale', label: '今天對這段關係的滿意度', min: 1, max: 5, minLabel: '低落', maxLabel: '滿足' },
        ],
        '謝謝你願意誠實面對這段關係。',
      ),
  },
  {
    key: 'parenting',
    emoji: '👨‍👩‍👧',
    label: '親子日記',
    hint: '記錄和孩子相處的點滴與身為父母的心情',
    category: '情感與關係',
    build: () =>
      diaryBase(
        'parenting',
        '寫下今天和孩子之間，讓你印象深刻的片刻。',
        [
          { id: newBlockId(), type: 'long_text', label: '今天和孩子之間，印象最深的一刻是什麼？', required: true, voice: true },
          { id: newBlockId(), type: 'long_text', label: '身為爸媽，今天有沒有哪個瞬間讓你覺得自己做得不錯？', required: false, voice: true },
          { id: newBlockId(), type: 'scale', label: '今天當爸媽的心累程度', min: 1, max: 5, minLabel: '輕鬆', maxLabel: '疲憊' },
        ],
        '你已經很努力在當一個好爸媽了。',
      ),
  },
  {
    key: 'farewell',
    emoji: '🕊️',
    label: '告別日記',
    hint: '陪伴自己走過思念與失去',
    category: '情感與關係',
    build: () =>
      diaryBase(
        'farewell',
        '如果今天想起了那個人／那段關係，寫下來，讓自己被好好陪伴。',
        [
          { id: newBlockId(), type: 'long_text', label: '今天，你想念的那個人／那段關係，有沒有浮現在你腦海？', required: true, voice: true },
          { id: newBlockId(), type: 'long_text', label: '如果可以對他/她說一句話，你想說什麼？', required: false, voice: true },
          { id: newBlockId(), type: 'scale', label: '今天的思念強度', min: 1, max: 5, minLabel: '平靜', maxLabel: '強烈' },
        ],
        '無論多久，思念都值得被溫柔對待。',
      ),
  },
  // ── 情緒與覺察 ──
  {
    key: 'mood_weather',
    emoji: '🌤️',
    label: '情緒天氣日記',
    hint: '用天氣比喻今天的心情，練習情緒覺察',
    category: '情緒與覺察',
    build: () =>
      diaryBase(
        'mood_weather',
        '如果今天的心情是一種天氣，會是什麼？',
        [
          { id: newBlockId(), type: 'choice', label: '今天心情的天氣', options: ['晴天', '多雲', '陰天', '下雨', '雷雨'], required: true },
          { id: newBlockId(), type: 'long_text', label: '是什麼讓今天的天氣變成這樣？', required: false, voice: true },
        ],
        '天氣總會變化，你的心情也是。',
      ),
  },
  {
    key: 'mindfulness',
    emoji: '🧘',
    label: '正念日記',
    hint: '練習回到當下，覺察身體與念頭',
    category: '情緒與覺察',
    build: () =>
      diaryBase(
        'mindfulness',
        '花一分鐘，安靜地感受此刻的身體與呼吸。',
        [
          { id: newBlockId(), type: 'long_text', label: '此刻你注意到了什麼？（身體、聲音、念頭）', required: true, voice: true },
          { id: newBlockId(), type: 'scale', label: '此刻的平靜程度', min: 1, max: 5, minLabel: '紛亂', maxLabel: '平靜' },
        ],
        '謝謝你願意停下來，回到當下。',
      ),
  },
  {
    key: 'dream',
    emoji: '💭',
    label: '夢境日記',
    hint: '記錄夢境內容與醒來後的感受',
    category: '情緒與覺察',
    build: () =>
      diaryBase(
        'dream',
        '記得的夢境，都值得被寫下來。',
        [
          { id: newBlockId(), type: 'long_text', label: '記得的夢境內容是什麼？', required: true, voice: true },
          { id: newBlockId(), type: 'long_text', label: '醒來後，這個夢帶給你什麼感覺？', required: false, voice: true },
        ],
        '夢境是內心世界的另一種語言。',
      ),
  },
  {
    key: 'anxiety',
    emoji: '🌊',
    label: '焦慮追蹤日記',
    hint: '追蹤焦慮程度與誘發原因，找到讓自己好一點的方法',
    category: '情緒與覺察',
    build: () =>
      diaryBase(
        'anxiety',
        '記錄今天的焦慮狀態，練習辨認它從哪裡來。',
        [
          { id: newBlockId(), type: 'scale', label: '今天的焦慮程度', min: 1, max: 5, minLabel: '平靜', maxLabel: '強烈' },
          { id: newBlockId(), type: 'long_text', label: '如果有焦慮，是什麼觸發的？', required: false, voice: true },
          { id: newBlockId(), type: 'long_text', label: '你做了什麼讓自己好一點？', required: false, voice: true },
        ],
        '焦慮會過去，你已經在練習與它相處。',
      ),
  },
  // ── 成長與行動 ──
  {
    key: 'achievement',
    emoji: '🏆',
    label: '成就日記',
    hint: '記錄每天的小成就，累積自我肯定',
    category: '成長與行動',
    build: () =>
      diaryBase(
        'achievement',
        '再小的完成，都值得被記錄下來。',
        [
          { id: newBlockId(), type: 'long_text', label: '今天完成了什麼讓你有成就感的事？', required: true, voice: true },
          { id: newBlockId(), type: 'scale', label: '對這件事的滿意程度', min: 1, max: 5, minLabel: '普通', maxLabel: '非常滿意' },
        ],
        '每一個小成就，都是往前的一步。',
      ),
  },
  {
    key: 'goal_action',
    emoji: '🎯',
    label: '目標行動日記',
    hint: '追蹤朝目標邁進的具體行動',
    category: '成長與行動',
    build: () =>
      diaryBase(
        'goal_action',
        '寫下今天為你的目標做了什麼。',
        [
          { id: newBlockId(), type: 'long_text', label: '今天為你的目標做了什麼具體行動？', required: true, voice: true },
          { id: newBlockId(), type: 'scale', label: '今天的行動力', min: 1, max: 5, minLabel: '低落', maxLabel: '充沛' },
          { id: newBlockId(), type: 'long_text', label: '明天可以再往前一小步的是什麼？', required: false, voice: true },
        ],
        '持續往前，就是最好的節奏。',
      ),
  },
  {
    key: 'self_compassion',
    emoji: '🌱',
    label: '自我慈悲日記',
    hint: '練習用對待朋友的溫柔對待自己',
    category: '成長與行動',
    build: () =>
      diaryBase(
        'self_compassion',
        '練習用對待好朋友的方式，對待今天的自己。',
        [
          { id: newBlockId(), type: 'long_text', label: '今天有沒有對自己嚴厲的時刻？', required: true, voice: true },
          { id: newBlockId(), type: 'long_text', label: '如果是好朋友遇到同樣的事，你會怎麼安慰他？', required: false, voice: true },
        ],
        '你值得被自己溫柔以待。',
      ),
  },
  {
    key: 'creative',
    emoji: '💡',
    label: '創意靈感日記',
    hint: '捕捉靈光乍現的點子與想法',
    category: '成長與行動',
    build: () =>
      diaryBase(
        'creative',
        '把今天閃過的靈感記下來，別讓它溜走。',
        [
          { id: newBlockId(), type: 'long_text', label: '今天有什麼靈感或點子浮現？', required: true, voice: true },
          { id: newBlockId(), type: 'long_text', label: '這個點子讓你想到什麼？', required: false, voice: true },
        ],
        '靈感值得被認真對待。',
      ),
  },
  // ── 身體與生活 ──
  {
    key: 'sleep',
    emoji: '😴',
    label: '睡眠日記',
    hint: '追蹤睡眠品質與影響因素',
    category: '身體與生活',
    build: () =>
      diaryBase(
        'sleep',
        '記錄昨晚的睡眠狀態。',
        [
          { id: newBlockId(), type: 'scale', label: '昨晚的睡眠品質', min: 1, max: 5, minLabel: '很差', maxLabel: '很好' },
          { id: newBlockId(), type: 'short_text', label: '大約睡了幾小時？', required: false },
          { id: newBlockId(), type: 'long_text', label: '有沒有影響睡眠的原因？', required: false, voice: true },
        ],
        '好好休息，是照顧自己的第一步。',
      ),
  },
  {
    key: 'eating_awareness',
    emoji: '🍽️',
    label: '飲食覺察日記',
    hint: '練習覺察飢餓、飽足與情緒性進食',
    category: '身體與生活',
    build: () =>
      diaryBase(
        'eating_awareness',
        '練習覺察今天與食物的關係。',
        [
          { id: newBlockId(), type: 'long_text', label: '今天吃東西時，有沒有特別覺察到身體的飢餓或飽足感？', required: true, voice: true },
          { id: newBlockId(), type: 'long_text', label: '有沒有因為情緒而吃東西的時刻？', required: false, voice: true },
        ],
        '飲食覺察是認識自己的一種方式。',
      ),
  },
  {
    key: 'money_emotion',
    emoji: '💰',
    label: '金錢情緒日記',
    hint: '覺察花錢、存錢背後的情緒',
    category: '身體與生活',
    build: () =>
      diaryBase(
        'money_emotion',
        '記錄今天和金錢有關的情緒時刻。',
        [
          { id: newBlockId(), type: 'long_text', label: '今天有沒有和花錢/存錢有關的情緒時刻？', required: true, voice: true },
          { id: newBlockId(), type: 'scale', label: '對今天用錢方式的安心程度', min: 1, max: 5, minLabel: '不安', maxLabel: '安心' },
        ],
        '認識自己和金錢的關係，是理財的第一步。',
      ),
  },
  {
    key: 'digital_use',
    emoji: '📱',
    label: '數位使用日記',
    hint: '覺察手機與社群媒體使用後的感受',
    category: '身體與生活',
    build: () =>
      diaryBase(
        'digital_use',
        '記錄今天使用手機/社群媒體後的感受。',
        [
          { id: newBlockId(), type: 'long_text', label: '今天使用手機/社群媒體後，感覺如何？', required: true, voice: true },
          { id: newBlockId(), type: 'scale', label: '今天的數位使用滿意度', min: 1, max: 5, minLabel: '不太健康', maxLabel: '很健康' },
        ],
        '覺察使用習慣，找回主導權。',
      ),
  },
  // ── 空白日記 ──
  {
    key: 'blank_diary',
    emoji: '📝',
    label: '空白日記',
    hint: '只有開場與結語骨架，自由設計每日要填的題目',
    category: '',
    build: () => diaryBase('blank_diary', '', [], ''),
  },
]

export function emptyDiaryContent(): DiaryModuleContent {
  return diaryBase('blank_diary', '', [], '')
}

export function emptyAssessmentContent(): AssessmentModuleContent {
  return {
    v: 1,
    kind: 'assessment',
    source_scale: { name: '', note: '', origin: 'pasted' },
    dimensions: [],
    questions: [],
    intro: '',
    consent_text: '這些問題背後有心理學的評估架構，你的回答會幫助你的專業夥伴更了解你。沒有標準答案。',
    review_before_send: false,
  }
}

/** 常用量表快速帶入：只帶名稱與維度骨架提示文字，不內建受版權保護的完整題目。 */
export const COMMON_SCALE_PRESETS: { key: string; label: string; hint: string }[] = [
  { key: 'perma', label: 'PERMA-Profiler', hint: '幸福感五面向：情緒、投入、關係、意義、成就' },
  { key: 'ffmq', label: 'FFMQ', hint: '五因素正念量表：觀察、描述、覺察行動、不批判、不反應' },
  { key: 'phq9_gad7', label: 'PHQ-9 + GAD-7', hint: '憂鬱與焦慮症狀篩檢（含敏感題）' },
  { key: 'scs', label: 'SCS 自我慈悲量表', hint: '自我友善、共通人性、正念 vs. 自我批判、孤立感、過度認同' },
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
