// 本地時區的日期工具 —— 單一來源。
//
// 過去多支檔案各自手刻 `${y}-${pad(m)}-${pad(d)}` 這段（streak、communityPost、
// 以及多個練習與工作坊路由），語意相同卻散落各處、容易不一致。集中成一個純函式，
// 其他地方一律 import 使用。
//
// 注意：刻意用「本地時區」而非 toISOString()（後者是 UTC，跨日邊界會差一天），
// 與 gratitude_entries.entry_date / focus_logs.log_date 等欄位的語意一致。

/** 某個 Date 的本地 YYYY-MM-DD 字串。 */
export function isoLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
