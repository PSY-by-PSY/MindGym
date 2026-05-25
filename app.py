import json
import logging
import os
import random
import re
from contextlib import asynccontextmanager

import anthropic
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logger = logging.getLogger("mindgym")

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


class GratitudeTagRequest(BaseModel):
    item_1: str
    item_2: str
    item_3: str


class GratitudeSummaryRequest(BaseModel):
    item_1: str
    item_2: str
    item_3: str
    difficulty: str = "basic"


class GratitudeSaveRequest(BaseModel):
    item_1: str
    item_2: str
    item_3: str
    is_shared: bool = True
    use_real_name: bool = True
    ai_feedback: str | None = None
    entry_date: str | None = None
    target_1: str | None = None
    target_2: str | None = None
    target_3: str | None = None
    avatar: str | None = None


class KeywordEntry(BaseModel):
    id: str
    item_1: str | None = None
    item_2: str | None = None
    item_3: str | None = None


class ExtractKeywordsRequest(BaseModel):
    entries: list[KeywordEntry]


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/healthz")
async def health():
    return {"ok": True}


@app.post("/api/perma")
async def save_perma(req: PermaRequest):
    try:
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
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("save_perma failed [%s]: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@app.post("/api/gratitude")
async def save_gratitude(
    req: GratitudeRequest,
    authorization: str = Header(...),
):
    try:
        token = authorization.removeprefix("Bearer ").strip()
        user_id = await get_user_id(token)

        msg = await claude().messages.create(
            model="claude-sonnet-4-6",
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

        raw = msg.content[0].text if msg.content else ""
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not match:
            raise HTTPException(status_code=502, detail=f"Claude returned non-JSON: {raw[:200]!r}")
        ai_data = json.loads(match.group())
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
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("save_gratitude failed [%s]: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@app.post("/api/tag-gratitude-targets")
async def tag_gratitude_targets(
    req: GratitudeTagRequest,
    authorization: str = Header(...),
):
    try:
        token = authorization.removeprefix("Bearer ").strip()
        await get_user_id(token)

        msg = await claude().messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            system="你是心理學分析助手，只回傳 JSON，不要加任何前言或 markdown。",
            messages=[{
                "role": "user",
                "content": (
                    "根據以下三件感恩事件，精準標記每件的感恩對象類別。\n\n"
                    f"1. {req.item_1}\n"
                    f"2. {req.item_2}\n"
                    f"3. {req.item_3}\n\n"
                    "規則：\n"
                    "- others（身邊他人）：提及家人/朋友/伴侶/同事/陌生人/任何人名或人際關係\n"
                    "- self（自己）：提及自身努力/堅持/情緒覺察/自我照顧\n"
                    "- environment（環境）：提及天氣/空間/大自然/城市環境\n"
                    "- experience（體驗）：提及電影/音樂/美食/旅行/活動/事物\n"
                    "- custom（自訂）：其他情況\n"
                    "label 填入最精簡的中文描述（2–4 字），例如「同事」「自己」「天氣」「美食」\n\n"
                    "只回傳 JSON：\n"
                    '{"tags":[{"item":1,"target":"others","label":"同事"},{"item":2,"target":"self","label":"自己"},{"item":3,"target":"experience","label":"體驗"}]}'
                ),
            }],
        )

        raw = msg.content[0].text if msg.content else ""
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not match:
            raise HTTPException(status_code=502, detail=f"Claude returned non-JSON: {raw[:200]!r}")
        return json.loads(match.group())
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("tag_gratitude_targets failed [%s]: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@app.post("/api/gratitude-summary")
async def gratitude_summary(
    req: GratitudeSummaryRequest,
    authorization: str = Header(...),
):
    try:
        token = authorization.removeprefix("Bearer ").strip()
        await get_user_id(token)

        tone = (
            "使用者選擇了「進階」模式，請更深入地反映其覺察與內在意義。"
            if req.difficulty == "advanced"
            else "使用者選擇了「初階」模式，請以溫柔、平實、簡短的語氣陪伴。"
        )

        msg = await claude().messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            system="你是一位心理學取向的健心教練，回應請使用繁體中文，語氣溫暖、不批判、有陪伴感。只回傳 JSON，不要加任何前言或 markdown。",
            messages=[{
                "role": "user",
                "content": (
                    f"以下是使用者今天寫下的三件感恩：\n\n"
                    f"1. {req.item_1}\n"
                    f"2. {req.item_2}\n"
                    f"3. {req.item_3}\n\n"
                    f"{tone}\n\n"
                    "請生成兩段回饋：\n"
                    "1. emotional_summary：一句話溫柔反映使用者今天整體的正向情緒狀態（30 字以內，不批判）\n"
                    "2. action_suggestion：\n"
                    "   - 若感恩內容提及他人（家人/朋友/同事/任何人名或人際關係詞）→ 鼓勵直接分享給對方（例：不妨今天讓對方知道你的感謝）\n"
                    "   - 否則 → 提供一個生活中可留意或行動的建設性建議（30 字以內）\n\n"
                    '只回傳 JSON：{"emotional_summary":"...","action_suggestion":"..."}'
                ),
            }],
        )

        raw = msg.content[0].text if msg.content else ""
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not match:
            raise HTTPException(status_code=502, detail=f"Claude returned non-JSON: {raw[:200]!r}")
        result = json.loads(match.group())
        if not result.get("emotional_summary"):
            raise HTTPException(status_code=502, detail="Empty response from Claude")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("gratitude_summary failed [%s]: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@app.post("/api/gratitude-save")
async def gratitude_save(
    req: GratitudeSaveRequest,
    authorization: str = Header(...),
):
    try:
        token = authorization.removeprefix("Bearer ").strip()
        user_id = await get_user_id(token)

        if req.use_real_name:
            profile_resp = await db().get(
                f"{SUPABASE_REST}/profiles",
                headers=SUPABASE_HEADERS,
                params={"select": "name", "id": f"eq.{user_id}", "limit": "1"},
            )
            profile_name = None
            if profile_resp.status_code == 200:
                rows = profile_resp.json()
                if rows:
                    profile_name = rows[0].get("name")
            anon_name = profile_name or random.choice(ANON_NAMES)
        else:
            anon_name = random.choice(ANON_NAMES)

        payload: dict = {
            "user_id": user_id,
            "item_1": req.item_1,
            "item_2": req.item_2,
            "item_3": req.item_3,
            "is_shared": req.is_shared,
            "anon_name": anon_name,
        }
        if req.ai_feedback:
            payload["ai_feedback"] = req.ai_feedback
        if req.entry_date:
            payload["entry_date"] = req.entry_date
        if req.target_1:
            payload["target_1"] = req.target_1
        if req.target_2:
            payload["target_2"] = req.target_2
        if req.target_3:
            payload["target_3"] = req.target_3
        if req.avatar:
            payload["avatar"] = req.avatar

        db_resp = await db().post(
            f"{SUPABASE_REST}/gratitude_entries",
            headers={**SUPABASE_HEADERS, "Prefer": "return=representation"},
            json=payload,
        )
        if db_resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Supabase error: {db_resp.text}")
        rows = db_resp.json()
        entry_id = rows[0]["id"] if rows else None
        return {"ok": True, "anon_name": anon_name, "entry_id": entry_id}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("gratitude_save failed [%s]: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@app.post("/api/extract-keywords")
async def extract_keywords(req: ExtractKeywordsRequest):
    if not req.entries:
        return {"tags": {}}

    entries_text = "\n\n".join(
        f"ID: {e.id}\n內容：{'; '.join(x for x in [e.item_1, e.item_2, e.item_3] if x)}"
        for e in req.entries
    )

    try:
        msg = await claude().messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": (
                    "你是一個繁體中文文本分析助手。請分析以下感恩日記條目，為每一則提取 2-3 個關鍵詞標籤。\n\n"
                    "每個標籤規則：\n"
                    "- 2-4 個繁體中文字的詞語\n"
                    "- 必須屬於以下四個類別之一：感受、事件、對象、其他\n"
                    "  - 感受：描述情緒或心理狀態（例如：溫暖、感動、平靜）\n"
                    "  - 事件：描述發生的事情（例如：聚餐、完成目標、下雨天）\n"
                    "  - 對象：描述人物或事物（例如：家人、朋友、貓咪）\n"
                    "  - 其他：不屬於以上三類的詞語\n\n"
                    "只回傳以下 JSON 格式，不要其他文字：\n"
                    '{\n'
                    '  "results": [\n'
                    '    {\n'
                    '      "id": "entry_id_here",\n'
                    '      "tags": [\n'
                    '        { "word": "關鍵詞", "category": "感受" },\n'
                    '        { "word": "關鍵詞", "category": "事件" }\n'
                    '      ]\n'
                    '    }\n'
                    '  ]\n'
                    '}\n\n'
                    f"感恩日記條目：\n{entries_text}"
                ),
            }],
        )

        raw = msg.content[0].text if msg.content else ""
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not match:
            return {"tags": {}}

        parsed = json.loads(match.group())
        tags: dict[str, list] = {}
        for result in parsed.get("results", []):
            tags[result["id"]] = result.get("tags", [])[:3]

        return {"tags": tags}

    except Exception as exc:
        logger.error("extract_keywords failed [%s]: %s", type(exc).__name__, exc)
        return {"tags": {}}


# ── Entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=True)
