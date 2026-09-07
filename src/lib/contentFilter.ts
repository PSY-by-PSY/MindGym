// 發佈前的內容過濾（App Store 審查指南 1.2 的第一項要求）。
//
// 1.2 對 UGC App 的四項要求裡，我們原本只做了「檢舉」與「封鎖」，缺的是
// 「a method for filtering objectionable material from being posted to the app」——
// 也就是「內容進資料庫之前要先擋」。這支檔案就是那個 filter 的規則來源。
//
// 兩層防線，缺一不可：
//   ① 這裡（前端）：送出前先擋，使用者當下就看到為什麼不能發，體驗好，也省一次來回。
//   ② DB trigger（supabase/community_safety.sql 的 moderation_rules + enforce_content_moderation）：
//      前端用的是 anon key + RLS 直接寫入，任何人都能繞過前端直接打 PostgREST，
//      所以真正「擋得住」的是資料庫那一層。前端這層純粹是體驗。
//   兩層的規則字串刻意寫成一模一樣（見下方 RULES 的 source 與 SQL 的 seed），
//   改任何一邊都要同步另一邊。
//
// 自傷字眼的界線（2026-09-07 第二輪送審回饋修正，別再簡化成「自傷一律不擋」）：
//   ① 第一人稱的痛苦——「我不想活了」「我活不下去」「我好想消失」——一個字都不擋。
//      這是一個心理健康 App，那是我們最需要接住的時刻，擋掉只會讓他學會不寫。
//      那條路走的是 crisis_alerts / 危機資源引導，不在這支過濾器的職責範圍內。
//   ② 但「鼓勵、教唆、指導、美化他人自傷或自殺」是完全不同的一件事。
//      「大家都去自殺吧」「教你無痛自殺」不是求助，是傷害別人，而且只可能出現在公開內容。
//      原本的規則跳過整個自傷主題，導致這類貼文不命中仇恨／騷擾／暴力任何一條，
//      公開發得出去——直接違反服務條款第四節的零容忍條款。
//      → category 'self_harm_promotion' + action 'hide'。
//   兩者的差別寫死在 pattern 裡：每一條規則都必須含第二人稱、祈使、教學或揪團的成分。
//
// 分級：
//   'block' —— 直接擋下，不寫進 DB（仇恨、露骨性內容、暴力威脅、招攬廣告、強烈辱罵）。
//   'hide'  —— 前端不阻止送出，DB trigger 把它寫進去但立刻設成 hidden（公開動態牆看不到），
//              同時自動開一筆待審紀錄。鼓勵自傷／自殺用這級。
//              為什麼不在前端跳提示：一來要留下證據給人工審核與累犯判斷（block 會讓交易回滾，
//              什麼都不留），二來不告訴發文者哪個字被抓到，否則換個寫法就繞過去了。
//   'flag'  —— 照常發佈，但自動在 reports 建一筆 source='auto' 的待審紀錄，
//              進管理後台「檢舉處理」佇列由人審。輕度髒話用這級，避免誤殺。

export type FilterCategory = 'hate' | 'harassment' | 'sexual' | 'violence' | 'spam' | 'self_harm_promotion'
export type FilterAction = 'block' | 'hide' | 'flag'

interface Rule {
  category: FilterCategory
  action: FilterAction
  /**
   * 正則字串。與 SQL moderation_rules.pattern「逐字元相同」——刻意不用 \b 之類
   * PostgreSQL ARE 不支援的語法（Postgres 的 \b 是退格字元，不是字界），
   * 兩邊才能共用同一串。改任何一邊都要同步另一邊。
   */
  source: string
  /** true = 比對「去掉空白與分隔符號」後的字串（中文用，防「幹 你 娘」這種拆字規避）。 */
  normalized: boolean
}

