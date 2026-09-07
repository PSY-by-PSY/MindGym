// ─────────────────────────────────────────────────────────────────────────
// 暖身卡牌圖產生器 —— 產出 src/assets/warmup-cards/card-01.svg … card-20.svg
//
// 為什麼有這支腳本：
//   這個資料夾原本放的是市售說書人桌遊（Dixit）實體卡牌的翻拍照片。那是
//   別人的著作，我們沒有可用於 App 發佈的授權，放進送審的 binary 裡是明確的
//   智慧財產權風險。2026-09-07 全部移除，改用這支腳本自己畫的抽象圖。
//
//   「投射式說故事」需要的是**曖昧、可以各自解讀的畫面**，不是具體情節，
//   所以抽象構圖其實很適合：地平線、光暈、有機色塊、飄浮的點，都留給使用者
//   自己投射意義。
//
// 設計原則：
//   - 全部用程式畫，沒有任何外部素材，著作權乾淨。
//   - 固定亂數種子 → 同一張卡每次產出都一模一樣，重跑不會讓 git diff 爆炸。
//   - 色票取自 App 的暖色系（見 src/index.css 的 cream / brown token）。
//   - SVG 而非點陣圖：20 張加起來不到 100KB（原本的翻拍照是 48MB）。
//
// 重新產生：
//   node scripts/generate_warmup_cards.mjs
// ─────────────────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'warmup-cards')

const W = 400
const H = 600
const CARD_COUNT = 20

/** mulberry32：小巧的確定性 PRNG。同一個 seed 永遠給同一串數字。 */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 每張卡一組色：[天空上緣, 天空下緣, 地面, 主體, 點綴]
// 暖色為主、偶爾穿插冷色，讓 20 張排在一起有層次而不吵。
const PALETTES = [
  ['#F6E3C9', '#E8B98A', '#8C5A3C', '#FFF3DF', '#C6743F'],
  ['#2E3A52', '#5C6B8A', '#1B2233', '#F2D9A7', '#8FA5C6'],
  ['#FBE7D2', '#F2A98C', '#7A3E36', '#FFF7EC', '#D8705A'],
  ['#DDEBE4', '#8FBFAE', '#2F4F45', '#FDF6E7', '#4E8C77'],
  ['#F3D9E4', '#C98BA8', '#5C3247', '#FFF1F6', '#9C4F73'],
  ['#FFF0D0', '#E5C36B', '#7B5A20', '#FFFBEF', '#B98F33'],
  ['#E4E1F2', '#A79BD1', '#3B3358', '#F8F5FF', '#6E5FA8'],
  ['#FCE9DA', '#D9A177', '#6B4630', '#FFF6EC', '#A86B44'],
  ['#D9E9F2', '#7FAFC9', '#274654', '#F2FAFF', '#4A85A3'],
  ['#F7E1CE', '#CE9A6B', '#5A4030', '#FFF5E9', '#8F643F'],
]

/** 圓角卡框的裁切路徑；所有圖層都貼著這個形狀切齊。 */
function frame(id) {
  return `<clipPath id="${id}"><rect x="0" y="0" width="${W}" height="${H}" rx="26" ry="26"/></clipPath>`
}

/** 起伏的地平線：用幾段貝茲曲線接出柔和的丘陵。 */
function ridge(rand, baseY, amp) {
  const steps = 5
  const dx = W / steps
  let d = `M -20 ${H + 20} L -20 ${baseY.toFixed(1)}`
  let x = -20
  let y = baseY
  for (let i = 0; i < steps; i++) {
    const nx = x + dx + 20
    const ny = baseY + (rand() - 0.5) * amp * 2
    const cx = (x + nx) / 2
    d += ` Q ${cx.toFixed(1)} ${(y - amp * (0.4 + rand() * 0.8)).toFixed(1)} ${nx.toFixed(1)} ${ny.toFixed(1)}`
    x = nx
    y = ny
  }
  return `${d} L ${W + 20} ${H + 20} Z`
}

