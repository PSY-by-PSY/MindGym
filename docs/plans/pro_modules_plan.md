# 專業模組區（Professional Modules）完整實作計劃書

> 本文件是執行代理（Opus）的唯一規格來源。請從頭到尾讀完再動工。
> 遇到規格沒寫到的細節：選擇「較小的範圍」實作，在程式碼留 `TODO(pro-modules):` 註解，
> 並記錄到最後的執行結果報告，**不要自行擴大範圍**。

---

## 0. 一句話目標

讓廣義的助人工作者（心理師、輔導老師、生涯教練……UI 一律稱「**專業夥伴**」）能在隱藏頁面
`/therapist` 自訂練習模組 → 送審（AI 標籤輔助 + 管理員在 `/admin` 人工審核）→ 取得邀請碼
發給個案 → 個案在 App「專業模組區」輸入邀請碼、**明確同意**後解鎖練習 → 專業夥伴在追蹤
介面看到個案打卡紀錄與危機警示。

## 1. 已拍板的產品決策（不要重新設計）

1. **入口**：App 首頁「工作坊專屬練習」區塊下方，新增「專業模組區」。預設空白 + 一個邀請碼輸入欄。
2. **邀請碼**：私密金鑰性質（不同於工作坊的公開當日密碼）。每個模組同時只有一組有效碼，
   專業夥伴可「重新產生」（舊碼立即作廢）。
3. **同意流程**：輸入邀請碼 → 先預覽模組資訊 → 跳同意小視窗（載明專業夥伴將看到哪些資料）→
   同意才建立追蹤關係。個案可隨時在模組頁面「停止追蹤關係」，停止後專業夥伴**立即**看不到任何資料。
4. **審核**：任何內容修改都要重新送審，審核通過前個案繼續用「已上架版本」。審核唯一標準＝
   「根據心理學」。AI 只做安全標籤（心理安全＋資訊安全），**絕不硬性擋下**，一律進人工佇列。
5. **模組更新通知**：重新上架後，個案端跳通知「模組已更新」。
6. **危機警示（雙向）**：個案練習內容出現自傷相關字眼或語意 → ① 專業夥伴管理頁面即時跳紅色警示
   ② **同時**個案端當下直接顯示求助資源（安心專線 1925 等）。兩邊都做。
7. **社群隔離**：個案與專業夥伴在社群零互動。追蹤資料流（私密）與社群資料流（公開）完全分離。
   個案可自由選擇把練習成果發到社群，貼文長相與一般貼文相同，預設不標註來自哪位專業夥伴。
8. **免費**：不做任何金流。
9. **路由**：`/therapist` 與 `/admin`，同一個網域，不出現在任何導覽列/選單（隱藏路由）。
10. **版面**：`/therapist`、`/admin` 以桌機為主、responsive 向下相容；個案端一律沿用現有行動版風格。
11. **UI 風格**：完全承襲現有 cream/brown 暖色 token 設計（見 §10 風格規範）。

## 2. 現有系統盤點（必須遵守的慣例）

| 項目 | 現況 | 對你的意義 |
|---|---|---|
| 前端 | Vite + React 18 + TanStack Router（file-based，`src/routes/*.tsx`） | 新頁面＝新路由檔；`routeTree.gen.ts` 是自動產生的，**絕不手改** |
| 資料層 | 前端用 anon key + RLS 直接讀寫 Supabase（`src/lib/supabase.ts`） | 新表全部走同一模式；敏感操作用 SECURITY DEFINER RPC |
| 後端 | FastAPI（`backend/app.py`，Render 部署，root `app.py` 是 shim）只做 AI 呼叫；曾有寫表先例（perma_scores 用 service key） | AI 審核與危機判讀放後端；寫表可用 service key |
| SQL 檔 | `supabase/*.sql`，冪等（CREATE IF NOT EXISTS + DROP POLICY IF EXISTS），**需要使用者手動在 Dashboard SQL Editor 執行** | 你只負責把 SQL 寫好，不可能也不需要實際執行 |
| 社群貼文 | 全部塞 `gratitude_entries`（`practice_type` 區分、`payload` jsonb 客製版型），likes/comments/reports/blocks 都指向它 | 個案分享練習沿用此表；**正式 DB 的 item_1/2/3 是 NOT NULL**（schema.sql 沒寫！）→ 補 `''` |
| 工作坊 | sessionStorage 密碼閘門（`src/lib/workshop.ts`、`WorkshopGate.tsx`）、公開密碼 psyYYYYMMDD | 只借它的「區塊＋解鎖」心智模型；邀請碼機制是全新的、走 DB |
| 通知 | 無通知表；由 likes/comments 即時推導 + localStorage lastSeen（`src/lib/notifications.ts`） | 模組更新通知沿用「推導 + localStorage」模式，不建通知表 |
| 分析 | PostHog `track()`（`src/lib/analytics.ts`） | 關鍵動作都要埋 track |
| 部署 | **push main = Vercel 前端 + Render 後端自動部署到正式站** | **絕對禁止 push main**，見 §12 |
| 帳號 | Supabase Auth；`profiles(id, name, avatar, current_streak)`，有「本人可更新」RLS | **角色絕不能放 profiles**（會被自改提權），見 §4.1 |

