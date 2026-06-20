import { createFileRoute, redirect, Outlet, Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { type FontScale, FONT_SCALE_OPTIONS, getFontScale, setFontScale } from '../lib/fontScale'
import { fetchNotifications, getLastSeen, setLastSeen, type NotificationItem } from '../lib/notifications'
import { isNativeApp } from '../lib/nativeAuth'
import {
  pushLocalNotification,
  getLocalNotifPermission,
  enableNotifications,
  NOTIF_CONSENT_KEY,
  type NotifPermission,
} from '../lib/localNotifications'
import { registerForPush } from '../lib/pushNotifications'

export const Route = createFileRoute('/app')({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
  },
  component: AppShell,
})

function AppShell() {
  // 進到（已登入的）App 區域時，若已授權通知就（重新）註冊遠端推播，
  // 確保 device token 對應到目前登入的帳號（startup 時可能 session 還沒就緒）。
  useEffect(() => { void registerForPush() }, [])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopHeader />
      <main className="flex-1 pb-24 pt-[calc(3.5rem+env(safe-area-inset-top))]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

function TopHeader() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [fontScale, setFontScaleState] = useState<FontScale>(() => getFontScale())

  const changeFontScale = (scale: FontScale) => {
    setFontScale(scale)
    setFontScaleState(scale)
  }

  // 安裝成 Web App（standalone）後沒有瀏覽器網址列可重整。先前用 router.invalidate()
  // 只重跑 loader，但元件內以 useState 快取的 loader 資料不會更新，畫面仍是舊的。
  // 改成真正「洗掉」舊內容：先解除 PWA service worker、清掉所有快取，再整頁重新載入，
  // 確保抓到最新前端與資料。
  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
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

  return (
    <>
      {/* safe-area padding 疊加在「內容列之上」：header 總高 = safe-area + 56px。
          內容列固定 h-14（56px），不被瀏海/動態島的 inset 壓縮，圖示才不會跑位。 */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-[oklch(1_0_0_/_0.95)] backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between px-4">
          {/* 左側佔位（維持 logo 置中） */}
          <div className="w-28" />

          {/* 中間 Logo */}
          <span className="text-sm font-extrabold tracking-[0.15em] text-foreground uppercase">
            PSY by PSY
          </span>

          {/* 右側 icons */}
          <div className="flex w-28 items-center justify-end gap-1">
            <NotificationBell />
            <button
              aria-label="重新整理"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted active:scale-90 disabled:opacity-60"
            >
              <RefreshIcon spinning={refreshing} />
            </button>
            <button
              aria-label="選單"
              onClick={() => setDrawerOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted active:scale-90"
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </header>

      {/* Side Drawer Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Side Drawer */}
      <aside
        className={`fixed top-0 right-0 z-50 flex h-full w-72 flex-col bg-card shadow-2xl transition-transform duration-300 ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <span className="text-sm font-extrabold tracking-widest text-foreground uppercase">選單</span>
          <button
            aria-label="關閉選單"
            onClick={() => setDrawerOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-4">
          <DrawerLink
            to="/onboarding"
            search={{ reassess: true }}
            icon="📋"
            label="心理健康測驗"
            onClick={() => setDrawerOpen(false)}
          />
          <DrawerExternalLink
            href="https://line.me/ti/g2/s8BmdrBAelUmNj858hi5iHzhJ-vhTQVCqTSokQ?utm_source=invitation&utm_medium=link_copy&utm_campaign=default"
            icon="🧠"
            label="PSYbyPSY 社群"
          />
          <DrawerExternalLink
            href="https://www.instagram.com/psy_by_psy/"
            icon="📸"
            label="IG 追蹤我們"
          />

          <div className="my-2 border-t border-border" />

          {/* 字體大小（無障礙大字模式） */}
          <div className="rounded-2xl px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-xl">🔠</span>
              <span className="font-bold text-foreground">字體大小</span>
            </div>
            <div className="mt-3 flex gap-2">
              {FONT_SCALE_OPTIONS.map((opt) => {
                const active = fontScale === opt.value
                const sizeClass =
                  opt.value === 'standard' ? 'text-sm' : opt.value === 'large' ? 'text-base' : 'text-lg'
                return (
                  <button
                    key={opt.value}
                    onClick={() => changeFontScale(opt.value)}
                    aria-pressed={active}
                    className={`flex-1 rounded-xl px-2 py-2 font-extrabold transition active:scale-95 ${sizeClass} ${
                      active ? 'bg-foreground text-background' : 'bg-muted text-foreground/70'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              放大全站文字，方便閱讀。
            </p>
          </div>

          {/* 通知開關：即使先前按過「稍後再說」，也能在這裡隨時開啟 */}
          <NotificationSetting />
        </nav>
      </aside>
    </>
  )
}

// 選單裡的「通知」控制：給使用者一個「永遠找得到」的入口開啟通知，
// 補足一次性詢問橫幅（按過稍後再說就消失）的缺口。
// 原生 App 走 Local Notifications 權限；純網頁走瀏覽器 Notification。
function NotificationSetting() {
  const [state, setState] = useState<NotifPermission | 'loading'>('loading')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    if (isNativeApp()) {
      setState(await getLocalNotifPermission())
    } else if (typeof Notification !== 'undefined') {
      const p = Notification.permission
      setState(p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt')
    } else {
      setState('unsupported')
    }
  }

  useEffect(() => { void refresh() }, [])

  const enable = async () => {
    setBusy(true)
    try {
      if (isNativeApp()) {
        await enableNotifications()
      } else if (typeof Notification !== 'undefined') {
        await Notification.requestPermission()
      }
      try { localStorage.setItem(NOTIF_CONSENT_KEY, 'granted') } catch { /* 忽略 */ }
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  let body: ReactNode
  if (state === 'loading') {
    body = <p className="mt-2 text-[11px] text-muted-foreground">讀取中…</p>
  } else if (state === 'granted') {
    body = (
      <p className="mt-2 text-[11px] leading-relaxed text-emerald-600">
        ✓ 已開啟。有人按讚、留言，以及每晚會提醒你打卡。
      </p>
    )
  } else if (state === 'denied') {
    body = (
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        通知目前被系統關閉。請到「設定 → PSY by PSY → 通知」開啟。
      </p>
    )
  } else if (state === 'unsupported') {
    body = (
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        此版本暫不支援通知，請更新 App 後再試。
      </p>
    )
  } else {
    body = (
      <button
        onClick={enable}
        disabled={busy}
        className="mt-2 w-full rounded-xl bg-gradient-primary py-2 text-xs font-bold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? '處理中…' : '開啟通知'}
      </button>
    )
  }

  return (
    <div className="rounded-2xl px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-xl">🔔</span>
        <span className="font-bold text-foreground">通知</span>
      </div>
      {body}
    </div>
  )
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '剛剛'
  if (min < 60) return `${min} 分鐘前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小時前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} 天前`
  return new Date(iso).toLocaleDateString('zh-TW')
}

// 通知鈴鐺：只在「有人按讚使用者的貼文」或「有人留言」時顯示未讀。
// 點選後跳到社群「我的貼文」並聚焦該則貼文。
function NotificationBell() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeenState] = useState<string>('1970-01-01T00:00:00.000Z')
  // 上次輪詢時最新一筆通知的時間；用來判斷哪些是「新」互動，避免首次載入就狂跳系統通知
  const baselineRef = useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null
      setUserId(uid)
      if (uid) setLastSeenState(getLastSeen(uid))
    })
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const load = async () => {
      try {
        const list = await fetchNotifications(userId)
        if (cancelled) return
        setItems(list)

        // App 開著時若有新的按讚/留言，主動發系統通知。
        // 原生 App：用 Local Notifications（WKWebView 不支援 Web Notification）。
        // 純網頁：用 Web Notification（需使用者已授權）。
        const maxTime = list.length > 0 ? list[0].createdAt : null
        if (baselineRef.current === null) {
          baselineRef.current = maxTime ?? '1970-01-01T00:00:00.000Z'
        } else if (maxTime && maxTime > baselineRef.current) {
          const fresh = list
            .filter((i) => i.createdAt > (baselineRef.current as string))
            .slice(0, 3)
          if (isNativeApp()) {
            fresh.forEach((i) => { void pushLocalNotification('PSY by PSY', i.title) })
          } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            fresh.forEach((i) => {
              try {
                new Notification('PSY by PSY', { body: i.title })
              } catch { /* 部分平台需 SW，忽略 */ }
            })
          }
          baselineRef.current = maxTime
        }
      } catch (e) {
        console.error('[notifications]', e)
      }
    }
    load()
    const timer = setInterval(load, 60000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [userId])

  if (!userId) return null

  const unread = items.filter((i) => i.createdAt > lastSeen).length

  const openPanel = () => {
    setOpen(true)
    const now = new Date().toISOString()
    setLastSeen(userId, now)
    setLastSeenState(now)
  }

  const handleClick = (item: NotificationItem) => {
    setOpen(false)
    navigate({ to: '/app/community', search: { focus: item.entryId } })
  }

  return (
    <>
      <button
        aria-label="通知"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted active:scale-90"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-2 top-[calc(env(safe-area-inset-top)+3.75rem)] z-50 max-h-[70vh] w-80 overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-soft">
            <div className="flex items-center justify-between px-2 py-2">
              <p className="text-sm font-extrabold text-foreground">通知</p>
              <button
                onClick={() => setOpen(false)}
                aria-label="關閉"
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">目前還沒有通知</p>
            ) : (
              <ul className="flex flex-col">
                {items.map((item) => {
                  const isUnread = item.createdAt > lastSeen
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => handleClick(item)}
                        className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-muted ${
                          isUnread ? 'bg-primary/5' : ''
                        }`}
                      >
                        <span className="mt-0.5 text-lg leading-none">
                          {item.type === 'like' ? '❤️' : '💬'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                          {item.snippet && (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              你的貼文：{item.snippet}
                            </span>
                          )}
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {formatRelativeTime(item.createdAt)}
                          </span>
                        </span>
                        {isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  )
}

function BellIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function DrawerLink({
  to,
  search,
  icon,
  label,
  onClick,
}: {
  to: string
  search?: Record<string, unknown>
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <Link
      to={to as '/onboarding' | '/app/profile'}
      search={search as never}
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-foreground transition hover:bg-muted active:scale-[0.98]"
    >
      <span className="text-xl">{icon}</span>
      <span className="font-bold">{label}</span>
    </Link>
  )
}

function DrawerExternalLink({
  href,
  icon,
  label,
  note,
}: {
  href: string
  icon: string
  label: string
  note?: string
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-foreground transition hover:bg-muted active:scale-[0.98]"
    >
      <span className="text-xl">{icon}</span>
      <span className="font-bold">{label}</span>
      {note && (
        <span className="ml-auto text-[10px] font-bold text-muted-foreground">{note}</span>
      )}
    </a>
  )
}

function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const tabs = [
    { to: '/app/home', label: '訓練中心', icon: <DumbbellIcon /> },
    { to: '/app/community', label: '社群', icon: <UsersIcon /> },
    { to: '/app/profile', label: '個人頁面', icon: <UserIcon /> },
  ] as const

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-[oklch(1_0_0_/_0.95)] backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-3xl">
        {tabs.map((tab) => {
          const isActive = pathname === tab.to || pathname.startsWith(tab.to + '/')
          return (
            <Link
              key={tab.to}
              to={tab.to}
              data-status={isActive ? 'active' : undefined}
              className={`group flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <span
                className={`flex h-9 w-16 items-center justify-center rounded-full transition-colors ${
                  isActive ? 'bg-primary-soft' : 'bg-transparent'
                }`}
              >
                {tab.icon}
              </span>
              <span className="text-[11px] font-bold tracking-wide">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}


function MenuIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      className={`h-5 w-5 ${spinning ? 'animate-spin' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function DumbbellIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="9.5" width="3" height="5" rx="1" />
      <rect x="18.5" y="9.5" width="3" height="5" rx="1" />
      <rect x="5.5" y="10.5" width="2" height="3" rx="0.5" />
      <rect x="16.5" y="10.5" width="2" height="3" rx="0.5" />
      <line x1="7.5" y1="12" x2="16.5" y2="12" strokeWidth="2.5" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 20h5v-2a3 3 0 0 0-5.356-1.857" />
      <path d="M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857" />
      <path d="M7 20H2v-2a3 3 0 0 1 5.356-1.857" />
      <path d="M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0" />
      <circle cx="12" cy="7" r="3" />
      <circle cx="19" cy="8" r="2" />
      <circle cx="5" cy="8" r="2" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}
