import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/gratitude')({
  component: GratitudePage,
})

function GratitudePage() {
  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center px-6 text-center">
      <span className="text-5xl">⭐</span>
      <p className="mt-4 text-lg font-semibold text-gray-900">感恩日記</p>
      <p className="mt-2 text-sm text-gray-500">Step 5 實作中</p>
    </div>
  )
}
