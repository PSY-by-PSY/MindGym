# 用量／成本監測

一支腳本，每天回答兩個問題：

1.  **目前各資源用量，是否逼近前後端部署平台的免費上限？**
2.  **目前 capacity 夠不夠？**（AI 每天花多少錢、免費額度照現在速度還能撐多久）

------------------------------------------------------------------------

## 檔案一覽

| 檔案 | 作用 |
|------------------------------------|------------------------------------|
| `scripts/usage_monitor.py` | 主腳本：抓各平台用量／花費 → 算百分比 → 印報告 →（可選）寫快照 → 評估告警 |
| `scripts/usage_config.json` | 免費上限、告警門檻、dashboard 連結（**你可自行調整,不必動程式**） |
| `supabase/usage_monitor.sql` | 建立 `usage_snapshots`、`ai_usage_log` 兩張表 + `get_db_size_bytes()`、`ai_usage_summary()` 兩個函式 |
| `usage_metering.py` | 後端記帳模組：價目表 + 從 API 回應的 `usage` 換算金額 |
| `app.py`（已改） | 5 個 Claude 呼叫點 + Whisper 各加一行記帳,寫入 `ai_usage_log` |
| `supabase/functions/_shared/metering.ts` | 兩個 Edge Function 共用的記帳 helper（Deno 版） |
| `.github/workflows/usage-monitor.yml` | 每天台灣 09:00 自動跑一次並存快照 |

監測涵蓋的成本來源：**Anthropic Claude**(app.py + 2 個 Edge Function)、**OpenAI Whisper**(語音輸入)、**Supabase**、**PostHog**、以及 **Vercel / Render**(免費方案無 API,以 dashboard 連結呈現)。

## AI 花費怎麼算：雙軌制

因為 **Anthropic 的 Usage & Cost API 屬於 Admin API,個人帳戶無法使用**(OpenAI 同樣需要 Admin Key),AI 花費改採雙軌:

- **軌道一(主)— 自行計量**:每次 Messages API 回應都帶 `usage`(token 數),用**一般 API key 就拿得到**。後端當場依價目表換算金額,寫進 `ai_usage_log`。這條路線不需任何 Admin 權限,且帶有「哪個功能、哪位使用者」,比官方的組織總額更適合做容量規劃。**這是預設且必定可用的路線。**
- **軌道二(輔)— 官方成本 API**:若你願意(Anthropic 需先建組織才能簽發 Admin Key),腳本會一併抓官方數字,在報告中與自行計量並列「對帳」,驗證沒有漏記。**不設也完全不影響軌道一。**

------------------------------------------------------------------------

## 監測內容與各平台 API 狀況

| 來源 | 計費性質 | 自動抓取？ | 抓什麼 |
|------------------|------------------|------------------|------------------|
| Anthropic | 純付費 | ✅ 自行計量(主) | 今日 / 本月花費($)、依功能拆分 |
| OpenAI Whisper | 純付費 | ✅ 自行計量(主) | 今日 / 本月花費($)、依音訊秒數 |
| Anthropic / OpenAI 官方 | 純付費 | ◐ 對帳(需 Admin Key) | 官方本月總額,與自行計量並列 |
| Supabase | 免費有上限 | ✅ 部分(DB 大小) | DB 大小 vs 500MB |
| PostHog | 免費有上限 | ✅ Query API | 本月事件數 vs 100 萬 |
| Vercel | 免費有上限 | ❌ 無公開 API | dashboard 連結,人工檢查 |
| Render | 免費有上限 | ❌ 無公開 API | dashboard 連結,人工檢查 |

> Supabase 的 egress / Edge Function 呼叫數在免費方案沒有開放 API,目前同樣靠 dashboard。若日後升級到 Pro,可改用 Management API 自動抓。

------------------------------------------------------------------------

## 🙋 你要做的事(一次性設定)

### 步驟 1 — 套用資料庫 SQL（**請重跑,內容已更新**）

Supabase Dashboard → SQL Editor → 貼上 `supabase/usage_monitor.sql` 全文 → Run。 現在會建立 `usage_snapshots`、`ai_usage_log` 兩張表,以及 `get_db_size_bytes()`、`ai_usage_summary()` 兩個函式。(整段可重複執行,不會重複建立。)

### 步驟 2 — 部署後端讓記帳生效（軌道一,主要路線）

`app.py` 與兩個 Edge Function 已加上記帳。把這些改動部署上去後,使用者每次用到 AI 功能就會自動寫一列到 `ai_usage_log`——**這條路線不需要任何 Admin Key**。
- 後端(Render):推上 git 後重新部署。
- Edge Functions:`supabase functions deploy extract-keywords gratitude-summary`(或你慣用的部署方式)。

