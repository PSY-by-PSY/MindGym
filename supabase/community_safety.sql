-- ============================================================
-- MindGym — 社群安全（檢舉 reports / 封鎖 blocks）
-- App Store 審查指南 1.2（UGC）要求：① 檢舉冒犯內容 ② 封鎖騷擾使用者。
-- 可重複執行（idempotent）：CREATE IF NOT EXISTS + DROP POLICY IF EXISTS。
-- 在 Supabase Dashboard > SQL Editor 執行此檔案。
--
-- 設計沿用最新慣例：前端以 anon key + RLS 直接寫入（auth.uid() = xxx_id），
-- 後端不碰這些資料表。
-- ============================================================

-- ============================================================
-- reports（檢舉貼文 / 留言）
-- 一筆檢舉指向一則貼文（entry_id）或一則留言（comment_id），擇一。
-- reported_user_id 記下被檢舉內容的作者（後台審核用，不回傳給前端顯示，
-- 因此不會破壞匿名貼文的匿名性）。reasons 存原因 code 陣列。
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  target_type      text NOT NULL CHECK (target_type IN ('entry', 'comment')),
  entry_id         uuid REFERENCES gratitude_entries(id) ON DELETE CASCADE,
  comment_id       uuid REFERENCES comments(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reasons          text[] NOT NULL DEFAULT '{}',
  note             text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_created_idx ON reports (created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports: 本人可建立"     ON reports;
DROP POLICY IF EXISTS "reports: 本人可讀自己的" ON reports;

-- 只允許已登入者檢舉自己送出的紀錄；不開放讀別人的檢舉。
CREATE POLICY "reports: 本人可建立"     ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports: 本人可讀自己的" ON reports FOR SELECT USING (auth.uid() = reporter_id);

-- ============================================================
-- blocks（封鎖使用者）
-- blocker 封鎖 blocked 後，前端載入封鎖名單並過濾掉對方的貼文與留言。
-- blocked_label 記下封鎖當下畫面上顯示的名稱（匿名代號或實名），供
-- 個人檔案「封鎖名單」顯示 —— 避免直接撈對方 profiles.name 而外洩匿名貼文背後的真名。
-- ============================================================
CREATE TABLE IF NOT EXISTS blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id    uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  blocked_id    uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  blocked_label text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS blocks_blocker_idx ON blocks (blocker_id);

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks: 本人可讀"   ON blocks;
DROP POLICY IF EXISTS "blocks: 本人可建立" ON blocks;
DROP POLICY IF EXISTS "blocks: 本人可刪除" ON blocks;

CREATE POLICY "blocks: 本人可讀"   ON blocks FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "blocks: 本人可建立" ON blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocks: 本人可刪除" ON blocks FOR DELETE USING (auth.uid() = blocker_id);

-- ============================================================
-- 以下為 2026-09-07 補上的「審查指南 1.2 缺口」。
--
-- 送審回饋指出兩件事，這兩件正是 1.2 四項要求裡我們原本沒做的：
--   ① 內容發佈路徑直接寫進資料庫，沒有任何預先過濾
--      → moderation_rules + enforce_content_moderation() 觸發器（本檔下方）。
--        擋在資料庫而不是只擋前端：前端用 anon key + RLS 直接打 PostgREST，
--        只擋前端等於沒擋。
--   ② reports 只有檢舉者自己讀得到，沒有任何後台可以處理
--      → admin 讀寫政策 + admin_review_queue()／admin_resolve_reports() RPC
--        + 管理後台「檢舉處理」分頁（src/routes/admin.tsx）。
--        另加 24 小時內處理所需的：自動隱藏、內容下架、發文者停權。
--
-- 第二輪回饋（同日）再補一項：
--   ③ 規則刻意跳過所有自傷字詞，導致「大家都去自殺吧」這種鼓勵他人自殺的公開內容
--      不命中任何規則，照樣發得出去，與服務條款第四節的零容忍互相矛盾。
--      → category='self_harm_promotion' + action='hide'（立即隱藏 + 自動送審），
--        以及使用者檢舉原因「鼓勵自傷或自殺」單人即隱藏。
--        私人書寫與第一人稱的痛苦完全不受影響——那一條界線在下方規則區有完整說明。
--
-- 一樣可重複執行。相依：pro_modules.sql 的 is_admin()（請先跑那支）。
-- ============================================================

-- ============================================================
-- moderation_rules（違規字詞規則）
--
-- 為什麼放在資料表而不是寫死在函式裡：1.2 要求「24 小時內處理檢舉並移除違規者」，
-- 遇到新的洗版字詞時，管理員要能當下加一條規則、立刻生效，不必等一次 deploy。
--
-- pattern 是 PostgreSQL 正則（~* 比對，大小寫不敏感）。
-- normalized = true 時比對的是「拿掉空白與分隔符號」後的字串，防「幹 你 娘」「幹.你.娘」
-- 這類拆字規避；中文規則都用這個。
-- action：'block' 直接擋下不寫入；'hide' 照常寫入但立刻隱藏並排進後台待審；
--         'flag' 照常發佈並排進後台待審。
--
-- ⚠️ 下方 seed 與前端 src/lib/contentFilter.ts 的 RULES 必須一字不差
--    （前端那層只是提早給使用者回饋，真正把關的是這裡）。改一邊要同步另一邊。
--
-- 自傷字眼的界線（重要，別再一句話帶過）：
--   第一人稱的痛苦——「我不想活了」「我活不下去」——一個字都不擋。這是心理健康 App，
--   那是我們要接住的時刻，擋掉只會讓人學會不寫；那條路走 crisis_alerts／危機資源引導。
--   但「鼓勵、教唆、指導、美化他人自傷或自殺」是另一回事：「大家都去自殺吧」「教你無痛自殺」
--   不是求助，是傷害別人，而且只發生在公開內容裡。這類用 category='self_harm_promotion'
--   + action='hide'（見本檔最下方「鼓勵自傷／自殺」一節），對應服務條款第四節的零容忍。
-- ============================================================
CREATE TABLE IF NOT EXISTS moderation_rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern    text NOT NULL UNIQUE,
  category   text NOT NULL CHECK (category IN ('hate', 'harassment', 'sexual', 'violence', 'spam', 'self_harm_promotion')),
  action     text NOT NULL CHECK (action IN ('block', 'hide', 'flag')),
  normalized boolean NOT NULL DEFAULT true,
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE moderation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "moderation_rules: admin 可讀"   ON moderation_rules;
DROP POLICY IF EXISTS "moderation_rules: admin 可新增" ON moderation_rules;
DROP POLICY IF EXISTS "moderation_rules: admin 可更新" ON moderation_rules;
DROP POLICY IF EXISTS "moderation_rules: admin 可刪除" ON moderation_rules;

-- 一般使用者連讀都不行：規則清單被讀走等於拿到規避字典。
CREATE POLICY "moderation_rules: admin 可讀"   ON moderation_rules FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "moderation_rules: admin 可新增" ON moderation_rules FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "moderation_rules: admin 可更新" ON moderation_rules FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "moderation_rules: admin 可刪除" ON moderation_rules FOR DELETE USING (is_admin(auth.uid()));

INSERT INTO moderation_rules (pattern, category, action, normalized) VALUES
  ('支那|台巴子|死黑鬼|死同性戀|死gay|死玻璃|人妖|殘廢廢物', 'hate', 'block', true),
  ('nigger|faggot|chink|tranny', 'hate', 'block', false),
  ('幹你娘|幹您娘|干你娘|操你媽|操你妈|肏你|去你媽|婊子|賤人|賤貨|王八蛋|下賤胚|腦殘|智障', 'harassment', 'block', true),
  ('fuck\s*you|bitch|asshole|retard', 'harassment', 'block', false),
  ('白癡|白痴|靠北|靠腰|廢物|滾開|閉嘴', 'harassment', 'flag', true),
  ('約砲|約炮|一夜情|裸聊|援交|買春|嫖妓|色情片|情色網|做愛影片|自慰片|口交|肛交|a片|av女優', 'sexual', 'block', true),
  ('porn|nudes|sexcam', 'sexual', 'block', false),
  ('殺了你|殺你全家|砍死你|弄死你|打死你|捅死你|你去死|滾去死|去死吧', 'violence', 'block', true),
  ('加賴|賴id|加line|lineid|微信號|博弈|娛樂城|百家樂|六合彩|包養|代辦貸款|刷單|兼職日結|保證獲利|穩賺不賠', 'spam', 'block', true)
ON CONFLICT (pattern) DO NOTHING;

-- ============================================================
-- 鼓勵自傷／自殺（category='self_harm_promotion', action='hide'）
--
-- 為什麼獨立成一節：這是 2026-09-07 第二輪送審回饋抓到的洞。原本的規則把「自傷」
-- 整類跳過，理由是「使用者寫『我不想活了』要接住不要擋」——那個理由對**私人書寫**成立，
-- 對**公開內容**不成立。「大家都去自殺吧」不會命中仇恨、騷擾或暴力任何一條，
-- 卻直接違反服務條款第四節「鼓勵自我傷害、自殺、飲食失調或其他危險行為」的零容忍。
--
-- 三個設計決定：
--   ① 只針對「指向他人」的措辭：教唆（你去自殺）、教學（無痛自殺方法）、美化（自殺是解脫）、
--      揪團（相約自殺）。第一人稱的痛苦（我不想活了／我好想消失）一律不在規則裡——
--      比對過每一條 pattern 都必須含第二人稱、祈使、教學或揪團的成分。
--   ② action 用 'hide' 而不是 'block'：審查回饋要的是「flag + 立即隱藏 + 人工審核」。
--      block 會 RAISE EXCEPTION，交易回滾，等於什麼證據都不留、也沒有人審；
--      hide 讓內容寫進 DB 但公開動態牆看不到（RLS 只放行 moderation_status='ok'），
--      同時自動開一筆 source='auto' 的檢舉進後台佇列，管理員可再 remove + 停權。
--   ③ 一樣只作用在公開內容：兩支觸發器開頭都對 is_shared IS NOT TRUE 直接 RETURN。
--      私人日記寫什麼都不會命中這裡。
--
-- ⚠️ 與 src/lib/contentFilter.ts 的 RULES 一字不差，改一邊要同步另一邊。
-- ============================================================

-- 既有資料庫的 CHECK 還是舊的（CREATE TABLE IF NOT EXISTS 不會重建），先放寬。
ALTER TABLE moderation_rules DROP CONSTRAINT IF EXISTS moderation_rules_category_check;
ALTER TABLE moderation_rules ADD  CONSTRAINT moderation_rules_category_check
  CHECK (category IN ('hate', 'harassment', 'sexual', 'violence', 'spam', 'self_harm_promotion'));
ALTER TABLE moderation_rules DROP CONSTRAINT IF EXISTS moderation_rules_action_check;
ALTER TABLE moderation_rules ADD  CONSTRAINT moderation_rules_action_check
  CHECK (action IN ('block', 'hide', 'flag'));

INSERT INTO moderation_rules (pattern, category, action, normalized) VALUES
  -- 教唆他人（全部帶第二人稱或祈使／複數指涉）
  ('你去自殺|妳去自殺|你們去自殺|大家去自殺|大家都去自殺|一起去自殺|一起自殺|去自殺吧|快去自殺|建議你自殺|勸你自殺|你該自殺|你就自殺|你們都去死|大家都去死|全部都去死|一起去死|你不如去死|你不如死一死|你死一死|你死了比較好|世界少一個你|你活著只是浪費|沒人需要你活著|你這種人就該去死',
   'self_harm_promotion', 'hide', true),
  -- 方法教學（不論人稱都不該公開流傳）
  ('自殺方法|自殺教學|自殺攻略|自殺懶人包|怎麼自殺|怎樣自殺|如何自殺|無痛自殺|最快自殺|自殘方法|自殘教學|割腕方法|割腕教學|上吊方法|上吊教學|燒炭方法|燒炭教學|燒炭懶人包|致死劑量|吃幾顆會死|吃多少會死|跳樓教學|催吐教學|催吐方法|絕食教學',
   'self_harm_promotion', 'hide', true),
  -- 美化與揪團
  ('自殺是解脫|自殺才是解脫|自殘很爽|割腕很爽|鼓勵自殺|揪團自殺|揪人自殺|相約自殺|約自殺|自殺互助|求死同伴|一起走的夥伴|想死的一起',
   'self_harm_promotion', 'hide', true),
  -- 英文／網路用語（含 pro-ana 等飲食失調鼓吹）
  ('kill\s*your\s*self|kill\s*urself|(^|[^a-z])kys([^a-z]|$)|go\s*kill\s*yourself|hang\s*yourself|slit\s*your\s*wrist|end\s*your\s*life|you\s*should\s*die|suicide\s*method|how\s*to\s*(kill\s*yourself|commit\s*suicide)|painless\s*(suicide|death)|best\s*way\s*to\s*die|self\s*-?\s*harm\s*tips|pro\s*-?\s*ana|pro\s*-?\s*mia|thinspo',
   'self_harm_promotion', 'hide', false)
ON CONFLICT (pattern) DO NOTHING;

-- 正規化：拿掉空白、零寬字元與常見拆字分隔符號並轉小寫。
-- 與前端 contentFilter.ts 的 normalize() 是同一組字元。
CREATE OR REPLACE FUNCTION moderation_normalize(txt text) RETURNS text
LANGUAGE sql IMMUTABLE AS
$$ SELECT regexp_replace(lower(coalesce(txt, '')), E'[[:space:]._*·、,，~^\u200B\u200C\u200D\uFEFF-]', '', 'g') $$;

-- 回傳一段文字命中的所有規則，block 排在前面（呼叫端取第一筆即為最嚴重的處置）。
CREATE OR REPLACE FUNCTION moderation_verdict(txt text)
RETURNS TABLE (action text, category text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT r.action, r.category
  FROM moderation_rules r
  WHERE r.enabled
    AND (CASE WHEN r.normalized THEN moderation_normalize(txt) ELSE lower(coalesce(txt, '')) END) ~* r.pattern
  ORDER BY CASE r.action WHEN 'block' THEN 0 WHEN 'hide' THEN 1 ELSE 2 END, r.category
$$;

-- ============================================================
-- user_suspensions（停權）
-- 1.2 要求「移除違規的使用者」。停權期間不能發貼文也不能留言；
-- 已發佈的內容由 admin 另外下架（admin_resolve_reports）。
-- until = NULL 代表永久停權。
-- ============================================================
CREATE TABLE IF NOT EXISTS user_suspensions (
  user_id    uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  reason     text,
  until      timestamptz,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_suspensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_suspensions: 本人可讀"    ON user_suspensions;
DROP POLICY IF EXISTS "user_suspensions: admin 可讀"  ON user_suspensions;

-- 本人讀得到自己的（前端可顯示「你目前無法發文，原因…」）；寫入一律走 RPC。
CREATE POLICY "user_suspensions: 本人可讀"   ON user_suspensions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_suspensions: admin 可讀" ON user_suspensions FOR SELECT USING (is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION is_suspended(uid uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
$$ SELECT EXISTS (
     SELECT 1 FROM user_suspensions
     WHERE user_id = uid AND (until IS NULL OR until > now())
   ) $$;

-- ============================================================
-- 內容審核欄位：貼文與留言都可能被下架
--   'ok'      正常顯示
--   'hidden'  被檢舉／自動隱藏，公開動態牆看不到（作者自己仍看得到，避免他以為資料不見了）
--   'removed' 管理員確認違規後下架，等同刪除但保留證據供後續申訴／舉證
-- ============================================================
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'ok';
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS moderated_at      timestamptz;
ALTER TABLE gratitude_entries ADD COLUMN IF NOT EXISTS moderation_note   text;
ALTER TABLE comments          ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'ok';
ALTER TABLE comments          ADD COLUMN IF NOT EXISTS moderated_at      timestamptz;
ALTER TABLE comments          ADD COLUMN IF NOT EXISTS moderation_note   text;

-- 讀取政策要跟著改，否則「下架」只是資料庫欄位、動態牆照樣看得到。
-- ⚠️ 這兩條政策在 schema.sql 也有一份完全相同的定義（那支是建表主檔），
--    改一處要同步另一處，否則重跑 schema.sql 會讓已下架的內容重見天日。
DROP POLICY IF EXISTS "gratitude_entries: is_shared 資料公開可讀" ON gratitude_entries;
CREATE POLICY "gratitude_entries: is_shared 資料公開可讀" ON gratitude_entries
  FOR SELECT USING (is_shared = true AND moderation_status = 'ok');

DROP POLICY IF EXISTS "comments: 已登入可讀" ON comments;
CREATE POLICY "comments: 已登入可讀" ON comments
  FOR SELECT USING (auth.uid() IS NOT NULL AND (moderation_status = 'ok' OR user_id = auth.uid()));

-- ============================================================
-- 發佈前過濾（本檔的核心）
--
-- BEFORE INSERT/UPDATE：命中 block 規則就 RAISE EXCEPTION，資料根本進不了表。
-- 錯誤訊息前綴 CONTENT_BLOCKED:，前端 contentFilter.ts 的 toContentBlockedError()
-- 靠它把 SQL 錯誤翻成人話。
--
-- 只檢查「會被別人看到」的內容：
--   gratitude_entries 只在 is_shared = true 時檢查——私人日記寫什麼是使用者的事，
--   審查私人書寫只會讓人學會不寫，違背這個 App 的目的。
--   comments 一律檢查（留言沒有私人模式）。
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_content_moderation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_text    text;
  v_action  text;
  v_category text;
BEGIN
  IF TG_TABLE_NAME = 'gratitude_entries' THEN
    IF NEW.is_shared IS NOT TRUE THEN RETURN NEW; END IF;
    -- payload 欄位在部分環境可能還沒建立（process_goal.sql 未跑），
    -- 用 to_jsonb(NEW) 取值，欄位不存在就是 NULL，不會讓觸發器整個炸掉。
    v_text := concat_ws(' ', NEW.item_1, NEW.item_2, NEW.item_3, to_jsonb(NEW) ->> 'payload');
  ELSE
    v_text := NEW.content;
  END IF;

  -- 停權中的使用者不得發佈新的公開內容（1.2：移除違規者）。
  -- 注意這段在上面「私人日記直接放行」之後：被停權的人仍然寫得了私人日記——
  -- 他失去的是社群，不是這個 App 本來要給他的心理健康工具。
  --
  -- 除了新建，「把舊的私人貼文改成公開」也要擋（否則停權期間照樣能發文，
  -- 只要先存私人再切公開就行了）；但改回私人、改內容、刪除都放行，
  -- 讓他仍能收拾自己的東西。
  IF is_suspended(NEW.user_id)
     AND (TG_OP = 'INSERT' OR (TG_TABLE_NAME = 'gratitude_entries' AND OLD.is_shared IS NOT TRUE))
  THEN
    RAISE EXCEPTION 'CONTENT_BLOCKED: suspended 帳號目前因違反社群守則被暫停發文';
  END IF;

  SELECT v.action, v.category INTO v_action, v_category FROM moderation_verdict(v_text) v LIMIT 1;
  IF v_action = 'block' THEN
    RAISE EXCEPTION 'CONTENT_BLOCKED: % 內容違反社群守則', v_category;
  END IF;

  -- 'hide'：寫得進去，但一出生就是隱藏狀態，公開動態牆看不到
  -- （RLS 只放行 moderation_status = 'ok'；作者自己仍讀得到，不會以為資料不見）。
  -- 對應的待審紀錄由 AFTER 觸發器 autoflag_content() 開，兩支合起來才是
  -- 「flag + 立即隱藏 + 人工審核」。
  --
  -- 這裡刻意不 RAISE：一來要留下證據給人審與累犯判斷，二來不告訴發文者
  -- 「哪個字被抓到」，否則規則清單等於公開，換個寫法就繞過去了。
  IF v_action = 'hide' THEN
    NEW.moderation_status := 'hidden';
    NEW.moderated_at      := now();
    NEW.moderation_note   := format('系統自動隱藏待審（%s）', v_category);
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_moderate_entries  ON gratitude_entries;
DROP TRIGGER IF EXISTS trg_moderate_comments ON comments;

CREATE TRIGGER trg_moderate_entries
  BEFORE INSERT OR UPDATE OF item_1, item_2, item_3, is_shared ON gratitude_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_content_moderation();

CREATE TRIGGER trg_moderate_comments
  BEFORE INSERT OR UPDATE OF content ON comments
  FOR EACH ROW EXECUTE FUNCTION enforce_content_moderation();

-- ============================================================
-- reports 升級：從「只能寫進去的黑洞」變成「可被處理的佇列」
--
-- 原本只有兩條政策（本人可建立、本人可讀自己的），沒有任何角色讀得到全部，
-- 也沒有狀態欄位——等於檢舉送出去就沒有下文，這正是 1.2 被退件的原因之一。
-- ============================================================
ALTER TABLE reports ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'pending';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS source      text NOT NULL DEFAULT 'user';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution  text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_note  text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- 自動標記（moderation_rules 的 flag 級）沒有檢舉者，所以 reporter_id 要能為 NULL。
ALTER TABLE reports ALTER COLUMN reporter_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE reports ADD CONSTRAINT reports_status_check
    CHECK (status IN ('pending', 'actioned', 'dismissed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE reports ADD CONSTRAINT reports_source_check
    CHECK (source IN ('user', 'auto'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status, created_at DESC);

-- 同一個人對同一則內容只能檢舉一次：否則一個人就能把別人的貼文洗到自動隱藏。
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_entry
  ON reports (reporter_id, entry_id) WHERE reporter_id IS NOT NULL AND entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_comment
  ON reports (reporter_id, comment_id) WHERE reporter_id IS NOT NULL AND comment_id IS NOT NULL;

-- 自動開單（reporter_id IS NULL）不受上面兩個索引管，同一則內容每被編輯一次就會多一筆。
-- 只對「還沒處理」的自動單去重：結案後內容又被改成違規，仍然要重新開單。
-- 先清掉既有重複，索引才建得起來（保留最早那筆，時間戳決定 24 小時 SLA）。
DELETE FROM reports r USING reports keep
 WHERE r.source = 'auto' AND keep.source = 'auto'
   AND r.status = 'pending' AND keep.status = 'pending'
   AND r.entry_id IS NOT NULL AND keep.entry_id = r.entry_id
   AND (keep.created_at, keep.id) < (r.created_at, r.id);

DELETE FROM reports r USING reports keep
 WHERE r.source = 'auto' AND keep.source = 'auto'
   AND r.status = 'pending' AND keep.status = 'pending'
   AND r.comment_id IS NOT NULL AND keep.comment_id = r.comment_id
   AND (keep.created_at, keep.id) < (r.created_at, r.id);

CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_auto_entry
  ON reports (entry_id)   WHERE source = 'auto' AND status = 'pending' AND entry_id   IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_auto_comment
  ON reports (comment_id) WHERE source = 'auto' AND status = 'pending' AND comment_id IS NOT NULL;

DROP POLICY IF EXISTS "reports: 本人可建立"     ON reports;
DROP POLICY IF EXISTS "reports: admin 可讀全部" ON reports;
DROP POLICY IF EXISTS "reports: admin 可更新"   ON reports;

-- 建立時強制 source='user'：'auto' 只有觸發器（SECURITY DEFINER）能寫。
CREATE POLICY "reports: 本人可建立" ON reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id AND source = 'user');
CREATE POLICY "reports: admin 可讀全部" ON reports FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "reports: admin 可更新"   ON reports FOR UPDATE USING (is_admin(auth.uid()));

-- ============================================================
-- 自動排進待審佇列：
--   'flag'  照常發佈，只是排隊等人看（輕度髒話用這級，避免誤殺）。
--   'hide'  BEFORE 觸發器已經把內容設成 hidden，這裡補上那筆待審紀錄——
--           「立即隱藏 + 人工審核」的後半段。
-- 兩級都不是機器判死：最終 remove／restore／停權都由管理員在後台按。
--
-- 為什麼也掛 AFTER UPDATE：最容易繞過的路徑是「先存私人、之後改成公開」，
-- 或是發完再把內容編輯成違規。BEFORE 觸發器在那兩條路上都會重跑並隱藏，
-- 但如果這裡只有 AFTER INSERT，佇列裡就會沒有那一筆，變成靜靜隱藏、沒人審。
-- 重複開單由下面的 reports_unique_auto_* 唯一索引擋掉（只擋 pending 的，
-- 所以結案後又被改成違規內容還是會重新開單）。
-- ============================================================
CREATE OR REPLACE FUNCTION autoflag_content() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_text     text;
  v_action   text;
  v_category text;
  v_note     text;
BEGIN
  IF TG_TABLE_NAME = 'gratitude_entries' THEN
    IF NEW.is_shared IS NOT TRUE THEN RETURN NEW; END IF;
    v_text := concat_ws(' ', NEW.item_1, NEW.item_2, NEW.item_3, to_jsonb(NEW) ->> 'payload');
  ELSE
    v_text := NEW.content;
  END IF;

  -- moderation_verdict 已依嚴重度排序（block > hide > flag），取第一筆非 block 的。
  SELECT v.action, v.category INTO v_action, v_category
    FROM moderation_verdict(v_text) v WHERE v.action IN ('hide', 'flag') LIMIT 1;
  IF v_action IS NULL THEN RETURN NEW; END IF;

  v_note := CASE v_action
    WHEN 'hide' THEN '系統自動隱藏並送人工審核（鼓勵自傷／自殺等高風險內容）'
    ELSE '系統自動標記（輕度違規字詞）'
  END;

  IF TG_TABLE_NAME = 'gratitude_entries' THEN
    INSERT INTO reports (reporter_id, source, target_type, entry_id, reported_user_id, reasons, note)
    VALUES (NULL, 'auto', 'entry', NEW.id, NEW.user_id, ARRAY[v_category], v_note)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO reports (reporter_id, source, target_type, comment_id, reported_user_id, reasons, note)
    VALUES (NULL, 'auto', 'comment', NEW.id, NEW.user_id, ARRAY[v_category], v_note)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_autoflag_entries  ON gratitude_entries;
DROP TRIGGER IF EXISTS trg_autoflag_comments ON comments;

CREATE TRIGGER trg_autoflag_entries
  AFTER INSERT OR UPDATE OF item_1, item_2, item_3, is_shared ON gratitude_entries
  FOR EACH ROW EXECUTE FUNCTION autoflag_content();

CREATE TRIGGER trg_autoflag_comments
  AFTER INSERT OR UPDATE OF content ON comments
  FOR EACH ROW EXECUTE FUNCTION autoflag_content();

-- ============================================================
-- 自動隱藏：同一則內容被 2 個「不同使用者」檢舉就先下架，等人審。
--
-- 1.2 要求 24 小時內處理檢舉。管理員睡覺的時候也要有人擋著，
-- 所以門檻低一點、先隱藏（不是刪除），審完覺得沒問題再 restore。
-- 系統自動標記（source='auto'）不計入，那一級本來就只是排進佇列。
--
-- 例外：檢舉原因含 'self_harm_promotion'（鼓勵自傷或自殺）時門檻降到 1 人。
-- 這一類的傷害在「等第二個人檢舉」的期間就已經造成，且字詞規則不可能窮舉，
-- 使用者的眼睛是最後一道網。誤報的成本只是內容暫時看不到、管理員按 restore；
-- 漏接的成本不對等。注意這只認 'self_harm_promotion'，不認 'self_harm'——
-- 後者是「擔心這個人有自傷風險」的關懷型檢舉，隱藏一則求助貼文正好是反效果。
-- ============================================================
CREATE OR REPLACE FUNCTION autohide_reported_content() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
  v_threshold int := 2;
BEGIN
  IF NEW.reporter_id IS NOT NULL AND NEW.reasons @> ARRAY['self_harm_promotion'] THEN
    v_threshold := 1;
  END IF;

  IF NEW.target_type = 'entry' AND NEW.entry_id IS NOT NULL THEN
    SELECT count(DISTINCT reporter_id) INTO v_count
      FROM reports WHERE entry_id = NEW.entry_id AND reporter_id IS NOT NULL;
    IF v_count >= v_threshold THEN
      UPDATE gratitude_entries
        SET moderation_status = 'hidden',
            moderated_at = now(),
            moderation_note = CASE WHEN v_threshold = 1
              THEN '檢舉為鼓勵自傷／自殺，系統立即隱藏待審'
              ELSE '多人檢舉，系統自動隱藏待審' END
        WHERE id = NEW.entry_id AND moderation_status = 'ok';
    END IF;
  ELSIF NEW.target_type = 'comment' AND NEW.comment_id IS NOT NULL THEN
    SELECT count(DISTINCT reporter_id) INTO v_count
      FROM reports WHERE comment_id = NEW.comment_id AND reporter_id IS NOT NULL;
    IF v_count >= v_threshold THEN
      UPDATE comments
        SET moderation_status = 'hidden',
            moderated_at = now(),
            moderation_note = CASE WHEN v_threshold = 1
              THEN '檢舉為鼓勵自傷／自殺，系統立即隱藏待審'
              ELSE '多人檢舉，系統自動隱藏待審' END
        WHERE id = NEW.comment_id AND moderation_status = 'ok';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_autohide_reported ON reports;
CREATE TRIGGER trg_autohide_reported
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION autohide_reported_content();

-- ============================================================
-- 管理後台用的 RPC
--
-- 為什麼不讓前端直接 SELECT reports 再各自 join：被檢舉的內容本身讀不到
-- （已隱藏的貼文／留言被 RLS 擋住，這正是我們要的），所以必須用 SECURITY DEFINER
-- 把「檢舉 + 內容 + 作者」一次組好給後台。函式第一行就檢查 is_admin。
--
-- 佇列以「被檢舉的內容」為單位聚合，不是一筆檢舉一列——
-- 同一則貼文被十個人檢舉，管理員要看到的是一件事、處理一次。
-- ============================================================
CREATE OR REPLACE FUNCTION admin_review_queue(p_status text DEFAULT 'pending', p_limit int DEFAULT 200)
RETURNS TABLE (
  target_type       text,
  target_id         uuid,
  author_id         uuid,
  author_name       text,
  author_suspended  boolean,
  content_preview   text,
  moderation_status text,
  report_count      bigint,
  auto_flagged      boolean,
  reasons           text[],
  notes             text[],
  first_reported_at timestamptz,
  last_reported_at  timestamptz,
  report_ids        uuid[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;

  RETURN QUERY
  SELECT
    r.target_type,
    coalesce(r.entry_id, r.comment_id)                        AS target_id,
    (array_agg(r.reported_user_id) FILTER (WHERE r.reported_user_id IS NOT NULL))[1] AS author_id,
    max(p.name)                                               AS author_name,
    bool_or(is_suspended(r.reported_user_id))                 AS author_suspended,
    -- 被檢舉的到底是什麼內容：貼文取三個 item，留言取 content。
    max(coalesce(
      nullif(concat_ws(' / ', e.item_1, nullif(e.item_2, ''), nullif(e.item_3, '')), ''),
      c.content
    ))                                                        AS content_preview,
    max(coalesce(e.moderation_status, c.moderation_status))   AS moderation_status,
    count(DISTINCT r.id)                                      AS report_count,
    bool_or(r.source = 'auto')                                AS auto_flagged,
    array_agg(DISTINCT reason)  FILTER (WHERE reason IS NOT NULL)          AS reasons,
    array_agg(DISTINCT r.note)  FILTER (WHERE nullif(r.note, '') IS NOT NULL) AS notes,
    min(r.created_at)                                         AS first_reported_at,
    max(r.created_at)                                         AS last_reported_at,
    array_agg(DISTINCT r.id)                                  AS report_ids
  FROM reports r
  -- 把 reasons 陣列攤平才能跨多筆檢舉去重；代價是同一筆檢舉會變成多列，
  -- 所以下面的計數與 id 聚合都要加 DISTINCT。
  LEFT JOIN LATERAL unnest(r.reasons) AS reason ON true
  LEFT JOIN gratitude_entries e ON e.id = r.entry_id
  LEFT JOIN comments          c ON c.id = r.comment_id
  LEFT JOIN profiles          p ON p.id = r.reported_user_id
  WHERE (p_status = 'all' OR r.status = p_status)
  GROUP BY r.target_type, coalesce(r.entry_id, r.comment_id)
  ORDER BY min(r.created_at) ASC   -- 最久沒處理的排最前面（24 小時 SLA 看這個）
  LIMIT p_limit;
END; $$;

-- 處理一件檢舉：
--   'hide'    先隱藏（可回復）
--   'remove'  確認違規，下架
--   'restore' 誤報／自動隱藏後確認沒問題，放回動態牆
--   'dismiss' 內容沒問題，只把檢舉標記為已處理（不改內容狀態）
-- 一律連同該內容的所有 pending 檢舉一起結案，避免同一件事被處理兩次。
CREATE OR REPLACE FUNCTION admin_resolve_reports(
  p_target_type text,
  p_target_id   uuid,
  p_action      text,
  p_note        text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  IF p_action NOT IN ('hide', 'remove', 'restore', 'dismiss') THEN
    RAISE EXCEPTION '不支援的處置：%', p_action;
  END IF;

  v_status := CASE p_action
    WHEN 'hide'    THEN 'hidden'
    WHEN 'remove'  THEN 'removed'
    WHEN 'restore' THEN 'ok'
    ELSE NULL
  END;

  IF v_status IS NOT NULL THEN
    IF p_target_type = 'entry' THEN
      UPDATE gratitude_entries
        SET moderation_status = v_status, moderated_at = now(), moderation_note = p_note
        WHERE id = p_target_id;
    ELSE
      UPDATE comments
        SET moderation_status = v_status, moderated_at = now(), moderation_note = p_note
        WHERE id = p_target_id;
    END IF;
  END IF;

  UPDATE reports
    SET status      = CASE WHEN p_action = 'dismiss' THEN 'dismissed' ELSE 'actioned' END,
        resolution  = p_action,
        admin_note  = p_note,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE status = 'pending'
      AND ((p_target_type = 'entry'   AND entry_id   = p_target_id)
        OR (p_target_type = 'comment' AND comment_id = p_target_id));
END; $$;

-- 停權／解除停權。p_days = NULL 代表永久。
CREATE OR REPLACE FUNCTION admin_suspend_user(p_user_id uuid, p_days int, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  IF is_admin(p_user_id) THEN RAISE EXCEPTION '不能停權管理員'; END IF;
  INSERT INTO user_suspensions (user_id, reason, until, created_by)
  VALUES (
    p_user_id,
    p_reason,
    CASE WHEN p_days IS NULL THEN NULL ELSE now() + make_interval(days => p_days) END,
    auth.uid()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET reason = EXCLUDED.reason, until = EXCLUDED.until,
        created_by = EXCLUDED.created_by, created_at = now();
END; $$;

CREATE OR REPLACE FUNCTION admin_unsuspend_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION '僅限管理員操作'; END IF;
  DELETE FROM user_suspensions WHERE user_id = p_user_id;
END; $$;

-- 待處理檢舉數（後台分頁上的紅點；不必把整個佇列撈下來）。
CREATE OR REPLACE FUNCTION admin_pending_report_count()
RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
$$ SELECT count(*) FROM reports WHERE is_admin(auth.uid()) AND status = 'pending' $$;
