import asyncio
import io
import json
import logging
import math
import os
import random
import re
from contextlib import asynccontextmanager

import anthropic
import httpx
import openai
from dotenv import load_dotenv

import usage_metering
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import OpenAI
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

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

# OpenAI client for Whisper speech-to-text. Guarded so the app still boots
# if OPENAI_API_KEY is not yet configured.
openai_client: OpenAI | None = None
try:
    openai_client = OpenAI()
except Exception as exc:
    logger.warning("OpenAI initialization failed: %s", exc)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_client_ip)
app.state.limiter = limiter


def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"error": "語音辨識使用過於頻繁，請稍後再試"},
    )


app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)


def db() -> httpx.AsyncClient:
    assert _http is not None
    return _http


def claude() -> anthropic.AsyncAnthropic:
    assert _claude is not None
    return _claude


# ── AI 成本記帳（軌道一：自行計量）──────────────────────────────
# 每次 AI 呼叫後把該次花費寫進 ai_usage_log。設計為 fire-and-forget：
# 用 asyncio.create_task 背景送出、整段包 try/except，無論失敗或延遲都
# 絕不影響使用者拿到回應。需先套用 supabase/usage_monitor.sql 建表。

async def _post_ai_usage(row: dict) -> None:
    try:
        await db().post(
            f"{SUPABASE_REST}/ai_usage_log",
            headers=SUPABASE_HEADERS,
            json=row,
        )
    except Exception as exc:  # 記帳失敗只記 log，不影響主流程
        logger.warning("ai_usage_log write failed [%s]: %s", type(exc).__name__, exc)


def meter_claude(source: str, model: str, usage, user_id: str | None = None) -> None:
    """記錄一次 Claude 呼叫的花費（背景執行，不阻塞）。"""
    try:
        cost, tokens = usage_metering.claude_cost(model, usage)
        row = {
            "provider": "anthropic",
            "source": source,
            "model": model,
            "user_id": user_id,
            "cost_usd": cost,
            **tokens,
        }
        asyncio.create_task(_post_ai_usage(row))
    except Exception as exc:
        logger.warning("meter_claude failed [%s]: %s", type(exc).__name__, exc)


def meter_whisper(source: str, model: str, seconds: float, user_id: str | None = None) -> None:
    """記錄一次 Whisper 呼叫的花費（背景執行，不阻塞）。"""
    try:
        row = {
            "provider": "openai",
            "source": source,
            "model": model,
            "user_id": user_id,
            "audio_seconds": round(float(seconds), 2),
            "cost_usd": usage_metering.whisper_cost(seconds),
        }
        asyncio.create_task(_post_ai_usage(row))
    except Exception as exc:
        logger.warning("meter_whisper failed [%s]: %s", type(exc).__name__, exc)


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


# ── InMind models ──────────────────────────────────────────────────────────

class NarrativeAnswers(BaseModel):
    P: str = Field(description="Positive Emotion narrative")
    E: str = Field(description="Engagement narrative")
    R: str = Field(description="Relationships narrative")
    M: str = Field(description="Meaning narrative")
    A: str = Field(description="Accomplishment narrative")


class PermaScores(BaseModel):
    P: float = Field(ge=1, le=5, description="Positive Emotion score 1-5")
    E: float = Field(ge=1, le=5, description="Engagement score 1-5")
    R: float = Field(ge=1, le=5, description="Relationships score 1-5")
    M: float = Field(ge=1, le=5, description="Meaning score 1-5")
    A: float = Field(ge=1, le=5, description="Accomplishment score 1-5")


class DimensionAnalysis(BaseModel):
    score_reason: str = Field(description="Evidence from the user text justifying the score (繁體中文, ≤60字)")
    comment: str = Field(description="Psychological commentary on this dimension, 精簡有力 (繁體中文, ≤60字)")
    exercise_suggestion: str = Field(description="Concrete actionable micro-exercise, 一句話說清楚 (繁體中文, ≤50字)")


class AllDimensionAnalysis(BaseModel):
    P: DimensionAnalysis
    E: DimensionAnalysis
    R: DimensionAnalysis
    M: DimensionAnalysis
    A: DimensionAnalysis