// ⚠️ 這份清單與 supabase/community_safety.sql 的 moderation_rules seed 必須一致。
const RULES: Rule[] = [
  // ── 仇恨言論 / 歧視 ──────────────────────────────────────────────────
  { category: 'hate', action: 'block', normalized: true,
    source: '支那|台巴子|死黑鬼|死同性戀|死gay|死玻璃|人妖|殘廢廢物' },
  { category: 'hate', action: 'block', normalized: false,
    source: 'nigger|faggot|chink|tranny' },

  // ── 人身攻擊 / 辱罵 ──────────────────────────────────────────────────
  { category: 'harassment', action: 'block', normalized: true,
    source: '幹你娘|幹您娘|干你娘|操你媽|操你妈|肏你|去你媽|婊子|賤人|賤貨|王八蛋|下賤胚|腦殘|智障' },
  { category: 'harassment', action: 'block', normalized: false,
    source: 'fuck\\s*you|bitch|asshole|retard' },
  { category: 'harassment', action: 'flag', normalized: true,
    source: '白癡|白痴|靠北|靠腰|廢物|滾開|閉嘴' },

  // ── 露骨性內容 ────────────────────────────────────────────────────────
  { category: 'sexual', action: 'block', normalized: true,
    source: '約砲|約炮|一夜情|裸聊|援交|買春|嫖妓|色情片|情色網|做愛影片|自慰片|口交|肛交|a片|av女優' },
  { category: 'sexual', action: 'block', normalized: false,
    source: 'porn|nudes|sexcam' },

  // ── 暴力威脅（指向他人才算；自傷字眼不在此列，見檔頭）────────────────
  { category: 'violence', action: 'block', normalized: true,
    source: '殺了你|殺你全家|砍死你|弄死你|打死你|捅死你|你去死|滾去死|去死吧' },

  // ── 垃圾訊息 / 招攬廣告 ──────────────────────────────────────────────
  { category: 'spam', action: 'block', normalized: true,
    source: '加賴|賴id|加line|lineid|微信號|博弈|娛樂城|百家樂|六合彩|包養|代辦貸款|刷單|兼職日結|保證獲利|穩賺不賠' },

  // ── 鼓勵 / 教唆 / 指導 / 美化他人自傷或自殺 ───────────────────────────
  // 見檔頭②。這四條全部帶第二人稱、祈使、教學或揪團的成分，
  // 第一人稱的痛苦（我不想活了／我好想消失）刻意不會命中任何一條。
  { category: 'self_harm_promotion', action: 'hide', normalized: true,
    source: '你去自殺|妳去自殺|你們去自殺|大家去自殺|大家都去自殺|一起去自殺|一起自殺|去自殺吧|快去自殺|建議你自殺|勸你自殺|你該自殺|你就自殺|你們都去死|大家都去死|全部都去死|一起去死|你不如去死|你不如死一死|你死一死|你死了比較好|世界少一個你|你活著只是浪費|沒人需要你活著|你這種人就該去死' },
  { category: 'self_harm_promotion', action: 'hide', normalized: true,
    source: '自殺方法|自殺教學|自殺攻略|自殺懶人包|怎麼自殺|怎樣自殺|如何自殺|無痛自殺|最快自殺|自殘方法|自殘教學|割腕方法|割腕教學|上吊方法|上吊教學|燒炭方法|燒炭教學|燒炭懶人包|致死劑量|吃幾顆會死|吃多少會死|跳樓教學|催吐教學|催吐方法|絕食教學' },
  { category: 'self_harm_promotion', action: 'hide', normalized: true,
    source: '自殺是解脫|自殺才是解脫|自殘很爽|割腕很爽|鼓勵自殺|揪團自殺|揪人自殺|相約自殺|約自殺|自殺互助|求死同伴|一起走的夥伴|想死的一起' },
  { category: 'self_harm_promotion', action: 'hide', normalized: false,
    source: 'kill\\s*your\\s*self|kill\\s*urself|(^|[^a-z])kys([^a-z]|$)|go\\s*kill\\s*yourself|hang\\s*yourself|slit\\s*your\\s*wrist|end\\s*your\\s*life|you\\s*should\\s*die|suicide\\s*method|how\\s*to\\s*(kill\\s*yourself|commit\\s*suicide)|painless\\s*(suicide|death)|best\\s*way\\s*to\\s*die|self\\s*-?\\s*harm\\s*tips|pro\\s*-?\\s*ana|pro\\s*-?\\s*mia|thinspo' },
]

const COMPILED = RULES.map((r) => ({ ...r, re: new RegExp(r.source, 'i') }))

/**
 * 正規化：拿掉空白、零寬字元與常見的拆字分隔符號，並轉小寫。
 * 「幹 你 娘」「幹.你.娘」「幹*你*娘」都會還原成同一串再比對。
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    // 零寬字元用交替而非字元類別：ZWJ 放在字元類別裡會被 eslint
    // no-misleading-character-class 擋下（它可能與前後字元組成合體字）。
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')
    .replace(/[\s._*·、,，~^-]/g, '')
}

export interface FilterHit {
  category: FilterCategory
  action: FilterAction
}

export interface FilterResult {
  /** true = 送得出去（可能仍帶 flags / hidden，代表發得出去但不會直接公開或要送審）。 */
  ok: boolean
  /** 造成擋下的類別（ok=false 時必有）。 */
  blocked: FilterCategory | null
  /** 需要事後送審的類別。 */
  flags: FilterCategory[]
  /**
   * 送得出去、但 DB 會立刻把它設成 hidden 並自動送審的類別（鼓勵自傷／自殺）。
   * ok 仍為 true：前端刻意不阻止、也不提示，理由見檔頭「分級」的 'hide'。
   * 呼叫端一般不需要理會這個欄位，它存在是為了讓這件事在型別上是明講的，
   * 而不是被混進 flags 裡看起來像「輕度髒話」。
   */
  hidden: FilterCategory[]
}

