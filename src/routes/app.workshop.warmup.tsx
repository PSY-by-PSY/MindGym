import { useState } from 'react'
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
// 目前先用 emoji + 漸層底色當示意圖。未來要替換成正式的「說書人卡牌」圖片時，
// 只要在對應卡片補上 image 欄位（圖片網址或 import 進來的本地圖片）即可，
// 有 image 就會顯示圖片、沒有就退回 emoji 佔位圖，不需要改其他程式碼。
// ─────────────────────────────────────────────────────────────────────────
interface WarmupCard {
  id: string
  label: string
  emoji: string
  bg: string
  /** 正式卡牌圖片網址；填了就會用圖片取代 emoji 佔位圖。 */
  image?: string
}

const WARMUP_CARDS: WarmupCard[] = [
  { id: 'dawn', label: '黎明', emoji: '🌅', bg: 'bg-tile-peach' },
  { id: 'map', label: '旅程地圖', emoji: '🗺️', bg: 'bg-tile-blue' },
  { id: 'climb', label: '攀登', emoji: '⛰️', bg: 'bg-tile-mint' },
  { id: 'wave', label: '浪潮', emoji: '🌊', bg: 'bg-tile-blue' },
  { id: 'sprout', label: '萌芽', emoji: '🌱', bg: 'bg-tile-mint' },
  { id: 'window', label: '窗景', emoji: '🪟', bg: 'bg-tile-peach' },
  { id: 'compass', label: '指南針', emoji: '🧭', bg: 'bg-tile-blue' },
  { id: 'mask', label: '面具', emoji: '🎭', bg: 'bg-tile-pink' },
  { id: 'fire', label: '火光', emoji: '🔥', bg: 'bg-tile-peach' },
  { id: 'night', label: '夜行', emoji: '🌙', bg: 'bg-tile-blue' },
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
    <WorkshopLayout step={3} total={TOTAL_STEPS} title="完成暖身 🎉">
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

/** 卡牌正面：有正式圖片就顯示圖片，否則顯示 emoji 漸層佔位圖。 */
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
  return (
    <span
      className={`flex items-center justify-center rounded-xl ${card.bg} ${className ?? ''}`}
      aria-hidden="true"
    >
      {card.emoji}
    </span>
  )
}
