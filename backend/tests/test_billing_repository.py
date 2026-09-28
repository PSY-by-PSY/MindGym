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