class CelebMatchResponse(BaseModel):
    name: str = Field(description="從名人池中選出的名字，必須完全符合清單中的中文名字")
    archetype: str = Field(description="該名人的類型標籤（直接使用名人池中提供的 archetype）")
    description: str = Field(description="該名人的簡短介紹，≤50字 (繁體中文)")
    reason: str = Field(description="為什麼這位名人的特質最像使用者，≤80字 (繁體中文)")


class InMindLLMResponse(BaseModel):
    scores: PermaScores
    individual_analysis: AllDimensionAnalysis
    summary_sentence: str = Field(description="一句話概述使用者的整體幸福體質樣態，語氣溫暖有力，20-35字 (繁體中文)")
    celeb_match: CelebMatchResponse


# ── InMind constants / templates ───────────────────────────────────────────

CELEB_POOL = [
    {
        "name": "蔡康永",
        "archetype": "同理主持人",
        "description": "作家、主持人，以深刻同理心與人際敏感度著稱，擅長傾聽與創造有溫度的對話空間。",
        "perma_strength": "R（連結力）",
    },
    {
        "name": "周杰倫",
        "archetype": "心流創作者",
        "description": "音樂創作人，對音樂有近乎偏執的專注與投入，多年來持續創造兼具深度與廣度的作品。",
        "perma_strength": "E（投入力）",
    },
    {
        "name": "吳寶春",
        "archetype": "意志型匠人",
        "description": "世界麵包冠軍，從底層出發、憑藉堅定意志與持續自我突破，成為台灣職人精神的代表。",
        "perma_strength": "A（成就力）",
    },
    {
        "name": "盧廣仲",
        "archetype": "陽光創作者",
        "description": "創作歌手，作品充滿生活溫度與正向能量，以真摯的生命態度感染許多人。",
        "perma_strength": "P（情緒力）",
    },
    {
        "name": "蔣勳",
        "archetype": "美學意義家",
        "description": "藝術家、作家，畢生探索生命美學與人文意義，引導無數人在日常中找到生命的厚度。",
        "perma_strength": "M（意義力）",
    },
    {
        "name": "陳綺貞",
        "archetype": "內省創作者",
        "description": "創作歌手，作品充滿深度的自我探索與意義追尋，以細膩筆觸描繪內心世界。",
        "perma_strength": "M+E（意義力＋投入力）",
    },
    {
        "name": "劉德華",
        "archetype": "自律成就者",
        "description": "演員、歌手，以超高自律與持續努力縱橫演藝圈四十年，正向積極的形象深入人心。",
        "perma_strength": "A+P（成就力＋情緒力）",
    },
    {
        "name": "張惠妹",
        "archetype": "情感共鳴者",
        "description": "歌手，以充沛情感能量與強烈舞台感染力著稱，擅長將情緒轉化為連結他人的橋樑。",
        "perma_strength": "P+R（情緒力＋連結力）",
    },
    {
        "name": "謝哲青",
        "archetype": "旅行意義家",
        "description": "作家、旅行者，遊歷百國後以人文視野重新詮釋生命的意義，鼓勵人們在旅途中認識自己。",
        "perma_strength": "M+R（意義力＋連結力）",
    },
    {
        "name": "吳季剛",
        "archetype": "美學實踐者",
        "description": "時裝設計師，以極度嚴謹的美學標準和對工藝的執著，在國際舞台上建立獨特的藝術風格。",
        "perma_strength": "E+A（投入力＋成就力）",
    },
]

_CELEB_LIST_FOR_PROMPT = "\n".join(
    f"- {c['name']}（{c['archetype']}）：主要 PERMA 強項 {c['perma_strength']}"
    for c in CELEB_POOL
)

