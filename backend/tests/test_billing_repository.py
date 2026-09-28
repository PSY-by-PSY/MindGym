import json
import sys
from pathlib import Path
import unittest

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.billing.repository import BillingRepository, RepositoryError


class BillingRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_callback_claim_is_service_role_scoped_and_topic_specific(self):
        captured = {}

        async def handler(request: httpx.Request) -> httpx.Response:
            captured["path"] = request.url.path
            captured["headers"] = dict(request.headers)
            captured["body"] = json.loads(request.content)
            return httpx.Response(200, json=[{
                "id": "outbox-1", "topic": "billing.provider_callback.received",
                "payload": {"provider_event_id": "provider-1"},
            }])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            repository = BillingRepository(client, "https://supabase.example.invalid", "service-key")
            events = await repository.claim_callback_outbox_events(limit=7)

        self.assertEqual(captured["path"], "/rest/v1/rpc/claim_outbox_events_by_topic")
        self.assertEqual(captured["headers"]["accept-profile"], "billing")
        self.assertEqual(captured["headers"]["content-profile"], "billing")
        self.assertEqual(captured["headers"]["authorization"], "Bearer service-key")
        self.assertEqual(captured["body"], {
            "p_topic": "billing.provider_callback.received", "p_limit": 7, "p_lease_seconds": 60,
        })
        self.assertEqual(events[0].payload, {"provider_event_id": "provider-1"})

    async def test_retry_result_must_be_one_of_the_database_contract_values(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json="unexpected")

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            repository = BillingRepository(client, "https://supabase.example.invalid", "service-key")
            with self.assertRaisesRegex(RepositoryError, "unexpected result"):
                await repository.reschedule_outbox_event(event_id="outbox-1", error="safe error")

    async def test_user_authentication_never_forwards_service_role_bearer_token(self):
        captured = {}

        async def handler(request: httpx.Request) -> httpx.Response:
            captured["headers"] = dict(request.headers)
            return httpx.Response(200, json={"id": "user-1"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            repository = BillingRepository(client, "https://supabase.example.invalid", "service-key")
            user_id = await repository.authenticated_user_id("user-jwt")

        self.assertEqual(user_id, "user-1")
        self.assertEqual(captured["headers"]["authorization"], "Bearer user-jwt")
        self.assertEqual(captured["headers"]["apikey"], "service-key")

    async def test_cancel_subscription_calls_rpc_with_user_id_and_reason(self):
        captured = {}

        async def handler(request: httpx.Request) -> httpx.Response:
            captured["path"] = request.url.path
            captured["headers"] = dict(request.headers)
            captured["body"] = json.loads(request.content)
            return httpx.Response(200, json=[{
                "subscription_id": "sub-123",
                "status": "cancel_scheduled",
                "current_period_ends_at": "2026-10-28T15:00:00+00:00",
                "cancel_at": "2026-10-28T15:00:00+00:00",
                "provider_token_ref": "ref-123",
                "token_ciphertext": "enc-token-xyz",
            }])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            repository = BillingRepository(client, "https://supabase.example.invalid", "service-key")
            res = await repository.cancel_subscription_for_user(user_id="user-1", reason="user_canceled_renewal")

        self.assertEqual(captured["path"], "/rest/v1/rpc/cancel_subscription_for_user")
        self.assertEqual(captured["headers"]["accept-profile"], "billing")
        self.assertEqual(captured["body"], {"p_user_id": "user-1", "p_reason": "user_canceled_renewal"})
        self.assertEqual(res.subscription_id, "sub-123")
        self.assertEqual(res.status, "cancel_scheduled")
        self.assertEqual(res.token_ciphertext, "enc-token-xyz")

    async def test_get_canonical_entitlement_for_user_active_billing_returns_pro(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            if "get_overview_for_user" in request.url.path:
                return httpx.Response(200, json=[{
                    "subscription_id": "sub-1", "plan_code": "monthly",
                    "subscription_status": "active",
                    "current_period_ends_at": "2099-01-01T00:00:00+00:00",
                    "next_charge_at": "2099-01-01T00:00:00+00:00",
                    "cancel_at": None, "orders": [],
                }])
            return httpx.Response(200, json=[])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            repository = BillingRepository(client, "https://supabase.example.invalid", "service-key")
            tier = await repository.get_canonical_entitlement_for_user(user_id="user-pro")

        self.assertEqual(tier, "pro")

    async def test_get_canonical_entitlement_for_user_free_returns_free(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=[])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            repository = BillingRepository(client, "https://supabase.example.invalid", "service-key")
            tier = await repository.get_canonical_entitlement_for_user(user_id="user-free")

        self.assertEqual(tier, "free")

    async def test_get_canonical_entitlement_for_user_founding_member_returns_pro(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            if "get_overview_for_user" in request.url.path:
                return httpx.Response(200, json=[])
            if "/subscriptions" in request.url.path:
                return httpx.Response(200, json=[{"is_founding_member": True, "tier": "free"}])
            return httpx.Response(200, json=[])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            repository = BillingRepository(client, "https://supabase.example.invalid", "service-key")
            tier = await repository.get_canonical_entitlement_for_user(user_id="user-founding")

        self.assertEqual(tier, "pro")

    async def test_process_admin_refund_calls_rpc_with_expected_payload(self):
        captured = {}

        async def handler(request: httpx.Request) -> httpx.Response:
            captured["path"] = request.url.path
            captured["headers"] = dict(request.headers)
            captured["body"] = json.loads(request.content)
            return httpx.Response(200, json=[{
                "refund_id": "ref-999",
                "order_id": "ord-111",
                "status": "succeeded",
                "amount_cents": 9900,
                "reason": "customer_request",
                "succeeded_at": "2026-09-28T17:00:00+00:00",
            }])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            repository = BillingRepository(client, "https://supabase.example.invalid", "service-key")
            res = await repository.process_admin_refund(
                order_id="ord-111",
                amount_cents=9900,
                reason="customer_request",
                requested_by="admin-1",
                idempotency_key="refund-idem-1",
                provider_refund_ref="PAYUNI-REFUND-1",
            )

        self.assertEqual(captured["path"], "/rest/v1/rpc/process_admin_refund")
        self.assertEqual(captured["body"]["p_order_id"], "ord-111")
        self.assertEqual(captured["body"]["p_amount_cents"], 9900)
        self.assertEqual(captured["body"]["p_reason"], "customer_request")
        self.assertEqual(captured["body"]["p_idempotency_key"], "refund-idem-1")
        self.assertEqual(res.refund_id, "ref-999")
        self.assertEqual(res.status, "succeeded")

    async def test_schedule_renewals_calls_rpc_with_expected_payload(self):
        captured = {}

        async def handler(request: httpx.Request) -> httpx.Response:
            captured["path"] = request.url.path
            captured["headers"] = dict(request.headers)
            captured["body"] = json.loads(request.content)
            return httpx.Response(200, json=[{
                "subscription_id": "sub-100",
                "order_id": "ord-200",
                "merchant_order_no": "RNW-sub-100-20260928",
                "amount_cents": 9900,
                "currency": "TWD",
                "user_id": "user-300",
                "next_charge_at": "2026-09-29T12:00:00+00:00",
            }])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            repository = BillingRepository(client, "https://supabase.example.invalid", "service-key")
            res = await repository.schedule_renewals(lookahead_interval_hours=48, limit=10)

        self.assertEqual(captured["path"], "/rest/v1/rpc/schedule_renewals")
        self.assertEqual(captured["headers"]["accept-profile"], "billing")
        self.assertEqual(captured["body"]["p_lookahead_interval"], "48 hours")
        self.assertEqual(captured["body"]["p_limit"], 10)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0].subscription_id, "sub-100")
        self.assertEqual(res[0].order_id, "ord-200")
        self.assertEqual(res[0].amount_cents, 9900)

    async def test_get_renewal_order_for_processing_returns_data(self):
        captured = {}

        async def handler(request: httpx.Request) -> httpx.Response:
            captured["path"] = request.url.path
            captured["body"] = json.loads(request.content)
            return httpx.Response(200, json=[{
                "order_id": "ord-200",
                "subscription_id": "sub-100",
                "user_id": "user-300",
                "merchant_order_no": "RNW-sub-100-20260928",
                "amount_cents": 9900,
                "currency": "TWD",
                "plan_code": "monthly",
                "token_ciphertext": "enc-token",
                "provider_token_ref": "tok-ref",
                "subscription_status": "active",
                "grace_ends_at": None,
            }])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            repository = BillingRepository(client, "https://supabase.example.invalid", "service-key")
            res = await repository.get_renewal_order_for_processing(order_id="ord-200")

        self.assertEqual(captured["path"], "/rest/v1/rpc/get_renewal_order_for_processing")
        self.assertEqual(res.order_id, "ord-200")
        self.assertEqual(res.token_ciphertext, "enc-token")
        self.assertEqual(res.subscription_status, "active")

    async def test_apply_renewal_outcome_succeeded_calls_rpc(self):
        captured = {}

        async def handler(request: httpx.Request) -> httpx.Response:
            captured["path"] = request.url.path
            captured["body"] = json.loads(request.content)
            return httpx.Response(200, json=[{
                "order_id": "ord-200",
                "order_status": "paid",
                "subscription_id": "sub-100",
                "subscription_status": "active",
                "already_processed": False,
                "grace_ends_at": None,
            }])

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            repository = BillingRepository(client, "https://supabase.example.invalid", "service-key")
            res = await repository.apply_renewal_outcome(
                order_id="ord-200",
                outcome="succeeded",
                provider_transaction_ref="tx-123",
            )

        self.assertEqual(captured["path"], "/rest/v1/rpc/apply_renewal_outcome")
        self.assertEqual(captured["body"]["p_order_id"], "ord-200")
        self.assertEqual(captured["body"]["p_outcome"], "succeeded")
        self.assertEqual(captured["body"]["p_provider_transaction_ref"], "tx-123")
        self.assertEqual(res.order_status, "paid")
        self.assertEqual(res.subscription_status, "active")



