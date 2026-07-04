# 專業模組區（Professional Modules）實作結果報告

> 對應計劃書：[`pro_modules_plan.md`](./pro_modules_plan.md)。本次在分支 `feature/pro-modules`
> 上依 §12 順序分段實作並 commit，每個 commit 前 `npm run build`（tsc + vite）與 `npm run lint`
> 皆為綠燈。**未執行任何 SQL、未部署、未新增 npm 套件、未建 .env。**

---

## 1. 做了什麼（對照計劃書章節）

### §4 資料庫 — `supabase/pro_modules.sql`（單一冪等檔）
- `user_roles`（角色安全核心，獨立於 profiles）＋ `is_admin` / `is_practitioner` helper（SECURITY DEFINER、避免 policy 遞迴）。
- `practitioner_applications` ＋ `approve_practitioner_application` / `reject_practitioner_application` RPC；本人可於 rejected → pending 重新送出的 policy。
- `pro_modules`（雙槽 draft/published；**沒有任何直接 UPDATE policy**，全走 RPC）＋ `update_module_draft` / `approve_module` / `reject_module` / `takedown_module`。
- `pro_module_review_log`（審核軌跡；INSERT 無 policy，只由 RPC／後端 service key 寫入）。
- `invite_codes`（私密金鑰，個案端不可枚舉）＋ `regenerate_invite_code` / `preview_invite_code`。
- `pro_enrollments`（同意載體；個案只能單向停止）＋ `redeem_invite_code` / `get_my_modules`。
- `pro_entries`（打卡；停止追蹤即斷專業夥伴讀取）。
- `crisis_alerts`（後端 service key 主寫、前端 fallback 可自建）。
- `perma_scores` 純新增一條 policy（專業夥伴讀「已同意且勾選分享」的個案）。
- 全表 ENABLE RLS；所有 SECURITY DEFINER function `SET search_path = public`。

### §5 後端 — `backend/app.py`（新增兩端點）
- `POST /api/pro/submit-module`：驗證擁有者／角色／狀態／草稿非空 → Claude `claude-sonnet-4-5`
  安全標籤 → service key 改 `pending_review`、寫 review_log。**AI 任何失敗存 `{"error":...}` 照常進人工佇列。**
- `POST /api/pro/entry-safety-check`：第一層關鍵字（零成本、命中即 high）→ 未命中才第二層
  `claude-haiku-4-5-20251001` 語意；有風險用 service key 寫 `crisis_alerts`。
- 新增 `_is_practitioner`（service key 查角色）與危機關鍵字清單（與前端 lib 互相標註同步）。
- `python3 -m py_compile backend/app.py` 通過。

### §6 個案端
- `src/lib/proModules.ts`：型別、RPC 包裝、後端危機判讀呼叫、關鍵字＋`localCrisisCheck` fallback、
  `crisis_alerts` fallback 寫入、模組已更新判斷、內建三個模板。
- `src/components/pro/`：`BlockRenderer`（六題型，未知 type 當說明文字、admin 唯讀複用）、
  `BlockEditor`、`ConsentModal`（可唯讀重現）、`CrisisResourcesModal`、`ProModuleSection`。
- 首頁 `app.home.tsx`：於工作坊區塊後、訓練中心前插入 `<ProModuleSection />`。
- 播放器路由 `app.pro-module.$moduleId.tsx`：渲染 published_content → 寫 `pro_entries` → 危機判讀
  （後端優先、失敗走前端 fallback）→ 有風險彈求助資源；完成頁可分享到社群；右上「⋯」查看同意內容／停止追蹤；首次進入若已更新先提示。
- `app.tsx` `isExercise` 加上 `/app/pro-module`（練習中隱藏底部導覽）。
- `app.community.tsx`：新增 `pro_module` 版型分支（模組名稱標籤＋練習摘要）、payload 欄位、practiceTag。

### §7 / §8 內容格式與危機偵測
- Block JSON 格式與 answers 形狀、`newBlockId`、三個內建模板皆依規格。
- 關鍵字清單前後端各一份、互相標註「修改要同步」；`CrisisResourcesModal` 溫暖語氣＋可點 `tel:` 資源，不阻擋流程。

### §9 專業夥伴端 / 管理端
- `src/routes/therapist.tsx`：三態閘門（申請／審核中／退件可重送）＋主控台三分頁（我的模組／邀請碼／個案追蹤）。
  個案追蹤含危機警示橫幅＋標記已知悉、打卡統計、依 blocks 對照的紀錄時間軸、已同意時顯示 PERMA 五力；每 60 秒 refetch 警示。