## 3. 系統架構總覽

```
個案端 (App, 行動版)                      專業夥伴端 (/therapist, 桌機)
  首頁「專業模組區」                          申請成為專業夥伴（表單）
  輸入邀請碼 → preview RPC                   模組列表 / 積木式編輯器
  同意視窗 → redeem RPC                      送審 → 後端 AI 標籤 → pending
  模組播放器（渲染 blocks）                  邀請碼管理（產生/作廢）
  提交 pro_entries                           個案追蹤（打卡紀錄、危機警示）
  ├→ 後端危機判讀（關鍵字+AI）
  │    有風險 → crisis_alerts + 個案端求助資源視窗
  └→（可選）分享到社群 gratitude_entries

管理員端 (/admin, 桌機)
  專業夥伴申請審核 / 模組審核佇列（AI 標籤僅供參考）/ 已上架模組下架 / 危機警示總覽

資料流隔離：追蹤資料（pro_entries, crisis_alerts）只有「本人 + 該模組 active 追蹤關係的
專業夥伴」能讀；社群資料照舊走 gratitude_entries，兩邊沒有任何 join 或互通 UI。
```

## 4. 資料庫設計 — 新檔案 `supabase/pro_modules.sql`

單一冪等檔案，檔頭註解沿用house style（說明用途、冪等、需在 SQL Editor 手動執行）。
所有表 `ENABLE ROW LEVEL SECURITY`；**沒有寫到的操作＝沒有 policy＝預設拒絕**，這是刻意的。
所有 SECURITY DEFINER function 必須 `SET search_path = public`。

### 4.1 user_roles（角色 — 安全核心）

```sql
CREATE TABLE IF NOT EXISTS user_roles (
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role       text NOT NULL CHECK (role IN ('practitioner', 'admin')),
  granted_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, role)
);
```

- **為什麼獨立一張表**：`profiles` 已有「本人可更新」policy，若把 role 放 profiles，
  任何使用者可以把自己改成 admin。獨立表 + 嚴格 policy 才安全。
- Helper functions（SECURITY DEFINER 以繞過 RLS、避免 policy 遞迴）：

```sql
CREATE OR REPLACE FUNCTION is_admin(uid uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = uid AND role = 'admin') $$;

CREATE OR REPLACE FUNCTION is_practitioner(uid uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = uid AND role = 'practitioner') $$;
```

- Policies：本人可讀自己的角色；admin 可讀全部；INSERT 僅限 `is_admin(auth.uid()) AND role = 'practitioner'`
  （**admin 不能透過前端授予 admin**，第一位 admin 由使用者手動 SQL 建立，見 §13）；DELETE 同 INSERT 條件。

### 4.2 practitioner_applications（專業夥伴申請）

欄位：`id uuid pk, user_id uuid UNIQUE NOT NULL refs profiles, name text NOT NULL, title text,
organization text, license_info text, motivation text, status text CHECK (pending/approved/rejected)
DEFAULT 'pending', admin_note text, created_at, reviewed_at`。

- Policies：本人可建立（`auth.uid() = user_id AND status = 'pending'`）、本人可讀自己的；admin 可讀全部。
- 核准走 RPC（原子性：改狀態＋授予角色一起）：

```sql
CREATE OR REPLACE FUNCTION approve_practitioner_application(p_app_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  UPDATE practitioner_applications SET status = 'approved', reviewed_at = now() WHERE id = p_app_id;
  INSERT INTO user_roles (user_id, role, granted_by)
    SELECT user_id, 'practitioner', auth.uid() FROM practitioner_applications WHERE id = p_app_id
    ON CONFLICT DO NOTHING;
END; $$;
```

  退件 RPC `reject_practitioner_application(p_app_id, p_note)` 同構（status='rejected'、寫 admin_note）。

### 4.3 pro_modules（模組本體 — 雙槽設計）

```sql
CREATE TABLE IF NOT EXISTS pro_modules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title             text NOT NULL,
  description       text,
  est_minutes       int,
  draft_content     jsonb,          -- 編輯中/送審中的內容
  published_content jsonb,          -- 個案實際使用的已核准內容
  status            text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','approved','rejected','archived')),
  ai_review         jsonb,          -- 最近一次送審的 AI 標籤（僅供管理員參考）
  admin_note        text,           -- 退件/下架理由（專業夥伴可見）
  submitted_at      timestamptz,
  published_at      timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
```

- **雙槽語意**（取代版本表，刻意簡化）：`published_content` 是個案看到的；修改後 `draft_content`
  變更並重新送審，期間 `published_content` 不動。個案可用的判斷式**全站統一**為：
  `published_content IS NOT NULL AND status <> 'archived'`。核准動作＝把 draft 複製進 published。
