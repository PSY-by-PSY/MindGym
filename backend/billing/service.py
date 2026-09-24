"""Application service for the initial checkout use case."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from backend.billing.providers import CheckoutRequest, CheckoutSession, PaymentProvider
from backend.billing.repository import BillingRepository, PendingCheckout


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
