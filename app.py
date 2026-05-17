import json
import os
import random
from contextlib import asynccontextmanager

import anthropic
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_KEY: str = os.environ["SUPABASE_KEY"]
ANTHROPIC_API_KEY: str = os.environ["ANTHROPIC_API_KEY"]
PORT: int = int(os.environ.get("PORT", 8000))

SUPABASE_REST = f"{SUPABASE_URL}/rest/v1"
SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

ANON_NAMES = ["溫暖的星火", "清晨的微風", "靜謐的月光", "晴天的微笑", "輕盈的雲朵"]

# shared async clients
_http: httpx.AsyncClient | None = None
_claude: anthropic.AsyncAnthropic | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _http, _claude
    _http = httpx.AsyncClient(timeout=30)
    _claude = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    yield
    await _http.aclose()
    await _claude.close()


app = FastAPI(title="MindGym API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def db() -> httpx.AsyncClient:
    assert _http is not None
    return _http


def claude() -> anthropic.AsyncAnthropic:
    assert _claude is not None
    return _claude


async def get_user_id(token: str) -> str:
    resp = await db().get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"},
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    return resp.json()["id"]


# ── Models ─────────────────────────────────────────────────────────────────

class PermaRequest(BaseModel):
    user_id: str
    p: int = Field(ge=1, le=5)
    e: int = Field(ge=1, le=5)
    r: int = Field(ge=1, le=5)
    m: int = Field(ge=1, le=5)
    a: int = Field(ge=1, le=5)


class GratitudeRequest(BaseModel):
    item_1: str
    item_2: str
    item_3: str


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/healthz")
async def health():
    return {"ok": True}


@app.post("/api/perma")
async def save_perma(req: PermaRequest):
    resp = await db().post(
        f"{SUPABASE_REST}/perma_scores",
        headers=SUPABASE_HEADERS,
        json={
            "user_id": req.user_id,
            "p_score": req.p,
            "e_score": req.e,
            "r_score": req.r,
            "m_score": req.m,
            "a_score": req.a,
        },
    )
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Supabase error: {resp.text}")
    return {"ok": True}


@app.post("/api/gratitude")
async def save_gratitude(
    req: GratitudeRequest,
    authorization: str = Header(...),
):
    token = authorization.removeprefix("Bearer ").strip()
    user_id = await get_user_id(token)

    msg = await claude().messages.create(
        model="claude-sonnet-4-5",
        max_tokens=256,
        system="你是一位心理學分析助手，回應請使用繁體中文，且只回傳 JSON，不要加任何前言或 markdown。",
        messages=[{
            "role": "user",
            "content": (
                f"請根據以下三件感恩事件：\n"
                f"1. {req.item_1}\n"
                f"2. {req.item_2}\n"
                f"3. {req.item_3}\n\n"
                "完成兩件事：\n"
                "A. 為每件事標記感恩對象（只能選：身邊他人、自己、環境、體驗、自訂）\n"
                "   - 若提及具體人名，標記為「身邊他人」\n"
                "   - 若提及自身努力/堅持/情緒，標記為「自己」\n"
                "   - 若提及天氣/空間/大自然，標記為「環境」\n"
                "   - 若提及電影/音樂/美食/旅行/事物，標記為「體驗」\n\n"
                "B. 生成一句溫柔的回饋，反映使用者的正向情緒，點出感恩事件的心理意義，不批判、有陪伴感，30字以內。\n\n"
                '回傳格式：\n'
                '{\n'
                '  "tag_1": "身邊他人",\n'
                '  "tag_2": "自己",\n'
                '  "tag_3": "環境",\n'
                '  "ai_feedback": "你今天留意到了身邊的支持，這份覺察是你最珍貴的心理資源。"\n'
                '}'
            ),
        }],
    )

    ai_data = json.loads(msg.content[0].text)
    anon_name = random.choice(ANON_NAMES)

    db_resp = await db().post(
        f"{SUPABASE_REST}/gratitude_entries",
        headers=SUPABASE_HEADERS,
        json={
            "user_id": user_id,
            "item_1": req.item_1,
            "item_2": req.item_2,
            "item_3": req.item_3,
            "tag_1": ai_data["tag_1"],
            "tag_2": ai_data["tag_2"],
            "tag_3": ai_data["tag_3"],
            "ai_feedback": ai_data["ai_feedback"],
            "anon_name": anon_name,
        },
    )
    if db_resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Supabase error: {db_resp.text}")

    return {
        "tag_1": ai_data["tag_1"],
        "tag_2": ai_data["tag_2"],
        "tag_3": ai_data["tag_3"],
        "ai_feedback": ai_data["ai_feedback"],
        "anon_name": anon_name,
    }


# ── Entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=True)
