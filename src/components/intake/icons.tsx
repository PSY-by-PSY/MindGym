// 入門偏好問卷選項用的線條圖示（24×24 stroke）。
// 自己畫、不用 emoji（UI 規範），也不用再多裝 icon 套件。
const PATHS: Record<string, string> = {
  flame: 'M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1 .3-2 1-3 0 2 1 3 2 3 0-3-1-5 1-9z',
  wave: 'M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0',
  moon: 'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16 8l-2.5 5.5L8 16l2.5-5.5z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  battery: 'M3 8h14v8H3zM17 10h2v4h-2zM6 11h3v2H6z',
  umbrella: 'M3 13a9 9 0 0 1 18 0zM12 13v6a2 2 0 0 0 4 0M12 4v1',
  question: 'M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 18h.01',
  calendar: 'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4',
  heart: 'M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 8a3 3 0 0 1 0 6M21 20a6 6 0 0 0-5-5.9',
  chart: 'M4 20v-8M10 20V6M16 20v-5M22 20H2',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  wind: 'M4 8h10a2 2 0 1 0-2-2M4 12h14a2 2 0 1 1 2 2M4 16h8a2 2 0 1 1-2 2',
  run: 'M13 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5 21l4-6 3 1 2-5-3-2-4 3M14 11l2 3h4M10 10l-1 3',
  chat: 'M4 5h16v11H9l-5 4z',
  sofa: 'M4 11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6H4zM4 17v2M20 17v2M8 9V7h8v2',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM5 5l14 14',
  shuffle: 'M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16',
  headphones: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H4zM17 14h3v6h-3z',
  tap: 'M9 11V5a2 2 0 0 1 4 0v6M13 9a2 2 0 0 1 4 0v3M17 11a2 2 0 0 1 3 1.5V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-3l-3-5a2 2 0 0 1 3-2l2 2',
  sparkles: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM19 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
  sunrise: 'M12 3v3M4 12H2M22 12h-2M5 5l2 2M19 5l-2 2M3 18h18M7 15a5 5 0 0 1 10 0',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  'bell-off': 'M6 8a6 6 0 0 1 12 0v6l2 3H4l2-3zM10 21h4M3 3l18 18',
  book: 'M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z',
  briefcase: 'M3 8h18v12H3zM9 8V5h6v3M3 13h18',
  home: 'M3 11l9-8 9 8v10h-6v-6H9v6H3z',
  laptop: 'M4 5h16v11H4zM2 19h20',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  layers: 'M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
  cross: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z',
  graduation: 'M2 8l10-5 10 5-10 5-10-5zM6 12v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4M22 8v6',
  store: 'M3 9l1-5h16l1 5M4 9v10h16V9M4 9h16M9 19v-5h6v5',
  palette: 'M12 3a9 9 0 1 0 3 17.5c1 0 1.5-.6 1.5-1.3 0-.4-.2-.7-.4-1a1.6 1.6 0 0 1 1.2-2.7H19a3 3 0 0 0 3-3A9 9 0 0 0 12 3zM7 12a1.3 1.3 0 1 1 0-2.6A1.3 1.3 0 0 1 7 12zM10 8a1.3 1.3 0 1 1 0-2.6A1.3 1.3 0 0 1 10 8zM15 8a1.3 1.3 0 1 1 0-2.6A1.3 1.3 0 0 1 15 8zM17 12a1.3 1.3 0 1 1 0-2.6A1.3 1.3 0 0 1 17 12z',
}

export function IntakeIcon({ name, size = 22, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}
