import type { Translation } from '../dictionary'

// 使用者預覽（模組市集）— /admin 與 /therapist 的預覽分頁介面字串。
// 市集內的示意模組／夥伴假資料不翻譯（正式內容上線後由資料層處理多語）。
export const marketplace: Record<string, Translation> = {
  '使用者預覽': { 'zh-CN': '用户预览', en: 'User Preview' },
  '預覽模式': { 'zh-CN': '预览模式', en: 'Preview mode' },
  '這是使用者在 App 裡看到的模組市集。互動僅供體驗，不會寫入任何資料。': {
    'zh-CN': '这是用户在 App 里看到的模块市集。互动仅供体验，不会写入任何数据。',
    en: 'This is the module marketplace as users see it. Interactions are demo-only — nothing is saved.',
  },
  '重設預覽': { 'zh-CN': '重置预览', en: 'Reset preview' },
  '探索健心市集': { 'zh-CN': '探索健心市集', en: 'Explore the MindGym Marketplace' },
  '來自不同專業夥伴的練習、日記與測驗模組，用 credits 預約加入。': {
    'zh-CN': '来自不同专业伙伴的练习、日记与测验模块，用 credits 预约加入。',
    en: 'Practices, diaries and assessments from different professionals — book with credits.',
  },
  '探索': { 'zh-CN': '探索', en: 'Explore' },
  '收藏': { 'zh-CN': '收藏', en: 'Saved' },
  '取消收藏': { 'zh-CN': '取消收藏', en: 'Unsave' },
  '我的課程': { 'zh-CN': '我的课程', en: 'My Programs' },
  '心理諮詢': { 'zh-CN': '心理咨询', en: 'Consultation' },
  '生涯教練': { 'zh-CN': '生涯教练', en: 'Coaching' },
  '身心靈': { 'zh-CN': '身心灵', en: 'Mind & Spirit' },
  '測驗量表': { 'zh-CN': '测验量表', en: 'Assessments' },
  '教練': { 'zh-CN': '教练', en: 'Coaching' },
  '免費': { 'zh-CN': '免费', en: 'Free' },
  '免費加入': { 'zh-CN': '免费加入', en: 'Join for free' },
  '已加入': { 'zh-CN': '已加入', en: 'Joined' },
  '查看詳情': { 'zh-CN': '查看详情', en: 'View details' },
  '{n} 人參與過': { 'zh-CN': '{n} 人参与过', en: '{n} participants' },
  '這個模組包含': { 'zh-CN': '这个模块包含', en: "What's included" },
  '目前餘額 {n}': { 'zh-CN': '当前余额 {n}', en: 'Balance: {n}' },
  '用 {n} credits 預約': { 'zh-CN': '用 {n} credits 预约', en: 'Book for {n} credits' },
  '確認用 {n} credits 預約「{title}」？': {
    'zh-CN': '确认用 {n} credits 预约「{title}」？',
    en: 'Book "{title}" for {n} credits?',
  },
  '確認加入「{title}」？免費模組不扣 credits。': {
    'zh-CN': '确认加入「{title}」？免费模块不扣 credits。',
    en: 'Join "{title}"? Free modules don\'t use credits.',
  },
  '餘額將剩下 {n} credits。': { 'zh-CN': '余额将剩下 {n} credits。', en: '{n} credits will remain.' },
  '確認預約': { 'zh-CN': '确认预约', en: 'Confirm booking' },
  '再想想': { 'zh-CN': '再想想', en: 'Not yet' },
  'credits 不足，還差 {n}。儲值後即可預約。': {
    'zh-CN': 'credits 不足，还差 {n}。充值后即可预约。',
    en: 'Not enough credits — {n} more needed. Top up to book.',
  },
  '通過後才會扣除': { 'zh-CN': '通过后才会扣除', en: 'Charged only if approved' },
  '簡單說說你的期待或狀況（選填）': {
    'zh-CN': '简单说说你的期待或状况（选填）',
    en: 'Tell us a bit about your expectations (optional)',
  },
  '送出申請': { 'zh-CN': '提交申请', en: 'Submit application' },
  '已送出申請，等待專業夥伴確認。': {
    'zh-CN': '已提交申请，等待专业伙伴确认。',
    en: 'Application sent — waiting for the professional to confirm.',
  },
  '可在「我的課程」追蹤申請狀態。': {
    'zh-CN': '可在「我的课程」跟踪申请状态。',
    en: 'Track your application in "My Programs".',
  },
  '取消申請': { 'zh-CN': '取消申请', en: 'Withdraw application' },
  '✓ 已加入！到「我的課程」隨時開始練習。': {
    'zh-CN': '✓ 已加入！到「我的课程」随时开始练习。',
    en: '✓ Joined! Start anytime from "My Programs".',
  },
  '開始練習': { 'zh-CN': '开始练习', en: 'Start' },
  '進度 0% · 剛開始': { 'zh-CN': '进度 0% · 刚开始', en: '0% · just started' },
  '還沒有收藏。點卡片右上角的 ♡，把喜歡的模組收進這裡。': {
    'zh-CN': '还没有收藏。点卡片右上角的 ♡，把喜欢的模块收进这里。',
    en: 'Nothing saved yet. Tap the ♡ on a card to save it here.',
  },
  '還沒有加入任何課程。到「探索」用 credits 預約第一個模組吧！': {
    'zh-CN': '还没有加入任何课程。到「探索」用 credits 预约第一个模块吧！',
    en: 'No programs yet. Head to Explore and book your first module with credits!',
  },
}
