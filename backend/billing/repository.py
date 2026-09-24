"""Supabase/PostgREST persistence adapter for the billing schema."""

from dataclasses import dataclass
from datetime import datetime
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

    async def record_provider_event(self, *, event_ref: str, merchant_order_no: str, payload_redacted: dict[str, str]) -> str:
        response = await self._client.post(f"{self._base_url}/rpc/record_provider_event", headers=self._headers, json={
            "p_provider": "payuni", "p_event_ref": event_ref, "p_merchant_order_no": merchant_order_no,
            "p_signature_valid": True, "p_payload_redacted": payload_redacted,
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

    @staticmethod
    def _raise_for_error(response: httpx.Response, operation: str) -> None:
        if response.is_success:
            return
        # Provider and PostgREST messages can contain implementation details.
        raise RepositoryError(f"unable to {operation} ({response.status_code})")
