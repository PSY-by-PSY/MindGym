import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/app/placeholder')({
  validateSearch: (search: Record<string, unknown>) => ({
    name: typeof search.name === 'string' ? search.name : '此功能',
  }),
  component: PlaceholderPage,
})

function ConstructionIcon() {
  return (
    <svg className="h-11 w-11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M6 21V10l6-5 6 5v11" />
      <path d="M10 21v-6h4v6" />
    </svg>
  )
}

function PlaceholderPage() {
  const { name } = Route.useSearch()

  return (
    <div className="animate-fade-up mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl flex-col items-center justify-center px-6 text-center md:px-10">
      <div className="relative mb-7 animate-float">
        <div className="absolute inset-0 -z-10 translate-x-3 translate-y-4 rounded-[45%] bg-primary-soft" />
        <div className="flex h-28 w-28 items-center justify-center rounded-[45%] bg-gradient-soft text-muted-foreground">
          <ConstructionIcon />
        </div>
      </div>

      <p className="font-handwriting text-2xl text-muted-foreground">敬請期待</p>
      <h1 className="mt-1 text-2xl font-extrabold text-foreground md:text-3xl">{name}</h1>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
        這塊心理肌群的訓練菜單正在準備中，很快就能陪你一起練。
      </p>

      <Link
        to="/app/home"
        className="mt-9 flex h-16 w-full max-w-sm items-center justify-center gap-3 rounded-full bg-gradient-primary text-base font-extrabold tracking-[0.2em] text-primary-foreground shadow-soft transition active:scale-[0.98]"
      >
        <span>返回訓練中心</span>
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  )
}
