"""Supabase/PostgREST persistence adapter for the billing schema."""

from dataclasses import dataclass
from datetime import datetime, timezone

from typing import Any

import httpx

from backend.billing.errors import RepositoryError


@dataclass(frozen=True)
class Plan:
    code: str
    display_name: str
    amount_cents: int
    currency: str
    terms_version: str


@dataclass(frozen=True)
class PendingCheckout:
    order_id: str
    subscription_id: str
    merchant_order_no: str
    status: str
    amount_cents: int
    currency: str
    expires_at: datetime
    reused: bool

@dataclass(frozen=True)
class OrderStatus:
    id: str
    status: str
    paid_at: datetime | None
    expires_at: datetime
    can_resume: bool


@dataclass(frozen=True)
class ResumableCheckout:
    order_id: str
    merchant_order_no: str
    status: str
    amount_cents: int
    currency: str
    plan_name: str
    expires_at: datetime
    recurring_consent_version: str


@dataclass(frozen=True)
class OrderHistoryItem:
    id: str
    status: str
    kind: str
    amount_cents: int
    currency: str
    created_at: datetime
    paid_at: datetime | None
    expires_at: datetime


@dataclass(frozen=True)
class BillingOverview:
    subscription_id: str
    plan_code: str
    subscription_status: str
    current_period_ends_at: datetime | None
    next_charge_at: datetime | None
    cancel_at: datetime | None
    orders: list[OrderHistoryItem]


@dataclass(frozen=True)
class CancelSubscriptionResult:
    subscription_id: str
    status: str
    current_period_ends_at: datetime
    cancel_at: datetime
    provider_token_ref: str | None
    token_ciphertext: str | None


@dataclass(frozen=True)
class RefundResult:
    refund_id: str
    order_id: str
    status: str
    amount_cents: int
    reason: str
    succeeded_at: datetime



@dataclass(frozen=True)
class OutboxEvent:
    id: str
    topic: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class ProviderEventForProcessing:
    id: str
    provider: str
    order_id: str
    payload_redacted: dict[str, str]
    amount_cents: int
    currency: str
    provider_token_ref: str | None
    token_ciphertext: str | None


@dataclass(frozen=True)
class OutboxHealth:
    topic: str
    status: str
    event_count: int
    oldest_created_at: datetime


@dataclass(frozen=True)
class DeadOutboxEvent:
    id: str
    topic: str
    aggregate_type: str
    aggregate_id: str
    attempt_count: int
    last_error: str | None
    created_at: datetime
    updated_at: datetime
    payload: dict[str, Any]


