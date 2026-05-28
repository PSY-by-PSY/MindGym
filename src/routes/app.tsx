import { createFileRoute, redirect, Outlet, Link, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/app')({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
  },
  component: AppShell,
})

function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopHeader />
      <main className="flex-1 pt-14 pb-24">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

function TopHeader() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-border bg-[oklch(1_0_0_/_0.95)] px-4 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        {/* 左側佔位（維持 logo 置中） */}
        <div className="w-20" />

        {/* 中間 Logo */}
        <span className="text-sm font-extrabold tracking-[0.15em] text-foreground uppercase">
          InMind
        </span>

        {/* 右側 icons */}
        <div className="flex w-20 items-center justify-end gap-3">
          <button
            aria-label="搜尋"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted active:scale-90"
          >
            <SearchIcon />
          </button>
          <button
            aria-label="通知"
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted active:scale-90"
          >
            <BellIcon />
          </button>
          <button
            aria-label="選單"
            onClick={() => setDrawerOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted active:scale-90"
          >
            <MenuIcon />
          </button>
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
            href="#"
            icon="🧠"
            label="PSYbyPSY 社群"
            note="即將開放"
          />
          <DrawerExternalLink
            href="https://www.instagram.com/psy_by_psy/"
            icon="📸"
            label="IG 追蹤我們"
          />
          <div className="my-2 border-t border-border" />
          <DrawerLink
            to="/app/profile"
            icon="👤"
            label="個人資料編輯"
            onClick={() => setDrawerOpen(false)}
          />
        </nav>
      </aside>
    </>
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

function SearchIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
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
