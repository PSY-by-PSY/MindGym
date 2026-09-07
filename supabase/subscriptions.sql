-- ─────────────────────────────────────────────────────────────────────────
-- 訂閱方案、遠端價格設定、付費意願量測與伺服器端權益判斷
--
-- 設計原則（這份檔案的靈魂）：
--   **權益一律由伺服器計算，client 端改任何本機狀態都不能解鎖功能。**
--   為此：
--     1. subscriptions 完全不開放 INSERT/UPDATE policy —— 只能經
--        set_user_subscription() 這支 is_admin() 把關的 SECURITY DEFINER RPC 寫入。
--        使用者連自己的訂閱層級都改不了。
--     2. 權益計算走 get_my_entitlements()（SECURITY DEFINER），對象固定是
--        auth.uid()，不吃任何 client 傳進來的身分參數。
--     3. 社群「貢獻換觀看」直接改寫 gratitude_entries 的 RLS policy——
--        未解鎖者就算繞過前端直接下 query 也拿不到完整清單。
--     4. 週分析額度與基線重測額度另在 backend/app.py 用已驗證的 JWT 再擋一次
--        （那兩個動作要花 AI token，必須在生成前就擋掉）。
--
-- 這階段**不接金流**：付費牆 CTA 寫入 paywall_intents 量測付費意願。
--
-- ⚠️ 2026-09-01 起改為「**全功能對所有登入者開放**」（產品決策）：
--      * is_pro() 對任何登入者恆真 —— 社群不再有觀看則數上限、AI 分析不再有份數上限。
--      * 「創始成員」（is_founding_member）降級為**純標籤／徽章**，不再牽動任何權益。
--        它只出現在 get_my_entitlements() 的回傳與貼文徽章上。
--      * paywall_intents 仍照常寫入 —— 付費意願量測還要繼續，只是不再拿來開通權益。
--    因此上面第 1、2 點對「付費權益」暫時失去意義（沒有東西需要被鎖）。
--    第 3 點的社群 RLS 與第 4 點的 AI 額度**機制仍在原地**，只是判斷式現在恆真，
--    要收回限制時改 is_pro() 一處即可。
--    ⚠️ 接上真實金流前，is_pro() 必須改回只認 subscriptions。
--
-- ⚠️ 依賴 pro_modules.sql 已建立的 is_admin(uid)，請確認該檔已先執行過。
-- ⚠️ 金額一律以「分」儲存並記錄幣別（規格 §6）。
-- ─────────────────────────────────────────────────────────────────────────

-- ============================================================
-- 1. subscriptions —— 每人一列，這階段由管理員手動設定
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id            uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  tier               text NOT NULL DEFAULT 'free'   CHECK (tier   IN ('free', 'pro', 'pass')),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'grace', 'canceled', 'expired')),
  is_founding_member boolean NOT NULL DEFAULT false,
  price_plan_code    text,          -- 鎖價用：記下訂閱當下的方案代碼
  started_at         timestamptz,
  expires_at         timestamptz,   -- NULL = 無到期日
  granted_by         uuid REFERENCES profiles(id),
  note               text,          -- 管理員備註（例如「社群成員 早鳥」）
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_founding_idx ON subscriptions (is_founding_member) WHERE is_founding_member = true;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions: 本人可讀自己的" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions: admin 可讀全部"  ON subscriptions;

-- 只有 SELECT policy。刻意「不」建立任何 INSERT/UPDATE/DELETE policy：
-- 寫入一律走 set_user_subscription() RPC，使用者無法自行升級自己。
CREATE POLICY "subscriptions: 本人可讀自己的" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "subscriptions: admin 可讀全部" ON subscriptions
  FOR SELECT USING (is_admin(auth.uid()));

