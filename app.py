import os
import random
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_KEY: str = os.environ["SUPABASE_KEY"]
PORT: int = int(os.environ.get("PORT", 8000))

SUPABASE_REST = f"{SUPABASE_URL}/rest/v1"
SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# shared async HTTP client
_http: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _http
    _http = httpx.AsyncClient(timeout=30)
    yield
    await _http.aclose()


app = FastAPI(title="MindGym API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def db() -> httpx.AsyncClient:
    assert _http is not None
    return _http


# ── Models ─────────────────────────────────────────────────────────────────

class PermaRequest(BaseModel):
    user_id: str
    p: int = Field(ge=1, le=5)
    e: int = Field(ge=1, le=5)
    r: int = Field(ge=1, le=5)
    m: int = Field(ge=1, le=5)
    a: int = Field(ge=1, le=5)


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


# ── Entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=True)
