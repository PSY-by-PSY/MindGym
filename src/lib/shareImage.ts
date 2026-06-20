// 把畫面外的高解析卡片（預設 1080×1440）轉成 PNG 下載／分享。
// 動態載入 html-to-image（按下才載入、不進主包）。
//
// 儲存／分享策略（saveOrShareImage）三條路：
//   1. 原生 App（Capacitor WKWebView）：a[download] 完全無效、Web Share 對檔案
//      支援不穩 → 用 @capacitor/filesystem 寫暫存 PNG，再用 @capacitor/share
//      叫出原生分享面板（可「儲存影像」到照片、AirDrop…）。最可靠。
//   2. 純網頁行動裝置：優先用 Web Share 帶檔案叫出系統分享面板。
//   3. 桌面（或不支援 Web Share）：直接觸發瀏覽器下載。
//
// 呼叫端負責把 node 放在畫面外，並自行 try/catch（使用者取消分享會丟錯，可忽略）。
import { isNativeApp } from './nativeAuth'

export function isMobileDevice(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent)
}

// 原生 App：寫暫存檔 + 原生分享面板。使用者取消視為正常結束。
async function saveNative(
  dataUrl: string,
  filename: string,
  title: string,
  text?: string,
): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  })
  try {
    await Share.share({ title, text, files: [uri] })
  } catch (e) {
    // 使用者在分享面板按取消 → 不是錯誤
    if (e instanceof Error && /cancel/i.test(e.message)) return
    throw e
  }
}

// 將一個 PNG dataURL 依平台「儲存或分享」。使用者取消會安靜結束（不丟錯）。
export async function saveOrShareImage(
  dataUrl: string,
  filename: string,
  title: string,
  text?: string,
): Promise<void> {
  if (isNativeApp()) {
    await saveNative(dataUrl, filename, title, text)
    return
  }
  if (isMobileDevice()) {
    try {
      const blob = await fetch(dataUrl).then((r) => r.blob())
      const file = new File([blob], filename, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text })
        return
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return // 使用者取消
      // 其他錯誤 → 退回下載
    }
  }
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

export async function downloadNodeAsPng(
  node: HTMLElement,
  filename: string,
  title: string,
  size: { width: number; height: number } = { width: 1080, height: 1440 },
): Promise<void> {
  // 等兩個 frame，確保字體／圖片都已排版完成再截圖。
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  const { toPng } = await import('html-to-image')
  const dataUrl = await toPng(node, {
    width: size.width,
    height: size.height,
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: '#ffffff',
    skipFonts: true,
    style: { position: 'static', left: '0', top: '0', transform: 'none', margin: '0' },
  })
  await saveOrShareImage(dataUrl, filename, title)
}
