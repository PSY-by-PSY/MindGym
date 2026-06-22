// ─────────────────────────────────────────────────────────────────────────
// 工作坊專屬練習 — 存取控制（密碼保護）＋ 工作坊歸屬（依日期分組）
//
// 四個工作坊模塊（暖身卡牌、找尋真實自我、生命最後一天、WOOP）共用同一組密碼
// 驗證。使用者在同一個分頁／使用階段中通過一次後，解鎖狀態與「所屬工作坊（日期）」
// 都存進 sessionStorage，之後切換到其他工作坊模塊都不需要再輸入密碼。關閉分頁後
// sessionStorage 會清空，下次再進來需重新輸入密碼。
// ─────────────────────────────────────────────────────────────────────────

import { isoLocalDate } from './date'

// ⚠️ 測試階段使用，正式上線前應更換為更安全的驗證方式（例如後端驗證、一次性
//    邀請碼或帳號授權）。目前只做「前端字串比對」，密碼會被打包進前端程式碼，
//    任何人都能在瀏覽器中查看，無法視為真正的安全機制。
//
// 暫行密碼機制（規格 [2]）：格式為 `psyXXXXXXXX`，其中 XXXXXXXX 為西元日期
// （如 psy20260620）。輸入的日期決定使用者所屬的「工作坊」——對應的貼文會聚合
// 在社群「工作坊貼文」頁面、產生一個 `[20260620 工作坊]` 的 Block。
//
// 仍保留舊的固定密碼（VITE_WORKSHOP_PASSWORD / 'psy2025'）以相容既有流程；以舊
// 密碼通過時，工作坊歸屬於「今天」。
export const WORKSHOP_PASSWORD =
  (import.meta.env.VITE_WORKSHOP_PASSWORD as string | undefined) ?? 'psy2025'

// 歷史貼文（規格 [2] 相容處理）一律歸入這個工作坊。Migration 腳本
// supabase/workshop_posts.sql 會把既有工作坊貼文的 payload.workshop_id 設為此值；
// 前端在 payload 沒有 workshop_id 時也退回此值，因此 migration 未跑前畫面照樣正確。
export const LEGACY_WORKSHOP_ID = '0619意義感工作坊'

// sessionStorage 的 key —— 四個模塊共用。
const UNLOCK_KEY = 'workshop_unlocked'
const WORKSHOP_ID_KEY = 'workshop_id'

// `psy` + 8 位數日期（YYYYMMDD）。
const DATED_PASSWORD_RE = /^psy(\d{8})$/i

/** 把 Date 轉成工作坊 id 用的 8 位數日期字串（YYYYMMDD，本地時區）。 */
export function todayWorkshopId(d: Date = new Date()): string {
  return isoLocalDate(d).replace(/-/g, '')
}

/** 8 位數日期字串看起來是否為合理日期（避免 psy00000000 之類）。 */
function isPlausibleDate(yyyymmdd: string): boolean {
  const y = Number(yyyymmdd.slice(0, 4))
  const m = Number(yyyymmdd.slice(4, 6))
  const day = Number(yyyymmdd.slice(6, 8))
  return y >= 2020 && y <= 2100 && m >= 1 && m <= 12 && day >= 1 && day <= 31
}

/**
 * 驗證使用者輸入的密碼，並判斷其所屬工作坊。
 * @returns ok=是否通過；workshopId=通過時所屬工作坊（YYYYMMDD），未通過為 null。
 */
export function parseWorkshopPassword(input: string): {
  ok: boolean
  workshopId: string | null
} {
  const value = input.trim()
  const m = value.match(DATED_PASSWORD_RE)
  if (m && isPlausibleDate(m[1])) {
    return { ok: true, workshopId: m[1] }
  }
  // 相容舊的固定密碼：通過但歸屬於今天的工作坊。
  if (value === WORKSHOP_PASSWORD) {
    return { ok: true, workshopId: todayWorkshopId() }
  }
  return { ok: false, workshopId: null }
}

/** 是否已在本次使用階段通過工作坊密碼驗證。 */
export function isWorkshopUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === 'true'
  } catch {
    // 隱私模式等情境下 sessionStorage 可能無法使用，視為尚未解鎖。
    return false
  }
}

/** 密碼驗證通過後呼叫，記錄解鎖狀態與所屬工作坊（日期）。 */
export function unlockWorkshop(workshopId: string): void {
  try {
    sessionStorage.setItem(UNLOCK_KEY, 'true')
    sessionStorage.setItem(WORKSHOP_ID_KEY, workshopId)
  } catch {
    // sessionStorage 無法寫入時靜默略過（解鎖狀態僅維持在當前頁面記憶體中）。
  }
}

/**
 * 取得本次使用階段所屬的工作坊 id（YYYYMMDD）。
 * 沒有記錄（例如尚未輸入密碼、或舊版 sessionStorage）時退回今天。
 */
export function getWorkshopId(): string {
  try {
    const id = sessionStorage.getItem(WORKSHOP_ID_KEY)
    if (id && id.trim()) return id
  } catch {
    /* 忽略 */
  }
  return todayWorkshopId()
}

/** 取貼文所屬的工作坊 id：payload 沒有 workshop_id 時退回歷史工作坊。 */
export function workshopIdFromPayload(workshopId: unknown): string {
  if (typeof workshopId === 'string' && workshopId.trim()) return workshopId
  return LEGACY_WORKSHOP_ID
}

/** 工作坊 id → 顯示用標籤。8 位數日期顯示為「YYYY/MM/DD 工作坊」，其餘原樣顯示。 */
export function formatWorkshopLabel(workshopId: string): string {
  if (/^\d{8}$/.test(workshopId)) {
    return `${workshopId.slice(0, 4)}/${workshopId.slice(4, 6)}/${workshopId.slice(6, 8)} 工作坊`
  }
  return workshopId
}

/** 比對使用者輸入的密碼是否正確（沿用舊 API 名稱，給既有呼叫端）。 */
export function checkWorkshopPassword(input: string): boolean {
  return parseWorkshopPassword(input).ok
}
