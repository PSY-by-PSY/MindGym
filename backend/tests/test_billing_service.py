from datetime import datetime, timezone
import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.billing.errors import ProviderNotConfigured
from backend.billing.providers import CheckoutSession, DisabledPayUniProvider
from backend.billing.repository import BillingOverview, PendingCheckout, ResumableCheckout
from backend.billing.service import BillingService, CreateCheckoutCommand


class FakeRepository:
    def __init__(self):
        self.calls = []

    async def create_pending_checkout(self, **kwargs):
        self.calls.append(kwargs)
        return PendingCheckout(
            order_id="order-1", subscription_id="subscription-1",
            merchant_order_no=kwargs["merchant_order_no"], status="pending",
            amount_cents=9900, currency="TWD",
            expires_at=kwargs["expires_at"], reused=False,
        )

    async def get_resumable_checkout_for_user(self, **kwargs):
        self.calls.append(kwargs)
        return ResumableCheckout(
            order_id=kwargs["order_id"], merchant_order_no="MG-EXISTING",
            status="pending", amount_cents=9900, currency="TWD",
            plan_name="月繳方案", expires_at=datetime.now(timezone.utc),
            recurring_consent_version="recurring-v1",
        )

    async def get_overview_for_user(self, **kwargs):
        self.calls.append(kwargs)
        return BillingOverview(
            subscription_id="subscription-1", plan_code="monthly", subscription_status="pending",
            current_period_ends_at=None, next_charge_at=None, cancel_at=None, orders=[],
        )


class ReadyProvider:
    def __init__(self):
        self.requests = []

    async def assert_ready(self):
        return None

    async def create_initial_checkout(self, request):
        self.requests.append(request)
        return CheckoutSession(redirect_url="https://sandbox.example.invalid/checkout")


class BillingServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_provider_creates_no_order(self):
        repository = FakeRepository()
        service = BillingService(repository, DisabledPayUniProvider(), "https://api.example.invalid/callback")

        with self.assertRaises(ProviderNotConfigured):
            await service.create_checkout(CreateCheckoutCommand("user-1", "monthly", "v1", "recurring-v1", "idem-1"))

        self.assertEqual(repository.calls, [])

    async def test_ready_provider_uses_persisted_order_snapshot(self):
        repository = FakeRepository()
        provider = ReadyProvider()
        service = BillingService(repository, provider, "https://api.example.invalid/callback")

        created = await service.create_checkout(CreateCheckoutCommand("user-1", "monthly", "v1", "recurring-v1", "idem-1"))

        self.assertEqual(len(repository.calls), 1)
        self.assertEqual(repository.calls[0]["user_id"], "user-1")
        self.assertEqual(repository.calls[0]["plan_code"], "monthly")
        self.assertEqual(created.checkout.order_id, "order-1")
        self.assertEqual(provider.requests[0].merchant_order_no, created.checkout.merchant_order_no)
        self.assertEqual(provider.requests[0].amount_cents, 9900)
        self.assertEqual(provider.requests[0].callback_url, "https://api.example.invalid/callback")
        self.assertLess(abs((repository.calls[0]["terms_accepted_at"] - datetime.now(timezone.utc)).total_seconds()), 5)
        self.assertEqual(repository.calls[0]["recurring_consent_version"], "recurring-v1")
        self.assertEqual(provider.requests[0].recurring_consent.customer_reference, "mg:user-1")

    async def test_resume_reuses_existing_order_and_merchant_number(self):
        repository = FakeRepository()
        provider = ReadyProvider()
        service = BillingService(repository, provider, "https://api.example.invalid/callback")

        resumed = await service.resume_checkout("user-1", "order-existing")

        self.assertIsNotNone(resumed)
        self.assertEqual(repository.calls, [{"user_id": "user-1", "order_id": "order-existing"}])
        self.assertEqual(resumed.checkout.order_id, "order-existing")
        self.assertEqual(provider.requests[0].merchant_order_no, "MG-EXISTING")
        self.assertEqual(provider.requests[0].description, "月繳方案")
        self.assertEqual(provider.requests[0].recurring_consent.terms_version, "recurring-v1")

    async def test_overview_is_delegated_to_owner_scoped_repository_query(self):
        repository = FakeRepository()
        service = BillingService(repository, ReadyProvider(), "https://api.example.invalid/callback")

        overview = await service.get_overview("user-1")

        self.assertEqual(overview.subscription_id, "subscription-1")
        self.assertEqual(repository.calls, [{"user_id": "user-1"}])


if __name__ == "__main__":
    unittest.main()
