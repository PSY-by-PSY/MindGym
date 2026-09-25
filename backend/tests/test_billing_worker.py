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
        self.events = [OutboxEvent("outbox-1", "billing.provider_callback.received", {"provider_event_id": "provider-1"})]

    async def claim_callback_outbox_events(self, *, limit):
        self.calls.append(("claim", limit))
        return self.events

    async def get_provider_event_for_processing(self, *, event_id):
        self.calls.append(("get", event_id))
        return ProviderEventForProcessing(event_id, "payuni", "order-1", {"TradeNo": "trade-1"})

    async def reschedule_outbox_event(self, **kwargs): self.calls.append(("reschedule", kwargs))
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
        }))

    async def test_resolved_outcome_uses_transaction_then_completes_job(self):
        repository = FakeRepository()
        result = await BillingCallbackWorker(repository, SuccessResolver()).run_once()

        self.assertEqual((result.claimed, result.completed, result.deferred, result.dead_lettered), (1, 1, 0, 0))
        self.assertEqual(repository.calls[-2], ("apply", {
            "provider_event_id": "provider-1", "outcome": "succeeded",
            "provider_transaction_ref": "trade-1", "failure_code": None,
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