/** 一團有機色塊：以極座標擾動半徑，接成閉合的柔邊形狀。 */
function blob(rand, cx, cy, r, wobble = 0.34) {
  const pts = 9
  const coords = []
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2
    const rr = r * (1 - wobble / 2 + rand() * wobble)
    coords.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
  }
  let d = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`
  for (let i = 0; i < pts; i++) {
    const cur = coords[i]
    const next = coords[(i + 1) % pts]
    const mid = [(cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2]
    d += ` Q ${cur[0].toFixed(1)} ${cur[1].toFixed(1)} ${mid[0].toFixed(1)} ${mid[1].toFixed(1)}`
  }
  return d + ' Z'
}

function card(index) {
  // seed 綁卡號，所以第 7 張永遠長成同一個樣子。
  const rand = rng(index * 9176 + 13)
  const [skyTop, skyBottom, ground, glow, accent] = PALETTES[index % PALETTES.length]
  const clip = `c${index}`
  const sky = `sky${index}`
  const soft = `soft${index}`
  const grain = `grain${index}`

  const horizon = H * (0.52 + rand() * 0.22)
  const discR = 34 + rand() * 46
  const discX = W * (0.22 + rand() * 0.56)
  const discY = horizon - discR * (0.9 + rand() * 1.7)

  const layers = []

  // 天空
  layers.push(`<rect width="${W}" height="${H}" fill="url(#${sky})"/>`)

  // 光暈：畫面的視覺重心，也是最容易被投射成「太陽／月亮／出口」的元素。
  layers.push(
    `<circle cx="${discX.toFixed(1)}" cy="${discY.toFixed(1)}" r="${(discR * 2.1).toFixed(1)}" fill="${glow}" opacity="0.18" filter="url(#${soft})"/>`,
    `<circle cx="${discX.toFixed(1)}" cy="${discY.toFixed(1)}" r="${discR.toFixed(1)}" fill="${glow}" opacity="0.9"/>`,
  )

  // 飄浮的點：數量與位置隨機，像塵埃、星子或雨。
  const dots = 8 + Math.floor(rand() * 14)
  for (let i = 0; i < dots; i++) {
    const x = rand() * W
    const y = rand() * horizon
    const r = 1.2 + rand() * 3.4
    layers.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${glow}" opacity="${(0.2 + rand() * 0.5).toFixed(2)}"/>`,
    )
  }

  // 遠景弧線：疏密不一的同心弧，像波紋或風。
  if (rand() > 0.45) {
    const arcs = 3 + Math.floor(rand() * 4)
    const ax = W * (0.1 + rand() * 0.8)
    for (let i = 0; i < arcs; i++) {
      const r = 60 + i * (22 + rand() * 26)
      layers.push(
        `<circle cx="${ax.toFixed(1)}" cy="${(horizon + 30).toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${accent}" stroke-width="${(0.8 + rand() * 1.6).toFixed(1)}" opacity="${(0.12 + rand() * 0.2).toFixed(2)}"/>`,
      )
    }
  }

  // 後方山稜（比較淡，退到遠處）
  layers.push(
    `<path d="${ridge(rand, horizon - 26 - rand() * 40, 30 + rand() * 34)}" fill="${ground}" opacity="0.32"/>`,
  )

  // 有機色塊：中景的量體，最能被讀成人、樹、門或動物。
  const blobs = 1 + Math.floor(rand() * 3)
  for (let i = 0; i < blobs; i++) {
    const bx = W * (0.15 + rand() * 0.7)
    const by = horizon - 10 - rand() * 90
    const br = 26 + rand() * 62
    layers.push(
      `<path d="${blob(rand, bx, by, br)}" fill="${accent}" opacity="${(0.4 + rand() * 0.4).toFixed(2)}"/>`,
    )
  }

  // 前景地面
  layers.push(`<path d="${ridge(rand, horizon, 20 + rand() * 26)}" fill="${ground}" opacity="0.92"/>`)

  // 地面上的細線，給一點紋理與深度
  const lines = 2 + Math.floor(rand() * 4)
  for (let i = 0; i < lines; i++) {
    const y = horizon + 24 + rand() * (H - horizon - 40)
    layers.push(
      `<path d="M ${(rand() * W * 0.4).toFixed(1)} ${y.toFixed(1)} Q ${(W / 2).toFixed(1)} ${(y - 10 - rand() * 24).toFixed(1)} ${(W * 0.6 + rand() * W * 0.4).toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${glow}" stroke-width="1.4" opacity="${(0.1 + rand() * 0.16).toFixed(2)}"/>`,
    )
  }

  // 顆粒感：讓純向量的漸層不要太塑膠
  layers.push(
    `<rect width="${W}" height="${H}" filter="url(#${grain})" opacity="0.16" style="mix-blend-mode:multiply"/>`,
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="抽象暖身卡牌 ${index}">
  <defs>
    ${frame(clip)}
    <linearGradient id="${sky}" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0" stop-color="${skyTop}"/>
      <stop offset="1" stop-color="${skyBottom}"/>
    </linearGradient>
    <filter id="${soft}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <filter id="${grain}">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${index}"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </defs>
  <g clip-path="url(#${clip})">
    ${layers.join('\n    ')}
  </g>
  <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="25" ry="25" fill="none" stroke="#00000018" stroke-width="3"/>
</svg>
`
}

mkdirSync(OUT_DIR, { recursive: true })
// 先清掉舊檔，避免張數改少時留下孤兒檔案。
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith('.svg')) unlinkSync(join(OUT_DIR, f))
}
for (let i = 1; i <= CARD_COUNT; i++) {
  const name = `card-${String(i).padStart(2, '0')}.svg`
  writeFileSync(join(OUT_DIR, name), card(i), 'utf-8')
}
console.log(`已產生 ${CARD_COUNT} 張暖身卡牌 → ${OUT_DIR}`)
