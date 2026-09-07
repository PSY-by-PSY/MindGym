# 社群安全補強：發佈前過濾 + 檢舉處理後台（2026-09-07）

> 起因：模擬審查員回饋指出兩個缺口，兩個都會再次觸發 **Guideline 1.2**——
> 這條 8/16 已經被退過一次（見 `appstore_rejection_20260816_response.md`）。

---

## 缺口與對策

| 缺口 | 原本狀況 | 現在 |
|---|---|---|
| 內容發佈路徑沒有預先過濾 | `insertCommunityPost()` 直接把使用者輸入寫進 `gratitude_entries`，留言也是直接 insert | 兩層過濾：DB trigger（擋得住）+ 前端提示（體驗） |
| 檢舉送出後沒有下文 | `reports` 只有「本人可讀自己的」policy，沒有任何後台讀得到 | admin RLS + `admin_review_queue()` RPC + 管理後台「檢舉處理」分頁 |

Apple 對 UGC App 的四項要求現在的對應位置：

| 1.2 要求 | 實作 |
|---|---|
| 過濾冒犯內容 | `moderation_rules` + `enforce_content_moderation()` trigger；前端 `src/lib/contentFilter.ts` |
| 檢舉機制 | `src/lib/communityModeration.ts` 的 `submitReport`（既有）|
| 封鎖機制 | `blockUser` / 封鎖名單（既有）|
| 24 小時內處理檢舉、移除違規者 | 管理後台「檢舉處理」分頁 + 自動隱藏 + `admin_suspend_user()` |

---

## 為什麼過濾要放在資料庫

前端用 anon key + RLS 直接打 PostgREST。只在 React 裡擋，任何人拿 devtools 或
curl 都能繞過去——那不叫過濾，叫提示。所以：

- **真正的把關**：`gratitude_entries` 與 `comments` 上的 `BEFORE INSERT/UPDATE` trigger，
  命中 block 級規則就 `RAISE EXCEPTION 'CONTENT_BLOCKED: <category> …'`，資料進不了表。
- **前端那層**：`src/lib/contentFilter.ts`，用同一份規則字串，讓使用者在送出當下就知道
  哪裡不行，不必等一次網路來回。DB 端規則若比前端新，回傳的錯誤也會被
  `toContentBlockedError()` 翻成同一句人話。

⚠️ 兩份規則字串必須逐字一致（`contentFilter.ts` 的 `RULES` ↔ `moderation_rules` 的 seed）。
刻意不用 `\b`：PostgreSQL 的 `\b` 是退格字元，不是字界，兩邊才能共用同一串。

## 刻意不擋的東西

自我傷害、「我想死」、「活不下去」這類字眼**不在過濾清單裡**。這是心理健康 App，
使用者寫下這些是我們最需要接住的時刻；擋掉只會讓他學會不寫。
危機字眼走的是另一條路（`crisis_alerts` / 危機資源引導）。

同理，**私人日記不過濾**——只有 `is_shared = true` 的貼文與留言會被檢查。

## 分級

- `block`：仇恨、露骨性內容、暴力威脅、招攬廣告、強烈辱罵 → 直接擋下。
- `flag`：輕度髒話 → 照常發佈，但自動在 `reports` 建一筆 `source='auto'` 的待審紀錄。
  機器不直接判死，交給人審，避免誤殺。

## 自動隱藏

同一則內容被 **2 個不同使用者**檢舉 → 系統自動 `moderation_status = 'hidden'`，
公開動態牆立刻看不到（作者自己仍看得到，免得以為資料不見了）。
管理員審完可以 `restore` 放回或 `remove` 下架。管理員睡覺時也要有人擋著。

## 停權

`user_suspensions` + `is_suspended()`。停權中無法發佈公開貼文與留言，
也不能把舊的私人貼文改成公開；但**私人日記照常寫**——他失去的是社群，
不是這個 App 本來要給他的工具。

---

## 部署步驟

1. Supabase Dashboard → SQL Editor，依序執行（皆可重複執行）：
   - `supabase/pro_modules.sql`（若尚未跑過；`is_admin()` 定義在這裡）
   - `supabase/schema.sql`（新增 `moderation_status` 等欄位與更新後的讀取政策）
   - `supabase/community_safety.sql`（規則表、trigger、檢舉佇列、停權、admin RPC）
2. 前端 merge 進 `main` → Vercel 自動部署（iOS 殼載入的是線上 bundle，不必重打包）。
3. 用 admin 帳號開 `/admin` → 「檢舉處理」分頁，確認佇列讀得出來。

## 送審時可展示的畫面

1. 在社群留言框輸入含違規字詞的內容 → 送出被擋，畫面說明是哪一類違規。
2. 對一則貼文按「檢舉」→ 送出成功。
3. 封鎖某位使用者 → 對方貼文與留言從動態牆消失。
4. 管理後台「檢舉處理」→ 顯示佇列、超過 24 小時的紅字提醒、下架／放回／停權按鈕。
