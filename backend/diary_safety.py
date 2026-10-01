"""
每日練習（gratitude_entries）的危機判讀與通知信。

背景：社群審核刻意不擋第一人稱的痛苦（見 src/lib/contentFilter.ts 的註解），
理由是「那條路走的是 crisis_alerts」。但原本只有專業模組（pro_entries）會跑危機判讀，
感恩日記、過程目標覺察、自我慈悲、WOOP 寫什麼都不會產生警示——兩邊沒有接起來。
這支補上每日練習那一側。

刻意不依賴環境變數與網路，讓 backend/tests 可以直接測；實際的 HTTP、Claude 呼叫、
寄信都在 app.py。
"""

from __future__ import annotations

import html

# 每種練習裡「使用者自己寫的」欄位與顯示名稱。AI 產生的欄位（insight、suggestion、
# ai_feedback）不算，否則 BOUBA 自己寫的字可能觸發警示。
DIARY_FIELDS: dict[str, list[tuple[str, str]]] = {
    "gratitude": [("item_1", "感恩 1"), ("item_2", "感恩 2"), ("item_3", "感恩 3")],
    "process_goal": [("situation", "情境"), ("event", "事件"), ("who", "人"), ("when", "時間"), ("where", "地點")],
    "self_compassion": [
        ("situation", "情境"), ("awareness", "覺察"), ("humanity", "共同人性"),
        ("to_friend", "對朋友說"), ("to_self", "對自己說"),
    ],
    "woop": [("wish", "願望"), ("outcome", "結果"), ("obstacle", "阻礙"), ("plan", "計畫")],
}

PRACTICE_LABELS: dict[str, str] = {
    "gratitude": "感恩日記",
    "process_goal": "過程目標覺察",
    "self_compassion": "自我慈悲",
    "woop": "WOOP",
    "workshop_authentic_self": "工作坊・找尋真實自我",
    "workshop_last_day": "工作坊・生命最後一天",
    "workshop_woop": "工作坊・WOOP",
}

# 未列在 DIARY_FIELDS 的練習（例如工作坊）就掃 payload 裡所有字串，但排除這些非使用者輸入的 key。
_NON_USER_KEYS = {"v", "insight", "suggestion", "workshop_id", "done", "done_at", "target_date"}


def labeled_fields(entry: dict) -> list[tuple[str, str]]:
    """回傳 [(欄位名稱, 使用者寫的內容)]，空白欄位不列。"""
    practice = entry.get("practice_type") or ""
    payload = entry.get("payload") or {}
    if not isinstance(payload, dict):
        payload = {}

    def value(key: str) -> str:
        raw = entry.get(key) if key.startswith("item_") else payload.get(key)
        return raw.strip() if isinstance(raw, str) else ""

    if practice in DIARY_FIELDS:
        pairs = [(label, value(key)) for key, label in DIARY_FIELDS[practice]]
    else:
        pairs = [(f"項目 {i}", value(f"item_{i}")) for i in (1, 2, 3)]
        pairs += [
            (key, v.strip())
            for key, v in payload.items()
            if key not in _NON_USER_KEYS and isinstance(v, str)
        ]
    return [(label, text) for label, text in pairs if text]


def entry_text(entry: dict) -> str:
    return "\n".join(text for _, text in labeled_fields(entry))


def match_keywords(text: str, keywords: list[str]) -> list[str]:
    """寧可誤報、不可漏報：「沒有想著要割腕」也算命中，交給人判斷。"""
    return [kw for kw in keywords if kw in text]


def excerpt(text: str, terms: list[str], width: int = 80) -> str:
    """取命中字附近約 width 字；沒有命中字（AI 判讀）就取開頭。"""
    flat = " ".join(text.split())
    if len(flat) <= width:
        return flat
    pos = min((flat.find(t) for t in terms if t in flat), default=-1)
    if pos < 0:
        return flat[:width] + "…"
    start = max(0, pos - width // 2)
    end = min(len(flat), start + width)
    start = max(0, end - width)
    return ("…" if start > 0 else "") + flat[start:end] + ("…" if end < len(flat) else "")


_SEVERITY_LABEL = {"high": "高風險", "medium": "中風險"}
_SOURCE_LABEL = {"keyword": "關鍵字", "ai": "AI 語意判讀"}


def build_crisis_email(
    *,
    severity: str,
    source: str,
    matched_terms: list[str],
    practice_type: str,
    entry_date: str,
    is_shared: bool,
    user_id: str,
    snippet: str,
    admin_url: str,
) -> tuple[str, str, str]:
    """組出 (subject, html, text)。

    內容刻意只放摘要：風險、命中字、練習類型、時間、使用者 ID 前 8 碼、約 80 字的相關句子，
    其餘請到後台看。信件一旦轉寄或外流，暴露的範圍越小越好。
    """
    sev = _SEVERITY_LABEL.get(severity, severity)
    src = _SOURCE_LABEL.get(source, source)
    practice = PRACTICE_LABELS.get(practice_type, practice_type)
    uid = (user_id or "")[:8]
    visibility = "公開到社群" if is_shared else "私密"
    terms = "、".join(matched_terms) if matched_terms else "—"

    subject = f"【PsyByPsy 危機警示・{sev}】{practice}（{uid}）"
    rows = [
        ("風險等級", sev),
        ("判讀方式", src),
        ("命中字眼", terms),
        ("練習類型", f"{practice}（{visibility}）"),
        ("日記日期", entry_date or "—"),
        ("使用者 ID", f"{uid}…"),
    ]
    text = "\n".join(
        [f"偵測到一篇每日練習可能有自我傷害或嚴重心理危機的風險，請盡快由負責人員確認。", ""]
        + [f"{k}：{v}" for k, v in rows]
        + ["", f"相關句子：{snippet}", "", f"到後台查看全文與處理：{admin_url}", "",
           "這是系統自動寄出的通知。判讀寧可誤報、不可漏報，請以全文判斷。"]
    )
    table = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;color:#7a7066;white-space:nowrap">{html.escape(k)}</td>'
        f'<td style="padding:4px 0">{html.escape(v)}</td></tr>'
        for k, v in rows
    )
    color = "#B23A48" if severity == "high" else "#B7791F"
    body = f"""<div style="font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;max-width:560px;color:#2d2a26;line-height:1.7">
<p style="font-size:16px;font-weight:700;color:{color};margin:0 0 8px">偵測到可能的危機風險（{html.escape(sev)}）</p>
<p style="margin:0 0 12px">一篇每日練習可能有自我傷害或嚴重心理危機的風險，請盡快由負責人員確認。</p>
<table style="border-collapse:collapse;font-size:14px;margin-bottom:12px">{table}</table>
<p style="margin:0 0 4px;color:#7a7066;font-size:13px">相關句子</p>
<blockquote style="margin:0 0 16px;padding:8px 12px;background:#FCF7EE;border-left:3px solid {color};border-radius:6px">{html.escape(snippet)}</blockquote>
<p><a href="{html.escape(admin_url)}" style="display:inline-block;background:#3F6B46;color:#fff;text-decoration:none;padding:8px 16px;border-radius:8px">到後台查看全文與處理</a></p>
<p style="color:#7a7066;font-size:12px">這是系統自動寄出的通知。判讀寧可誤報、不可漏報，請以全文判斷。內容含使用者敏感資料，請勿轉寄。</p>
</div>"""
    return subject, body, text
