"""
後台「使用者 Persona」的產生邏輯（提示詞、資料前處理、輸出驗證）。

只用公開分享到社群的日記（is_shared = true）。隱私政策承諾私密日記「僅自己可見」，
所以私密日記不進 persona。

刻意不依賴環境變數與網路，讓 backend/tests 可以直接測；Claude 呼叫與資料庫讀寫在 app.py。
"""

from __future__ import annotations

import json
import re
from collections import Counter

try:  # app.py 從 backend/ 目錄啟動，用頂層匯入；測試從 repo 根目錄以 backend.* 匯入
    from diary_safety import PRACTICE_LABELS, labeled_fields
except ImportError:  # pragma: no cover
    from backend.diary_safety import PRACTICE_LABELS, labeled_fields

# 公開日記「超過」這個篇數才建 persona。
MIN_ENTRIES = 40
# 單次送給模型的日記全文上限（字元）。超過時保留最近的日記。
MAX_PROMPT_CHARS = 60_000

PAIN_TAGS = {
    "work_stress": "工作壓力", "study_stress": "課業研究壓力", "procrastination": "拖延",
    "focus": "專注困難", "transition_adjustment": "轉換適應", "setback": "挫折",
    "burnout_history": "過往耗竭", "anxiety_uncertainty": "焦慮與不確定", "self_criticism": "自我批評",
    "comparison": "和別人比較", "rumination": "反覆內耗", "emotional_regulation": "情緒調節",
    "grief_loss": "失落與哀傷", "life_crisis": "生命困境", "relationship_strain": "關係困擾",
    "family_tension": "家庭摩擦", "loneliness": "孤單", "boundaries": "界線",
    "social_anxiety": "社交焦慮", "social_fatigue": "社交疲憊", "caregiver_worry": "照顧者的擔心",
    "health_body": "身體健康", "sleep_wake": "睡眠與起床", "phone_overuse": "手機成癮",
    "eating_impulse": "飲食衝動", "financial_stress": "經濟壓力",
}
STRENGTH_TAGS = {
    "self_reflection": "自我覺察", "resilience": "韌性", "reframing": "轉念",
    "gratitude_noticing": "看見善意", "self_care_routine": "自我照顧", "caring_for_others": "照顧他人",
    "discipline": "自律", "social_connection": "人際連結", "emotional_expression": "表達感受",
    "learning_curiosity": "好奇與學習", "humor": "幽默", "help_seeking": "願意求助",
    "boundary_setting": "設立界線", "self_compassion": "自我慈悲", "courage": "勇氣",
    "small_steps": "拆成小步驟", "flow": "心流",
}
STATUSES = ("active", "improving", "resolved")

SYSTEM_PROMPT = "你是心理健康 App 的使用者研究員，替營運團隊整理使用者畫像（persona）。只回傳 JSON，不要前言或 markdown。"

_SCHEMA = """{
  "label": "15～25 字的一句話標題，具體到換一個人就不成立",
  "summary": "100～180 字，這個人的生活處境、在意的事、正在經歷什麼",
  "life_stage": "一句話描述人生階段",
  "values": ["3～5 個他重視的事"],
  "pains": [{"tag": "痛點分類代碼", "text": "具體描述", "status": "active|improving|resolved", "evidence": ["MM-DD"], "confidence": 0.0}],
  "strengths": [{"tag": "長處分類代碼", "text": "具體描述", "evidence": ["MM-DD"], "confidence": 0.0}],
  "coping_that_works": ["對他有效的調適方式"],
  "goals": [{"text": "目標", "source": "gratitude|process_goal|self_compassion|woop", "status": "in_progress|done|planned|stalled|failed"}],
  "people": ["重要他人，只寫角色，不寫名字"],
  "rhythm": {"preferred_practice": "最常用的練習", "frequency": "書寫頻率與變化"},
  "voice": {"tone": "書寫語氣"},
  "service_hooks": ["2～4 條個人化服務建議：推薦哪個練習、回饋要注意什麼"],
  "watch_outs": ["回饋或推薦時要避開的事"],
  "restricted": false,
  "restricted_reason": ""
}"""


def eligible_users(user_ids: list[str], min_entries: int = MIN_ENTRIES) -> list[tuple[str, int]]:
    """依公開日記篇數挑出超過門檻的人，篇數多的排前面。"""
    counts = Counter(user_ids)
    return sorted(((u, n) for u, n in counts.items() if n > min_entries), key=lambda x: (-x[1], x[0]))


def format_entries(entries: list[dict], max_chars: int = MAX_PROMPT_CHARS) -> tuple[str, int]:
    """把日記排成「MM-DD 練習｜欄位:內容」一行一篇；超過上限時捨棄最舊的。回傳 (文字, 實際收錄篇數)。"""
    lines: list[str] = []
    for e in sorted(entries, key=lambda x: (x.get("entry_date") or "", x.get("created_at") or "")):
        fields = labeled_fields(e)
        if not fields:
            continue
        date = (e.get("entry_date") or "")[5:10]
        practice = PRACTICE_LABELS.get(e.get("practice_type") or "", e.get("practice_type") or "")
        body = "｜".join(f"{label}:{' '.join(text.split())}" for label, text in fields)
        lines.append(f"{date} {practice}｜{body}")
    kept: list[str] = []
    total = 0
    for line in reversed(lines):
        if kept and total + len(line) + 1 > max_chars:
            break
        kept.append(line)
        total += len(line) + 1
    kept.reverse()
    return "\n".join(kept), len(kept)