-- ============================================================
-- 2. pricing_config —— 遠端價格（改價不需要送審）
-- ============================================================
CREATE TABLE IF NOT EXISTS pricing_config (
  plan_code             text PRIMARY KEY,           -- 'pro_monthly' | 'pro_yearly'
  period                text NOT NULL CHECK (period IN ('month', 'year')),
  amount_cents          integer NOT NULL,           -- 標準定價（分）
  founding_amount_cents integer,                    -- 創始會員價（分）；NULL = 無優惠
  currency              text NOT NULL DEFAULT 'TWD',
  is_active             boolean NOT NULL DEFAULT true,
  sort_order            integer NOT NULL DEFAULT 0, -- 小的排前面（年繳在上）
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

-- 付費牆在未登入情境也可能需要顯示價格，開放 anon + authenticated 讀。
DROP POLICY IF EXISTS "pricing_config_public_read" ON pricing_config;
CREATE POLICY "pricing_config_public_read" ON pricing_config FOR SELECT USING (true);

-- 初始價格（規格 §1.2）。NT$150 → 15000 分。
INSERT INTO pricing_config (plan_code, period, amount_cents, founding_amount_cents, sort_order) VALUES
  ('pro_yearly',  'year',  118800, 79000, 0),
  ('pro_monthly', 'month',  15000,  9900, 1)
ON CONFLICT (plan_code) DO NOTHING;

-- ============================================================
-- 3. paywall_config —— 單列設定（創始名額、變體）
-- ============================================================
CREATE TABLE IF NOT EXISTS paywall_config (
  id                   integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  founding_quota_total integer NOT NULL DEFAULT 500,   -- 規格 §1.2：前 500 名
  founding_enabled     boolean NOT NULL DEFAULT true,
  variant              text NOT NULL DEFAULT 'A' CHECK (variant IN ('A', 'B')),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 補欄位（冪等）：未貢獻的免費會員在社群能看幾則。
-- 做成設定值而非寫死，之後要調整只要 UPDATE 這一格，不用改程式碼也不用重新部署。
ALTER TABLE paywall_config ADD COLUMN IF NOT EXISTS free_view_limit integer NOT NULL DEFAULT 15;

ALTER TABLE paywall_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "paywall_config_public_read" ON paywall_config;
CREATE POLICY "paywall_config_public_read" ON paywall_config FOR SELECT USING (true);

INSERT INTO paywall_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. paywall_intents —— 付費意願量測（這階段取代金流）
-- ============================================================
CREATE TABLE IF NOT EXISTS paywall_intents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  plan_code  text NOT NULL,
  variant    text,
  source     text,          -- 'onboarding' | 'settings' | 'soft_paywall'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paywall_intents_created_idx ON paywall_intents (created_at DESC);
-- is_pro() 每次都要問「這個人點過付費按鈕沒有」，沒有這個索引會全表掃描。
CREATE INDEX IF NOT EXISTS paywall_intents_user_idx ON paywall_intents (user_id);

ALTER TABLE paywall_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "paywall_intents: 本人可建立" ON paywall_intents;
DROP POLICY IF EXISTS "paywall_intents: admin 可讀"  ON paywall_intents;

-- 使用者只能寫自己的 intent，不能讀（含自己的）——這是給我們看的量測資料。
CREATE POLICY "paywall_intents: 本人可建立" ON paywall_intents
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "paywall_intents: admin 可讀" ON paywall_intents
  FOR SELECT USING (is_admin(auth.uid()));

-- ============================================================
-- 5. Helper functions
--    全部 SECURITY DEFINER STABLE + SET search_path = public，
--    沿用 pro_modules.sql 的 is_admin()/is_practitioner() 慣例。
-- ============================================================

-- 是否享有付費權益。
--
-- ⚠️ 2026-09-01 起：**所有登入者一律享有完整權益**（產品決策，見檔案開頭）。
--    社群觀看則數上限、AI 週分析份數上限都由這支函式推導出來，所以這裡回 true
--    就等於「全部功能開放給所有人」，不必逐條去拆各處的限制邏輯。
--
--    這也代表「創始成員」（subscriptions.is_founding_member）與「點過付費按鈕」
--    （paywall_intents）**都不再影響權益**：
--      * 創始成員現在只是一個標籤／徽章，給貼文與個人頁顯示用。
--      * paywall_intents 仍照常寫入，只作為付費意願的量測資料。
--
--    ⚠️ 要恢復付費分層（接金流時）只要把這支換回下面被註解掉的原始判斷即可，
--       呼叫端（community_unlocked / weekly_analysis_period_start /
--       get_my_entitlements）都不用動。後端 backend/app.py 的
--       _subscription_tier() 是同一條規則的另一份實作，**必須一起改**。
--
--    原始判斷（保留備查）：
--      SELECT EXISTS (SELECT 1 FROM paywall_intents WHERE user_id = uid)
--        OR EXISTS (SELECT 1 FROM subscriptions WHERE user_id = uid
--                     AND (is_founding_member
--                          OR (tier IN ('pro','pass')
--                              AND status IN ('trialing','active','grace')
--                              AND (expires_at IS NULL OR expires_at > now()))))
CREATE OR REPLACE FUNCTION is_pro(uid uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT uid IS NOT NULL
$$;

-- 社群是否已解鎖：付費會員恆真；免費會員本週發過 ≥1 則分享紀錄即解鎖當週。
-- 週界用 date_trunc('week')（Postgres 的週一），與前端 reviews.ts 的 mondayOf 一致。
-- 用 created_at 而非 entry_date：entry_date 可回填，用它會讓人補寫舊日期就解鎖。
CREATE OR REPLACE FUNCTION community_unlocked(uid uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT uid IS NOT NULL AND (
    is_pro(uid)
    OR EXISTS (
      SELECT 1 FROM gratitude_entries
      WHERE user_id = uid
        AND is_shared = true
        AND created_at >= date_trunc('week', now())
    )
  )
$$;

-- 創始會員剩餘名額 —— 連動真實資料（規格 §5.3 明令不可為固定或假遞減的數字）。
CREATE OR REPLACE FUNCTION founding_seats_remaining() RETURNS integer
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT GREATEST(0,
    COALESCE((SELECT founding_quota_total FROM paywall_config WHERE id = 1), 0)
    - (SELECT count(*)::int FROM subscriptions WHERE is_founding_member = true)
  )
$$;

-- 本期已使用的 AI 週分析份數。
--   免費層：以「當月」為週期，上限 1（規格 §1.1，每月 1 日重置）
--   付費層：以「當週」為週期，上限 1（規格 §1.2）
-- 刻意用「數既有報告」推導而非另建 quota 表：不需要重置排程、不會計數漂移，
-- 「每月 1 日重置」由期間邊界自然成立。
CREATE OR REPLACE FUNCTION weekly_analysis_period_start(uid uuid) RETURNS timestamptz
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT CASE WHEN is_pro(uid) THEN date_trunc('week', now()) ELSE date_trunc('month', now()) END
$$;

-- ⚠️ 這支把兩種報告合起來數，只給 get_my_entitlements() 回傳「大概用了幾份」
--    當參考資訊用（目前前端未消費此欄位）。**真正決定某份報告要不要上鎖的是
--    backend/app.py 的 _annotate_review_lock()，那裡是「每種報告各自計算」**——
--    因為 gratitude_weekly 與 weekly_digest 同一週經常並存，合併計數會把後生成
--    的那份誤判成超額。要拿這個數字做任何把關之前，請先改成同樣的 per-type 邏輯。
CREATE OR REPLACE FUNCTION weekly_analysis_used(uid uuid) RETURNS integer
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT count(*)::int FROM pro_reviews
  WHERE user_id = uid
    AND review_type IN ('gratitude_weekly', 'weekly_digest')
    AND created_at >= weekly_analysis_period_start(uid)
$$;

-- ============================================================
-- 6. get_my_entitlements() —— client 唯一的權益來源
--    對象固定 auth.uid()，不接受任何身分參數。
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_entitlements() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  uid          uuid := auth.uid();
  v_tier       text := 'free';
  v_status     text := 'active';
  v_founding   boolean := false;
  v_expires    timestamptz;
  v_pro        boolean;
  v_limit      integer;
  v_used       integer;
  v_perma_used integer;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('tier', 'anonymous', 'is_pro', false);
  END IF;

  -- 查無訂閱列 = 免費層（絕大多數既有使用者），不可報錯。
  SELECT s.tier, s.status, s.is_founding_member, s.expires_at
    INTO v_tier, v_status, v_founding, v_expires
  FROM subscriptions s WHERE s.user_id = uid;
  IF NOT FOUND THEN
    v_tier := 'free'; v_status := 'active'; v_founding := false;
  END IF;

  v_pro   := is_pro(uid);
  -- ⚠️ 2026-09-01 起 AI 分析不再有份數上限（見檔案開頭）。-1 代表「不限」，
  --    另外附上 unlimited 旗標讓前端不必去解讀這個數字。
  v_limit := -1;
  v_used  := weekly_analysis_used(uid);

  SELECT count(*)::int INTO v_perma_used FROM perma_scores WHERE user_id = uid;

  RETURN jsonb_build_object(
    'tier',               v_tier,
    'status',             v_status,
    'is_pro',             v_pro,
    -- ⚠️ 純標籤：只給貼文徽章／個人頁顯示用，**不影響任何權益**（見 is_pro()）。
    'is_founding_member', v_founding,
    'expires_at',         v_expires,
    'weekly_analysis', jsonb_build_object(
      'period',       CASE WHEN v_pro THEN 'week' ELSE 'month' END,
      'period_start', weekly_analysis_period_start(uid),
      'unlimited',    true,
      'limit',        v_limit,    -- -1 = 不限
      'used',         v_used,
      'remaining',    -1
    ),
    'community', jsonb_build_object(
      'unlimited',             v_pro,
      'unlocked',              community_unlocked(uid),
      'contributed_this_week', EXISTS (
        SELECT 1 FROM gratitude_entries
        WHERE user_id = uid AND is_shared = true AND created_at >= date_trunc('week', now())
      ),
      -- 未貢獻時能看幾則，讀 paywall_config；查不到設定時保守退回 15。
      'free_view_limit', COALESCE((SELECT free_view_limit FROM paywall_config WHERE id = 1), 15)
    ),
    'baseline_assessment', jsonb_build_object(
      'used',          v_perma_used,
      'can_retake',    true   -- 暫不限制重測次數，免費層也能無限重測
    ),
    -- 月報告／趨勢／成長對照這些功能目前尚未實作，先預留旗標供日後接上。
    'can_view_trends', v_pro,
    'can_view_growth_comparison', v_pro
  );
END; $$;

-- ============================================================
-- 7. 社群「貢獻換觀看」—— RLS 改寫 + 預覽 RPC
-- ============================================================

-- 改寫既有的「is_shared 資料公開可讀」policy：加上解鎖判斷。
-- 「本人可讀」policy 保留不動，且 PERMISSIVE policy 之間是 OR，
-- 所以自己的紀錄永遠讀得到，不受解鎖狀態影響。
DROP POLICY IF EXISTS "gratitude_entries: is_shared 資料公開可讀" ON gratitude_entries;
CREATE POLICY "gratitude_entries: is_shared 資料公開可讀" ON gratitude_entries
  FOR SELECT USING (is_shared = true AND community_unlocked(auth.uid()));

-- 未解鎖者的免費預覽：回最新 N 則分享紀錄，N 讀 paywall_config.free_view_limit。
-- SECURITY DEFINER 以繞過上面的 policy；筆數上限由伺服器決定，client 傳不進來也改不掉。
--
-- ⚠️ COALESCE 的位置很重要：paywall_config 若沒有那一列，子查詢會是 NULL，
--    而 Postgres 的 LIMIT NULL 等同「不限筆數」——那會讓未解鎖者看到全部貼文。
--    所以一定要在進 LIMIT 前就把 NULL 收掉。
CREATE OR REPLACE FUNCTION get_community_preview() RETURNS SETOF gratitude_entries
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT * FROM gratitude_entries
  WHERE is_shared = true
  ORDER BY created_at DESC
  LIMIT (SELECT COALESCE((SELECT free_view_limit FROM paywall_config WHERE id = 1), 15))
$$;

-- ============================================================
-- 8. Admin RPC —— 手動開通權益（這階段取代金流）
-- ============================================================

CREATE OR REPLACE FUNCTION set_user_subscription(
  p_user_id         uuid,
  p_tier            text,
  p_status          text,
  p_is_founding     boolean,
  p_price_plan_code text DEFAULT NULL,
  p_expires_at      timestamptz DEFAULT NULL,
  p_note            text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;

  INSERT INTO subscriptions (user_id, tier, status, is_founding_member, price_plan_code, started_at, expires_at, granted_by, note, updated_at)
    VALUES (p_user_id, p_tier, p_status, p_is_founding, p_price_plan_code, now(), p_expires_at, auth.uid(), p_note, now())
  ON CONFLICT (user_id) DO UPDATE
    SET tier               = EXCLUDED.tier,
        status             = EXCLUDED.status,
        is_founding_member = EXCLUDED.is_founding_member,
        price_plan_code    = EXCLUDED.price_plan_code,
        -- started_at 只在第一次設定時寫入，保留原始開通時間
        started_at         = COALESCE(subscriptions.started_at, EXCLUDED.started_at),
        expires_at         = EXCLUDED.expires_at,
        granted_by         = EXCLUDED.granted_by,
        note               = EXCLUDED.note,
        updated_at         = now();
END; $$;

-- ============================================================
-- 8.1 創始成員審核通過 → 自動推播通知本人
--    沿用 push_notifications.sql 已經建好的 APNs 基礎建設
--    （device_tokens、notify_push_on_interaction()、push-notify Edge Function），
--    不需要重新設定任何金鑰——只是多接一張表的 trigger。
--    push-notify/index.ts 已經加了 table === 'subscriptions' 的分支。
--    ⚠️ 依賴 push_notifications.sql 已先執行過（notify_push_on_interaction 存在）。
-- ============================================================

-- set_user_subscription() 是 upsert：第一次核准通常是「新增一列、is_founding_member
-- 直接是 true」（INSERT），之後在訂閱管理手動改動才是「既有列從 false 改成 true」（UPDATE）。
-- 分成兩支 trigger 是因為同一支 trigger 不能在 INSERT 事件裡合法引用 OLD。
DROP TRIGGER IF EXISTS subscriptions_founding_insert_push ON subscriptions;
DROP TRIGGER IF EXISTS subscriptions_founding_update_push ON subscriptions;

CREATE TRIGGER subscriptions_founding_insert_push
  AFTER INSERT ON subscriptions
  FOR EACH ROW WHEN (NEW.is_founding_member = true)
  EXECUTE FUNCTION notify_push_on_interaction();

CREATE TRIGGER subscriptions_founding_update_push
  AFTER UPDATE OF is_founding_member ON subscriptions
  FOR EACH ROW WHEN (NEW.is_founding_member = true AND OLD.is_founding_member IS DISTINCT FROM true)
  EXECUTE FUNCTION notify_push_on_interaction();

-- /admin →「訂閱管理」用：依姓名或 email 搜尋使用者並帶出訂閱狀態。
CREATE OR REPLACE FUNCTION admin_search_subscriptions(p_query text DEFAULT '')
RETURNS TABLE (
  user_id uuid, name text, email text,
  tier text, status text, is_founding_member boolean,
  expires_at timestamptz, note text, updated_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  RETURN QUERY
    SELECT p.id, p.name, u.email::text,
           COALESCE(s.tier, 'free'), COALESCE(s.status, 'active'),
           COALESCE(s.is_founding_member, false),
           s.expires_at, s.note, s.updated_at
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN subscriptions s ON s.user_id = p.id
    WHERE p_query = ''
       OR p.name  ILIKE '%' || p_query || '%'
       OR u.email ILIKE '%' || p_query || '%'
    ORDER BY s.updated_at DESC NULLS LAST, p.created_at DESC
    LIMIT 50;
END; $$;

CREATE OR REPLACE FUNCTION update_pricing_config(
  p_plan_code text, p_amount_cents integer, p_founding_amount_cents integer, p_is_active boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  UPDATE pricing_config
     SET amount_cents = p_amount_cents,
         founding_amount_cents = p_founding_amount_cents,
         is_active = p_is_active,
         updated_at = now()
   WHERE plan_code = p_plan_code;
END; $$;

CREATE OR REPLACE FUNCTION update_paywall_config(
  p_founding_quota_total integer, p_founding_enabled boolean, p_variant text,
  p_free_view_limit integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  UPDATE paywall_config
     SET founding_quota_total = p_founding_quota_total,
         founding_enabled = p_founding_enabled,
         variant = p_variant,
         -- 沒傳就沿用現值，避免呼叫端漏傳時意外把上限歸零
         free_view_limit = COALESCE(p_free_view_limit, free_view_limit),
         updated_at = now()
   WHERE id = 1;
END; $$;

-- ============================================================
-- 9. 社群封頂區塊與創始成員徽章
-- ============================================================

-- 未解鎖者滑到底時顯示「還有 N 則故事你還沒看到」用的總數。
--
-- ⚠️ 為什麼需要這支函式：未解鎖者被 RLS 擋著，自己下 count 查詢只會拿到
--    預覽的那幾筆，數不出真實總數。這裡用 SECURITY DEFINER 繞過 policy 只回
--    「一個數字」——不洩漏任何貼文內容，但足以誠實告訴使用者還有多少沒看到。
--
-- 篩選條件與前端動態牆一致（排除工作坊貼文，它們在另一個分頁聚合）。
CREATE OR REPLACE FUNCTION community_shared_total() RETURNS integer
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT count(*)::int FROM gratitude_entries
  WHERE is_shared = true
    AND (practice_type IS NULL
         OR practice_type NOT IN ('workshop_authentic_self', 'workshop_last_day', 'workshop_woop'))
$$;

-- 創始成員的 user_id 清單，供社群貼文掛「創始成員」徽章。
--
-- 這是「公開徽章」的資料來源，所以刻意開放給所有登入者讀取——
-- subscriptions 表本身的 RLS 只允許本人與 admin 讀，一般使用者看不到別人的
-- 訂閱層級；這支函式只回傳「誰是創始成員」這一項，不洩漏 tier／狀態／到期日。
-- 名額上限 500，全量回傳成本很低，前端抓一次建成 Set 即可。
CREATE OR REPLACE FUNCTION founding_member_user_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT user_id FROM subscriptions WHERE is_founding_member = true
$$;

-- /admin →「訂閱管理」用：列出創始成員申請（付費牆 CTA 的點擊紀錄）。
-- 帶出申請者目前是否已核准（is_founding_member），讓後台能一眼看出待處理的。
CREATE OR REPLACE FUNCTION admin_list_paywall_intents(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid, user_id uuid, name text, email text,
  plan_code text, source text, created_at timestamptz,
  is_founding_member boolean, tier text
) LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  RETURN QUERY
    SELECT i.id, i.user_id, p.name, u.email::text,
           i.plan_code, i.source, i.created_at,
           COALESCE(s.is_founding_member, false), COALESCE(s.tier, 'free')
    FROM paywall_intents i
    JOIN profiles p ON p.id = i.user_id
    JOIN auth.users u ON u.id = i.user_id
    LEFT JOIN subscriptions s ON s.user_id = i.user_id
    ORDER BY i.created_at DESC
    LIMIT p_limit;
END; $$;

-- 待處理的申請數（後台分頁上的紅點數字）：申請過、但還沒被設為創始成員的人數。
CREATE OR REPLACE FUNCTION admin_pending_intent_count() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  RETURN (
    SELECT count(DISTINCT i.user_id)::int
    FROM paywall_intents i
    LEFT JOIN subscriptions s ON s.user_id = i.user_id
    WHERE COALESCE(s.is_founding_member, false) = false
  );
END; $$;
