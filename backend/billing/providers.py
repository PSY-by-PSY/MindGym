"""Provider port for billing.

Card-agreement details are deliberately opt-in.  A browser's acceptance of
MindGym's recurring terms is not itself a card authorization: that happens on
the provider-hosted payment page.
"""

from dataclasses import dataclass
from typing import Protocol

from backend.billing.errors import ProviderNotConfigured


@dataclass(frozen=True)
class CheckoutRequest:
    merchant_order_no: str
    amount_cents: int
    currency: str
    description: str
    callback_url: str
    recurring_consent: "RecurringConsent | None" = None


@dataclass(frozen=True)
class RecurringConsent:
    """A server-side representation of the user's pre-checkout consent.

    ``customer_reference`` is an opaque stable merchant-member reference.  It
    is encrypted inside the provider envelope and must never be a card number
    or a value supplied unchecked by the browser.
    """

    customer_reference: str
    terms_version: str

    def __post_init__(self) -> None:
        if not self.customer_reference or len(self.customer_reference) > 64:
            raise ValueError("recurring consent requires a customer reference up to 64 characters")
        if not self.terms_version or len(self.terms_version) > 100:
            raise ValueError("recurring consent requires a terms version")


@dataclass(frozen=True)
class CheckoutSession:
    redirect_url: str | None = None
    form_action: str | None = None
    form_fields: dict[str, str] | None = None


class PaymentProvider(Protocol):
    async def assert_ready(self) -> None: ...
    async def create_initial_checkout(self, request: CheckoutRequest) -> CheckoutSession: ...
    def verify_callback(self, fields: dict[str, str]): ...


class DisabledPayUniProvider:
    """Safe default: an incomplete integration must never appear to take payment."""

    async def assert_ready(self) -> None:
        raise ProviderNotConfigured(
            "PAYUNi sandbox contract is not configured; no checkout was created."
        )

    async def create_initial_checkout(self, request: CheckoutRequest) -> CheckoutSession:
        await self.assert_ready()
        raise AssertionError("unreachable")

    def verify_callback(self, fields: dict[str, str]):
        raise ProviderNotConfigured("PAYUNi callback is not configured")