/**
 * 檢查一段（或數段）使用者輸入。
 * 傳入 null/undefined/空字串會被忽略，呼叫端可以直接把整組欄位丟進來。
 */
export function screenContent(...texts: (string | null | undefined)[]): FilterResult {
  const joined = texts.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).join('\n')
  if (!joined) return { ok: true, blocked: null, flags: [], hidden: [] }

  const plain = joined.toLowerCase()
  const squashed = normalize(joined)
  const flags = new Set<FilterCategory>()
  const hidden = new Set<FilterCategory>()

  for (const rule of COMPILED) {
    if (!rule.re.test(rule.normalized ? squashed : plain)) continue
    if (rule.action === 'block') return { ok: false, blocked: rule.category, flags: [], hidden: [] }
    if (rule.action === 'hide') hidden.add(rule.category)
    else flags.add(rule.category)
  }
  return { ok: true, blocked: null, flags: [...flags], hidden: [...hidden] }
}

// 'suspended' 不是內容分類，是「這個帳號被停權了」——只會從 DB trigger 回來，
// 前端過濾器不會產生。放進同一組訊息表，是因為對使用者而言都是「這則發不出去」，
// 走同一條顯示路徑最單純。
export type BlockReason = FilterCategory | 'suspended'

// 擋下時給使用者看的訊息。講清楚是哪一類，才不會變成「莫名其妙發不出去」。
const CATEGORY_MESSAGE: Record<BlockReason, string> = {
  hate: '這段文字包含仇恨或歧視字眼，無法發佈到社群。',
  harassment: '這段文字包含攻擊或辱罵他人的字眼，無法發佈到社群。',
  sexual: '這段文字包含露骨的性內容，無法發佈到社群。',
  violence: '這段文字包含威脅他人的字眼，無法發佈到社群。',
  spam: '這段文字看起來是廣告或招攬訊息，無法發佈到社群。',
  // 這一句正常情況下不會出現：self_harm_promotion 在兩層都是 'hide'，不是 'block'。
  // 留著是為了兩件事：① Record<BlockReason> 必須列滿；② 管理員若在後台把這類規則
  // 改成 block 級（moderation_rules.action 可改），使用者要看到人話而不是原始 SQL 錯誤。
  self_harm_promotion: '這段文字看起來在鼓勵或教導他人自我傷害，無法發佈到社群。如果此刻難受的是你自己，請撥打安心專線 1925（24 小時免付費）或生命線 1995，緊急狀況請撥 119。',
  suspended: '你的帳號因違反社群守則暫時無法發佈內容。私人日記仍可正常書寫，有疑問請從「設定 → 聯絡我們」與我們聯繫。',
}

export function blockedMessage(reason: BlockReason): string {
  return CATEGORY_MESSAGE[reason]
}

/**
 * 內容被擋下時丟出的錯誤。
 * message 是中文原句（可直接丟給 t() 翻譯），呼叫端用 instanceof 判斷後跳提示。
 */
export class ContentBlockedError extends Error {
  readonly category: BlockReason
  constructor(category: BlockReason) {
    super(blockedMessage(category))
    this.name = 'ContentBlockedError'
    this.category = category
  }
}

/** 檢查並在違規時丟出 ContentBlockedError；同時回傳需送審的 flags。 */
export function assertPublishable(...texts: (string | null | undefined)[]): FilterCategory[] {
  const result = screenContent(...texts)
  if (!result.ok && result.blocked) throw new ContentBlockedError(result.blocked)
  return result.flags
}

// DB trigger 擋下時回傳的錯誤訊息前綴（見 community_safety.sql 的 RAISE EXCEPTION）。
// 前端規則與 DB 規則理論上一致，但萬一 DB 那份比較新（管理員在後台加了新詞），
// 使用者會拿到這個錯誤——一樣要翻成人話，不能顯示原始 SQL 錯誤。
const DB_BLOCK_PREFIX = 'CONTENT_BLOCKED:'

/** 把 Supabase 回傳的 error 轉成 ContentBlockedError；不是內容問題就回 null。 */
export function toContentBlockedError(error: { message?: string } | null | undefined): ContentBlockedError | null {
  const message = error?.message ?? ''
  if (!message.includes(DB_BLOCK_PREFIX)) return null
  const reason = message.split(DB_BLOCK_PREFIX)[1]?.trim().split(/\s/)[0] as BlockReason
  return new ContentBlockedError(reason in CATEGORY_MESSAGE ? reason : 'harassment')
}