def build_prompt(entries: list[dict]) -> tuple[str, int]:
    text, used = format_entries(entries)
    prompt = f"""以下是一位使用者在 App 裡公開分享的每日練習紀錄，共 {used} 篇（每行一篇：日期 練習｜欄位:內容）。

{text}

請根據這些紀錄，整理這位使用者的 persona，供營運團隊做個人化服務。規則：
1. 只根據紀錄裡寫到的內容推論，不要編造。每條痛點與長處都要附上依據的日期（evidence），confidence 介於 0 到 1。
2. 不做任何心理診斷，不使用診斷標籤。使用者自己提到的就醫或服藥，只寫「有就醫」這種程度，不寫病名、藥名、劑量。
3. status：active＝最近仍在出現；improving＝有在改善或已有應對方法；resolved＝已經過去。依時間先後判斷。
4. pains 的 tag 只能用這些代碼：{", ".join(PAIN_TAGS)}。
   strengths 的 tag 只能用這些代碼：{", ".join(STRENGTH_TAGS)}。
   都不合適時才用最接近的一個，不要自創代碼。
5. 每個人 3～7 個痛點、3～6 個長處。
6. people 只寫角色（媽媽、伴侶、同事），不寫任何人的名字。
7. 如果紀錄顯示這位使用者可能未滿 18 歲，或最近的紀錄出現自我傷害、自殺相關內容，
   請把 restricted 設為 true，在 restricted_reason 用一句話說明原因（不要引用原文），
   其餘欄位只填 label、life_stage 與 watch_outs，pains 和 strengths 留空陣列。這類帳號需要人工處理，不做自動化個人化。
8. 用繁體中文。

只回傳符合這個結構的 JSON：
{_SCHEMA}"""
    return prompt, used


def response_text(msg) -> str:
    """把 Messages API 回應裡所有文字段落接起來。

    不能直接取 msg.content[0].text：較新的模型（例如 Sonnet 5）回應開頭可能是 thinking 段落，
    它沒有 .text，取了會丟 AttributeError（實際踩過：第一次刷新 15 位全部失敗）。
    """
    return "".join(
        getattr(block, "text", "") or ""
        for block in (getattr(msg, "content", None) or [])
        if getattr(block, "type", "text") == "text"
    )


def _clamp(x, lo: float = 0.0, hi: float = 1.0) -> float:
    try:
        return max(lo, min(hi, float(x)))
    except (TypeError, ValueError):
        return 0.5


def _str_list(v) -> list[str]:
    return [s.strip() for s in v if isinstance(s, str) and s.strip()] if isinstance(v, list) else []


def parse_persona(raw: str) -> dict:
    """解析並正規化模型輸出；結構不對就丟 ValueError，交給呼叫端記為失敗。"""
    m = re.search(r"\{.*\}", raw or "", re.DOTALL)
    if not m:
        raise ValueError("模型沒有回傳 JSON")
    data = json.loads(m.group())
    if not isinstance(data, dict) or not str(data.get("label", "")).strip():
        raise ValueError("persona 缺少 label")

    def items(key: str, tags: dict[str, str], with_status: bool) -> list[dict]:
        out = []
        for x in data.get(key) or []:
            if not isinstance(x, dict) or not str(x.get("text", "")).strip():
                continue
            item = {
                "tag": x.get("tag") if x.get("tag") in tags else "other",
                "text": str(x["text"]).strip(),
                "evidence": _str_list(x.get("evidence")),
                "confidence": _clamp(x.get("confidence", 0.5)),
            }
            if with_status:
                item["status"] = x.get("status") if x.get("status") in STATUSES else "active"
            out.append(item)
        return out

    restricted = bool(data.get("restricted"))
    goals = [
        {"text": str(g.get("text", "")).strip(), "source": str(g.get("source", "")), "status": str(g.get("status", "in_progress"))}
        for g in data.get("goals") or [] if isinstance(g, dict) and str(g.get("text", "")).strip()
    ]
    return {
        "label": str(data["label"]).strip(),
        "summary": str(data.get("summary", "")).strip(),
        "life_stage": str(data.get("life_stage", "")).strip(),
        "values": _str_list(data.get("values")),
        "pains": [] if restricted else items("pains", PAIN_TAGS, True),
        "strengths": [] if restricted else items("strengths", STRENGTH_TAGS, False),
        "coping_that_works": _str_list(data.get("coping_that_works")),
        "goals": [] if restricted else goals,
        "people": _str_list(data.get("people")),
        "rhythm": data.get("rhythm") if isinstance(data.get("rhythm"), dict) else {},
        "voice": data.get("voice") if isinstance(data.get("voice"), dict) else {},
        "service_hooks": [] if restricted else _str_list(data.get("service_hooks")),
        "watch_outs": _str_list(data.get("watch_outs")),
        "restricted": restricted,
        "restricted_reason": str(data.get("restricted_reason", "")).strip() if restricted else "",
    }
