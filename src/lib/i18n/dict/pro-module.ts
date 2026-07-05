import type { Translation } from '../dictionary'

// 專業模組（個案端）：模組播放頁、同意視窗、危機求助資源視窗。
export const proModule: Record<string, Translation> = {
  '更多選項': { 'zh-CN': '更多选项', en: 'More options' },
  '查看同意內容': { 'zh-CN': '查看同意内容', en: 'View consent details' },
  '停止追蹤關係': { 'zh-CN': '停止跟踪关系', en: 'Stop tracking relationship' },
  '來自 {name}': { 'zh-CN': '来自 {name}', en: 'From {name}' },
  '你的專業夥伴': { 'zh-CN': '你的专业伙伴', en: 'Your practitioner' },
  '請先完成所有必填題目。': { 'zh-CN': '请先完成所有必填题目。', en: 'Please complete all required questions first.' },
  '儲存失敗，請稍後再試一次。': { 'zh-CN': '保存失败，请稍后再试一次。', en: 'Save failed. Please try again later.' },
  '完成練習': { 'zh-CN': '完成练习', en: 'Finish exercise' },
  '模組已更新': { 'zh-CN': '模块已更新', en: 'Module updated' },
  '{title} 的內容已由專業夥伴更新，以下是最新版本。': {
    'zh-CN': '{title} 的内容已由专业伙伴更新，以下是最新版本。',
    en: '{title} has been updated by your practitioner. Here is the latest version.',
  },
  '知道了': { 'zh-CN': '知道了', en: 'Got it' },
  '停止追蹤關係？': { 'zh-CN': '停止跟踪关系？', en: 'Stop tracking relationship?' },
  '停止後 {name} 將無法看到你的任何練習紀錄，模組也會從你的列表移除。若要恢復，需要重新輸入邀請碼。': {
    'zh-CN': '停止后 {name} 将无法看到你的任何练习记录，模块也会从你的列表移除。若要恢复，需要重新输入邀请码。',
    en: 'Once stopped, {name} will no longer be able to see any of your exercise records, and the module will be removed from your list. To resume, you’ll need to re-enter the invitation code.',
  },
  '確定停止': { 'zh-CN': '确定停止', en: 'Confirm stop' },
  '完成了': { 'zh-CN': '完成了', en: 'Done' },
  '謝謝你今天陪伴了自己，這份紀錄已經保存下來了。': {
    'zh-CN': '谢谢你今天陪伴了自己，这份记录已经保存下来了。',
    en: 'Thank you for showing up for yourself today. This record has been saved.',
  },
  '已分享到社群': { 'zh-CN': '已分享到社区', en: 'Shared to community' },
  '分享中…': { 'zh-CN': '分享中…', en: 'Sharing…' },
  '分享到社群': { 'zh-CN': '分享到社区', en: 'Share to community' },
  '返回首頁': { 'zh-CN': '返回首页', en: 'Back to home' },

  // ConsentModal
  '專業模組': { 'zh-CN': '专业模块', en: 'Practitioner Module' },
  '專業夥伴：{name}': { 'zh-CN': '专业伙伴：{name}', en: 'Practitioner: {name}' },
  '約 {n} 分鐘': { 'zh-CN': '约 {n} 分钟', en: 'About {n} minutes' },
  '開始前，請了解：': { 'zh-CN': '开始前，请了解：', en: 'Before you begin, please note:' },
  '你在此模組的練習紀錄將提供給 {name} 查看。': {
    'zh-CN': '你在此模块的练习记录将提供给 {name} 查看。',
    en: 'Your exercise records in this module will be visible to {name}.',
  },
  '若練習內容出現高風險訊息，系統會同時通知 {name} 並提供你求助資源。': {
    'zh-CN': '若练习内容出现高风险信息，系统会同时通知 {name} 并提供你求助资源。',
    en: 'If your responses contain high-risk content, the system will notify {name} and provide you with support resources.',
  },
  '你可以隨時在模組頁面停止追蹤關係，停止後 {name} 將無法再看到你的任何紀錄。': {
    'zh-CN': '你可以随时在模块页面停止跟踪关系，停止后 {name} 将无法再看到你的任何记录。',
    en: 'You can stop the tracking relationship at any time on the module page. Once stopped, {name} will no longer be able to see any of your records.',
  },
  '同時分享我的 PERMA 心理測驗結果': { 'zh-CN': '同时分享我的 PERMA 心理测验结果', en: 'Also share my PERMA assessment results' },
  '讓 {name} 更了解你的整體狀態（選填）。': {
    'zh-CN': '让 {name} 更了解你的整体状态（选填）。',
    en: 'Help {name} better understand your overall wellbeing (optional).',
  },
  '我同意，開始練習': { 'zh-CN': '我同意，开始练习', en: 'I agree, start the exercise' },
  '先不要': { 'zh-CN': '先不要', en: 'Not now' },

  // CrisisResourcesModal
  '安心專線': { 'zh-CN': '安心专线', en: 'Anxin Hotline' },
  '24 小時免付費': { 'zh-CN': '24 小时免付费', en: '24-hour toll-free' },
  '生命線': { 'zh-CN': '生命线', en: 'Lifeline' },
  '張老師專線': { 'zh-CN': '张老师专线', en: 'Teacher Chang Hotline' },
  '你並不孤單': { 'zh-CN': '你并不孤单', en: 'You are not alone' },
  '謝謝你願意把這些寫下來。看起來你現在承受著不小的辛苦——你不需要一個人撐著。': {
    'zh-CN': '谢谢你愿意把这些写下来。看起来你现在承受着不小的辛苦——你不需要一个人撑着。',
    en: 'Thank you for being willing to write this down. It sounds like you’re carrying something heavy right now — you don’t have to face it alone.',
  },
  '若有立即危險，請撥打': { 'zh-CN': '若有立即危险，请拨打', en: 'If you are in immediate danger, please call' },
  '或': { 'zh-CN': '或', en: 'or' },
  '。': { 'zh-CN': '。', en: '.' },
  '你的專業夥伴也會收到提醒，可能會主動關心你。': {
    'zh-CN': '你的专业伙伴也会收到提醒，可能会主动关心你。',
    en: 'Your practitioner will also receive an alert and may reach out to check on you.',
  },
  '我知道了': { 'zh-CN': '我知道了', en: 'I understand' },
}
