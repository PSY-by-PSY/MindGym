/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'PingFang TC', 'Microsoft JhengHei', 'sans-serif'],
        heading: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        handwriting: ['Caveat', 'Kalam', 'Noto Sans TC', 'cursive'],
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          soft: 'var(--primary-soft)',
          glow: 'var(--primary-glow)',
        },
        'night-deep': 'var(--night-deep)',
        'night-mid': 'var(--night-mid)',
        secondary: 'var(--secondary)',
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: 'var(--accent)',
        'tile-blue': 'var(--tile-blue)',
        'tile-peach': 'var(--tile-peach)',
        'tile-pink': 'var(--tile-pink)',
        'tile-mint': 'var(--tile-mint)',
        'tile-lemon': 'var(--tile-lemon)',
        border: 'var(--border)',
        ring: 'var(--ring)',
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
      },
    },
  },
  plugins: [],
}
