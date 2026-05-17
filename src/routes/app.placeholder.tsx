import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/app/placeholder')({
  validateSearch: (search: Record<string, unknown>) => ({
    name: typeof search.name === 'string' ? search.name : '此功能',
  }),
  component: PlaceholderPage,
})

function PlaceholderPage() {
  const { name } = Route.useSearch()

  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-50 text-4xl">
        🚧
      </div>
      <h1 className="text-xl font-bold text-gray-900">{name}</h1>
      <p className="mt-3 text-base leading-relaxed text-gray-500">
        這個功能即將開放，敬請期待！
      </p>
      <Link
        to="/app/home"
        className="mt-8 rounded-2xl bg-indigo-500 px-8 py-3 text-sm font-medium text-white transition active:scale-95"
      >
        返回首頁
      </Link>
    </div>
  )
}