- **欄位保護策略（重要）**：專業夥伴**沒有任何直接 UPDATE policy**。所有寫入走 RPC，
  杜絕「自行把 draft 塞進 published_content 繞過審核」的漏洞：
  - 直接 INSERT 允許，但 WITH CHECK 鎖死初始狀態：
    `owner_id = auth.uid() AND is_practitioner(auth.uid()) AND status = 'draft' AND published_content IS NULL AND published_at IS NULL AND ai_review IS NULL AND admin_note IS NULL`
  - `update_module_draft(p_module_id, p_title, p_description, p_est_minutes, p_draft_content jsonb)`：
    SECURITY DEFINER，檢查 `owner_id = auth.uid()`，只更新這五個欄位＋updated_at。
  - `submit_module_for_review(p_module_id)` **不做**——送審統一走後端（§5.1），因為要先跑 AI。
  - Admin RPC：`approve_module(p_module_id, p_note)`（檢查 is_admin；`published_content := draft_content`、
    status='approved'、published_at=now()）、`reject_module(p_module_id, p_note)`（status='rejected'、admin_note）、
    `takedown_module(p_module_id, p_note)`（status='archived'；已上架但違規時下架）。
    三者都同時 INSERT 一筆 `pro_module_review_log`。
  - DELETE policy：owner 限 `status = 'draft' AND published_content IS NULL`（草稿可刪，上過架只能封存）。
- SELECT policies：owner 可讀自己的；admin 可讀全部。**個案不直接讀這張表**（避免暴露
  draft_content/ai_review 欄位），個案一律走 §4.6 的 `get_my_modules()` RPC。

### 4.4 pro_module_review_log（審核軌跡）

欄位：`id, module_id refs, action text CHECK (submitted/approved/rejected/takedown), actor_id uuid,
note text, content_snapshot jsonb, ai_review jsonb, created_at`。
Policies：admin 可讀全部；owner 可讀自己模組的（看退件理由歷程）。INSERT 無 policy
（只由 SECURITY DEFINER RPC 與後端 service key 寫入）。

### 4.5 invite_codes（邀請碼 — 私密金鑰）

```sql
CREATE TABLE IF NOT EXISTS invite_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id  uuid REFERENCES pro_modules(id) ON DELETE CASCADE NOT NULL,
  code       text UNIQUE NOT NULL,
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  revoked_at timestamptz
);
```

- **個案端沒有任何 SELECT policy**（不可枚舉）。owner 可讀自己模組的碼。
- 產生/作廢走 RPC（原子）：

```sql
CREATE OR REPLACE FUNCTION regenerate_invite_code(p_module_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pro_modules WHERE id = p_module_id AND owner_id = auth.uid())
    THEN RAISE EXCEPTION '僅限模組擁有者操作'; END IF;
  UPDATE invite_codes SET is_active = false, revoked_at = now()
    WHERE module_id = p_module_id AND is_active;
  -- 8 碼、排除易混淆字元（0O1IL），約 32^8 ≈ 1.1 兆組合，足以抵擋暴力猜測
  SELECT string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
    (floor(random() * 31) + 1)::int, 1), '') INTO v_code FROM generate_series(1, 8);
  INSERT INTO invite_codes (module_id, code) VALUES (p_module_id, v_code);
  RETURN v_code;
END; $$;
```

- 兌換前預覽（給同意視窗用，只回安全欄位）：`preview_invite_code(p_code text)` SECURITY DEFINER，
  `upper(trim(p_code))` 比對 active 碼 + 模組可用判斷式，回傳
  `json_build_object('module_id', ..., 'title', ..., 'description', ..., 'est_minutes', ...,
  'practitioner_name', (SELECT name FROM profiles WHERE id = owner_id))`；查無 → 回 NULL（前端顯示「邀請碼無效」）。

### 4.6 pro_enrollments（追蹤關係 — 同意的載體）

```sql
CREATE TABLE IF NOT EXISTS pro_enrollments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id       uuid REFERENCES pro_modules(id) ON DELETE CASCADE NOT NULL,
  user_id         uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  practitioner_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL, -- 兌換當下的模組 owner
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','stopped')),
  share_perma     boolean DEFAULT false,   -- 同意視窗中的選擇性勾選
  consented_at    timestamptz DEFAULT now(),
  stopped_at      timestamptz,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (module_id, user_id)
);
```

- 建立**只能**走 `redeem_invite_code(p_code text, p_share_perma boolean)` RPC（SECURITY DEFINER）：
  驗證 active 碼＋模組可用 → upsert enrollment（`ON CONFLICT (module_id, user_id) DO UPDATE SET
  status='active', share_perma=EXCLUDED.share_perma, consented_at=now(), stopped_at=NULL`——
  停止後想恢復＝重新輸入邀請碼＝重新走一次同意，這是刻意設計）→ 回傳模組 json（同 preview 欄位）。
