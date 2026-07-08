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
import { fetchBlockedList, unblockUser, type BlockedListItem } from '../lib/communityModeration'
import { useGlobalKeyboard } from '../lib/keyboard'
import { hardRefresh } from '../lib/refresh'
import { useScrollDirection } from '../lib/useScrollDirection'
import { useLanguage } from '../lib/i18n/context'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import logoWordmark from '../assets/ui/logo-wordmark.png'

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

  // 全站鍵盤行為（規格 [2][5]）：點空白處收鍵盤、鍵盤彈出時補底部留白。
  useGlobalKeyboard()

  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // 練習進行中（感恩日記／過程目標覺察／工作坊練習）：底部工具列暫時隱藏，讓畫面更沉浸。
  const isExercise =
    pathname.startsWith('/app/gratitude') ||
    pathname.startsWith('/app/process-goal') ||
    pathname.startsWith('/app/workshop') ||
    pathname.startsWith('/app/pro-module')
  // 社群頁：往下捲動收起工具列、往上捲動時跳出（比照 Facebook 的捲動體驗）。
  const isCommunity = pathname.startsWith('/app/community')
  const scrolledDown = useScrollDirection(isCommunity)
  const hideNav = isExercise || scrolledDown

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopHeader />
      {/* 鍵盤彈出時，底部留白加上鍵盤高度（--keyboard-height），讓底端輸入框可捲入可視範圍。 */}
      <main className="flex-1 pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(6rem+var(--keyboard-height,0px))]">
        <Outlet />
      </main>
      <BottomNav hidden={hideNav} />
    </div>
  )
}

