import { useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { WorkshopGate } from '../components/workshop/WorkshopGate'
import {
  WorkshopLayout,
  WorkshopTextarea,
  CompletionActions,
} from '../components/workshop/WorkshopUI'

export const Route = createFileRoute('/app/workshop/warmup')({
  component: WarmupModule,
})

function WarmupModule() {
  return (
    <WorkshopGate>
      <WarmupFlow />
    </WorkshopGate>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 暖身卡牌：佔位卡牌清單
//
// 目前先用線條圖示 + 漸層底色當示意圖。未來要替換成正式的「說書人卡牌」圖片時，
// 只要在對應卡片補上 image 欄位（圖片網址或 import 進來的本地圖片）即可，
// 有 image 就會顯示圖片、沒有就退回線條圖示佔位圖，不需要改其他程式碼。
// ─────────────────────────────────────────────────────────────────────────
interface WarmupCard {
  id: string
  label: string
  icon: () => ReactNode
  bg: string
  /** 正式卡牌圖片網址；填了就會用圖片取代線條圖示佔位圖。 */
  image?: string
}

const WARMUP_CARDS: WarmupCard[] = [
  { id: 'dawn', label: '黎明', icon: DawnIcon, bg: 'bg-tile-peach' },
  { id: 'map', label: '旅程地圖', icon: MapIcon, bg: 'bg-tile-blue' },
  { id: 'climb', label: '攀登', icon: MountainIcon, bg: 'bg-tile-mint' },
  { id: 'wave', label: '浪潮', icon: WaveIcon, bg: 'bg-tile-blue' },
  { id: 'sprout', label: '萌芽', icon: SproutIcon, bg: 'bg-tile-mint' },
  { id: 'window', label: '窗景', icon: WindowIcon, bg: 'bg-tile-peach' },
  { id: 'compass', label: '指南針', icon: CompassIcon, bg: 'bg-tile-blue' },
  { id: 'mask', label: '面具', icon: MaskIcon, bg: 'bg-tile-pink' },
  { id: 'fire', label: '火光', icon: FireIcon, bg: 'bg-tile-peach' },
  { id: 'night', label: '夜行', icon: NightIcon, bg: 'bg-tile-blue' },
]

const TOTAL_STEPS = 3

function WarmupFlow() {
  const [step, setStep] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const selectedCard = WARMUP_CARDS.find((c) => c.id === selectedId) ?? null

  const restart = () => {
    setSelectedId(null)
    setReason('')
    setStep(1)
  }

  // 步驟 1：指導語 + 選擇卡牌
  if (step === 1) {
    return (
      <WorkshopLayout
        step={1}
        total={TOTAL_STEPS}
        title="暖身卡牌活動"
        onNext={() => setStep(2)}
        nextDisabled={!selectedCard}
      >
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          現在讓我們忙碌的思緒停下來，把關注回到自己身上。選擇下列一張最能代表你現在的生涯狀態的卡牌。一邊選擇的過程中，也可以想想為什麼這張卡牌讓你連結到自己現在的生涯狀態哦！
        </div>

        <p className="mt-6 text-sm font-bold text-foreground">
          {selectedCard ? `已選擇：${selectedCard.label}` : '請選擇一張卡牌'}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {WARMUP_CARDS.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              selected={selectedId === card.id}
              onSelect={() => setSelectedId(card.id)}
            />
          ))}
        </div>
      </WorkshopLayout>
    )
  }

  // 步驟 2：書寫連結原因
  if (step === 2) {
    return (
      <WorkshopLayout
        step={2}
        total={TOTAL_STEPS}
        title="寫下你的連結"
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
        nextLabel="完成"
        nextVariant="done"
      >
        {selectedCard && (
          <div className="mb-5 flex items-center gap-4 rounded-3xl bg-card p-4 shadow-soft">
            <CardFace card={selectedCard} className="h-24 w-20 shrink-0 text-4xl" />
            <div>
              <p className="text-xs text-muted-foreground">你選擇的卡牌</p>
              <p className="mt-0.5 text-lg font-extrabold text-foreground">
                {selectedCard.label}
              </p>
            </div>
          </div>
        )}

        <p className="mb-3 text-sm leading-relaxed text-foreground/80">
          為什麼這張卡牌讓你連結到自己現在的生涯狀態？寫下你心裡浮現的畫面與想法。
        </p>
        <WorkshopTextarea
          value={reason}
          onChange={setReason}
          placeholder="例如：這張卡牌讓我想到……，因為我現在的狀態就像……"
          rows={7}
        />
      </WorkshopLayout>
    )
  }

  // 步驟 3：完成
  return (
    <WorkshopLayout step={3} total={TOTAL_STEPS} title="完成暖身">
      <p className="text-sm leading-relaxed text-muted-foreground">
        謝謝你願意停下來，把注意力放回自己身上。這是你剛剛的暖身紀錄：
      </p>

      {selectedCard && (
        <div className="mt-5 flex items-center gap-4 rounded-3xl bg-card p-4 shadow-soft">
          <CardFace card={selectedCard} className="h-24 w-20 shrink-0 text-4xl" />
          <div>
            <p className="text-xs text-muted-foreground">代表現在生涯狀態的卡牌</p>
            <p className="mt-0.5 text-lg font-extrabold text-foreground">
              {selectedCard.label}
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-3xl bg-card p-4 shadow-soft">
        <p className="text-xs font-bold text-muted-foreground">為什麼有這個連結</p>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
          {reason.trim() || '（沒有留下文字）'}
        </p>
      </div>

      <CompletionActions onRestart={restart} />
    </WorkshopLayout>
  )
}

function CardTile({
  card,
  selected,
  onSelect,
}: {
  card: WarmupCard
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative overflow-hidden rounded-2xl p-1.5 shadow-soft transition active:scale-[0.97] ${
        selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
      }`}
      aria-pressed={selected}
    >
      <CardFace card={card} className="aspect-[3/4] w-full text-5xl" />
      <span className="mt-1.5 block text-center text-xs font-extrabold text-foreground">
        {card.label}
      </span>
      {selected && (
        <span className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground shadow-sm">
          ✓
        </span>
      )}
    </button>
  )
}

/** 卡牌正面：有正式圖片就顯示圖片，否則顯示線條圖示佔位圖。 */
function CardFace({ card, className }: { card: WarmupCard; className?: string }) {
  if (card.image) {
    return (
      <img
        src={card.image}
        alt={card.label}
        className={`rounded-xl object-cover ${className ?? ''}`}
      />
    )
  }
  const Icon = card.icon
  return (
    <span
      className={`flex items-center justify-center rounded-xl text-foreground/70 ${card.bg} ${className ?? ''}`}
      aria-hidden="true"
    >
      <Icon />
    </span>
  )
}

function DawnIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3M4.2 11H2M22 11h-2.2M5.6 5.6l1.6 1.6M18.4 5.6l-1.6 1.6" />
      <path d="M6 15a6 6 0 0 1 12 0" />
      <path d="M3 19h18" />
    </svg>
  )
}

function MapIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z" />
      <path d="M9 4v13M15 6.5v13" />
    </svg>
  )
}

function MountainIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 19l6.5-11L14 15l2.5-3L21 19z" />
    </svg>
  )
}

function WaveIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2" />
      <path d="M2 15c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2" />
    </svg>
  )
}

function SproutIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21v-9" />
      <path d="M12 12C12 7 8 6 5 6c0 4 2 6.5 7 6z" />
      <path d="M12 13c0-4 3-5 6-5 0 3.5-1.5 5.5-6 5z" />
    </svg>
  )
}

function WindowIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M12 3v18M4 12h16" />
    </svg>
  )
}

function CompassIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.5L13 14l-4.5 1.5L10 11z" />
    </svg>
  )
}

function MaskIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8c0-2.5 3-4 8-4s8 1.5 8 4c0 6-3 11-8 11S4 14 4 8z" />
      <path d="M8 10c.5-1 1.5-1 2 0M14 10c.5-1 1.5-1 2 0" />
      <path d="M9.5 15c1.5 1 3.5 1 5 0" />
    </svg>
  )
}

function FireIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21c4 0 6.5-2.5 6.5-6 0-2.5-1.5-4-2.5-5.5.3 2-.7 3-1.5 3 .5-3-1-5.5-3.5-7 .5 2.5-.5 4-2 5.5-1.3 1.3-2.5 2.8-2.5 5 0 3.5 2.5 6 5.5 6z" />
    </svg>
  )
}

function NightIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
    </svg>
  )
}
