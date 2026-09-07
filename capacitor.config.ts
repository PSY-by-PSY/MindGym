import type { CapacitorConfig } from '@capacitor/cli'

// ─────────────────────────────────────────────────────────────────────────
// Capacitor 設定（iOS 殼）
//
// 核心策略：server.url 指向 Vercel 線上版。
//   → App 啟動時直接載入線上網站，內容/UI/練習模組改 web → push 即時生效，
//
// ⚠️ 注意：因為 WebView 載入的是「遠端 Vercel bundle」，任何要在 App 內生效的
//   前端 JS 變更（含呼叫 Capacitor plugin 的程式碼）都必須先 deploy 到 Vercel。
//   本地 ios/ 專案只負責「殼 + 原生 plugin + URL scheme 註冊」。
// ─────────────────────────────────────────────────────────────────────────

const config: CapacitorConfig = {
  appId: 'com.psybypsy.app',
  appName: 'PSY by PSY',
  // 即使用 server.url 載入遠端，Capacitor 仍要求 webDir 存在（離線 fallback 用）。
  webDir: 'dist',
  server: {
    url: 'https://app.psybypsy.com',
    cleartext: false,
  },
  ios: {
    // safe area 一律交給 CSS 處理（index.html 有 viewport-fit=cover，全站 13 個
    // 檔案用 env(safe-area-inset-*)，含 app.tsx 的 header/nav/main 與登入、
    // onboarding、隱私權等頁）。
    //
    // 為什麼不能用 'always'（原本的設定）：它會讓原生 UIScrollView 把網頁內容
    //   往內縮 safe area 的高度，畫面上下各留一條，露出的正是下面那行
    //   backgroundColor 的 #F0F6FF 淡藍（Capacitor 會把它同時設到
    //   webView.backgroundColor 與 scrollView.backgroundColor）。
    //   這才是「滑到最上/最下出現淡藍空白」的真正原因——不是橡皮筋回彈，
    //   Capacitor 在 CAPBridgeViewController.prepareWebView 預設就已經
    //   bounces = false 了。內容比可視區高時捲動會蓋住那兩條，所以只有捲到
    //   極端才看得到。
    //   再加上 CSS 本來就有 env(safe-area-inset-*)，'always' 等於把 safe area
    //   算了兩次。
    contentInset: 'never',
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
