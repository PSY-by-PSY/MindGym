import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/home')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafaf9]">
      <p className="text-lg font-medium text-[#6366f1]">🏠 訓練中心（Step 4 實作）</p>
    </div>
  )
}
