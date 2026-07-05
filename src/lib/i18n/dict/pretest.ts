import type { Translation } from '../dictionary'

// InMind 心理健康測驗（onboarding + pretest/* ）專用字串。
export const pretest: Record<string, Translation> = {
  // ── IntroScreen ──────────────────────────────────────────
  '心理健康的 InBody': { 'zh-CN': '心理健康的 InBody', en: 'The InBody of mental health' },
  '你的': { 'zh-CN': '你的', en: 'How high is your' },
  '幸福': { 'zh-CN': '幸福', en: 'happiness' },
  '指數有多高？': { 'zh-CN': '指数有多高？', en: 'index?' },
  '測出你的隱藏心理優勢': { 'zh-CN': '测出你的隐藏心理优势', en: 'Discover your hidden psychological strengths' },
  '心理健身房吉祥物：舉啞鈴的腦': { 'zh-CN': '心理健身房吉祥物：举哑铃的脑', en: 'MindGym mascot: a brain lifting dumbbells' },
  '開始測驗': { 'zh-CN': '开始测验', en: 'Start Assessment' },
  '跳過測驗': { 'zh-CN': '跳过测验', en: 'Skip' },
  '測量心理學上的': { 'zh-CN': '测量心理学上的', en: 'Measuring the' },
  ' 五大幸福指數：': { 'zh-CN': ' 五大幸福指数：', en: ' five well-being dimensions from positive psychology:' },
  '約 5 分鐘 · 5 題開放問答 · 全程匿名': {
    'zh-CN': '约 5 分钟 · 5 题开放问答 · 全程匿名',
    en: 'About 5 minutes · 5 open-ended questions · Fully anonymous',
  },

  // ── QuestionnaireScreen ──────────────────────────────────
  '返回': { 'zh-CN': '返回', en: 'Back' },
  '第 {ordinal} 題「{label}」 · 共五題': {
    'zh-CN': '第 {ordinal} 题「{label}」 · 共五题',
    en: 'Question {ordinal} of 5 · {label}',
  },
  '在這裡輸入你的故事或感受，越具體越好～': {
    'zh-CN': '在这里输入你的故事或感受，越具体越好～',
    en: 'Type your story or feelings here — the more specific, the better~',
  },
  '✓ 字數已達標': { 'zh-CN': '✓ 字数已达标', en: '✓ Minimum reached' },
  '至少需要 {min} 個字（還差 {remaining} 個字）': {
    'zh-CN': '至少需要 {min} 个字（还差 {remaining} 个字）',
    en: 'At least {min} characters needed ({remaining} more to go)',
  },
  '引導提示': { 'zh-CN': '引导提示', en: 'Hints' },
  '上一題': { 'zh-CN': '上一题', en: 'Previous' },
  '看結果': { 'zh-CN': '查看结果', en: 'See Results' },
  '下一題': { 'zh-CN': '下一题', en: 'Next' },

  // ── LoadingScreen / ErrorScreen (onboarding.tsx) ─────────
  '正在閱讀你的回答…': { 'zh-CN': '正在阅读你的回答…', en: 'Reading your answers…' },
  '分析情緒語意…': { 'zh-CN': '分析情绪语义…', en: 'Analyzing emotional tone…' },
  '對照 PERMA 模型…': { 'zh-CN': '对照 PERMA 模型…', en: 'Mapping to the PERMA model…' },
  '生成你的報告…': { 'zh-CN': '生成你的报告…', en: 'Generating your report…' },
  '大約再等 10 秒…': { 'zh-CN': '大约再等 10 秒…', en: 'About 10 more seconds…' },
  'AI 正在深度思考，快好了…': { 'zh-CN': 'AI 正在深度思考，快好了…', en: 'AI is thinking it through, almost there…' },
  '伺服器剛喚醒中，再給一點時間': {
    'zh-CN': '服务器刚唤醒中，再给一点时间',
    en: 'The server just woke up — give it a little more time',
  },
  '伺服器剛睡醒了': { 'zh-CN': '服务器刚睡醒了', en: 'The server just woke up' },
  '出了點小狀況': { 'zh-CN': '出了点小状况', en: 'Something went a bit wrong' },
  '已成功喚醒伺服器，再試一次通常就能順利完成。': {
    'zh-CN': '已成功唤醒服务器，再试一次通常就能顺利完成。',
    en: 'The server has been woken up — trying again should work fine now.',
  },
  '網路或 AI 服務暫時有問題，稍後再試試看。': {
    'zh-CN': '网络或 AI 服务暂时有问题，稍后再试试看。',
    en: 'There’s a temporary issue with the network or AI service — please try again shortly.',
  },
  '重新嘗試': { 'zh-CN': '重新尝试', en: 'Try Again' },
  '未知錯誤': { 'zh-CN': '未知错误', en: 'Unknown error' },

  // ── DIMENSION_CONFIGS (types.ts) ─────────────────────────
  '情緒力': { 'zh-CN': '情绪力', en: 'Positive Emotion' },
  '感受日常喜悅、享受生命美好時刻的能力。': {
    'zh-CN': '感受日常喜悦、享受生命美好时刻的能力。',
    en: 'The ability to feel everyday joy and savor life’s good moments.',
  },
  '請分享你上一次發自內心感到愉悅的經驗。': {
    'zh-CN': '请分享你上一次发自内心感到愉悦的经验。',
    en: 'Share about the last time you felt genuine joy from the heart.',
  },
  '那個時刻具體發生了什麼事？': { 'zh-CN': '那个时刻具体发生了什么事？', en: 'What exactly happened in that moment?' },
  '當時你的身體或心理感覺到了什麼？（例如：放鬆、輕盈、心跳加速）': {
    'zh-CN': '当时你的身体或心理感觉到了什么？（例如：放松、轻盈、心跳加速）',
    en: 'What did you feel in your body or mind at the time? (e.g. relaxed, light, heart racing)',
  },
  '這個愉悅感對你當天後續的狀態有什麼影響？': {
    'zh-CN': '这个愉悦感对你当天后续的状态有什么影响？',
    en: 'How did that sense of joy affect the rest of your day?',
  },

  '投入力': { 'zh-CN': '投入力', en: 'Engagement' },
  '全神貫注投入一件事、進入心流狀態的能力。': {
    'zh-CN': '全神贯注投入一件事、进入心流状态的能力。',
    en: 'The ability to fully immerse yourself in something and enter a flow state.',
  },
  '請分享你最近一次全神貫注做一件事的感受。': {
    'zh-CN': '请分享你最近一次全神贯注做一件事的感受。',
    en: 'Share how it felt the last time you were fully absorbed in something.',
  },
  '當時你在處理什麼任務？是什麼讓你如此入迷？': {
    'zh-CN': '当时你在处理什么任务？是什么让你如此入迷？',
    en: 'What were you doing? What made it so absorbing?',
  },
  '在那個過程中，你有感覺到時間流逝的快慢嗎？': {
    'zh-CN': '在那个过程中，你有感觉到时间流逝的快慢吗？',
    en: 'During that process, did you notice time passing faster or slower than usual?',
  },
  '結束任務後，你感到的是精神飽滿還是疲憊？': {
    'zh-CN': '结束任务后，你感到的是精神饱满还是疲惫？',
    en: 'After it was done, did you feel energized or drained?',
  },

  '連結力': { 'zh-CN': '连结力', en: 'Relationships' },
  '與他人建立深刻連結、感受支持與歸屬感的能力。': {
    'zh-CN': '与他人建立深刻连结、感受支持与归属感的能力。',
    en: 'The ability to build deep connections with others and feel supported and belonging.',
  },
  '分享一次你在日常生活中感受到被身邊的人支持、被愛的時刻。': {
    'zh-CN': '分享一次你在日常生活中感受到被身边的人支持、被爱的时刻。',
    en: 'Share a moment when you felt supported and loved by the people around you.',
  },
  '他們通常是以什麼方式提供支持？（例如：傾聽理解、付出行動、耐心陪伴）': {
    'zh-CN': '他们通常是以什么方式提供支持？（例如：倾听理解、付出行动、耐心陪伴）',
    en: 'How do they usually offer support? (e.g. listening, taking action, patient companionship)',
  },
  '你上一次向他們尋求支持或分享脆弱是什麼時候？': {
    'zh-CN': '你上一次向他们寻求支持或分享脆弱是什么时候？',
    en: 'When was the last time you reached out to them for support or shared something vulnerable?',
  },
  '他們都會如何回應你？這是你滿意的嗎？': {
    'zh-CN': '他们都会如何回应你？这是你满意的吗？',
    en: 'How did they respond to you? Were you satisfied with that?',
  },

  '意義力': { 'zh-CN': '意义力', en: 'Meaning' },
  '找到生命目的、讓行動與內在價值觀一致的能力。': {
    'zh-CN': '找到生命目的、让行动与内在价值观一致的能力。',
    en: 'The ability to find purpose in life and align your actions with your inner values.',
  },
  '在你的生命中，有哪些活動或重要的時刻對你來說是有意義的？': {
    'zh-CN': '在你的生命中，有哪些活动或重要的时刻对你来说是有意义的？',
    en: 'What activities or important moments in your life feel meaningful to you?',
  },
  '在日常生活中，哪些時刻會讓你覺得「這一切都是值得的」？': {
    'zh-CN': '在日常生活中，哪些时刻会让你觉得「这一切都是值得的」？',
    en: 'In everyday life, what moments make you feel like “it’s all worth it”?',
  },
  '你最重視的價值觀是什麼？它如何體現在你的行動中？': {
    'zh-CN': '你最重视的价值观是什么？它如何体现在你的行动中？',
    en: 'What value matters most to you? How does it show up in your actions?',
  },
  '如果你可以為這世界留下一點改變，那會是什麼？': {
    'zh-CN': '如果你可以为这世界留下一点改变，那会是什么？',
    en: 'If you could leave one change on the world, what would it be?',
  },

  '成就力': { 'zh-CN': '成就力', en: 'Accomplishment' },
  '設定目標、持續推進並看見自身成長的能力。': {
    'zh-CN': '设定目标、持续推进并看见自身成长的能力。',
    en: 'The ability to set goals, keep moving forward, and see your own growth.',
  },
  '在過去三個月，你覺得你是離你的目標越來越近，還是越來越遠？': {
    'zh-CN': '在过去三个月，你觉得你是离你的目标越来越近，还是越来越远？',
    en: 'Over the past three months, do you feel closer to your goals, or further away?',
  },
  '是什麼關鍵事件讓你產生「靠近」或「遠離」的感覺？': {
    'zh-CN': '是什么关键事件让你产生「靠近」或「远离」的感觉？',
    en: 'What key event made you feel that sense of getting closer or further away?',
  },
  '在追求目標的過程中，你發現自己最具優勢的特質是什麼？': {
    'zh-CN': '在追求目标的过程中，你发现自己最具优势的特质是什么？',
    en: 'While pursuing your goals, what strength did you discover in yourself?',
  },
  '無論遠近，你覺得下一個階段你可以跨出的小小一步是什麼？': {
    'zh-CN': '无论远近，你觉得下一个阶段你可以跨出的小小一步是什么？',
    en: 'Either way, what small next step could you take from here?',
  },

  // ── ResultsScreen ─────────────────────────────────────────
  '測驗結果': { 'zh-CN': '测验结果', en: 'Assessment Result' },
  '你的心理體型是…': { 'zh-CN': '你的心理体型是…', en: 'Your mental fitness type is…' },
  '貝果': { 'zh-CN': '贝果', en: 'Bagel' },
  '吐司': { 'zh-CN': '吐司', en: 'Toast' },
  '棉花糖': { 'zh-CN': '棉花糖', en: 'Marshmallow' },
  '高核心力・低消耗': { 'zh-CN': '高核心力・低消耗', en: 'Strong core · Low burnout' },
  '功能正常・有成長空間': { 'zh-CN': '功能正常・有成长空间', en: 'Functioning well · Room to grow' },
  '高內耗・需要補充能量': { 'zh-CN': '高内耗・需要补充能量', en: 'High inner drain · Needs recharging' },
  'InBody對應：{label}': { 'zh-CN': 'InBody对应：{label}', en: 'InBody equivalent: {label}' },
  '總分：': { 'zh-CN': '总分：', en: 'Total score: ' },
  '{score}分': { 'zh-CN': '{score}分', en: '{score} pts' },
  'PERMA 各指數明細': { 'zh-CN': 'PERMA 各指数明细', en: 'PERMA breakdown by dimension' },
  '與你最相似的名人是…': { 'zh-CN': '与你最相似的名人是…', en: 'The public figure most similar to you is…' },
  '類型 · ': { 'zh-CN': '类型 · ', en: 'Type · ' },
  '分享我的報告': { 'zh-CN': '分享我的报告', en: 'Share My Report' },
  '產生分享圖中…': { 'zh-CN': '生成分享图中…', en: 'Generating share image…' },
  '將以圖片形式分享：可存到相簿、傳到 LINE 或其他 App': {
    'zh-CN': '将以图片形式分享：可存到相册、传到微信或其他 App',
    en: 'Shared as an image — save it to your photos or send it via any app',
  },
  '適合你健心練習！': { 'zh-CN': '适合你的健心练习！', en: 'Mind-training exercises for you!' },
  '每日微習慣 · 30 SEC': { 'zh-CN': '每日微习惯 · 30 SEC', en: 'Daily micro-habit · 30 SEC' },
  '・每日健心練習': { 'zh-CN': '・每日健心练习', en: ' · Daily mind-training' },
  '短期與長期計畫': { 'zh-CN': '短期与长期计划', en: 'Short-term & long-term plan' },
  '五大指數 · 細項建議與行動': { 'zh-CN': '五大指数 · 细项建议与行动', en: 'Five dimensions · Detailed advice & actions' },
  '健心練習 · Try this': { 'zh-CN': '健心练习 · Try this', en: 'Mind exercise · Try this' },
  '# 適合互補的人': { 'zh-CN': '# 适合互补的人', en: '# A good complementary match' },
  '接下來會發生什麼': { 'zh-CN': '接下来会发生什么', en: 'What happens next' },
  '從今天開始': { 'zh-CN': '从今天开始', en: 'Starting today' },
  '第 3 天': { 'zh-CN': '第 3 天', en: 'Day 3' },
  '第 1 週': { 'zh-CN': '第 1 周', en: 'Week 1' },
  '第 2 週': { 'zh-CN': '第 2 周', en: 'Week 2' },
  '第 1 個月': { 'zh-CN': '第 1 个月', en: 'Month 1' },
  '開始第一次練習 →': { 'zh-CN': '开始第一次练习 →', en: 'Start Your First Exercise →' },
  '重新檢測': { 'zh-CN': '重新检测', en: 'Retake Assessment' },
  '返回首頁': { 'zh-CN': '返回首页', en: 'Back to Home' },

  // ── Share-image canvas text (drawn on <canvas>, not JSX) ──
  '心理健康的 InBody · 立即測測你的': {
    'zh-CN': '心理健康的 InBody · 立即测测你的',
    en: 'The InBody of mental health · Take the test now',
  },
  'InMind 心理健身報告': { 'zh-CN': 'InMind 心理健身报告', en: 'InMind Mental Fitness Report' },
  '我的心理體型是＃{name}型！來測測你的吧。': {
    'zh-CN': '我的心理体型是＃{name}型！来测测你的吧。',
    en: 'My mental fitness type is #{name}! Come find out yours.',
  },
}
