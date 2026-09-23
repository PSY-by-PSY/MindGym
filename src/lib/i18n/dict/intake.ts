import type { Translation } from '../dictionary'

// 入門偏好問卷（/intake，歡迎導覽之後、InMind 之前的 11 題點選）。
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

  // ── v2：Boaba 教練陪填、插話頁、新增三題 ─────────────────────
  '生活習慣': { 'zh-CN': '生活习惯', en: 'Habits' },
  '關於你': { 'zh-CN': '关于你', en: 'About you' },
  'Boaba 教練': { 'zh-CN': 'Boaba 教练', en: 'Coach Boaba' },
  '嗨，我是 Boaba，你的心理健身教練。': { 'zh-CN': '嗨，我是 Boaba，你的心理健身教练。', en: "Hi, I'm Boaba, your mental fitness coach." },
  '先讓我認識你一下，大概一分鐘，好幫你排第一個練習。': {
    'zh-CN': '先让我认识你一下，大概一分钟，好帮你排第一个练习。',
    en: 'Let me get to know you first, about a minute, so I can line up your first practice.',
  },
  '好，開始吧': { 'zh-CN': '好，开始吧', en: "Let's go" },
  '整份跳過，直接進 App': { 'zh-CN': '整份跳过，直接进 App', en: 'Skip all, go to the app' },
  '9 題 · 全部用點的 · 每題都可以跳過': { 'zh-CN': '9 题 · 全部用点的 · 每题都可以跳过', en: '9 questions · all taps · skip any of them' },
  '先聊聊，最近是什麼讓你想來健心房的？': { 'zh-CN': '先聊聊，最近是什么让你想来健心房的？', en: 'First, what brought you to the mind gym lately?' },
  '這陣子的你，大概是哪一種狀態？沒有標準答案。': { 'zh-CN': '这阵子的你，大概是哪一种状态？没有标准答案。', en: 'Which of these feels most like you these days? No right answer.' },
  '那你希望我在這裡幫你做到什麼？': { 'zh-CN': '那你希望我在这里帮你做到什么？', en: 'What do you hope I can help you with here?' },
  '以前有試過哪些照顧自己的方法嗎？': { 'zh-CN': '以前有试过哪些照顾自己的方法吗？', en: 'What have you tried before to take care of yourself?' },
  '一天大概能留多少時間給自己？我照這個幫你排。': { 'zh-CN': '一天大概能留多少时间给自己？我照这个帮你排。', en: 'How much time a day can you keep for yourself? I will plan around it.' },
  '練習的方式，你比較喜歡哪一種？': { 'zh-CN': '练习的方式，你比较喜欢哪一种？', en: 'Which way of practicing do you prefer?' },
  '要不要我在固定時間提醒你？選一個最順手的時段。': { 'zh-CN': '要不要我在固定时间提醒你？选一个最顺手的时段。', en: 'Want a reminder at a set time? Pick the slot that fits best.' },
  '想在什麼時候收到練習提醒？': { 'zh-CN': '想在什么时候收到练习提醒？', en: 'When would you like a practice reminder?' },
  '早上出門前': { 'zh-CN': '早上出门前', en: 'Morning, before heading out' },
  '午休': { 'zh-CN': '午休', en: 'Lunch break' },
  '睡前': { 'zh-CN': '睡前', en: 'Before bed' },
  '先不用': { 'zh-CN': '先不用', en: 'Not for now' },
  '最後兩題，讓我更了解你一點。你現在主要是？': { 'zh-CN': '最后两题，让我更了解你一点。你现在主要是？', en: 'Last two. To know you a bit better: right now you are mainly…' },
  '你現在的身份主要是？': { 'zh-CN': '你现在的身份主要是？', en: 'What best describes you now?' },
  '學生': { 'zh-CN': '学生', en: 'Student' },
  '上班族': { 'zh-CN': '上班族', en: 'Office worker' },
  '照顧者或家長': { 'zh-CN': '照顾者或家长', en: 'Caregiver or parent' },
  '自由工作者': { 'zh-CN': '自由工作者', en: 'Freelancer' },
  '其他': { 'zh-CN': '其他', en: 'Other' },
  '你的年齡層大概是？這題只用來讓練習內容更貼近你。': { 'zh-CN': '你的年龄层大概是？这题只用来让练习内容更贴近你。', en: 'Roughly which age group? Only used to fit the practice to you.' },
  '你的年齡層是？': { 'zh-CN': '你的年龄层是？', en: 'Your age group?' },
  '18–24 歲': { 'zh-CN': '18–24 岁', en: '18–24' },
  '25–34 歲': { 'zh-CN': '25–34 岁', en: '25–34' },
  '35–44 歲': { 'zh-CN': '35–44 岁', en: '35–44' },
  '45 歲以上': { 'zh-CN': '45 岁以上', en: '45 and up' },
  '謝謝你願意說。這陣子辛苦了。': { 'zh-CN': '谢谢你愿意说。这阵子辛苦了。', en: 'Thank you for telling me. It has been a hard stretch.' },
  '這裡的練習是陪伴，不是治療。我會先幫你排溫柔一點的練習，一次一小步就好。': {
    'zh-CN': '这里的练习是陪伴，不是治疗。我会先帮你排温柔一点的练习，一次一小步就好。',
    en: 'The practices here are company, not treatment. I will start you with gentler ones, one small step at a time.',
  },
  '我知道了，繼續': { 'zh-CN': '我知道了，继续', en: 'Got it, continue' },
  '繼續': { 'zh-CN': '继续', en: 'Continue' },
  'Boaba 的小筆記': { 'zh-CN': 'Boaba 的小笔记', en: "Boaba's note" },
  '想每天有個小習慣穩住自己，這是最好上手的目標。我會先幫你排五分鐘就能完成的練習。': {
    'zh-CN': '想每天有个小习惯稳住自己，这是最好上手的目标。我会先帮你排五分钟就能完成的练习。',
    en: 'A small daily habit is the easiest goal to start. I will line up practices you can finish in five minutes.',
  },
  '想學會處理情緒，很棒的起點。我會先帶你做溫柔一點的練習，再慢慢加強度。': {
    'zh-CN': '想学会处理情绪，很棒的起点。我会先带你做温柔一点的练习，再慢慢加强度。',
    en: 'Learning to handle emotions is a great place to start. We begin gently and build up.',
  },
  '想有專業夥伴陪你走一段。這裡有心理師設計的模組，我先讓你熟悉基本練習，之後再帶你認識夥伴。': {
    'zh-CN': '想有专业伙伴陪你走一段。这里有心理师设计的模块，我先让你熟悉基本练习，之后再带你认识伙伴。',
    en: 'You would like a professional alongside you. There are modules designed by psychologists here; we start with the basics, then I introduce you to partners.',
  },
  '想記錄並看見自己的變化，那每週回顧會是你的好朋友。我們先從每天一點點開始累積。': {
    'zh-CN': '想记录并看见自己的变化，那每周回顾会是你的好朋友。我们先从每天一点点开始累积。',
    en: 'To track and see your change, the weekly review will be your friend. We build it up a little each day.',
  },
  '沒關係，不確定也可以。我先幫你排最容易上手的練習，做著做著方向會慢慢清楚。': {
    'zh-CN': '没关系，不确定也可以。我先帮你排最容易上手的练习，做着做着方向会慢慢清楚。',
    en: 'Not sure is fine. I will start you with the easiest practice; the direction gets clearer as you go.',
  },
  'Boaba 正在為你安排…': { 'zh-CN': 'Boaba 正在为你安排…', en: 'Boaba is arranging things for you…' },
  '你告訴我：': { 'zh-CN': '你告诉我：', en: 'You told me:' },
  '我先幫你排了「{practice}」。接下來 5 題 InMind 測驗，會讓安排更準。': {
    'zh-CN': '我先帮你排了「{practice}」。接下来 5 题 InMind 测验，会让安排更准。',
    en: 'I lined up "{practice}" for you first. The 5-question InMind assessment next will sharpen the plan.',
  },

  // ── v3：新增「心理諮詢／教練晤談經驗」獨立題 + 「職業類別」題 ─────────
  '想多問一句：你有心理諮詢或教練晤談的經驗嗎？這題只是想更了解你，不會影響你能不能用這個 App。': {
    'zh-CN': '想多问一句：你有心理咨询或教练晤谈的经验吗？这题只是想更了解你，不会影响你能不能用这个 App。',
    en: "One more thing: have you ever had counseling or coaching sessions? This is just to know you better — it won't affect whether you can use the app.",
  },
  '你有心理諮詢或教練晤談的經驗嗎？': { 'zh-CN': '你有心理咨询或教练晤谈的经验吗？', en: 'Have you had counseling or coaching sessions before?' },
  '目前有心理師，正在定期晤談': { 'zh-CN': '目前有心理师，正在定期晤谈', en: 'Currently seeing a therapist regularly' },
  '以前找過心理師，現在沒有': { 'zh-CN': '以前找过心理师，现在没有', en: 'Saw a therapist before, not currently' },
  '找過教練（生涯、人生教練等）': { 'zh-CN': '找过教练（生涯、人生教练等）', en: 'Had a coach (career, life coaching, etc.)' },
  '心理師和教練都找過': { 'zh-CN': '心理师和教练都找过', en: 'Both a therapist and a coach' },
  '沒試過，但有興趣': { 'zh-CN': '没试过，但有兴趣', en: "Never tried, but I'm interested" },
  '沒試過，也還沒想過': { 'zh-CN': '没试过，也还没想过', en: "Never tried, haven't thought about it" },

  '最後幾題，讓我更了解你一點。你現在主要是？': {
    'zh-CN': '最后几题，让我更了解你一点。你现在主要是？',
    en: 'A few more questions to know you better. What best describes you now?',
  },
  '你的工作領域大概是？之後幫你配對專業夥伴也用得上。': {
    'zh-CN': '你的工作领域大概是？之后帮你配对专业伙伴也用得上。',
    en: 'What field do you work in? This also helps match you with the right professional later.',
  },
  '你的職業類別是？': { 'zh-CN': '你的职业类别是？', en: 'What is your occupation?' },
  '科技／工程': { 'zh-CN': '科技／工程', en: 'Tech / Engineering' },
  '醫療／護理': { 'zh-CN': '医疗／护理', en: 'Healthcare / Nursing' },
  '教育': { 'zh-CN': '教育', en: 'Education' },
  '金融／商業': { 'zh-CN': '金融／商业', en: 'Finance / Business' },
  '服務／零售': { 'zh-CN': '服务／零售', en: 'Service / Retail' },
  '藝術／設計／媒體': { 'zh-CN': '艺术／设计／媒体', en: 'Arts / Design / Media' },
  '社工／助人工作': { 'zh-CN': '社工／助人工作', en: 'Social work / Helping professions' },

  '11 題 · 全部用點的 · 每題都可以跳過': { 'zh-CN': '11 题 · 全部用点的 · 每题都可以跳过', en: '11 questions · all taps · skip any of them' },
}
