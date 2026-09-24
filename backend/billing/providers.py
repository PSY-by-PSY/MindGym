"""Provider port. Do not add PAYUNi field names until the approved contract exists."""

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


@dataclass(frozen=True)
class CheckoutSession:
    redirect_url: str | None = None
    form_action: str | None = None
    form_fields: dict[str, str] | None = None


class PaymentProvider(Protocol):
    async def assert_ready(self) -> None: ...
    async def create_initial_checkout(self, request: CheckoutRequest) -> CheckoutSession: ...


class DisabledPayUniProvider:
    """Safe default: an incomplete integration must never appear to take payment."""

    async def assert_ready(self) -> None:
        raise ProviderNotConfigured(
            "PAYUNi sandbox contract is not configured; no checkout was created."
        )

    async def create_initial_checkout(self, request: CheckoutRequest) -> CheckoutSession:
        await self.assert_ready()
        raise AssertionError("unreachable")
