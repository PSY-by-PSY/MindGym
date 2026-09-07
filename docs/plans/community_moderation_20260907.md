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

---

# 追加（同日第二輪回饋）：鼓勵自傷／自殺

## 問題

第一版的規則刻意跳過**整個**自傷主題，理由寫在 `community_safety.sql` 與
`contentFilter.ts` 的檔頭：「使用者寫『我不想活了』是要接住的時刻，不是違規內容」。

這個理由對**私人書寫**成立，對**公開內容**不成立。實際後果是
「大家都去自殺吧」不命中仇恨、騷擾、暴力任何一條規則，公開發得出去——
與服務條款第四節自己寫的「鼓勵自我傷害、自殺、飲食失調⋯⋯零容忍」直接矛盾，
是 Apple 從 1.2 追問時最容易被打的點。

## 界線怎麼畫

| | 例子 | 處置 |
|---|---|---|
| 第一人稱的痛苦 | 我不想活了／我活不下去／我好想消失 | **完全不過濾**，走 crisis_alerts 與危機資源引導 |
| 私人日記（`is_shared` 非 true） | 任何內容 | **完全不過濾**（兩支 trigger 開頭就 return） |
| 鼓勵、教唆他人 | 大家都去自殺吧／你不如去死／kys | 立即隱藏 + 自動送審 |
| 方法教學 | 無痛自殺／燒炭方法／割腕教學／催吐教學 | 立即隱藏 + 自動送審 |
| 美化與揪團 | 自殺是解脫／相約自殺／pro-ana、thinspo | 立即隱藏 + 自動送審 |

規則層面的作法：每一條 pattern 都必須帶**第二人稱、祈使、教學或揪團**的成分，
第一人稱敘述才不會誤中。四條 pattern 與對應的通過／不通過樣本在
`src/lib/contentFilter.ts`（與 SQL seed 一字不差）。

## 實作

新增 `category = 'self_harm_promotion'` 與**第三個 action `'hide'`**：

- `enforce_content_moderation()`（BEFORE）：不 `RAISE`，改成把
  `moderation_status` 設為 `'hidden'`。內容寫得進 DB（留證據給人審與累犯判斷），
  但公開動態牆讀不到（RLS 只放行 `'ok'`）。刻意不告訴發文者哪個字被抓到。
- `autoflag_content()`（AFTER）：同時處理 `'hide'` 與 `'flag'`，開一筆
  `source='auto'` 的檢舉進後台佇列——「立即隱藏 + 人工審核」的後半段。
  並補掛 `AFTER UPDATE`，堵住「先存私人再改公開」「發完再編輯成違規」兩條路。
- `reports_unique_auto_entry / _comment`：只對 **pending** 的自動單去重，
  結案後內容又被改成違規仍會重新開單。
- 使用者檢舉原因新增「鼓勵自傷或自殺」（`self_harm_promotion`），
  這一類**一個人檢舉就立即隱藏**（門檻從 2 降到 1）。
  刻意與既有的「自我傷害疑慮」（`self_harm`）分開：後者是關懷型檢舉，
  把一則求助貼文藏起來正好是反效果，維持 2 人門檻。
- 服務條款第四節補一段，明說私人書寫不過濾、公開鼓勵立即隱藏並停用帳號。

## 送審時可展示的畫面（追加）

5. 用測試帳號發一則「大家都去自殺吧」→ 換另一個帳號看動態牆，貼文不存在；
   管理後台「檢舉處理」佇列出現該筆，標記為系統自動隱藏，可 remove + 停權。
6. 用同一個帳號在私人日記寫「我不想活了」→ 正常儲存，不被擋、不進佇列。
