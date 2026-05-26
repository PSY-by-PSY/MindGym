# MindGym × InMind 整合計畫

> 這份文件是給新對話使用的完整上下文。閱讀完就能直接開始實作，不需要額外說明。

---

## 專案背景

有兩個獨立專案：

| 專案 | 路徑 | 品牌 | 定位 |
|---|---|---|---|
| **MindGym**（主 App） | `/Users/houjiaan/Documents/MindGym` | MindGym / PSY by PSY | 日常心理練習 App（React + TanStack Router + Supabase） |
| **MindGym_PreTest** | `/Users/houjiaan/Documents/MindGym_PreTest` | **InMind**（心理健康的 InBody） | 獨立前測工具，對外推廣中（React SPA，無 Router） |

**⚠️ MindGym_PreTest 資料夾完全不能動**，因為它目前還在獨立對外推廣中。

---

## 整合目標

MindGym 的 `/onboarding` 路由目前是一個 5 題假選擇題問卷，要把它整個換成 InMind 的完整敘事問卷流程（5 題開放式問答 → AI 分析 → 個人化報告）。

使用者流程變成：
```
新用戶進入 App
  → 自動導向 /onboarding
  → 看到 InMind 品牌的 INTRO 畫面（保留 PSY by PSY 品牌）
  → 回答 5 道 PERMA 開放式問題（每題至少 30 字，支援語音輸入）
  → AI 分析 loading 動畫
  → 看到完整的 InMind 報告（含雷達圖、食物體型、名人匹配等）
  → 點「開始第一次練習」→ 導向 /app/gratitude
```

重新評估流程（Profile 頁的「重新評估」按鈕）：
```
/onboarding?reassess=true
  → 跑完整個 InMind 流程
  → 新增一筆 perma_scores（保留歷史，不覆蓋）
  → 完成後導向 /app/home
```

---

## 所有決定（已確認，直接照做）

| # | 決定 | 結果 |
|---|---|---|
| 1 | 分數格式 | **四捨五入成整數**存進 perma_scores（`round(3.8)` → `4`），不需要動資料庫 |
| 2 | 後端策略 | **整合進 MindGym 的 `app.py`**，把 `/api/report` 和 `/api/transcribe` 從 PreTest 後端移植過來 |
| 3 | 報告結束 CTA | 「開始第一次練習」→ navigate 到 `/app/gratitude` |
| 4 | 語音輸入 | **保留**（MindGym 後端需要加 OPENAI_API_KEY，使用者另外自己在 Render 上設定） |
| 5 | 品牌 | **保留 PSY by PSY / InMind 品牌**（logo、大標題都留著） |
| 6 | 重新評估 | **新增一筆**（不覆蓋），完成後去 `/app/home` |

---

## 技術架構現況

### MindGym 後端（`app.py`）
- FastAPI，已有端點：`/api/perma`、`/api/gratitude-summary`、`/api/gratitude-save`、`/api/gratitude`、`/api/extract-keywords`
- Auth 模式：用 `get_user_id(token)` 從 Supabase 驗證 Bearer token 取得 user_id
- 環境變數：`SUPABASE_URL`, `SUPABASE_KEY`, `ANTHROPIC_API_KEY`
- **缺少**：`openai`、`slowapi`、`python-multipart` 套件（requirements.txt 還沒有）

### PreTest 後端（`MindGym_PreTest/app.py`）
- 有完整的 `/api/report`（Claude 分析 + 組裝報告）和 `/api/transcribe`（Whisper 語音）
- 這兩個端點的完整邏輯要移植到 MindGym 的 `app.py`

### Supabase Schema（`supabase/schema.sql`）
```sql
-- perma_scores（分數存整數 1-5）
CREATE TABLE perma_scores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id),
  p_score     int CHECK (p_score BETWEEN 1 AND 5),
  e_score     int CHECK (e_score BETWEEN 1 AND 5),
  r_score     int CHECK (r_score BETWEEN 1 AND 5),
  m_score     int CHECK (m_score BETWEEN 1 AND 5),
  a_score     int CHECK (a_score BETWEEN 1 AND 5),
  created_at  timestamptz DEFAULT now()
);
```

### 圖片 Assets
使用者**已手動複製**（或即將複製）下列檔案從 `MindGym_PreTest/public/assets/` 到 `MindGym/public/assets/`：
- `bagel.png`, `brain-lifter.png`, `psy-by-psy-logo.png`, `logo-wordmark.png`
- `food-bagel.png`, `food-toast.png`, `food-marshmallow.png`
- `celeb-劉德華.jpg`, `celeb-吳季剛.jpg`, `celeb-吳寶春.jpg`, `celeb-周杰倫.jpg`
- `celeb-張惠妹.jpg`, `celeb-盧廣仲.jpg`, `celeb-蔡康永.jpg`, `celeb-蔣勳.jpg`
- `celeb-謝哲青.jpg`, `celeb-陳綺貞.jpg`, `celebrity.jpg`

