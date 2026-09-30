# 真實業務收費牆與 Pro 權益把關：功能規格

> 狀態：Ready for Implementation  
> 最後更新：2026-09-28  
> 相依規格：
> - [PAYUNI 定期扣款訂閱後端規格](payuni-recurring-subscription.md)
> - [PAYUNI 官網、結帳與訂閱管理前端規格](payuni-web-ios-content.md)
> - [資料庫與訂閱權益基準](../../../supabase/subscriptions.sql)

---

## 1. 目的與核心原則

隨著金流後端（P1~P3）與前端結帳／訂閱管理（C0~C5）全數落地，MindGym 需將系統從「全登入者免費測試階段」正式切換為**真實業務分層把關（Business Features Entitlement Enforcement）**。

### 核心把關原則
1. **伺服器端唯一把關（Server-Side Security Enforcement）**：
   - 前端 `src/lib/entitlements.ts` 僅決定 UI 渲染（按鈕文字、鎖定遮罩、徽章），不作為安全邊界。
   - 所有超額操作、完整內容存取必須在 FastAPI 後端（`await _subscription_tier(user_id)`）與 Supabase RLS（`public.is_pro(auth.uid())`）進行強制把關。
2. **軟性付費牆（Soft Paywall）使用者體驗**：
   - 針對 AI 週報等核心價值功能，採用「照常生成報告、鎖定後 70% 內容、呈現前 30% 真實精華摘要」的軟性付費牆機制，避免空白頁或生硬阻擋。
3. **無縫升級與即時解鎖**：
   - 使用者在付費牆點擊「立即升級」後，直接開啟 `CheckoutModal` 完成結帳；付款成功導回後即刻刷新全域權益 Context (`invalidateEntitlements()` / `fetchEntitlements(true)`)，無需手動重新登入。

---

## 2. 業務功能分層矩陣（Free vs. Pro）

| 功能模組 | 免費會員 (Free) | Pro 訂閱會員 (Pro / Pass) | 把關機制實施點 |
| --- | --- | --- | --- |
| **核心每日練習** | 永久免費完整使用（感恩日記、過程目標、自我慈悲、WOOP） | 永久免費完整使用 | 無限制 |
| **AI 週分析報告** | **每月限 1 份**（當月第 2 份起鎖定） | **每週 1 份無限制** | 後端 `_annotate_review_lock()` + 前端 `SoftPaywallSheet` |
| **報告展示模式** | 超額報告呈現前 30% 預覽，其餘毛玻璃遮罩 | 100% 完整報告、行動建議與情緒雷達圖 | `app.weekly-review.tsx` (`row.locked`) |
| **PERMA 趨勢圖表** | 僅顯示最近一次測驗分數 | 解鎖多週趨勢變化、成長對比與維度雷達圖 | `src/routes/app.profile.tsx` (`can_view_trends`) |
| **基線重測週期** | 基礎評估，每 90 天允許重測一次 | 每月定期追蹤評估 (`can_retake = true`) | `baseline_assessment.can_retake` |
| **Pro 進階練習模組** | 僅能預覽前導介紹 | 完整體驗各項進階正向心理學模組與練習 | `app.pro-module.$moduleId.tsx` |
| **社群貼文瀏覽** | 每週最多瀏覽 15 則（當週有發文心得可解鎖） | 無限制瀏覽所有精選與夥伴打卡貼文 | Supabase RLS + `app.community.tsx` |

---

## 3. 各模組實施規格

### 3.1 AI 週分析報告額度把關 (AI Review Gating)

#### 後端邏輯恢復 (`backend/app.py`)
- **週期計算函式 (`_analysis_period_start`)**：
  ```python
  def _analysis_period_start(tier: str, at: datetime) -> datetime:
      if tier == "free":
          # 免費層：以當月 1 號 00:00:00 為週期起點
          return at.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
      # Pro 層：以當週週一 00:00:00 為週期起點
      return (at - timedelta(days=at.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
  ```
- **鎖定標記函式 (`_annotate_review_lock`)**：
  - 查詢目前用戶在所屬週期內更早生成的同類型報告數量。
  - 若已存在同類型報告 $\ge 1$，則將該報告標記為 `locked: true`。
  - 報告依然完整產出並持久化於資料庫，但 API 響應在 `locked: true` 時對非會員隱藏深入建議欄位。