SYSTEM_PROMPT = """你是 InMind，一位受過正向心理學訓練的 AI 心理評估師。
你的任務是根據使用者針對 PERMA 五個面向所分享的開放式敘事，客觀地評估每個面向的分數，並提供深度的個人化分析。

## PERMA 五個面向定義

- **P — 正向情緒（Positive Emotion）**：指個體在目前生活中，感知到正向情緒（如愉悅、滿足、正向感）高於負向情緒的程度。
- **E — 全心投入（Engagement）**：指個體沉浸於自己感興趣的事件、工作或活動中，並從中獲得「心流經驗」（Flow）或感到興奮有趣的程度。
- **R — 與他人關係（Relationship）**：指個體藉由人際互動與社交經驗，感受到被愛、獲得支持與幫助，並對自己的人際關係感到滿意的程度。
- **M — 生活意義（Meaning）**：源自於個體對生活目標與方向感的追尋，並從中所感知到自己所做的事情是有價值、值得且具備目的性的程度。
- **A — 成就感（Accomplishment）**：指個體在朝向、達成自己所設定的重要目標時，所獲得的成功經驗，這能進一步提升自我價值與自我效能感。

## 評分標準（1–5 分，以 0.1 分為單位）

每個面向請從四個維度綜合評估：
1. **強度（Intensity）**：敘述中情緒/體驗的深度與鮮明程度
2. **頻率（Frequency）**：描述的事件或狀態是否經常發生
3. **細節度（Granularity）**：具體描述越豐富，代表真實體驗越深刻
4. **情感基調（Tone）**：正向、中性或負向的整體語氣

## 評分尺度

- 1.0：幾乎沒有此面向，或明確描述缺乏
- 2.0：偶爾出現，整體偏低，體驗稀薄
- 3.0：中等程度，有感受但不算深刻
- 4.0：明顯感受，狀態良好，描述具體生動
- 5.0：非常強烈，此面向蓬勃豐盛，細節豐富充沛

## 額外任務

除了評分和個別分析外，你還需要提供：

1. **summary_sentence**：用一句話概述使用者的整體幸福體質樣態，語氣溫暖有力，20-35字

2. **celeb_match**：從以下固定名人池中，選出一位與使用者 PERMA 分數模式最相符的人。
   **必須且只能從此清單中選擇，不可自行新增其他名人：**
{celeb_list}
   根據使用者分數最高的 1-2 個 PERMA 面向，選出對應強項最接近的名人。

## 輸出規則

- 所有文字欄位使用**繁體中文**
- 保持溫暖、支持性的語調，不帶批判
- 確保所有建議都是切實可行且啟發性的"""

SYSTEM_PROMPT = SYSTEM_PROMPT.format(celeb_list=_CELEB_LIST_FOR_PROMPT)

_DIM_LABELS = {"P": "情緒力", "E": "投入力", "R": "連結力", "M": "意義力", "A": "成就力"}


def compute_body_type(total: float) -> tuple[str, str, str]:
    if total <= 10:
        return (
            "C",
            "棉花糖",
            "你目前的心理能量可能正處於高內耗的狀態，像棉花糖碰到水一樣，外在承擔了許多，但內部的核心支撐力還需要慢慢建立。現在最重要的是找到一個讓你感到安全的角落，讓自己先好好補充能量。",
        )
    elif total <= 17:
        return (
            "I",
            "吐司",
            "你的心理狀態中規中矩、結構穩定，能夠應付日常生活中的挑戰，但在面對更複雜的困境時，還有更多彈性可以被開發。就像一片吐司，加上不同的配料和鍛鍊，你可以變得更豐富有力。",
        )
    else:
        return (
            "D",
            "貝果",
            "你目前的心理狀態紮實而有韌性，像貝果一樣經得起外在壓力的考驗。五大指數都在高水位，你的心理核心肌力強健，具備高度的反脆弱性。繼續保持這份紮實，並將這股力量傳遞給身邊的人。",
        )


def compute_balance(scores: dict) -> dict:
    max_dim = max(scores, key=lambda k: scores[k])
    min_dim = min(scores, key=lambda k: scores[k])
    delta = round(scores[max_dim] - scores[min_dim], 2)

    if delta > 2:
        level = "unbalanced"
        assessment = f"你的「{_DIM_LABELS[max_dim]}」與「{_DIM_LABELS[min_dim]}」之間落差達 {delta:.1f} 分，顯示五大指數分佈較不均衡，部分面向需要優先強化。"
        advice = f"建議優先關注「{_DIM_LABELS[min_dim]}」，每天花 5 分鐘進行一個針對此面向的微型練習，持續累積就會看到變化。"
    elif delta >= 1:
        level = "moderate"
        assessment = f"各指數之間有一定落差（{delta:.1f} 分），整體均衡度中等。「{_DIM_LABELS[min_dim]}」仍有明顯的成長空間。"
        advice = f"試著在本週為「{_DIM_LABELS[min_dim]}」安排一項具體的小行動，讓五大指數更趨均衡發展。"
    else:
        level = "balanced"
        assessment = f"你的五大指數分佈相當均衡，最大差距僅 {delta:.1f} 分。心理幸福力的各個面向發展健康而全面。"
        advice = "繼續維持這樣均衡的生活型態！均衡的心理幸福力往往比單一面向的高峰更加持久且穩健。"

    return {
        "max_dim": max_dim,
        "min_dim": min_dim,
        "delta": delta,
        "level": level,
        "assessment": assessment,
        "advice": advice,
    }


