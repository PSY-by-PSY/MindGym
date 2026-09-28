import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.billing.errors import ProviderNotConfigured
from backend.billing.repository import OutboxEvent, ProviderEventForProcessing
from backend.billing.worker import BillingCallbackWorker, VerifiedPaymentOutcome


class FakeRepository:
    def __init__(self):
        self.calls = []
        self.retry_result = "rescheduled"
        self.events = [OutboxEvent("outbox-1", "billing.provider_callback.received", {"provider_event_id": "provider-1"})]

    async def claim_callback_outbox_events(self, *, limit):
        self.calls.append(("claim", limit))
        return self.events

    async def get_provider_event_for_processing(self, *, event_id):
        self.calls.append(("get", event_id))
        return ProviderEventForProcessing(
            event_id, "payuni", "order-1", {"TradeNo": "trade-1"},
            9900, "TWD", "payuni:token-ref", "ciphertext",
        )

    async def reschedule_outbox_event(self, **kwargs):
        self.calls.append(("reschedule", kwargs))
        return self.retry_result
    async def dead_letter_outbox_event(self, **kwargs): self.calls.append(("dead", kwargs))
    async def complete_outbox_event(self, **kwargs): self.calls.append(("complete", kwargs))
    async def apply_initial_payment_outcome(self, **kwargs): self.calls.append(("apply", kwargs))


class DeferredResolver:
    async def resolve(self, event):
        raise ProviderNotConfigured("not approved")


class SuccessResolver:
    async def resolve(self, event):
        return VerifiedPaymentOutcome("succeeded", "trade-1")


class BillingCallbackWorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_unconfigured_contract_defers_without_writing_payment_state(self):
        repository = FakeRepository()
        result = await BillingCallbackWorker(repository, DeferredResolver()).run_once()

        self.assertEqual(result.claimed, 1)
        self.assertEqual(result.completed, 0)
        self.assertEqual(result.deferred, 1)
        self.assertEqual(result.dead_lettered, 0)
        self.assertFalse(any(name == "apply" for name, _ in repository.calls))
        self.assertEqual(repository.calls[-1], ("reschedule", {
            "event_id": "outbox-1", "error": "provider callback outcome contract is unavailable", "delay_seconds": 900,
            "max_attempts": 20,
        }))

    async def test_retry_limit_reports_dead_letter_after_reschedule_call(self):
        repository = FakeRepository()
        repository.retry_result = "dead"

        result = await BillingCallbackWorker(repository, DeferredResolver(), max_attempts=3).run_once()

        self.assertEqual((result.claimed, result.completed, result.deferred, result.dead_lettered), (1, 0, 0, 1))
        self.assertEqual(repository.calls[-1][1]["max_attempts"], 3)

    async def test_resolved_outcome_uses_transaction_then_completes_job(self):
        repository = FakeRepository()
        result = await BillingCallbackWorker(repository, SuccessResolver()).run_once()

        self.assertEqual((result.claimed, result.completed, result.deferred, result.dead_lettered), (1, 1, 0, 0))
        self.assertEqual(repository.calls[-2], ("apply", {
            "provider_event_id": "provider-1", "outcome": "succeeded",
            "provider_transaction_ref": "trade-1", "failure_code": None,
            "provider_token_ref": None, "token_ciphertext": None,
        }))
        self.assertEqual(repository.calls[-1], ("complete", {"event_id": "outbox-1"}))

    async def test_malformed_callback_job_is_dead_lettered(self):
        repository = FakeRepository()
        repository.events = [OutboxEvent("outbox-bad", "billing.provider_callback.received", {})]

        result = await BillingCallbackWorker(repository, SuccessResolver()).run_once()

        self.assertEqual((result.claimed, result.completed, result.deferred, result.dead_lettered), (1, 0, 0, 1))
        self.assertEqual(repository.calls[-1], ("dead", {
            "event_id": "outbox-bad", "error": "callback job has no provider event id",
        }))


class FakeRenewalRepository:
    def __init__(self):
        self.calls = []
        self.retry_result = "rescheduled"
        self.events = [OutboxEvent("outbox-rnw-1", "billing.subscription.renewal_due", {"order_id": "ord-1"})]
        self.renewal_data = None

    async def schedule_renewals(self, **kwargs):
        self.calls.append(("schedule", kwargs))
        return []

    async def claim_renewal_outbox_events(self, *, limit):
        self.calls.append(("claim_renewal", limit))
        return self.events

    async def get_renewal_order_for_processing(self, *, order_id):
        self.calls.append(("get_renewal", order_id))
        if self.renewal_data:
            return self.renewal_data
        from backend.billing.repository import RenewalOrderProcessingData
        return RenewalOrderProcessingData(
            order_id=order_id,
            subscription_id="sub-1",
            user_id="user-1",
            merchant_order_no="RNW-1",
            amount_cents=9900,
            currency="TWD",
            plan_code="monthly",
            token_ciphertext="cipher-token",
            provider_token_ref="tok-ref",
            subscription_status="active",
            grace_ends_at=None,
        )

    async def reschedule_outbox_event(self, **kwargs):
        self.calls.append(("reschedule", kwargs))
        return self.retry_result

    async def dead_letter_outbox_event(self, **kwargs):
        self.calls.append(("dead", kwargs))

    async def complete_outbox_event(self, **kwargs):
        self.calls.append(("complete", kwargs))

    async def apply_renewal_outcome(self, **kwargs):
        self.calls.append(("apply_renewal", kwargs))