---

## 實作任務清單

### 任務 1：更新 `requirements.txt`

在 `MindGym/requirements.txt` 加入：
```
openai>=1.0.0
slowapi>=0.1.9
python-multipart>=0.0.9
```

---

### 任務 2：更新 MindGym 後端（`app.py`）

在現有的 `MindGym/app.py` 基礎上新增：

#### 2-A 新增 imports 和初始化
```python
import io
import math
import openai
from fastapi import File, UploadFile, Request
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
```

並初始化：
- `openai_client = OpenAI()` （OPENAI_API_KEY 從環境變數讀取，失敗時 graceful degradation）
- `limiter = Limiter(key_func=...)` 同 PreTest 的設計

#### 2-B 移植 `/api/report` 端點

從 `MindGym_PreTest/app.py` 完整移植，但改動：

1. **NarrativeAnswers model 拿掉 `email`**：
   ```python
   class NarrativeAnswers(BaseModel):
       P: str
       E: str
       R: str
       M: str
       A: str
       # email 欄位移除，因為 App 使用者已登入
   ```

2. **加上 auth**：endpoint 簽名改成：
   ```python
   @app.post("/api/report")
   async def generate_report(
       answers: NarrativeAnswers,
       authorization: str = Header(...),
   ):
       token = authorization.removeprefix("Bearer ").strip()
       user_id = await get_user_id(token)
       # ... 其餘邏輯不變
   ```

3. **報告產出後，儲存到 perma_scores**（取代原本的 `reports` table）：
   ```python
   # 在 response_data 組裝完之後
   await db().post(
       f"{SUPABASE_REST}/perma_scores",
       headers=SUPABASE_HEADERS,
       json={
           "user_id": user_id,
           "p_score": round(scores_dict["P"]),
           "e_score": round(scores_dict["E"]),
           "r_score": round(scores_dict["R"]),
           "m_score": round(scores_dict["M"]),
           "a_score": round(scores_dict["A"]),
       },
   )
   ```
   （失敗不要讓整個 endpoint 炸，加 try/except）

4. 完整移植以下邏輯（不需要改動）：
   - `CELEB_POOL` 名人池（10 位，對應 `public/assets/celeb-*.jpg`）
   - `SYSTEM_PROMPT`（含 celeb_list 格式化）
   - `InMindLLMResponse` Pydantic 結構
   - `compute_body_type()`, `compute_balance()`, `compute_percentile()`
   - `DIMENSION_TEMPLATES` 和 `build_constitution_advice()`, `build_advanced_analysis()`, `build_take_action()`
   - response_data 的組裝邏輯

#### 2-C 移植 `/api/transcribe` 端點

從 `MindGym_PreTest/app.py` 完整複製，**不需要加 auth**（語音輸入是匿名的，rate limiting 已足夠）。

移植內容：
- `_MAX_AUDIO_BYTES = 10 * 1024 * 1024`
- `_ALLOWED_AUDIO_TYPES` set
- `_client_ip()` helper
- limiter 設定和 exception handler
- `@app.post("/api/transcribe")` 完整 endpoint

---

### 任務 3：建立前測組件目錄

建立 `MindGym/src/components/pretest/`，放入以下檔案：

#### 3-A `types.ts`
從 `MindGym_PreTest/src/types/index.ts` 複製，但修改 `NarrativeAnswers`：
```typescript
export interface NarrativeAnswers {
  P: string
  E: string
  R: string
  M: string
  A: string
  // email 欄位移除
}
```
其他 interface 全部保留（`InMindReport`, `PermaScores`, `DimensionAnalysis` 等）。

#### 3-B `IntroScreen.tsx`
從 `MindGym_PreTest/src/components/IntroScreen.tsx` 複製，幾乎不需要改動。
- 保留 PSY by PSY logo、InMind 標題、brain-lifter 吉祥物
- 圖片路徑 `/assets/...` 不用改（會從 `MindGym/public/assets/` 讀取）

#### 3-C `QuestionnaireScreen.tsx`
從 `MindGym_PreTest/src/components/QuestionnaireScreen.tsx` 複製，修改：
1. 更新 import：`import type { DimensionKey, NarrativeAnswers } from './types'`
2. 最後一題（`isLast`）移除 email 輸入欄位（整段 `{isLast && (...email input...)}` 拿掉）
3. `isEnough` 判斷：最後一題只要 `textOk` 就夠，不需要 `emailOk`
4. `onSubmit` 的型別跟著更新

#### 3-D `ResultsScreen.tsx`
從 `MindGym_PreTest/src/components/ResultsScreen.tsx` 複製，修改：

1. 加入 props：
   ```typescript
   interface Props {
     report: InMindReport
     onRestart: () => void
     onComplete: () => void  // 新增：完成後去 /app/gratitude
   }
   ```

