// 莫奈風格 BOUBA 自畫像（後台 persona 用）。
// 用大量半透明短筆觸堆出印象派效果，再用 feTurbulence 讓邊緣抖動、疊上畫布紋理。
// 場景／小物／動物／手帕顏色由後端 persona 的 portrait 欄位決定（backend/persona_builder.py），
// 只從使用者的長處與喜好取材；筆觸的隨機種子取自 user_id，同一個人每次畫出來都一樣。

export type PortraitScene = 'hill' | 'poppies' | 'garden' | 'lilies' | 'sea' | 'sunset'
export type PortraitProp = 'parasol' | 'book' | 'camera' | 'bouquet' | 'cup' | 'ball' | 'bagel' | 'ribbon' | 'none'
export type PortraitCompanion = 'shiba' | 'dog' | 'cat' | 'none'
export type PortraitColor = 'blue' | 'pink' | 'yellow' | 'green' | 'purple' | 'orange' | 'red'
export type PortraitSpec = { scene: PortraitScene; prop: PortraitProp; companion: PortraitCompanion; scarf: PortraitColor; why?: string }

export const SCENE_LABEL: Record<PortraitScene, string> = {
  hill: '撐陽傘的草坡',
  poppies: '罌粟花田',
  garden: '花園',
  lilies: '睡蓮池',
  sea: '海邊懸崖',
  sunset: '印象・日出',
}

const W = 800
const P = {
  SKY: ['#9EC3DE', '#B7D3E8', '#8FB5D6', '#C9DDEC', '#A9C8E2', '#D8E6F0', '#B8C4E4', '#E8EEF2'],
  CLOUD: ['#FBF7EE', '#F6EEDD', '#FFFFFF', '#EFE6E8', '#F3E4D2', '#E4E9F1'],
  GRASS: ['#7FA35A', '#9BB86A', '#B7C77A', '#6E9152', '#C9C77E', '#A7B45E', '#8DAF6B', '#D8CF8A', '#5F8248'],
  FLOWER: ['#F2D36B', '#F5E9A8', '#E7839F', '#F7F1E3', '#E9B45A'],
  BODY: ['#FDF8EC', '#F9EEDC', '#FFF9F0', '#F3E6D6', '#FBEFE4', '#EDE4EC'],
  SHADE: ['#D9CFE0', '#CFC6DA', '#E2D6D0', '#C8D2DF'],
  CAP: ['#5A2E1A', '#6B3A22', '#4A2616', '#7A4A2E'],
  SUNSKY: ['#F4B58A', '#F7C99B', '#E8A0A0', '#F2D3A8', '#D9A3B8', '#F6E0B8', '#C9A7C7'],
  WATER: ['#6FA3B8', '#86B7C6', '#5E93AC', '#A3C9CF', '#7DAFB0', '#98BFD0'],
  SUNWATER: ['#7F8FB8', '#9A9CC4', '#E9A77F', '#F3C38E', '#6E7FA8', '#B59BC0'],
  FOLIAGE: ['#3F6B4E', '#56805A', '#6E9A68', '#2F5A45', '#86A874', '#4D7A6A'],
  SEA: ['#4F86B0', '#6A9EC4', '#3E75A0', '#8DB8D4', '#5C92B8', '#A8CCE0'],
  CLIFF: ['#D9B47A', '#E6C58E', '#C99B62', '#F0D7A6', '#B88A58'],
  POPPY: ['#D9483B', '#E8604A', '#C93A33', '#F07A5A'],
  BLOOM: ['#E7839F', '#C58BC9', '#F2D36B', '#F7F1E3', '#E9A0B8', '#A98BD6'],
}
const COLORS: Record<PortraitColor, string[]> = {
  blue: ['#8AB8CF', '#9CC6DA', '#7AA9C3', '#B3D3E3'],
  pink: ['#E7839F', '#F0A0B6', '#D9708E', '#F6C3D0'],
  yellow: ['#F2D36B', '#F5E09A', '#E6C24E', '#F9ECB8'],
  green: ['#86B28A', '#9CC4A0', '#6F9C74', '#BCD8BE'],
  purple: ['#A98BD6', '#BCA3E0', '#9474C8', '#D4C4EE'],
  orange: ['#E9A55A', '#F2BC78', '#D98F44', '#F7D3A0'],
  red: ['#D9483B', '#E8604A', '#C93A33', '#F07A5A'],
}
// 各小物的配色：沿用手帕以外的固定色，讓畫面不會整張同色系。
const PROP_COLORS: Record<PortraitProp, string[]> = {
  parasol: ['#6E9A6B', '#86AD7C', '#5C8760', '#A3BF8E', '#4F7656', '#B9CFA0'],
  book: ['#8A6BB0', '#9E82C0', '#735A99'],
  camera: [],
  bouquet: ['#E7839F', '#F2D36B', '#C58BC9', '#F7F1E3'],
  cup: ['#9DBF7E'],
  ball: ['#F4F1E6', '#E8E2D0', '#FFFFFF', '#DCD4BE'],
  bagel: [],
  ribbon: ['#E7839F', '#A98BD6'],
  none: [],
}