class FakeProvider:
    def __init__(self, charge_result):
        self.charge_result = charge_result
        self.calls = []

    async def charge_token(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.charge_result, Exception):
            raise self.charge_result
        return self.charge_result


class FakeVault:
    def unseal(self, ciphertext):
        if ciphertext == "bad-token":
            raise ValueError("bad decrypt")
        return "decrypted-token-xyz"


class BillingRenewalWorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_renewal_worker_processes_successful_charge(self):
        from backend.billing.payuni import TokenChargeResult
        from backend.billing.worker import BillingRenewalWorker

        repository = FakeRenewalRepository()
        provider = FakeProvider(TokenChargeResult(succeeded=True, trade_no="TX-999"))
        vault = FakeVault()

        worker = BillingRenewalWorker(repository, provider, vault)
        result = await worker.run_once()

        self.assertEqual((result.claimed, result.completed, result.deferred, result.dead_lettered), (1, 1, 0, 0))
        self.assertEqual(len(provider.calls), 1)
        self.assertEqual(provider.calls[0]["credit_hash"], "decrypted-token-xyz")
        self.assertEqual(repository.calls[-2], ("apply_renewal", {
            "order_id": "ord-1",
            "outcome": "succeeded",
            "provider_transaction_ref": "TX-999",
            "grace_days": 7,
        }))
        self.assertEqual(repository.calls[-1], ("complete", {"event_id": "outbox-rnw-1"}))

    async def test_renewal_worker_handles_failed_charge_grace_period(self):
        from backend.billing.payuni import TokenChargeResult
        from backend.billing.worker import BillingRenewalWorker

        repository = FakeRenewalRepository()
        provider = FakeProvider(TokenChargeResult(succeeded=False, failure_code="CARD_EXPIRED"))
        vault = FakeVault()

        worker = BillingRenewalWorker(repository, provider, vault)
        result = await worker.run_once()

        self.assertEqual((result.claimed, result.completed, result.deferred, result.dead_lettered), (1, 1, 0, 0))
        self.assertEqual(repository.calls[-2], ("apply_renewal", {
            "order_id": "ord-1",
            "outcome": "failed",
            "failure_code": "CARD_EXPIRED",
            "grace_days": 7,
        }))
        self.assertEqual(repository.calls[-1], ("complete", {"event_id": "outbox-rnw-1"}))

    async def test_renewal_worker_handles_missing_token(self):
        from backend.billing.repository import RenewalOrderProcessingData
        from backend.billing.worker import BillingRenewalWorker

        repository = FakeRenewalRepository()
        repository.renewal_data = RenewalOrderProcessingData(
            order_id="ord-1",
            subscription_id="sub-1",
            user_id="user-1",
            merchant_order_no="RNW-1",
            amount_cents=9900,
            currency="TWD",
            plan_code="monthly",
            token_ciphertext=None,
            provider_token_ref=None,
            subscription_status="active",
            grace_ends_at=None,
        )
        provider = FakeProvider(None)
        vault = FakeVault()

        worker = BillingRenewalWorker(repository, provider, vault)
        result = await worker.run_once()

        self.assertEqual((result.claimed, result.completed, result.deferred, result.dead_lettered), (1, 1, 0, 0))
        self.assertEqual(repository.calls[-2], ("apply_renewal", {
            "order_id": "ord-1",
            "outcome": "failed",
            "failure_code": "MISSING_TOKEN",
            "grace_days": 7,
        }))

    async def test_renewal_worker_defers_when_provider_not_configured(self):
        from backend.billing.worker import BillingRenewalWorker

        repository = FakeRenewalRepository()
        provider = FakeProvider(ProviderNotConfigured("provider not ready"))
        vault = FakeVault()

        worker = BillingRenewalWorker(repository, provider, vault)
        result = await worker.run_once()

        self.assertEqual((result.claimed, result.completed, result.deferred, result.dead_lettered), (1, 0, 1, 0))
        self.assertEqual(repository.calls[-1], ("reschedule", {
            "event_id": "outbox-rnw-1",
            "error": "PAYUNi token charge provider is not configured",
            "delay_seconds": 900,
            "max_attempts": 20,
        }))

