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


if __name__ == "__main__":
    unittest.main()