class BillingRepository:
    """Uses the service-role REST path; browser clients never receive this access."""

    def __init__(self, client: httpx.AsyncClient, supabase_url: str, service_key: str):
        self._client = client
        self._base_url = f"{supabase_url.rstrip('/')}/rest/v1"
        self._auth_url = f"{supabase_url.rstrip('/')}/auth/v1/user"
        self._headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Accept-Profile": "billing",
            "Content-Profile": "billing",
        }

    async def authenticated_user_id(self, token: str) -> str:
        response = await self._client.get(
            self._auth_url,
            headers={"apikey": self._headers["apikey"], "Authorization": f"Bearer {token}"},
        )
        if response.status_code != 200:
            raise RepositoryError("invalid authentication token")
        user_id = response.json().get("id")
        if not isinstance(user_id, str):
            raise RepositoryError("authentication response has no user id")
        return user_id

    async def list_sellable_plans(self) -> list[Plan]:
        response = await self._client.get(
            f"{self._base_url}/plans",
            headers=self._headers,
            params={"select": "code,display_name,amount_cents,currency,terms_version", "active": "eq.true", "order": "amount_cents.asc"},
        )
        self._raise_for_error(response, "list billing plans")
        return [Plan(**row) for row in response.json()]

    async def create_pending_checkout(
        self,
        *,
        user_id: str,
        plan_code: str,
        idempotency_key: str,
        terms_version: str,
        terms_accepted_at: datetime,
        recurring_consent_version: str,
        recurring_consented_at: datetime,
        recurring_consent_source: str,
        expires_at: datetime,
        merchant_order_no: str,
    ) -> PendingCheckout:
        response = await self._client.post(
            f"{self._base_url}/rpc/create_pending_checkout",
            headers=self._headers,
            json={
                "p_user_id": user_id,
                "p_plan_code": plan_code,
                "p_idempotency_key": idempotency_key,
                "p_terms_version": terms_version,
                "p_terms_accepted_at": terms_accepted_at.isoformat(),
                "p_recurring_consent_version": recurring_consent_version,
                "p_recurring_consented_at": recurring_consented_at.isoformat(),
                "p_recurring_consent_source": recurring_consent_source,
                "p_order_expires_at": expires_at.isoformat(),
                "p_merchant_order_no": merchant_order_no,
            },
        )
        self._raise_for_error(response, "create pending checkout")
        rows = response.json()
        if not isinstance(rows, list) or len(rows) != 1:
            raise RepositoryError("checkout RPC returned an unexpected result")
        row = rows[0]
        return PendingCheckout(
            order_id=row["order_id"], subscription_id=row["subscription_id"],
            merchant_order_no=row["merchant_order_no"], status=row["order_status"],
            amount_cents=row["amount_cents"], currency=row["currency"],
            expires_at=datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00")),
            reused=row["reused"],
        )

    async def record_provider_event(
        self, *, event_ref: str, merchant_order_no: str, payload_redacted: dict[str, str],
        provider_token_ref: str | None, token_ciphertext: str | None,
    ) -> str:
        response = await self._client.post(f"{self._base_url}/rpc/record_provider_event", headers=self._headers, json={
            "p_provider": "payuni", "p_event_ref": event_ref, "p_merchant_order_no": merchant_order_no,
            "p_signature_valid": True, "p_payload_redacted": payload_redacted,
            "p_provider_token_ref": provider_token_ref, "p_token_ciphertext": token_ciphertext,
        })
        self._raise_for_error(response, "record provider callback")
        return response.json()

    async def get_order_for_user(self, *, user_id: str, order_id: str) -> OrderStatus | None:
        response = await self._client.post(f"{self._base_url}/rpc/get_order_for_user", headers=self._headers, json={"p_user_id":user_id,"p_order_id":order_id})
        self._raise_for_error(response, "read order")
        rows = response.json()
        if not rows: return None
        row = rows[0]
        paid_at = row["paid_at"]
        return OrderStatus(row["id"],row["status"],datetime.fromisoformat(paid_at.replace("Z","+00:00")) if paid_at else None,datetime.fromisoformat(row["expires_at"].replace("Z","+00:00")),row["can_resume"])

    async def get_resumable_checkout_for_user(self, *, user_id: str, order_id: str) -> ResumableCheckout | None:
        response = await self._client.post(
            f"{self._base_url}/rpc/get_resumable_checkout_for_user",
            headers=self._headers,
            json={"p_user_id": user_id, "p_order_id": order_id},
        )
        self._raise_for_error(response, "read resumable checkout")
        rows = response.json()
        if not rows:
            return None
        row = rows[0]
        return ResumableCheckout(
            order_id=row["order_id"], merchant_order_no=row["merchant_order_no"],
            status=row["status"], amount_cents=row["amount_cents"],
            currency=row["currency"], plan_name=row["plan_name"],
            expires_at=datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00")),
            recurring_consent_version=row["recurring_consent_version"],
        )

    async def get_overview_for_user(self, *, user_id: str) -> BillingOverview | None:
        response = await self._client.post(
            f"{self._base_url}/rpc/get_overview_for_user",
            headers=self._headers,
            json={"p_user_id": user_id},
        )
        self._raise_for_error(response, "read billing overview")
        rows = response.json()
        if not rows:
            return None
        row = rows[0]
        def parse_timestamp(value: str | None) -> datetime | None:
            return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None
        return BillingOverview(
            subscription_id=row["subscription_id"], plan_code=row["plan_code"],
            subscription_status=row["subscription_status"],
            current_period_ends_at=parse_timestamp(row["current_period_ends_at"]),
            next_charge_at=parse_timestamp(row["next_charge_at"]),
            cancel_at=parse_timestamp(row["cancel_at"]),
            orders=[OrderHistoryItem(
                id=item["id"], status=item["status"], kind=item["kind"],
                amount_cents=item["amount_cents"], currency=item["currency"],
                created_at=parse_timestamp(item["created_at"]),
                paid_at=parse_timestamp(item["paid_at"]),
                expires_at=parse_timestamp(item["expires_at"]),
            ) for item in row["orders"]],
        )

    async def get_canonical_entitlement_for_user(self, *, user_id: str) -> str:
        try:
            overview = await self.get_overview_for_user(user_id=user_id)
            if overview and overview.subscription_status in ("active", "grace", "cancel_scheduled"):
                now = datetime.now(timezone.utc)
                if overview.current_period_ends_at is None or overview.current_period_ends_at > now:
                    return "pro"
            response = await self._client.get(
                f"{self._base_url}/subscriptions?user_id=eq.{user_id}",
                headers=self._headers,
            )
            if response.status_code == 200:
                rows = response.json()
                if rows:
                    row = rows[0]
                    if row.get("is_founding_member"):
                        return "pro"
                    tier = row.get("tier", "free")
                    status = row.get("status", "active")
                    exp = row.get("expires_at")
                    exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00")) if exp else None
                    now = datetime.now(timezone.utc)
                    if tier in ("pro", "pass") and status in ("trialing", "active", "grace") and (exp_dt is None or exp_dt > now):
                        return "pro"
        except Exception:
            pass
        return "free"



    async def cancel_subscription_for_user(

        self, *, user_id: str, reason: str = "user_canceled_renewal"
    ) -> CancelSubscriptionResult:
        response = await self._client.post(
            f"{self._base_url}/rpc/cancel_subscription_for_user",
            headers=self._headers,
            json={"p_user_id": user_id, "p_reason": reason},
        )
        self._raise_for_error(response, "cancel subscription for user")
        rows = response.json()
        if not rows:
            raise RepositoryError("cancel subscription returned empty")
        row = rows[0]
        return CancelSubscriptionResult(
            subscription_id=row["subscription_id"],
            status=row["status"],
            current_period_ends_at=datetime.fromisoformat(row["current_period_ends_at"].replace("Z", "+00:00")),
            cancel_at=datetime.fromisoformat(row["cancel_at"].replace("Z", "+00:00")),
            provider_token_ref=row.get("provider_token_ref"),
            token_ciphertext=row.get("token_ciphertext"),
        )

    async def process_admin_refund(
        self,
        *,
        order_id: str,
        amount_cents: int,
        reason: str,
        requested_by: str,
        idempotency_key: str,
        provider_refund_ref: str | None = None,
    ) -> RefundResult:
        response = await self._client.post(
            f"{self._base_url}/rpc/process_admin_refund",
            headers=self._headers,
            json={
                "p_order_id": order_id,
                "p_amount_cents": amount_cents,
                "p_reason": reason,
                "p_requested_by": requested_by,
                "p_idempotency_key": idempotency_key,
                "p_provider_refund_ref": provider_refund_ref,
            },
        )
        self._raise_for_error(response, "process admin refund")
        rows = response.json()
        if not rows:
            raise RepositoryError("process admin refund returned empty")
        row = rows[0]
        return RefundResult(
            refund_id=row["refund_id"],
            order_id=row["order_id"],
            status=row["status"],
            amount_cents=row["amount_cents"],
            reason=row["reason"],
            succeeded_at=datetime.fromisoformat(row["succeeded_at"].replace("Z", "+00:00")),
        )


    async def claim_callback_outbox_events(self, *, limit: int = 20) -> list[OutboxEvent]:
        response = await self._client.post(
            f"{self._base_url}/rpc/claim_outbox_events_by_topic", headers=self._headers,
            json={"p_topic": "billing.provider_callback.received", "p_limit": limit, "p_lease_seconds": 60},
        )
        self._raise_for_error(response, "claim billing outbox events")
        return [OutboxEvent(id=row["id"], topic=row["topic"], payload=row["payload"]) for row in response.json()]

    async def get_provider_event_for_processing(self, *, event_id: str) -> ProviderEventForProcessing | None:
        response = await self._client.post(
            f"{self._base_url}/rpc/get_provider_event_for_processing", headers=self._headers,
            json={"p_event_id": event_id},
        )
        self._raise_for_error(response, "read provider event")
        rows = response.json()
        if not rows:
            return None
        row = rows[0]
        return ProviderEventForProcessing(
            id=row["event_id"], provider=row["provider"], order_id=row["order_id"],
            payload_redacted=row["payload_redacted"],
            amount_cents=row["amount_cents"], currency=row["currency"],
            provider_token_ref=row.get("provider_token_ref"), token_ciphertext=row.get("token_ciphertext"),
        )

    async def apply_initial_payment_outcome(
        self, *, provider_event_id: str, outcome: str, provider_transaction_ref: str,
        failure_code: str | None = None, provider_token_ref: str | None = None,
        token_ciphertext: str | None = None,
    ) -> None:
        response = await self._client.post(
            f"{self._base_url}/rpc/apply_initial_payment_outcome", headers=self._headers,
            json={
                "p_provider_event_id": provider_event_id, "p_outcome": outcome,
                "p_provider_transaction_ref": provider_transaction_ref,
                "p_failure_code": failure_code,
                "p_provider_token_ref": provider_token_ref,
                "p_token_ciphertext": token_ciphertext,
            },
        )
        self._raise_for_error(response, "apply payment outcome")

    async def complete_outbox_event(self, *, event_id: str) -> None:
        response = await self._client.post(
            f"{self._base_url}/rpc/complete_outbox_event", headers=self._headers,
            json={"p_event_id": event_id},
        )
        self._raise_for_error(response, "complete billing outbox event")

    async def reschedule_outbox_event(
        self, *, event_id: str, error: str, delay_seconds: int = 900, max_attempts: int = 20,
    ) -> str:
        response = await self._client.post(
            f"{self._base_url}/rpc/reschedule_outbox_event", headers=self._headers,
            json={
                "p_event_id": event_id, "p_error": error, "p_delay_seconds": delay_seconds,
                "p_max_attempts": max_attempts,
            },
        )
        self._raise_for_error(response, "reschedule billing outbox event")
        result = response.json()
        if result not in {"rescheduled", "dead", "not_claimed"}:
            raise RepositoryError("outbox retry returned an unexpected result")
        return result

    async def dead_letter_outbox_event(self, *, event_id: str, error: str) -> None:
        response = await self._client.post(
            f"{self._base_url}/rpc/dead_letter_outbox_event", headers=self._headers,
            json={"p_event_id": event_id, "p_error": error},
        )
        self._raise_for_error(response, "dead-letter billing outbox event")

    async def get_outbox_health(self, *, topic: str | None = None) -> list[OutboxHealth]:
        response = await self._client.post(
            f"{self._base_url}/rpc/get_outbox_health", headers=self._headers,
            json={"p_topic": topic},
        )
        self._raise_for_error(response, "read billing outbox health")
        return [OutboxHealth(
            topic=row["topic"], status=row["status"], event_count=row["event_count"],
            oldest_created_at=datetime.fromisoformat(row["oldest_created_at"].replace("Z", "+00:00")),
        ) for row in response.json()]

    async def list_dead_outbox_events(self, *, topic: str | None = None, limit: int = 50) -> list[DeadOutboxEvent]:
        response = await self._client.post(
            f"{self._base_url}/rpc/list_dead_outbox_events", headers=self._headers,
            json={"p_topic": topic, "p_limit": limit},
        )
        self._raise_for_error(response, "list dead billing outbox events")
        return [DeadOutboxEvent(
            id=row["id"], topic=row["topic"], aggregate_type=row["aggregate_type"],
            aggregate_id=row["aggregate_id"], attempt_count=row["attempt_count"],
            last_error=row["last_error"],
            created_at=datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")),
            updated_at=datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00")),
            payload=row["payload"],
        ) for row in response.json()]

    @staticmethod
    def _raise_for_error(response: httpx.Response, operation: str) -> None:
        if response.is_success:
            return
        # Provider and PostgREST messages can contain implementation details.
        raise RepositoryError(f"unable to {operation} ({response.status_code})")
