# 原型（prototypes）

這個資料夾放**不會被部署**的原型。放這裡而不是 `public/` 是刻意的：
Vite 會把 `public/` 底下的所有檔案原封不動複製到 `dist/`，等於直接公開在正式網域上。

## coach-journey-mvp

教練旅程原型（純靜態 HTML／JS，資料存在瀏覽器 localStorage）。

⚠️ **不可以再放回 `public/`。** 這支原型會請使用者自己貼上 Anthropic API Key，
並從瀏覽器直接呼叫 `https://api.anthropic.com`（見 `app.js` 的 `callClaude()`）。
它原本放在 `public/coach-journey-mvp/`，雖然 App 內的 `/professional` 路由有 email 白名單，
但 `public/` 的檔案是靜態資產——`https://<正式網域>/coach-journey-mvp/index.html` 這個網址
**任何人都能直接開啟**，白名單完全擋不到。對外公開一個「請輸入你的 API Key」的頁面，
是釣魚與金鑰外洩的風險，也是送審時說不清楚的東西，因此 2026-09-07 移出正式部署產物。

在本機看這支原型：

```bash
npx serve docs/prototypes/coach-journey-mvp
```

要讓它重新上線的話，必須先改成「金鑰留在後端、前端只呼叫我們自己的 API」，
而不是把 `public/` 那條路走回去。
