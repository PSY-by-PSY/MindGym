import type { Translation } from '../dictionary'

// 強制更新擋板（ForceUpdateGate）用字串。
export const appUpdate: Record<string, Translation> = {
  '有新版本囉！': { 'zh-CN': '有新版本啦！', en: 'A new version is available!' },
  '這個版本已經停止支援，請更新到最新版本才能繼續使用。': {
    'zh-CN': '这个版本已经停止支持，请更新到最新版本才能继续使用。',
    en: 'This version is no longer supported. Please update to keep using the app.',
  },
  '立即更新': { 'zh-CN': '立即更新', en: 'Update now' },
  '目前版本 {current} · 需要版本 {min} 以上': {
    'zh-CN': '当前版本 {current} · 需要版本 {min} 以上',
    en: 'Current version {current} · requires {min} or later',
  },
}
