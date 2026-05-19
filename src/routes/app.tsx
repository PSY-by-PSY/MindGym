import { createFileRoute, redirect, Outlet, Link, useRouterState } from '@tanstack/react-router'

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
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <BottomNav />
    </div>
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