DIMENSION_TEMPLATES = {
    "P": {
        "short_term_plan": "每晚睡前花 2 分鐘，寫下今天 3 件讓你心情變好的小事，培養感受愉悅的敏銳度。",
        "long_term_plan": "建立每週 1-2 次的「情緒充電行程」，重複能讓你愉悅的活動，並嘗試擴展新的快樂來源。",
        "daily_practice": "用 1 分鐘深呼吸，回想今天最舒服的瞬間，讓身體記住那種感覺。",
        "next_step_action": "找一個容易感染你好心情的朋友，每週至少一次跟他輕鬆相處 30 分鐘。",
        "partnership_profile": "樂觀開朗、容易被生活小事感動、笑點低、會主動分享美好瞬間的人。在你的同事、社群或興趣圈裡留意這種能量正向的人。",
        "daily_habit": "每天起床後用 30 秒，回想一件今天值得期待的小事。",
        "after_3_days": "你會開始注意到生活中原本被忽略的小確幸。",
        "after_1_week": "面對日常壓力時，會更快找回平靜。",
        "after_2_weeks": "身邊的人開始說你變得『比較好相處』。",
        "after_1_month": "你的情緒底色從中性變得更明亮、更有彈性。",
    },
    "E": {
        "short_term_plan": "每天挑一個小任務，關掉通知、設定 25 分鐘專注時段，記錄完成後的感受。",
        "long_term_plan": "每月嘗試一項新興趣或技能，找出讓你進入「心流」的活動類型。",
        "daily_practice": "做事前先問自己：「我可以多投入 5% 嗎？」然後開始。",
        "next_step_action": "找一個對某事物極度熱衷的朋友，邀請他帶你體驗他的世界。",
        "partnership_profile": "對某個興趣或專業極度投入、聊起來眼睛會發光、能進入心流忘我工作的人。",
        "daily_habit": "每天選 1 件事，全程專注做完不分心（手機放抽屜或開飛航模式）。",
        "after_3_days": "你會驚訝於自己原本可以做到的效率。",
        "after_1_week": "工作中分心被打斷的次數明顯下降。",
        "after_2_weeks": "你開始能進入一種「時間飛逝」的專注狀態。",
        "after_1_month": "你會找到至少一件能讓你完全沉浸其中的事。",
    },
    "R": {
        "short_term_plan": "本週主動聯絡 3 個你想念但很久沒聯絡的朋友，問候不需要有目的。",
        "long_term_plan": "建立每月固定的「關係維繫日」，安排與重要的人深度相處的時間。",
        "daily_practice": "每天傳一則溫暖訊息給某個人，告訴他你的感謝或想念。",
        "next_step_action": "本週找一個讓你信任的人，分享一件你最近的真實感受。",
        "partnership_profile": "善於傾聽、體貼他人感受、有穩定支持網絡、會記得你重要日子的人。",
        "daily_habit": "每天主動向一個人問好或說一句感謝（家人、朋友、同事、店員都行）。",
        "after_3_days": "你會發現有人開始更熱情地回應你。",
        "after_1_week": "你會收到至少一個溫暖的回饋訊息。",
        "after_2_weeks": "你的人際圈會出現一個新的或重新連結的關係。",
        "after_1_month": "你會擁有 2-3 個能說真心話的「安全對象」。",
    },
    "M": {
        "short_term_plan": "每週寫下一個「為什麼我做這件事」，找出日常選擇背後的價值觀。",
        "long_term_plan": "撰寫個人使命宣言，每月檢視自己的行動是否與真正在乎的事一致。",
        "daily_practice": "睡前問自己：「今天有哪一刻覺得自己活得像自己？」",
        "next_step_action": "本週與一位你欽佩的人聊聊，問問他做事的初衷與動力。",
        "partnership_profile": "對人生有清晰使命感、能講出自己的價值觀、行動與信念一致的人。",
        "daily_habit": "每天結束前用 1 分鐘問自己：「今天哪件事讓我覺得有意義？」並寫下一句。",
        "after_3_days": "你會開始辨認出哪些事情其實只是「習慣」而非「重要」。",
        "after_1_week": "你會更勇於拒絕不在乎的事情。",
        "after_2_weeks": "你的時間分配會出現微妙但明確的轉移。",
        "after_1_month": "你會逐漸構建出屬於自己的人生方向感。",
    },
    "A": {
        "short_term_plan": "本週設定一個小到不可能失敗的目標，並具體規劃每天怎麼達成。",
        "long_term_plan": "每月設定一個 3 個月內可達成的中期目標，追蹤進度與調整方法。",
        "daily_practice": "每天睡前寫下一件今天完成的事，再小都算。",
        "next_step_action": "本週找一位執行力強的朋友，請他見證你的某個目標並定期檢查進度。",
        "partnership_profile": "目標導向、執行力強、有自律習慣、能持續推進計畫不放棄的人。",
        "daily_habit": "每天早上寫下「今日最重要的 1 件事」並優先完成。",
        "after_3_days": "你會開始有「今天有把事情做完」的踏實感。",
        "after_1_week": "拖延的次數明顯減少，行動阻力變低。",
        "after_2_weeks": "你開始累積出可見的小成果。",
        "after_1_month": "你會看見自己離某個目標明顯靠近一大步。",
    },
}