2. 把底部的「PSY by PSY 心理健身房 搶先加入」紅色按鈕（`<a href="https://tally.so/r/J98r5Y"...>`）整段替換成：
   ```tsx
   <button
     onClick={onComplete}
     style={{
       // 同樣的紅色按鈕樣式
       display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
       width: '100%', padding: '18px 0',
       background: '#E26D5C', color: '#fff', borderRadius: 14,
       fontSize: 17, fontWeight: 800, fontFamily: 'Noto Sans TC',
       border: 'none', cursor: 'pointer', letterSpacing: 0.2,
       boxSizing: 'border-box',
       boxShadow: '0 8px 24px -8px rgba(226,109,92,.55)',
     }}
   >
     開始第一次練習 →
   </button>
   ```

3. 移除「心理健身房介紹」整個 section（`{/* ── 心理健身房介紹 ───... */}` 到它的 `</section>`），因為使用者已在 App 裡。

4. 「重新檢測」按鈕（`onRestart`）保留，它會回到 onboarding 的開頭。

5. `import { useRef, useState } from 'react'`（拿掉不需要的 import）
   `import type { CSSProperties, ReactNode } from 'react'` 保留

#### 3-E `VoiceInput.tsx`
從 `MindGym_PreTest/src/components/VoiceInput.tsx` **原樣複製**，不需要任何修改。
（它已經用 `import.meta.env.VITE_API_URL` 指向正確的後端）

---

### 任務 4：改寫 `onboarding.tsx`

**完整替換** `MindGym/src/routes/onboarding.tsx`。

Route 的 `beforeLoad` 邏輯保留不動（auth check、重複評估 check），只替換 component。

新的 `OnboardingPage` component 邏輯：

```typescript
type InMindScreen = 'intro' | 'quiz' | 'loading' | 'report'

function OnboardingPage() {
  const { session } = Route.useRouteContext()
  const { reassess } = Route.useSearch()
  const navigate = useNavigate()
  const [screen, setScreen] = useState<InMindScreen>('intro')
  const [answers, setAnswers] = useState<NarrativeAnswers>({ P: '', E: '', R: '', M: '', A: '' })
  const [report, setReport] = useState<InMindReport | null>(null)
  const [apiError, setApiError] = useState('')

  async function handleSubmit(finalAnswers: NarrativeAnswers) {
    setAnswers(finalAnswers)
    setScreen('loading')
    setApiError('')
    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
      const res = await fetch(`${apiUrl}/api/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify(finalAnswers),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
      setReport(data)
      setScreen('report')
    } catch (err) {
      setApiError(err instanceof Error ? err.message : '未知錯誤')
      setScreen('quiz')
    }
  }

  function handleComplete() {
    // 初次評估 or reassess 都完成了
    navigate({ to: reassess ? '/app/home' : '/app/gratitude' })
  }

  // ... render 4 screens based on `screen` state
}
```

Loading 畫面：直接從 PreTest 的 `App.tsx` 中的 `LoadingScreen` component 複製（旋轉貝果動畫 + SCORING_PHASES 文字）。

---

### 任務 5：確認 `session.access_token` 取得方式

在 MindGym 的 TanStack Router context 中，`session` 是 Supabase Session 物件，包含 `access_token`。`onboarding.tsx` 裡已有 `const { session } = Route.useRouteContext()`，`session.access_token` 可以直接使用（和 `app.gratitude.tsx` 裡的 `supabase.auth.getSession()` 效果一樣）。

---

## 手動操作清單（使用者要做，不是 AI 要做的）

- [ ] 把圖片檔案複製到 `MindGym/public/assets/`（見上方 Assets 清單）
- [ ] 在 Render（MindGym 後端）的環境變數設定頁加入 `OPENAI_API_KEY`

---

## 不要動的東西

- `MindGym_PreTest/` 整個資料夾：絕對不動
- `MindGym/src/routes/app.home.tsx`：不動
- `MindGym/src/routes/app.gratitude.tsx`：不動
- `MindGym/src/routes/app.profile.tsx`：不動
- `MindGym/supabase/schema.sql`：不動（不需要 migration）

---

## 完成後的驗收方式

1. 進入 App，用一個**尚未有 perma_scores 資料**的帳號登入 → 應該自動跳轉到 /onboarding
2. 看到 InMind 的 INTRO 畫面（PSY by PSY logo + brain-lifter 吉祥物）
3. 點「開始測驗」，回答 5 道開放問題（每題至少 30 字）
4. 看到旋轉貝果 loading 動畫
5. 看到完整報告（雷達圖、食物體型、名人匹配、30 天藍圖）
6. 點「開始第一次練習」→ 進入感恩日記頁
7. 進入 Profile 頁，確認 PERMA 雷達圖顯示正確分數（整數）
8. 點「重新評估」→ 重跑流程 → 完成後回 Home → perma_scores 新增一筆
