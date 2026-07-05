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
// 暖身卡牌：正式說書人（Dixit 風格）卡牌清單
//
// 卡牌圖片放在 src/assets/dixit/ 資料夾，用 import.meta.glob 自動載入整個
// 資料夾，並依檔名排序後依序編號 1、2、3……方便分享時直接報號碼對應。
// 之後要新增／替換卡牌，只要把圖片放進那個資料夾即可，不需要改這裡的程式碼。
// ─────────────────────────────────────────────────────────────────────────
interface WarmupCard {
  id: string
  number: number
  image: string
}

const cardImageModules = import.meta.glob('../assets/dixit/*.{jpg,jpeg,png}', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const WARMUP_CARDS: WarmupCard[] = Object.keys(cardImageModules)
  .sort()
  .map((path, i) => ({
    id: `card-${i + 1}`,
    number: i + 1,
    image: cardImageModules[path],
  }))

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
          {selectedCard ? `已選擇：第 ${selectedCard.number} 張卡牌` : '請選擇一張卡牌'}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-3">
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

  // 步驟 2：書寫連結原因（關鍵字）
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
            <CardFace card={selectedCard} className="h-24 w-20 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">你選擇的卡牌</p>
              <p className="mt-0.5 text-lg font-extrabold text-foreground">
                第 {selectedCard.number} 張
              </p>
            </div>
          </div>
        )}

        <p className="mb-3 text-sm leading-relaxed text-foreground/80">
          為什麼這張卡牌讓你連結到自己現在的生涯狀態？你可以根據心裡浮現的畫面與想法，寫下一些關鍵字。
        </p>
        <WorkshopTextarea
          value={reason}
          onChange={setReason}
          placeholder="例如：迷霧、轉彎、往前走……"
          rows={7}
        />
      </WorkshopLayout>
    )
  }

  // 步驟 3：分享——呈現所選卡牌 + 邀請與夥伴分享 + 再次呈現所有卡牌
  return (
    <WorkshopLayout step={3} total={TOTAL_STEPS} title="與夥伴分享">
      <p className="text-sm leading-relaxed text-muted-foreground">
        你所選擇的卡牌為：
      </p>

      {selectedCard && (
        <div className="mt-3 flex items-center gap-4 rounded-3xl bg-card p-4 shadow-soft">
          <CardFace card={selectedCard} className="h-28 w-24 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">代表現在生涯狀態的卡牌</p>
            <p className="mt-0.5 text-lg font-extrabold text-foreground">
              第 {selectedCard.number} 張
            </p>
          </div>
        </div>
      )}

      {reason.trim() && (
        <div className="mt-4 rounded-3xl bg-card p-4 shadow-soft">
          <p className="text-xs font-bold text-muted-foreground">我的關鍵字</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
            {reason}
          </p>
        </div>
      )}

      <div className="mt-6 rounded-3xl bg-primary-soft p-4 text-sm font-bold leading-relaxed text-foreground">
        邀請你與夥伴分享你的卡牌。
      </div>

      <p className="mt-6 text-xs font-bold text-muted-foreground">所有卡牌</p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {WARMUP_CARDS.map((card) => (
          <div key={card.id} className="overflow-hidden rounded-2xl p-1.5">
            <CardFace card={card} className="aspect-[3/4] w-full" />
            <span className="mt-1.5 block text-center text-xs font-extrabold text-foreground">
              {card.number}
            </span>
          </div>
        ))}
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
      <CardFace card={card} className="aspect-[3/4] w-full" />
      <span className="mt-1.5 block text-center text-xs font-extrabold text-foreground">
        {card.number}
      </span>
      {selected && (
        <span className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground shadow-sm">
          ✓
        </span>
      )}
    </button>
  )
}

/** 卡牌正面：卡牌圖片 + 左上角數字徽章。 */
function CardFace({ card, className }: { card: WarmupCard; className?: string }) {
  return (
    <span className={`relative block overflow-hidden rounded-xl ${className ?? ''}`}>
      <img
        src={card.image}
        alt={`卡牌 ${card.number}`}
        className="h-full w-full object-cover"
      />
      <span className="absolute left-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/55 px-1.5 text-xs font-extrabold text-white">
        {card.number}
      </span>
    </span>
  )
}
