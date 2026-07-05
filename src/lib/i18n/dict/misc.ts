import type { Translation } from '../dictionary'

export const misc: Record<string, Translation> = {
  // app.placeholder.tsx
  '此功能': { 'zh-CN': '此功能', en: 'This feature' },
  '敬請期待': { 'zh-CN': '敬请期待', en: 'Coming Soon' },
  '這塊心理肌群的訓練菜單正在準備中，很快就能陪你一起練。': {
    'zh-CN': '这块心理肌群的训练菜单正在准备中，很快就能陪你一起练。',
    en: 'The training menu for this mental muscle is being prepared — it’ll be ready to practice with you soon.',
  },
  '返回訓練中心': { 'zh-CN': '返回训练中心', en: 'Back to Training Center' },

  // NotificationConsent.tsx
  '通知已開啟！有人為你的貼文按讚或留言時會提醒你': {
    'zh-CN': '通知已开启！有人为你的帖子点赞或留言时会提醒你',
    en: 'Notifications enabled! We’ll let you know when someone likes or comments on your post.',
  },
  '想在有人為你的貼文按讚、留言，以及每晚提醒打卡時收到通知嗎？開啟後我們才能傳送系統通知給你。': {
    'zh-CN': '想在有人为你的帖子点赞、留言，以及每晚提醒打卡时收到通知吗？开启后我们才能发送系统通知给你。',
    en: 'Want to be notified when someone likes or comments on your post, and get a nightly check-in reminder? Enable notifications so we can send them to you.',
  },
  '稍後再說': { 'zh-CN': '稍后再说', en: 'Maybe Later' },
}
