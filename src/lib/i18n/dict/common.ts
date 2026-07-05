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

  // 隱私分享設定（lib/privacy.ts PRIVACY_OPTIONS，供 gratitude/process-goal/community 共用）
  '匿名分享': { 'zh-CN': '匿名分享', en: 'Share anonymously' },
  '你的名字會顯示在打卡牆上': { 'zh-CN': '你的名字会显示在打卡墙上', en: 'Your name will show on the community wall' },
  '以「能量代號」匿名出現在打卡牆': { 'zh-CN': '以「能量代号」匿名出现在打卡墙', en: 'Appears anonymously on the wall under an energy codename' },
  '只有你看得到，不會出現在打卡牆': { 'zh-CN': '只有你看得到，不会出现在打卡墙', en: 'Only visible to you — won’t appear on the wall' },

  // 檢舉原因（lib/communityModeration.ts REPORT_REASONS）
  '騷擾或霸凌': { 'zh-CN': '骚扰或霸凌', en: 'Harassment or bullying' },
  '垃圾訊息或廣告': { 'zh-CN': '垃圾信息或广告', en: 'Spam or advertising' },
  '不當或冒犯內容': { 'zh-CN': '不当或冒犯内容', en: 'Inappropriate or offensive content' },
  '自我傷害疑慮': { 'zh-CN': '自我伤害疑虑', en: 'Self-harm concern' },
  '其他': { 'zh-CN': '其他', en: 'Other' },
}
