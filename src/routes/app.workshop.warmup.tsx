import { useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { WorkshopGate } from '../components/workshop/WorkshopGate'
import {
  WorkshopLayout,
  WorkshopTextarea,
  CompletionActions,
} from '../components/workshop/WorkshopUI'
import { useLanguage } from '../lib/i18n/context'

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
  const { t } = useLanguage()
  const [step, setStep] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  // 放大檢視的卡牌；點縮圖開啟、按叉叉或點背景關閉。
  const [zoomedCard, setZoomedCard] = useState<WarmupCard | null>(null)

  const selectedCard = WARMUP_CARDS.find((c) => c.id === selectedId) ?? null

  const restart = () => {
    setSelectedId(null)
    setReason('')
    setStep(1)
  }

  let content: ReactNode

  // 步驟 1：指導語 + 選擇卡牌
  if (step === 1) {
    content = (
      <WorkshopLayout
        step={1}
        total={TOTAL_STEPS}
        title={t('暖身卡牌活動')}
        onNext={() => setStep(2)}
        nextDisabled={!selectedCard}
      >
        <div className="rounded-3xl bg-card p-4 shadow-soft text-sm leading-relaxed text-foreground/80">
          {t('現在讓我們忙碌的思緒停下來，把關注回到自己身上。選擇下列一張最能代表你現在的生涯狀態的卡牌。一邊選擇的過程中，也可以想想為什麼這張卡牌讓你連結到自己現在的生涯狀態哦！')}
        </div>

        <p className="mt-6 text-sm font-bold text-foreground">
          {selectedCard ? t('已選擇：第 {n} 張卡牌', { n: selectedCard.number }) : t('請選擇一張卡牌')}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-3">
          {WARMUP_CARDS.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              selected={selectedId === card.id}
              onSelect={() => setSelectedId(card.id)}
              onZoom={() => setZoomedCard(card)}
            />
          ))}
        </div>
      </WorkshopLayout>
    )
  }

  // 步驟 2：書寫連結原因（關鍵字）
  else if (step === 2) {
    content = (
      <WorkshopLayout
        step={2}
        total={TOTAL_STEPS}
        title={t('寫下你的連結')}
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
        nextLabel={t('完成')}
        nextVariant="done"
      >
        {selectedCard && (
          <div className="mb-5 flex items-center gap-4 rounded-3xl bg-card p-4 shadow-soft">
            <CardFace card={selectedCard} className="h-24 w-20 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">{t('你選擇的卡牌')}</p>
              <p className="mt-0.5 text-lg font-extrabold text-foreground">
                {t('第 {n} 張', { n: selectedCard.number })}
              </p>
            </div>
          </div>
        )}

        <p className="mb-3 text-sm leading-relaxed text-foreground/80">
          {t('為什麼這張卡牌讓你連結到自己現在的生涯狀態？你可以根據心裡浮現的畫面與想法，寫下一些關鍵字。')}
        </p>
        <WorkshopTextarea
          value={reason}
          onChange={setReason}
          placeholder={t('例如：迷霧、轉彎、往前走……')}
          rows={7}
        />
      </WorkshopLayout>
    )
  }

  // 步驟 3：分享——呈現所選卡牌 + 邀請與夥伴分享 + 再次呈現所有卡牌
  else {
    content = (
    <WorkshopLayout step={3} total={TOTAL_STEPS} title={t('與夥伴分享')}>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t('你所選擇的卡牌為：')}
      </p>

      {selectedCard && (
        <div className="mt-3 flex items-center gap-4 rounded-3xl bg-card p-4 shadow-soft">
          <CardFace card={selectedCard} className="h-28 w-24 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">{t('代表現在生涯狀態的卡牌')}</p>
            <p className="mt-0.5 text-lg font-extrabold text-foreground">
              {t('第 {n} 張', { n: selectedCard.number })}
            </p>
          </div>
        </div>
      )}

      {reason.trim() && (
        <div className="mt-4 rounded-3xl bg-card p-4 shadow-soft">
          <p className="text-xs font-bold text-muted-foreground">{t('我的關鍵字')}</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
            {reason}
          </p>
        </div>
      )}

      <div className="mt-6 rounded-3xl bg-primary-soft p-4 text-sm font-bold leading-relaxed text-foreground">
        {t('邀請你與夥伴分享你的卡牌。')}
      </div>

      <p className="mt-6 text-xs font-bold text-muted-foreground">{t('所有卡牌')}</p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {WARMUP_CARDS.map((card) => (
          <div key={card.id} className="overflow-hidden rounded-2xl p-1.5">
            <button
              type="button"
              onClick={() => setZoomedCard(card)}
              className="block w-full cursor-zoom-in"
              aria-label={t('放大檢視卡牌 {n}', { n: card.number })}
            >
              <CardFace card={card} className="aspect-[3/4] w-full" />
            </button>
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

  return (
    <>
      {content}
      {zoomedCard && (
        <CardLightbox card={zoomedCard} onClose={() => setZoomedCard(null)} />
      )}
    </>
  )
}

function CardTile({
  card,
  selected,
  onSelect,
  onZoom,
}: {
  card: WarmupCard
  selected: boolean
  onSelect: () => void
  onZoom: () => void
}) {
  const { t } = useLanguage()
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-1.5 shadow-soft transition ${
        selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
      }`}
    >
      {/* 點圖片放大檢視 */}
      <button
        type="button"
        onClick={onZoom}
        className="block w-full cursor-zoom-in active:scale-[0.97]"
        aria-label={t('放大檢視卡牌 {n}', { n: card.number })}
      >
        <CardFace card={card} className="aspect-[3/4] w-full" />
      </button>
      <span className="mt-1.5 block text-center text-xs font-extrabold text-foreground">
        {card.number}
      </span>

      {/* 右上角勾選鈕：點這裡才是選擇卡牌 */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={selected ? t('取消選擇卡牌 {n}', { n: card.number }) : t('選擇卡牌 {n}', { n: card.number })}
        className={`absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold shadow-sm transition active:scale-90 ${
          selected
            ? 'bg-primary text-primary-foreground'
            : 'bg-white/75 text-transparent ring-1 ring-foreground/25'
        }`}
      >
        ✓
      </button>
    </div>
  )
}

/** 卡牌放大檢視：全螢幕遮罩置中顯示，按叉叉或點背景關閉。 */
function CardLightbox({ card, onClose }: { card: WarmupCard; onClose: () => void }) {
  const { t } = useLanguage()
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={card.image}
          alt={t('卡牌 {n}', { n: card.number })}
          className="w-full rounded-3xl object-cover shadow-soft"
        />
        <span className="absolute left-3 top-3 flex h-8 min-w-8 items-center justify-center rounded-full bg-black/55 px-2 text-sm font-extrabold text-white">
          {card.number}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('關閉')}
          className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-card text-lg font-bold text-foreground shadow-soft transition active:scale-90"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/** 卡牌正面：卡牌圖片 + 左上角數字徽章。 */
function CardFace({ card, className }: { card: WarmupCard; className?: string }) {
  const { t } = useLanguage()
  return (
    <span className={`relative block overflow-hidden rounded-xl ${className ?? ''}`}>
      <img
        src={card.image}
        alt={t('卡牌 {n}', { n: card.number })}
        className="h-full w-full object-cover"
      />
      <span className="absolute left-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/55 px-1.5 text-xs font-extrabold text-white">
        {card.number}
      </span>
    </span>
  )
}