- Policies：本人可讀自己的；專業夥伴可讀 `practitioner_id = auth.uid()` 的；
  本人可更新但 WITH CHECK 鎖 `status = 'stopped'`（**個案只能單向停止**，不能自行重啟）。
- `get_my_modules()` RPC（SECURITY DEFINER，無參數）：回傳 auth.uid() 所有 active enrollment 的
  `json_agg(json_build_object('module_id', m.id, 'title', m.title, 'description', m.description,
  'est_minutes', m.est_minutes, 'published_content', m.published_content, 'published_at', m.published_at,
  'practitioner_name', p.name, 'enrolled_at', e.consented_at))`，僅限可用模組（統一判斷式）。
  個案看模組內容的唯一入口。

### 4.7 pro_entries（個案練習紀錄）

```sql
CREATE TABLE IF NOT EXISTS pro_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id  uuid REFERENCES pro_modules(id) ON DELETE CASCADE NOT NULL,
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  answers    jsonb NOT NULL,        -- { block_id: 回答 }，形狀見 §7
  entry_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pro_entries_module_user_idx ON pro_entries (module_id, user_id, created_at DESC);
```

- Policies：
  - 本人可建立：`auth.uid() = user_id AND EXISTS (active enrollment for this module_id + user_id)`。
  - 本人可讀自己的。
  - 專業夥伴可讀：`EXISTS (SELECT 1 FROM pro_enrollments e WHERE e.module_id = pro_entries.module_id
    AND e.user_id = pro_entries.user_id AND e.practitioner_id = auth.uid() AND e.status = 'active')`
    ——**停止追蹤瞬間，歷史紀錄一併看不到**，這是拍板過的隱私設計，不要「保留歷史存取」。

### 4.8 crisis_alerts（危機警示）

```sql
CREATE TABLE IF NOT EXISTS crisis_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  practitioner_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  module_id       uuid REFERENCES pro_modules(id) ON DELETE CASCADE,
  entry_id        uuid REFERENCES pro_entries(id) ON DELETE CASCADE,
  source          text CHECK (source IN ('keyword','ai')),
  severity        text CHECK (severity IN ('medium','high')) DEFAULT 'high',
  matched_terms   text[] DEFAULT '{}',
  acknowledged_at timestamptz,
  created_at      timestamptz DEFAULT now()
);
```

- Policies：專業夥伴可讀/可更新（`practitioner_id = auth.uid()`；更新用於「我已知悉」）；
  admin 可讀全部；**本人可建立**：`auth.uid() = user_id AND EXISTS (對應的 active enrollment)`
  ——這讓後端掛掉時前端關鍵字 fallback 仍能寫入警示（個案「自舉」警示無濫用價值，可接受）。
  後端主路徑用 service key 寫入（不受 RLS 限制）。

### 4.9 perma_scores 加一條（唯一動到既有表的地方）

```sql
CREATE POLICY "perma_scores: 專業夥伴可讀已同意個案" ON perma_scores FOR SELECT USING (
  EXISTS (SELECT 1 FROM pro_enrollments e
          WHERE e.user_id = perma_scores.user_id AND e.practitioner_id = auth.uid()
            AND e.status = 'active' AND e.share_perma)
);
```

純新增（附 DROP POLICY IF EXISTS），不改任何既有 policy。

## 5. 後端 — `backend/app.py` 新增兩個端點

完全比照既有慣例：`Authorization` header → `get_user_id(token)`、`meter_claude()` 記帳、
prompt 要求只回 JSON、regex 抽 JSON、非 JSON 回 502、`logger.error` + 500。
新增一個 helper：用 service key 查 `user_roles` 確認呼叫者是 practitioner。

### 5.1 `POST /api/pro/submit-module`（送審 = AI 標籤 + 改狀態，一次完成）

Body：`{ "module_id": "..." }`。流程：
1. 驗證 token → user_id；用 service key GET 該 module，確認 `owner_id == user_id`、
   status ∈ {draft, rejected, approved}、`draft_content` 非空。
2. 呼叫 Claude（`claude-sonnet-4-5`，temperature 0.2，max_tokens 1500）審視 `title + description +
   draft_content` 全文。System prompt 要點：你是心理健康 App 的安全審核助手，審核標準以心理學為依據；
   逐項檢查 (a) **心理安全**——羞辱/批判性語言、誘發創傷或自傷意念的引導、對脆弱族群不當的技術、
   誇大療效承諾、危機情境下不當指示；(b) **資訊安全**——要求個案填寫個資（身分證/住址/財務/病歷）、
   引導至站外連結或私下聯絡、任何可能損害個案權益的資料蒐集；(c) **心理學根據**——內容是否有
   可辨識的心理學理論基礎（僅註記，不評分）。只回 JSON：
   `{"risk_level":"low|medium|high","psych_safety":[{"severity":"...","quote":"...","reason":"..."}],
   "info_safety":[...],"psychology_basis_note":"...","summary":"..."}`。