#### 前端展現 (`app.weekly-review.tsx`)
- 當 `row.locked === true` 時：
  - 頂部顯示真實生成之「本週整體情緒關鍵字」與「前 30% 核心洞察」。
  - 中後段「維度深入分析」與「下週行動錦囊」覆蓋毛玻璃遮罩，並嵌入「解鎖完整 AI 週報」CTA 按鈕。
  - 點擊按鈕開啟 `SoftPaywallSheet` 或 `CheckoutModal`。

---

### 3.2 評估與趨勢成長圖表把關 (Assessment & Growth Trends)

#### 權益欄位連動 (`src/lib/entitlements.ts`)
- `can_view_trends`: Pro 會員為 `true`，免費會員為 `false`。
- `can_view_growth_comparison`: Pro 會員為 `true`，免費會員為 `false`。

#### 前端頁面展現 (`src/routes/app.profile.tsx` & `app.home.tsx`)
- 免費會員在個人健康趨勢區塊看到鎖定預覽圖示（Lock Badge），並附註：「升級 Pro 解鎖 PERMA 多週趨勢變化與心智成長對比」。
- 點擊直接開啟方案選擇與結帳流程。

---

### 3.3 App 內付費牆組件升級 (Paywall Screens Upgrade)

#### 1. `src/components/paywall/PaywallScreen.tsx`
- **原先狀態**：僅為付費意願測試期間之「創始成員免費邀請」收集頁。
- **升級為**：
  - 正式方案選擇器（月繳 / 年繳 Toggle，讀取 `pricing_config`）。
  - 呈現 Pro 會員 4 大權益清單（AI 週報每週分析、PERMA 成長曲線、進階心理模組、無上限社群）。
  - 底部固定 CTA 按鈕：「選擇方案並繼續」-> 觸發 `CheckoutModal`。
  - 保留「先自己逛逛」或關閉按鈕，符合 Apple Human Interface Guidelines。

#### 2. `src/components/paywall/SoftPaywallSheet.tsx`
- 用於各功能情境（如週報鎖定、趨勢鎖定、進階模組點擊）觸發的底部抽屜（Bottom Sheet）。
- 明確說明當前觸發點被鎖定的原因（如：「免費方案每月提供 1 份 AI 分析，本月額度已使用」）。
- 提供「升級 Pro 解鎖」按鈕，一鍵開啟 `CheckoutModal`。

---

## 4. 驗收條件與測試矩陣

1. **AI 週報額度驗收**：
   - 免費會員當月產出第 1 份報告 -> `locked: false`，可閱讀全文。
   - 免費會員當月產出第 2 份報告 -> `locked: true`，毛玻璃遮罩且呈現升級 CTA。
   - Pro 會員每週產出報告 -> `locked: false`，恆常可閱讀全文。
2. **付費牆結帳連動驗收**：
   - 在週報鎖定頁點擊「升級 Pro」-> 彈出 `CheckoutModal`。
   - 勾選同意並完成模擬付款 -> 導回後自動解鎖該份鎖定週報，無需重新整理。
3. **趨勢圖與進階模組驗收**：
   - 免費會員點擊趨勢分析 -> 呈現鎖定提示與軟性付費牆。
   - Pro 會員點擊趨勢分析 -> 正確渲染多週歷史曲線與維度雷達圖。

---

## 5. 實作追蹤 Checklist

- [ ] B1：後端 AI 週報額度計數與鎖定邏輯恢復 (`backend/app.py::_annotate_review_lock`)。
- [ ] B2：前端週報毛玻璃鎖定與軟性付費牆連動 (`app.weekly-review.tsx`)。
- [ ] B3：個人檔案趨勢圖與 PERMA 成長對比權益把關 (`app.profile.tsx`)。
- [ ] B4：升級 `PaywallScreen.tsx` 與 `SoftPaywallSheet.tsx`，直接串接 `CheckoutModal`。
- [ ] B5：撰寫 Playwright 業務收費牆 E2E 測試（免費會員超額鎖定 -> 點擊升級 -> 結帳解鎖全鏈路）。
