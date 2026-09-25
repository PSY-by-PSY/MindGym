"""Safe callback-outbox worker; scheduling and PAYUNi outcome mapping stay external."""

from dataclasses import dataclass
from typing import Protocol

from backend.billing.errors import ProviderNotConfigured
from backend.billing.repository import OutboxEvent, ProviderEventForProcessing


CALLBACK_TOPIC = "billing.provider_callback.received"


@dataclass(frozen=True)
class VerifiedPaymentOutcome:
    status: str
    provider_transaction_ref: str
    failure_code: str | None = None


class CallbackOutcomeResolver(Protocol):
    async def resolve(self, event: ProviderEventForProcessing) -> VerifiedPaymentOutcome: ...


class DeferredCallbackOutcomeResolver:
    """Default resolver: never infer a paid state from an incomplete provider contract."""

    async def resolve(self, event: ProviderEventForProcessing) -> VerifiedPaymentOutcome:
        raise ProviderNotConfigured("PAYUNi callback outcome contract is not configured")


@dataclass(frozen=True)
class WorkerRun:
    claimed: int
    completed: int
    deferred: int
    dead_lettered: int


class BillingCallbackWorker:
    def __init__(self, repository, resolver: CallbackOutcomeResolver, *, max_attempts: int = 20):
        if not 1 <= max_attempts <= 100:
            raise ValueError("max_attempts must be between 1 and 100")
        self._repository = repository
        self._resolver = resolver
        self._max_attempts = max_attempts

    async def run_once(self, *, limit: int = 20) -> WorkerRun:
        claimed = await self._repository.claim_callback_outbox_events(limit=limit)
        completed = 0
        deferred = 0
        dead_lettered = 0
        for outbox_event in claimed:
            if outbox_event.topic != CALLBACK_TOPIC:
                await self._repository.dead_letter_outbox_event(
                    event_id=outbox_event.id, error="callback worker received an unexpected outbox topic",
                )
                dead_lettered += 1
                continue
            event_id = outbox_event.payload.get("provider_event_id")
            if not isinstance(event_id, str):
                await self._repository.dead_letter_outbox_event(
                    event_id=outbox_event.id, error="callback job has no provider event id",
                )
                dead_lettered += 1
                continue
            provider_event = await self._repository.get_provider_event_for_processing(event_id=event_id)
            if provider_event is None:
                await self._repository.complete_outbox_event(event_id=outbox_event.id)
                completed += 1
                continue
            try:
                outcome = await self._resolver.resolve(provider_event)
            except ProviderNotConfigured:
                retry_result = await self._repository.reschedule_outbox_event(
                    event_id=outbox_event.id, error="provider callback outcome contract is unavailable", delay_seconds=900,
                    max_attempts=self._max_attempts,
                )
                if retry_result == "dead":
                    dead_lettered += 1
                elif retry_result == "rescheduled":
                    deferred += 1
                continue
            if outcome.status not in {"succeeded", "failed"}:
                await self._repository.dead_letter_outbox_event(
                    event_id=outbox_event.id, error="provider returned an unsupported payment outcome",
                )
                dead_lettered += 1
                continue
            await self._repository.apply_initial_payment_outcome(
                provider_event_id=provider_event.id, outcome=outcome.status,
                provider_transaction_ref=outcome.provider_transaction_ref,
                failure_code=outcome.failure_code,
            )
            await self._repository.complete_outbox_event(event_id=outbox_event.id)
            completed += 1
        return WorkerRun(claimed=len(claimed), completed=completed, deferred=deferred, dead_lettered=dead_lettered)
