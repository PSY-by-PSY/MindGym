import sys
from pathlib import Path
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.billing.router import router


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


if __name__ == "__main__":
    unittest.main()

