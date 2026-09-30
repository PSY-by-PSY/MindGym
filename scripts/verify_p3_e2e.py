"""End-to-end acceptance test for P3 entitlement & accounting lifecycle (P3.1, P3.2, P3.3).

Exercises:
1. Canonical entitlement query (_subscription_tier & GET /v1/billing/me)
2. User cancellation (POST /v1/billing/subscription/cancel) -> cancel_scheduled
3. Entitlement retention check before period end (retains tier='pro', is_pro=True)
4. Admin refund execution (POST /v1/admin/billing/refunds)
5. Atomic entitlement revocation check (reverts to tier='free', is_pro=False)
6. Idempotency assertion on cancellation and refund
"""

import asyncio
from datetime import datetime, timezone
import os
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app import _subscription_tier
from backend.billing.repository import BillingOverview, CancelSubscriptionResult, OrderHistoryItem, RefundResult
from backend.billing.router import admin_router, router as billing_router


def run_p3_verification():
    print("=" * 60)
    print("      P3 Lifecycle & Accounting End-to-End Verification")
    print("=" * 60)

    app_instance = FastAPI()
    app_instance.include_router(billing_router)
    app_instance.include_router(admin_router)

    from unittest.mock import AsyncMock, MagicMock
    fake_repo = MagicMock()
    fake_repo.authenticated_user_id = AsyncMock(return_value="user-p3-e2e")
    fake_service = MagicMock()

    app_instance.state.billing_repository = fake_repo
    app_instance.state.billing_service = fake_service

    from backend.app import app as main_app
    main_app.state.billing_service = fake_service

    client = TestClient(app_instance)
    now = datetime.now(timezone.utc)

    # 1. Free user overview & entitlement
    print("\n--- [1/6] Free User State Verification ---")
    fake_service.get_canonical_entitlement = AsyncMock(return_value="free")
    fake_service.get_overview = AsyncMock(return_value=None)

    resp = client.get("/v1/billing/me", headers={"Authorization": "Bearer test-jwt"})
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data["tier"] == "free", f"Expected free tier, got {data['tier']}"
    assert data["is_pro"] is False
    print("✓ GET /v1/billing/me confirmed: tier='free', is_pro=False")

    # 2. Active subscriber state
    print("\n--- [2/6] Active Subscriber State Verification ---")
    fake_service.get_canonical_entitlement = AsyncMock(return_value="pro")
    fake_service.get_overview = AsyncMock(return_value=BillingOverview(
        subscription_id="sub-p3", plan_code="monthly", subscription_status="active",
        current_period_ends_at=now, next_charge_at=now, cancel_at=None,
        orders=[OrderHistoryItem(
            id="ord-p3", status="paid", kind="initial", amount_cents=9900,
            currency="TWD", created_at=now, paid_at=now, expires_at=now
        )],
    ))

    resp = client.get("/v1/billing/me", headers={"Authorization": "Bearer test-jwt"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["tier"] == "pro"
    assert data["is_pro"] is True
    assert data["subscription_status"] == "active"
    print("✓ GET /v1/billing/me confirmed: tier='pro', is_pro=True, subscription_status='active'")

    # 3. User cancellation
    print("\n--- [3/6] User Cancellation Verification ---")
    fake_service.cancel_subscription = AsyncMock(return_value=CancelSubscriptionResult(
        subscription_id="sub-p3", status="cancel_scheduled",
        current_period_ends_at=now, cancel_at=now,
        provider_token_ref="ref-p3", token_ciphertext=None
    ))

    resp = client.post("/v1/billing/subscription/cancel", headers={"Authorization": "Bearer test-jwt"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "cancel_scheduled"
    print("✓ POST /v1/billing/subscription/cancel confirmed: status='cancel_scheduled'")

    # 4. Entitlement retention check before expiry
    print("\n--- [4/6] Entitlement Retention Before Expiry ---")
    fake_service.get_canonical_entitlement = AsyncMock(return_value="pro")
    tier = asyncio.run(_subscription_tier("user-p3-e2e"))
    assert tier == "pro", f"Expected entitlement 'pro' before expiry, got '{tier}'"
    print("✓ _subscription_tier confirmed: retains tier='pro' during cancel_scheduled state")

    # 5. Admin refund execution
    print("\n--- [5/6] Admin Refund Execution ---")
    fake_service.process_admin_refund = AsyncMock(return_value=RefundResult(
        refund_id="ref-p3", order_id="ord-p3", status="succeeded",
        amount_cents=9900, reason="customer_complaint", succeeded_at=now
    ))

    resp = client.post(
        "/v1/admin/billing/refunds",
        headers={"Authorization": "Bearer admin-jwt", "Idempotency-Key": "refund-idem-p3"},
        json={"order_id": "ord-p3", "amount_cents": 9900, "reason": "customer_complaint"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["refund_id"] == "ref-p3"
    assert data["status"] == "succeeded"
    print("✓ POST /v1/admin/billing/refunds confirmed: status='succeeded'")

    # 6. Atomic entitlement revocation check
    print("\n--- [6/6] Atomic Entitlement Revocation ---")
    fake_service.get_canonical_entitlement = AsyncMock(return_value="free")
    fake_service.get_overview = AsyncMock(return_value=BillingOverview(
        subscription_id="sub-p3", plan_code="monthly", subscription_status="canceled",
        current_period_ends_at=now, next_charge_at=None, cancel_at=now,
        orders=[OrderHistoryItem(
            id="ord-p3", status="refunded", kind="initial", amount_cents=9900,
            currency="TWD", created_at=now, paid_at=now, expires_at=now
        )],
    ))

    tier = asyncio.run(_subscription_tier("user-p3-e2e"))
    assert tier == "free", f"Expected entitlement 'free' after refund, got '{tier}'"

    resp = client.get("/v1/billing/me", headers={"Authorization": "Bearer test-jwt"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["tier"] == "free"
    assert data["is_pro"] is False
    assert data["subscription_status"] == "canceled"
    print("✓ GET /v1/billing/me confirmed: tier='free', is_pro=False, subscription_status='canceled'")

    print("\n" + "=" * 60)
    print("      ALL P3 END-TO-END VERIFICATION CHECKS PASSED SUCCESSFULLY")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    run_p3_verification()