3. **AI 失敗（任何例外）不阻擋送審**：ai_review 存 `{"error": "AI 審核暫時無法使用"}`，照常進人工佇列
   ——AI 是輔助不是守門員（拍板決策）。
4. Service key PATCH module：`ai_review`、`status='pending_review'`、`submitted_at=now()`；
   並 POST 一筆 `pro_module_review_log`（action='submitted'、content_snapshot=draft_content、ai_review）。
5. 回傳 `{"ok": true, "risk_level": ...}`。

### 5.2 `POST /api/pro/entry-safety-check`（危機判讀）

Body：`{ "entry_id": "...", "texts": ["個案這次填寫的所有自由文字"] }`。流程：
1. 驗證 token → user_id；service key 查該 entry 確認 `user_id` 相符，並查對應 active enrollment
   取 practitioner_id / module_id（查無 → 200 回 `{"risk":"none"}`，不硬錯）。
2. **第一層（關鍵字，零成本）**：比對 §8 的保守關鍵字清單。命中 → 直接判 high，**不再呼叫 AI**。
3. **第二層（AI 語意）**：關鍵字未命中才呼叫 Haiku（`claude-haiku-4-5-20251001`，max_tokens 256）：
   「判斷以下文字是否流露自我傷害、自殺意念或嚴重心理危機（含隱晦表達，如告別、交代後事、
   覺得自己是負擔）。寧可誤報、不可漏報。只回 JSON：
   `{"risk":"none|medium|high","reason":"..."}`」。AI 失敗 → 視為 `none`（前端另有 fallback）。
4. risk ≠ none → service key INSERT `crisis_alerts`（source、severity、matched_terms）。
5. 回傳 `{"risk": "...", "matched_terms": [...]}`。前端據此決定是否顯示求助資源視窗。

## 6. 前端 — 個案端

### 6.1 新 lib：`src/lib/proModules.ts`

型別（ProModule、ProBlock、ProEnrollmentInfo…）、RPC 包裝（previewInviteCode、redeemInviteCode、
getMyModules、stopEnrollment=update enrollment status）、後端呼叫（entrySafetyCheck，沿用
`VITE_API_URL` 慣例，見 app.gratitude.tsx:16）、關鍵字清單與 `localCrisisCheck(texts): string[]`
（後端失敗時的 fallback）、模組更新判斷（`localStorage: pro_module_seen_<moduleId>` vs `published_at`）。

### 6.2 首頁「專業模組區」— 改 `src/routes/app.home.tsx` + 新 `src/components/pro/ProModuleSection.tsx`

- 位置：`<WorkshopSection />` 之後、`<TrainingCenter />` 之前，一行插入 `<ProModuleSection />`。
- 區塊視覺仿 WorkshopSection（SectionTitle zh="專業模組區" en="Professional Modules"；
  外層圓角容器可用 `bg-[#B9B078]/45` 之類的既有色票做區隔）。
- 內容：載入 `getMyModules()`。
  - 空狀態文案：「這裡是你與專業夥伴的專屬練習空間。輸入專業夥伴提供的邀請碼，即可解鎖為你設計的模組。」
  - 已解鎖模組 → 卡片列表（title、est_minutes、專業夥伴名、`published_at` 比 localStorage 新 →
    「已更新」badge），點擊 → `/app/pro-module/$moduleId`。
  - 底部固定一列：邀請碼輸入框 + 「解鎖」按鈕（大寫化、trim 後呼叫 previewInviteCode）。
- **同意視窗**（`src/components/pro/ConsentModal.tsx`，preview 成功後彈出）：
  - 顯示：模組名稱、專業夥伴姓名、預估時間、說明。
  - 同意內容逐條列出：「你在此模組的練習紀錄將提供給 {name} 查看」「若練習內容出現高風險訊息，
    系統會同時通知 {name} 並提供你求助資源」「你可以隨時在模組頁面停止追蹤關係，停止後
    {name} 將無法再看到你的任何紀錄」。
  - 選擇性勾選（預設不勾）：「同時分享我的 PERMA 心理測驗結果」→ `share_perma`。
  - 按鈕：「我同意，開始練習」→ redeemInviteCode；「先不要」→ 關閉。
  - track：`pro_module_redeemed`。

### 6.3 模組播放器 — 新路由 `src/routes/app.pro-module.$moduleId.tsx`

- beforeLoad：需登入（比照 /app 已擋）。載入 getMyModules 找到該模組；找不到 → 導回 /app/home。
- 練習中隱藏底部導覽：`src/routes/app.tsx` 的 `isExercise` 條件加上 `|| pathname.startsWith('/app/pro-module')`
  （這是對 app.tsx 唯一的修改）。
- 首次進入且 `published_at` 較新 → 先彈「模組已更新」對話框（「{title} 的內容已由專業夥伴更新，
  以下是最新版本」），關閉時寫入 localStorage seen。