function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (Math.abs(h) % 2147483646) + 1
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export function monetPortraitSvg(spec: PortraitSpec, seedKey: string, signature: string): string {
  let seed = hashSeed(seedKey)
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]
  const r = (a: number, b: number) => a + rnd() * (b - a)
  type DabOpt = { n: number; box: number[]; colors: string[]; w?: number[]; len?: number[]; angle?: number[]; op?: number[] }
  const dabs = ({ n, box, colors, w = [6, 12], len = [10, 26], angle = [-0.6, 0.6], op = [0.55, 0.9] }: DabOpt) => {
    const [x0, y0, x1, y1] = box
    let o = ''
    for (let i = 0; i < n; i++) {
      const x = r(x0, x1), y = r(y0, y1), l = r(len[0], len[1]), a = r(angle[0], angle[1])
      const dx = Math.cos(a) * l, dy = Math.sin(a) * l
      o += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} q${(dx / 2 + r(-3, 3)).toFixed(1)} ${(dy / 2 + r(-4, 4)).toFixed(1)} ${dx.toFixed(1)} ${dy.toFixed(1)}" stroke="${pick(colors)}" stroke-width="${r(w[0], w[1]).toFixed(1)}" opacity="${r(op[0], op[1]).toFixed(2)}"/>`
    }
    return `<g fill="none" stroke-linecap="round">${o}</g>`
  }
  const cloud = (cx: number, cy: number, rx: number, ry: number, n: number) => {
    let o = ''
    for (let i = 0; i < n; i++) {
      let x: number, y: number
      do { x = r(-1, 1); y = r(-1, 1) } while (x * x + y * y > 1)
      const l = r(16, 38), a = r(-0.6, -0.15), px = cx + x * rx, py = cy + y * ry
      o += `<path d="M${px.toFixed(1)} ${py.toFixed(1)} l${(Math.cos(a) * l).toFixed(1)} ${(Math.sin(a) * l).toFixed(1)}" stroke="${pick(P.CLOUD)}" stroke-width="${r(8, 18).toFixed(1)}" opacity="${r(0.5, 0.9).toFixed(2)}"/>`
    }
    return `<g fill="none" stroke-linecap="round">${o}</g>`
  }
  const dots = (n: number, box: number[], colors: string[], rad = [2, 5], op = [0.7, 1]) => {
    const [x0, y0, x1, y1] = box
    let o = ''
    for (let i = 0; i < n; i++) o += `<circle cx="${r(x0, x1).toFixed(1)}" cy="${r(y0, y1).toFixed(1)}" r="${r(rad[0], rad[1]).toFixed(1)}" fill="${pick(colors)}" opacity="${r(op[0], op[1]).toFixed(2)}"/>`
    return o
  }
  let clipId = 0
  const clips: string[] = []
  const fill = (d: string, base: string, colors: string[], n: number, box: number[], opt: Partial<DabOpt> = {}) => {
    const id = `c${clipId++}`
    clips.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`)
    return `<g clip-path="url(#${id})"><path d="${d}" fill="${base}"/>${dabs({ n, box, colors, ...opt })}</g>`
  }

  const bodyPath = 'M304 650 C280 560 292 452 334 402 C370 360 474 360 508 402 C550 452 562 560 538 650 Q420 676 304 650Z'
  const capPath = 'M346 398 C352 352 492 352 498 398 C472 416 372 416 346 398Z'
  const hankyPath = 'M330 500 Q420 530 512 500 L506 522 Q420 552 336 522Z'
  const hill = 'M0 540 Q260 430 560 470 Q700 490 800 460 V800 H0Z'
  const bank = 'M0 630 Q300 600 560 620 Q700 630 800 612 V800 H0Z'

  // ── 背景場景 ──
  let bg = '', ground = hill, grassBox = [-20, 420, 820, 820], grassColors = P.GRASS, extraGround = ''
  const sky = (colors = P.SKY, clouds = true, y1 = 560) =>
    dabs({ n: 2400, box: [-20, -20, 820, y1], colors, w: [8, 16], len: [18, 40], angle: [-0.5, -0.1] }) +
    (clouds ? cloud(r(560, 680), r(110, 170), r(150, 200), r(55, 75), 520) + cloud(r(140, 260), r(220, 280), r(140, 190), r(45, 65), 420) + cloud(r(330, 450), r(60, 100), r(90, 130), r(28, 40), 180) : '')
  switch (spec.scene) {
    case 'poppies':
      bg = `<rect width="800" height="800" fill="#C6DAEA"/>` + sky()
      extraGround = dots(420, [0, 480, 800, 800], P.POPPY, [3, 8]) + dots(120, [0, 480, 800, 800], P.FLOWER, [2, 4])
      break
    case 'garden':
      bg = `<rect width="800" height="800" fill="#C6DAEA"/>` + sky(P.SKY, true, 380) +
        dabs({ n: 1500, box: [-20, 250, 820, 520], colors: P.FOLIAGE, w: [8, 16], len: [10, 24], angle: [-2, 2] }) +
        dots(260, [0, 280, 800, 520], P.BLOOM, [3, 7])
      extraGround = dots(520, [0, 470, 800, 800], P.BLOOM, [3, 7])
      break
    case 'lilies':
      bg = `<rect width="800" height="800" fill="#6FA3B8"/>` +
        dabs({ n: 1300, box: [-20, -20, 820, 260], colors: P.FOLIAGE, w: [8, 16], len: [14, 34], angle: [1.2, 1.9] }) +
        dabs({ n: 2200, box: [-20, 230, 820, 660], colors: P.WATER, w: [7, 14], len: [20, 44], angle: [-0.1, 0.1] }) +
        dabs({ n: 500, box: [-20, 230, 820, 660], colors: P.FOLIAGE, w: [6, 12], len: [16, 30], angle: [-0.1, 0.1], op: [0.3, 0.6] })
      for (let i = 0; i < 24; i++) {
        const x = r(20, 780), y = r(300, 620), s = r(0.7, 1.4)
        bg += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(34 * s).toFixed(0)}" ry="${(11 * s).toFixed(0)}" fill="${pick(['#5E8A55', '#77A062', '#4E7A4A'])}" opacity=".9"/>`
        if (rnd() < 0.55) bg += `<circle cx="${(x + r(-8, 8)).toFixed(0)}" cy="${(y - 6).toFixed(0)}" r="${(7 * s).toFixed(0)}" fill="${pick(['#F2B8C6', '#F7F1E3', '#E7839F'])}"/>`
      }
      ground = bank; grassBox = [-20, 590, 820, 820]
      break
    case 'sea':
      bg = `<rect width="800" height="800" fill="#B9D2E6"/>` + sky(P.SKY, true, 380) +
        dabs({ n: 1400, box: [-20, 330, 820, 520], colors: P.SEA, w: [6, 12], len: [20, 44], angle: [-0.08, 0.08] }) +
        dabs({ n: 200, box: [-20, 330, 820, 520], colors: ['#FFFFFF', '#E8F1F6'], w: [4, 8], len: [10, 26], angle: [-0.08, 0.08], op: [0.5, 0.9] }) +
        fill('M540 520 Q590 470 610 400 Q630 320 680 300 Q740 285 820 300 V520Z', '#D9B47A', P.CLIFF, 600, [530, 280, 820, 520], { angle: [1.2, 1.9] })
      break
    case 'sunset':
      bg = `<rect width="800" height="800" fill="#F2C49E"/>` +
        dabs({ n: 2200, box: [-20, -20, 820, 420], colors: P.SUNSKY, w: [8, 16], len: [18, 40], angle: [-0.3, 0.1] }) +
        `<circle cx="600" cy="230" r="42" fill="#F07A3A" opacity=".85"/>` +
        dabs({ n: 1800, box: [-20, 400, 820, 660], colors: P.SUNWATER, w: [6, 12], len: [20, 44], angle: [-0.08, 0.08] }) +
        dabs({ n: 160, box: [560, 420, 640, 660], colors: ['#F07A3A', '#F3A15A', '#FFD08A'], w: [6, 10], len: [16, 30], angle: [-0.08, 0.08] })
      ground = bank; grassBox = [-20, 590, 820, 820]
      grassColors = ['#5E6F8E', '#7C7FA3', '#4F6282', '#8E88A8', '#6E8B6A', '#566F5C']
      break
    default: // hill
      bg = `<rect width="800" height="800" fill="#B9D2E6"/>` + sky()
      extraGround = dots(320, [0, 470, 800, 800], P.FLOWER, [2.2, 5.5])
  }

  // ── 陪伴動物 ──
  const companion: Record<Exclude<PortraitCompanion, 'none'>, () => string> = {
    shiba: () => fill('M570 700 C562 660 580 636 626 634 C672 632 694 660 690 700Z', '#E3A15B', ['#E3A15B', '#D98E47', '#EDB16E', '#C97C3A'], 240, [560, 630, 700, 710], { w: [5, 9], len: [8, 16] }) +
      `<path d="M690 670 q40 -8 26 -44 q-12 -22 -32 -4 q16 -2 16 10 q2 14 -22 20" fill="#DB9550"/>` +
      fill('M580 590 L586 540 L612 562 Q634 556 656 562 L682 540 L688 590 Q686 632 634 634 Q582 632 580 590Z', '#E3A15B', ['#E3A15B', '#D98E47', '#EDB16E'], 240, [576, 536, 692, 636], { w: [5, 9], len: [8, 16] }) +
      dabs({ n: 90, box: [600, 590, 668, 630], colors: ['#FBF3E4', '#FFF9EE'], w: [5, 9], len: [6, 12] }),
    dog: () => fill('M570 700 C562 660 580 636 626 634 C672 632 694 660 690 700Z', '#F3E9DA', ['#F3E9DA', '#E8DAC4', '#FFF8EE'], 240, [560, 630, 700, 710], { w: [5, 9], len: [8, 16] }) +
      fill('M584 596 Q584 548 634 546 Q684 548 684 596 Q682 634 634 634 Q586 634 584 596Z', '#F3E9DA', ['#F3E9DA', '#E8DAC4', '#FFF8EE'], 220, [580, 540, 690, 636], { w: [5, 9], len: [8, 16] }) +
      `<path d="M588 560 q-22 10 -14 46 q14 4 20 -20z M680 560 q22 10 14 46 q-14 4 -20 -20z" fill="#9A6A44"/><path d="M688 668 q30 -6 24 -30" stroke="#E8DAC4" stroke-width="12" stroke-linecap="round" fill="none"/>`,
    cat: () => fill('M572 700 C566 664 586 640 628 638 C670 640 690 664 684 700Z', '#A7A3AE', ['#A7A3AE', '#BDB8C4', '#8F8B98', '#D0CCD6'], 240, [560, 630, 700, 710], { w: [5, 9], len: [8, 16] }) +
      `<path d="M684 684 q34 -4 30 -48 q-2 -18 -12 -22" stroke="#9A96A3" stroke-width="12" stroke-linecap="round" fill="none"/>` +
      fill('M588 598 L592 548 L614 568 Q634 562 654 568 L676 548 L680 598 Q678 638 634 640 Q590 638 588 598Z', '#A7A3AE', ['#A7A3AE', '#BDB8C4', '#8F8B98'], 220, [584, 544, 684, 642], { w: [5, 9], len: [8, 16] }) +
      dabs({ n: 70, box: [606, 606, 662, 636], colors: ['#F4F1F6', '#FFFFFF'], w: [5, 8], len: [6, 12] }),
  }
  const faceOf: Record<Exclude<PortraitCompanion, 'none'>, string> = {
    shiba: `<circle cx="618" cy="592" r="4.5" fill="#3E2416"/><circle cx="650" cy="592" r="4.5" fill="#3E2416"/><ellipse cx="634" cy="606" rx="6" ry="4.5" fill="#3E2416"/><ellipse cx="604" cy="608" rx="9" ry="6" fill="#E7839F" opacity=".7"/><ellipse cx="664" cy="608" rx="9" ry="6" fill="#E7839F" opacity=".7"/>`,
    dog: `<circle cx="618" cy="590" r="4.5" fill="#3E2416"/><circle cx="650" cy="590" r="4.5" fill="#3E2416"/><ellipse cx="634" cy="606" rx="7" ry="5" fill="#3E2416"/><ellipse cx="604" cy="606" rx="9" ry="6" fill="#E7839F" opacity=".7"/><ellipse cx="664" cy="606" rx="9" ry="6" fill="#E7839F" opacity=".7"/>`,
    cat: `<path d="M612 596 q6 -6 12 0 M644 596 q6 -6 12 0" stroke="#3E2416" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M630 608 l4 4 l4 -4" stroke="#3E2416" stroke-width="3" fill="none"/><ellipse cx="606" cy="612" rx="8" ry="5" fill="#E7839F" opacity=".7"/><ellipse cx="662" cy="612" rx="8" ry="5" fill="#E7839F" opacity=".7"/>`,
  }

  // ── 小物（左手附近）──
  const c = PROP_COLORS[spec.prop]
  const props: Record<PortraitProp, () => string> = {
    parasol: () => `<path d="M300 244 L330 516" stroke="#5A3A26" stroke-width="7" stroke-linecap="round"/>` +
      `<g transform="rotate(-16 300 250) translate(-120 -6)">${fill('M250 250 Q420 120 590 250 Q560 238 530 252 Q500 236 470 252 Q440 236 420 252 Q400 236 370 252 Q340 236 310 252 Q280 238 250 250Z', c[0], c, 900, [240, 110, 600, 260], { w: [6, 12], len: [10, 24], angle: [-0.3, 0.9] })}</g>`,
    book: () => `<g transform="rotate(-14 300 560)">${fill('M250 530 L330 530 L330 600 L250 600Z', c[0], c, 120, [250, 530, 330, 600], { w: [5, 9], len: [8, 14] })}<path d="M256 536 L256 594" stroke="#FFF7E8" stroke-width="5" opacity=".8"/></g>`,
    camera: () => `<g transform="rotate(-10 300 560)">${fill('M248 536 L338 536 L338 596 L248 596Z', '#3E3A40', ['#3E3A40', '#55505A', '#2C2A30'], 120, [248, 536, 338, 596], { w: [5, 9], len: [8, 14] })}<circle cx="293" cy="566" r="20" fill="#6E7A8C"/><circle cx="293" cy="566" r="11" fill="#2A3140"/><circle cx="288" cy="561" r="4" fill="#DDE6F0"/></g>`,
    bouquet: () => `<path d="M300 600 L286 540 M300 600 L300 530 M300 600 L316 540" stroke="#4E7A4A" stroke-width="5" stroke-linecap="round"/>` + dots(38, [268, 500, 336, 548], c, [6, 11], [0.85, 1]) + `<path d="M284 580 L316 580 L306 612 L294 612Z" fill="#F4E6CF"/>`,
    ball: () => `<circle cx="290" cy="580" r="34" fill="${c[0]}"/>` + dabs({ n: 80, box: [258, 548, 322, 612], colors: c, w: [4, 7], len: [6, 12] }) + `<path d="M258 572 Q290 556 322 572 M264 604 Q290 590 316 604 M290 546 Q304 580 290 614" stroke="#3E5A8C" stroke-width="3" fill="none" opacity=".7"/>`,
    cup: () => `<path d="M268 560 L318 560 L312 604 Q293 612 274 604Z" fill="${c[0]}"/><path d="M318 572 q16 2 12 16 q-4 10 -16 8" stroke="${c[0]}" stroke-width="6" fill="none"/><path d="M280 548 q-6 -12 2 -22 M296 546 q-6 -14 2 -26" stroke="#FFFFFF" stroke-width="4" fill="none" opacity=".7" stroke-linecap="round"/>`,
    bagel: () => `<circle cx="292" cy="580" r="34" fill="#D9A15E"/>` + dabs({ n: 70, box: [258, 546, 326, 614], colors: ['#D9A15E', '#C88A48', '#E8B878', '#B87636'], w: [4, 8], len: [6, 12] }) + `<circle cx="292" cy="580" r="11" fill="#FBF3E6"/>`,
    ribbon: () => `<path d="M330 520 C260 470 230 560 180 500 C140 452 120 520 90 480" stroke="${c[0]}" stroke-width="10" fill="none" stroke-linecap="round" opacity=".9"/><path d="M330 520 C270 500 250 580 200 540" stroke="${c[1]}" stroke-width="7" fill="none" stroke-linecap="round" opacity=".8"/>`,
    none: () => '',
  }

  const scarf = COLORS[spec.scarf] ?? COLORS.blue
  const pet = spec.companion !== 'none' ? spec.companion : null
  const body = `
<g filter="url(#paint)">
  ${bg}
  ${fill(ground, grassColors[0], grassColors, 3000, grassBox, { w: [6, 12], len: [10, 26], angle: [-1.9, -1.2] })}
  ${extraGround}
  <ellipse cx="470" cy="668" rx="190" ry="26" fill="#3E5A3A" opacity=".35" filter="url(#soft)"/>
  ${spec.prop === 'parasol' ? props.parasol() : ''}
  ${pet ? companion[pet]() : ''}
  ${fill(bodyPath, '#FBF3E6', P.BODY, 1400, [280, 350, 560, 670], { w: [6, 11], len: [10, 22], angle: [-1.8, -1.2] })}
  ${fill(bodyPath, 'none', P.SHADE, 420, [280, 350, 560, 470], { w: [6, 11], len: [10, 20], angle: [-0.4, 0.4], op: [0.35, 0.65] })}
  ${fill(bodyPath, 'none', P.SHADE, 260, [480, 400, 560, 670], { w: [6, 10], len: [10, 20], angle: [-1.8, -1.2], op: [0.3, 0.6] })}
  ${fill(bodyPath, 'none', ['#FFF6D8', '#FFF1C8', '#FFFFFF'], 180, [290, 470, 360, 660], { w: [5, 9], len: [8, 18], angle: [-1.8, -1.2], op: [0.5, 0.85] })}
  <path d="${bodyPath}" fill="none" stroke="#A89CBD" stroke-width="7" opacity=".55"/>
  ${dabs({ n: 260, box: [270, 632, 580, 690], colors: grassColors, w: [5, 10], len: [10, 22], angle: [-1.9, -1.2] })}
  ${fill(capPath, '#5A2E1A', P.CAP, 160, [340, 350, 510, 420], { w: [5, 9], len: [8, 16], angle: [-0.3, 0.3] })}
  ${fill(hankyPath, scarf[0], scarf, 200, [330, 496, 520, 556], { w: [5, 9], len: [8, 16], angle: [-0.3, 0.3] })}
  <path d="M500 512 q40 -10 62 -34 q-8 30 -30 52 z" fill="${scarf[0]}" opacity=".9"/>
  ${spec.prop !== 'parasol' ? props[spec.prop]() : ''}
  <ellipse cx="332" cy="560" rx="20" ry="16" fill="#FBF1E2"/>
</g>
<g filter="url(#soft)">
  <ellipse cx="376" cy="452" rx="26" ry="16" fill="#E7839F" opacity=".75"/>
  <ellipse cx="470" cy="452" rx="26" ry="16" fill="#E7839F" opacity=".75"/>
  <circle cx="396" cy="430" r="6" fill="#4A2616"/><circle cx="450" cy="430" r="6" fill="#4A2616"/>
  <path d="M410 448 q13 14 26 0" stroke="#4A2616" stroke-width="4" fill="none" stroke-linecap="round"/>
  ${pet ? faceOf[pet] : ''}
</g>
<rect width="${W}" height="${W}" filter="url(#canvas)"/>
<text x="750" y="772" text-anchor="end" font-family="Snell Roundhand, Brush Script MT, cursive" font-size="28" fill="${spec.scene === 'sunset' ? '#FDF1E0' : '#8A4A3A'}" opacity=".85">${esc(signature)}</text>`
  const turb = hashSeed(seedKey) % 50
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}">
<defs>
  <filter id="paint" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${turb}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G"/></filter>
  <filter id="soft"><feGaussianBlur stdDeviation="1.1"/></filter>
  <filter id="canvas"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0.10 0"/></filter>
  ${clips.join('')}
</defs>${body}
</svg>`
}

// 1MB 等級的 SVG 直接塞進 DOM 很吃效能；轉成 blob URL 給 <img> 用，並依 user_id 快取。
const urlCache = new Map<string, string>()
export function monetPortraitUrl(spec: PortraitSpec, seedKey: string, signature: string): string {
  const key = `${seedKey}|${spec.scene}|${spec.prop}|${spec.companion}|${spec.scarf}|${signature}`
  let url = urlCache.get(key)
  if (!url) {
    url = URL.createObjectURL(new Blob([monetPortraitSvg(spec, seedKey, signature)], { type: 'image/svg+xml' }))
    urlCache.set(key, url)
  }
  return url
}
