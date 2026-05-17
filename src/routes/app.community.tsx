import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/community')({
  component: CommunityPage,
})

function CommunityPage() {
  return (
    <div className="px-5 pt-8 pb-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">大家今天感謝了什麼？</h1>
      </header>
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <span className="text-4xl">👥</span>
        <p className="mt-3 text-sm">社群內容即將開放</p>
      </div>
    </div>
  )
}
