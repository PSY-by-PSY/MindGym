// 翻譯字典彙總。每個命名空間檔案（./dict/*.ts）各自維護一批「原文（繁中）→ { 簡中, 英文 }」，
// 這裡合併成單一查表供 t() 使用。key 一律是畫面上實際出現過的繁中原文字串。
import { common } from './dict/common'
import { appShell } from './dict/app-shell'
import { authPages } from './dict/auth-pages'
import { home } from './dict/home'
import { profile } from './dict/profile'
import { gratitude } from './dict/gratitude'
import { processGoal } from './dict/process-goal'
import { community } from './dict/community'
import { workshop } from './dict/workshop'
import { proModule } from './dict/pro-module'
import { therapist } from './dict/therapist'
import { admin } from './dict/admin'
import { pretest } from './dict/pretest'
import { misc } from './dict/misc'
import { diaryAssessment } from './dict/diary-assessment'

export type Translation = { 'zh-CN': string; en: string }
export type Dictionary = Record<string, Translation>

export const DICTIONARY: Dictionary = {
  ...common,
  ...appShell,
  ...authPages,
  ...home,
  ...profile,
  ...gratitude,
  ...processGoal,
  ...community,
  ...workshop,
  ...proModule,
  ...therapist,
  ...admin,
  ...pretest,
  ...misc,
  ...diaryAssessment,
}
