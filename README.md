# MindGym

心理健康訓練平台，基於 React + TypeScript + Vite 前端、FastAPI Python 後端。

## 專案結構

```
MindGym/
├── src/                  # React 前端原始碼
├── public/               # 靜態資源
├── backend/              # Python 後端
│   ├── app.py            #   FastAPI 主程式
│   ├── usage_metering.py #   用量計費模組
│   └── requirements.txt  #   Python 相依套件
├── scripts/              # 工具腳本（用量監測等）
├── supabase/             # Supabase 設定與 migration
├── docs/
│   ├── sessions/         #   開發日誌（依日期命名，如 0522_to_0526.md）
│   ├── plans/            #   規劃與規格文件（SPEC、INTEGRATION_PLAN、REDESIGN_PLAN）
│   ├── prompts/          #   Claude session 提示詞
│   └── reports/          #   QA 報告、用量報告、工具使用手冊
├── dist/                 # 建置輸出（git 忽略）
└── node_modules/         # npm 相依（git 忽略）
```

## 快速開始

### 前端

```bash
npm install
npm run dev
```

### 後端

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload
```

## 文件規範

- **開發日誌**：新增至 `docs/sessions/`，命名格式 `MMDD_to_MMDD.md`
- **規劃文件**：新增至 `docs/plans/`
- **提示詞**：新增至 `docs/prompts/`
- **QA / 報告 / 工具手冊**：新增至 `docs/reports/`
