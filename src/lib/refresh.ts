// 「硬重整」：安裝成 Web App / iOS 殼後沒有網址列可重整，且 loader 資料以 useState
// 快取住，router.invalidate() 無法洗掉舊畫面。改成解除 service worker、清掉所有快取，
// 再整頁重新載入，確保抓到最新前端與資料。頂部重整鈕與社群下拉重整共用同一套邏輯。
export async function hardRefresh(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch (e) {
    console.error('[refresh]', e)
  } finally {
    window.location.reload()
  }
}

// 背景超過這個時長才自動硬重整；太短會在使用者正常切出去看通知、回訊息時就打斷操作，
// 太長又達不到「原生殼 WebView 長時間停留在舊版前端／舊資料」這個問題本身的目的。
const AUTO_REFRESH_BACKGROUND_MS = 15 * 60 * 1000 // 15 分鐘

let backgroundedAt: number | null = null
let autoRefreshRegistered = false

/**
 * 只給原生殼（iOS／Android）用：App 從背景切回前景時，若背景超過
 * AUTO_REFRESH_BACKGROUND_MS 就自動呼叫 hardRefresh()。
 *
 * 背景：殼版 App 用 Capacitor 的 server.url 直接載入線上網站，前端/資料更新理論上
 * 不需要重新上架——但 WebView 切到背景再切回來，預設不會重新 navigate 這個頁面，
 * 等於一直停留在很久以前那次載入的舊畫面／舊資料，使用者不會知道要去按頂部那顆
 * 手動重新整理鈕（見本檔案上方 hardRefresh 的註解）。這裡補上「太久沒動就自動重整」，
 * 讓多數情況下使用者不用自己發現、自己按。
 *
 * 純網頁環境不需要這個機制（分頁本身就會自然重新整理），呼叫端要自己用
 * isNativeApp() 判斷是否要註冊；這裡不重複判斷，避免這個模組依賴 nativeAuth。
 * 只會註冊一次（HMR／重複掛載時不會疊加監聽器）。
 */
export async function registerAutoHardRefresh(): Promise<void> {
  if (autoRefreshRegistered) return
  autoRefreshRegistered = true
  try {
    const { App } = await import('@capacitor/app')
    await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        backgroundedAt = Date.now()
        return
      }
      const since = backgroundedAt
      backgroundedAt = null
      if (since !== null && Date.now() - since >= AUTO_REFRESH_BACKGROUND_MS) {
        void hardRefresh()
      }
    })
  } catch (e) {
    console.error('[refresh] registerAutoHardRefresh failed', e)
  }
}