- 渲染 `published_content`（BlockRenderer，見 §7）→ 填答 → 「完成練習」：
  1. INSERT `pro_entries`（answers）。
  2. 呼叫 `entrySafetyCheck`；**失敗則跑 localCrisisCheck**，命中則前端直接 INSERT crisis_alerts
     （RLS 已允許）。任一路徑判定有風險 → 彈 **CrisisResourcesModal**（§8）。
  3. 完成畫面（沿用練習完成的暖色風格）+ 「分享到社群」選項：走既有 `src/lib/communityPost.ts`
     的建立函式，`practice_type='pro_module'`、`payload={ v:'pro_module', module_title, excerpt }`
     （excerpt 取第一個非空文字回答的前 80 字），**item_1/2/3 補空字串 `''`**。
     不標註專業夥伴姓名（拍板決策）。
  4. track：`pro_module_completed`、`pro_module_shared`。
- 頁面右上「⋯」選單：「查看同意內容」（唯讀重現 ConsentModal 資訊）、「停止追蹤關係」→
  確認對話框（紅色警告語氣：「停止後 {name} 將無法看到你的任何練習紀錄，模組也會從你的列表移除。
  若要恢復，需要重新輸入邀請碼。」）→ stopEnrollment → 導回首頁。track：`pro_enrollment_stopped`。
- 社群渲染分支：`src/routes/app.community.tsx` 找到依 `practice_type`/`payload` 分版型的地方，
  加一個 `pro_module` 分支：卡片顯示 module_title 標籤 + excerpt。樣式仿既有貼文卡即可，不要大改。

## 7. 模組內容 JSON 格式（彈性的核心）

```jsonc
{
  "v": 1,
  "intro": "開場引導語（選填）",
  "blocks": [
    { "id": "b1a2", "type": "instruction", "text": "引導文字，不需作答" },
    { "id": "b3c4", "type": "short_text",  "label": "題目", "placeholder": "", "required": true },
    { "id": "b5d6", "type": "long_text",   "label": "題目", "placeholder": "", "required": false },
    { "id": "b7e8", "type": "choice",      "label": "題目", "options": ["A","B"], "multi": false },
    { "id": "b9f0", "type": "scale",       "label": "今天的心情", "min": 1, "max": 5,
      "minLabel": "低落", "maxLabel": "飽滿" },
    { "id": "bg1h", "type": "checklist",   "label": "題目", "options": ["…"] }
  ],
  "outro": "完成後的鼓勵語（選填）"
}
```

- `id` 在建立 block 時產生（`'b' + Math.random().toString(36).slice(2, 8)`），編輯時**不變**，
  answers 以 id 為 key：`{"b3c4": "文字", "b9f0": 4, "b7e8": ["A"], "bg1h": ["…"]}`。
- **前向相容鐵則**：BlockRenderer 遇到未知 `type` → 當 instruction 顯示（若有 text/label），
  絕不 crash。未來加新題型只需要「新增一個 case」。
- BlockRenderer（個案端作答）與 BlockEditor（專業夥伴端編輯）放 `src/components/pro/`，
  admin 審核頁複用 BlockRenderer 的唯讀模式（disabled）。
- 預設模板（`src/lib/proModules.ts` 內建常數，專業夥伴「從模板開始」用）：
  1. **三題引導反思**（仿感恩日記）：instruction + 3 個 long_text。
  2. **每日心情量表**：scale(1–5) + short_text「今天最想記下的一件事」。
  3. **空白模組**：只有 intro/outro 骨架。

## 8. 危機偵測細節

- **關鍵字清單（保守、低誤報）**：
  `自殺、自傷、想死、想不開、不想活、活不下去、結束生命、結束自己、傷害自己、割腕、輕生、尋短、
  想消失、沒有活下去、燒炭、跳樓、了結`。
  （刻意不收「要死」「死了」這類高誤報詞——語意層交給 AI。）清單同時存在後端（第一層）與
  前端 lib（fallback），兩邊註解互相標註「修改時要同步」。
- **CrisisResourcesModal**（`src/components/pro/CrisisResourcesModal.tsx`）：
  - 語氣溫暖、不驚嚇：「謝謝你願意把這些寫下來。看起來你現在承受著不小的辛苦——你不需要
    一個人撐著。」
  - 資源列表（可點擊 `tel:` 連結）：安心專線 **1925**（24 小時）、生命線 **1995**、
    張老師專線 **1980**；「若有立即危險，請撥打 119 或 110」。
  - 附註：「你的專業夥伴也會收到提醒，可能會主動關心你。」（誠實告知，呼應同意內容。）
  - 單一「我知道了」按鈕關閉，**不阻擋**後續流程。
- 專業夥伴端呈現：追蹤頁最上方紅色警示橫幅（`--rust: #a13a1e` 色系）＋每位個案卡片上的
  警示 badge；「標記已知悉」→ update acknowledged_at。頁面載入時查詢即可（MVP 不做 realtime
  訂閱；`/therapist` 開著時每 60 秒 refetch 一次 crisis_alerts 即達到「即時跳出」的體感）。

