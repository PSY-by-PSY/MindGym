import sys
from pathlib import Path
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.billing.router import admin_router, router



class BillingRouterTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)

    def test_checkout_requires_explicit_recurring_consent(self):
        response = self.client.post(
            "/v1/billing/checkout-sessions",
            headers={"Idempotency-Key": "idem-1"},
            json={
                "plan_code": "monthly", "terms_version": "terms-v1",
                "recurring_consent": False, "recurring_consent_version": "recurring-v1",
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "Recurring consent is required")

    def test_checkout_rejects_missing_consent_field(self):
        response = self.client.post(
            "/v1/billing/checkout-sessions",
            headers={"Idempotency-Key": "idem-1"},
            json={
                "plan_code": "monthly", "terms_version": "terms-v1",
                "recurring_consent_version": "recurring-v1",
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_cancel_subscription_requires_bearer_token(self):
        from unittest.mock import MagicMock
        app = FastAPI()
        app.include_router(router)
        app.state.billing_repository = MagicMock()
        client = TestClient(app)
        response = client.post("/v1/billing/subscription/cancel")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Bearer token required")


    def test_cancel_subscription_success(self):
        from datetime import datetime, timezone
        from unittest.mock import AsyncMock, MagicMock
        from backend.billing.repository import CancelSubscriptionResult

        app = FastAPI()
        app.include_router(router)

        fake_repo = MagicMock()
        fake_repo.authenticated_user_id = AsyncMock(return_value="user-123")
        fake_service = MagicMock()
        now = datetime.now(timezone.utc)
        fake_service.cancel_subscription = AsyncMock(return_value=CancelSubscriptionResult(
            subscription_id="sub-123",
            status="cancel_scheduled",
            current_period_ends_at=now,
            cancel_at=now,
            provider_token_ref="ref-1",
            token_ciphertext=None,
        ))

        app.state.billing_repository = fake_repo
        app.state.billing_service = fake_service

        client = TestClient(app)
        response = client.post(
            "/v1/billing/subscription/cancel",
            headers={"Authorization": "Bearer fake-jwt-token"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["subscription_id"], "sub-123")
        self.assertEqual(data["status"], "cancel_scheduled")
        self.assertEqual(data["current_period_ends_at"], now.isoformat())
        self.assertEqual(data["cancel_at"], now.isoformat())

    def test_cancel_subscription_no_active_sub_returns_404(self):
        from unittest.mock import AsyncMock, MagicMock
        from backend.billing.errors import RepositoryError

        app = FastAPI()
        app.include_router(router)

        fake_repo = MagicMock()
        fake_repo.authenticated_user_id = AsyncMock(return_value="user-123")
        fake_service = MagicMock()
        fake_service.cancel_subscription = AsyncMock(side_effect=RepositoryError("no active subscription found for user"))

        app.state.billing_repository = fake_repo
        app.state.billing_service = fake_service

        client = TestClient(app)
        response = client.post(
            "/v1/billing/subscription/cancel",
            headers={"Authorization": "Bearer fake-jwt-token"},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "No active subscription found")

    def test_admin_refund_requires_bearer_token(self):
        from unittest.mock import MagicMock
        app = FastAPI()
        app.include_router(admin_router)
        app.state.billing_repository = MagicMock()
        client = TestClient(app)
        response = client.post("/v1/admin/billing/refunds", headers={"Idempotency-Key": "idem-1"}, json={"order_id": "ord-1", "amount_cents": 9900, "reason": "test"})
        self.assertEqual(response.status_code, 401)


    def test_admin_refund_requires_idempotency_key(self):
        from unittest.mock import MagicMock
        app = FastAPI()
        app.include_router(admin_router)
        app.state.billing_repository = MagicMock()
        client = TestClient(app)
        response = client.post("/v1/admin/billing/refunds", headers={"Authorization": "Bearer fake"}, json={"order_id": "ord-1", "amount_cents": 9900, "reason": "test"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Idempotency-Key is required")

    def test_admin_refund_success(self):
        from datetime import datetime, timezone
        from unittest.mock import AsyncMock, MagicMock
        from backend.billing.repository import RefundResult

        app = FastAPI()
        app.include_router(admin_router)

        fake_repo = MagicMock()
        fake_repo.authenticated_user_id = AsyncMock(return_value="admin-123")
        fake_service = MagicMock()
        now = datetime.now(timezone.utc)
        fake_service.process_admin_refund = AsyncMock(return_value=RefundResult(
            refund_id="ref-123",
            order_id="ord-123",
            status="succeeded",
            amount_cents=9900,
            reason="customer_request",
            succeeded_at=now,
        ))

        app.state.billing_repository = fake_repo
        app.state.billing_service = fake_service

        client = TestClient(app)
        response = client.post(
            "/v1/admin/billing/refunds",
            headers={"Authorization": "Bearer fake-jwt-token", "Idempotency-Key": "refund-idem-1"},
            json={"order_id": "ord-123", "amount_cents": 9900, "reason": "customer_request"},
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["refund_id"], "ref-123")
        self.assertEqual(data["order_id"], "ord-123")
        self.assertEqual(data["status"], "succeeded")
        self.assertEqual(data["amount_cents"], 9900)

    def test_admin_refund_non_paid_order_returns_409(self):
        from unittest.mock import AsyncMock, MagicMock
        from backend.billing.errors import RepositoryError

        app = FastAPI()
        app.include_router(admin_router)

        fake_repo = MagicMock()
        fake_repo.authenticated_user_id = AsyncMock(return_value="admin-123")
        fake_service = MagicMock()
        fake_service.process_admin_refund = AsyncMock(side_effect=RepositoryError("cannot refund non-paid order"))

        app.state.billing_repository = fake_repo
        app.state.billing_service = fake_service

        client = TestClient(app)
        response = client.post(
            "/v1/admin/billing/refunds",
            headers={"Authorization": "Bearer fake-jwt-token", "Idempotency-Key": "refund-idem-1"},
            json={"order_id": "ord-pending", "amount_cents": 9900, "reason": "test"},
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "Order cannot be refunded")


if __name__ == "__main__":
    unittest.main()


