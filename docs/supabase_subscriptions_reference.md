# `supabase/subscriptions.sql` 交接說明

> 寫這份的原因：有人拿到規劃文件、照著去找 `supabase/subscriptions.sql`，
> 卻在 code 裡找不到這個檔案。以下把「檔案在哪、負責什麼、線上現況是什麼」
> 一次講清楚，之後接手的人不用再問一輪。
>
> 最後更新：2026-09-11

---

## 一、檔案找不到？先更新本地

**檔案是存在的**，就在 `main` 分支上：

| | |
|---|---|
| 路徑 | `supabase/subscriptions.sql` |
| 行數 | 488 |
| 加入 | 2026-08-26，commit `9a487d8`（PR #67）|
| 最後修改 | 2026-09-01，commit `d63a7f2` |

```bash
git checkout main && git pull && ls -la supabase/subscriptions.sql
```

找不到的兩個常見原因：

1. **本地 clone 停在 2026-08-26 之前** —— 那時這個檔案還不存在，`git pull` 就會出現。
2. **搜尋時打成單數** —— 檔名是複數 `subscriptions`，少一個 s 搜不到。

---

## 二、這個檔案負責什麼

訂閱方案、遠端價格設定、付費意願量測，以及**伺服器端的權益判斷**。

| 類型 | 內容 |
|---|---|
| 資料表 | `subscriptions`、`pricing_config`、`paywall_config`、`paywall_intents` |
| 權益判斷 | `is_pro()`、`community_unlocked()`、`get_my_entitlements()` |
| 額度推導 | `weekly_analysis_period_start()`、`weekly_analysis_used()` |
| 管理 RPC | `set_user_subscription()`、`update_pricing_config()`、`update_paywall_config()`、`admin_search_subscriptions()`、`admin_list_paywall_intents()` |
| 社群 | `get_community_preview()`、`gratitude_entries` 的 RLS policy |

### 核心設計原則（動這個檔案前務必讀懂）

**權益一律由伺服器計算，client 端改任何本機狀態都不能解鎖功能。**

具體做法：

1. `subscriptions` 表**完全沒有開 INSERT/UPDATE policy** —— 只能透過
   `set_user_subscription()` 這支有 `is_admin()` 把關的 `SECURITY DEFINER` RPC 寫入。
   使用者連自己的訂閱層級都改不了。
2. 權益計算走 `get_my_entitlements()`（`SECURITY DEFINER`），對象固定是
   `auth.uid()`，**不吃任何 client 傳進來的身分參數**。
3. 社群的「貢獻換觀看」直接改寫 `gratitude_entries` 的 RLS policy——
   未解鎖的人即使繞過前端直接查表，也拿不到完整清單。

> 新增任何「付費才能用」的功能時，判斷要加在這裡或後端，
> **不要只在前端 if 一下**——那等於沒有把關。

---

## 三、⚠️ 線上現況：目前所有登入者都享有全部功能

這是最容易誤會、也最需要先知道的一件事。

線上資料庫的 `is_pro()` 目前是：

```sql
SELECT uid IS NOT NULL
```

也就是 **只要登入就是 Pro**。這是 2026-09-01 刻意改的（commit `d63a7f2`），
目的是做付費意願測試：先讓所有人都能用，觀察有多少人會主動點付費按鈕
（點擊記錄在 `paywall_intents`）。

連帶的結果：

- **創始成員目前只是一個徽章標籤**，沒有任何實際權限差別
- `subscriptions` 表裡的 `tier` / `status` 目前不影響任何功能

### 接金流時必須改回來

`is_pro()` 要改成真正的訂閱判斷，否則**付費與否不會有任何差異**。
改完記得在 Supabase 重跑（見下一節），不然只有檔案變、線上沒變。

---

## 四、SQL 檔案改了不會自動生效

這是另一個常見誤解。

```
你的電腦 / GitHub  →  放「食譜」的地方
Supabase           →  真正執行的地方
```

改了 `.sql` 檔、commit、push —— **Supabase 完全不知道**。
前端改 code push 到 Vercel 會自動部署，但 SQL 不會。

### 套用方式

1. Supabase 後台 → 左側 **SQL Editor**
2. 把 `supabase/subscriptions.sql` **整份**貼進去
3. 按 **Run**

檔案全部是 `CREATE OR REPLACE` / `CREATE ... IF NOT EXISTS`，
**重複執行是安全的**，不會弄壞既有資料。

### 怎麼確認線上是不是最新版

在 SQL Editor 跑：

```sql
SELECT prosrc FROM pg_proc WHERE proname = 'is_pro';
```

把結果跟 `supabase/subscriptions.sql` 裡 `is_pro()` 的內容比對。
一樣就是最新的；不一樣就代表檔案改過但沒有套用到線上。

同樣的方法可以檢查任何一支 function，把 `'is_pro'` 換成函式名即可。

---

## 五、相關檔案與文件

| 位置 | 用途 | 在 repo 上？ |
|---|---|---|
| `supabase/subscriptions.sql` | 本文說明的主角 | ✅ |
| `supabase/pro_modules.sql` | 提供 `is_admin()`，`subscriptions.sql` 依賴它，**要先跑** | ✅ |
| `backend/app.py` | 後端的額度檢查與權益判斷 | ✅ |
| `src/lib/entitlements.ts` | 前端取用 `get_my_entitlements()` | ✅ |
| `docs/plans/handoff_20260829.md` | 前一份交接文件 | ✅ |
| `supabase/payments.sql` | 金流相關（PayUni 串接中）| ⚠️ 尚未 commit |
| `docs/plans/payuni_integration_plan.md` | 金流串接規劃 | ⚠️ 尚未 commit |
| `docs/plans/payment_go_live_roadmap.md` | 從現在到真正收到錢的步驟 | ⚠️ 尚未 commit |

> ⚠️ 標記的三個檔案目前**只存在於 Yolanda 的電腦上，還沒推上 GitHub**。
> 你 `git pull` 之後會找不到它們——這不是你的問題。需要的話直接跟她要，
> 或等那批金流的工作 commit 上來。
>
> （這正是寫這份文件的起因：文件引用了 repo 上還沒有的檔案，
> 接手的人就會卡住。日後寫規劃文件時，記得先確認引用的檔案是否已經推上去。）

---

## 六、給下一個接手的人的提醒

1. **改權益邏輯 = 改兩個地方**：SQL 檔案 + 在 Supabase 重跑。只做一件會修好一半。
2. **後端 `backend/app.py` 改了要重新部署 Render**，跟 Vercel 的自動部署是兩回事。
3. **原生層改動（`ios/`、Capacitor 設定、原生套件）要重新打包送審**。
   平常改前端 push 到 Vercel 就生效，只有這類改動例外。