## 9. 前端 — `/therapist` 與 `/admin`

### 9.1 共同規範

- 檔案：`src/routes/therapist.tsx`、`src/routes/admin.tsx`（**頂層路由**，不在 /app 下 →
  自然沒有底部導覽與 App shell）。自建簡潔頂欄：logo wordmark（`src/assets/ui/logo-wordmark.png`）
  ＋頁面名稱＋登出鈕。
- beforeLoad：`!context.session → redirect /login`。角色檢查在 component 內查 `user_roles`
  （loading 期間顯示既有的 spinner 樣式）。
- 版面：桌機優先。外層 `mx-auto max-w-6xl px-6`，內容用 CSS grid 兩欄（`lg:grid-cols-[280px_1fr]`
  側欄＋主區），窄螢幕自動疊直。全部使用既有 token（bg-background、text-foreground、bg-cream、
  rounded-[22px]、shadow-soft…），觀感必須像同一個產品的「工作台」。
- 隱藏性：不在任何導覽/選單出現連結；一般使用者輸入網址會看到對應的擋牆。

### 9.2 `/therapist`（依角色狀態三態）

1. **非專業夥伴**：申請表單（姓名＊、職稱、服務單位、專業證照/資歷說明、想如何使用本平台），
   送出寫入 practitioner_applications。已有 pending 申請 → 「審核中，通過後這裡會變成你的工作台」。
   被退件 → 顯示 admin_note ＋可重新送出（先 UPDATE 原列回 pending 或建新列——因 user_id UNIQUE，
   做 UPDATE：本人可更新自己 status='rejected' 的申請回 'pending'，SQL 補這條 policy）。
2. **專業夥伴主控台**，側欄三個分頁（state 切換即可，不用巢狀路由）：
   - **我的模組**：卡片列表（title、狀態 badge：草稿/審核中/已上架/已退件/已下架、退件時顯示
     admin_note）。「建立新模組」→ 選模板 → 編輯器。
     **編輯器**：title/description/est_minutes 表單 + BlockEditor（block 列表：新增〔選題型〕、
     刪除、上移/下移、編輯各欄位；右側或下方即時預覽用 BlockRenderer）。「儲存草稿」→
     update_module_draft RPC。「送審」→ 確認對話框（「送審後將由管理員依心理學標準審核，
     通過後個案才能使用新內容」）→ 後端 `/api/pro/submit-module`。已上架模組再編輯時，
     明顯提示：「個案目前使用的是已上架版本；修改內容需重新審核通過後才會生效」。
   - **邀請碼**：每個已上架模組一列——目前有效碼（等寬字體大顯示）、「複製」、「重新產生」
     （確認對話框：「舊的邀請碼將立即失效，尚未加入的個案需使用新碼」→ regenerate_invite_code）。
     未上架模組顯示「模組上架後才能產生邀請碼」。
   - **個案追蹤**：左列 active enrollments（讀 pro_enrollments + profiles.name——個案已在同意
     視窗知情，顯示真名沒問題），每人顯示未讀警示數。點開個案 →
     (a) 未確認的 crisis_alerts 紅色橫幅置頂＋「標記已知悉」；
     (b) 練習統計：總次數、最近 7 天列表；
     (c) 紀錄時間軸：每筆 entry 依模組 blocks 對照渲染答案（scale 顯示數值）；
     (d) 若 share_perma：顯示最新一筆 perma_scores 五力數值（純數字＋label，不畫圖）。
3. track：`therapist_console_opened`、`pro_module_submitted`、`invite_code_regenerated`。

### 9.3 `/admin`

- **非 admin（含未登入後登入的一般人）**：顯示通用「找不到頁面」畫面（不要透露這是管理後台）。
- 主控台側欄四分頁：
  1. **夥伴申請**：pending 佇列（申請欄位全顯示）→ 核准（approve RPC）/退件（輸入理由 → reject RPC）。
  2. **模組審核**：pending_review 佇列。點開 →
     左：模組資訊＋BlockRenderer 唯讀完整內容；
     右：AI 審核面板——risk_level 色票（low=綠 `--tile-mint`、medium=金 `--gold`、high=紅 `--rust`）、
     psych_safety / info_safety 逐條（severity、引文、理由）、psychology_basis_note、summary，
     面板頂部固定註記「AI 標籤僅供參考，最終判斷以人工審核為準」；AI error 時顯示
     「AI 審核未完成，請直接人工審核」。
     動作：「核准上架」（approve_module）/「退回修改」（必填理由 → reject_module）。
  3. **已上架模組**：列表＋「下架」（必填理由 → takedown_module）。
  4. **危機警示總覽**：全部 crisis_alerts 唯讀列表（時間、severity、是否已被專業夥伴知悉），
     供平台方監督。
