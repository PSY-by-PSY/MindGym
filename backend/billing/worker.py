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
    provider_token_ref: str | None = None
    token_ciphertext: str | None = None


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
            except ValueError as exc:
                await self._repository.dead_letter_outbox_event(
                    event_id=outbox_event.id, error=f"provider outcome rejected: {exc}",
                )
                dead_lettered += 1
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
                provider_token_ref=outcome.provider_token_ref,
                token_ciphertext=outcome.token_ciphertext,
            )
            await self._repository.complete_outbox_event(event_id=outbox_event.id)
            completed += 1
        return WorkerRun(claimed=len(claimed), completed=completed, deferred=deferred, dead_lettered=dead_lettered)


RENEWAL_TOPIC = "billing.subscription.renewal_due"


class BillingRenewalWorker:
    def __init__(
        self,
        repository,
        provider,
        credential_vault=None,
        *,
        max_attempts: int = 20,
        grace_days: int = 7,
    ):
        if not 1 <= max_attempts <= 100:
            raise ValueError("max_attempts must be between 1 and 100")
        self._repository = repository
        self._provider = provider
        self._vault = credential_vault
        self._max_attempts = max_attempts
        self._grace_days = grace_days

    async def schedule_and_run(self, *, lookahead_hours: int = 24, limit: int = 20) -> WorkerRun:
        await self._repository.schedule_renewals(
            lookahead_interval_hours=lookahead_hours, limit=limit
        )
        return await self.run_once(limit=limit)

    async def run_once(self, *, limit: int = 20) -> WorkerRun:
        claimed = await self._repository.claim_renewal_outbox_events(limit=limit)
        completed = 0
        deferred = 0
        dead_lettered = 0

        for outbox_event in claimed:
            if outbox_event.topic != RENEWAL_TOPIC:
                await self._repository.dead_letter_outbox_event(
                    event_id=outbox_event.id,
                    error="renewal worker received an unexpected outbox topic",
                )
                dead_lettered += 1
                continue

            order_id = outbox_event.payload.get("order_id")
            if not isinstance(order_id, str):
                await self._repository.dead_letter_outbox_event(
                    event_id=outbox_event.id, error="renewal job has no order id",
                )
                dead_lettered += 1
                continue

            try:
                renewal_data = await self._repository.get_renewal_order_for_processing(order_id=order_id)
            except Exception:
                # Order might have already been processed or canceled
                await self._repository.complete_outbox_event(event_id=outbox_event.id)
                completed += 1
                continue

            # Token validation & in-memory decryption
            if not renewal_data.token_ciphertext or self._vault is None:
                # No token available to charge -> record failure & start grace period
                await self._repository.apply_renewal_outcome(
                    order_id=renewal_data.order_id,
                    outcome="failed",
                    failure_code="MISSING_TOKEN",
                    grace_days=self._grace_days,
                )
                await self._repository.complete_outbox_event(event_id=outbox_event.id)
                completed += 1
                continue

            try:
                credit_hash = self._vault.unseal(renewal_data.token_ciphertext)
            except Exception:
                await self._repository.apply_renewal_outcome(
                    order_id=renewal_data.order_id,
                    outcome="failed",
                    failure_code="TOKEN_DECRYPTION_FAILED",
                    grace_days=self._grace_days,
                )
                await self._repository.complete_outbox_event(event_id=outbox_event.id)
                completed += 1
                continue

            # Call PAYUNi /api/credit
            try:
                charge_result = await self._provider.charge_token(
                    merchant_order_no=renewal_data.merchant_order_no,
                    amount_cents=renewal_data.amount_cents,
                    credit_hash=credit_hash,
                )
            except ProviderNotConfigured:
                retry_result = await self._repository.reschedule_outbox_event(
                    event_id=outbox_event.id,
                    error="PAYUNi token charge provider is not configured",
                    delay_seconds=900,
                    max_attempts=self._max_attempts,
                )
                if retry_result == "dead":
                    dead_lettered += 1
                elif retry_result == "rescheduled":
                    deferred += 1
                continue
            except Exception as exc:
                retry_result = await self._repository.reschedule_outbox_event(
                    event_id=outbox_event.id,
                    error=f"charge exception: {exc}",
                    delay_seconds=300,
                    max_attempts=self._max_attempts,
                )
                if retry_result == "dead":
                    dead_lettered += 1
                elif retry_result == "rescheduled":
                    deferred += 1
                continue

            # Apply outcome atomically
            if charge_result.succeeded:
                await self._repository.apply_renewal_outcome(
                    order_id=renewal_data.order_id,
                    outcome="succeeded",
                    provider_transaction_ref=charge_result.trade_no,
                    grace_days=self._grace_days,
                )
            else:
                await self._repository.apply_renewal_outcome(
                    order_id=renewal_data.order_id,
                    outcome="failed",
                    failure_code=charge_result.failure_code,
                    grace_days=self._grace_days,
                )

            await self._repository.complete_outbox_event(event_id=outbox_event.id)
            completed += 1

        return WorkerRun(
            claimed=len(claimed),
            completed=completed,
            deferred=deferred,
            dead_lettered=dead_lettered,
        )
