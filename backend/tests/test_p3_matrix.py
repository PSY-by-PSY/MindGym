from datetime import datetime, timezone
import sys
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from backend.app import _subscription_tier, app
from backend.billing.repository import BillingOverview, CancelSubscriptionResult, OrderHistoryItem, RefundResult
from backend.billing.router import admin_router, router as billing_router


class P3LifecycleMatrixTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(billing_router)
        self.app.include_router(admin_router)

        self.fake_repo = MagicMock()
        self.fake_repo.authenticated_user_id = AsyncMock(return_value="user-p3")
        self.fake_service = MagicMock()

        self.app.state.billing_repository = self.fake_repo
        self.app.state.billing_service = self.fake_service
        app.state.billing_service = self.fake_service
        self.client = TestClient(self.app)
        self.now = datetime.now(timezone.utc)

    async def test_p3_lifecycle_free_user_initial_state(self):
        self.fake_service.get_canonical_entitlement = AsyncMock(return_value="free")
        self.fake_service.get_overview = AsyncMock(return_value=None)

        tier = await _subscription_tier("user-p3")
        self.assertEqual(tier, "free")

        resp = self.client.get("/v1/billing/me", headers={"Authorization": "Bearer token"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["tier"], "free")
        self.assertFalse(data["is_pro"])
        self.assertEqual(data["orders"], [])

    async def test_p3_lifecycle_active_subscriber_state(self):
        self.fake_service.get_canonical_entitlement = AsyncMock(return_value="pro")
        self.fake_service.get_overview = AsyncMock(return_value=BillingOverview(
            subscription_id="sub-100", plan_code="monthly", subscription_status="active",
            current_period_ends_at=self.now, next_charge_at=self.now, cancel_at=None,
            orders=[OrderHistoryItem(
                id="ord-100", status="paid", kind="initial", amount_cents=9900,
                currency="TWD", created_at=self.now, paid_at=self.now, expires_at=self.now
            )],
        ))

        tier = await _subscription_tier("user-p3")
        self.assertEqual(tier, "pro")

        resp = self.client.get("/v1/billing/me", headers={"Authorization": "Bearer token"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["tier"], "pro")
        self.assertTrue(data["is_pro"])
        self.assertEqual(data["subscription_status"], "active")
        self.assertEqual(len(data["orders"]), 1)

    async def test_p3_lifecycle_cancellation_retains_pro_before_expiry(self):
        self.fake_service.cancel_subscription = AsyncMock(return_value=CancelSubscriptionResult(
            subscription_id="sub-100", status="cancel_scheduled",
            current_period_ends_at=self.now, cancel_at=self.now,
            provider_token_ref="ref-100", token_ciphertext=None
        ))

        resp = self.client.post("/v1/billing/subscription/cancel", headers={"Authorization": "Bearer token"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "cancel_scheduled")

        # Before period expiry, canonical entitlement remains pro
        self.fake_service.get_canonical_entitlement = AsyncMock(return_value="pro")
        tier = await _subscription_tier("user-p3")
        self.assertEqual(tier, "pro")

    async def test_p3_lifecycle_admin_refund_revokes_entitlement_immediately(self):
        self.fake_service.process_admin_refund = AsyncMock(return_value=RefundResult(
            refund_id="ref-200", order_id="ord-100", status="succeeded",
            amount_cents=9900, reason="admin_refund", succeeded_at=self.now
        ))

        resp = self.client.post(
            "/v1/admin/billing/refunds",
            headers={"Authorization": "Bearer admin-token", "Idempotency-Key": "refund-idem-100"},
            json={"order_id": "ord-100", "amount_cents": 9900, "reason": "admin_refund"},
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["refund_id"], "ref-200")
        self.assertEqual(data["status"], "succeeded")

        # After refund, canonical entitlement immediately reverts to free
        self.fake_service.get_canonical_entitlement = AsyncMock(return_value="free")
        tier = await _subscription_tier("user-p3")
        self.assertEqual(tier, "free")


if __name__ == "__main__":
    unittest.main()
