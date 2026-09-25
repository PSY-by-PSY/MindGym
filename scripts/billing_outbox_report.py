"""Explicitly enabled, read-only operational report for the billing callback queue."""

import asyncio
from dataclasses import asdict
from datetime import datetime
import json
import os
from pathlib import Path
import sys

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.billing.monitor import BillingOutboxMonitor
from backend.billing.repository import BillingRepository


def _json_default(value):
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"unsupported report value: {type(value).__name__}")


async def build_report(monitor: BillingOutboxMonitor) -> dict:
    health, dead_letters = await asyncio.gather(
        monitor.callback_queue_health(), monitor.callback_dead_letters(),
    )
    return {
        "topic": "billing.provider_callback.received",
        "health": [asdict(item) for item in health],
        "dead_letters": [asdict(item) for item in dead_letters],
    }


def _settings_from_environment() -> tuple[str, str]:
    if os.environ.get("BILLING_OPERATIONS_ENABLED") != "1":
        raise RuntimeError("set BILLING_OPERATIONS_ENABLED=1 to run the read-only billing report")
    url = os.environ.get("SUPABASE_URL", "").strip()
    service_key = os.environ.get("BILLING_SERVICE_ROLE_KEY", "").strip()
    if not url or not service_key:
        raise RuntimeError("SUPABASE_URL and BILLING_SERVICE_ROLE_KEY are required")
    return url, service_key


async def main() -> None:
    url, service_key = _settings_from_environment()
    async with httpx.AsyncClient(timeout=20) as client:
        monitor = BillingOutboxMonitor(BillingRepository(client, url, service_key))
        print(json.dumps(await build_report(monitor), default=_json_default, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
