"""
用量／成本監測腳本。

一次執行做三件事：
  1. 向各平台 API 抓「目前用量」與「AI 花費」。
  2. 對照 scripts/usage_config.json 的免費上限，算出每項已用百分比。
  3. 印出一份報告；可選擇把快照寫進 Supabase 的 usage_snapshots 表，
     並在任一額度逼近上限、或 AI 花費超標時於結尾列出告警。

設計原則：
  • 任何一個來源缺 API key → 標記為「skipped」並繼續，不讓單一缺漏拖垮整份報告。
  • 任何一個來源 API 出錯 → 標記為「error」並印出原因，其餘照常。
  • 真正會花錢的 Anthropic / OpenAI 優先且最完整；部署平台免費方案多半不開放
    用量 API，改以 dashboard 連結 + 可得的代理指標呈現。

用法：
  python3 scripts/usage_monitor.py              # 只抓取並印報告（不寫 DB）
  python3 scripts/usage_monitor.py --save       # 同上，並把快照寫入 usage_snapshots
  python3 scripts/usage_monitor.py --json        # 以 JSON 輸出（給排程／告警串接用）

AI 花費採雙軌：
  • 軌道一（主）— 自行計量：後端每次呼叫把花費寫進 ai_usage_log，本腳本經由
    ai_usage_summary() RPC 取得今日／本月總額、依 provider 與功能拆分。只需
    service_role key，不需 Anthropic 個人帳戶拿不到的 Admin Key。
  • 軌道二（輔）— 官方成本 API：若設了 Admin Key 則一併抓官方數字，在報告中與
    自行計量並列「對帳」，驗證沒有漏記。沒有 Admin Key 也完全不影響軌道一。

需要的環境變數（缺哪個就跳過哪個來源，見檔尾 ENV 說明）：
  SUPABASE_URL             已有
  SUPABASE_KEY             已有（service_role）── 軌道一 + DB 大小
  ANTHROPIC_ADMIN_KEY      選用，軌道二對帳（sk-ant-admin…，個人帳戶需先建組織）
  OPENAI_ADMIN_KEY         選用，軌道二對帳（sk-admin…）
  OPENAI_ORG_ID            選用，OpenAI 成本 API 需要（org-…）
  POSTHOG_API_KEY          PostHog Personal API key（phx_…）
  POSTHOG_PROJECT_ID       PostHog 專案數字 id
  POSTHOG_HOST             預設 https://us.posthog.com
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

CONFIG_PATH = Path(__file__).with_name("usage_config.json")
HTTP_TIMEOUT = 30.0


# ── 一筆量測結果 ──────────────────────────────────────────────
@dataclass
class Metric:
    source: str
    metric: str
    value: float | None = None
    unit: str = ""
    limit: float | None = None
    cost_usd: float | None = None
    raw: dict = field(default_factory=dict)

    @property
    def pct(self) -> float | None:
        if self.limit and self.value is not None and self.limit > 0:
            return round(self.value / self.limit * 100, 1)
        return None


@dataclass
class SourceResult:
    source: str
    status: str  # ok / skipped / error
    note: str = ""
    metrics: list[Metric] = field(default_factory=list)


# ── 小工具 ────────────────────────────────────────────────────
def _utc_today_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _to_float(x) -> float | None:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


# ── Collector：自行計量（軌道一，主要 AI 花費來源）────────────
# 經由 ai_usage_summary() RPC 取得今日／本月總額、依 provider 與 source 拆分。
def collect_self_metered() -> SourceResult:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not (url and key):
        return SourceResult("ai_self_metered", "skipped", "缺 SUPABASE_URL / SUPABASE_KEY")

    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    try:
        r = httpx.post(
            f"{url}/rest/v1/rpc/ai_usage_summary",
            headers=headers,
            json={},
            timeout=HTTP_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json() or {}
    except httpx.HTTPError as exc:
        hint = "（是否已套用 supabase/usage_monitor.sql？）" if "404" in str(exc) else ""
        return SourceResult("ai_self_metered", "error", f"ai_usage_summary 失敗：{exc}{hint}")

    today = _to_float(data.get("today_usd")) or 0.0
    month = _to_float(data.get("month_usd")) or 0.0
    return SourceResult(
        "ai_self_metered",
        "ok",
        metrics=[
            Metric("ai_self_metered", "cost_usd_today", round(today, 4), "usd", cost_usd=round(today, 4)),
            Metric("ai_self_metered", "cost_usd_month", round(month, 4), "usd", cost_usd=round(month, 4),
                   raw={"by_provider": data.get("by_provider", {}),
                        "month_by_source": data.get("month_by_source", {})}),
        ],
    )


# ── Collector：Anthropic 官方成本 API（軌道二，對帳用）─────────
# Admin API 成本報表：GET /v1/organizations/cost_report
# 個人帳戶需先在 Console 建立組織才能簽發 Admin Key；沒有就跳過，不影響軌道一。
def collect_anthropic() -> SourceResult:
    key = os.environ.get("ANTHROPIC_ADMIN_KEY")
    if not key:
        return SourceResult("anthropic", "skipped", "缺 ANTHROPIC_ADMIN_KEY")

    headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
    month_start = _month_start()
    today_start = _utc_today_start()

    def fetch_cost(starting_at: datetime) -> tuple[float, dict]:
        params = {
            "starting_at": starting_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "bucket_width": "1d",
            "limit": 31,
        }
        r = httpx.get(
            "https://api.anthropic.com/v1/organizations/cost_report",
            headers=headers,
            params=params,
            timeout=HTTP_TIMEOUT,
        )
        r.raise_for_status()
        body = r.json()
        total = 0.0
        # 回傳形如 {"data":[{"starting_at":…,"results":[{"amount":"1.23",…}]}]}
        for bucket in body.get("data", []):
            for item in bucket.get("results", []):
                amt = _to_float(item.get("amount"))
                if amt is not None:
                    total += amt
        return round(total, 4), body

    try:
        month_total, _ = fetch_cost(month_start)
        today_total, raw = fetch_cost(today_start)
    except httpx.HTTPError as exc:
        return SourceResult("anthropic", "error", f"成本 API 失敗：{exc}")

    return SourceResult(
        "anthropic",
        "ok",
        metrics=[
            Metric("anthropic", "cost_usd_today_recon", today_total, "usd", cost_usd=today_total),
            Metric("anthropic", "cost_usd_month_recon", month_total, "usd", cost_usd=month_total, raw=raw),
        ],
    )


# ── Collector：OpenAI（Whisper 語音）─────────────────────────
# GET /v1/organization/costs?start_time=<unix>&bucket_width=1d
def collect_openai() -> SourceResult:
    key = os.environ.get("OPENAI_ADMIN_KEY")
    if not key:
        return SourceResult("openai", "skipped", "缺 OPENAI_ADMIN_KEY")

    headers = {"Authorization": f"Bearer {key}"}
    org = os.environ.get("OPENAI_ORG_ID")
    if org:
        headers["OpenAI-Organization"] = org

    def fetch_cost(start: datetime) -> tuple[float, dict]:
        params = {"start_time": int(start.timestamp()), "bucket_width": "1d", "limit": 31}
        r = httpx.get(
            "https://api.openai.com/v1/organization/costs",
            headers=headers,
            params=params,
            timeout=HTTP_TIMEOUT,
        )
        r.raise_for_status()
        body = r.json()
        total = 0.0
        # 回傳形如 {"data":[{"results":[{"amount":{"value":0.12,"currency":"usd"}}]}]}
        for bucket in body.get("data", []):
            for item in bucket.get("results", []):
                amt = _to_float((item.get("amount") or {}).get("value"))
                if amt is not None:
                    total += amt
        return round(total, 4), body

    try:
        month_total, raw = fetch_cost(_month_start())
        today_total, _ = fetch_cost(_utc_today_start())
    except httpx.HTTPError as exc:
        return SourceResult("openai", "error", f"成本 API 失敗：{exc}")

    return SourceResult(
        "openai",
        "ok",
        metrics=[
            Metric("openai", "cost_usd_today_recon", today_total, "usd", cost_usd=today_total),
            Metric("openai", "cost_usd_month_recon", month_total, "usd", cost_usd=month_total, raw=raw),
        ],
    )


# ── Collector：Supabase（DB 大小，免費上限 500MB）────────────
# 經由 PostgREST RPC 呼叫 get_db_size_bytes()（見 supabase/usage_monitor.sql）。
def collect_supabase(limits: dict) -> SourceResult:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not (url and key):
        return SourceResult("supabase", "skipped", "缺 SUPABASE_URL / SUPABASE_KEY")

    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    try:
        r = httpx.post(
            f"{url}/rest/v1/rpc/get_db_size_bytes",
            headers=headers,
            json={},
            timeout=HTTP_TIMEOUT,
        )
        r.raise_for_status()
        size_bytes = _to_float(r.json())
    except httpx.HTTPError as exc:
        hint = "（是否已套用 supabase/usage_monitor.sql？）" if "404" in str(exc) else ""
        return SourceResult("supabase", "error", f"get_db_size_bytes 失敗：{exc}{hint}")

    db_mb = round((size_bytes or 0) / 1024 / 1024, 2)
    return SourceResult(
        "supabase",
        "ok",
        note="egress / edge function 呼叫數免費方案未開放 API，請見 dashboard 連結",
        metrics=[
            Metric("supabase", "db_mb", db_mb, "mb", limit=limits.get("db_mb")),
        ],
    )


# ── Collector：PostHog（事件數，免費上限 100 萬/月）──────────
def collect_posthog(limits: dict) -> SourceResult:
    key = os.environ.get("POSTHOG_API_KEY")
    project = os.environ.get("POSTHOG_PROJECT_ID")
    host = os.environ.get("POSTHOG_HOST", "https://us.posthog.com").rstrip("/")
    if not (key and project):
        return SourceResult("posthog", "skipped", "缺 POSTHOG_API_KEY / POSTHOG_PROJECT_ID")

    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    query = {
        "query": {
            "kind": "HogQLQuery",
            "query": "SELECT count() FROM events WHERE timestamp >= toStartOfMonth(now())",
        }
    }
    try:
        r = httpx.post(
            f"{host}/api/projects/{project}/query/",
            headers=headers,
            json=query,
            timeout=HTTP_TIMEOUT,
        )
        r.raise_for_status()
        results = r.json().get("results") or [[0]]
        events = _to_float(results[0][0]) or 0
    except (httpx.HTTPError, IndexError, KeyError) as exc:
        return SourceResult("posthog", "error", f"query API 失敗：{exc}")

    return SourceResult(
        "posthog",
        "ok",
        metrics=[
            Metric("posthog", "events_month", events, "count", limit=limits.get("events")),
        ],
    )


# ── 部署平台（免費方案無公開用量 API）────────────────────────
# Vercel Hobby / Render Free 的用量數字只在 dashboard 顯示，這裡不抓數值，
# 僅在報告中提示需人工檢查並附連結。保留為 skipped 以維持結構一致。
def collect_vercel() -> SourceResult:
    return SourceResult("vercel", "skipped", "Hobby 方案無公開用量 API，請看 dashboard")


def collect_render() -> SourceResult:
    return SourceResult("render", "skipped", "Free 方案無公開用量 API，請看 dashboard")


# ── 報告輸出 ──────────────────────────────────────────────────
def bar(pct: float | None, width: int = 20) -> str:
    if pct is None:
        return "—"
    filled = min(width, int(round(pct / 100 * width)))
    return "█" * filled + "░" * (width - filled) + f" {pct:.1f}%"


def print_report(results: list[SourceResult], config: dict) -> list[str]:
    dashboards = config.get("dashboards", {})
    print("\n" + "=" * 60)
    print(f" 用量／成本報告　{datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC}")
    print("=" * 60)

    # AI 花費區塊（軌道一：自行計量為主）
    print("\n■ AI 花費（純付費，無免費額度；來源：自行計量）")
    self_res = next((r for r in results if r.source == "ai_self_metered"), None)
    if not self_res or self_res.status != "ok":
        note = self_res.note if self_res else "無資料"
        print(f"  [{self_res.status if self_res else '—'}] {note}")
    else:
        today = next((m for m in self_res.metrics if m.metric == "cost_usd_today"), None)
        month = next((m for m in self_res.metrics if m.metric == "cost_usd_month"), None)
        t = f"${today.value:.4f}" if today and today.value is not None else "—"
        m = f"${month.value:.4f}" if month and month.value is not None else "—"
        print(f"  總計        今日 {t:<12} 本月 {m}")
        raw = month.raw if month else {}
        by_provider = raw.get("by_provider", {})
        for prov, vals in sorted(by_provider.items()):
            pt = vals.get("today", 0)
            pm = vals.get("month", 0)
            print(f"    └ {prov:<8} 今日 ${pt:<11.4f} 本月 ${pm:.4f}")
        by_source = raw.get("month_by_source", {})
        if by_source:
            top = sorted(by_source.items(), key=lambda kv: kv[1] or 0, reverse=True)
            inner = "，".join(f"{s} ${v:.4f}" for s, v in top)
            print(f"    本月各功能：{inner}")

    # 軌道二：官方成本 API 對帳（有設 Admin Key 才顯示）
    recon = [r for r in results if r.source in ("anthropic", "openai") and r.status == "ok"]
    if recon:
        print("  — 官方 API 對帳 —")
        for res in recon:
            month = next((m for m in res.metrics if m.metric == "cost_usd_month_recon"), None)
            mv = f"${month.value:.4f}" if month and month.value is not None else "—"
            print(f"    {res.source:<10} 官方本月 {mv}")

    # 免費額度區塊
    print("\n■ 部署平台免費額度")
    for res in results:
        if res.source in ("anthropic", "openai", "ai_self_metered"):
            continue
        if res.status != "ok":
            link = dashboards.get(res.source, "")
            print(f"  {res.source:<10} [{res.status}] {res.note}")
            if link:
                print(f"             ↳ {link}")
            continue
        for mtr in res.metrics:
            label = f"{res.source}/{mtr.metric}"
            val = f"{mtr.value:g}{mtr.unit}" if mtr.value is not None else "—"
            lim = f"/{mtr.limit:g}{mtr.unit}" if mtr.limit else ""
            print(f"  {label:<26} {val}{lim:<12} {bar(mtr.pct)}")
        if res.note:
            print(f"             ↳ {res.note}")

    return []


def evaluate_alerts(results: list[SourceResult], config: dict) -> list[str]:
    alerts = config.get("alerts", {})
    warn_pct = alerts.get("free_tier_warn_pct", 80)
    daily_cap = alerts.get("ai_daily_usd_warn")
    month_cap = alerts.get("ai_monthly_usd_warn")
    msgs: list[str] = []

    for res in results:
        for mtr in res.metrics:
            if mtr.pct is not None and mtr.pct >= warn_pct:
                msgs.append(f"⚠️  {res.source}/{mtr.metric} 已用 {mtr.pct:.1f}%（≥{warn_pct}% 門檻）")
            if mtr.metric == "cost_usd_today" and daily_cap and (mtr.value or 0) >= daily_cap:
                msgs.append(f"⚠️  {res.source} 今日 AI 花費 ${mtr.value:.2f}（≥${daily_cap}）")
            if mtr.metric == "cost_usd_month" and month_cap and (mtr.value or 0) >= month_cap:
                msgs.append(f"⚠️  {res.source} 本月 AI 花費 ${mtr.value:.2f}（≥${month_cap}）")
    return msgs


# ── 寫入 Supabase 快照 ───────────────────────────────────────
def save_snapshots(results: list[SourceResult]) -> str:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not (url and key):
        return "未寫入：缺 SUPABASE_URL / SUPABASE_KEY"

    captured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    for res in results:
        for mtr in res.metrics:
            rows.append({
                "captured_at": captured_at,
                "source": mtr.source,
                "metric": mtr.metric,
                "value": mtr.value,
                "unit": mtr.unit or None,
                "limit_value": mtr.limit,
                "pct": mtr.pct,
                "cost_usd": mtr.cost_usd,
                "raw": mtr.raw or None,
            })
    if not rows:
        return "未寫入：沒有任何指標"

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    try:
        r = httpx.post(
            f"{url}/rest/v1/usage_snapshots?on_conflict=captured_at,source,metric",
            headers=headers,
            json=rows,
            timeout=HTTP_TIMEOUT,
        )
        r.raise_for_status()
    except httpx.HTTPError as exc:
        return f"寫入失敗：{exc}"
    return f"已寫入 {len(rows)} 列快照"


# ── 主流程 ────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(description="用量／成本監測")
    parser.add_argument("--save", action="store_true", help="把快照寫入 usage_snapshots")
    parser.add_argument("--json", action="store_true", help="以 JSON 輸出")
    args = parser.parse_args()

    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    limits = config.get("free_tier_limits", {})

    results = [
        collect_self_metered(),   # 軌道一：自行計量（主要 AI 花費）
        collect_anthropic(),      # 軌道二：官方對帳（缺 Admin Key 則跳過）
        collect_openai(),
        collect_supabase(limits.get("supabase", {})),
        collect_posthog(limits.get("posthog", {})),
        collect_vercel(),
        collect_render(),
    ]

    alerts = evaluate_alerts(results, config)

    if args.json:
        out = {
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "sources": [
                {**{k: v for k, v in asdict(r).items() if k != "metrics"},
                 "metrics": [{**asdict(m), "pct": m.pct} for m in r.metrics]}
                for r in results
            ],
            "alerts": alerts,
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print_report(results, config)
        if args.save:
            print(f"\n■ 快照：{save_snapshots(results)}")
        print("\n■ 告警")
        if alerts:
            for m in alerts:
                print(f"  {m}")
        else:
            print("  無，一切在門檻內 ✓")
        print()

    # 有告警時以非 0 退出，方便排程／CI 判斷是否要發通知。
    return 1 if alerts else 0


if __name__ == "__main__":
    sys.exit(main())