### 步驟 3 — 申請金鑰（皆為選用,缺了不影響軌道一）

| 金鑰 | 去哪裡拿 | 必要性 |
|------------------------|------------------------|------------------------|
| **PostHog Personal API Key** | PostHog → Settings → **Personal API keys**;另記下專案的數字 **Project ID** | 建議(事件額度 + 之後算 DAU) |
| **Anthropic Admin Key** | console.anthropic.com → 先到 **Settings → Organization 建立組織**(個人帳戶不開放 Admin API,建組織免費、不必加成員)→ 再簽發 **Admin Key** | 選用(軌道二對帳) |
| **OpenAI Admin Key** | platform.openai.com → Settings → Organization → **Admin keys**;另記下 **Organization ID**(`org-…`) | 選用(軌道二對帳) |
| Supabase service_role | 你 `.env` 裡已有的 `SUPABASE_KEY` | 已具備 |

> 軌道一(自行計量)只靠 `SUPABASE_KEY` 就完整運作。Admin Key 純粹是想多一層官方對帳才需要——不設的話報告只是少了「官方 API 對帳」那兩行,其餘照常。

### 步驟 4 — 選一種跑法

**A. 本機手動跑**(先驗證能通) `SUPABASE_URL` / `SUPABASE_KEY` 你 `.env` 已有;其餘為選用,要哪條軌道就加哪些:

```         
# 選用：PostHog 事件額度
POSTHOG_API_KEY=phx_...
POSTHOG_PROJECT_ID=12345
# 選用：軌道二官方對帳
ANTHROPIC_ADMIN_KEY=sk-ant-admin...
OPENAI_ADMIN_KEY=sk-admin...
OPENAI_ORG_ID=org-...
```

然後:

``` bash
pip install -r requirements.txt        # httpx / python-dotenv 已在內
python3 scripts/usage_monitor.py        # 只看報告
python3 scripts/usage_monitor.py --save # 看報告並寫入快照
```

**B. 每天自動跑**(推薦,不依賴電腦開機) 到 GitHub repo → Settings → Secrets and variables → Actions,把上面那些金鑰連同 `SUPABASE_URL`、`SUPABASE_KEY` 一一加為 **Repository secrets**(名稱要和 `.github/workflows/usage-monitor.yml` 裡一致)。加完後 workflow 每天台灣 09:00 自動執行,也可在 Actions 頁面手動觸發測試。

------------------------------------------------------------------------

## 📨 你要給我的內容(若要我幫你繼續往下做)

我目前**不需要**任何金鑰就能把程式寫好。要我幫你接下一階段時,提供以下任一即可:

1.  **跑一次的報告輸出** —— 套用 SQL + 部署後端、實際用過幾次 AI 功能後,在本機 `python3 scripts/usage_monitor.py`,把終端機那段貼給我,我可確認自行計量的數字有正常累積、必要時微調(例如官方對帳數字若有落差)。
2.  **想自訂的數字** —— 例如「AI 單日超過 \$X 要告警」「免費額度到 70% 就提醒」,我改 `usage_config.json`。
3.  **告警要送到哪** —— 目前告警只印在報告/Actions log。要推到 **Email / Telegram / Slack** 哪個?給我對應的 webhook 或 bot token,我接上去。

> ⚠️ 不要把金鑰直接貼進對話。金鑰請只放在 `.env`(本機)或 GitHub Secrets(雲端);我需要的只有「報告輸出」和「你的偏好設定」。

------------------------------------------------------------------------

## 🗺️ 後續路線圖(尚未實作)

照優先序,等核心跑穩後再接:

-   **Capacity 換算**:`ai_usage_log` 已帶 `user_id` 與 `source`,累積資料後可直接 SQL 算「每位使用者每日 AI 成本」「哪個功能最燒錢」,再配 PostHog 的 DAU 推「免費額度耗盡預估日」,回答「現在的方案還能撐幾位 DAU、第一個會爆的是哪個額度」。
-   **告警通道**:接 Email / Telegram。
-   **趨勢圖**:讀 `usage_snapshots` 畫每日花費與額度使用率折線(可做成一個內部頁面或排程產圖)。
-   **Supabase egress 自動化**:升級 Pro 後改用 Management API。

------------------------------------------------------------------------

## 設計備註

-   每個來源獨立 try/except:缺 key → `skipped`,API 錯 → `error`,都不會拖垮整份報告。
-   快照表有 `UNIQUE(captured_at, source, metric)` + upsert,同一時刻重跑不會產生重複列。
-   腳本有告警時以 **exit code 1** 結束,方便排程或 CI 判斷是否該發通知。
-   `get_db_size_bytes()` 用 `SECURITY DEFINER` 且只授權給 `service_role`,前端拿不到 DB 大小。
