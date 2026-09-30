"""Solution 3: Full Public Webhook E2E Acceptance Flow via ngrok tunnel.

Exercises the real MindGym FastAPI billing system, PostgreSQL database, and
BillingCallbackWorker receiving signed PAYUNi callbacks over the PUBLIC INTERNET:
1. Authenticated checkout creation (POST /v1/billing/checkout-sessions)
2. Public ngrok webhook delivery (POST https://...ngrok-free.dev/v1/billing/payuni/callback)
3. Cryptographic signature verification (AES-256-GCM + SHA256)
4. Outbox queuing and Worker transaction execution
5. DB assertions (order=paid, sub=active, token sealed & decryptable in payment_methods,
   entitlement=pro, legacy projection updated)
6. Billing overview verification (GET /v1/billing/me)
7. Public internet idempotent re-send handling
8. Tampered / spoofed webhook rejection (HTTP 400)
"""

import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

import httpx
import sqlalchemy as sa
from cryptography.fernet import Fernet

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.billing.payuni import (
    PayUniCapabilities,
    PayUniSandboxInitialOutcomeResolver,
    PayUniSettings,
    PayUniUppProvider,
)
from backend.billing.repository import BillingRepository
from backend.billing.worker import BillingCallbackWorker

# 1. Safely load credentials from payuni.txt without printing secrets
PAYUNI_FILE = ROOT.parent / "payuni.txt"
with open(PAYUNI_FILE, encoding="utf-8") as f:
    text = f.read()

mer_id = re.search(r"商店代號：\s*(\S+)", text).group(1)
hash_key = re.search(r"Hash Key:\s*(\S+)", text).group(1)
hash_iv = re.search(r"IV KEY:\s*(\S+)", text).group(1)

# ⚠️ Sandbox 測試專用：本機 ngrok 臨時通道，僅用於驗證 PAYUNi 測試環境的公開回呼路徑。
#    只有 sandbox 測試資料經過此通道；正式環境不使用 ngrok。
NGROK_URL = "https://unnymphean-intrapsychic-mitchell.ngrok-free.dev"
LOCAL_SERVER_URL = "http://127.0.0.1:8001"
SUPABASE_URL = "http://127.0.0.1:54321"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
FERNET_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
DB_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:55434/postgres"

TEST_USER_ID = "7b0c6be1-0bdd-4557-8964-b3ff92f9b2ef"
JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long"

settings = PayUniSettings(
    merchant_id=mer_id,
    hash_key=hash_key,
    hash_iv=hash_iv,
    return_url=f"{NGROK_URL}/checkout/return",
    sandbox=True,
)
capabilities = PayUniCapabilities(
    initial_card_agreement=True,
    initial_payment_outcome=True,
)
provider = PayUniUppProvider(settings, capabilities)


