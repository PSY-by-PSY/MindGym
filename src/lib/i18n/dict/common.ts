import type { Translation } from '../dictionary'

// 全站共用字串（按鈕、狀態、通用詞彙）。
export const common: Record<string, Translation> = {
  '讀取中…': { 'zh-CN': '加载中…', en: 'Loading…' },
  '載入中…': { 'zh-CN': '加载中…', en: 'Loading…' },
  '處理中…': { 'zh-CN': '处理中…', en: 'Processing…' },
  '儲存中…': { 'zh-CN': '保存中…', en: 'Saving…' },
  '送出中…': { 'zh-CN': '提交中…', en: 'Submitting…' },
  '登出': { 'zh-CN': '登出', en: 'Log out' },
  '確定': { 'zh-CN': '确定', en: 'Confirm' },
  '↑ 上下滑動選擇日期 ↓': { 'zh-CN': '↑ 上下滑动选择日期 ↓', en: '↑ Swipe to pick a date ↓' },
  '取消': { 'zh-CN': '取消', en: 'Cancel' },
  '儲存': { 'zh-CN': '保存', en: 'Save' },
  '編輯': { 'zh-CN': '编辑', en: 'Edit' },
  '刪除': { 'zh-CN': '删除', en: 'Delete' },
  '返回': { 'zh-CN': '返回', en: 'Back' },
  '送出': { 'zh-CN': '提交', en: 'Submit' },
  '關閉': { 'zh-CN': '关闭', en: 'Close' },
  '下一步': { 'zh-CN': '下一步', en: 'Next' },
  '上一步': { 'zh-CN': '上一步', en: 'Back' },
  '完成': { 'zh-CN': '完成', en: 'Done' },
  '語言': { 'zh-CN': '语言', en: 'Language' },

  // 練習進入頁理論說明的展開／收合（components/TheorySection.tsx，供 gratitude/process-goal/self-compassion 共用）
  '查看更多': { 'zh-CN': '查看更多', en: 'See more' },
  '收合': { 'zh-CN': '收起', en: 'Collapse' },

  // 隱私分享設定（lib/privacy.ts PRIVACY_OPTIONS，供 gratitude/process-goal/community 共用）
  '匿名分享': { 'zh-CN': '匿名分享', en: 'Share anonymously' },
  '你的名字會顯示在打卡牆上': { 'zh-CN': '你的名字会显示在打卡墙上', en: 'Your name will show on the community wall' },
  '以「能量代號」匿名出現在打卡牆': { 'zh-CN': '以「能量代号」匿名出现在打卡墙', en: 'Appears anonymously on the wall under an energy codename' },
  '只有你看得到，不會出現在打卡牆': { 'zh-CN': '只有你看得到，不会出现在打卡墙', en: 'Only visible to you — won’t appear on the wall' },
  // 練習進入頁的重點條列（自我慈悲／WOOP 共用）
  '可以選擇要不要分享，也能選擇匿名或僅自己看得到': {
    'zh-CN': '可以选择要不要分享，也能选择匿名或仅自己看得到',
    en: 'Choose whether to share — anonymously, or keep it just for yourself',
  },

  // 檢舉原因（lib/communityModeration.ts REPORT_REASONS）
  '騷擾或霸凌': { 'zh-CN': '骚扰或霸凌', en: 'Harassment or bullying' },
  '垃圾訊息或廣告': { 'zh-CN': '垃圾信息或广告', en: 'Spam or advertising' },
  '不當或冒犯內容': { 'zh-CN': '不当或冒犯内容', en: 'Inappropriate or offensive content' },
  '自我傷害疑慮': { 'zh-CN': '自我伤害疑虑', en: 'Self-harm concern' },
  '鼓勵自傷或自殺': { 'zh-CN': '鼓励自伤或自杀', en: 'Encouraging self-harm or suicide' },
  '其他': { 'zh-CN': '其他', en: 'Other' },

  // 發佈前內容過濾（App Store 審查指南 1.2）的擋下提示，見 src/lib/contentFilter.ts。
  // 各練習頁與留言框共用同一組句子，使用者在哪裡被擋，看到的說法都一致。
  '這段文字看起來在鼓勵或教導他人自我傷害，無法發佈到社群。如果此刻難受的是你自己，請撥打安心專線 1925（24 小時免付費）或生命線 1995，緊急狀況請撥 119。': {
    'zh-CN': '这段文字看起来在鼓励或教导他人自我伤害，无法发布到社群。如果此刻难受的是你自己，请拨打安心专线 1925（24 小时免付费）或生命线 1995，紧急状况请拨 119。',
    en: 'This text appears to encourage or instruct others to harm themselves and cannot be posted to the community. If you are the one struggling right now, please call 1925 (free, 24/7) or 1995, or dial 119 in an emergency.',
  },
  '這段文字包含仇恨或歧視字眼，無法發佈到社群。': {
    'zh-CN': '这段文字包含仇恨或歧视字眼，无法发布到社群。',
    en: 'This text contains hateful or discriminatory language and cannot be posted to the community.',
  },
  '這段文字包含攻擊或辱罵他人的字眼，無法發佈到社群。': {
    'zh-CN': '这段文字包含攻击或辱骂他人的字眼，无法发布到社群。',
    en: 'This text contains abusive language directed at others and cannot be posted to the community.',
  },
  '這段文字包含露骨的性內容，無法發佈到社群。': {
    'zh-CN': '这段文字包含露骨的性内容，无法发布到社群。',
    en: 'This text contains explicit sexual content and cannot be posted to the community.',
  },
  '這段文字包含威脅他人的字眼，無法發佈到社群。': {
    'zh-CN': '这段文字包含威胁他人的字眼，无法发布到社群。',
    en: 'This text contains threats against others and cannot be posted to the community.',
  },
  '這段文字看起來是廣告或招攬訊息，無法發佈到社群。': {
    'zh-CN': '这段文字看起来是广告或招揽讯息，无法发布到社群。',
    en: 'This text looks like advertising or solicitation and cannot be posted to the community.',
  },

  '你的帳號因違反社群守則暫時無法發佈內容。私人日記仍可正常書寫，有疑問請從「設定 → 聯絡我們」與我們聯繫。': {
    'zh-CN': '你的账号因违反社群守则暂时无法发布内容。私人日记仍可正常书写，有疑问请从「设置 → 联络我们」与我们联系。',
    en: 'Your account is temporarily suspended from posting for violating the community guidelines. Private journaling still works — contact us via Settings → Contact Us if you have questions.',
  },
}
