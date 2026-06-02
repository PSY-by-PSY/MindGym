import type { CSSProperties, ReactNode } from 'react'
import { useRef, useState } from 'react'
import type { InMindReport, DimensionKey } from './types'
import { DIMENSION_CONFIGS, DIMENSION_ORDER } from './types'

interface Props {
  report: InMindReport
  onRestart: () => void
  onComplete: () => void
}

// ── PERMA design palette ────────────────────────────────────
interface PermaMeta {
  key: DimensionKey
  zh: string
  en: string
  color: string
  tint: string
  darkGlyph: boolean
}

const PERMA: Record<DimensionKey, PermaMeta> = {
  P: { key: 'P', zh: '情緒力', en: 'Positive Emotion', color: '#E26D5C', tint: 'rgba(226,109,92,.10)', darkGlyph: false },
  E: { key: 'E', zh: '投入力', en: 'Engagement', color: '#5C95FF', tint: 'rgba(92,149,255,.10)', darkGlyph: false },
  R: { key: 'R', zh: '連結力', en: 'Relationships', color: '#B5E089', tint: 'rgba(214,255,183,.30)', darkGlyph: true },
  M: { key: 'M', zh: '意義力', en: 'Meaning', color: '#292F56', tint: 'rgba(41,47,86,.08)', darkGlyph: false },
  A: { key: 'A', zh: '成就力', en: 'Accomplishment', color: '#F5B57A', tint: 'rgba(255,221,185,.40)', darkGlyph: true },
}

// ── Food type from body_type ────────────────────────────────
const FOOD: Record<InMindReport['body_type'], { zh: string; img: string; trait: string }> = {
  D: { zh: '貝果', img: '/assets/food-bagel.png', trait: '高核心力・低消耗' },
  I: { zh: '吐司', img: '/assets/food-toast.png', trait: '功能正常・有成長空間' },
  C: { zh: '棉花糖', img: '/assets/food-marshmallow.png', trait: '高內耗・需要補充能量' },
}

