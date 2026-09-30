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

## 本地端測試與快速開始

在本地進行測試時，支援兩種啟動方式：
1. **方式一：本機終端執行（推薦，支援 Hot Reload、方便除錯）**
2. **方式二：Docker Compose 容器化啟動（一鍵啟動所有服務）**

---

### 前置作業：環境變數確認

確認專案根目錄下的 `.env` 檔案已設定相應的金鑰與端點（若是本地端測試，可參考預設值）：

```env
# 後端設定
PORT=8000
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 前端設定 (Vite)
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### 方式一：本機終端啟動（推薦）

> **⚠️ 重要提醒**：
> 後端模組相依於 `backend` 模組路徑，**請務必在專案根目錄 (`MindGym/`) 執行**，請勿 `cd backend` 後執行，以免發生 `ModuleNotFoundError: No module named 'backend'`。

#### 1. 啟動後端 (FastAPI)

在專案根目錄開一個終端機視窗：

```bash
# 1. 建議建立並啟用 Python 虛擬環境 (可選但推薦)
python3 -m venv .venv
source .venv/bin/activate

# 2. 安裝 Python 相依套件
pip install -r backend/requirements.txt

# 3. 啟動後端 API 伺服器 (具備自動重載)
uvicorn backend.app:app --reload --port 8000
```

- 後端服務端點：`http://localhost:8000`
- API 互動文件 (Swagger UI)：`http://localhost:8000/docs`
- 替代啟動指令（透過根目錄轉接檔）：`uvicorn app:app --reload --port 8000`

#### 2. 啟動前端 (Vite + React)

在專案根目錄開另一個終端機視窗：

```bash
# 1. 安裝 npm 相依套件 (首次或 package.json 更新時執行)
npm install

# 2. 啟動前端開發伺服器
npm run dev
```

- 前端頁面端點：`http://localhost:5173`

---

### 方式二：Docker Compose 啟動

專案根目錄的 `docker-compose.yml` 已配置 `db`、`backend`、`frontend` 三個容器服務。

#### 1. 如果已啟動 db，僅啟動後端與前端

```bash
docker compose up -d backend frontend
```

#### 2. 一鍵啟動所有服務 (包含 Postgres 資料庫)

```bash
docker compose up -d
```

#### 3. 查看容器狀態與即時日誌

```bash
# 查看所有容器狀態
docker compose ps

# 即時追蹤後端與前端日誌
docker compose logs -f backend frontend
```

#### 4. 停止 Docker 服務

```bash
# 停止容器但保留資料
docker compose down

# 若需要重新建置映像檔啟動
docker compose up -d --build backend frontend
```

---

### 服務端點一覽

| 服務 | 類型 | 本地端點 | 說明 |
| :--- | :--- | :--- | :--- |
| **Frontend** | Vite + React | `http://localhost:5173` | 使用者前端介面 |
| **Backend** | FastAPI | `http://localhost:8000` | 後端核心 API |
| **API Docs** | Swagger UI | `http://localhost:8000/docs` | 後端 API 互動式文件與測試 |
| **PostgreSQL** | Docker DB | `localhost:54322` | docker-compose 內建 Postgres (port 54322) |
| **Supabase** | 本地 Supabase | `http://127.0.0.1:54321` | 本地 Supabase 服務端點 |

## 文件規範

- **開發日誌**：新增至 `docs/sessions/`，命名格式 `MMDD_to_MMDD.md`
- **規劃文件**：新增至 `docs/plans/`
- **提示詞**：新增至 `docs/prompts/`
- **QA / 報告 / 工具手冊**：新增至 `docs/reports/`
