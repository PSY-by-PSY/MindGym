import type { Translation } from '../dictionary'

// 登入後的歡迎導覽（/welcome，共 6 頁）。
//
// ⚠️ 標題是用片段組合的（中間夾 <br /> 與變色 <span>），例如：
//     {t('和大家')}<span>{t('一起')}</span><br />{t('堅持下去')}
//    中文字之間不需要空格，但英文需要。沿用 welcome.tsx 既有的處理方式：
//    **把必要的空格直接寫進翻譯字串裡**（例如 'Keep going ' 結尾留一格），
//    否則英文會黏成 "togetherKeep going" 這種樣子。
//    修改這裡的翻譯時，請一併確認相鄰片段的空格有沒有被吃掉。
export const welcome: Record<string, Translation> = {
  // ── 第 1 頁：歡迎 ──────────────────────────────────────────────────────
  '歡迎加入': { 'zh-CN': '欢迎加入', en: 'Welcome' },
  // title：{t('嗨，歡迎來到')}<br /><span>PSY by PSY</span><br />{t('心理健身房')}
  '嗨，歡迎來到': { 'zh-CN': '嗨，欢迎来到', en: 'Hi, welcome to' },
  '心理健身房': { 'zh-CN': '心理健身房', en: 'your mental gym' },
  '就像上健身房鍛鍊身體，這裡陪你一天練一點，把心理練得更強壯、更有彈性。': {
    'zh-CN': '就像上健身房锻炼身体，这里陪你一天练一点，把心理练得更强壮、更有弹性。',
    en: 'Just like training your body at the gym, we train your mind a little each day — stronger and more resilient.',
  },
  'PSY by PSY 教練': { 'zh-CN': 'PSY by PSY 教练', en: 'PSY by PSY Coach' },

  // ── 第 2 頁：為什麼是這裡 ──────────────────────────────────────────────
  // title：{t('你照顧身體，')}<br />{t('也值得')}<span>{t('好好照顧心理')}</span>
  // ⚠️「也值得」與「好好照顧心理」在英文需要一個空格，寫在前者結尾。
  '為什麼是這裡': { 'zh-CN': '为什么是这里', en: 'Why here' },
  '你照顧身體，': { 'zh-CN': '你照顾身体，', en: 'You take care of your body —' },
  '也值得': { 'zh-CN': '也值得', en: 'you deserve to ' },
  '好好照顧心理': { 'zh-CN': '好好照顾心理', en: 'care for your mind too' },
  '壓力、情緒、關係…心理狀態看不見，卻一直影響著你。我們把它變成看得見、也練得動的。': {
    'zh-CN': '压力、情绪、关系…心理状态看不见，却一直影响着你。我们把它变成看得见、也练得动的。',
    en: 'Stress, emotions, relationships — your inner state is invisible, yet it shapes everything. We make it visible, and trainable.',
  },
  '照顧自己的心理': { 'zh-CN': '照顾自己的心理', en: 'Caring for your mind' },

  // ── 第 3 頁：PERMA ────────────────────────────────────────────────────
  // title：{t('用 ')}<span>PERMA</span>{t(' 五大指數')}<br />{t('看懂你的幸福狀態')}
  // ⚠️ 這兩個片段的前後空格是刻意保留的，刪掉英文會黏在一起。
  '有科學根據': { 'zh-CN': '有科学根据', en: 'Backed by science' },
  '用 ': { 'zh-CN': '用 ', en: 'The five ' },
  ' 五大指數': { 'zh-CN': ' 五大指数', en: ' dimensions' },
  '看懂你的幸福狀態': { 'zh-CN': '看懂你的幸福状态', en: 'that map your well-being' },
  '正向情緒、投入、關係、意義、成就 — 正向心理學的黃金框架，量出你的隱藏心理優勢。': {
    'zh-CN': '正向情绪、投入、关系、意义、成就 — 正向心理学的黄金框架，量出你的隐藏心理优势。',
    en: 'Positive Emotion, Engagement, Relationships, Meaning, Accomplishment — the gold-standard framework of positive psychology, revealing your hidden strengths.',
  },

  // ── 第 4 頁：每日練習 ─────────────────────────────────────────────────
  // title：{t('用小小的練習')}<br />{t('累積')}<span>{t('大大的改變')}</span>
  '每天五分鐘': { 'zh-CN': '每天五分钟', en: 'Five minutes a day' },
  '用小小的練習': { 'zh-CN': '用小小的练习', en: 'Small practices,' },
  '累積': { 'zh-CN': '累积', en: 'building ' },
  '大大的改變': { 'zh-CN': '大大的改变', en: 'big change' },
  '感恩日記、過程目標覺察、三件好事…每天一個微練習，輕鬆養成好心情的習慣。': {
    'zh-CN': '感恩日记、过程目标觉察、三件好事…每天一个微练习，轻松养成好心情的习惯。',
    en: 'Gratitude journaling, process-goal awareness, three good things — one micro-practice a day makes a good mood a habit.',
  },
  '每日練習': { 'zh-CN': '每日练习', en: 'Daily practice' },

  // ── 第 5 頁：社群 ─────────────────────────────────────────────────────
  // title：{t('和大家')}<span>{t('一起')}</span><br />{t('堅持下去')}
  // ⚠️「和大家」結尾留一格，否則英文會變成 "Withothers"。
  '你不是一個人': { 'zh-CN': '你不是一个人', en: 'You are not alone' },
  '和大家': { 'zh-CN': '和大家', en: 'Keep going ' },
  '一起': { 'zh-CN': '一起', en: 'together' },
  '堅持下去': { 'zh-CN': '坚持下去', en: 'with everyone else' },
  '連續打卡累積連勝、在社群裡互相打氣，把好習慣變得更有溫度、更走得遠。': {
    'zh-CN': '连续打卡累积连胜、在社区里互相打气，把好习惯变得更有温度、更走得远。',
    en: 'Build streaks, cheer each other on — good habits go further when they are shared.',
  },
  '社群夥伴互相打氣': { 'zh-CN': '社区伙伴互相打气', en: 'Community members cheering each other on' },

  // ── 第 6 頁：導向 InMind 測驗 ─────────────────────────────────────────
  // title：{t('先來測出你的')}<br /><span>{t('幸福指數')}</span>
  // ⚠️ 這裡刻意「不」重用 pretest.ts 的「你的」——那個 key 為了 InMind 首頁的
  //    英文語序被翻成 'How high is your '，套到這裡會變成語意不通的句子。
  '最後一步': { 'zh-CN': '最后一步', en: 'One last step' },
  '先來測出你的': { 'zh-CN': '先来测出你的', en: 'Start by measuring your' },
  '幸福指數': { 'zh-CN': '幸福指数', en: 'happiness index' },
  '花 5 分鐘完成 InMind 心理測驗，我們就能為你量身推薦最適合的練習，開始你的心理健身旅程。': {
    'zh-CN': '花 5 分钟完成 InMind 心理测验，我们就能为你量身推荐最适合的练习，开始你的心理健身旅程。',
    en: 'Take the 5-minute InMind assessment and we will tailor the right practices for you — your mental fitness journey starts here.',
  },
  'InMind 心理測驗': { 'zh-CN': 'InMind 心理测验', en: 'InMind assessment' },

  // ── 導覽列 ────────────────────────────────────────────────────────────
  '略過': { 'zh-CN': '略过', en: 'Skip' },
  '繼續': { 'zh-CN': '继续', en: 'Continue' },
  '開始我的第一次測驗': { 'zh-CN': '开始我的第一次测验', en: 'Take my first assessment' },
}
