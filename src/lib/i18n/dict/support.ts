import type { Translation } from '../dictionary'

// 支援頁（/support）、參考文獻區塊與登入錯誤訊息的翻譯。
//
// ⚠️ 求助專線是台灣的號碼。英文版刻意保留號碼原文並註明是台灣的專線，
//    不要換成其他國家的號碼——使用者所在地不確定時，給錯號碼比給台灣號碼危險。
export const support: Record<string, Translation> = {
  // ── /support 常見問題 ────────────────────────────────────────────────
  '我要怎麼刪除帳號？': { 'zh-CN': '我要怎么删除账号？', en: 'How do I delete my account?' },
  '登入後前往「我的健心檔案 → 帳號設定 → 刪除帳號」。刪除會立即生效，你的日記、測驗結果與社群貼文都會永久移除且無法復原，不需要來信申請。': {
    'zh-CN': '登录后前往「我的健心档案 → 账号设置 → 删除账号」。删除会立即生效，你的日记、测验结果与社区帖子都会永久移除且无法复原，不需要来信申请。',
    en: 'Sign in and go to Profile → Account Settings → Delete Account. Deletion takes effect immediately: your journal entries, assessment results, and community posts are permanently removed and cannot be recovered. No support request is required.',
  },
  '我忘記密碼了怎麼辦？': { 'zh-CN': '我忘记密码了怎么办？', en: 'What if I forget my password?' },
  '目前重設密碼請直接來信，我們會協助處理。多數使用者是用 Google 或 Apple 登入，這種情況請用原本的登入方式即可，不需要密碼。': {
    'zh-CN': '目前重设密码请直接来信，我们会协助处理。多数用户是用 Google 或 Apple 登录，这种情况请用原本的登录方式即可，不需要密码。',
    en: 'Please email us and we will help you reset it. Most people sign in with Google or Apple — in that case just use the same method again; no password is needed.',
  },
  'Apple 或 Google 登入失敗怎麼辦？': {
    'zh-CN': 'Apple 或 Google 登录失败怎么办？',
    en: 'What if Apple or Google sign-in fails?',
  },
  '請先確認裝置已登入 iCloud 或 Google 帳號、且網路正常，然後再試一次。若仍然失敗，可以改用另一種登入方式，或來信告訴我們你的裝置型號與系統版本。': {
    'zh-CN': '请先确认设备已登录 iCloud 或 Google 账号、且网络正常，然后再试一次。若仍然失败，可以改用另一种登录方式，或来信告诉我们你的设备型号与系统版本。',
    en: 'First check that your device is signed in to iCloud or your Google account and that your connection is working, then try again. If it still fails, use one of the other sign-in methods, or email us with your device model and OS version.',
  },
  '我的日記內容會被拿去訓練 AI 嗎？': {
    'zh-CN': '我的日记内容会被拿去训练 AI 吗？',
    en: 'Is my journal used to train AI?',
  },
  '不會。我們使用 Anthropic Claude 與 OpenAI Whisper 生成回饋與語音轉文字，傳送的內容不含任何個人識別資訊，服務商也不會用這些資料訓練模型。詳見隱私政策。': {
    'zh-CN': '不会。我们使用 Anthropic Claude 与 OpenAI Whisper 生成反馈与语音转文字，传送的内容不含任何个人识别信息，服务商也不会用这些数据训练模型。详见隐私政策。',
    en: 'No. We use Anthropic Claude and OpenAI Whisper to generate feedback and speech-to-text. No personally identifying information is sent, and these providers do not use the data to train their models. See our Privacy Policy for details.',
  },
  '社群裡看到不當內容怎麼辦？': {
    'zh-CN': '社区里看到不当内容怎么办？',
    en: 'What if I see objectionable content in the community?',
  },
  '在該則貼文右上角的選單中選擇「檢舉」並填寫原因，我們會盡快處理。你也可以在同一個選單選擇「封鎖」，該使用者的內容就不會再出現在你的動態中。': {
    'zh-CN': '在该则帖子右上角的菜单中选择「举报」并填写原因，我们会尽快处理。你也可以在同一个菜单选择「屏蔽」，该用户的内容就不会再出现在你的动态中。',
    en: 'Open the menu at the top-right of the post, choose "Report", and give a reason — we will handle it as soon as possible. You can also choose "Block" from the same menu, and that user’s content will no longer appear in your feed.',
  },
  '報告或分數代表我有心理疾病嗎？': {
    'zh-CN': '报告或分数代表我有心理疾病吗？',
    en: 'Does my report or score mean I have a mental illness?',
  },
  '不代表。App 內的檢測與週報是自我覺察的參考工具，不是醫療診斷，也不能取代專業的心理諮商或精神醫療。': {
    'zh-CN': '不代表。App 内的检测与周报是自我觉察的参考工具，不是医疗诊断，也不能取代专业的心理咨询或精神医疗。',
    en: 'No. The assessments and weekly reports in this app are tools for self-reflection. They are not a medical diagnosis and are not a substitute for professional counselling or psychiatric care.',
  },

  // ── /support 版面 ────────────────────────────────────────────────────
  '需要協助？聯絡我們': { 'zh-CN': '需要协助？联络我们', en: 'Need help? Contact us' },
  '支援與聯絡我們': { 'zh-CN': '支持与联络我们', en: 'Support & Contact' },
  '直接聯絡我們': { 'zh-CN': '直接联络我们', en: 'Contact us directly' },
  '有任何問題、建議或需要協助，歡迎透過以下管道與我們聯絡。我們通常會在 2 個工作天內回覆。': {
    'zh-CN': '有任何问题、建议或需要协助，欢迎通过以下渠道与我们联络。我们通常会在 2 个工作日内回复。',
    en: 'For any question, suggestion, or help you need, reach us through the channels below. We usually reply within 2 business days.',
  },
  '常見問題': { 'zh-CN': '常见问题', en: 'Frequently asked questions' },
  '需要立即協助？': { 'zh-CN': '需要立即协助？', en: 'Need urgent help?' },
  '本 App 無法提供緊急危機處理。若你感到持續低落、焦慮，或有傷害自己的念頭，請立即尋求專業協助：': {
    'zh-CN': '本 App 无法提供紧急危机处理。若你感到持续低落、焦虑，或有伤害自己的念头，请立即寻求专业协助：',
    en: 'This app cannot provide emergency crisis support. If you feel persistently low or anxious, or have thoughts of harming yourself, please seek professional help immediately:',
  },
  '衛福部安心專線：1925（24 小時免付費）': {
    'zh-CN': '卫福部安心专线：1925（24 小时免付费）',
    en: 'Taiwan Ministry of Health "Anxin" helpline: 1925 (24 hours, toll-free)',
  },
  '生命線：1995': { 'zh-CN': '生命线：1995', en: 'Lifeline Taiwan: 1995' },
  '張老師專線：1980': { 'zh-CN': '张老师专线：1980', en: 'Teacher Chang Foundation helpline (Taiwan): 1980' },
  '緊急狀況請撥 119 或前往就近急診。': {
    'zh-CN': '紧急状况请拨 119 或前往就近急诊。',
    en: 'In an emergency call 119 (Taiwan) or go to your nearest emergency department.',
  },

  // ── 參考文獻區塊（App Store 審查指南 1.4.1）────────────────────────────
  '理論依據與參考文獻': { 'zh-CN': '理论依据与参考文献', en: 'Scientific basis & references' },
  '{subject}的計分方式與建議內容，是依據下列已發表的心理學研究設計的。點擊任一筆可前往原始文獻。': {
    'zh-CN': '{subject}的计分方式与建议内容，是依据下列已发表的心理学研究设计的。点击任一笔可前往原始文献。',
    en: 'The scoring and recommendations in {subject} are based on the published psychological research listed below. Tap any entry to open the original source.',
  },
  '重要提醒': { 'zh-CN': '重要提醒', en: 'Important notice' },
  '本報告是自我覺察的參考工具，不是醫療診斷，也不能取代專業的心理諮商或精神醫療。分數高低不代表任何疾病的有無。': {
    'zh-CN': '本报告是自我觉察的参考工具，不是医疗诊断，也不能取代专业的心理咨询或精神医疗。分数高低不代表任何疾病的有无。',
    en: 'This report is a tool for self-reflection. It is not a medical diagnosis and is not a substitute for professional counselling or psychiatric care. A high or low score does not indicate the presence or absence of any illness.',
  },
  '若你感到持續的低落、焦慮或有傷害自己的念頭，請尋求專業協助：衛福部安心專線 1925（24 小時免付費）、生命線 1995，或前往就近的身心科門診。緊急狀況請撥 119。': {
    'zh-CN': '若你感到持续的低落、焦虑或有伤害自己的念头，请寻求专业协助：卫福部安心专线 1925（24 小时免付费）、生命线 1995，或前往就近的身心科门诊。紧急状况请拨 119。',
    en: 'If you feel persistently low or anxious, or have thoughts of harming yourself, please seek professional help: Taiwan’s "Anxin" helpline 1925 (24 hours, toll-free), Lifeline Taiwan 1995, or visit a local mental health clinic. In an emergency, call 119.',
  },
  '這份報告的科學依據': { 'zh-CN': '这份报告的科学依据', en: 'The science behind this report' },
  '本次心理健身基線檢測': { 'zh-CN': '本次心理健身基线检测', en: 'this mental fitness baseline assessment' },
  '每週 AI 統整回饋': { 'zh-CN': '每周 AI 统整反馈', en: 'the weekly AI summary' },

  // ── 登入失敗訊息 ─────────────────────────────────────────────────────
  'Apple 登入沒有完成。你可以再試一次，或改用下方的 Google／email 登入。': {
    'zh-CN': 'Apple 登录没有完成。你可以再试一次，或改用下方的 Google／email 登录。',
    en: 'Sign in with Apple did not complete. Please try again, or use Google or email sign-in below.',
  },
  'Google 登入沒有完成。你可以再試一次，或改用下方的 email 登入。': {
    'zh-CN': 'Google 登录没有完成。你可以再试一次，或改用下方的 email 登录。',
    en: 'Google sign-in did not complete. Please try again, or use email sign-in below.',
  },
}
