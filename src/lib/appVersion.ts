// 原生殼強制更新檢查。背景見 supabase/app_config.sql 開頭註解。
// 純網頁（非 Capacitor 原生殼）一律跳過：isNativeApp() 為 false 時直接回傳 null。
import { Capacitor } from '@capacitor/core'
import { isNativeApp } from './nativeAuth'
import { supabase } from './supabase'

export type ForceUpdateInfo = {
  currentVersion: string
  minVersion: string
  updateUrl: string | null
  message: string | null
}

// 比較 'x.y.z' 版本字串：a < b 回傳負數，a > b 回傳正數，相等回傳 0。
// 缺位補 0（'1.2' 視為 '1.2.0'），非數字片段視為 0，避免拿到怪格式時整個掛掉。
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = Number(pa[i]) || 0
    const nb = Number(pb[i]) || 0
    if (na !== nb) return na - nb
  }
  return 0
}

// 回傳 null 代表「不需要擋」（純網頁、拿不到設定、或版本已達標）；
// 回傳 ForceUpdateInfo 代表目前殼版本低於 min_version，需要全螢幕擋下。
export async function checkForceUpdate(): Promise<ForceUpdateInfo | null> {
  if (!isNativeApp()) return null
  const platform = Capacitor.getPlatform()
  if (platform !== 'ios' && platform !== 'android') return null

  const { App } = await import('@capacitor/app')
  const { version: currentVersion } = await App.getInfo()

  const { data, error } = await supabase
    .from('app_config')
    .select('min_version, update_url, update_message')
    .eq('platform', platform)
    .maybeSingle()

  // 查不到設定（表還沒建好、或網路問題）時不擋，避免誤傷所有使用者。
  if (error || !data) return null

  if (compareVersions(currentVersion, data.min_version) >= 0) return null

  return {
    currentVersion,
    minVersion: data.min_version,
    updateUrl: data.update_url,
    message: data.update_message,
  }
}
