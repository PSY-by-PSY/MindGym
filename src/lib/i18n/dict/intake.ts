import type { Translation } from '../dictionary'

// 入門偏好問卷（/intake，歡迎導覽之後、InMind 之前的 6 題點選）。
// 題目與選項原文定義在 src/lib/intake.ts，這裡只放翻譯。
export const intake: Record<string, Translation> = {
  // ── 頂部 / 導覽 ──────────────────────────────────────────
  '認識你': { 'zh-CN': '认识你', en: 'About you' },
  '先跳過': { 'zh-CN': '先跳过', en: 'Skip' },
  '上一題': { 'zh-CN': '上一题', en: 'Back' },
  '下一步': { 'zh-CN': '下一步', en: 'Next' },
  '第 {n} 題，共 {total} 題': { 'zh-CN': '第 {n} 题，共 {total} 题', en: 'Question {n} of {total}' },
  '最多選 2 個': { 'zh-CN': '最多选 2 个', en: 'Pick up to 2' },
  '可以複選': { 'zh-CN': '可以复选', en: 'Pick all that apply' },
  '這些答案只用來安排你的練習，不會公開。': {
    'zh-CN': '这些答案只用来安排你的练习，不会公开。',
    en: 'Your answers are only used to arrange your practice. They are never public.',
  },

  // ── Q1 ──────────────────────────────────────────────────
  '最近是什麼讓你想打開這個 App？': { 'zh-CN': '最近是什么让你想打开这个 App？', en: 'What brought you here lately?' },
  '壓力爆表': { 'zh-CN': '压力爆表', en: 'Stress is through the roof' },
  '情緒起伏大': { 'zh-CN': '情绪起伏大', en: 'Big mood swings' },
  '睡不好': { 'zh-CN': '睡不好', en: 'Not sleeping well' },
  '關係卡住': { 'zh-CN': '关系卡住', en: 'Stuck in a relationship' },
  '提不起勁、找不到方向': { 'zh-CN': '提不起劲、找不到方向', en: 'No drive, no direction' },
  '想更認識自己': { 'zh-CN': '想更认识自己', en: 'Want to know myself better' },
  '只是好奇看看': { 'zh-CN': '只是好奇看看', en: 'Just curious' },

  // ── Q2 ──────────────────────────────────────────────────
  '現在的你比較像？': { 'zh-CN': '现在的你比较像？', en: 'Right now, you are…' },
  '還撐得住，想先預防': { 'zh-CN': '还撑得住，想先预防', en: 'Holding up, here to stay ahead' },
  '有點累，想調整一下': { 'zh-CN': '有点累，想调整一下', en: 'A bit worn out, want to reset' },
  '蠻辛苦的，需要一些支持': { 'zh-CN': '蛮辛苦的，需要一些支持', en: 'Struggling, could use some support' },
  '說不上來': { 'zh-CN': '说不上来', en: 'Hard to say' },

  // ── Q3 ──────────────────────────────────────────────────
  '你希望這裡幫你做到什麼？': { 'zh-CN': '你希望这里帮你做到什么？', en: 'What do you hope to get here?' },
  '每天有個小習慣穩住自己': { 'zh-CN': '每天有个小习惯稳住自己', en: 'A small daily habit to steady myself' },
  '學會處理某種情緒': { 'zh-CN': '学会处理某种情绪', en: 'Learn to handle a certain emotion' },
  '有專業夥伴陪我走一段': { 'zh-CN': '有专业伙伴陪我走一段', en: 'A professional to walk with me for a while' },
  '記錄下來，看見自己的變化': { 'zh-CN': '记录下来，看见自己的变化', en: 'Keep a record and see how I change' },

  // ── Q4 ──────────────────────────────────────────────────
  '你之前試過哪些方式？': { 'zh-CN': '你之前试过哪些方式？', en: 'What have you tried before?' },
  '寫日記': { 'zh-CN': '写日记', en: 'Journaling' },
  '冥想或呼吸練習': { 'zh-CN': '冥想或呼吸练习', en: 'Meditation or breathing' },
  '運動': { 'zh-CN': '运动', en: 'Exercise' },
  '找朋友聊': { 'zh-CN': '找朋友聊', en: 'Talking to friends' },
  '心理諮詢或晤談': { 'zh-CN': '心理咨询或晤谈', en: 'Counseling sessions' },
  '沒特別做過': { 'zh-CN': '没特别做过', en: 'Nothing in particular' },

  // ── Q5 ──────────────────────────────────────────────────
  '一天能留給自己多久？': { 'zh-CN': '一天能留给自己多久？', en: 'How much time can you give yourself a day?' },
  '3 分鐘': { 'zh-CN': '3 分钟', en: '3 minutes' },
  '5 分鐘': { 'zh-CN': '5 分钟', en: '5 minutes' },
  '10 分鐘以上': { 'zh-CN': '10 分钟以上', en: '10 minutes or more' },
  '看那天心情': { 'zh-CN': '看那天心情', en: 'Depends on the day' },

  // ── Q6 ──────────────────────────────────────────────────
  '你比較喜歡哪種練習方式？': { 'zh-CN': '你比较喜欢哪种练习方式？', en: 'Which kind of practice do you prefer?' },
  '寫下來': { 'zh-CN': '写下来', en: 'Writing' },
  '聽引導': { 'zh-CN': '听引导', en: 'Guided audio' },
  '點選就好，不想打字': { 'zh-CN': '点选就好，不想打字', en: 'Tapping, no typing' },
  '都可以': { 'zh-CN': '都可以', en: 'Anything works' },

  // ── 過場 / 完成頁 ───────────────────────────────────────
  '正在為你安排…': { 'zh-CN': '正在为你安排…', en: 'Arranging things for you…' },
  '為你安排好了': { 'zh-CN': '为你安排好了', en: 'All set for you' },
  '你告訴我們：': { 'zh-CN': '你告诉我们：', en: 'You told us:' },
  '我們先幫你排了「{practice}」。接下來 5 題 InMind 測驗，會讓安排更準。': {
    'zh-CN': '我们先帮你排了「{practice}」。接下来 5 题 InMind 测验，会让安排更准。',
    en: 'We lined up "{practice}" for you first. The 5-question InMind assessment next will sharpen the plan.',
  },
  '我們先幫你排了「{practice}」，一起從這裡開始。': {
    'zh-CN': '我们先帮你排了「{practice}」，一起从这里开始。',
    en: 'We lined up "{practice}" for you. Let’s start there.',
  },
  '開始 InMind 測驗': { 'zh-CN': '开始 InMind 测验', en: 'Start InMind assessment' },
  '先跳過，直接練習': { 'zh-CN': '先跳过，直接练习', en: 'Skip for now, go practice' },
  '如果此刻真的很難撐，你不用一個人扛：安心專線 1925（24 小時）、生命線 1995 都在。': {
    'zh-CN': '如果此刻真的很难撑，你不用一个人扛：安心专线 1925（24 小时）、生命线 1995 都在。',
    en: 'If things feel too heavy right now, you do not have to carry it alone: Taiwan’s 1925 (24h) and 1995 lifelines are there.',
  },
  '感恩日記': { 'zh-CN': '感恩日记', en: 'Gratitude Journal' },
  '自我慈悲': { 'zh-CN': '自我慈悲', en: 'Self-Compassion' },
  'WOOP 目標實踐': { 'zh-CN': 'WOOP 目标实践', en: 'WOOP Goal Practice' },
  '過程目標覺察': { 'zh-CN': '过程目标觉察', en: 'Process Goal Awareness' },
}