function TopHeader() {
  const { t } = useLanguage()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [fontScale, setFontScaleState] = useState<FontScale>(() => getFontScale())

  const changeFontScale = (scale: FontScale) => {
    setFontScale(scale)
    setFontScaleState(scale)
  }

  // 重整邏輯抽到 lib/refresh，與社群「下拉重整」共用（規格 [3]）。
  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    await hardRefresh()
  }

  return (
    <>
      {/* safe-area padding 疊加在「內容列之上」：header 總高 = safe-area + 56px。
          內容列固定 h-14（56px），不被瀏海/動態島的 inset 壓縮，圖示才不會跑位。 */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#FEFAF0]/95 shadow-[0_3px_12px_rgba(0,0,0,0.05)] backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between px-5">
          {/* 左側佔位（維持 logo 置中） */}
          <div className="w-24" />

          {/* 中間 Logo */}
          <img src={logoWordmark} alt="PSY by PSY" className="h-[22px] w-auto object-contain" />

          {/* 右側 icons */}
          <div className="flex w-24 items-center justify-end gap-0.5 text-foreground">
            <NotificationBell />
            <button
              aria-label={t('重新整理')}
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition hover:bg-[#542916]/5 active:scale-90 disabled:opacity-60"
            >
              <RefreshIcon spinning={refreshing} />
            </button>
            <button
              aria-label={t('選單')}
              onClick={() => setDrawerOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition hover:bg-[#542916]/5 active:scale-90"
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </header>

      {/* Side Drawer Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#1c1714]/40"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Side Drawer */}
      <aside
        className={`fixed top-0 right-0 z-50 flex h-full w-[300px] flex-col overflow-y-auto bg-[#FEFAF0] shadow-[-10px_0_30px_rgba(40,24,12,0.25)] transition-transform duration-300 ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-7 pb-3 pt-[calc(env(safe-area-inset-top)+1.6rem)]">
          <span className="text-2xl font-black tracking-[0.04em] text-foreground">{t('選單')}</span>
          <button
            aria-label={t('關閉選單')}
            onClick={() => setDrawerOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-2xl leading-none text-foreground hover:bg-[#542916]/5"
          >
            ✕
          </button>
        </div>

        <div className="mx-7 h-px bg-[#e3dccd]" />

        <nav className="flex flex-col gap-1 px-5 py-4">
          <DrawerLink
            to="/onboarding"
            search={{ reassess: true }}
            icon={<ClipboardIcon />}
            label={t('InMind 心理健康測驗')}
            onClick={() => setDrawerOpen(false)}
          />
          <DrawerExternalLink
            href="https://line.me/ti/g2/s8BmdrBAelUmNj858hi5iHzhJ-vhTQVCqTSokQ?utm_source=invitation&utm_medium=link_copy&utm_campaign=default"
            icon={<UsersIcon />}
            label={t('PSY by PSY 社群')}
          />
          <DrawerExternalLink
            href="https://www.instagram.com/psy_by_psy/"
            icon={<CameraIcon />}
            label={t('IG 追蹤我們')}
          />

          <div className="my-3 h-px bg-[#e3dccd]" />

          {/* 語言切換 */}
          <LanguageSwitcher />

          <div className="my-3 h-px bg-[#e3dccd]" />

          {/* 字體大小（無障礙大字模式） */}
          <div className="px-3 py-1">
            <div className="flex items-center gap-3">
              <FontSizeIcon />
              <span className="text-lg font-black tracking-[0.03em] text-foreground">{t('字體大小')}</span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              {FONT_SCALE_OPTIONS.map((opt) => {
                const active = fontScale === opt.value
                const sizeClass =
                  opt.value === 'standard' ? 'text-[15px]' : opt.value === 'large' ? 'text-xl' : 'text-2xl'
                return (
                  <button
                    key={opt.value}
                    onClick={() => changeFontScale(opt.value)}
                    aria-pressed={active}
                    className={`rounded-2xl px-4 py-2.5 font-bold transition active:scale-95 ${sizeClass} ${
                      active
                        ? 'border-2 border-[#88B8CE] bg-white text-foreground shadow-soft'
                        : 'border border-[#d8cdbb] bg-[#e7e0d2] text-muted-foreground'
                    }`}
                  >
                    {t(opt.label)}
                  </button>
                )
              })}
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              {t('放大全站文字，方便閱讀。')}
            </p>
          </div>

          {/* 通知開關：即使先前按過「稍後再說」，也能在這裡隨時開啟 */}
          <NotificationSetting />

          <div className="my-3 h-px bg-[#e3dccd]" />

          {/* 封鎖名單（社群安全管理）：從個人檔案移至側邊欄 */}
          <BlockedListSection active={drawerOpen} />
        </nav>
      </aside>
    </>
  )
}

// 選單裡的「通知」控制：給使用者一個「永遠找得到」的入口開啟通知，
// 補足一次性詢問橫幅（按過稍後再說就消失）的缺口。
// 原生 App 走 Local Notifications 權限；純網頁走瀏覽器 Notification。
function NotificationSetting() {
  const { t } = useLanguage()
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
    body = <p className="mt-2 text-[11px] text-muted-foreground">{t('讀取中…')}</p>
  } else if (state === 'granted') {
    body = (
      <p className="mt-2 text-[11px] leading-relaxed text-emerald-600">
        {t('✓ 已開啟。有人按讚、留言，以及每晚會提醒你打卡。')}
      </p>
    )
  } else if (state === 'denied') {
    body = (
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {t('通知目前被系統關閉。請到「設定 → PSY by PSY → 通知」開啟。')}
      </p>
    )
  } else if (state === 'unsupported') {
    body = (
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {t('此版本暫不支援通知，請更新 App 後再試。')}
      </p>
    )
  } else {
    body = (
      <button
        onClick={enable}
        disabled={busy}
        className="mt-2 w-full rounded-xl bg-gradient-primary py-2 text-xs font-bold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? t('處理中…') : t('開啟通知')}
      </button>
    )
  }

  return (
    <div className="rounded-2xl px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 items-center justify-center"><BellIcon /></span>
        <span className="font-bold text-foreground">{t('通知')}</span>
      </div>
      {body}
    </div>
  )
}

// 封鎖名單（社群安全管理）：App Store 1.2 要求 UGC App 提供封鎖機制。
// 從個人檔案移到側邊欄，預設收合，開啟側邊欄時才載入清單。
function BlockedListSection({ active }: { active: boolean }) {
  const { t } = useLanguage()
  const [userId, setUserId] = useState<string | null>(null)
  const [list, setList] = useState<BlockedListItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null))
  }, [])

  useEffect(() => {
    if (!active || !userId || loaded) return
    let cancelled = false
    fetchBlockedList(userId).then((rows) => {
      if (!cancelled) {
        setList(rows)
        setLoaded(true)
      }
    })
    return () => { cancelled = true }
  }, [active, userId, loaded])

  async function handleUnblock(blockedId: string) {
    if (!userId || busy) return
    setBusy(blockedId)
    const ok = await unblockUser(userId, blockedId)
    if (ok) setList((prev) => prev.filter((b) => b.blocked_id !== blockedId))
    setBusy(null)
  }

  return (
    <div className="rounded-2xl px-4 py-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3"
        aria-expanded={open}
      >
        <BlockIcon />
        <span className="font-bold text-foreground">{t('封鎖名單')}</span>
        {loaded && list.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            {list.length}
          </span>
        )}
        <span className="ml-auto text-sm text-muted-foreground">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-3">
          {!loaded ? (
            <p className="text-[11px] text-muted-foreground">{t('讀取中…')}</p>
          ) : list.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t('你還沒有封鎖任何人。')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((b) => (
                <li key={b.blocked_id} className="flex items-center gap-2.5 rounded-2xl bg-muted px-3 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tile-peach">
                    <BlockIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-foreground">
                      {b.blocked_label || t('已封鎖的使用者')}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {t('封鎖於 {date}', { date: String(b.created_at).slice(0, 10) })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleUnblock(b.blocked_id)}
                    disabled={busy === b.blocked_id}
                    className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-bold text-foreground transition hover:bg-background disabled:opacity-50"
                  >
                    {busy === b.blocked_id ? '…' : t('解除封鎖')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const RELATIVE_TIME_LOCALE: Record<string, string> = {
  'zh-TW': 'zh-TW',
  'zh-CN': 'zh-CN',
  en: 'en-US',
}

function formatRelativeTime(iso: string, t: (text: string, vars?: Record<string, string | number>) => string, language: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('剛剛')
  if (min < 60) return t('{n} 分鐘前', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('{n} 小時前', { n: hr })
  const day = Math.floor(hr / 24)
  if (day < 7) return t('{n} 天前', { n: day })
  return new Date(iso).toLocaleDateString(RELATIVE_TIME_LOCALE[language] ?? 'zh-TW')
}

// 通知鈴鐺：只在「有人按讚使用者的貼文」或「有人留言」時顯示未讀。
// 點選後跳到社群「我的貼文」並聚焦該則貼文。
function NotificationBell() {
  const { t, language } = useLanguage()
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
        const list = await fetchNotifications(userId, t)
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
  }, [userId, t])

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
    if (item.type === 'review') {
      navigate({ to: '/app/profile' })
      return
    }
    navigate({ to: '/app/community', search: { focus: item.entryId } })
  }

  return (
    <>
      <button
        aria-label={t('通知')}
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
              <p className="text-sm font-extrabold text-foreground">{t('通知')}</p>
              <button
                onClick={() => setOpen(false)}
                aria-label={t('關閉')}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t('目前還沒有通知')}</p>
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
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                          {item.type === 'like' ? <NotifHeartIcon /> : <NotifCommentIcon />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                          {item.snippet && (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {t('你的貼文：{snippet}', { snippet: item.snippet })}
                            </span>
                          )}
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {formatRelativeTime(item.createdAt, t, language)}
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
  icon: ReactNode
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
      <span className="flex h-6 w-6 items-center justify-center">{icon}</span>
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
  icon: ReactNode
  label: string
  note?: string
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-foreground transition hover:bg-muted active:scale-[0.98]"
    >
      <span className="flex h-6 w-6 items-center justify-center">{icon}</span>
      <span className="font-bold">{label}</span>
      {note && (
        <span className="ml-auto text-[10px] font-bold text-muted-foreground">{note}</span>
      )}
    </a>
  )
}

function BottomNav({ hidden }: { hidden: boolean }) {
  const { t } = useLanguage()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const tabs = [
    { to: '/app/home', label: t('首頁'), icon: <HomeIcon />, alwaysLabel: true },
    { to: '/app/community', label: t('社群'), icon: <UsersIcon />, alwaysLabel: false },
    { to: '/app/profile', label: t('個人'), icon: <UserIcon />, alwaysLabel: false },
  ] as const

  return (
    <nav
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[calc(1.4rem+env(safe-area-inset-bottom))] transition-transform duration-300 ${
        hidden ? 'translate-y-[150%]' : 'translate-y-0'
      }`}
    >
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border-2 border-[#542916] bg-[#FEFAF0]/[0.92] px-3.5 py-2.5 shadow-[0_8px_20px_rgba(40,24,12,0.18)] backdrop-blur-md">
        {tabs.map((tab) => {
          const isActive = pathname === tab.to || pathname.startsWith(tab.to + '/')
          const showLabel = isActive || tab.alwaysLabel
          return (
            <Link
              key={tab.to}
              to={tab.to}
              data-status={isActive ? 'active' : undefined}
              className={`flex items-center gap-2 rounded-full px-[18px] py-3 transition active:scale-95 ${
                isActive ? 'bg-[#542916] text-[#FEFAF0]' : 'bg-transparent text-[#542916]'
              }`}
            >
              {tab.icon}
              {showLabel && (
                <span className="text-[15px] font-semibold tracking-[0.04em]">{tab.label}</span>
              )}
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

function HomeIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M15 19a4.5 4.5 0 0 1 6 0" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 11h6M9 15h6" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  )
}

function FontSizeIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19l4-13 4 13M6.2 15h5.6" />
      <path d="M15.5 19V9.5M13 12l2.5-2.5L18 12" />
    </svg>
  )
}

function NotifHeartIcon() {
  return (
    <svg className="h-4 w-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  )
}

function NotifCommentIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 20l1-5.5a8.5 8.5 0 1 1 17-3z" />
    </svg>
  )
}

function BlockIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M5.5 5.5l13 13" />
    </svg>
  )
}