- `src/routes/admin.tsx`：非 admin 顯示通用 404；四分頁（夥伴申請／模組審核含 AI 面板／已上架模組下架／危機警示總覽）。

### §10 UI 風格
- 全程使用既有 cream/brown token 與既有元件慣例（Drawer overlay、`animate-*`、`active:scale-*`、手寫 inline SVG）。
- 全站禁用 emoji：本功能所有新檔皆無 pictograph emoji（僅使用 codebase 既有的 `←`/`→`/`✕` 排版符號）。
- 所有 `track()` 事件名稱已加入 `src/lib/analytics.ts` 的型別聯集。

---

## 2. 與計劃書的差異／取捨（誠實記錄）

1. **前置 lint 修復（額外 commit `chore:`）**：實作前 `npm run lint` 原本有 2 個既有錯誤
   （`app.workshop.woop.tsx` 全形空格 irregular-whitespace、`supabase/functions/push-notify/index.ts`
   `let`→`const`），會擋下「每個 commit 前 lint 全綠」的門檻。已做**行為等價**修正並單獨 commit，
   讓後續功能 commit 的門檻有意義。剩餘 1 個 `main.tsx` 的 react-refresh **warning** 為既有、不影響 lint 退出碼（0）。
2. **`Co-Authored-By` 署名**：依執行環境指示署名 `Claude Opus 4.8`（repo 慣例列的是其他版本），保留 trailer 慣例本身。
3. **`redeem_invite_code` 回傳欄位**：依 §4.6「同 preview 欄位」只回安全欄位（不含 published_content）；
   前端兌換後導向播放器，播放器再走 `get_my_modules()` 取內容渲染。
4. **`ProModuleSection` 導覽**：因播放器路由於步驟 4 才建立，步驟 3 曾暫以 `as unknown as` 收斂型別；
   步驟 4 建好路由後已改回一般型別化的 `<Link>` / `navigate()`，最終程式碼無此類 cast。
5. **危機關鍵字註解**：前端 lib 與後端註解原用 `⚠️`，為徹底遵守「全站禁用 emoji」改為純文字「注意：」
   （此為 comment，隨步驟 7 一併清理；不影響行為）。
6. **`routeTree.gen.ts`**：由 TanStack Router vite plugin 自動產生；新增頂層/子路由後以 `vite build`
   觸發重新產生再過 tsc（因 `npm run build` 是 `tsc -b && vite build`，新路由需先產生型別）。已隨對應 commit 進版。

## 3. `TODO(pro-modules)` 清單
- **無。** 本次未於程式碼留任何 `TODO(pro-modules)` 標記；計劃書範圍內項目均已實作。

## 4. 需要使用者決定 / 未做（Out of Scope，依 §11）
- 未做：金流、Email/推播（站內提示即可）、專業夥伴↔個案聊天、模組市集/搜尋、PERMA 畫圖、
  同意後改 share_perma 的獨立 UI（重輸邀請碼即可）、邀請碼兌換次數上限、Realtime 訂閱、多語系、
  完整版本歷史（review_log 快照已足）、危機的簡訊/電話通知。
- 未新增任何 npm 套件、未建 .env、未跑 SQL、未部署（皆依 §12.4）。

---

## 5. 隔天早上的啟用清單（= 計劃書 §13）

1. 在 **Supabase Dashboard > SQL Editor** 執行 `supabase/pro_modules.sql`。
2. 把自己設為 admin（SQL Editor）：
   ```sql
   INSERT INTO user_roles (user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'love2002yy@gmail.com'
   ON CONFLICT DO NOTHING;
   ```
3. Review 分支後 merge `feature/pro-modules` → `main`（自動部署前後端）。
   - 後端新端點需要 `SUPABASE_KEY`（service key）與 `ANTHROPIC_API_KEY`（既有環境變數即可）。
4. 冒煙測試：用第二個帳號在 `/therapist` 申請 → admin 帳號核准 → 建模組（用模板）→ 送審 →
   `/admin` 核准 → 產生邀請碼 → 用第三個帳號（或無痕）兌換、同意、練習一次 → 回 `/therapist`
   看追蹤紀錄 → 再練習一次並在答案中輸入「最近常常想消失」→ 確認個案端跳出求助資源、
   `/therapist` 出現紅色警示。

## 6. 驗證狀態
- 每個 commit 前 `npm run build`（tsc + vite）與 `npm run lint` 皆綠燈（lint 僅剩既有 `main.tsx` warning，退出碼 0）。
- `python3 -m py_compile backend/app.py` 通過。
- **未能於本機執行的驗證**（需使用者環境）：實際跑 SQL、後端連 Supabase/Anthropic、端到端冒煙測試——
  請依上方第 5 節清單於正式環境完成。
