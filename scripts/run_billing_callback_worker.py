"""Run one bounded PAYUNi callback-worker pass.

This is intentionally not wired into FastAPI lifespan.  Deployment may invoke
it from a controlled scheduler only after PAYUNi sandbox approval; local runs
remain opt-in and use service-role credentials from the environment.
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

from backend.billing.errors import ProviderNotConfigured
from backend.billing.payuni import sandbox_outcome_resolver_from_environment
from backend.billing.repository import BillingRepository
from backend.billing.worker import BillingCallbackWorker, DeferredCallbackOutcomeResolver


async def run(limit: int) -> int:
    if os.environ.get("BILLING_OPERATIONS_ENABLED") != "1":
        raise ProviderNotConfigured("BILLING_OPERATIONS_ENABLED=1 is required")
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("BILLING_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise ProviderNotConfigured("SUPABASE_URL and BILLING_SERVICE_ROLE_KEY are required")
    resolver = sandbox_outcome_resolver_from_environment() or DeferredCallbackOutcomeResolver()
    async with httpx.AsyncClient(timeout=30) as client:
        result = await BillingCallbackWorker(
            BillingRepository(client, url, key), resolver,
            max_attempts=int(os.environ.get("BILLING_CALLBACK_MAX_ATTEMPTS", "20")),
        ).run_once(limit=limit)
    print(
        f"claimed={result.claimed} completed={result.completed} "
        f"deferred={result.deferred} dead_lettered={result.dead_lettered}"
    )
    return 0


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    if not 1 <= args.limit <= 100:
        parser.error("--limit must be between 1 and 100")
    try:
        return asyncio.run(run(args.limit))
    except ProviderNotConfigured as exc:
        print(f"billing callback worker refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
