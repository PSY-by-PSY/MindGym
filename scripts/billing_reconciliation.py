"""Generate a billing reconciliation and anomaly report.

Can be run locally or via Cron for daily financial audits and anomaly detection.
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.billing.errors import ProviderNotConfigured
from backend.billing.repository import BillingRepository


async def run(as_json: bool) -> int:
    if os.environ.get("BILLING_OPERATIONS_ENABLED") != "1":
        raise ProviderNotConfigured("BILLING_OPERATIONS_ENABLED=1 is required")
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("BILLING_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise ProviderNotConfigured("SUPABASE_URL and BILLING_SERVICE_ROLE_KEY are required")

    async with httpx.AsyncClient(timeout=30) as client:
        repository = BillingRepository(client, url, key)
        summary = await repository.get_reconciliation_summary()

    data = {
        "total_orders": summary.total_orders,
        "total_paid_twd": summary.total_paid_cents / 100,
        "total_refunded_twd": summary.total_refunded_cents / 100,
        "net_revenue_twd": (summary.total_paid_cents - summary.total_refunded_cents) / 100,
        "active_subscriptions": summary.active_subscriptions,
        "grace_subscriptions": summary.grace_subscriptions,
        "expired_subscriptions": summary.expired_subscriptions,
        "anomaly_count": len(summary.anomalies),
        "anomalies": summary.anomalies,
    }

    if as_json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print("=" * 60)
        print("         MINDGYM BILLING RECONCILIATION REPORT         ")
        print("=" * 60)
        print(f"Total Orders:          {data['total_orders']}")
        print(f"Total Paid:            NT$ {data['total_paid_twd']:,.2f}")
        print(f"Total Refunded:        NT$ {data['total_refunded_twd']:,.2f}")
        print(f"Net Revenue:           NT$ {data['net_revenue_twd']:,.2f}")
        print("-" * 60)
        print(f"Active Subscriptions:  {data['active_subscriptions']}")
        print(f"In Grace Period:       {data['grace_subscriptions']}")
        print(f"Expired/Canceled:      {data['expired_subscriptions']}")
        print("-" * 60)
        print(f"Anomalies Detected:    {data['anomaly_count']}")
        for idx, a in enumerate(data['anomalies'], 1):
            print(f"  [{idx}] Type: {a.get('type')}, Detail: {a}")
        print("=" * 60)

    return 0


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description="MindGym Daily Billing Reconciliation")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args()

    try:
        return asyncio.run(run(as_json=args.json))
    except ProviderNotConfigured as exc:
        print(f"billing reconciliation refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