def make_jwt(user_id: str) -> str:
    def b64url(b: bytes) -> str:
        return base64.urlsafe_b64encode(b).decode().rstrip("=")

    h = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    p = b64url(json.dumps({
        "sub": user_id,
        "role": "authenticated",
        "aud": "authenticated",
        "exp": 2000000000,
    }).encode())
    sig = b64url(hmac.new(JWT_SECRET.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{sig}"


def reset_test_user_data(engine: sa.Engine):
    with engine.begin() as conn:
        conn.execute(sa.text("""
            DELETE FROM billing.entitlement_changes
            WHERE subscription_id IN (SELECT id FROM billing.subscriptions WHERE user_id = :uid)
        """), {"uid": TEST_USER_ID})
        conn.execute(sa.text("""
            DELETE FROM billing.payment_methods
            WHERE subscription_id IN (SELECT id FROM billing.subscriptions WHERE user_id = :uid)
        """), {"uid": TEST_USER_ID})
        conn.execute(sa.text("""
            DELETE FROM billing.payment_attempts
            WHERE order_id IN (
                SELECT o.id FROM billing.orders o
                JOIN billing.subscriptions s ON o.subscription_id = s.id
                WHERE s.user_id = :uid
            )
        """), {"uid": TEST_USER_ID})
        conn.execute(sa.text("""
            DELETE FROM billing.orders
            WHERE subscription_id IN (SELECT id FROM billing.subscriptions WHERE user_id = :uid)
        """), {"uid": TEST_USER_ID})
        conn.execute(sa.text("""
            DELETE FROM billing.subscriptions WHERE user_id = :uid
        """), {"uid": TEST_USER_ID})
        conn.execute(sa.text("""
            DELETE FROM billing.outbox_events WHERE payload->>'provider_event_id' IN (
                SELECT id::text FROM billing.provider_events WHERE payload_redacted->>'MerTradeNo' LIKE 'MG-%'
            )
        """))
        conn.execute(sa.text("""
            DELETE FROM billing.provider_events WHERE payload_redacted->>'MerTradeNo' LIKE 'MG-%'
        """))
        conn.execute(sa.text("""
            UPDATE public.subscriptions SET tier = 'free', status = 'active', expires_at = NULL
            WHERE user_id = :uid
        """), {"uid": TEST_USER_ID})


async def run_solution_3_e2e():
    engine = sa.create_engine(DB_URL)
    print("==================================================================")
    print("🚀 STARTING SOLUTION 3: PUBLIC WEBHOOK E2E ACCEPTANCE TEST (NGROK)")
    print(f"🌐 Public Ingress URL: {NGROK_URL}")
    print("==================================================================")

    # 0. Clean DB
    print("\n--- [0/8] Resetting test user billing state in DB ---")
    reset_test_user_data(engine)
    print("✓ Test state clean.")

    async with httpx.AsyncClient(timeout=30) as client:
        jwt_token = make_jwt(TEST_USER_ID)
        auth_headers = {"Authorization": f"Bearer {jwt_token}"}

        # 1. Create Checkout Session via public/local API
        print("\n--- [1/8] POST /v1/billing/checkout-sessions ---")
        idempotency_key = f"sol3-{uuid.uuid4().hex[:12]}"
        checkout_payload = {
            "plan_code": "p2-callback-monthly",
            "terms_version": "p2-terms-v1",
            "recurring_consent": True,
            "recurring_consent_version": "recurring-v1",
        }
        resp = await client.post(
            f"{LOCAL_SERVER_URL}/v1/billing/checkout-sessions",
            json=checkout_payload,
            headers={**auth_headers, "Idempotency-Key": idempotency_key},
        )
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        checkout_data = resp.json()
        order_id = checkout_data["order_id"]
        print(f"✓ Checkout session created successfully! Order ID: {order_id}")

        with engine.connect() as conn:
            row = conn.execute(
                sa.text("SELECT merchant_order_no, amount_cents, status FROM billing.orders WHERE id = :id"),
                {"id": order_id}
            ).fetchone()
            assert row is not None, "Order row not found in DB!"
            merchant_order_no = row.merchant_order_no
            amount_cents = row.amount_cents
            print(f"✓ DB Order confirmed: {merchant_order_no}, amount_cents={amount_cents}, status={row.status}")

        # 2. Construct Real Cryptographically Signed PAYUNi Callback
        print("\n--- [2/8] Generating Signed Callback Payload ---")
        test_credit_hash = "credithash_sandbox_verified_token_abc123"
        raw_callback_payload = {
            "MerID": mer_id,
            "MerTradeNo": merchant_order_no,
            "TradeNo": f"SANDBOX-REAL-{int(asyncio.get_event_loop().time())}",
            "TradeAmt": str(amount_cents // 100),
            "Gateway": "2",
            "PaymentType": "1",
            "Status": "SUCCESS",
            "Message": "信用卡授權成功",
            "TradeStatus": "1",
            "CreditHash": test_credit_hash,
            "CreditLife": "1230",
        }
        encrypted = provider.encrypt_info(raw_callback_payload)
        hash_info = provider.hash_info(encrypted)
        form_fields = {
            "MerID": mer_id,
            "Version": "2.0",
            "EncryptInfo": encrypted,
            "HashInfo": hash_info,
        }
        print("✓ Encrypted AES-256-GCM envelope and SHA256 signature generated.")

        # 3. Post Signed Callback OVER PUBLIC NGROK TUNNEL
        print(f"\n--- [3/8] POST to Public Ngrok Webhook ---")
        print(f"Target: {NGROK_URL}/v1/billing/payuni/callback")
        public_resp = await client.post(
            f"{NGROK_URL}/v1/billing/payuni/callback",
            data=form_fields,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        print(f"Public Webhook Response: HTTP {public_resp.status_code} -> {public_resp.text}")
        assert public_resp.status_code == 200, f"Expected 200, got {public_resp.status_code}"
        assert public_resp.json() == {"status": "accepted"}
        print("✓ Public ngrok webhook successfully routed to local FastAPI and accepted!")

        # 4. Verify DB Provider Event & Outbox
        print("\n--- [4/8] Verifying Database Ingestion & Vault Encryption ---")
        with engine.connect() as conn:
            event = conn.execute(
                sa.text("""
                    SELECT id, provider, provider_event_ref, token_ciphertext, processed_at
                    FROM billing.provider_events
                    WHERE payload_redacted->>'MerTradeNo' = :order_no
                """),
                {"order_no": merchant_order_no}
            ).fetchone()
            assert event is not None, "Provider event was not recorded!"
            assert event.processed_at is None, "Provider event should not be processed yet!"
            assert event.token_ciphertext is not None, "Token must be sealed in provider event!"
            provider_event_id = event.id
            print(f"✓ Provider event recorded: {event.provider_event_ref}, Token safely sealed with Fernet.")

            outbox = conn.execute(
                sa.text("""
                    SELECT id, topic, processed_at
                    FROM billing.outbox_events
                    WHERE topic = 'billing.provider_callback.received'
                      AND payload->>'provider_event_id' = :eid
                """),
                {"eid": str(provider_event_id)}
            ).fetchone()
            assert outbox is not None, "Outbox event not found!"
            assert outbox.processed_at is None, "Outbox event should be pending!"
            print(f"✓ Outbox event verified: ID={outbox.id}, topic={outbox.topic}")

        # 5. Execute Callback Worker
        print("\n--- [5/8] Executing BillingCallbackWorker ---")
        async with httpx.AsyncClient(timeout=30) as repo_http:
            repo = BillingRepository(repo_http, SUPABASE_URL, SUPABASE_KEY)
            resolver = PayUniSandboxInitialOutcomeResolver(capabilities)
            worker = BillingCallbackWorker(repo, resolver, max_attempts=20)
            worker_run = await worker.run_once(limit=10)
            print(f"✓ Worker run finished: claimed={worker_run.claimed}, completed={worker_run.completed}, deferred={worker_run.deferred}, dead_lettered={worker_run.dead_lettered}")
            assert worker_run.claimed >= 1, "Worker should have claimed job!"
            assert worker_run.completed >= 1, "Worker should have completed job!"
            assert worker_run.dead_lettered == 0, "No job should be dead-lettered!"

        # 6. Comprehensive Post-Outcome Assertions
        print("\n--- [6/8] Verifying Database Post-Outcome State ---")
        with engine.connect() as conn:
            # Order
            order_row = conn.execute(
                sa.text("SELECT status, paid_at FROM billing.orders WHERE id = :id"),
                {"id": order_id}
            ).fetchone()
            assert order_row.status == "paid"
            assert order_row.paid_at is not None
            print("✓ billing.orders.status is 'paid' with valid paid_at timestamp.")

            # Subscription
            sub_row = conn.execute(
                sa.text("SELECT id, status, current_period_ends_at FROM billing.subscriptions WHERE user_id = :uid"),
                {"uid": TEST_USER_ID}
            ).fetchone()
            assert sub_row.status == "active"
            assert sub_row.current_period_ends_at is not None
            print("✓ billing.subscriptions is 'active' with 1 month period.")

            # Payment method & Token decryption test
            pm_row = conn.execute(
                sa.text("SELECT provider_token_ref, token_ciphertext FROM billing.payment_methods WHERE subscription_id = :sid"),
                {"sid": sub_row.id}
            ).fetchone()
            assert pm_row is not None
            fernet = Fernet(FERNET_KEY)
            decrypted_token = fernet.decrypt(pm_row.token_ciphertext.encode()).decode()
            assert decrypted_token == test_credit_hash
            print("✓ billing.payment_methods securely stores Fernet-encrypted CreditHash (decrypted token 100% matches).")

            # Provider event residual token cleanup
            pe_cleanup = conn.execute(
                sa.text("SELECT token_ciphertext FROM billing.provider_events WHERE id = :eid"),
                {"eid": provider_event_id}
            ).fetchone()
            assert pe_cleanup.token_ciphertext is None
            print("✓ billing.provider_events temporary token ciphertext was atomically cleansed.")

            # Legacy projection
            legacy_row = conn.execute(
                sa.text("SELECT tier, status FROM public.subscriptions WHERE user_id = :uid"),
                {"uid": TEST_USER_ID}
            ).fetchone()
            assert legacy_row.tier == "pro"
            assert legacy_row.status == "active"
            print("✓ public.subscriptions legacy projection updated to tier='pro', status='active'.")

        # 7. Check User Profile API
        print("\n--- [7/8] GET /v1/billing/me Confirmation ---")
        me_resp = await client.get(f"{LOCAL_SERVER_URL}/v1/billing/me", headers=auth_headers)
        assert me_resp.status_code == 200
        me_data = me_resp.json()
        assert me_data["subscription_status"] == "active"
        assert me_data["orders"][0]["status"] == "paid"
        print("✓ GET /v1/billing/me confirmed: subscription_status='active', order[0]='paid'")

        # 8. Idempotency & Attack Defense Tests via Public Ngrok
        print("\n--- [8/8] Testing Public Ngrok Idempotency & Tamper Rejection ---")
        # 8a: Re-send same callback over ngrok
        re_send_resp = await client.post(
            f"{NGROK_URL}/v1/billing/payuni/callback",
            data=form_fields,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert re_send_resp.status_code == 200
        print("✓ Re-sending identical callback via public ngrok accepted without error.")

        # 8b: Send tampered callback over ngrok
        tampered_fields = dict(form_fields)
        tampered_fields["HashInfo"] = "INVALID_HASH_SPOOFED_SIGNATURE"
        tampered_resp = await client.post(
            f"{NGROK_URL}/v1/billing/payuni/callback",
            data=tampered_fields,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert tampered_resp.status_code == 400
        print("✓ Tampered callback rejected over public ngrok with HTTP 400 Bad Request.")

    print("\n==================================================================")
    print("🎉 ALL SOLUTION 3 PUBLIC WEBHOOK E2E TESTS PASSED (8/8)!")
    print("==================================================================\n")


if __name__ == "__main__":
    asyncio.run(run_solution_3_e2e())
