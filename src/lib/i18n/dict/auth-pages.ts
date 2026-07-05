import type { Translation } from '../dictionary'

export const authPages: Record<string, Translation> = {
  // login.tsx
  '寄送失敗，請確認 email 後再試一次。': {
    'zh-CN': '发送失败，请确认 email 后再试一次。',
    en: 'Failed to send — please check your email and try again.',
  },
  '驗證碼錯誤或已過期，請重新輸入。': {
    'zh-CN': '验证码错误或已过期，请重新输入。',
    en: 'Incorrect or expired code — please try again.',
  },
  '嗨，很高興認識你！歡迎來到 PSY by PSY 心理健身房。': {
    'zh-CN': '嗨，很高兴认识你！欢迎来到 PSY by PSY 心理健身房。',
    en: 'Hi, nice to meet you! Welcome to PSY by PSY Mental Fitness Gym.',
  },
  '照顧心理，就像照顧身體一樣自然，先從登入開始吧。': {
    'zh-CN': '照顾心理，就像照顾身体一样自然，先从登录开始吧。',
    en: 'Caring for your mind is as natural as caring for your body — start by logging in.',
  },
  'PSY by PSY 教練': { 'zh-CN': 'PSY by PSY 教练', en: 'PSY by PSY Coach' },
  '輸入 email': { 'zh-CN': '输入 email', en: 'Enter your email' },
  '輸入 6 位數驗證碼': { 'zh-CN': '输入 6 位数验证码', en: 'Enter the 6-digit code' },
  '寄送中…': { 'zh-CN': '发送中…', en: 'Sending…' },
  '用 Email 登入': { 'zh-CN': '用 Email 登录', en: 'Log in with Email' },
  '驗證中…': { 'zh-CN': '验证中…', en: 'Verifying…' },
  '確認驗證碼': { 'zh-CN': '确认验证码', en: 'Confirm Code' },
  '重新輸入 email': { 'zh-CN': '重新输入 email', en: 'Re-enter email' },
  '或': { 'zh-CN': '或', en: 'or' },
  '用 Google 登入': { 'zh-CN': '用 Google 登录', en: 'Log in with Google' },
  '請點右下角／右上角的「⋯」選單，選擇「用外部瀏覽器開啟」。': {
    'zh-CN': '请点右下角／右上角的「⋯」菜单，选择「用外部浏览器打开」。',
    en: 'Tap the "⋯" menu in the bottom-right or top-right corner, then choose "Open in external browser."',
  },
  '請點右上角的「⋯」選單，選擇「在瀏覽器中開啟」。': {
    'zh-CN': '请点右上角的「⋯」菜单，选择「在浏览器中打开」。',
    en: 'Tap the "⋯" menu in the top-right corner, then choose "Open in browser."',
  },
  '請點畫面上的選單按鈕（通常是「⋯」），選擇「在瀏覽器開啟」。': {
    'zh-CN': '请点画面上的菜单按钮（通常是「⋯」），选择「在浏览器打开」。',
    en: 'Tap the menu button on screen (usually "⋯"), then choose "Open in browser."',
  },
  '請用外部瀏覽器開啟': { 'zh-CN': '请用外部浏览器打开', en: 'Please Open in an External Browser' },
  '為讓使用者有更佳心理健身體驗，完整保存您的心理健身紀錄，本App僅限使用外部瀏覽器開啟。': {
    'zh-CN': '为了让用户有更好的心理健身体验，完整保存您的心理健身记录，本 App 仅限使用外部浏览器打开。',
    en: 'For a better experience and to fully save your mental fitness records, this app can only be opened in an external browser.',
  },
  '請按下方按鈕，用手機的瀏覽器重新開啟。': {
    'zh-CN': '请按下方按钮，用手机的浏览器重新打开。',
    en: 'Tap the button below to reopen this in your phone’s browser.',
  },
  '用外部瀏覽器開啟': { 'zh-CN': '用外部浏览器打开', en: 'Open in External Browser' },
  '已複製網址 ✓': { 'zh-CN': '已复制网址 ✓', en: 'Link Copied ✓' },
  '複製網址，自行貼到瀏覽器': { 'zh-CN': '复制网址，自行粘贴到浏览器', en: 'Copy Link to Paste in Browser' },

  // privacy.tsx
  '隱私政策': { 'zh-CN': '隐私政策', en: 'Privacy Policy' },
  'PSY by PSY 心理健身房': { 'zh-CN': 'PSY by PSY 心理健身房', en: 'PSY by PSY Mental Fitness Gym' },
  '最後更新：{date}': { 'zh-CN': '最后更新：{date}', en: 'Last updated: {date}' },
  '2026 年 6 月 19 日': { 'zh-CN': '2026 年 6 月 19 日', en: 'June 19, 2026' },
  '一、前言': { 'zh-CN': '一、前言', en: '1. Introduction' },
  'PSY by PSY（以下稱「我們」或「本服務」）重視你的隱私。本政策說明我們在你使用本 App 與網站時，會蒐集哪些資料、如何使用，以及你對自己資料擁有哪些權利。使用本服務即表示你同意本政策的內容。': {
    'zh-CN': 'PSY by PSY（以下称「我们」或「本服务」）重视你的隐私。本政策说明我们在你使用本 App 与网站时，会收集哪些资料、如何使用，以及你对自己资料拥有哪些权利。使用本服务即表示你同意本政策的内容。',
    en: 'PSY by PSY ("we," "us," or "the Service") values your privacy. This policy explains what data we collect when you use our app and website, how we use it, and what rights you have over your own data. By using the Service, you agree to this policy.',
  },
  '二、我們蒐集的資料': { 'zh-CN': '二、我们收集的资料', en: '2. Data We Collect' },
  '帳號資料': { 'zh-CN': '账号资料', en: 'Account Information' },
  '當你使用 Google 登入時，我們會取得你的 Email、姓名與頭像，用於建立並辨識你的帳號。': {
    'zh-CN': '当你使用 Google 登录时，我们会获取你的 Email、姓名与头像，用于创建并识别你的账号。',
    en: 'When you log in with Google, we receive your email, name, and avatar to create and identify your account.',
  },
  '你建立的內容': { 'zh-CN': '你创建的内容', en: 'Content You Create' },
  '感恩日記、心理健康測驗的作答與結果、社群貼文與留言、專注紀錄等你主動輸入的內容。': {
    'zh-CN': '感恩日记、心理健康测验的作答与结果、社区帖子与留言、专注记录等你主动输入的内容。',
    en: 'Gratitude journal entries, mental health assessment answers and results, community posts and comments, focus records, and other content you enter.',
  },
  '語音輸入': { 'zh-CN': '语音输入', en: 'Voice Input' },
  '若你使用「語音輸入」回答問卷，錄音會傳送到我們的伺服器轉換成文字（透過 OpenAI 語音辨識）。我們不會長期保存原始錄音。': {
    'zh-CN': '若你使用「语音输入」回答问卷，录音会传送到我们的服务器转换成文字（通过 OpenAI 语音识别）。我们不会长期保存原始录音。',
    en: 'If you use "voice input" to answer questionnaires, the recording is sent to our server to be converted to text (via OpenAI speech recognition). We do not retain the original recording long-term.',
  },
  '使用數據': { 'zh-CN': '使用数据', en: 'Usage Data' },
  '為了改善產品，我們透過 PostHog 蒐集匿名的使用行為（例如你瀏覽了哪些頁面、點擊了哪些功能）。': {
    'zh-CN': '为了改善产品，我们通过 PostHog 收集匿名的使用行为（例如你浏览了哪些页面、点击了哪些功能）。',
    en: 'To improve the product, we use PostHog to collect anonymous usage behavior (e.g., which pages you view and which features you tap).',
  },
  '技術資料': { 'zh-CN': '技术资料', en: 'Technical Information' },
  '維持登入狀態所需的驗證憑證（token），以及裝置與瀏覽器的基本技術資訊。': {
    'zh-CN': '维持登录状态所需的验证凭证（token），以及设备与浏览器的基本技术信息。',
    en: 'Authentication tokens needed to keep you logged in, plus basic technical information about your device and browser.',
  },
  '三、我們如何使用這些資料': { 'zh-CN': '三、我们如何使用这些资料', en: '3. How We Use This Data' },
  '提供服務': { 'zh-CN': '提供服务', en: 'Providing the Service' },
  '讓你登入、保存並同步你的心理健身紀錄。': {
    'zh-CN': '让你登录、保存并同步你的心理健身记录。',
    en: 'To let you log in, save, and sync your mental fitness records.',
  },
  '社群互動': { 'zh-CN': '社区互动', en: 'Community Interaction' },
  '在你選擇分享時，於社群打卡牆顯示你的內容（你可選擇實名、匿名或僅自己可見）。': {
    'zh-CN': '在你选择分享时，于社区打卡墙显示你的内容（你可选择实名、匿名或仅自己可见）。',
    en: 'When you choose to share, your content is shown on the community wall (you may choose to post under your name, anonymously, or privately).',
  },
  '改善體驗': { 'zh-CN': '改善体验', en: 'Improving the Experience' },
  '分析整體使用情況，優化功能與內容。': {
    'zh-CN': '分析整体使用情况，优化功能与内容。',
    en: 'To analyze overall usage and optimize features and content.',
  },
  '通知提醒': { 'zh-CN': '通知提醒', en: 'Notifications' },
  '在你同意後，發送與練習、習慣養成相關的提醒。': {
    'zh-CN': '在你同意后，发送与练习、习惯养成相关的提醒。',
    en: 'With your consent, to send reminders related to practice and habit building.',
  },
  '四、第三方服務': { 'zh-CN': '四、第三方服务', en: '4. Third-Party Services' },
  '本服務透過以下受信任的第三方提供商運作。它們各自有其隱私政策：': {
    'zh-CN': '本服务通过以下受信任的第三方提供商运作。它们各自有其隐私政策：',
    en: 'The Service operates using the following trusted third-party providers, each with their own privacy policy:',
  },
  '資料儲存與帳號登入。': { 'zh-CN': '资料存储与账号登录。', en: 'Data storage and account login.' },
  '第三方登入（OAuth）。': { 'zh-CN': '第三方登录（OAuth）。', en: 'Third-party login (OAuth).' },
  '語音輸入的語音轉文字。': { 'zh-CN': '语音输入的语音转文字。', en: 'Speech-to-text for voice input.' },
  '匿名行為分析。': { 'zh-CN': '匿名行为分析。', en: 'Anonymous behavior analytics.' },
  '網站與後端服務代管。': { 'zh-CN': '网站与后端服务托管。', en: 'Website and backend hosting.' },
  '我們不會將你的個人資料販售給任何第三方。': {
    'zh-CN': '我们不会将你的个人资料出售给任何第三方。',
    en: 'We do not sell your personal data to any third party.',
  },
  '五、資料的保存與安全': { 'zh-CN': '五、资料的保存与安全', en: '5. Data Retention and Security' },
  '我們僅在提供服務所需的期間內保存你的資料，並採取合理的技術與管理措施保護資料安全。資料透過 HTTPS 加密傳輸。': {
    'zh-CN': '我们仅在提供服务所需的期间内保存你的资料，并采取合理的技术与管理措施保护资料安全。资料通过 HTTPS 加密传输。',
    en: 'We retain your data only for as long as necessary to provide the Service, and we take reasonable technical and organizational measures to protect it. Data is transmitted using HTTPS encryption.',
  },
  '六、你的權利': { 'zh-CN': '六、你的权利', en: '6. Your Rights' },
  '你有權查詢、更正或刪除你的個人資料。你可以在 App 內刪除自己的紀錄與貼文，或透過下方聯絡方式要求刪除整個帳號與相關資料。': {
    'zh-CN': '你有权查询、更正或删除你的个人资料。你可以在 App 内删除自己的记录与帖子，或通过下方联络方式要求删除整个账号与相关资料。',
    en: 'You have the right to access, correct, or delete your personal data. You can delete your own records and posts within the app, or contact us below to request deletion of your entire account and related data.',
  },
  '七、兒童隱私': { 'zh-CN': '七、儿童隐私', en: '7. Children’s Privacy' },
  '本服務並非針對 13 歲以下兒童設計，我們不會在知情的情況下蒐集兒童的個人資料。': {
    'zh-CN': '本服务并非针对 13 岁以下儿童设计，我们不会在知情的情况下收集儿童的个人资料。',
    en: 'The Service is not designed for children under 13, and we do not knowingly collect personal data from children.',
  },
  '八、政策更新': { 'zh-CN': '八、政策更新', en: '8. Policy Updates' },
  '我們可能會不時更新本政策。重大變更時會於本頁公告，並更新上方的「最後更新」日期。': {
    'zh-CN': '我们可能会不时更新本政策。重大变更时会于本页公告，并更新上方的「最后更新」日期。',
    en: 'We may update this policy from time to time. Significant changes will be announced on this page, and the "Last updated" date above will be revised.',
  },
  '九、聯絡我們': { 'zh-CN': '九、联络我们', en: '9. Contact Us' },
  '對本政策或你的資料有任何疑問，歡迎透過以下方式聯絡我們：': {
    'zh-CN': '对本政策或你的资料有任何疑问，欢迎通过以下方式联络我们：',
    en: 'If you have any questions about this policy or your data, feel free to contact us:',
  },
  'Email：': { 'zh-CN': 'Email：', en: 'Email: ' },
  'Instagram：': { 'zh-CN': 'Instagram：', en: 'Instagram: ' },
}
