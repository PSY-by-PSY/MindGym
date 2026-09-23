# CI 自動化測試盤點與測試策略建議

> 日期：2026-09-19
>
> 盤點分支：`chore/ci-test-audit`
>
> 範圍：前端 React/Vite、FastAPI 後端、Supabase SQL／Edge Functions、Capacitor iOS
>
> 本文件定義測試策略與範圍；第一階段的技術邊界單元測試及 PR CI 已完成實作。

---

## 一、結論摘要

目前列出的候選模組，大多數最適合先做**單元測試**，但測試案例應以
**BDD 的行為語言**描述。這裡的建議不是立即導入 Cucumber/Gherkin，而是：

- 用單元測試快速驗證純函式、邊界值與錯誤容錯。
- 用 `Given / When / Then` 的思考方式命名與組織重要產品規則。
- 只有跨頁面、跨 API、跨資料庫的完整使用者流程，才在後續使用真正的 BDD／E2E 測試。

換句話說，第一階段建議採用：

> **Unit-test first，BDD-readable scenarios，暫不導入完整 Gherkin 工具鏈。**

理由是目前尚無任何測試框架與測試基礎設施。若一開始就加入 Cucumber、瀏覽器、測試資料庫與多層 step definitions，維護成本會大於第一版 CI 所得到的保障。

---

## 二、目前自動化基礎

### 已具備

- `npm run lint`：ESLint 靜態檢查。
- `npm run build`：`tsc -b` 型別檢查加上 Vite production build。
- Xcode Cloud post-clone script：安裝 Node、執行前端 build、同步 Capacitor iOS。
- GitHub Actions 用量監測：每日排程執行 `scripts/usage_monitor.py`。
- Python 原始碼目前可通過語法編譯檢查。
- `ci_scripts/ci_post_clone.sh` 可通過 shell 語法檢查。

### 盤點時尚未具備

以下是第一階段實作前的狀態；完成項目見第九節。

- 沒有針對 `pull_request` 或一般 `push` 的 CI workflow。
- 沒有 Vitest、Jest、Playwright、Cypress 或 Testing Library。
- 沒有 Pytest 或既有 Python 測試目錄。
- 沒有 Supabase local test stack 或 SQL migration test。
- 沒有 Deno 測試設定。
- iOS 專案沒有 Unit Test target。

因此，現況比較接近「部署時有 build 驗證」，尚未形成「每次修改都有回歸測試」的 CI。

---

## 三、單元測試與 BDD 的使用邊界

| 類型 | 適合驗證 | 本專案例子 |
|---|---|---|
| 單元測試 | 純函式、輸入輸出、邊界值、錯誤容錯 | 日期、價格、版本比較、推薦演算法、成本計算 |
| 行為導向單元測試 | 一條重要產品規則，但仍能在單一模組內完成 | 違規內容應被阻擋、自傷求助不應被誤擋、新上架練習應優先推薦 |
| Contract test | 兩份實作或兩個系統之間必須保持一致 | 前端內容過濾規則與 Supabase SQL moderation rules |
| Integration test | 多個模組、API client、資料庫或外部服務協作 | FastAPI endpoint、Supabase query、Edge Function handler |
| BDD／E2E | 從使用者視角完成跨頁面流程 | 登入、填寫感恩日記、選擇隱私、儲存、社群顯示 |

BDD 是需求與案例的表達方式，不等同於一定要使用 `.feature` 檔。第一版可以直接在 Vitest／Pytest 中寫出可讀的行為案例，例如：

```ts
describe('內容安全規則', () => {
  it('Given 使用者表達自身痛苦，When 發文前檢查，Then 不應誤判為鼓勵自傷', () => {
    // ...
  })
})
```

這能保留 BDD 的產品可讀性，同時避免多維護一層 Gherkin step definitions。

---

## 四、模組測試適性盤點

### A. 第一階段：優先加入 CI

