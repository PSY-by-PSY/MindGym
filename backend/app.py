import asyncio
import io
import json
import logging
import math
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

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

class GratitudeTagRequest(BaseModel):
    item_1: str
    item_2: str
    item_3: str


class GratitudeSummaryRequest(BaseModel):
    item_1: str
    item_2: str
    item_3: str
    difficulty: str = "basic"


# ── Process Goal Awareness models（過程目標覺察）────────────────────────────

# ── 過程目標覺察（全新版）─────────────────────────────────────────────────
# 模組一【專注時刻記錄】：解構人時地事 → 收斂核心專注需求(insight) + 活動類別。
# 模組二【提升專注錦囊】：把使用者過去的專注紀錄帶進來，AI 嚴格依活動類別篩選，
#   再把相近成功經驗的底層條件「遷移並擴大」成可立即執行的建議。
class FocusInsightRequest(BaseModel):
    event: str = ""        # 事件與感受
    who: str = ""          # 人物
    when_time: str = ""    # 時間
    where_place: str = ""  # 地點


class FocusMomentRecord(BaseModel):
    event: str = ""
    who: str = ""
    when_time: str = ""
    where_place: str = ""
    insight: str = ""
    category: str = ""


class FocusBoostRequest(BaseModel):
    current_situation: str = ""  # 目前難以專注的事件與情境
    records: list[FocusMomentRecord] = Field(default_factory=list)  # 過去的專注時刻紀錄


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
            system="你是 BOUBA，心理學取向的健心陪伴者。用繁體中文回應，語氣溫暖不批判。只回傳 JSON，不要前言或 markdown。",
            messages=[{
                "role": "user",
                "content": (
                    f"使用者今天寫下的三件感恩：\n"
                    f"1. {req.item_1}\n"
                    f"2. {req.item_2}\n"
                    f"3. {req.item_3}\n\n"
                    f"{tone}\n\n"
                    "生成：\n"
                    "1. emotional_summary：一句話溫柔反映使用者今天的正向情緒（30 字以內）\n"
                    "2. resonance_story：以「我曾經聽過有人……」的口吻，講一個與使用者內容相似、"
                    "屬於『別人』的簡短情境（60～90 字），可虛構，重點是有共鳴，"
                    "並在結尾自然帶出一個給使用者不同視角的小體悟。不要提供任何行動建議或要求使用者做什麼。\n\n"
                    '只回傳 JSON：{"emotional_summary":"...","resonance_story":"..."}'
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
            model="claude-haiku-4-5-20251001",
            max_tokens=2500,
            temperature=0.2,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
            output_format=InMindLLMResponse,
        )
        meter_claude("report", "claude-haiku-4-5-20251001", response.usage, user_id)

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


# ── Process Goal Awareness endpoints（過程目標覺察）─────────────────────────
# 沿用既有慣例：輕量端點用 Haiku、只回傳 JSON、背景記帳、解析失敗丟 502 讓
# 前端走 fallback。資料寫入一律由前端直接打 Supabase（RLS），這裡只做 AI。

_PG_MODEL = "claude-haiku-4-5-20251001"


async def _pg_claude_json(
    source: str, user_id: str, system: str, user_content: str, max_tokens: int = 512, model: str = _PG_MODEL
) -> dict:
    msg = await claude().messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    meter_claude(source, model, msg.usage, user_id)
    raw = msg.content[0].text if msg.content else ""
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise HTTPException(status_code=502, detail=f"Claude returned non-JSON: {raw[:200]!r}")
    return json.loads(match.group())


@app.post("/api/pg/focus-insight")
async def pg_focus_insight(req: FocusInsightRequest, authorization: str = Header(...)):
    """模組一【專注時刻記錄】：解構人時地事，收斂使用者真正的核心專注需求(insight)，
    並判定這次專注屬於哪一類活動(category)，供模組二嚴格比對。"""
    try:
        token = authorization.removeprefix("Bearer ").strip()
        user_id = await get_user_id(token)
        content = (
            "使用者記錄了一個讓自己特別專注的時刻，請解構並收斂。\n\n"
            f"事件與感受：{req.event or '（未填）'}\n"
            f"人物：{req.who or '（未填）'}\n"
            f"時間：{req.when_time or '（未填）'}\n"
            f"地點：{req.where_place or '（未填）'}\n\n"
            "1. insight：從『人、時、地、事』推論使用者真正需要的核心專注條件"
            "（看穿表面、講出底層心理／環境需求）。例：『在咖啡廳做事很專注』→"
            "『你可能需要有規律環境噪音、身旁有人的空間，完全孤立反而不適合你』。"
            "用溫暖、像懂你的朋友的口吻對『你』說話，2~3 句、80 字內。\n"
            "2. category：這次專注活動的類別，只能是以下英文鍵之一："
            "static（讀書/寫作/思考/編程/規劃）、dynamic（運動/體力活動）、"
            "life（家事/整理/採買/雜務）、social（社交/會議/溝通）、"
            "creative（畫畫/音樂/設計/手作）、other（其他）。\n"
            "3. condition_tags：挑 2~4 個最能代表專注條件的精簡關鍵詞。\n"
            '只回傳 JSON：{"insight":"...","category":"static","condition_tags":["...","..."]}'
        )
        data = await _pg_claude_json(
            "pg-focus-insight", user_id,
            "你是 BOUBA，溫暖敏銳的專注力陪伴者，擅長看穿條件背後真正的需求。用繁體中文回應，只回傳 JSON，不要前言或 markdown。",
            content,
        )
        cat = (data.get("category") or "other").strip().lower()
        if cat not in {"static", "dynamic", "life", "social", "creative", "other"}:
            cat = "other"
        return {
            "insight": data.get("insight", ""),
            "category": cat,
            "condition_tags": data.get("condition_tags") or [],
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("pg_focus_insight failed [%s]: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


_CATEGORY_LABELS = {
    "static": "靜態認知（讀書/寫作/思考/編程/規劃）",
    "dynamic": "動態身體（運動/訓練/體力活動）",
    "life": "生活雜事（家事/整理/採買/雜務）",
    "social": "人際互動（社交/會議/溝通/合作）",
    "creative": "創作表達（畫畫/音樂/設計/手作）",
    "other": "其他",
}


@app.post("/api/pg/focus-boost")
async def pg_focus_boost(req: FocusBoostRequest, authorization: str = Header(...)):
    """模組二【提升專注錦囊】：嚴格依活動類別比對歷史『專注時刻記錄』，
    把相近成功經驗的底層條件遷移並擴大成可立即執行的建議。"""
    try:
        token = authorization.removeprefix("Bearer ").strip()
        user_id = await get_user_id(token)

        if req.records:
            lines = []
            for i, r in enumerate(req.records, 1):
                label = _CATEGORY_LABELS.get((r.category or "other"), r.category or "其他")
                lines.append(
                    f"[紀錄{i}] 類別={r.category or 'other'}（{label}）\n"
                    f"  事件：{r.event or '（未填）'}\n"
                    f"  人：{r.who or '—'}／時：{r.when_time or '—'}／地：{r.where_place or '—'}\n"
                    f"  核心需求：{r.insight or '（未整理）'}"
                )
            records_block = "\n".join(lines)
        else:
            records_block = "（使用者目前還沒有任何專注時刻記錄）"

        content = (
            "使用者現在遇到一件難以專注的事，想要一個能立刻試的方法。\n\n"
            f"【目前的困境】\n{req.current_situation or '（未填）'}\n\n"
            "【使用者過去的專注時刻記錄】\n"
            f"{records_block}\n\n"
            "1. 判定『目前困境』屬於哪一類活動（static 靜態認知／dynamic 動態身體／"
            "life 生活雜事／social 人際互動／creative 創作表達／other）。\n"
            "2. 【嚴格禁止跨類別類比】只能參考『相同或高度相容類別』的歷史紀錄"
            "（static 與 creative 可互通，但絕不可拿 dynamic 的經驗套用到 static，反之亦然）。"
            "例：現在『背單字無法專注』(static)，不可用『運動很專注』(dynamic) 的經驗建議。\n"
            "3. 找到相容紀錄後，提取其底層專注條件（如身旁有人、特定時段、環境聲音等），"
            "遷移擴大成具體、有創意的行動建議（不必是完全相同地點）。\n"
            "4. 若無相容類別的紀錄（has_match=false），誠實說明還沒有這類專注紀錄，"
            "鼓勵去【專注時刻記錄】補一筆，並給一個通用的小起步建議。\n\n"
            '只回傳 JSON：{"has_match":true,"category":"static",'
            '"matched_summary":"（參考了哪一筆過去經驗，一句話）",'
            '"suggestion":"（溫暖、具體、可立即執行的建議，120 字內，對「你」說）"}'
        )
        data = await _pg_claude_json(
            "pg-focus-boost", user_id,
            "你是 BOUBA，專注力陪伴者，最重要的紀律是絕不做跨活動類型的錯誤類比。"
            "用繁體中文回應，只回傳 JSON，不要前言或 markdown。",
            content,
            max_tokens=640,
        )
        cat = (data.get("category") or "other").strip().lower()
        if cat not in _CATEGORY_LABELS:
            cat = "other"
        return {
            "has_match": bool(data.get("has_match", False)),
            "category": cat,
            "matched_summary": data.get("matched_summary", ""),
            "suggestion": data.get("suggestion", ""),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("pg_focus_boost failed [%s]: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


# ── 專業模組區（Professional Modules）─────────────────────────────────────
# 兩個端點：模組送審（AI 安全標籤）＋ 個案打卡的危機判讀。沿用既有慣例：
# Authorization → get_user_id、meter_claude 記帳、prompt 要求只回 JSON、regex 抽 JSON、
# logger.error + 500。與前端純用 anon key + RLS 不同，這兩個端點需要用 service key
# 讀寫追蹤資料（繞過 RLS），因此寫表放在後端。

_PRO_REVIEW_MODEL = "claude-haiku-4-5-20251001"
_CRISIS_MODEL = "claude-haiku-4-5-20251001"


# 危機偵測關鍵字（保守、低誤報）。
# 注意：修改時要同步前端 src/lib/proModules.ts 的同一份 CRISIS_KEYWORDS。
# 刻意不收「要死」「死了」這類高誤報詞——語意層交給 AI（第二層）。
CRISIS_KEYWORDS = [
    "自殺", "自傷", "想死", "想不開", "不想活", "活不下去", "結束生命",
    "結束自己", "傷害自己", "割腕", "輕生", "尋短", "想消失", "沒有活下去",
    "燒炭", "跳樓", "了結",
]

_PRO_REVIEW_SYSTEM = """你是心理健康 App 的安全審核助手，審核標準以心理學為依據。
你要審核一份由助人工作者設計、即將提供給個案（可能處於心理脆弱狀態）使用的練習模組。
請逐項檢查：
(a) 心理安全：羞辱或批判性語言、可能誘發創傷或自傷意念的引導、對脆弱族群不當的技術、
    誇大療效承諾、危機情境下的不當指示。
(b) 資訊安全：要求個案填寫個資（身分證/住址/財務/病歷）、引導至站外連結或私下聯絡、
    任何可能損害個案權益的資料蒐集。
(c) 心理學根據：內容是否有可辨識的心理學理論基礎（僅註記，不評分）。
你只做安全「標籤」，供人工審核參考，絕不做最終裁決。
只回傳 JSON，不要任何前言或 markdown：
{"risk_level":"low|medium|high",
 "psych_safety":[{"severity":"low|medium|high","quote":"原文引用","reason":"為何有疑慮"}],
 "info_safety":[{"severity":"low|medium|high","quote":"原文引用","reason":"為何有疑慮"}],
 "psychology_basis_note":"對心理學根據的簡短說明",
 "summary":"一句話總結整體風險"}
沒有疑慮時對應陣列回空陣列 []。"""

# kind 感知附加指示：diary 檢查回饋設定是否誘發依賴/過度承諾；
# assessment 額外要求輸出 copyright_note / clinical_risk_note 兩個頂層欄位。
_PRO_REVIEW_KIND_APPENDIX = {
    "diary": (
        "\n\n這是一個「日記模組」（個案每日重複填寫，附 AI 回饋設定）。"
        "額外檢查 feedback 設定：回饋風格或訊息是否可能誘發對 App/AI 的心理依賴、"
        "是否對療效或情緒改善做出過度承諾。若有疑慮請計入 psych_safety。"
    ),
    "assessment": (
        "\n\n這是一個「量表轉譯質性測驗模組」（將心理量表轉譯為開放式問題）。"
        "額外輸出兩個頂層欄位："
        '"copyright_note"：檢查 questions 的 original 欄位是否疑似逐字或近乎逐字收錄受版權保護的'
        "標準化量表題目（而非合理濃縮改寫），有疑慮則說明，沒有則回空字串；"
        '"clinical_risk_note"：檢查是否含有臨床診斷性宣稱（例如「你有憂鬱症」），有疑慮則說明，沒有則回空字串。'
    ),
}


class SubmitModuleRequest(BaseModel):
    module_id: str


class EntrySafetyCheckRequest(BaseModel):
    entry_id: str
    texts: list[str] = Field(default_factory=list)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _is_practitioner(user_id: str) -> bool:
    """用 service key 查 user_roles 確認呼叫者是專業夥伴（繞過 RLS）。"""
    resp = await db().get(
        f"{SUPABASE_REST}/user_roles",
        headers=SUPABASE_HEADERS,
        params={"user_id": f"eq.{user_id}", "role": "eq.practitioner", "select": "role"},
    )
    return resp.status_code == 200 and len(resp.json()) > 0


async def _pro_ai_review(user_id: str, title: str, description: str, draft_content, kind: str = "practice") -> dict:
    """對模組跑 AI 安全標籤。任何失敗都回 {"error": ...}，交由人工審核兜底（不阻擋送審）。"""
    try:
        content = (
            "請審核以下由專業夥伴設計、即將提供給個案使用的心理練習模組。\n\n"
            f"【標題】{title}\n"
            f"【說明】{description}\n"
            f"【內容 JSON】\n{json.dumps(draft_content, ensure_ascii=False)}\n"
        )
        system = _PRO_REVIEW_SYSTEM + _PRO_REVIEW_KIND_APPENDIX.get(kind, "")
        msg = await claude().messages.create(
            model=_PRO_REVIEW_MODEL,
            max_tokens=1500,
            temperature=0.2,
            system=system,
            messages=[{"role": "user", "content": content}],
        )
        meter_claude("pro-submit-module", _PRO_REVIEW_MODEL, msg.usage, user_id)
        raw = msg.content[0].text if msg.content else ""
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return {"error": "AI 審核暫時無法使用"}
        return json.loads(match.group())
    except Exception as exc:
        logger.warning("pro_ai_review failed [%s]: %s", type(exc).__name__, exc)
        return {"error": "AI 審核暫時無法使用"}


@app.post("/api/pro/submit-module")
async def pro_submit_module(req: SubmitModuleRequest, authorization: str = Header(...)):
    """送審＝AI 標籤 + 改狀態，一次完成。AI 只是輔助，失敗也照常進人工佇列。"""
    try:
        token = authorization.removeprefix("Bearer ").strip()
        user_id = await get_user_id(token)

        # 1. 取模組、驗證擁有者／角色／狀態／草稿非空
        resp = await db().get(
            f"{SUPABASE_REST}/pro_modules",
            headers=SUPABASE_HEADERS,
            params={
                "id": f"eq.{req.module_id}",
                "select": "id,owner_id,title,description,draft_content,status,kind",
            },
        )
        rows = resp.json() if resp.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="模組不存在")
        module = rows[0]
        if module.get("owner_id") != user_id:
            raise HTTPException(status_code=403, detail="僅限模組擁有者送審")
        if not await _is_practitioner(user_id):
            raise HTTPException(status_code=403, detail="僅限專業夥伴送審")
        if module.get("status") not in ("draft", "rejected", "approved"):
            raise HTTPException(status_code=409, detail="此狀態無法送審")
        draft = module.get("draft_content")
        if not draft:
            raise HTTPException(status_code=400, detail="草稿內容為空，無法送審")

        # 2~3. AI 安全標籤（失敗回 {"error": ...}，不阻擋）
        ai_review = await _pro_ai_review(
            user_id, module.get("title") or "", module.get("description") or "", draft,
            kind=module.get("kind") or "practice",
        )

        # 4. service key 更新狀態 + 寫審核軌跡
        await db().patch(
            f"{SUPABASE_REST}/pro_modules",
            headers=SUPABASE_HEADERS,
            params={"id": f"eq.{req.module_id}"},
            json={
                "ai_review": ai_review,
                "status": "pending_review",
                "submitted_at": _now_iso(),
            },
        )
        await db().post(
            f"{SUPABASE_REST}/pro_module_review_log",
            headers=SUPABASE_HEADERS,
            json={
                "module_id": req.module_id,
                "action": "submitted",
                "actor_id": user_id,
                "content_snapshot": draft,
                "ai_review": ai_review,
            },
        )

        # 5. 回傳
        return {"ok": True, "risk_level": ai_review.get("risk_level")}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("pro_submit_module failed [%s]: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


async def _insert_crisis_alert(
    user_id: str, practitioner_id: str, module_id, entry_id, source: str, severity: str, matched_terms: list
) -> None:
    """用 service key 寫入 crisis_alerts（後端主路徑，不受 RLS 限制）。"""
    try:
        await db().post(
            f"{SUPABASE_REST}/crisis_alerts",
            headers=SUPABASE_HEADERS,
            json={
                "user_id": user_id,
                "practitioner_id": practitioner_id,
                "module_id": module_id,
                "entry_id": entry_id,
                "source": source,
                "severity": severity,
                "matched_terms": matched_terms,
            },
        )
    except Exception as exc:
        logger.error("insert crisis_alert failed [%s]: %s", type(exc).__name__, exc)


@app.post("/api/pro/entry-safety-check")
async def pro_entry_safety_check(req: EntrySafetyCheckRequest, authorization: str = Header(...)):
    """危機判讀：第一層關鍵字（零成本、命中即 high），未命中才走第二層 AI 語意。
    寧可誤報、不可漏報；有風險就寫 crisis_alerts 並回傳給前端顯示求助資源。"""
    try:
        token = authorization.removeprefix("Bearer ").strip()
        user_id = await get_user_id(token)

        # 1. 取 entry、驗證屬於此人，並找對應 active enrollment 取 practitioner/module
        resp = await db().get(
            f"{SUPABASE_REST}/pro_entries",
            headers=SUPABASE_HEADERS,
            params={"id": f"eq.{req.entry_id}", "select": "id,user_id,module_id"},
        )
        rows = resp.json() if resp.status_code == 200 else []
        if not rows or rows[0].get("user_id") != user_id:
            return {"risk": "none"}
        module_id = rows[0].get("module_id")

        enr = await db().get(
            f"{SUPABASE_REST}/pro_enrollments",
            headers=SUPABASE_HEADERS,
            params={
                "module_id": f"eq.{module_id}",
                "user_id": f"eq.{user_id}",
                "status": "eq.active",
                "select": "practitioner_id",
                "limit": "1",
            },
        )
        enr_rows = enr.json() if enr.status_code == 200 else []
        if not enr_rows:
            return {"risk": "none"}
        practitioner_id = enr_rows[0]["practitioner_id"]

        joined = "\n".join(t for t in req.texts if t and t.strip())
        if not joined.strip():
            return {"risk": "none"}

        # 2. 第一層：關鍵字（零成本）。命中直接判 high，不再呼叫 AI。
        matched = [kw for kw in CRISIS_KEYWORDS if kw in joined]
        if matched:
            await _insert_crisis_alert(user_id, practitioner_id, module_id, req.entry_id, "keyword", "high", matched)
            return {"risk": "high", "matched_terms": matched}

        # 3. 第二層：AI 語意（關鍵字未命中才呼叫）。AI 失敗視為 none（前端另有 fallback）。
        risk = "none"
        try:
            msg = await claude().messages.create(
                model=_CRISIS_MODEL,
                max_tokens=256,
                system="你是心理危機辨識助手，只回傳 JSON，不要任何前言或 markdown。",
                messages=[{
                    "role": "user",
                    "content": (
                        "判斷以下文字是否流露自我傷害、自殺意念或嚴重心理危機（含隱晦表達，"
                        "如告別、交代後事、覺得自己是負擔）。寧可誤報、不可漏報。\n\n"
                        f"{joined}\n\n"
                        '只回傳 JSON：{"risk":"none|medium|high","reason":"..."}'
                    ),
                }],
            )
            meter_claude("pro-entry-safety", _CRISIS_MODEL, msg.usage, user_id)
            raw = msg.content[0].text if msg.content else ""
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            if m:
                data = json.loads(m.group())
                r = str(data.get("risk", "none")).lower()
                if r in ("medium", "high"):
                    risk = r
        except Exception as exc:
            logger.warning("pro_entry_safety AI failed [%s]: %s", type(exc).__name__, exc)
            risk = "none"

        if risk != "none":
            await _insert_crisis_alert(user_id, practitioner_id, module_id, req.entry_id, "ai", risk, [])
        return {"risk": risk, "matched_terms": []}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("pro_entry_safety_check failed [%s]: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


# ── 日記模組：每日即時回饋 + 定期回顧（整體／週報／內建感恩日記週回顧）─────────
# 沿用既有慣例：service key 讀寫追蹤資料、meter_claude 記帳、AI 失敗回 fallback 不阻擋。

_REVIEW_MODEL = "claude-haiku-4-5-20251001"

_DIARY_STYLE_PROMPTS = {
    "warm": "語氣溫暖肯定，像朋友一樣給予溫暖的肯定與陪伴感。",
    "reflective": "在肯定之餘，多問使用者一個開放式問題，帶著他想深一點。",
    "brief": "極簡短的一句話鼓勵，不多加解釋。",
    "zen": "留白、簡短、有呼吸感的句子，不說教。",
    "celebrate": "用熱情、慶祝的語氣，為使用者今天的紀錄喝采。",
}

_DIARY_FEEDBACK_FALLBACK = {"style": "warm", "text": "謝謝你今天願意好好陪自己看看這些感受。"}


class DiaryFeedbackRequest(BaseModel):
    entry_id: str


class DiaryReviewRequest(BaseModel):
    module_id: str
    review_type: str  # 'overall' | 'weekly'


class GratitudeWeeklyRequest(BaseModel):
    period_start: str  # YYYY-MM-DD，週一


class WeeklyDigestRequest(BaseModel):
    period_start: str  # YYYY-MM-DD，週一


async def _get_active_enrollment(module_id: str, user_id: str) -> dict | None:
    resp = await db().get(
        f"{SUPABASE_REST}/pro_enrollments",
        headers=SUPABASE_HEADERS,
        params={
            "module_id": f"eq.{module_id}", "user_id": f"eq.{user_id}", "status": "eq.active",
            "select": "id,practitioner_id", "limit": "1",
        },
    )
    rows = resp.json() if resp.status_code == 200 else []
    return rows[0] if rows else None


def _entry_texts(answers: dict) -> list[str]:
    return [v for v in (answers or {}).values() if isinstance(v, str) and v.strip()]


@app.post("/api/pro/diary-feedback")
async def pro_diary_feedback(req: DiaryFeedbackRequest, authorization: str = Header(...)):
    """日記模組每日即時 AI 回饋。任何失敗都回固定 fallback 文案（仍寫回 pro_entries）。"""
    token = authorization.removeprefix("Bearer ").strip()
    user_id = await get_user_id(token)

    try:
        resp = await db().get(
            f"{SUPABASE_REST}/pro_entries",
            headers=SUPABASE_HEADERS,
            params={"id": f"eq.{req.entry_id}", "select": "id,user_id,module_id,answers"},
        )
        rows = resp.json() if resp.status_code == 200 else []
        if not rows or rows[0].get("user_id") != user_id:
            raise HTTPException(status_code=404, detail="紀錄不存在")
        entry = rows[0]
        module_id = entry["module_id"]

        if not await _get_active_enrollment(module_id, user_id):
            raise HTTPException(status_code=403, detail="尚未追蹤此模組")

        mod_resp = await db().get(
            f"{SUPABASE_REST}/pro_modules",
            headers=SUPABASE_HEADERS,
            params={"id": f"eq.{module_id}", "select": "id,kind,published_content"},
        )
        mod_rows = mod_resp.json() if mod_resp.status_code == 200 else []
        if not mod_rows or mod_rows[0].get("kind") != "diary":
            raise HTTPException(status_code=400, detail="非日記模組")
        content = mod_rows[0].get("published_content") or {}
        daily_cfg = (content.get("feedback") or {}).get("daily") or {}
        if not daily_cfg.get("enabled", True):
            return {"style": None, "text": None}
        style = daily_cfg.get("style") or "warm"
        style_prompt = _DIARY_STYLE_PROMPTS.get(style, _DIARY_STYLE_PROMPTS["warm"])

        joined = "\n".join(_entry_texts(entry.get("answers"))) or "（沒有文字作答）"
        system = (
            "你是心理健康 App 的日記陪伴回饋助手。" + style_prompt +
            "回應限 80 字以內，繁體中文，不做診斷、不建議用藥；若內容顯得情緒沉重，"
            "只給予穩定、陪伴的語氣，不追問細節、不說教。只回傳 JSON，不要任何前言或 markdown。"
        )
        try:
            data = await _pg_claude_json(
                "pro-diary-feedback", user_id, system,
                f"使用者今天的日記內容：\n{joined}\n\n只回傳 JSON：{{\"text\":\"...\"}}",
                max_tokens=200,
            )
            text = (data.get("text") or "").strip() or _DIARY_FEEDBACK_FALLBACK["text"]
        except Exception as exc:
            logger.warning("pro_diary_feedback AI failed [%s]: %s", type(exc).__name__, exc)
            text = _DIARY_FEEDBACK_FALLBACK["text"]

        result = {"style": style, "text": text}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("pro_diary_feedback failed [%s]: %s", type(exc).__name__, exc)
        result = _DIARY_FEEDBACK_FALLBACK

    await db().patch(
        f"{SUPABASE_REST}/pro_entries",
        headers=SUPABASE_HEADERS,
        params={"id": f"eq.{req.entry_id}"},
        json={"ai_feedback": result},
    )
    return result


def _fallback_review_content(title: str, entry_count: int) -> dict:
    return {
        "v": 1,
        "title": title,
        "summary": f"這段期間你留下了 {entry_count} 則紀錄，每一次書寫都是一次好好陪自己的練習。",
        "trend": [],
        "themes": [],
    }


async def _find_existing_review(user_id: str, module_id: str | None, review_type: str, period_start: str) -> dict | None:
    params: list[tuple[str, str]] = [
        ("user_id", f"eq.{user_id}"),
        ("module_id", f"eq.{module_id}" if module_id else "is.null"),
        ("review_type", f"eq.{review_type}"),
        ("period_start", f"eq.{period_start}"),
        ("select", "*"),
        ("limit", "1"),
    ]
    resp = await db().get(f"{SUPABASE_REST}/pro_reviews", headers=SUPABASE_HEADERS, params=params)
    rows = resp.json() if resp.status_code == 200 else []
    return rows[0] if rows else None


async def _insert_review(
    user_id: str, module_id: str | None, review_type: str,
    period_start: str, period_end: str, entry_count: int, content: dict,
) -> dict:
    """INSERT pro_reviews；撞到 UNIQUE（並發生成）就回既有那筆，不 500。"""
    resp = await db().post(
        f"{SUPABASE_REST}/pro_reviews",
        headers={**SUPABASE_HEADERS, "Prefer": "return=representation"},
        json={
            "user_id": user_id, "module_id": module_id, "review_type": review_type,
            "period_start": period_start, "period_end": period_end,
            "entry_count": entry_count, "content": content,
        },
    )
    if resp.status_code in (200, 201):
        rows = resp.json()
        if rows:
            return rows[0]
    existing = await _find_existing_review(user_id, module_id, review_type, period_start)
    if existing:
        return existing
    logger.error("pro_reviews insert failed: %s", resp.text)
    raise HTTPException(status_code=500, detail="儲存回顧報告失敗")


@app.post("/api/pro/diary-review")
async def pro_diary_review(req: DiaryReviewRequest, authorization: str = Header(...)):
    """整體回饋／週報：後端自行重算門檻與期間（不信前端）。未達門檻回 409。"""
    if req.review_type not in ("overall", "weekly"):
        raise HTTPException(status_code=400, detail="review_type 錯誤")
    token = authorization.removeprefix("Bearer ").strip()
    user_id = await get_user_id(token)

    if not await _get_active_enrollment(req.module_id, user_id):
        raise HTTPException(status_code=403, detail="尚未追蹤此模組")

    mod_resp = await db().get(
        f"{SUPABASE_REST}/pro_modules",
        headers=SUPABASE_HEADERS,
        params={"id": f"eq.{req.module_id}", "select": "id,title,kind,published_content"},
    )
    mod_rows = mod_resp.json() if mod_resp.status_code == 200 else []
    if not mod_rows or mod_rows[0].get("kind") != "diary":
        raise HTTPException(status_code=400, detail="非日記模組")
    module = mod_rows[0]
    feedback_cfg = (module.get("published_content") or {}).get("feedback") or {}

    entries_resp = await db().get(
        f"{SUPABASE_REST}/pro_entries",
        headers=SUPABASE_HEADERS,
        params={
            "module_id": f"eq.{req.module_id}", "user_id": f"eq.{user_id}",
            "select": "id,answers,entry_date,created_at", "order": "entry_date.asc",
        },
    )
    entries = entries_resp.json() if entries_resp.status_code == 200 else []

    focus_line = ""
    if req.review_type == "overall":
        cfg = feedback_cfg.get("overall") or {}
        threshold = int(cfg.get("threshold") or 3)
        if not cfg.get("enabled", True) or len(entries) < threshold or threshold <= 0:
            raise HTTPException(status_code=409, detail="尚未達門檻")
        k = len(entries) // threshold
        batch = entries[: k * threshold]
        period_start, period_end = batch[0]["entry_date"], batch[-1]["entry_date"]
        focus = cfg.get("focus") or ["themes", "emotion_arc"]
        focus_line = f"請聚焦在：{'、'.join(focus)}。"
        title = f"整體回饋 · {module['title']}"
        sections_line = "請包含 themes（重複主題 2-4 個關鍵詞）。"
    else:
        cfg = feedback_cfg.get("weekly") or {}
        distinct_dates = sorted({e["entry_date"] for e in entries})
        if not cfg.get("enabled", True) or len(distinct_dates) < 7:
            raise HTTPException(status_code=409, detail="尚未達門檻")
        k = len(distinct_dates) // 7
        window = set(distinct_dates[: k * 7][-7:])
        batch = [e for e in entries if e["entry_date"] in window]
        period_start, period_end = min(window), max(window)
        title = f"第 {k} 週成長報告"
        sections = cfg.get("sections") or {}
        parts = ["themes（重複主題 2-4 個關鍵詞）"]
        if sections.get("quotes"):
            parts.append("quote（挑一句最打動人的原句金句，含 text 與 source_date）")
        if sections.get("challenge"):
            parts.append("challenge（給下週一個小小可行的挑戰）")
        sections_line = f"請包含 {'、'.join(parts)}。"

    existing = await _find_existing_review(user_id, req.module_id, req.review_type, period_start)
    if existing:
        return existing

    lines = [f"[{e['entry_date']}] " + " / ".join(_entry_texts(e.get("answers"))) for e in batch if _entry_texts(e.get("answers"))]
    joined = "\n".join(lines) or "（沒有文字內容）"
    entry_count = len(batch)

    try:
        system = (
            "你是心理健康 App 的日記回顧報告助手，語氣溫暖、不批判、不做診斷。" + focus_line + sections_line +
            "summary 為 150-250 字的主體觀察。只回傳 JSON，不要任何前言或 markdown。"
        )
        data = await _pg_claude_json(
            "pro-diary-review", user_id, system,
            f"以下是使用者這段期間（{period_start} ~ {period_end}）的日記紀錄：\n{joined}\n\n"
            '只回傳 JSON：{"summary":"...","themes":["..."],"trend":[],'
            '"quote":{"text":"...","source_date":"YYYY-MM-DD"},"challenge":"..."}',
            max_tokens=900, model=_REVIEW_MODEL,
        )
        content_json = {
            "v": 1, "title": title,
            "summary": (data.get("summary") or "").strip() or _fallback_review_content(title, entry_count)["summary"],
            "trend": data.get("trend") or [],
            "themes": data.get("themes") or [],
        }
        if data.get("quote"):
            content_json["quote"] = data["quote"]
        if data.get("challenge"):
            content_json["challenge"] = data["challenge"]
    except Exception as exc:
        logger.warning("pro_diary_review AI failed [%s]: %s", type(exc).__name__, exc)
        content_json = _fallback_review_content(title, entry_count)

    return await _insert_review(user_id, req.module_id, req.review_type, period_start, period_end, entry_count, content_json)


@app.post("/api/reviews/gratitude-weekly")
async def reviews_gratitude_weekly(req: GratitudeWeeklyRequest, authorization: str = Header(...)):
    """內建感恩日記週回顧：該週 gratitude_entries ≥ 3 筆才生成。"""
    token = authorization.removeprefix("Bearer ").strip()
    user_id = await get_user_id(token)

    try:
        start = datetime.strptime(req.period_start, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="period_start 格式錯誤")
    end = start + timedelta(days=6)

    existing = await _find_existing_review(user_id, None, "gratitude_weekly", start.isoformat())
    if existing:
        return existing

    entries_resp = await db().get(
        f"{SUPABASE_REST}/gratitude_entries",
        headers=SUPABASE_HEADERS,
        params=[
            ("user_id", f"eq.{user_id}"),
            ("practice_type", "eq.gratitude"),
            ("entry_date", f"gte.{start.isoformat()}"),
            ("entry_date", f"lte.{end.isoformat()}"),
            ("select", "id,entry_date,item_1,item_2,item_3"),
            ("order", "entry_date.asc"),
        ],
    )
    entries = entries_resp.json() if entries_resp.status_code == 200 else []
    if len(entries) < 3:
        raise HTTPException(status_code=409, detail="這週紀錄不足 3 筆")

    lines = []
    for e in entries:
        items = [e.get("item_1"), e.get("item_2"), e.get("item_3")]
        texts = [i for i in items if i and i.strip()]
        if texts:
            lines.append(f"[{e['entry_date']}] " + " / ".join(texts))
    joined = "\n".join(lines) or "（沒有文字內容）"
    title = f"{start.isoformat()} ~ {end.isoformat()} 週回顧"
    entry_count = len(entries)

    try:
        system = (
            "你是心理健康 App 的感恩日記週回顧助手，語氣溫暖、不批判、不做診斷。"
            "請包含 themes（重複主題 2-4 個關鍵詞）與 quote（挑一句最打動人的原句金句，含 text 與 source_date）。"
            "summary 為 150-250 字的主體觀察，可提及本週感恩篇數的趨勢。只回傳 JSON，不要任何前言或 markdown。"
        )
        data = await _pg_claude_json(
            "gratitude-weekly-review", user_id, system,
            f"以下是使用者本週（{start.isoformat()} ~ {end.isoformat()}）的感恩日記：\n{joined}\n\n"
            '只回傳 JSON：{"summary":"...","themes":["..."],'
            '"quote":{"text":"...","source_date":"YYYY-MM-DD"}}',
            max_tokens=900, model=_REVIEW_MODEL,
        )
        content_json = {
            "v": 1, "title": title,
            "summary": (data.get("summary") or "").strip() or _fallback_review_content(title, entry_count)["summary"],
            "trend": [{"date": e["entry_date"], "score": 1} for e in entries],
            "themes": data.get("themes") or [],
        }
        if data.get("quote"):
            content_json["quote"] = data["quote"]
    except Exception as exc:
        logger.warning("gratitude_weekly AI failed [%s]: %s", type(exc).__name__, exc)
        content_json = _fallback_review_content(title, entry_count)
        content_json["trend"] = [{"date": e["entry_date"], "score": 1} for e in entries]

    return await _insert_review(user_id, None, "gratitude_weekly", start.isoformat(), end.isoformat(), entry_count, content_json)


# 一週回顧的 AI 週統整分析 prompt。架構依 Zeng, Chang, Lin, & Yeh (2026)
# 〈How generative AI reshapes gratitude interventions〉：
#   量化編碼的感恩深度採 Lin (2015) 感恩四層次模型
#   （recognizing kindness → feeling grateful → expressing appreciation → returning favor）；
#   敘事回饋依該研究質性分析歸納的四大主題遞進
#   （準確性 78.4% → 驚喜感 40.1% → 自我覺察 47.0% → 洞察 37.2%）鋪陳。
_WEEKLY_DIGEST_SYSTEM = (
    "你是心理健康 App 的感恩日記週統整分析師，語氣溫暖、具體、不批判、不做診斷，"
    "用繁體中文、以「你」稱呼使用者，不使用 emoji 與 markdown 符號。\n"
    "請閱讀使用者一週的感恩日記（逐件列出，每篇最多三件），產出兩部分：\n\n"
    "A. 量化編碼（以「件」為單位逐件分類）：\n"
    "1. emotions：最常出現的情緒（2-4 種，例如：平靜、感動、有成就感），與大約出現件數。\n"
    "2. keywords：最常提到的具體詞彙（2-6 個，2-4 字名詞，例如：夥伴、晚餐），與出現次數。\n"
    "3. depth：感恩深度四層次的件數分布（四層 count 加總＝總件數）：\n"
    "   - recognize（認知到善意）：單純記錄一件好事，沒有情緒展開\n"
    "   - feel（感受到感激）：內化出情緒反應，有情緒詞（溫馨、感動、成就感等）\n"
    "   - express（表達感謝與反思）：有明確道謝的對象，或延伸出反思\n"
    "   - reciprocate（回報善意）：描述了主動回饋對方的行動\n\n"
    "B. narrative：四個向度的統整回饋。每個向度回傳 2-3 條「條列短句」（每條 15-35 字，"
    "整個向度加總不超過 100 字）。精確、直指重點、不堆冗詞，不要大量引用原文，"
    "只在必要時點出關鍵字。依序遞進：\n"
    "1. accuracy（準確性）：講中使用者真實的生活樣貌、自我概念與習慣——"
    "不是重述事件，而是精準描繪「你是一個怎樣過這週的人」。\n"
    "2. surprise（驚喜感）：指出使用者自己都沒注意到的模式或轉變。\n"
    "3. awareness（自我覺察）：點出內在還沒被自己意識到的需求"
    "（例如對關係的渴望、對秩序感的需求、身體承載量）。\n"
    "4. insight（洞察與行動）：把觀察轉化成正向意義，並給出接下來可以怎麼做"
    "（具體、溫和、可行）。\n\n"
    "只回傳 JSON，不要任何前言或 markdown。"
)


@app.post("/api/reviews/weekly-digest")
async def reviews_weekly_digest(req: WeeklyDigestRequest, authorization: str = Header(...)):
    """一週回顧頁的 AI 週統整分析（v2）：量化編碼（情緒／詞彙／感恩深度）＋ 四段敘事回饋。
    感恩對象前端已能直接統計（target_1..3 是既有結構化欄位），不在此重複。
    該週 gratitude_entries ≥ 2 筆才生成；以 entry_count 判斷快取——週中新增紀錄會重新生成並更新同一列。"""
    token = authorization.removeprefix("Bearer ").strip()
    user_id = await get_user_id(token)

    try:
        start = datetime.strptime(req.period_start, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="period_start 格式錯誤")
    end = start + timedelta(days=6)

    entries_resp = await db().get(
        f"{SUPABASE_REST}/gratitude_entries",
        headers=SUPABASE_HEADERS,
        params=[
            ("user_id", f"eq.{user_id}"),
            ("practice_type", "eq.gratitude"),
            ("entry_date", f"gte.{start.isoformat()}"),
            ("entry_date", f"lte.{end.isoformat()}"),
            ("select", "id,entry_date,item_1,item_2,item_3"),
            ("order", "entry_date.asc"),
        ],
    )
    entries = entries_resp.json() if entries_resp.status_code == 200 else []
    if len(entries) < 2:
        raise HTTPException(status_code=409, detail="這週紀錄不足 2 筆")
    entry_count = len(entries)

    existing = await _find_existing_review(user_id, None, "weekly_digest", start.isoformat())
    if existing:
        content = existing.get("content") or {}
        if existing.get("entry_count") == entry_count and content.get("v", 1) >= 3:
            return existing

    # 逐件列出（而非整篇合併），AI 才能以「件」為單位做深度編碼
    lines = []
    for e in entries:
        for i, item in enumerate([e.get("item_1"), e.get("item_2"), e.get("item_3")], start=1):
            if item and item.strip():
                lines.append(f"[{e['entry_date']}] {i}. {item.strip()}")
    joined = "\n".join(lines) or "（沒有文字內容）"

    ai_ok = False
    emotions, keywords, depth, narrative = [], [], [], {}
    try:
        data = await _pg_claude_json(
            "weekly-digest", user_id, _WEEKLY_DIGEST_SYSTEM,
            f"以下是使用者本週（{start.isoformat()} ~ {end.isoformat()}）的感恩日記，共 {len(lines)} 件：\n{joined}\n\n"
            "只回傳 JSON："
            '{"emotions":[{"label":"平靜","count":3}],'
            '"keywords":[{"label":"夥伴","count":5}],'
            '"depth":[{"level":"recognize","count":5},{"level":"feel","count":6},'
            '{"level":"express","count":10},{"level":"reciprocate","count":0}],'
            '"narrative":{"accuracy":["...","..."],"surprise":["...","..."],'
            '"awareness":["...","..."],"insight":["...","..."]}}',
            max_tokens=1600, model=_REVIEW_MODEL,
        )
        emotions = data.get("emotions") or []
        keywords = data.get("keywords") or []
        depth = data.get("depth") or []
        narrative = data.get("narrative") or {}
        ai_ok = bool(emotions or (narrative or {}).get("accuracy"))
    except Exception as exc:
        logger.warning("weekly_digest AI failed [%s]: %s", type(exc).__name__, exc)

    content_json = {"v": 3, "emotions": emotions, "keywords": keywords, "depth": depth, "narrative": narrative}

    # AI 失敗時不落庫（避免快取住空結果），直接回傳讓前端顯示既有的前端統計
    if ai_ok:
        if existing:
            # 週中新增紀錄或舊版內容：更新同一列（UNIQUE 已保證一週一列）
            resp = await db().patch(
                f"{SUPABASE_REST}/pro_reviews",
                headers={**SUPABASE_HEADERS, "Prefer": "return=representation"},
                params={"id": f"eq.{existing['id']}"},
                json={"entry_count": entry_count, "content": content_json, "period_end": end.isoformat()},
            )
            rows = resp.json() if resp.status_code == 200 else []
            if rows:
                return rows[0]
            logger.warning("weekly_digest update failed: %s", resp.text)
        else:
            try:
                return await _insert_review(user_id, None, "weekly_digest", start.isoformat(), end.isoformat(), entry_count, content_json)
            except HTTPException:
                # 儲存失敗（最常見：weekly_digest.sql 的 CHECK 約束遷移還沒跑）：
                # 分析結果照樣回傳，只是這次不快取；遷移執行後自動恢復快取行為。
                logger.warning("weekly_digest insert failed; returning uncached result")

    return {
        "id": existing["id"] if existing else None,
        "user_id": user_id, "module_id": None, "review_type": "weekly_digest",
        "period_start": start.isoformat(), "period_end": end.isoformat(),
        "entry_count": entry_count, "content": content_json, "created_at": None, "read_at": None,
    }


# ── 量表轉譯質性評估（kind='assessment'）───────────────────────────────────
# 兩個端點：量表 AI 轉譯（專業夥伴端）＋ 測驗雙報告生成（個案端，含危機判讀）。

_SCALE_TRANSFORM_MODEL = "claude-haiku-4-5-20251001"
_ASSESSMENT_REPORT_MODEL = "claude-haiku-4-5-20251001"

_SCALE_TRANSFORM_SYSTEM = """你是心理量表轉譯助手，將標準化心理量表轉譯為開放式、生活化的質性問題。
規則：
- 從量表全文辨識維度結構與題項；每維度輸出 key（2-3 個大寫英文字母）/name/description。
- 每題輸出 original（濃縮原題意，不要求逐字複製，避免大量逐字收錄受版權保護的完整題目）、
  translated（開放式、生活化、無誘導、繁體中文的問題）、以及 2 條 hints（引導使用者展開回答的追問）。
- 每維度取最具代表性的 2-3 題轉譯，總題數不超過 15 題。
- 若量表含自傷/自殺意念相關題目（如 PHQ-9 第 9 題），translated 必須是溫和間接的問法，
  並在該題標註 "sensitive": true（前端會在該題顯示求助資源列）；其餘題目不設定此欄位或設為 false。
只回傳 JSON，不要任何前言或 markdown：
{"dimensions":[{"key":"SK","name":"...","description":"..."}],
 "questions":[{"dimension":"SK","original":"...","translated":"...","hints":["...","..."],"sensitive":false}]}"""

_ASSESSMENT_REPORT_SYSTEM = """你是心理健康 App 的質性測驗雙報告生成助手。
根據個案的開放式回答，同時產出兩份報告（同一次分析、兩個呈現角度）：

practitioner_report（給專業夥伴看，可含分數與臨床觀察）：
- dimensions：每個維度給 estimated_score（0-10，依語意映射推估）、max_score（固定 10）、
  confidence（high/medium/low）、evidence（1-2 條引用個案原文佐證）。
- needs_confirmation：需要會談中溫和確認的地方（陣列，可為空）。
- reflection_prompts：給專業夥伴的反思/切入點建議（陣列）。
- disclaimer：固定提醒此為語意推估、非標準化施測分數、不構成診斷。

client_report（給個案看，優勢轉譯、溫暖、無分數、無風險語彙、無臨床診斷詞）：
- hero：{emoji, title, subtitle} 一個溫暖的原型稱號（不影射真實人物）。
- highlights：固定 3 則 {emoji, title, text}，必須引用個案原文佐證。
- quote：{text, source} 從個案回答中挑一句金句，source 標明「出自你第 N 題的回答」。
- hope：一段有研究支持的溫暖敘述。
- mission：{title, text} 本週一個小而可行的任務。
- footer_note：固定說明「這份報告由 AI 根據你的書寫生成，經你的專業夥伴確認後發送。它不是測驗結果，是一面溫柔的鏡子。」。

規則：client_report 絕對不得出現分數、百分位、風險/診斷語彙；hope 與 highlights 需貼合個案實際回答，
不可空泛套話。只回傳 JSON，不要任何前言或 markdown，頂層只有 practitioner_report 與 client_report 兩個 key。"""


class ScaleTransformRequest(BaseModel):
    scale_name: str = ""
    scale_text: str


@app.post("/api/pro/scale-transform")
async def pro_scale_transform(req: ScaleTransformRequest, authorization: str = Header(...)):
    """量表 AI 轉譯：專業夥伴貼上量表全文 → 回傳 dimensions + questions。"""
    token = authorization.removeprefix("Bearer ").strip()
    user_id = await get_user_id(token)
    if not await _is_practitioner(user_id):
        raise HTTPException(status_code=403, detail="僅限專業夥伴使用")
    if not req.scale_text.strip():
        raise HTTPException(status_code=400, detail="量表內容不可為空")

    try:
        data = await _pg_claude_json(
            "pro-scale-transform", user_id, _SCALE_TRANSFORM_SYSTEM,
            f"量表名稱：{req.scale_name or '（未命名）'}\n\n量表全文：\n{req.scale_text}",
            max_tokens=3000, model=_SCALE_TRANSFORM_MODEL,
        )
        dimensions = []
        for i, d in enumerate(data.get("dimensions") or []):
            dimensions.append({
                "key": str(d.get("key") or f"D{i + 1}").upper()[:3],
                "name": d.get("name") or f"維度 {i + 1}",
                "description": d.get("description") or "",
                "color_index": i % 5,
            })
        dim_keys = {d["key"] for d in dimensions}
        questions = []
        for i, q in enumerate(data.get("questions") or []):
            dim = str(q.get("dimension") or "").upper()[:3]
            if dim not in dim_keys and dimensions:
                dim = dimensions[0]["key"]
            questions.append({
                "id": f"q{i + 1}",
                "dimension": dim,
                "original": q.get("original") or "",
                "translated": q.get("translated") or "",
                "hints": q.get("hints") or [],
                "required": True,
                "sensitive": bool(q.get("sensitive", False)),
            })
        return {"dimensions": dimensions, "questions": questions}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("pro_scale_transform failed [%s]: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=500, detail="量表轉譯失敗，請稍後再試")


def _fallback_assessment_reports() -> tuple[dict, dict]:
    practitioner_report = {
        "v": 1, "dimensions": [], "needs_confirmation": [],
        "reflection_prompts": ["AI 報告生成失敗，建議直接參考個案原始回答。"],
        "disclaimer": "推估分數來自質性回答的語意映射，不可等同標準化施測分數；本報告不構成診斷。",
        "error": "AI 報告生成失敗",
    }
    client_report = {
        "v": 1,
        "hero": {"emoji": "🌱", "title": "持續書寫的你", "subtitle": "報告生成中遇到一點小狀況"},
        "highlights": [],
        "hope": "你願意誠實面對這些問題，本身就是一件很有力量的事。",
        "mission": {"title": "深呼吸", "text": "先休息一下，稍後可以再回來看看完整的報告。"},
        "footer_note": "這份報告由 AI 根據你的書寫生成，經你的專業夥伴確認後發送。它不是測驗結果，是一面溫柔的鏡子。",
        "error": "生成失敗，請聯繫平台",
    }
    return practitioner_report, client_report


class AssessmentReportRequest(BaseModel):
    module_id: str
    answers: dict[str, str] = Field(default_factory=dict)


@app.post("/api/pro/assessment-report")
async def pro_assessment_report(req: AssessmentReportRequest, authorization: str = Header(...)):
    """個案送出質性測驗：危機兩層判讀 + 單次 AI 呼叫同時產出雙報告 + 依 review_before_send 決定發布狀態。"""
    token = authorization.removeprefix("Bearer ").strip()
    user_id = await get_user_id(token)

    enr = await _get_active_enrollment(req.module_id, user_id)
    if not enr:
        raise HTTPException(status_code=403, detail="尚未追蹤此模組")
    practitioner_id = enr["practitioner_id"]

    mod_resp = await db().get(
        f"{SUPABASE_REST}/pro_modules",
        headers=SUPABASE_HEADERS,
        params={"id": f"eq.{req.module_id}", "select": "id,kind,published_content"},
    )
    mod_rows = mod_resp.json() if mod_resp.status_code == 200 else []
    if not mod_rows or mod_rows[0].get("kind") != "assessment":
        raise HTTPException(status_code=400, detail="非質性測驗模組")
    content = mod_rows[0].get("published_content") or {}
    review_before_send = bool(content.get("review_before_send", False))
    questions = content.get("questions") or []
    q_by_id = {q["id"]: q for q in questions}

    joined_answers = "\n".join(
        f"[{i + 1}] {q_by_id.get(qid, {}).get('translated', qid)}\n答：{text}"
        for i, (qid, text) in enumerate(req.answers.items()) if text and text.strip()
    )
    joined_texts = "\n".join(t for t in req.answers.values() if t and t.strip())

    # 危機兩層判讀：關鍵字優先（零成本、命中即 high），未命中才 AI 語意；複用既有共用函式。
    crisis = {"risk": "none", "matched_terms": []}
    matched = [kw for kw in CRISIS_KEYWORDS if kw in joined_texts]
    if matched:
        crisis = {"risk": "high", "matched_terms": matched}
    elif joined_texts.strip():
        try:
            msg = await claude().messages.create(
                model=_CRISIS_MODEL,
                max_tokens=256,
                system="你是心理危機辨識助手，只回傳 JSON，不要任何前言或 markdown。",
                messages=[{
                    "role": "user",
                    "content": (
                        "判斷以下文字是否流露自我傷害、自殺意念或嚴重心理危機（含隱晦表達）。"
                        "寧可誤報、不可漏報。\n\n" + joined_texts +
                        '\n\n只回傳 JSON：{"risk":"none|medium|high"}'
                    ),
                }],
            )
            meter_claude("pro-assessment-safety", _CRISIS_MODEL, msg.usage, user_id)
            raw = msg.content[0].text if msg.content else ""
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            if m:
                r = str(json.loads(m.group()).get("risk", "none")).lower()
                if r in ("medium", "high"):
                    crisis = {"risk": r, "matched_terms": []}
        except Exception as exc:
            logger.warning("pro_assessment_report safety AI failed [%s]: %s", type(exc).__name__, exc)

    try:
        data = await _pg_claude_json(
            "pro-assessment-report", user_id, _ASSESSMENT_REPORT_SYSTEM,
            f"量表維度：{json.dumps(content.get('dimensions') or [], ensure_ascii=False)}\n\n"
            f"個案的回答：\n{joined_answers or '（沒有作答內容）'}\n\n"
            '只回傳 JSON：{"practitioner_report": {...}, "client_report": {...}}',
            max_tokens=3000, model=_ASSESSMENT_REPORT_MODEL,
        )
        practitioner_report = data.get("practitioner_report") or {}
        client_report = data.get("client_report") or {}
        if not practitioner_report or not client_report:
            raise ValueError("empty report")
    except Exception as exc:
        logger.warning("pro_assessment_report AI failed [%s]: %s", type(exc).__name__, exc)
        practitioner_report, client_report = _fallback_assessment_reports()

    status = "pending_release" if (review_before_send or practitioner_report.get("error")) else "released"
    insert_resp = await db().post(
        f"{SUPABASE_REST}/pro_assessment_results",
        headers={**SUPABASE_HEADERS, "Prefer": "return=representation"},
        json={
            "module_id": req.module_id, "user_id": user_id, "answers": req.answers,
            "practitioner_report": practitioner_report, "client_report": client_report,
            "status": status, "released_at": _now_iso() if status == "released" else None,
        },
    )
    if insert_resp.status_code not in (200, 201):
        logger.error("pro_assessment_results insert failed: %s", insert_resp.text)
        raise HTTPException(status_code=500, detail="儲存測驗結果失敗")
    rows = insert_resp.json()
    result_id = rows[0]["id"] if rows else None

    if crisis["risk"] != "none":
        await _insert_crisis_alert(
            user_id, practitioner_id, req.module_id, None,
            "keyword" if matched else "ai", crisis["risk"], crisis["matched_terms"],
        )

    return {
        "result_id": result_id,
        "status": status,
        "client_report": client_report if status == "released" else None,
        "crisis": crisis,
    }


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