// ── Radar chart with big PERMA letter labels ────────────────
function RadarChart({ scores, max = 5 }: { scores: InMindReport['scores']; max?: number }) {
  const cx = 160
  const cy = 140
  const R = 100
  const keys = DIMENSION_ORDER
  const angleOf = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / 5
  const point = (i: number, v: number) => {
    const a = angleOf(i)
    const r = (v / max) * R
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  }
  const poly = keys.map((k, i) => point(i, scores[k] ?? 0).join(',')).join(' ')
  const rings = [1, 2, 3, 4, 5].map((k) => (k / 5) * R)

  type Anchor = 'start' | 'middle' | 'end'
  const labelLayout: Record<
    DimensionKey,
    { lx: number; ly: number; anchor: Anchor; smallX: number; smallY: number; smallAnchor: Anchor }
  > = {
    P: { lx: cx, ly: cy - R - 32, anchor: 'middle', smallX: cx + 38, smallY: cy - R - 38, smallAnchor: 'start' },
    E: { lx: cx + R + 14, ly: cy - 18, anchor: 'start', smallX: cx + R + 14, smallY: cy + 22, smallAnchor: 'start' },
    R: { lx: cx + R - 30, ly: cy + R + 14, anchor: 'middle', smallX: cx + R + 6, smallY: cy + R + 20, smallAnchor: 'start' },
    M: { lx: cx - R + 30, ly: cy + R + 14, anchor: 'middle', smallX: cx - R - 6, smallY: cy + R + 20, smallAnchor: 'end' },
    A: { lx: cx - R - 14, ly: cy - 18, anchor: 'end', smallX: cx - R - 14, smallY: cy + 22, smallAnchor: 'end' },
  }

  return (
    <svg data-share-radar viewBox="0 0 320 320" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      {rings.map((r, ri) => (
        <polygon
          key={ri}
          points={keys
            .map((_, i) => {
              const a = angleOf(i)
              return [cx + r * Math.cos(a), cy + r * Math.sin(a)].join(',')
            })
            .join(' ')}
          fill="none"
          stroke="#D9D9D9"
          strokeWidth={1.4}
        />
      ))}
      {keys.map((_, i) => {
        const a = angleOf(i)
        return (
          <line key={i} x1={cx} y1={cy} x2={cx + R * Math.cos(a)} y2={cy + R * Math.sin(a)} stroke="#D9D9D9" strokeWidth={1} />
        )
      })}
      <polygon points={poly} fill="rgba(214,255,183,0.55)" stroke="#A8D67A" strokeWidth={2.2} strokeLinejoin="round" />
      {keys.map((k, i) => {
        const [x, y] = point(i, scores[k] ?? 0)
        return <circle key={k} cx={x} cy={y} r={3.6} fill="#E26D5C" />
      })}
      {keys.map((k) => {
        const L = labelLayout[k]
        const score = (scores[k] ?? 0).toFixed(1)
        return (
          <g key={k}>
            <text
              x={L.lx}
              y={L.ly}
              fontFamily="Inter"
              fontWeight="800"
              fontSize="46"
              textAnchor={L.anchor}
              dominantBaseline="middle"
              fill="#151515"
              style={{ letterSpacing: '-2px' }}
            >
              {k}
            </text>
            <text x={L.smallX} y={L.smallY} fontFamily="Noto Sans TC" fontWeight="700" fontSize="11" textAnchor={L.smallAnchor} fill="#151515">
              {PERMA[k].zh}
            </text>
            <text x={L.smallX} y={L.smallY + 14} fontFamily="Inter" fontWeight="500" fontSize="11" textAnchor={L.smallAnchor} fill="#959595">
              {score}分
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Hashtag section heading ─────────────────────────────────
function HashHeading({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div style={{ padding: '0 20px 12px' }}>
      <h2
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: -0.3,
          color: '#151515',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'Noto Sans TC',
        }}
      >
        <span style={{ color: '#E26D5C', fontWeight: 800 }}>＃</span>
        {children}
      </h2>
      {sub && (
        <div style={{ fontSize: 12, color: '#959595', marginTop: 5, fontFamily: 'Inter', letterSpacing: 0.4, fontWeight: 500 }}>
          {sub}
        </div>
      )}
      <div style={{ height: 1.5, background: '#151515', marginTop: 10, opacity: 0.85 }} />
    </div>
  )
}

// ── Per-dimension card ──────────────────────────────────────
function DimensionCard({
  p,
  score,
  comment,
  action,
  complementType,
  complementHow,
}: {
  p: PermaMeta
  score: number
  comment: string
  action: string
  complementType?: string | null
  complementHow?: string | null
}) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 14, border: '1px solid #ECECEC', background: '#fff' }}>
      {/* Navy banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          background: '#292F56',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: p.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Inter',
              fontWeight: 800,
              fontSize: 15,
              color: p.darkGlyph ? '#151515' : '#fff',
            }}
          >
            {p.key}
          </div>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: -0.2 }}>
              {p.zh}{' '}
              <span style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 500, opacity: 0.7 }}>{p.en}</span>
            </div>
          </div>
        </div>
        <div
          className="num"
          style={{
            background: '#fff',
            borderRadius: 8,
            padding: '4px 10px',
            fontFamily: 'Inter',
            fontWeight: 800,
            fontSize: 18,
            color: score >= 3.5 ? '#292F56' : '#E26D5C',
            minWidth: 54,
            textAlign: 'center',
          }}
        >
          {score.toFixed(1)}
          <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 1 }}>/5</span>
        </div>
      </div>
      {/* Body */}
      <div style={{ padding: '14px 16px 16px', background: p.tint }}>
        <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.75, color: '#151515' }}>{comment}</p>
        <div style={{ padding: '12px 14px', borderRadius: 12, background: '#fff', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div
            style={{
              flexShrink: 0,
              marginTop: 1,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: p.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="11" height="12" viewBox="0 0 11 12" fill={p.darkGlyph ? '#151515' : '#fff'}>
              <path d="M 6.111 0 L 0 7.2 L 5.5 7.2 L 4.889 12 L 11 4.8 L 5.5 4.8 L 6.111 0 Z" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontFamily: 'Inter',
                fontWeight: 700,
                letterSpacing: 0.8,
                color: p.darkGlyph ? '#7AA058' : p.color,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              健心練習 · Try this
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#151515', fontWeight: 500 }}>{action}</div>
          </div>
        </div>
        {(complementType || complementHow) && (
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(255,255,255,.7)',
              border: `1px dashed ${p.color}55`,
            }}
          >
            <div style={{ fontSize: 11, fontFamily: 'Inter', fontWeight: 700, letterSpacing: 0.4, color: '#6A6A6A', marginBottom: 4 }}>
              # 適合互補的人
            </div>
            {complementType && (
              <div style={{ fontSize: 13, fontWeight: 700, color: '#151515', marginBottom: complementHow ? 4 : 0 }}>
                {complementType}
              </div>
            )}
            {complementHow && <div style={{ fontSize: 12.5, lineHeight: 1.55, color: '#404040' }}>{complementHow}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Roadmap row ─────────────────────────────────────────────
function RoadmapRow({ when, body, dot, last }: { when: string; body: string; dot: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', position: 'relative' }}>
      <div style={{ flexShrink: 0, position: 'relative', width: 28, paddingTop: 6 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: dot, boxShadow: `0 0 0 4px ${dot}33` }} />
        {!last && <div style={{ position: 'absolute', left: 5.5, top: 22, bottom: -22, width: 1.5, background: '#E5E5E5' }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: 20 }}>
        <div style={{ fontSize: 13, fontFamily: 'Noto Sans TC', fontWeight: 800, color: dot === '#FFDDB9' ? '#C68E51' : dot === '#D6FFB7' ? '#7AA058' : dot, marginBottom: 4, letterSpacing: 0.2 }}>
          {when}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: '#151515', fontWeight: 500 }}>{body}</div>
      </div>
    </div>
  )
}

// ── Main report screen ──────────────────────────────────────
export default function InMindReportPage({ report, onRestart, onComplete }: Props) {
  const {
    scores,
    individual_analysis,
    total_score,
    body_type,
    body_type_label,
    summary_sentence,
    celeb_match,
    constitution_advice,
    balance,
    advanced_analysis,
    take_action,
  } = report

  const food = FOOD[body_type]
  const lowKey = balance.min_dim
  const totalCells = 12
  const filledCells = Math.round((total_score / 25) * totalCells)
  const inbodyLabel = (body_type_label || '').split(/[·•/]/)[0].trim()
  const pageRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)

  const sectionStyle: CSSProperties = { padding: '0 20px 24px' }

  async function handleShare() {
    const el = pageRef.current
    if (!el || sharing) return
    setSharing(true)

    try {
      const html2canvas = (await import('html2canvas')).default

      const elWidth = el.offsetWidth
      const elHeight = el.scrollHeight
      const prevScrollY = window.scrollY
      window.scrollTo(0, 0)

      const sourceCanvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: '#ffffff',
        width: elWidth,
        height: elHeight,
        windowWidth: elWidth,
        windowHeight: elHeight,
        scrollX: 0,
        scrollY: 0,
        logging: false,
        onclone: (clonedDoc, clonedEl) => {
          const h1 = clonedEl.querySelector('[data-share-h1]') as HTMLElement | null
          if (h1) {
            h1.style.lineHeight = '1.05'
            h1.style.paddingBottom = '4px'
          }
          const subtitle = clonedEl.querySelector('[data-share-subtitle]') as HTMLElement | null
          if (subtitle) subtitle.style.marginTop = '14px'

          const blueCard = clonedEl.querySelector('[data-share-bluecard]') as HTMLElement | null
          if (blueCard) {
            blueCard.style.display = 'block'
            blueCard.style.flexDirection = ''
          }
          const capsule = clonedEl.querySelector('[data-share-capsule]') as HTMLElement | null
          if (capsule && capsule.parentNode) {
            const wrap = clonedDoc.createElement('div')
            wrap.style.marginTop = '6px'
            capsule.style.marginTop = '0'
            capsule.style.alignSelf = ''
            capsule.parentNode.insertBefore(wrap, capsule)
            wrap.appendChild(capsule)
            const trimmedLabel = (body_type_label || '').split(/[·•・/\s]/)[0].trim()
            capsule.textContent = `InBody對應：${trimmedLabel}`
          }

          const radar = clonedEl.querySelector('[data-share-radar]') as SVGSVGElement | null
          if (radar) radar.setAttribute('viewBox', '0 -20 320 340')

          const foodImg = clonedEl.querySelector('[data-share-food-img]') as HTMLImageElement | null
          if (foodImg) {
            foodImg.style.width = 'auto'
            foodImg.style.height = 'auto'
            foodImg.style.maxWidth = '100%'
            foodImg.style.maxHeight = '90px'
            foodImg.style.objectFit = ''
            foodImg.style.display = 'block'
            const foodParent = foodImg.parentElement
            if (foodParent) foodParent.style.overflow = 'hidden'
          }

          const celebContainer = clonedEl.querySelector('[data-share-celeb-container]') as HTMLElement | null
          if (celebContainer) {
            const celebImg = celebContainer.querySelector('img')
            if (celebImg) {
              celebContainer.style.backgroundImage = `url(${celebImg.src})`
              celebContainer.style.backgroundSize = 'cover'
              celebContainer.style.backgroundPosition = 'center'
              celebContainer.style.backgroundRepeat = 'no-repeat'
              celebImg.style.display = 'none'
            }
          }
        },
      })

      window.scrollTo(0, prevScrollY)

      const TARGET_RATIO = 9 / 16
      const sW = sourceCanvas.width
      const sH = sourceCanvas.height
      const FOOTER_RESERVE = 200
      const finalW = sW
      const finalH = Math.max(sH + FOOTER_RESERVE, Math.ceil(sW / TARGET_RATIO))

      const finalCanvas = document.createElement('canvas')
      finalCanvas.width = finalW
      finalCanvas.height = finalH
      const ctx = finalCanvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, finalW, finalH)
      ctx.drawImage(sourceCanvas, 0, 0)

      const footerCenterX = finalW / 2
      const footerCenterY = sH + (finalH - sH) / 2
      const fontFamily = 'Inter, "Noto Sans TC", system-ui, sans-serif'

      ctx.textBaseline = 'middle'
      ctx.font = `800 86px ${fontFamily}`
      const inmind = 'InMind'
      const dot = '.'
      const wInmind = ctx.measureText(inmind).width
      const wDot = ctx.measureText(dot).width
      const startX = footerCenterX - (wInmind + wDot) / 2
      ctx.textAlign = 'left'
      ctx.fillStyle = '#151515'
      ctx.fillText(inmind, startX, footerCenterY - 16)
      ctx.fillStyle = '#E26D5C'
      ctx.fillText(dot, startX + wInmind, footerCenterY - 16)

      ctx.textAlign = 'center'
      ctx.font = `700 26px "Noto Sans TC", ${fontFamily}`
      ctx.fillStyle = '#959595'
      ctx.fillText('心理健康的 InBody · 立即測測你的', footerCenterX, footerCenterY + 48)

      const blob = await new Promise<Blob | null>((resolve) =>
        finalCanvas.toBlob((b) => resolve(b), 'image/png'),
      )
      if (!blob) return

      const filename = `InMind-報告-${celeb_match.name}.png`
      const file = new File([blob], filename, { type: 'image/png' })

      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean
        share?: (data: ShareData) => Promise<void>
      }
      if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: 'InMind 心理健身報告',
            text: `我的心理體型是＃${celeb_match.name}型！來測測你的吧。`,
          })
          return
        } catch (err) {
          if ((err as DOMException | undefined)?.name === 'AbortError') return
        }
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="screen-enter" style={{ paddingBottom: 48, background: '#fff' }}>
    <div ref={pageRef} style={{ background: '#fff' }}>
      {/* Top mini brand */}
      <div style={{ textAlign: 'center', padding: '14px 0 0' }}>
        <img src="/assets/psy-by-psy-logo.png" alt="PSY by PSY" style={{ height: 84, width: 'auto', objectFit: 'contain' }} />
      </div>

      {/* HUGE InMind hero */}
      <div style={{ padding: '2px 16px 0' }}>
        <h1
          data-share-h1
          style={{
            margin: 0,
            fontFamily: 'Inter',
            fontWeight: 800,
            fontSize: 84,
            letterSpacing: -3.2,
            lineHeight: 0.95,
            color: '#151515',
          }}
        >
          InMind<span style={{ color: '#E26D5C' }}>.</span>
        </h1>
        <div data-share-subtitle style={{ fontSize: 14, color: '#959595', marginTop: 8, fontWeight: 600, letterSpacing: 0.2 }}>
          心理健康的 InBody <span style={{ fontFamily: 'Inter', fontWeight: 500 }}>·</span> 測驗結果
        </div>
      </div>

      {/* Hero: blue bagel card + radar chart */}
      <section style={{ padding: '16px 14px 6px', display: 'flex', gap: 10, alignItems: 'stretch' }}>
        <div
          data-share-bluecard
          style={{
            flex: '0 0 160px',
            background: '#5C95FF',
            borderRadius: 14,
            padding: '12px 12px 14px',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ fontSize: 11, color: '#fff', fontWeight: 600, letterSpacing: 0.2, marginBottom: 2 }}>你的心理體型是…</div>
          <div style={{ position: 'relative', height: 90, margin: '2px -4px 0', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img
              data-share-food-img
              src={food.img}
              alt={food.zh}
              style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.15))' }}
            />
          </div>
          <div style={{ fontFamily: 'Noto Sans TC', fontWeight: 800, fontSize: 38, color: '#fff', letterSpacing: -1, lineHeight: 1, marginTop: 4 }}>
            ＃{food.zh}
          </div>
          <div
            data-share-capsule
            style={{
              display: 'inline-block',
              padding: '2px 6px',
              background: 'rgba(255,255,255,.85)',
              fontSize: 10,
              color: '#292F56',
              fontWeight: 700,
              marginTop: 6,
              borderRadius: 4,
              alignSelf: 'flex-start',
              whiteSpace: 'nowrap',
            }}
          >
            InBody對應：{inbodyLabel}
          </div>
          <div style={{ display: 'flex', gap: 2, marginTop: 10 }}>
            {Array.from({ length: totalCells }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 11,
                  background: i < filledCells ? '#D6FFB7' : 'rgba(255,255,255,.35)',
                  borderRadius: 1.5,
                }}
              />
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>總分：</span>
            <span className="num" style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: 28, letterSpacing: -1, color: '#fff', lineHeight: 1 }}>
              {total_score.toFixed(1)}
            </span>
            <span className="num" style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,.75)' }}>
              /25.0
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: '#FFDDB9', fontWeight: 700, letterSpacing: 0.2 }}>{food.trait}</div>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ padding: '0 0 0 4px' }}>
            <RadarChart scores={scores} />
          </div>
          <div
            style={{
              textAlign: 'center',
              marginTop: -4,
              fontSize: 14,
              fontWeight: 800,
              color: '#151515',
              fontFamily: 'Noto Sans TC',
              letterSpacing: 0.2,
            }}
          >
            <span style={{ color: '#E26D5C', fontWeight: 800 }}>＃</span> PERMA 各指數明細
          </div>
        </div>
      </section>

      {/* Speech bubble quote */}
      <section style={{ padding: '20px 18px 22px' }}>
        <div style={{ background: '#B9E6FF', borderRadius: 16, padding: '18px' }}>
          <p
            style={{
              margin: 0,
              fontSize: 17,
              lineHeight: 1.85,
              color: '#151515',
              fontFamily: 'Noto Sans TC',
              fontWeight: 700,
              textAlign: 'center',
              letterSpacing: 0.2,
            }}
          >
            {summary_sentence}
          </p>
        </div>
      </section>

      {/* Celebrity match */}
      <HashHeading>與你最相似的名人是…</HashHeading>
      <section style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 12, overflow: 'hidden', border: '1px solid #DCE6FA' }}>
          <div
            data-share-celeb-container
            style={{
              position: 'relative',
              width: 104,
              flexShrink: 0,
              minHeight: 124,
              background: '#EAEAEA',
              overflow: 'hidden',
            }}
          >
            <img
              src={`/assets/celeb-${celeb_match.name}.jpg`}
              alt={celeb_match.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <div
              style={{
                position: 'absolute',
                left: 6,
                bottom: 6,
                padding: '4px 8px',
                background: '#fff',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 800,
                color: '#151515',
                letterSpacing: -0.2,
                whiteSpace: 'nowrap',
              }}
            >
              ＃{celeb_match.name}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, padding: '14px', background: '#B9E6FF' }}>
            <div
              style={{
                fontSize: 11,
                fontFamily: 'Inter',
                fontWeight: 700,
                letterSpacing: 0.4,
                color: '#5C95FF',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              類型 · {celeb_match.archetype}
            </div>
            <div style={{ fontSize: 12, color: '#404040', marginBottom: 6, lineHeight: 1.5 }}>{celeb_match.description}</div>
            <div style={{ fontSize: 13, lineHeight: 1.75, color: '#151515', fontWeight: 500 }}>{celeb_match.reason}</div>
          </div>
        </div>
      </section>
      </div>{/* end of pageRef capture area */}

      {/* 分享報告 */}
      <section style={{ padding: '6px 20px 14px' }}>
        <button
          onClick={handleShare}
          disabled={sharing}
          style={{
            width: '100%',
            height: 56,
            borderRadius: 99,
            background: sharing ? '#5A6280' : '#292F56',
            color: '#fff',
            border: 'none',
            fontSize: 15.5,
            fontWeight: 800,
            fontFamily: 'inherit',
            cursor: sharing ? 'default' : 'pointer',
            letterSpacing: 0.4,
            boxShadow: '0 8px 20px -8px rgba(41,47,86,.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {sharing ? (
            <>產生分享圖中…</>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v13" />
                <path d="M7 8l5-5 5 5" />
                <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
              </svg>
              分享我的報告
            </>
          )}
        </button>
        <div style={{ marginTop: 8, fontSize: 12, color: '#959595', textAlign: 'center', lineHeight: 1.55 }}>
          將以圖片形式分享：可存到相簿、傳到 LINE 或其他 App
        </div>
      </section>

      {/* 適合你健心練習 */}
      <HashHeading>適合你健心練習！</HashHeading>
      <section style={{ padding: '0 20px 8px' }}>
        <div style={{ display: 'flex', gap: 3, height: 14, margin: '2px 0 14px' }}>
          {Array.from({ length: 48 }).map((_, i) => (
            <div key={i} style={{ flex: 1, background: '#D6FFB7', borderRadius: 1 }} />
          ))}
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.85, color: '#151515' }}>
          {constitution_advice.daily_practice}
        </p>
        <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #EFEFEF', background: '#fff' }}>
          <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg,rgba(214,255,183,.85),rgba(185,230,255,.7))' }}>
            <div
              style={{
                fontSize: 11,
                fontFamily: 'Inter',
                fontWeight: 800,
                letterSpacing: 1.2,
                color: '#3D6B1A',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              每日微習慣 · 30 SEC
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#151515', letterSpacing: -0.2 }}>
              {DIMENSION_CONFIGS[balance.min_dim].label}・每日健心練習
            </div>
          </div>
          <div style={{ padding: '14px 16px 16px' }}>
            <div style={{ fontSize: 12, fontFamily: 'Noto Sans TC', fontWeight: 800, color: '#6A6A6A', marginBottom: 10, letterSpacing: 0.4 }}>
              短期與長期計畫
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[constitution_advice.short_term_plan, constitution_advice.long_term_plan].map((o, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.6, color: '#151515' }}>
                  <span style={{ flexShrink: 0, marginTop: 7, width: 6, height: 6, borderRadius: '50%', background: '#E26D5C' }} />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
          <div style={{ padding: '10px 16px', background: 'linear-gradient(90deg,rgba(226,109,92,.55),rgba(185,230,255,.55))' }}>
            <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: 14, letterSpacing: -0.4, color: '#fff' }}>InMind</span>
          </div>
        </div>
      </section>

      {/* 五大指數 · 細項建議與行動 */}
      <HashHeading sub="Five dimensions · per-axis advice">五大指數 · 細項建議與行動</HashHeading>
      <section style={{ padding: '0 16px 4px' }}>
        {DIMENSION_ORDER.map((k) => {
          const analysis = individual_analysis[k]
          return (
            <DimensionCard
              key={k}
              p={PERMA[k]}
              score={scores[k]}
              comment={analysis.comment}
              action={analysis.exercise_suggestion}
              complementType={k === lowKey ? advanced_analysis.partnership_profile : null}
              complementHow={k === lowKey ? advanced_analysis.synergy_explanation : null}
            />
          )
        })}
      </section>

      {/* Roadmap */}
      <HashHeading sub="Your 30-day journey">接下來會發生什麼</HashHeading>
      <section style={{ padding: '8px 24px 4px' }}>
        <RoadmapRow when="從今天開始" body={take_action.daily_habit} dot="#6A6A6A" />
        <RoadmapRow when="第 3 天" body={take_action.after_3_days} dot="#E26D5C" />
        <RoadmapRow when="第 1 週" body={take_action.after_1_week} dot="#FFDDB9" />
        <RoadmapRow when="第 2 週" body={take_action.after_2_weeks} dot="#D6FFB7" />
        <RoadmapRow when="第 1 個月" body={take_action.after_1_month} dot="#5C95FF" last />
      </section>

      {/* 開始第一次練習 CTA */}
      <section style={{ padding: '4px 16px 8px' }}>
        <button
          onClick={onComplete}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', padding: '18px 0',
            background: '#5C95FF', color: '#fff', borderRadius: 14,
            fontSize: 17, fontWeight: 800, fontFamily: 'Noto Sans TC',
            border: 'none', cursor: 'pointer', letterSpacing: 0.2,
            boxSizing: 'border-box',
            boxShadow: '0 8px 24px -8px rgba(92,149,255,.55)',
          }}
        >
          開始第一次練習 →
        </button>
      </section>

      {/* 重新檢測 */}
      <div style={{ padding: '8px 20px 16px', textAlign: 'center' }}>
        <button
          onClick={onRestart}
          style={{
            height: 44,
            padding: '0 28px',
            borderRadius: 99,
            background: 'transparent',
            color: '#959595',
            border: '1px solid #D4D4D4',
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: 0.3,
          }}
        >
          重新檢測
        </button>
      </div>

      <div
        style={{
          textAlign: 'center',
          padding: '4px 20px 18px',
          color: '#BFBFBF',
          fontSize: 10.5,
          fontFamily: 'Inter',
          letterSpacing: 0.5,
          fontWeight: 500,
        }}
      >
        Based on PERMA · Martin Seligman · ©InMind 2026
      </div>
    </div>
  )
}
