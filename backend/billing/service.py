"""Application service for the initial checkout use case."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from backend.billing.providers import CheckoutRequest, CheckoutSession, PaymentProvider, RecurringConsent
from backend.billing.repository import (
    BillingRepository,
    CancelSubscriptionResult,
    PendingCheckout,
    RefundResult,
    ResumableCheckout,
)



@dataclass(frozen=True)
class CreateCheckoutCommand:
    user_id: str
    plan_code: str
    terms_version: str
    recurring_consent_version: str
    idempotency_key: str


@dataclass(frozen=True)
class CreatedCheckout:
    checkout: PendingCheckout
    provider_session: CheckoutSession


@dataclass(frozen=True)
class ResumedCheckout:
    checkout: ResumableCheckout
    provider_session: CheckoutSession


@dataclass(frozen=True)
class ProcessAdminRefundCommand:
    order_id: str
    amount_cents: int
    reason: str
    requested_by: str
    idempotency_key: str


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
            recurring_consent_version=command.recurring_consent_version,
            recurring_consented_at=now,
            recurring_consent_source="web",
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
                recurring_consent=RecurringConsent(
                    customer_reference=f"mg:{command.user_id}",
                    terms_version=command.recurring_consent_version,
                ),
            )
        )
        return CreatedCheckout(checkout=checkout, provider_session=session)

    async def record_callback(self, fields: dict[str, str]) -> str:
        verified = self._provider.verify_callback(fields)
        return await self._repository.record_provider_event(
            event_ref=verified.event_ref, merchant_order_no=verified.merchant_order_no,
            payload_redacted=verified.payload_redacted,
            provider_token_ref=(verified.payment_credential.provider_token_ref if verified.payment_credential else None),
            token_ciphertext=(verified.payment_credential.ciphertext if verified.payment_credential else None),
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
                recurring_consent=RecurringConsent(
                    customer_reference=f"mg:{user_id}",
                    terms_version=checkout.recurring_consent_version,
                ),
            )
        )
        return ResumedCheckout(checkout=checkout, provider_session=session)

    async def get_overview(self, user_id: str):
        return await self._repository.get_overview_for_user(user_id=user_id)

    async def get_canonical_entitlement(self, user_id: str) -> str:
        if hasattr(self._repository, "get_canonical_entitlement_for_user"):
            return await self._repository.get_canonical_entitlement_for_user(user_id=user_id)
        return "free"

    async def cancel_subscription(

        self, *, user_id: str, reason: str = "user_canceled_renewal"
    ) -> CancelSubscriptionResult:
        result = await self._repository.cancel_subscription_for_user(user_id=user_id, reason=reason)
        if result.token_ciphertext and hasattr(self._provider, "cancel_token"):
            try:
                vault = getattr(self._provider, "_credential_vault", None)
                if vault is not None:
                    unsealed = vault.unseal(result.token_ciphertext)
                    await self._provider.cancel_token(unsealed)
            except Exception:
                pass
        return result

    async def process_admin_refund(self, command: ProcessAdminRefundCommand) -> RefundResult:
        provider_ref = None
        if hasattr(self._provider, "refund_payment"):
            try:
                provider_ref = await self._provider.refund_payment(
                    order_id=command.order_id, amount_cents=command.amount_cents
                )
            except Exception:
                pass
        return await self._repository.process_admin_refund(
            order_id=command.order_id,
            amount_cents=command.amount_cents,
            reason=command.reason,
            requested_by=command.requested_by,
            idempotency_key=command.idempotency_key,
            provider_refund_ref=provider_ref,
        )