def build_constitution_advice(weak_dim: str) -> dict:
    tpl = DIMENSION_TEMPLATES[weak_dim]
    return {
        "weak_dim": weak_dim,
        "short_term_plan": tpl["short_term_plan"],
        "long_term_plan": tpl["long_term_plan"],
        "daily_practice": tpl["daily_practice"],
    }


def build_advanced_analysis(weak_dim: str, max_dim: str) -> dict:
    tpl = DIMENSION_TEMPLATES[weak_dim]
    weak_label = _DIM_LABELS[weak_dim]
    max_label = _DIM_LABELS[max_dim]
    synergy = (
        f"你優勢的「{max_label}」能為關係注入價值與動力，"
        f"而對方強大的「{weak_label}」能補足你最不足的部分，"
        f"兩種特質結合能讓你們彼此撐持、互相填滿。"
    )
    return {
        "complementary_dim": weak_dim,
        "synergy_explanation": synergy,
        "next_step_action": tpl["next_step_action"],
        "partnership_profile": tpl["partnership_profile"],
    }


def build_take_action(weak_dim: str) -> dict:
    tpl = DIMENSION_TEMPLATES[weak_dim]
    return {
        "daily_habit": tpl["daily_habit"],
        "after_3_days": tpl["after_3_days"],
        "after_1_week": tpl["after_1_week"],
        "after_2_weeks": tpl["after_2_weeks"],
        "after_1_month": tpl["after_1_month"],
    }


def _normal_cdf(x: float, mu: float, sigma: float) -> float:
    return 0.5 * (1 + math.erf((x - mu) / (sigma * math.sqrt(2))))


def compute_percentile(total: float) -> dict:
    general_pr = round(_normal_cdf(total, mu=14.0, sigma=3.5) * 100)
    youth_pr = round(_normal_cdf(total, mu=13.0, sigma=3.8) * 100)
    return {
        "general": max(1, min(99, general_pr)),
        "youth": max(1, min(99, youth_pr)),
    }


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/healthz")
async def health():
    return {"ok": True}