| 模組 | 建議測試類型 | 主要案例 | 優先度 |
|---|---|---|---|
| `src/lib/contentFilter.ts` | 行為導向單元測試＋contract test | block／flag／hide、拆字規避、第一人稱求助不誤擋、與 SQL 規則一致 | 最高 |
| `src/lib/recommend.ts` | 單元測試，以 BDD 語句描述 | 各 PERMA 弱項推薦、無分數 fallback、spotlight 日期窗口、未上架項目不出現 | 高 |
| `src/lib/date.ts` | 單元測試 | 本地日期格式、月份／年度邊界、非法輸入 fallback | 高 |
| `backend/usage_metering.py` | 單元測試 | 模型費率、日期尾碼、cache token、缺欄位、負數／非法音訊秒數 | 高 |
| `src/lib/privacy.ts` | 單元測試 | community／anonymous／private 與 DB 欄位雙向轉換 | 高 |
| `src/lib/appVersion.ts` 的 `compareVersions` | 單元測試 | 缺位補零、相等、升版、非數字片段 | 中高 |
| `src/lib/pricing.ts` 的純函式 | 單元測試 | TWD 格式、創始價、年繳月均、折扣百分比、缺資料 | 中高 |
| `src/lib/gratitudeTargets.ts` | 單元測試 | 分類計數、未知／空資料、比例結果 | 中 |

這一組測試不需要真實 API key、Supabase 專案或瀏覽器，是最適合作為 PR 必過條件的範圍。

### B. 第二階段：仍以單元測試為主，但需要測試環境控制

| 模組 | 建議測試類型 | 額外需求 |
|---|---|---|
| `src/lib/streak.ts` | 單元測試 | fake clock；最好讓「今天」可注入，避免測試隨日期變動 |
| `src/lib/reconstructReport.ts` | 單元測試 | 準備代表性測驗資料 fixture |
| `src/lib/gratitudeDraft.ts` | 單元測試 | mock `localStorage` 與時間 |
| `src/lib/quizDraft.ts` | 單元測試 | mock `localStorage`、過期與損壞 JSON 案例 |
| `src/lib/reviews.ts` 日期 helper | 單元測試 | fake clock、週日／週一與跨年案例 |
| `src/lib/workshop.ts` | 單元測試 | mock `localStorage`，分離密碼解析與儲存狀態 |
| `src/lib/proModules.ts` 的危機字詞與摘要 helper | 行為導向單元測試 | 模組目前較大；可能需要先抽出純邏輯以降低載入 Supabase 的耦合 |

這些仍不是完整 BDD/E2E；只是需要 jsdom、fake timers 或少量 mock。

### C. 後續：適合 integration 或真正的 BDD／E2E

| 範圍 | 建議方式 | 不放第一階段的原因 |
|---|---|---|
| Supabase CRUD modules | mock client 的 integration test，再補 local Supabase 測試 | query chain、RLS 與 schema 需要專門環境 |
| FastAPI endpoints | TestClient／AsyncClient＋mock Anthropic、OpenAI、Supabase | `backend/app.py` 載入時需要環境變數與第三方套件 |
| Supabase Edge Functions | Deno unit/integration test | 目前未建立 Deno config，且直接依賴 remote imports／secrets |
| React 使用者流程 | Playwright BDD-style E2E | 需要可啟動的前後端、測試帳號與資料清理策略 |
| Capacitor iOS | Xcode build smoke test，必要時再新增 XCTest | GitHub macOS runner 成本較高，且目前沒有 test target |

最適合真正 BDD／E2E 的流程包括：

1. 使用者完成感恩日記，選擇匿名後，社群不得顯示真實姓名。
2. 使用者輸入求助文字時，不應被內容過濾器阻擋；鼓勵他人自傷則應隱藏並送審。
3. 使用者完成 InMind 測驗後，報告成功保存並能回到首頁。
4. 未登入使用者存取受保護頁面時，應被導向登入頁。

這些案例跨越 UI、API 與資料庫，單元測試只能驗證其中規則，不能證明整條流程正常。

---

## 五、第一版 CI 建議

### 觸發條件

- Pull request 指向 `main`。
- Push 到 `main`。
- 保留手動執行 `workflow_dispatch`。

### 建議步驟

1. Checkout repository。
2. 使用 Node 20 並啟用 npm cache。
3. `npm ci`。
4. `npm run lint`。
5. `npm run build`。
6. 執行前端單元測試。
7. 設定 Python 3.11。
8. 執行 Python 單元測試與語法檢查。
9. 執行前端與 SQL moderation rules 的同步契約測試。

### 第一版不應依賴

- 正式 Supabase secrets。
- Anthropic／OpenAI API keys。
- 正式資料庫。
- iOS signing certificate。
- 真實推播或 App Store 環境。

