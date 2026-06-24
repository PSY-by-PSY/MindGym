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
