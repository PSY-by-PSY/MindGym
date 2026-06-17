"""
AI 成本自行計量（軌道一）。

為什麼自己算而不靠官方 API：Anthropic 的 Usage & Cost API 屬於 Admin API，
個人帳戶無法使用。但每次 Messages API 回應都帶 usage 欄位（input/output/
cache token 數），用一般 API key 就拿得到——所以我們在後端當場依價目表換算
金額，寫進 ai_usage_log。這條路線不需要任何 Admin 權限，且因為帶有 source
與 user_id，比官方的組織層級總額更適合做容量規劃。

價格變動時改下面的 PRICING / WHISPER_USD_PER_MINUTE 即可。
單位：美元／每百萬 token。cache 寫入 = 1.25× input，cache 讀取 = 0.1× input。
"""

from __future__ import annotations

# 每百萬 token 的美元單價。未列出的模型走 _DEFAULT。
PRICING: dict[str, dict[str, float]] = {
    # Claude Sonnet 4.6 / 4.5 同價：input $3、output $15
    "claude-sonnet-4-6": {"input": 3.0, "output": 15.0},
    "claude-sonnet-4-5": {"input": 3.0, "output": 15.0},
    "claude-opus-4-8":   {"input": 5.0, "output": 25.0},
    "claude-haiku-4-5":  {"input": 1.0, "output": 5.0},
}
_DEFAULT = {"input": 3.0, "output": 15.0}  # 找不到時的保守估計（Sonnet 價）

# Whisper（whisper-1）依音訊長度計費。
WHISPER_USD_PER_MINUTE = 0.006


def _rates(model: str) -> dict[str, float]:
    return PRICING.get(model, _DEFAULT)


def claude_cost(model: str, usage) -> tuple[float, dict[str, int]]:
    """從 Messages API 回應的 usage 物件算出該次花費（USD）與 token 明細。

    usage 可能缺欄位（例如沒用到 cache），一律以 0 補；任何缺漏不拋例外，
    確保記帳永遠不會反過來弄壞主流程。
    """
    def g(name: str) -> int:
        try:
            return int(getattr(usage, name, 0) or 0)
        except (TypeError, ValueError):
            return 0

    inp = g("input_tokens")
    out = g("output_tokens")
    cache_write = g("cache_creation_input_tokens")
    cache_read = g("cache_read_input_tokens")

    r = _rates(model)
    in_rate = r["input"]
    cost = (
        inp * in_rate
        + out * r["output"]
        + cache_write * in_rate * 1.25   # cache 寫入 1.25×
        + cache_read * in_rate * 0.1     # cache 讀取 0.1×
    ) / 1_000_000

    breakdown = {
        "input_tokens": inp,
        "output_tokens": out,
        "cache_write_tokens": cache_write,
        "cache_read_tokens": cache_read,
    }
    return round(cost, 6), breakdown


def whisper_cost(seconds: float) -> float:
    """依音訊秒數算 Whisper 花費（USD）。"""
    try:
        return round(max(0.0, float(seconds)) / 60.0 * WHISPER_USD_PER_MINUTE, 6)
    except (TypeError, ValueError):
        return 0.0
