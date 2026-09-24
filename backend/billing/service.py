"""Application service for the initial checkout use case."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from backend.billing.providers import CheckoutRequest, CheckoutSession, PaymentProvider
from backend.billing.repository import BillingRepository, PendingCheckout, ResumableCheckout


@dataclass(frozen=True)
class CreateCheckoutCommand:
    user_id: str
    plan_code: str
    terms_version: str
    idempotency_key: str


@dataclass(frozen=True)
class CreatedCheckout:
    checkout: PendingCheckout
    provider_session: CheckoutSession


@dataclass(frozen=True)
class ResumedCheckout:
    checkout: ResumableCheckout
    provider_session: CheckoutSession


class BillingService:
    def __init__(self, repository: BillingRepository, provider: PaymentProvider, callback_url: str):
        self._repository = repository
        self._provider = provider
        self._callback_url = callback_url

    async def list_plans(self):
        return await self._repository.list_sellable_plans()

    async def create_checkout(self, command: CreateCheckoutCommand) -> CreatedCheckout:
        # Do not create an unusable pending order when PAYUNi is not configured.
        await self._provider.assert_ready()
        now = datetime.now(timezone.utc)
        checkout = await self._repository.create_pending_checkout(
            user_id=command.user_id,
            plan_code=command.plan_code,
            idempotency_key=command.idempotency_key,
            terms_version=command.terms_version,
            terms_accepted_at=now,
            expires_at=now + timedelta(hours=24),
            merchant_order_no=f"MG-{uuid4().hex.upper()}",
        )
        session = await self._provider.create_initial_checkout(
            CheckoutRequest(
                merchant_order_no=checkout.merchant_order_no,
                amount_cents=checkout.amount_cents,
                currency=checkout.currency,
                description="MindGym subscription",
                callback_url=self._callback_url,
            )
        )
        return CreatedCheckout(checkout=checkout, provider_session=session)

    async def record_callback(self, fields: dict[str, str]) -> str:
        verified = self._provider.verify_callback(fields)
        return await self._repository.record_provider_event(
            event_ref=verified.event_ref, merchant_order_no=verified.merchant_order_no,
            payload_redacted=verified.payload_redacted,
        )

    async def get_order(self, user_id: str, order_id: str):
        return await self._repository.get_order_for_user(user_id=user_id, order_id=order_id)

    async def resume_checkout(self, user_id: str, order_id: str) -> ResumedCheckout | None:
        """Create a fresh provider form for the same pending order, never a new order."""
        await self._provider.assert_ready()
        checkout = await self._repository.get_resumable_checkout_for_user(
            user_id=user_id, order_id=order_id,
        )
        if checkout is None:
            return None
        session = await self._provider.create_initial_checkout(
            CheckoutRequest(
                merchant_order_no=checkout.merchant_order_no,
                amount_cents=checkout.amount_cents,
                currency=checkout.currency,
                description=checkout.plan_name,
                callback_url=self._callback_url,
            )
        )
        return ResumedCheckout(checkout=checkout, provider_session=session)

    async def get_overview(self, user_id: str):
        return await self._repository.get_overview_for_user(user_id=user_id)
