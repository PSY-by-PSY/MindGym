import type { Translation } from '../dictionary'

// 感恩日記練習（app.gratitude.tsx）＋ 首次回饋問卷（FirstFeedbackSurvey）＋ 語音輸入（VoiceInput，與專注力模組共用）。
export const gratitude: Record<string, Translation> = {
  // ── 星期（formatDate / formatSheetDate 共用） ──
  '星期日': { 'zh-CN': '星期日', en: 'Sunday' },
  '星期一': { 'zh-CN': '星期一', en: 'Monday' },
  '星期二': { 'zh-CN': '星期二', en: 'Tuesday' },
  '星期三': { 'zh-CN': '星期三', en: 'Wednesday' },
  '星期四': { 'zh-CN': '星期四', en: 'Thursday' },
  '星期五': { 'zh-CN': '星期五', en: 'Friday' },
  '星期六': { 'zh-CN': '星期六', en: 'Saturday' },

  // ── 感恩對象標籤 ──
  '身邊他人': { 'zh-CN': '身边他人', en: 'Others' },
  '自己': { 'zh-CN': '自己', en: 'Myself' },
  '環境': { 'zh-CN': '环境', en: 'Environment' },
  '體驗': { 'zh-CN': '体验', en: 'Experience' },
  '自訂': { 'zh-CN': '自定义', en: 'Custom' },

  // ── 難度提示 ──
  '今天有什麼讓你心存感謝的事？可以是很小的事。': {
    'zh-CN': '今天有什么让你心存感谢的事？可以是很小的事。',
    en: 'What are you grateful for today? It can be something small.',
  },
  '這件事的哪個部分讓你感到感謝？它對你的意義是什麼？': {
    'zh-CN': '这件事的哪个部分让你感到感谢？它对你的意义是什么？',
    en: 'Which part of this made you feel grateful? What does it mean to you?',
  },

  // ── 通用回饋 fallback（AI 無回應時） ──
  '你今天記下了珍貴的感恩，這份覺察本身就是一種溫柔的力量。': {
    'zh-CN': '你今天记下了珍贵的感恩，这份觉察本身就是一种温柔的力量。',
    en: 'Today you wrote down something precious to be grateful for — that awareness itself is a gentle kind of strength.',
  },
  '我曾經聽過有人說，她一開始只是隨手寫寫，直到某天翻回去看才發現，原來平凡的日子裡藏著這麼多值得感謝的瞬間。': {
    'zh-CN': '我曾经听过有人说，她一开始只是随手写写，直到某天翻回去看才发现，原来平凡的日子里藏着这么多值得感谢的瞬间。',
    en: 'I once heard someone say she started out just jotting things down casually — until one day she looked back and realized how many moments worth being grateful for were hiding in her ordinary days.',
  },
  '能寫下感恩的事，代表你正在練習把目光放在生活中的光亮處。': {
    'zh-CN': '能写下感恩的事，代表你正在练习把目光放在生活中的光亮处。',
    en: 'Being able to write down what you’re grateful for means you’re practicing turning your attention toward the bright spots in life.',
  },
  '我曾經聽過有人分享，他一開始覺得感恩練習有點刻意，但持續一陣子後，發現自己看事情的角度真的慢慢變得不一樣了。': {
    'zh-CN': '我曾经听过有人分享，他一开始觉得感恩练习有点刻意，但持续一阵子后，发现自己看事情的角度真的慢慢变得不一样了。',
    en: 'I once heard someone share that gratitude practice felt a bit forced at first — but after keeping it up for a while, they noticed their perspective on things had genuinely started to shift.',
  },
  '每一次記下感恩，大腦就多一次尋找美好事物的練習。': {
    'zh-CN': '每一次记下感恩，大脑就多一次寻找美好事物的练习。',
    en: 'Every time you write down something you’re grateful for, your brain gets one more round of practice at noticing what’s good.',
  },
  '我曾經聽過有人說，原本以為自己過得很普通，直到開始練習感恩，才注意到身邊一直有人默默在支持著自己。': {
    'zh-CN': '我曾经听过有人说，原本以为自己过得很普通，直到开始练习感恩，才注意到身边一直有人默默在支持着自己。',
    en: 'I once heard someone say they thought their life was pretty ordinary — until they started practicing gratitude and noticed people had quietly been supporting them all along.',
  },
  '今天的三件感恩，是你送給明天自己的一份小禮物。': {
    'zh-CN': '今天的三件感恩，是你送给明天自己的一份小礼物。',
    en: 'Today’s three good things are a small gift you’re giving to tomorrow’s you.',
  },
  '我曾經聽過有人提到，他最感謝的往往不是什麼大事，而是那些差點被忽略的小片刻，回頭看反而最讓人安心。': {
    'zh-CN': '我曾经听过有人提到，他最感谢的往往不是什么大事，而是那些差点被忽略的小片刻，回头看反而最让人安心。',
    en: 'I once heard someone mention that what they were most grateful for was rarely anything big — it was the small, almost-overlooked moments that felt most reassuring in hindsight.',
  },
  '感恩練習最珍貴的地方，在於它讓你習慣把注意力放在值得珍惜的事。': {
    'zh-CN': '感恩练习最珍贵的地方，在于它让你习惯把注意力放在值得珍惜的事。',
    en: 'What’s most valuable about gratitude practice is that it trains you to keep your attention on the things worth cherishing.',
  },
  '我曾經聽過有人說，一開始很難想到三件事，但練習久了，反而變成要選出「哪三件最想記下來」，這樣的轉變很有意思。': {
    'zh-CN': '我曾经听过有人说，一开始很难想到三件事，但练习久了，反而变成要选出「哪三件最想记下来」，这样的转变很有意思。',
    en: 'I once heard someone say that at first it was hard to think of even three things — but after practicing for a while, the challenge became choosing which three to write down. That shift is quite something.',
  },

  // ── PERMA 加分（情緒力／意義力／連結力） ──
  '情緒力': { 'zh-CN': '情绪力', en: 'Positive Emotion' },
  '成功累積三次的正向情緒經驗！': { 'zh-CN': '成功累积三次的正向情绪经验！', en: 'You’ve built up three positive-emotion experiences!' },
  '意義力': { 'zh-CN': '意义力', en: 'Meaning' },
  '感恩日記能幫助你發現自己真正重視的人事物，提升生活的意義感': {
    'zh-CN': '感恩日记能帮助你发现自己真正重视的人事物，提升生活的意义感',
    en: 'Gratitude journaling helps you discover what truly matters to you, boosting your sense of meaning in life',
  },
  '連結力': { 'zh-CN': '连结力', en: 'Relationships' },
  '進一步覺察自身的人際關係支持系統，更容易感受到身邊人或自己的支持': {
    'zh-CN': '进一步觉察自身的人际关系支持系统，更容易感受到身边人或自己的支持',
    en: 'Building deeper awareness of your support network makes it easier to feel supported by others — and by yourself',
  },

  // ── 錯誤／提示訊息 ──
  'BOUBA 暫時無法整理你的感恩，稍後再試一次也沒關係。': {
    'zh-CN': 'BOUBA 暂时无法整理你的感恩，稍后再试一次也没关系。',
    en: 'BOUBA can’t organize your gratitude entry right now — feel free to try again later.',
  },
  '登入狀態已失效，請重新登入後再儲存': { 'zh-CN': '登录状态已失效，请重新登录后再保存', en: 'Your session has expired. Please log in again before saving.' },
  '儲存失敗：{msg}\n\n請截圖回報給工程師。': {
    'zh-CN': '保存失败：{msg}\n\n请截图回报给工程师。',
    en: 'Save failed: {msg}\n\nPlease take a screenshot and report it to the engineering team.',
  },

  // ── 進入頁（IntroStage） ──
  '初階': { 'zh-CN': '初阶', en: 'Basic' },
  '進階': { 'zh-CN': '进阶', en: 'Advanced' },
  '分鐘': { 'zh-CN': '分钟', en: 'min' },
  '感恩日記（Gratitude Journal）是正向心理學中最具代表性的練習之一，透過每天有意識地回顧值得感謝的事件，幫助大腦重新聚焦於生活中的支持、善意與美好經驗。': {
    'zh-CN': '感恩日记（Gratitude Journal）是正向心理学中最具代表性的练习之一，透过每天有意识地回顾值得感谢的事件，帮助大脑重新聚焦于生活中的支持、善意与美好经验。',
    en: 'Gratitude journaling is one of the signature practices in positive psychology. By consciously reviewing what you’re grateful for each day, it helps your brain refocus on the support, kindness, and good experiences in your life.',
  },
  '（難度：{level}）': { 'zh-CN': '（难度：{level}）', en: '(Difficulty: {level})' },
  '查看更多 ▾': { 'zh-CN': '查看更多 ▾', en: 'See more ▾' },
  '核心目標': { 'zh-CN': '核心目标', en: 'Core Goals' },
  '・建立覺察生活中的美好以及練習表達感恩的習慣': {
    'zh-CN': '・建立觉察生活中的美好以及练习表达感恩的习惯',
    en: '・Build the habit of noticing the good in life and practicing gratitude',
  },
  '・透過簡單、低負擔的書寫，引導我們開始留意：': {
    'zh-CN': '・透过简单、低负担的书写，引导我们开始留意：',
    en: '・Through simple, low-pressure writing, guide us to start noticing:',
  },
  '・今天有哪些事情值得被感謝？': { 'zh-CN': '・今天有哪些事情值得被感谢？', en: '・What happened today that’s worth being grateful for?' },
  '・哪些人、環境與體驗支持了自己？': { 'zh-CN': '・哪些人、环境与体验支持了自己？', en: '・Which people, environments, or experiences have supported me?' },
  '・自己是否也值得被感謝？': { 'zh-CN': '・自己是否也值得被感谢？', en: '・Am I also worth being grateful for?' },
  '練前準備': { 'zh-CN': '练前准备', en: 'Before You Begin' },
  '練習時長': { 'zh-CN': '练习时长', en: 'Duration' },
  '建議每日 5–10 分鐘。': { 'zh-CN': '建议每日 5–10 分钟。', en: 'We recommend 5–10 minutes daily.' },
  '時段推薦': { 'zh-CN': '时段推荐', en: 'Recommended Time' },
  '建議在 19:00–24:00 之間練習，幫助自己：': {
    'zh-CN': '建议在 19:00–24:00 之间练习，帮助自己：',
    en: 'We recommend practicing between 19:00–24:00 to help you:',
  },
  '・回顧一天發生的事件': { 'zh-CN': '・回顾一天发生的事件', en: '・Review what happened during the day' },
  '・整理自己的思緒與情緒': { 'zh-CN': '・整理自己的思绪与情绪', en: '・Sort out your thoughts and emotions' },
  '・建立睡前的感恩儀式感': { 'zh-CN': '・建立睡前的感恩仪式感', en: '・Create a bedtime gratitude ritual' },
  '環境營造': { 'zh-CN': '环境营造', en: 'Setting the Scene' },
  '建議開始前：': { 'zh-CN': '建议开始前：', en: 'Before you start, we recommend:' },
  '・暫停所有訊息通知': { 'zh-CN': '・暂停所有讯息通知', en: '・Pause all message notifications' },
  '・找一個舒服且安靜的空間': { 'zh-CN': '・找一个舒服且安静的空间', en: '・Find a comfortable, quiet space' },
  '・將注意力回到自己身上': { 'zh-CN': '・将注意力回到自己身上', en: '・Bring your attention back to yourself' },
  '不建議練習的時刻': { 'zh-CN': '不建议练习的时刻', en: 'When Not to Practice' },
  '情緒極端崩潰時': { 'zh-CN': '情绪极端崩溃时', en: 'During extreme emotional distress' },
  '若當下正處於劇烈創傷或憤怒中，不應強迫感恩，應先進行情緒宣洩或尋求專業心理協助。': {
    'zh-CN': '若当下正处于剧烈创伤或愤怒中，不应强迫感恩，应先进行情绪宣泄或寻求专业心理协助。',
    en: 'If you’re in the middle of intense trauma or anger, don’t force gratitude — release the emotion first or seek professional support.',
  },
  '極度疲憊時': { 'zh-CN': '极度疲惫时', en: 'When extremely exhausted' },
  '感恩書寫需要一定心理能量。若過度疲勞，容易變成應付式紀錄，同時難以書寫真實感受，可能增加心理負擔。': {
    'zh-CN': '感恩书写需要一定心理能量。若过度疲劳，容易变成应付式记录，同时难以书写真实感受，可能增加心理负担。',
    en: 'Gratitude writing takes some mental energy. When you’re overly tired, it’s easy to just go through the motions and hard to write your real feelings, which can add to your mental load.',
  },
  '研究指出的效益': { 'zh-CN': '研究指出的效益', en: 'Research-Backed Benefits' },
  '持續性的感恩練習有助於提升：': { 'zh-CN': '持续性的感恩练习有助于提升：', en: 'A consistent gratitude practice can help improve:' },
  '・情緒力（Positive Emotion）': { 'zh-CN': '・情绪力（Positive Emotion）', en: '・Positive Emotion' },
  '・連結力（Relationships）': { 'zh-CN': '・连结力（Relationships）', en: '・Relationships' },
  '・意義力（Meaning）': { 'zh-CN': '・意义力（Meaning）', en: '・Meaning' },
  '・心理韌性與幸福感': { 'zh-CN': '・心理韧性与幸福感', en: '・Resilience and well-being' },
  '・壓力調節與睡眠品質': { 'zh-CN': '・压力调节与睡眠品质', en: '・Stress regulation and sleep quality' },
  '相關文獻': { 'zh-CN': '相关文献', en: 'References' },
  '收合 ▴': { 'zh-CN': '收起 ▴', en: 'Collapse ▴' },
  '選擇練習難度': { 'zh-CN': '选择练习难度', en: 'Choose a difficulty level' },
  '寫下三件感恩的事': { 'zh-CN': '写下三件感恩的事', en: 'Write down three things you’re grateful for' },
  '閱讀 BOUBA 回饋': { 'zh-CN': '阅读 BOUBA 回馈', en: 'Read BOUBA’s feedback' },
  '依據你今天的能量挑一個強度': { 'zh-CN': '依据你今天的能量挑一个强度', en: 'Pick an intensity based on today’s energy' },
  '初階練習': { 'zh-CN': '初阶练习', en: 'Basic Practice' },
  '施工中': { 'zh-CN': '建设中', en: 'Coming Soon' },
  '進階練習': { 'zh-CN': '进阶练习', en: 'Advanced Practice' },
  '開始練習': { 'zh-CN': '开始练习', en: 'Start Practice' },

  // ── 書寫頁（WritingStage / GratitudeCard） ──
  '第一件感恩的事情是…': { 'zh-CN': '第一件感恩的事情是…', en: 'The first thing I’m grateful for is…' },
  '舉例：我很感激工作夥伴幫忙來回溝通開會事項，交給對方處理我感到很安心': {
    'zh-CN': '举例：我很感激工作伙伴帮忙来回沟通开会事项，交给对方处理我感到很安心',
    en: 'Example: I’m grateful a colleague handled all the back-and-forth meeting logistics — it was a relief to leave it in their hands',
  },
  '第二件感恩的事情是…': { 'zh-CN': '第二件感恩的事情是…', en: 'The second thing I’m grateful for is…' },
  '舉例：我很感謝自己今天面對一整天繁忙的行程並沒有退縮或放棄，真的好難得～': {
    'zh-CN': '举例：我很感谢自己今天面对一整天繁忙的行程并没有退缩或放弃，真的好难得～',
    en: 'Example: I’m grateful I didn’t back down or give up despite a jam-packed day — that’s really rare for me',
  },
  '第三件感恩的事情是…': { 'zh-CN': '第三件感恩的事情是…', en: 'The third thing I’m grateful for is…' },
  '舉例：今天的公車準時抵達，讓我有餘裕不匆忙地去上班，還可以欣賞沿途風景': {
    'zh-CN': '举例：今天的公车准时抵达，让我有余裕不匆忙地去上班，还可以欣赏沿途风景',
    en: 'Example: The bus arrived right on time today, so I could get to work without rushing and even enjoy the view along the way',
  },
  '修改日期': { 'zh-CN': '修改日期', en: 'Edit Date' },
  '已連續紀錄 {n} 天': { 'zh-CN': '已连续记录 {n} 天', en: '{n}-day streak' },
  '今天發生了哪三件值得你感謝的事情呢？': { 'zh-CN': '今天发生了哪三件值得你感谢的事情呢？', en: 'What are three things that happened today that you’re grateful for?' },
  '請寫得越具體越好。感恩的對象可以是：身邊的人、自己、大自然與環境、一段體驗，或任何讓你感到被支持的事情。': {
    'zh-CN': '请写得越具体越好。感恩的对象可以是：身边的人、自己、大自然与环境、一段体验，或任何让你感到被支持的事情。',
    en: 'The more specific, the better. You can be grateful for people around you, yourself, nature and the environment, an experience, or anything that made you feel supported.',
  },
  '完成三件感恩': { 'zh-CN': '完成三件感恩', en: 'Finish the Three Good Things' },
  '選擇紀錄日期': { 'zh-CN': '选择记录日期', en: 'Choose a Date' },
  '今天': { 'zh-CN': '今天', en: 'Today' },
  '昨天': { 'zh-CN': '昨天', en: 'Yesterday' },
  '今日已寫 {n} 字': { 'zh-CN': '今日已写 {n} 字', en: '{n} characters written today' },

  // ── 回顧頁（SummaryStage / ShareCard / FeedbackLoading） ──
  '今天的感恩日記': { 'zh-CN': '今天的感恩日记', en: 'Today’s Gratitude Journal' },
  '返回編輯日記': { 'zh-CN': '返回编辑日记', en: 'Back to edit entry' },
  '你今天的感恩回顧': { 'zh-CN': '你今天的感恩回顾', en: 'Today’s Gratitude Recap' },
  'BOUBA 回饋': { 'zh-CN': 'BOUBA 回馈', en: 'BOUBA’s Feedback' },
  '※ BOUBA 今天稍忙，以通用回饋陪伴你': { 'zh-CN': '※ BOUBA 今天稍忙，以通用回馈陪伴你', en: '※ BOUBA is a bit busy today, so here’s some general feedback to keep you company' },
  '等回饋生成完之後，才能進行下一步喔！': { 'zh-CN': '等回馈生成完之后，才能进行下一步喔！', en: 'You’ll be able to continue once the feedback is ready!' },
  '正在生成圖片…': { 'zh-CN': '正在生成图片…', en: 'Generating image…' },
  '分享圖片': { 'zh-CN': '分享图片', en: 'Share Image' },
  '下載圖片': { 'zh-CN': '下载图片', en: 'Download Image' },
  '返回完成頁面': { 'zh-CN': '返回完成页面', en: 'Back to Completion Page' },
  '正在分析你的感恩日記…': { 'zh-CN': '正在分析你的感恩日记…', en: 'Analyzing your gratitude journal…' },
  'BOUBA 正在為你生成專屬回饋…': { 'zh-CN': 'BOUBA 正在为你生成专属回馈…', en: 'BOUBA is generating personalized feedback for you…' },
  '正在啟動伺服器（首次回應可能需要多等幾秒）…': { 'zh-CN': '正在启动服务器（首次回应可能需要多等几秒）…', en: 'Starting up the server (the first response may take a few extra seconds)…' },
  '快好了，謝謝你的耐心等待…': { 'zh-CN': '快好了，谢谢你的耐心等待…', en: 'Almost there — thanks for your patience…' },
  '恭喜完成第 {n} 天感恩日記': { 'zh-CN': '恭喜完成第 {n} 天感恩日记', en: 'Congrats on completing day {n} of your gratitude journal' },

  // ── 完成頁（CelebrateStage） ──
  '你的幸福感有很大一部分來自身邊的人，珍惜這些連結吧。': {
    'zh-CN': '你的幸福感有很大一部分来自身边的人，珍惜这些连结吧。',
    en: 'A big part of your well-being comes from the people around you — cherish those connections.',
  },
  '你非常懂得欣賞自己的努力與成長，這是很珍貴的自我覺察。': {
    'zh-CN': '你非常懂得欣赏自己的努力与成长，这是很珍贵的自我觉察。',
    en: 'You’re really good at appreciating your own effort and growth — that’s a precious kind of self-awareness.',
  },
  '你對生活中的細微美好特別敏感，這份覺察讓你隨時都能找到禮物。': {
    'zh-CN': '你对生活中的细微美好特别敏感，这份觉察让你随时都能找到礼物。',
    en: 'You’re especially attuned to the small good things in life — that awareness means you can always find a gift.',
  },
  '你善於從日常的小體驗中找到喜悅，生活對你來說充滿驚喜。': {
    'zh-CN': '你善于从日常的小体验中找到喜悦，生活对你来说充满惊喜。',
    en: 'You’re great at finding joy in everyday little experiences — life feels full of surprises to you.',
  },
  '你的感恩來自各種面向，這份多元的覺察豐富了你的內在世界。': {
    'zh-CN': '你的感恩来自各种面向，这份多元的觉察丰富了你的内在世界。',
    en: 'Your gratitude comes from many different angles — that variety enriches your inner world.',
  },
  '感謝身邊的人能強化社會連結感（Relatedness），是 PERMA 中「R」的核心。研究顯示，表達感謝能同時提升給予者與接受者的幸福感。': {
    'zh-CN': '感谢身边的人能强化社会连结感（Relatedness），是 PERMA 中「R」的核心。研究显示，表达感谢能同时提升给予者与接受者的幸福感。',
    en: 'Being grateful for the people around you strengthens Relatedness — the “R” in PERMA. Research shows that expressing gratitude boosts well-being for both the giver and the receiver.',
  },
  '對自己的努力心存感謝，能培養自我同情（Self-Compassion）與成長型思維（Growth Mindset），減少自我批評，增加心理韌性。': {
    'zh-CN': '对自己的努力心存感谢，能培养自我同情（Self-Compassion）与成长型思维（Growth Mindset），减少自我批评，增加心理韧性。',
    en: 'Being grateful for your own efforts cultivates self-compassion and a growth mindset, reducing self-criticism and building resilience.',
  },
  '對自然與空間的感謝能喚起「敬畏感」（Awe），研究發現敬畏感能降低壓力荷爾蒙，並擴展我們對世界的視野。': {
    'zh-CN': '对自然与空间的感谢能唤起「敬畏感」（Awe），研究发现敬畏感能降低压力荷尔蒙，并扩展我们对世界的视野。',
    en: 'Gratitude for nature and spaces evokes a sense of awe. Research shows awe can lower stress hormones and broaden our view of the world.',
  },
  '感謝日常體驗能強化「正向情緒記憶」，讓大腦更容易在未來注意到美好的事物，形成正向情緒的上升螺旋。': {
    'zh-CN': '感谢日常体验能强化「正向情绪记忆」，让大脑更容易在未来注意到美好的事物，形成正向情绪的上升螺旋。',
    en: 'Being grateful for everyday experiences strengthens positive-emotion memory, making it easier for your brain to notice good things in the future — creating an upward spiral of positive emotion.',
  },
  '多元的感恩來源代表你的覺察力不受限制，能從生活的各個角落汲取力量。': {
    'zh-CN': '多元的感恩来源代表你的觉察力不受限制，能从生活的各个角落汲取力量。',
    en: 'Having diverse sources of gratitude shows your awareness isn’t limited — you can draw strength from every corner of life.',
  },
  '返回查看 AI 日記': { 'zh-CN': '返回查看 AI 日记', en: 'Back to view AI journal' },
  '今日感恩練習完成！': { 'zh-CN': '今日感恩练习完成！', en: 'Today’s Gratitude Practice Complete!' },
  '願意停下來留意身邊的美好，這份覺察本身就是一份很大的禮物。': {
    'zh-CN': '愿意停下来留意身边的美好，这份觉察本身就是一份很大的礼物。',
    en: 'Being willing to pause and notice the good around you — that awareness itself is a wonderful gift.',
  },
  '今日完成': { 'zh-CN': '今日完成', en: 'Today' },
  '連續紀錄': { 'zh-CN': '连续记录', en: 'Streak' },
  '練習後 PERMA 加分': { 'zh-CN': '练习后 PERMA 加分', en: 'PERMA Boost After Practice' },
  '感恩對象地圖': { 'zh-CN': '感恩对象地图', en: 'Gratitude Target Map' },
  '完成更多練習後，這裡會顯示你的感恩對象分佈。': {
    'zh-CN': '完成更多练习后，这里会显示你的感恩对象分布。',
    en: 'Complete more practices and this will show the breakdown of who or what you’re grateful for.',
  },
  '隱私設定': { 'zh-CN': '隐私设置', en: 'Privacy Settings' },
  '結束今天練習': { 'zh-CN': '结束今天练习', en: 'Finish Today’s Practice' },
  '感恩對象的心理學意義': { 'zh-CN': '感恩对象的心理学意义', en: 'The Psychology Behind Gratitude Targets' },

  // ── 首次回饋問卷（FirstFeedbackSurvey） ──
  '哪個環節讓你印象最深？': { 'zh-CN': '哪个环节让你印象最深？', en: 'Which part left the strongest impression on you?' },
  '寫下最有感覺的那個部分…': { 'zh-CN': '写下最有感觉的那个部分…', en: 'Write about the part that resonated with you most…' },
  '如果這變成 App，你希望它出現在你生活的什麼時刻？': {
    'zh-CN': '如果这变成 App，你希望它出现在你生活的什么时刻？',
    en: 'If this became an app, when in your daily life would you want it to show up?',
  },
  '例如：睡前、通勤、心情低落的時候…': { 'zh-CN': '例如：睡前、通勤、心情低落的时候…', en: 'For example: before bed, during your commute, when you’re feeling down…' },
  '你會想帶哪個朋友來？為什麼？': { 'zh-CN': '你会想带哪个朋友来？为什么？', en: 'Which friend would you want to bring along? Why?' },
  '想到的那個人，還有你想到的原因…': { 'zh-CN': '想到的那个人，还有你想到的原因…', en: 'The person who comes to mind, and why…' },
  '想聽聽你的想法': { 'zh-CN': '想听听你的想法', en: 'We’d love to hear your thoughts' },

  // ── 語音輸入（VoiceInput，感恩日記與專注力模組共用） ──
  '沒有辨識到內容，請靠近麥克風再試一次。': { 'zh-CN': '没有识别到内容，请靠近麦克风再试一次。', en: 'No speech detected — move closer to the mic and try again.' },
  '辨識逾時，請檢查網路後重試。': { 'zh-CN': '识别超时，请检查网络后重试。', en: 'Recognition timed out — check your connection and try again.' },
  '辨識失敗，請重試。': { 'zh-CN': '识别失败，请重试。', en: 'Recognition failed. Please try again.' },
  '沒有錄到聲音，請重試。': { 'zh-CN': '没有录到声音，请重试。', en: 'No audio was recorded. Please try again.' },
  '麥克風尚未授權。請點擊網址列左側的圖示開啟麥克風權限後再試。': {
    'zh-CN': '麦克风尚未授权。请点击网址栏左侧的图标开启麦克风权限后再试。',
    en: 'Microphone access hasn’t been granted. Click the icon on the left of the address bar to enable it, then try again.',
  },
  '找不到麥克風裝置，請確認麥克風已連接。': { 'zh-CN': '找不到麦克风设备，请确认麦克风已连接。', en: 'No microphone found — please make sure a microphone is connected.' },
  '無法啟用麥克風，請重試。': { 'zh-CN': '无法启用麦克风，请重试。', en: 'Couldn’t enable the microphone. Please try again.' },
  '錄音中…': { 'zh-CN': '录音中…', en: 'Recording…' },
  '辨識中…': { 'zh-CN': '识别中…', en: 'Recognizing…' },
  '辨識失敗，請重試': { 'zh-CN': '识别失败，请重试', en: 'Recognition failed, please retry' },
  '語音輸入': { 'zh-CN': '语音输入', en: 'Voice Input' },
  '停止錄音': { 'zh-CN': '停止录音', en: 'Stop Recording' },
  '辨識中，請稍候': { 'zh-CN': '识别中，请稍候', en: 'Recognizing, please wait' },
  '重試語音輸入': { 'zh-CN': '重试语音输入', en: 'Retry Voice Input' },
  '開始語音輸入': { 'zh-CN': '开始语音输入', en: 'Start Voice Input' },
}
