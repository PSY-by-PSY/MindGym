// ─────────────────────────────────────────────────────────────────────────
// 心理量表與練習方法的學術出處（App Store 審查指南 1.4.1）
//
// 為什麼需要這個檔案：
//   2026-09-05 的退件明確指出——「App 提供健康／心理評估與健康報告，卻沒有
//   附上資訊來源的引用」。Apple 要求:
//     "Include citations in the app of the sources of the recommendations or
//      information, such as links to those sources. The citations to the
//      sources should be easy for the user to find."
//
//   兩個關鍵字：**links**（要能點）與 **easy to find**（不能藏在設定深處）。
//   所以每一筆都必須帶可點的 DOI/官方連結，而且顯示在報告畫面本身，
//   不是塞進條款頁。
//
// ⚠️ 新增任何「會給使用者分數、建議或健康判讀」的功能時，這裡要一起補來源，
//    並在該畫面掛上 <ReferencesSection>。少掛一個畫面就是一次退件。
//
// ⚠️ 引用格式一律 APA 7th，且 url 必須是可解析的永久連結（DOI 優先）。
//    不要放會失效的新聞稿或部落格連結——審查員會實際點。
// ─────────────────────────────────────────────────────────────────────────

export interface Reference {
  /** APA 7th 格式的完整引用（維持英文原文，學術慣例不翻譯） */
  citation: string
  /** 可點擊的永久連結，DOI 優先 */
  url: string
}

/** InMind 心理健身基線檢測（PERMA 五大指數）的理論依據 */
export const PERMA_REFERENCES: Reference[] = [
  {
    // 刻意引期刊論文而不是《Flourish》那本書：書的出版社頁面會擋掉非瀏覽器
    // 請求、且沒有 DOI，連結壽命不可靠。這篇是 Seligman 本人談 PERMA 的論文。
    citation:
      'Seligman, M. (2018). PERMA and the building blocks of well-being. The Journal of Positive Psychology, 13(4), 333–335.',
    url: 'https://doi.org/10.1080/17439760.2018.1437466',
  },
  {
    citation:
      'Butler, J., & Kern, M. L. (2016). The PERMA-Profiler: A brief multidimensional measure of flourishing. International Journal of Wellbeing, 6(3), 1–48.',
    url: 'https://doi.org/10.5502/ijw.v6i3.526',
  },
  {
    citation:
      'Ryff, C. D. (1989). Happiness is everything, or is it? Explorations on the meaning of psychological well-being. Journal of Personality and Social Psychology, 57(6), 1069–1081.',
    url: 'https://doi.org/10.1037/0022-3514.57.6.1069',
  },
]

/** 每週 AI 統整回饋所依據的方法：感恩、情緒覺察與反思書寫 */
export const WEEKLY_REVIEW_REFERENCES: Reference[] = [
  {
    citation:
      'Emmons, R. A., & McCullough, M. E. (2003). Counting blessings versus burdens: An experimental investigation of gratitude and subjective well-being in daily life. Journal of Personality and Social Psychology, 84(2), 377–389.',
    url: 'https://doi.org/10.1037/0022-3514.84.2.377',
  },
  {
    citation:
      'Pennebaker, J. W., & Chung, C. K. (2012). Expressive writing: Connections to physical and mental health. In H. S. Friedman (Ed.), The Oxford Handbook of Health Psychology (pp. 417–437). Oxford University Press.',
    url: 'https://doi.org/10.1093/oxfordhb/9780195342819.013.0018',
  },
  {
    citation:
      'Fredrickson, B. L. (2001). The role of positive emotions in positive psychology: The broaden-and-build theory of positive emotions. American Psychologist, 56(3), 218–226.',
    url: 'https://doi.org/10.1037/0003-066X.56.3.218',
  },
]