@app.post("/api/perma")
async def save_perma(
    req: PermaRequest,
    authorization: str = Header(...),
):
    try:
        # user_id 一律取自登入 token，不信任 request body（防止替他人寫入分數）
        token = authorization.removeprefix("Bearer ").strip()
        user_id = await get_user_id(token)
        resp = await db().post(
            f"{SUPABASE_REST}/perma_scores",
            headers=SUPABASE_HEADERS,
            json={
                "user_id": user_id,
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
            model="claude-haiku-4-5-20251001",
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
        meter_claude("gratitude", "claude-haiku-4-5-20251001", msg.usage, user_id)

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
        user_id = await get_user_id(token)

        msg = await claude().messages.create(
            model="claude-haiku-4-5-20251001",
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
        meter_claude("tag-targets", "claude-haiku-4-5-20251001", msg.usage, user_id)

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
        user_id = await get_user_id(token)

        tone = (
            "使用者選擇了「進階」模式，請更深入地反映其覺察與內在意義。"
            if req.difficulty == "advanced"
            else "使用者選擇了「初階」模式，請以溫柔、平實、簡短的語氣陪伴。"
        )

        msg = await claude().messages.create(
            model="claude-haiku-4-5-20251001",
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
        meter_claude("gratitude-summary", "claude-haiku-4-5-20251001", msg.usage, user_id)

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
async def extract_keywords(
    req: ExtractKeywordsRequest,
    authorization: str = Header(...),
):
    # 需登入才能呼叫，避免匿名流量消耗 Claude API 額度
    token = authorization.removeprefix("Bearer ").strip()
    user_id = await get_user_id(token)
    if not req.entries:
        return {"tags": {}}

    entries_text = "\n\n".join(
        f"ID: {e.id}\n內容：{'; '.join(x for x in [e.item_1, e.item_2, e.item_3] if x)}"
        for e in req.entries
    )

    try:
        msg = await claude().messages.create(
            model="claude-haiku-4-5-20251001",
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
        meter_claude("extract-keywords", "claude-haiku-4-5-20251001", msg.usage, user_id)

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


@app.post("/api/report")
async def generate_report(
    answers: NarrativeAnswers,
    authorization: str = Header(...),
):
    token = authorization.removeprefix("Bearer ").strip()
    user_id = await get_user_id(token)

    for field, text in answers.model_dump().items():
        if len(text.strip()) < 10:
            return JSONResponse(
                content={"error": f"「{_DIM_LABELS[field]}」的回答過短，請提供更多描述。"},
                status_code=400,
            )

    user_content = f"""以下是使用者針對 PERMA 五個面向所分享的敘事：

【P — 正向情緒】
{answers.P}

【E — 投入／心流】
{answers.E}

【R — 人際關係】
{answers.R}

【M — 意義感】
{answers.M}

【A — 成就感】
{answers.A}

請根據以上敘事，評估每個面向的分數（1–5 分），並為每個面向提供評分依據、心理解析與心理練習建議。"""

    try:
        response = await claude().messages.parse(
            model="claude-sonnet-4-5",
            max_tokens=2500,
            temperature=0.2,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
            output_format=InMindLLMResponse,
        )
        meter_claude("report", "claude-sonnet-4-5", response.usage, user_id)

        result = response.parsed_output
        if result is None:
            return JSONResponse(
                content={"error": "AI 回應解析失敗，請稍後重試"},
                status_code=500,
            )

        scores_dict = result.scores.model_dump()
        total = round(sum(scores_dict.values()), 2)

        body_type, body_type_label, body_type_context = compute_body_type(total)
        balance = compute_balance(scores_dict)
        percentile = compute_percentile(total)

        weak_dim = balance["min_dim"]
        max_dim = balance["max_dim"]
        constitution_advice = build_constitution_advice(weak_dim)
        advanced_analysis = build_advanced_analysis(weak_dim, max_dim)
        take_action = build_take_action(weak_dim)

        response_data = {
            "scores": scores_dict,
            "individual_analysis": result.individual_analysis.model_dump(),
            "total_score": total,
            "body_type": body_type,
            "body_type_label": body_type_label,
            "body_type_context": body_type_context,
            "balance": balance,
            "percentile": percentile,
            "summary_sentence": result.summary_sentence,
            "celeb_match": result.celeb_match.model_dump(),
            "constitution_advice": constitution_advice,
            "advanced_analysis": advanced_analysis,
            "take_action": take_action,
        }

        try:
            # p_score 等欄位是 int（1–5），LLM 分數帶 0.1 小數，直接插入會被
            # Postgres 以 22P02 拒絕、整筆遺失 → 寫入前四捨五入，
            # 完整浮點分數保留在 report_json.scores。
            perma_resp = await db().post(
                f"{SUPABASE_REST}/perma_scores",
                headers=SUPABASE_HEADERS,
                json={
                    "user_id": user_id,
                    "p_score": min(5, max(1, round(scores_dict["P"]))),
                    "e_score": min(5, max(1, round(scores_dict["E"]))),
                    "r_score": min(5, max(1, round(scores_dict["R"]))),
                    "m_score": min(5, max(1, round(scores_dict["M"]))),
                    "a_score": min(5, max(1, round(scores_dict["A"]))),
                    "report_json": response_data,
                },
            )
            if perma_resp.status_code not in (200, 201):
                logger.error("perma_scores insert non-2xx: %s", perma_resp.text)
        except Exception as db_err:
            logger.error("perma_scores insert failed: %s", db_err)

        return response_data

    except anthropic.AuthenticationError:
        return JSONResponse(
            content={"error": "API 金鑰無效，請檢查 ANTHROPIC_API_KEY 環境變數"},
            status_code=401,
        )
    except anthropic.RateLimitError:
        return JSONResponse(
            content={"error": "請求過於頻繁，請稍後再試"},
            status_code=429,
        )
    except Exception as exc:
        logger.error("generate_report failed [%s]: %s", type(exc).__name__, exc)
        return JSONResponse(
            content={"error": f"分析失敗：{str(exc)}"},
            status_code=500,
        )


# ── Speech-to-text ─────────────────────────────────────────────────────────

_MAX_AUDIO_BYTES = 10 * 1024 * 1024
_ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg",
    "audio/wav", "audio/x-wav", "audio/m4a", "audio/x-m4a",
}


@app.post("/api/transcribe")
@limiter.limit("20/minute")
async def transcribe(
    request: Request,
    audio: UploadFile = File(...),
    authorization: str = Header(...),
):
    # 需登入才能呼叫，避免匿名流量消耗 OpenAI 額度（比照其他端點）
    token = authorization.removeprefix("Bearer ").strip()
    user_id = await get_user_id(token)

    if openai_client is None:
        return JSONResponse(
            content={"error": "語音辨識服務未啟用，請設定 OPENAI_API_KEY"},
            status_code=503,
        )

    content_type = (audio.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in _ALLOWED_AUDIO_TYPES:
        return JSONResponse(
            content={"error": "不支援的檔案格式，此功能僅接受語音錄音"},
            status_code=415,
        )

    data = await audio.read()
    if len(data) == 0:
        return JSONResponse(content={"error": "音訊檔案為空，請重新錄音"}, status_code=400)
    if len(data) > _MAX_AUDIO_BYTES:
        return JSONResponse(
            content={"error": "錄音過長（上限約 10MB），請縮短錄音時間"},
            status_code=400,
        )

    buf = io.BytesIO(data)
    buf.name = audio.filename or "recording.webm"

    try:
        # verbose_json 會多回傳 duration（音訊秒數），用來精準換算 Whisper 花費。
        result = openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=buf,
            language="zh",
            prompt="以下是繁體中文的內容。",
            response_format="verbose_json",
        )
        meter_whisper("whisper", "whisper-1", getattr(result, "duration", 0) or 0, user_id)
        return {"text": (result.text or "").strip()}
    except openai.AuthenticationError:
        return JSONResponse(
            content={"error": "OpenAI 金鑰無效，請檢查 OPENAI_API_KEY 環境變數"},
            status_code=401,
        )
    except openai.RateLimitError as exc:
        body = getattr(exc, "body", {}) or {}
        code = (body.get("error") or {}).get("code", "") if isinstance(body, dict) else ""
        if "quota" in str(code).lower() or "quota" in str(exc).lower():
            msg = "語音辨識配額已用盡，請確認 OpenAI 帳戶餘額後再試"
        else:
            msg = "語音辨識請求過於頻繁，請稍後幾秒再試"
        return JSONResponse(content={"error": msg}, status_code=429)
    except Exception as exc:
        logger.error("transcribe failed [%s]: %s", type(exc).__name__, exc)
        return JSONResponse(
            content={"error": f"語音辨識失敗：{str(exc)}"},
            status_code=500,
        )


# ── Entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=True)
