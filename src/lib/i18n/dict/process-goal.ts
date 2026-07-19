import type { Translation } from '../dictionary'

// 專注力覺察模組（app.process-goal.tsx）：專注時刻記錄 + 提升專注錦囊。
// 註：'返回'／'分鐘'／'查看更多'／'收合'／'處理中…'／'下一步'／'分享圖片'／
// '下載圖片'／'正在生成圖片…'／'今日完成'／'研究指出的效益'／'核心目標'／星期幾
// 已在 common.ts 或 gratitude.ts 定義（文字完全相同），此處不重複列出。
export const processGoal: Record<string, Translation> = {
  // ── PERMA 加分（成就力／意義力／投入力） ──
  '成就力': { 'zh-CN': '成就力', en: 'Accomplishment' },
  '看見自己的專注條件，是找回行動力的第一步。': {
    'zh-CN': '看见自己的专注条件，是找回行动力的第一步。',
    en: 'Seeing your own conditions for focus is the first step to regaining momentum.',
  },
  '意義力': { 'zh-CN': '意义力', en: 'Meaning' },
  '理解「為什麼投入」，讓你的努力更有方向感與意義感。': {
    'zh-CN': '理解「为什么投入」，让你的努力更有方向感与意义感。',
    en: 'Understanding “why you’re investing yourself” gives your effort more direction and meaning.',
  },
  '投入力': { 'zh-CN': '投入力', en: 'Engagement' },
  '觀察心流條件，你離沈浸的狀態又近了一步。': {
    'zh-CN': '观察心流条件，你离沉浸的状态又近了一步。',
    en: 'By observing your flow conditions, you’re one step closer to a fully immersed state.',
  },

  '正在為你整理…': { 'zh-CN': '正在为你整理…', en: 'Organizing this for you…' },
  '載入中…': { 'zh-CN': '加载中…', en: 'Loading…' },

  // ── 介紹頁（Intro） ──
  '過程目標覺察（Process Goal Awareness）幫助你看見自己「最容易專注」的條件。先把專注時刻一筆筆記下來，AI 會幫你看穿背後真正的需求；之後遇到難以投入的事，就能用你過去的成功經驗，為你量身打造一個能立刻試的方法。': {
    'zh-CN': '过程目标觉察（Process Goal Awareness）帮助你看见自己「最容易专注」的条件。先把专注时刻一笔笔记下来，AI 会帮你看穿背后真正的需求；之后遇到难以投入的事，就能用你过去的成功经验，为你量身打造一个能立刻试的方法。',
    en: 'Process Goal Awareness helps you discover the conditions under which you focus most easily. First, log your focused moments one by one — AI will help uncover the real needs behind them. Later, when you struggle to engage with something, it can use your past successes to craft a method you can try right away.',
  },
  '・看見自己最容易專注的條件（人、時、地）': {
    'zh-CN': '・看见自己最容易专注的条件（人、时、地）',
    en: '・See the conditions (who, when, where) under which you focus most easily',
  },
  '・理解這些條件背後真正滿足的心理需求': {
    'zh-CN': '・理解这些条件背后真正满足的心理需求',
    en: '・Understand the psychological needs these conditions actually satisfy',
  },
  '・卡住時，把過去的成功條件遷移到眼前的難事': {
    'zh-CN': '・卡住时，把过去的成功条件迁移到眼前的难事',
    en: '・When stuck, transfer your past success conditions to the difficult task at hand',
  },
  '怎麼進行': { 'zh-CN': '怎么进行', en: 'How It Works' },
  '・平常：用【專注時刻記錄】把投入的片刻存下來': {
    'zh-CN': '・平常：用【专注时刻记录】把投入的片刻存下来',
    en: '・Regularly: use Focus Moment Log to save moments when you were engaged',
  },
  '・卡關：用【提升專注錦囊】拿到一個能立刻試的方法': {
    'zh-CN': '・卡关：用【提升专注锦囊】拿到一个能立刻试的方法',
    en: '・When stuck: use Focus-Boosting Toolkit to get a method you can try right away',
  },
  '・成就力（Accomplishment）與意義力（Meaning）': {
    'zh-CN': '・成就力（Accomplishment）与意义力（Meaning）',
    en: '・Accomplishment and Meaning',
  },
  '・投入力（Engagement）與心流體驗': {
    'zh-CN': '・投入力（Engagement）与心流体验',
    en: '・Engagement and flow experiences',
  },
  '・降低拖延、提升行動的啟動力': {
    'zh-CN': '・降低拖延、提升行动的启动力',
    en: '・Reduce procrastination and boost your ability to get started',
  },
  '選擇今天要做的模組': { 'zh-CN': '选择今天要做的模块', en: 'Choose which module to do today' },
  '記下一個投入的時刻或卡關的困境': { 'zh-CN': '记下一个投入的时刻或卡关的困境', en: 'Log a focused moment or a situation where you’re stuck' },
  '閱讀 BOUBA 觀察': { 'zh-CN': '阅读 BOUBA 观察', en: 'Read BOUBA’s observation' },
  '今天想做哪一個？': { 'zh-CN': '今天想做哪一个？', en: 'Which one do you want to do today?' },
  '專注時刻記錄': { 'zh-CN': '专注时刻记录', en: 'Focus Moment Log' },
  '記下一個你特別投入的時刻，AI 幫你看見背後的需求': {
    'zh-CN': '记下一个你特别投入的时刻，AI 帮你看见背后的需求',
    en: 'Log a moment when you were especially engaged — AI will help you see the need behind it',
  },
  '你已記錄 {n} 個專注時刻': { 'zh-CN': '你已记录 {n} 个专注时刻', en: 'You’ve logged {n} focus moments' },
  '從你的第一個專注時刻開始': { 'zh-CN': '从你的第一个专注时刻开始', en: 'Start with your first focus moment' },
  '提升專注錦囊': { 'zh-CN': '提升专注锦囊', en: 'Focus-Boosting Toolkit' },
  '卡住了？用你過去的專注經驗，給你一個能立刻試的方法': {
    'zh-CN': '卡住了？用你过去的专注经验，给你一个能立刻试的方法',
    en: 'Feeling stuck? Use your past focus experiences to get a method you can try right now',
  },
  '建議先記錄幾個專注時刻，建議會更準': {
    'zh-CN': '建议先记录几个专注时刻，建议会更准',
    en: 'We recommend logging a few focus moments first — the suggestions will be more accurate',
  },

  // ── 模組一：專注時刻記錄（RecordModule） ──
  '從你的描述裡，能感覺到你在那個情境特別投入。多記幾次，AI 就能更準地看出你需要的專注條件。': {
    'zh-CN': '从你的描述里，能感觉到你在那个情境特别投入。多记几次，AI 就能更准地看出你需要的专注条件。',
    en: 'From your description, it’s clear you were especially engaged in that situation. Log a few more, and AI can more accurately identify the conditions you need to focus.',
  },
  '我的專注時刻': { 'zh-CN': '我的专注时刻', en: 'My Focus Moment' },
  '記下了一個專注時刻': { 'zh-CN': '记下了一个专注时刻', en: 'Logged a focus moment' },
  '儲存失敗：{msg}': { 'zh-CN': '保存失败：{msg}', en: 'Save failed: {msg}' },
  '記下一個你專注的時刻': { 'zh-CN': '记下一个你专注的时刻', en: 'Log a moment when you were focused' },
  '回想一個你特別「在狀態」的片段——時間過得很快、腦子很清晰、有種自然的流動感。': {
    'zh-CN': '回想一个你特别「在状态」的片段——时间过得很快、脑子很清晰、有种自然的流动感。',
    en: 'Think back to a moment when you were really “in the zone” — time flew by, your mind felt clear, and there was a natural sense of flow.',
  },
  '那是什麼事？當下的感受是什麼？': { 'zh-CN': '那是什么事？当下的感受是什么？', en: 'What was it? How did it feel at the time?' },
  '例：在咖啡廳寫報告，一直被推著往前，覺得很投入、忘記時間': {
    'zh-CN': '例：在咖啡厅写报告，一直被推着往前，觉得很投入、忘记时间',
    en: 'Example: Writing a report at a café, feeling pulled forward, completely absorbed and losing track of time',
  },
  '當時的人、時、地：': { 'zh-CN': '当时的人、时、地：', en: 'The people, time, and place:' },
  '人物 · 一個人，還是有別人在？': { 'zh-CN': '人物 · 一个人，还是有别人在？', en: 'Who · Were you alone, or with others?' },
  '例：一個人／和同學一起': { 'zh-CN': '例：一个人／和同学一起', en: 'Example: Alone / with classmates' },
  '時間 · 什麼時候？': { 'zh-CN': '时间 · 什么时候？', en: 'When · What time was it?' },
  '例：週六下午、深夜': { 'zh-CN': '例：周六下午、深夜', en: 'Example: Saturday afternoon, late at night' },
  '地點 · 在哪裡？': { 'zh-CN': '地点 · 在哪里？', en: 'Where · What location?' },
  '例：咖啡廳、圖書館': { 'zh-CN': '例：咖啡厅、图书馆', en: 'Example: Café, library' },
  '看看 AI 的觀察': { 'zh-CN': '看看 AI 的观察', en: 'See AI’s Observation' },
  '我從你的描述裡，聽見了…': { 'zh-CN': '我从你的描述里，听见了…', en: 'From your description, here’s what I’m hearing…' },
  '這是你這個專注時刻背後，可能真正需要的條件。你可以把這張圖儲存下來。': {
    'zh-CN': '这是你这个专注时刻背后，可能真正需要的条件。你可以把这张图保存下来。',
    en: 'These may be the real conditions behind this focus moment. Feel free to save this image.',
  },
  '今日專注時刻記錄完成！': { 'zh-CN': '今日专注时刻记录完成！', en: 'Today’s Focus Moment Logged!' },
  '每記一筆，你的專注地圖就更完整一點。': {
    'zh-CN': '每记一笔，你的专注地图就更完整一点。',
    en: 'Every entry makes your focus map a little more complete.',
  },
  '再記一個專注時刻': { 'zh-CN': '再记一个专注时刻', en: 'Log Another Focus Moment' },

  // ── 模組二：提升專注錦囊（BoostModule） ──
  '先別急著逼自己。去【專注時刻記錄】補一筆相近的時刻——記得越多，我就越知道你需要什麼條件。現在，先把這件事拆到「只做最小的第一步」。': {
    'zh-CN': '先别急着逼自己。去【专注时刻记录】补一笔相近的时刻——记得越多，我就越知道你需要什么条件。现在，先把这件事拆到「只做最小的第一步」。',
    en: 'Don’t push yourself too hard just yet. Go log a similar moment in Focus Moment Log — the more you log, the better I can tell what conditions you need. For now, break this task down to just the smallest possible first step.',
  },
  '你熟悉的條件': { 'zh-CN': '你熟悉的条件', en: 'conditions you’re familiar with' },
  '想想你以前在「{cond}」很投入的樣子，把那個氛圍帶過來：先換到類似的環境，只做這件事的第一個 10 分鐘。開始比完成更重要。': {
    'zh-CN': '想想你以前在「{cond}」很投入的样子，把那个氛围带过来：先换到类似的环境，只做这件事的第一个 10 分钟。开始比完成更重要。',
    en: 'Think of how engaged you were before in “{cond}” and bring that atmosphere here: switch to a similar environment first, and just do the first 10 minutes of this task. Starting matters more than finishing.',
  },
  '我的專注錦囊': { 'zh-CN': '我的专注锦囊', en: 'My Focus Toolkit' },
  '卡關：{situation}': { 'zh-CN': '卡关：{situation}', en: 'Stuck on: {situation}' },
  '今天有件事提不起勁。': { 'zh-CN': '今天有件事提不起劲。', en: 'There’s something today I just can’t get motivated to do.' },
  '現在，什麼事讓你卡住了？': { 'zh-CN': '现在，什么事让你卡住了？', en: 'What’s got you stuck right now?' },
  '說說現在這件難以專注、提不起勁的事，連同當下的情境一起講。我會從你過去的專注經驗裡，找一個能立刻試的方法。': {
    'zh-CN': '说说现在这件难以专注、提不起劲的事，连同当下的情境一起讲。我会从你过去的专注经验里，找一个能立刻试的方法。',
    en: 'Tell me about the thing you’re struggling to focus on or feel unmotivated about, along with the current situation. I’ll find a method from your past focus experiences that you can try right away.',
  },
  '例：要背一堆單字但完全靜不下心，坐在房間滑手機一小時了': {
    'zh-CN': '例：要背一堆单字但完全静不下心，坐在房间滑手机一小时了',
    en: 'Example: Need to memorize vocabulary but can’t settle down — been scrolling my phone in my room for an hour',
  },
  '為我找一個方法': { 'zh-CN': '为我找一个方法', en: 'Find Me a Method' },
  '你的專注錦囊': { 'zh-CN': '你的专注锦囊', en: 'Your Focus Toolkit' },
  '參考了你過去的經驗：{summary}': { 'zh-CN': '参考了你过去的经验：{summary}', en: 'Based on your past experience: {summary}' },
  '這類活動還沒有你的專注紀錄。先去【專注時刻記錄】補幾筆相近的時刻，下次的錦囊就會更貼近你。': {
    'zh-CN': '这类活动还没有你的专注记录。先去【专注时刻记录】补几笔相近的时刻，下次的锦囊就会更贴近你。',
    en: 'There’s no focus record yet for this kind of activity. Go log a few similar moments in Focus Moment Log first, and next time’s suggestion will fit you better.',
  },
  '今日專注錦囊完成！': { 'zh-CN': '今日专注锦囊完成！', en: 'Today’s Focus Toolkit Complete!' },
  '帶著這個方法去試試，開始比完成更重要。': {
    'zh-CN': '带着这个方法去试试，开始比完成更重要。',
    en: 'Take this method and give it a try — starting matters more than finishing.',
  },
  '順手記一個專注時刻': { 'zh-CN': '顺手记一个专注时刻', en: 'Log a Focus Moment While You’re At It' },

  // ── 分享圖卡（PgShareCard） ──
  '今天的專注時刻': { 'zh-CN': '今天的专注时刻', en: 'Today’s Focus Moment' },
  '今天的專注錦囊': { 'zh-CN': '今天的专注锦囊', en: 'Today’s Focus Toolkit' },
  '遇到的困境': { 'zh-CN': '遇到的困境', en: 'The Challenge' },
  'BOUBA 觀察': { 'zh-CN': 'BOUBA 观察', en: 'BOUBA’s Observation' },
  '連續健心第 {n} 天': { 'zh-CN': '连续健心第 {n} 天', en: 'Day {n} of your wellness streak' },

  // ── 完成頁（PgCelebrateStage） ──
  '連續健心': { 'zh-CN': '连续健心', en: 'Streak' },
  '練習後 PERMA 幸福力成長': { 'zh-CN': '练习后 PERMA 幸福力成长', en: 'PERMA Growth After Practice' },
  '分享到社群的隱私設定': { 'zh-CN': '分享到社区的隐私设置', en: 'Privacy Settings for Community Sharing' },
  '回練習選單': { 'zh-CN': '回练习菜单', en: 'Back to Exercise Menu' },
}
