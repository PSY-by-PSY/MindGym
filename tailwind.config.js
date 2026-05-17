/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'PingFang TC', 'Microsoft JhengHei', 'sans-serif'],
      },
      colors: {
        primary: '#6366f1',
        background: '#fafaf9',
      },
    },
  },
  plugins: [],
}