- track：`admin_module_approved`、`admin_module_rejected`。

## 10. UI 風格規範（給不熟這個 codebase 的你）

- 讀 `src/index.css` 的 `:root` 變數與 `tailwind.config.js` 的 token 映射；配色只用既有變數/色票。
- 參考範本：卡片與區塊排版學 `app.home.tsx`；表單輸入框學 `WorkshopGate.tsx` 的 input 樣式；
  對話框/抽屜學 `app.tsx` 的 Drawer（fixed overlay `bg-[#1c1714]/40` + 圓角面板）。
- 文案一律繁體中文、溫暖不批判；**全站禁用 emoji**（近期有「emoji 全面清理」的 commit，不要倒退）。
- 動畫用既有的 `animate-fade-up`；按鈕 active 縮放用 `active:scale-[0.98]`。
- icon 一律手寫 inline SVG（stroke 風格），仿 app.home.tsx 底部那幾個。

## 11. 明確不做（Out of Scope — 不要手癢）

金流/訂閱、Email 與推播通知（站內提示即可）、專業夥伴↔個案聊天、模組市集/搜尋/公開瀏覽、
PERMA 畫圖表、同意後修改 share_perma 的獨立 UI（重輸邀請碼即可）、邀請碼兌換次數上限、
Realtime 訂閱、多語系、pro_modules 的完整版本歷史（review_log 的快照已夠用）、
危機警示的簡訊/電話通知。

## 12. 執行順序、驗證與交付（嚴格遵守）

1. **開分支**：`git checkout -b feature/pro-modules`。**全程絕不 push main**——main 會自動部署
   到正式站（Vercel 前端＋Render 後端），而新功能依賴的 SQL 只能由使用者早上手動執行，
   先上 main 必壞。
2. 實作順序（每步完成即 commit，訊息沿用 house style：`feat: 中文描述`，結尾加
   `Co-Authored-By` 慣例行）：
   1. `supabase/pro_modules.sql`（§4 全部）
   2. `backend/app.py` 兩端點（§5）＋ `python3 -m py_compile backend/app.py` 通過
   3. `src/lib/proModules.ts` ＋ `src/components/pro/`（BlockRenderer/BlockEditor/ConsentModal/
      CrisisResourcesModal/ProModuleSection）
   4. 個案端（home 插區塊、`app.pro-module.$moduleId.tsx`、app.tsx isExercise 一行、
      community 渲染分支）
   5. `therapist.tsx`
   6. `admin.tsx`
   7. 收尾：本計劃書旁新增 `docs/plans/pro_modules_result.md`（做了什麼、跳過什麼、
      所有 TODO(pro-modules) 清單、給使用者的啟用清單=§13 複製過去）
3. **每個 commit 前**：`npm run build`（含 tsc）與 `npm run lint` 必須全綠。routeTree.gen.ts
   由 build/dev 自動更新，隨 commit 一起進版。
4. 不需要也**不要**：跑任何 SQL、部署、建 .env、裝新 npm 套件（若真的必要，先停下來寫進
   result.md 的「需要使用者決定」清單，用替代方案繼續）。
5. 完成後 `git push -u origin feature/pro-modules`。

## 13. 使用者隔天早上的啟用清單（寫進 result.md）

1. 在 Supabase Dashboard > SQL Editor 執行 `supabase/pro_modules.sql`。
2. 把自己設為 admin（SQL Editor）：
   ```sql
   INSERT INTO user_roles (user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'love2002yy@gmail.com'
   ON CONFLICT DO NOTHING;
   ```
3. Review 分支後 merge `feature/pro-modules` → main（自動部署前後端）。
4. 冒煙測試：用第二個帳號在 `/therapist` 申請 → admin 帳號核准 → 建模組（用模板）→ 送審 →
   `/admin` 核准 → 產生邀請碼 → 用第三個帳號（或無痕）兌換、同意、練習一次 → 回 `/therapist`
   看追蹤紀錄 → 再練習一次並在答案中輸入「最近常常想消失」→ 確認個案端跳出求助資源、
   `/therapist` 出現紅色警示。

## 14. 已知風險與刻意取捨（給審核者與未來的自己）

- AI review 由後端以 service key 寫入，專業夥伴無法竄改；但 AI 只是標籤，漏判由人工審核兜底。
- 個案可自建 crisis_alerts（fallback 路徑）：只影響自己的專業夥伴收到多餘關心，無濫用價值。
- 邀請碼 8 碼無兌換次數上限：測試期可接受；若未來開放註冊量大，再加嘗試次數限制表。
- 停止追蹤＝歷史紀錄同步斷讀取；資料本身保留在 DB（個案本人仍可讀），未做刪除權（未來 GDPR
  類需求再議）。
- `/therapist`、`/admin` 靠「不可見＋角色擋牆」隱藏，URL 本身不是秘密——安全性完全由 RLS 承擔，
  這是正確的假設（前端擋牆只是 UX）。