CI 應該在 fork／一般 PR 上也能完整執行，不因 secrets 缺失而跳過核心驗證。

---

## 六、測試工具建議

### TypeScript：Vitest

建議採 Vitest，原因如下：

- 專案本身使用 Vite，設定與 TypeScript alias 相容性最好。
- 支援 fake timers、mock、coverage 與 table-driven tests。
- 後續可搭配 jsdom 測試 localStorage 或少量 DOM 行為。
- 不需要為 Jest 額外維護一套轉譯設定。

第一階段不建議同時引入 Cucumber。若未來產品規格真的以 `.feature` 文件由非工程角色共同維護，再評估 `@cucumber/cucumber`。

### Python：Pytest 或標準函式庫 unittest

- 若只測 `usage_metering.py`，Python 內建 `unittest` 已足夠，且不新增依賴。
- 若下一階段會測 FastAPI、async function 與 HTTP mock，Pytest 生態較適合。

建議方向是採 Pytest，因為後續 FastAPI integration test 很可能會用到 fixtures 與 async 支援；若目前要求極小依賴，也可以先用 `unittest` 起步。

### BDD 工具

第一版不安裝專用 BDD framework。先採：

- 測試名稱使用 Given／When／Then 或完整產品行為句。
- 關鍵規則使用 table-driven cases。
- 測試檔靠近模組，讓修改規則的人容易同步更新。
- 等 Playwright E2E 出現後，再評估是否需要 `.feature` 檔。

---

## 七、第一版完成標準

第一版 CI 可視為完成，需同時符合：

- PR 建立或更新時會自動執行。
- lint、TypeScript build 或任何單元測試失敗時，CI 會標紅。
- 測試不需要正式 secrets 或網路服務。
- 第一階段技術邊界模組具備正常案例、邊界案例與錯誤案例。
- 尚未經 PO／PM 確認的產品規則不會被開發者假設鎖進測試。
- 測試在本機與 GitHub Actions 使用相同命令執行。
- README 或測試文件說明如何在本機執行。

---

## 八、後續待確認事項

進入產品規則與整合測試前，需要確認以下範圍：

1. `contentFilter.ts` 的內容安全情境與 SQL 規則，哪些案例已經過 PO／PM／領域專家確認。
2. PERMA 推薦演算法的代表人物、輸入分數與預期推薦結果。
3. FastAPI／Supabase integration test 是否建立隔離測試環境。
4. 是否開始產生 coverage report，以及何時設定硬性門檻。
5. 哪 3～5 條使用者流程最值得優先投入 Playwright E2E。

### 後續建議

- 先以 BDD example table 確認內容安全、推薦與危機規則，再把規則落成單元或 contract tests。
- coverage 先產生報告，不立即以全專案百分比阻擋 CI。
- E2E 只選高風險跨系統流程，不追求用瀏覽器重測所有單元邏輯。

---

## 九、第一階段實作結果

依討論結果，第一階段先保護答案明確的技術邊界，不把尚未經 PO／PM 確認的產品規則鎖進測試。

### 已完成

- 新增 Vitest 與 `npm test`／`npm run test:watch`。
- 前端共 8 個測試檔、45 個案例：日期、隱私、版本、價格、感恩對象、測驗草稿、感恩草稿、連續天數。
- Python 使用標準函式庫 `unittest`，共 7 個 AI 成本計算案例，未新增 Python 測試依賴。
- 新增 GitHub Actions CI，在指向 `main` 的 PR、push 到 `main`、手動觸發時執行。
- CI 包含 `npm ci`、前端測試、lint、build、Python tests 與 Python compile check。

### 刻意延後

- 內容過濾政策與 SQL 規則同步。
- PERMA 推薦演算法。
- 危機字詞與心理安全處置。
- 測驗報告重建的產品 fallback 規則。
- 真實 Supabase、FastAPI、Edge Functions、瀏覽器 E2E 與 iOS 測試。

這些項目會先用 BDD 情境讓 PO／PM／領域專家確認，再決定應落成單元、contract 或 E2E 測試。

### 本機執行

```bash
npm ci
npm test
npm run lint
npm run build
python3 -m unittest discover -s backend/tests -v
python3 -m compileall -q backend scripts
```
