"""Run one bounded automatic subscription renewal pass.

This is intentionally not wired into FastAPI lifespan. Deployment may invoke
it from a controlled scheduler (e.g. Cron / Background Task) only after PAYUNi
recurring token charge approval; local runs remain opt-in and use service-role
credentials from the environment.
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.billing.credentials import FernetCredentialVault
from backend.billing.errors import ProviderNotConfigured
from backend.billing.payuni import (
    PayUniCapabilities,
    PayUniSettings,
    PayUniUppProvider,
)
from backend.billing.providers import DisabledPayUniProvider
from backend.billing.repository import BillingRepository
from backend.billing.worker import BillingRenewalWorker


async def run(limit: int, lookahead_hours: int, grace_days: int) -> int:
    if os.environ.get("BILLING_OPERATIONS_ENABLED") != "1":
        raise ProviderNotConfigured("BILLING_OPERATIONS_ENABLED=1 is required")
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("BILLING_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise ProviderNotConfigured("SUPABASE_URL and BILLING_SERVICE_ROLE_KEY are required")

    capabilities = PayUniCapabilities.from_environment()
    vault = FernetCredentialVault.from_environment() if os.environ.get("BILLING_TOKEN_ENCRYPTION_KEY") else None

    provider = DisabledPayUniProvider()
    if os.environ.get("PAYUNI_GENERIC_UPP_SANDBOX_ENABLED") == "1":
        try:
            settings = PayUniSettings.from_environment()
            provider = PayUniUppProvider(settings, capabilities, vault)
        except Exception:
            provider = DisabledPayUniProvider()

    async with httpx.AsyncClient(timeout=30) as client:
        repository = BillingRepository(client, url, key)
        worker = BillingRenewalWorker(
            repository=repository,
            provider=provider,
            credential_vault=vault,
            max_attempts=int(os.environ.get("BILLING_RENEWAL_MAX_ATTEMPTS", "20")),
            grace_days=grace_days,
        )
        result = await worker.schedule_and_run(
            lookahead_hours=lookahead_hours, limit=limit
        )

    print(
        f"claimed={result.claimed} completed={result.completed} "
        f"deferred={result.deferred} dead_lettered={result.dead_lettered}"
    )
    return 0


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description="MindGym Billing Renewal Worker")
    parser.add_argument("--limit", type=int, default=20, help="Max items to process (1-100)")
    parser.add_argument("--lookahead-hours", type=int, default=24, help="Lookahead window in hours for scheduling")
    parser.add_argument("--grace-days", type=int, default=7, help="Grace period duration in days")
    args = parser.parse_args()

    if not 1 <= args.limit <= 100:
        parser.error("--limit must be between 1 and 100")
    if args.lookahead_hours < 1:
        parser.error("--lookahead-hours must be at least 1")
    if args.grace_days < 1:
        parser.error("--grace-days must be at least 1")

    try:
        return asyncio.run(run(args.limit, args.lookahead_hours, args.grace_days))
    except ProviderNotConfigured as exc:
        print(f"billing renewal worker refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
