// 把畫面外的高解析卡片（預設 1080×1440）轉成 PNG 下載／分享。
// 沿用感恩日記、過程目標覺察的做法：動態載入 html-to-image（按下才載入、不進主包），
// 行動裝置優先用系統分享面板，桌面則直接觸發下載。
//
// 呼叫端負責把 node 放在畫面外（例如 fixed -left-[9999px]、固定寬高），
// 並自行 try/catch（使用者取消分享會丟 AbortError，可忽略）。
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
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent)
  if (isMobile) {
    const blob = await fetch(dataUrl).then((r) => r.blob())
    const file = new File([blob], filename, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title })
      return
    }
  }
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

export function isMobileDevice(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent)
}
