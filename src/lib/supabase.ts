import { createClient } from '@supabase/supabase-js'

const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * 本機公開頁預覽不應因為尚未複製 `.env` 就整個白畫面。
 *
 * 缺少設定時仍建立一個只指向 loopback 的 client，讓 React 能渲染 `/pricing`、
 * `/refund`、條款等公開頁；任何需要資料庫的呼叫都由各功能明確顯示「未連線」，
 * 而不是偷偷連到遠端或假裝資料可用。正式環境必須提供兩個 VITE_ 變數。
 */
export const isSupabaseConfigured = Boolean(configuredUrl && configuredAnonKey)

const supabaseUrl = configuredUrl ?? 'http://127.0.0.1:54321'
const supabaseAnonKey = configuredAnonKey ?? 'local-public-preview-only'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: isSupabaseConfigured
    ? undefined
    : { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
