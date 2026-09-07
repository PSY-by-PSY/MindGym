import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router'
import type { RouterContext } from '../main'

// 桌機優先的隱藏後台路由：這些頁面本來就是設計給寬螢幕用的（表格、多欄
// 版面、全螢幕 iframe），不能套「手機外框」，否則會被壓成 480px 而跑版。
const DESKTOP_ROUTES = ['/therapist', '/admin', '/staff']

export function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isDesktopRoute = DESKTOP_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )

  // 桌機路由：完全不包外框。除了寬度之外，.app-frame 的 container-type:
  // inline-size 會產生 layout containment，讓子孫的 position: fixed 改以
  // 這個 div 為 containing block（彈窗／浮層會跑位），所以整層都不能套。
  if (isDesktopRoute) return <Outlet />

  // .app-frame：桌面網頁版的「手機外框」容器（詳見 index.css）。App 版完全
  // 不受影響，寬度行為與新增前一致；只有網頁版會把整個 App 收窄到手機寬度
  // 並置中，避免練習頁的滿版出血封面圖在寬螢幕上被撐到異常巨大。
  return (
    <div className="app-frame frame-width">
      <Outlet />
    </div>
  )
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})
