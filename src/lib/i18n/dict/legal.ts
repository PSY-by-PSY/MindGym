import type { Translation } from '../dictionary'

// 使用者條款、隱私政策與登入後同意閘門的文案翻譯。
//
// ⚠️ 法律文件的翻譯只是「方便閱讀」用途，繁體中文版為準據版本。
//    若日後條款有實質修訂，三種語言要一起更新，不要只改繁中——
//    否則英文使用者看到的會是舊版內容，法律上站不住腳。
//
// ⚠️ 條款第四節「零容忍」是 App Store 審查指南 1.2 的核心要求，
//    三種語言都必須明確表達「不容忍冒犯內容與濫用使用者」。
export const legal: Record<string, Translation> = {
  // 條款／隱私政策的「最後更新」日期。修改 TERMS_LAST_UPDATED /
  // PRIVACY_LAST_UPDATED 時，這一行也要跟著改，否則英文版會停在舊日期。
  '2026 年 9 月 2 日': { 'zh-CN': '2026 年 9 月 2 日', en: 'September 2, 2026' },

  // ── 使用者條款 ────────────────────────────────────────────────────────
  '一、關於本條款': { 'zh-CN': '一、关于本条款', en: '1. About These Terms' },
  '本條款是你與 PSY by PSY（以下稱「我們」）之間的協議。註冊帳號或使用本服務，即表示你已閱讀、瞭解並同意本條款的全部內容。若你不同意，請勿註冊或使用本服務。': {
    'zh-CN': '本条款是你与 PSY by PSY（以下称「我们」）之间的协议。注册账号或使用本服务，即表示你已阅读、了解并同意本条款的全部内容。若你不同意，请勿注册或使用本服务。',
    en: 'These Terms form an agreement between you and PSY by PSY ("we", "us"). By registering an account or using the Service, you confirm that you have read, understood, and agree to all of these Terms. If you do not agree, please do not register or use the Service.',
  },
  '二、本服務是什麼': { 'zh-CN': '二、本服务是什么', en: '2. What This Service Is' },
  'PSY by PSY 是一款以正向心理學為基礎的自我照顧練習工具，提供感恩日記、過程目標覺察、自我慈悲、WOOP 目標實踐等練習，並可選擇將練習內容分享至社群。': {
    'zh-CN': 'PSY by PSY 是一款以正向心理学为基础的自我照顾练习工具，提供感恩日记、过程目标觉察、自我慈悲、WOOP 目标实践等练习，并可选择将练习内容分享至社区。',
    en: 'PSY by PSY is a self-care practice tool grounded in positive psychology. It offers gratitude journaling, process-goal awareness, self-compassion, and WOOP goal practices, and lets you optionally share your entries with the community.',
  },
  '本服務不是醫療行為，也不能取代專業的心理諮商、精神醫療或危機處理。若你正處於危急狀況，請立即撥打 1925（安心專線）或 119，或前往就近醫療院所。': {
    'zh-CN': '本服务不是医疗行为，也不能取代专业的心理咨询、精神医疗或危机处理。若你正处于危急状况，请立即拨打 1925（安心专线）或 119，或前往就近医疗院所。',
    en: 'This Service is not medical care and is not a substitute for professional counselling, psychiatric treatment, or crisis support. If you are in crisis, call 1925 (Taiwan’s mental health helpline) or 119 immediately, or go to your nearest medical facility.',
  },
  '三、你的帳號': { 'zh-CN': '三、你的账号', en: '3. Your Account' },
  '你必須年滿 13 歲才能使用本服務。': {
    'zh-CN': '你必须年满 13 岁才能使用本服务。',
    en: 'You must be at least 13 years old to use this Service.',
  },
  '你需要對自己帳號下的所有活動負責，並妥善保管登入憑證。': {
    'zh-CN': '你需要对自己账号下的所有活动负责，并妥善保管登录凭证。',
    en: 'You are responsible for all activity under your account, and for keeping your login credentials secure.',
  },
  '你可以隨時在「我的健心檔案 → 帳號設定」中刪除帳號，刪除後你的紀錄將永久移除且無法復原。': {
    'zh-CN': '你可以随时在「我的健心档案 → 账号设置」中删除账号，删除后你的记录将永久移除且无法复原。',
    en: 'You can delete your account at any time under Profile → Account Settings. Deletion permanently removes your records and cannot be undone.',
  },

  // ⚠️ App Store 指南 1.2 的核心：三種語言都要明確表達零容忍。
  '四、社群守則：對冒犯內容與濫用行為零容忍': {
    'zh-CN': '四、社区守则：对冒犯内容与滥用行为零容忍',
    en: '4. Community Rules: Zero Tolerance for Objectionable Content and Abusive Users',
  },
  '本服務包含使用者產生的內容（社群貼文與留言）。我們對冒犯性內容與濫用行為採取零容忍政策：任何違反本節規定的內容一經查證即會被移除，帳號並可能被永久停用，且不另行通知。': {
    'zh-CN': '本服务包含用户产生的内容（社区帖子与留言）。我们对冒犯性内容与滥用行为采取零容忍政策：任何违反本节规定的内容一经查证即会被移除，账号并可能被永久停用，且不另行通知。',
    en: 'This Service contains user-generated content (community posts and comments). We have zero tolerance for objectionable content and abusive users: any content violating this section will be removed once confirmed, and the account may be permanently suspended without further notice.',
  },
  '你同意不會張貼、上傳或散布下列內容：': {
    'zh-CN': '你同意不会张贴、上传或散布下列内容：',
    en: 'You agree not to post, upload, or distribute any of the following:',
  },
  '騷擾、霸凌、威脅、跟蹤或針對特定個人的攻擊': {
    'zh-CN': '骚扰、霸凌、威胁、跟踪或针对特定个人的攻击',
    en: 'Harassment, bullying, threats, stalking, or attacks targeting a specific person',
  },
  '仇恨言論，或基於種族、族裔、國籍、宗教、性別、性傾向、身心障礙等特徵的歧視內容': {
    'zh-CN': '仇恨言论，或基于种族、族裔、国籍、宗教、性别、性倾向、身心障碍等特征的歧视内容',
    en: 'Hate speech, or discriminatory content based on race, ethnicity, nationality, religion, gender, sexual orientation, or disability',
  },
  '色情、露骨性內容，或任何涉及未成年人的不當內容': {
    'zh-CN': '色情、露骨性内容，或任何涉及未成年人的不当内容',
    en: 'Pornography, sexually explicit content, or any inappropriate content involving minors',
  },
  '鼓勵自我傷害、自殺、飲食失調或其他危險行為的內容': {
    'zh-CN': '鼓励自我伤害、自杀、饮食失调或其他危险行为的内容',
    en: 'Content encouraging self-harm, suicide, eating disorders, or other dangerous behaviour',
  },
  '暴力、血腥或令人不安的內容': {
    'zh-CN': '暴力、血腥或令人不安的内容',
    en: 'Violent, graphic, or disturbing content',
  },
  '垃圾訊息、詐騙、廣告或未經同意的商業推銷': {
    'zh-CN': '垃圾信息、诈骗、广告或未经同意的商业推销',
    en: 'Spam, scams, advertising, or unsolicited commercial promotion',
  },
  '侵害他人智慧財產權、隱私或個人資料的內容': {
    'zh-CN': '侵害他人知识产权、隐私或个人资料的内容',
    en: 'Content infringing others’ intellectual property, privacy, or personal data',
  },
  '違反中華民國法令或其他適用法律的內容': {
    'zh-CN': '违反中华民国法令或其他适用法律的内容',
    en: 'Content violating the laws of Taiwan (R.O.C.) or other applicable law',
  },

  '五、檢舉與封鎖': { 'zh-CN': '五、举报与屏蔽', en: '5. Reporting and Blocking' },
  '我們在 App 內提供下列工具，讓你能主動保護自己的使用體驗：': {
    'zh-CN': '我们在 App 内提供下列工具，让你能主动保护自己的使用体验：',
    en: 'The app provides these tools so you can protect your own experience:',
  },
  '檢舉：在任何社群貼文右上角的選單中選擇「檢舉」，並選擇檢舉原因。': {
    'zh-CN': '举报：在任何社区帖子右上角的菜单中选择「举报」，并选择举报原因。',
    en: 'Report: open the menu at the top-right of any community post, choose "Report", and select a reason.',
  },
  '封鎖：在同一個選單中選擇「封鎖」，被封鎖者的貼文與留言將不再顯示給你。': {
    'zh-CN': '屏蔽：在同一个菜单中选择「屏蔽」，被屏蔽者的帖子与留言将不再显示给你。',
    en: 'Block: choose "Block" from the same menu — that person’s posts and comments will no longer be shown to you.',
  },
  '解除封鎖：在側邊欄的「已封鎖的使用者」中可隨時解除。': {
    'zh-CN': '解除屏蔽：在侧边栏的「已屏蔽的用户」中可随时解除。',
    en: 'Unblock: you can undo this at any time under "Blocked users" in the sidebar.',
  },

  '六、你的內容': { 'zh-CN': '六、你的内容', en: '6. Your Content' },
  '你所建立的練習內容與貼文，著作權仍屬於你。': {
    'zh-CN': '你所创建的练习内容与帖子，著作权仍属于你。',
    en: 'You retain copyright in the practice entries and posts you create.',
  },
  '當你選擇分享至社群時，你授權我們在本服務中顯示該內容，供其他使用者瀏覽。': {
    'zh-CN': '当你选择分享至社区时，你授权我们在本服务中显示该内容，供其他用户浏览。',
    en: 'When you choose to share to the community, you grant us permission to display that content within the Service for other users to view.',
  },
  '你可以隨時刪除自己的貼文，或將分享設定改為「僅自己可見」。': {
    'zh-CN': '你可以随时删除自己的帖子，或将分享设置改为「仅自己可见」。',
    en: 'You can delete your posts at any time, or change their visibility to "only me".',
  },

  '七、AI 功能說明': { 'zh-CN': '七、AI 功能说明', en: '7. About the AI Features' },
  '本服務使用第三方 AI 服務（Anthropic Claude 與 OpenAI Whisper）來生成練習回饋、週分析報告與語音轉文字。相關資料處理方式詳見隱私政策。': {
    'zh-CN': '本服务使用第三方 AI 服务（Anthropic Claude 与 OpenAI Whisper）来生成练习反馈、周分析报告与语音转文字。相关数据处理方式详见隐私政策。',
    en: 'This Service uses third-party AI providers (Anthropic Claude and OpenAI Whisper) to generate practice feedback, weekly analysis reports, and speech-to-text. See the Privacy Policy for how that data is handled.',
  },
  'AI 生成的內容僅供自我覺察參考，不構成醫療、心理或法律建議，也可能不準確，請斟酌後再採用。': {
    'zh-CN': 'AI 生成的内容仅供自我觉察参考，不构成医疗、心理或法律建议，也可能不准确，请斟酌后再采用。',
    en: 'AI-generated content is for personal reflection only. It is not medical, psychological, or legal advice, and it may be inaccurate — please use your own judgement.',
  },

  '八、服務變更與終止': { 'zh-CN': '八、服务变更与终止', en: '8. Changes and Termination' },
  '我們可能會新增、修改或停止部分功能，重大變更會於 App 內或本頁公告。': {
    'zh-CN': '我们可能会新增、修改或停止部分功能，重大变更会于 App 内或本页公告。',
    en: 'We may add, change, or discontinue features. Significant changes will be announced in the app or on this page.',
  },
  '若你違反本條款，我們可以在不事先通知的情況下暫停或終止你的帳號。': {
    'zh-CN': '若你违反本条款，我们可以在不事先通知的情况下暂停或终止你的账号。',
    en: 'If you violate these Terms, we may suspend or terminate your account without prior notice.',
  },

  '九、免責聲明': { 'zh-CN': '九、免责声明', en: '9. Disclaimer' },
  '本服務以「現狀」提供。在法律允許的最大範圍內，我們不對服務的中斷、資料遺失或因使用本服務所生的間接損害負責。': {
    'zh-CN': '本服务以「现状」提供。在法律允许的最大范围内，我们不对服务的中断、数据丢失或因使用本服务所生的间接损害负责。',
    en: 'The Service is provided "as is". To the fullest extent permitted by law, we are not liable for service interruptions, data loss, or indirect damages arising from your use of the Service.',
  },

  '十、條款更新': { 'zh-CN': '十、条款更新', en: '10. Updates to These Terms' },
  '我們可能會不時更新本條款。重大變更時會於本頁公告並更新上方的「最後更新」日期。變更後繼續使用本服務，即視為你同意更新後的條款。': {
    'zh-CN': '我们可能会不时更新本条款。重大变更时会于本页公告并更新上方的「最后更新」日期。变更后继续使用本服务，即视为你同意更新后的条款。',
    en: 'We may update these Terms from time to time. Significant changes will be posted here with an updated "Last updated" date. Continuing to use the Service after a change means you accept the updated Terms.',
  },

  '十一、聯絡我們': { 'zh-CN': '十一、联络我们', en: '11. Contact Us' },
  '對本條款有任何疑問，或需要檢舉緊急狀況，歡迎透過以下方式聯絡我們：': {
    'zh-CN': '对本条款有任何疑问，或需要举报紧急状况，欢迎通过以下方式联络我们：',
    en: 'For questions about these Terms, or to report an urgent situation, contact us at:',
  },

  // ── 隱私政策（新增／修改的段落）────────────────────────────────────────
  '你註冊時提供的 Email 與密碼；若使用 Google 或 Apple 登入，我們會取得該服務提供的 Email 與名稱（使用 Apple 登入時，你可以選擇隱藏真實 Email，我們只會收到 Apple 提供的轉發信箱）。這些資料用於建立並辨識你的帳號。': {
    'zh-CN': '你注册时提供的 Email 与密码；若使用 Google 或 Apple 登录，我们会获取该服务提供的 Email 与名称（使用 Apple 登录时，你可以选择隐藏真实 Email，我们只会收到 Apple 提供的转发邮箱）。这些资料用于创建并识别你的账号。',
    en: 'The email and password you provide at sign-up; if you use Google or Apple sign-in, the email and name that service provides (with Sign in with Apple you may hide your real email, in which case we only receive Apple’s relay address). This is used to create and identify your account.',
  },
  '第三方登入（Sign in with Apple）。': {
    'zh-CN': '第三方登录（Sign in with Apple）。',
    en: 'Third-party sign-in (Sign in with Apple).',
  },
  '生成練習回饋、週分析報告與內容標記（Claude）。': {
    'zh-CN': '生成练习反馈、周分析报告与内容标记（Claude）。',
    en: 'Generating practice feedback, weekly analysis reports, and content tagging (Claude).',
  },
  '語音輸入的語音轉文字（Whisper）。': {
    'zh-CN': '语音输入的语音转文字（Whisper）。',
    en: 'Speech-to-text for voice input (Whisper).',
  },

  // ── 登入後的同意閘門 ──────────────────────────────────────────────────
  '我已了解': { 'zh-CN': '我已了解', en: 'I understand' },
  '點選「我已了解」即表示你已閱讀並同意使用者條款與隱私政策。': {
    'zh-CN': '点选「我已了解」即表示你已阅读并同意用户条款与隐私政策。',
    en: 'Tapping "I understand" confirms that you have read and agree to the Terms of Use and Privacy Policy.',
  },
  '儲存失敗，請檢查網路後再試一次。': {
    'zh-CN': '保存失败，请检查网络后再试一次。',
    en: 'Could not save — please check your connection and try again.',
  },
}
