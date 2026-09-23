-- ============================================================
-- user_intake（入門偏好問卷）
-- 歡迎導覽之後、InMind 測驗之前的 6 題點選問卷，一人一列。
-- 記錄「為什麼來、想要什麼、能給多少」，跟 perma_scores（狀態分數）互補。
-- 設計說明見 docs/plans/intake_persona_survey_plan.md。
-- 整份可重複執行；請貼到 Supabase SQL Editor 跑。
-- ============================================================
CREATE TABLE IF NOT EXISTS user_intake (
  user_id        uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  issues         text[]  DEFAULT '{}',   -- Q1：stress / mood / sleep / relationship / direction / self / curious（最多 2）
  load_level     text,                   -- Q2：ok / tired / hard / unsure
  goal           text,                   -- Q3：habit / emotion / partner / track
  tried          text[]  DEFAULT '{}',   -- Q4：journal / meditation / exercise / friends / consult / none
  daily_minutes  int,                    -- Q5：3 / 5 / 10；0 = 看那天心情；null = 未作答
  format_pref    text,                   -- Q6：write / listen / tap / any
  identity       text,                   -- （保留給下一版）student / worker / caregiver / freelancer / other
  age_band       text,                   -- （保留給下一版）18-24 / 25-34 / 35-44 / 45+
  remind_slot    text,                   -- （保留給下一版）morning / noon / night / none
  version        int     DEFAULT 1,      -- 題目改版時往上加，分析時才對得起來
  skipped        boolean DEFAULT false,  -- 整份跳過也留一列，之後不再問
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE user_intake ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_intake: 本人可讀"   ON user_intake;
DROP POLICY IF EXISTS "user_intake: 本人可建立" ON user_intake;
DROP POLICY IF EXISTS "user_intake: 本人可更新" ON user_intake;

CREATE POLICY "user_intake: 本人可讀"   ON user_intake FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_intake: 本人可建立" ON user_intake FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_intake: 本人可更新" ON user_intake FOR UPDATE USING (auth.uid() = user_id);
