/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Noto Sans TC', 'ui-sans-serif', 'system-ui', '-apple-system', 'PingFang TC', 'Microsoft JhengHei', 'sans-serif'],
        heading: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        en: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        handwriting: ['Caveat', 'Kalam', 'Noto Sans TC', 'cursive'],
      },
      colors: {
        background: 'var(--background)',
        page: 'var(--page)',
        foreground: {
          DEFAULT: 'var(--foreground)',
          soft: 'var(--foreground-soft)',
        },
        card: {
          DEFAULT: 'var(--card)',
          cream: 'var(--card-cream)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          soft: 'var(--primary-soft)',
          glow: 'var(--primary-glow)',
        },
        brand: 'var(--primary)',
        cream: 'var(--card-cream)',
        ink: {
          DEFAULT: 'var(--foreground)',
          deep: 'var(--brown-deep)',
        },
        gold: {
          DEFAULT: 'var(--gold)',
          deep: 'var(--gold-deep)',
        },
        tan: 'var(--tan)',
        olive: 'var(--olive)',
        blush: 'var(--blush)',
        rust: 'var(--rust)',
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
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
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
