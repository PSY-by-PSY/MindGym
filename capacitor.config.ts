import type { CapacitorConfig } from '@capacitor/cli'

// ─────────────────────────────────────────────────────────────────────────
// Capacitor 設定（iOS 殼）
//
// 核心策略：server.url 指向 Vercel 線上版。
//   → App 啟動時直接載入線上網站，內容/UI/練習模組改 web → push 即時生效，
//     99% 的更新「不需重新送審」。只有殼本身（icon、權限、plugin、版本）改動才需重打包。
//
// ⚠️ 注意：因為 WebView 載入的是「遠端 Vercel bundle」，任何要在 App 內生效的
//   前端 JS 變更（含呼叫 Capacitor plugin 的程式碼）都必須先 deploy 到 Vercel。
//   本地 ios/ 專案只負責「殼 + 原生 plugin + URL scheme 註冊」。
// ─────────────────────────────────────────────────────────────────────────

const config: CapacitorConfig = {
  appId: 'com.mindgym.app',
  appName: 'PSY by PSY',
  // 即使用 server.url 載入遠端，Capacitor 仍要求 webDir 存在（離線 fallback 用）。
  webDir: 'dist',
  server: {
    url: 'https://mind-gym-kappa.vercel.app',
    cleartext: false,
  },
  ios: {
    // 讓 WebView 自動處理 safe-area inset，內容不被瀏海/home bar 蓋住。
    contentInset: 'always',
    // 背景色：載入遠端網站前的底色，與啟動畫面品牌淺藍一致避免閃白。
    backgroundColor: '#F0F6FF',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#F0F6FF',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      splashFullScreen: true,
      splashImmersive: false,
    },
    Keyboard: {
      // 用 'none'：鍵盤彈出時「不」改變原生 WebView 尺寸，鍵盤改為覆蓋在內容上。
      // 'native' 會在偵測到鍵盤時縮小 WebView 高度；但從系統瀏覽器（OAuth 登入）打字
      // 返回後，縮小的尺寸沒復原 → App 被擠到上半部、下半部露出黑色原生視窗。改 'none' 根除。
      resize: 'none',
    },
  },
}

export default config
