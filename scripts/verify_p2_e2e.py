"""End-to-end acceptance test for P2.2 local callback flow.

Exercises:
1. Plans listing (HTTP GET /v1/billing/plans)
2. Authenticated checkout creation (HTTP POST /v1/billing/checkout-sessions)
3. Order query (HTTP GET /v1/billing/orders/{order_id})
4. Signed PAYUNi UPP v2 callback submission (via simulate_payuni_callback.py)
5. Callback worker processing & outcome transaction (via BillingCallbackWorker)
6. Comprehensive database assertions (order=paid, sub=active, token sealed & decryptable in payment_methods, provider_events cleansed)
7. Billing overview verification (HTTP GET /v1/billing/me)
8. Idempotent re-send handling
"""

import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import httpx
from cryptography.fernet import Fernet
import sqlalchemy as sa

from backend.billing.payuni import (
    PayUniCapabilities,
    PayUniSandboxInitialOutcomeResolver,
    PayUniSettings,
    PayUniUppProvider,
)
from backend.billing.repository import BillingRepository
from backend.billing.worker import BillingCallbackWorker

# Test configuration
SERVER_URL = "http://127.0.0.1:8001"
SUPABASE_URL = "http://127.0.0.1:54321"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
FERNET_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="

os.environ["MINDGYM_LOCAL_TEST"] = "1"
os.environ["SUPABASE_URL"] = SUPABASE_URL
os.environ["SUPABASE_KEY"] = SUPABASE_KEY
os.environ["BILLING_SERVICE_ROLE_KEY"] = SUPABASE_KEY
os.environ["BILLING_OPERATIONS_ENABLED"] = "1"
PAYUNI_FILE = ROOT.parent / "payuni.txt"
if PAYUNI_FILE.exists():
    with open(PAYUNI_FILE, encoding="utf-8") as f:
        _txt = f.read()
    _mer = re.search(r"商店代號：\s*(\S+)", _txt)
    _key = re.search(r"Hash Key:\s*(\S+)", _txt)
    _iv = re.search(r"IV KEY:\s*(\S+)", _txt)
    if _mer: os.environ.setdefault("PAYUNI_MERCHANT_ID", _mer.group(1))
    if _key: os.environ.setdefault("PAYUNI_HASH_KEY", _key.group(1))
    if _iv: os.environ.setdefault("PAYUNI_HASH_IV", _iv.group(1))

os.environ["PAYUNI_RETURN_URL"] = "http://localhost:3000/billing/return"
os.environ["PAYUNI_GENERIC_UPP_SANDBOX_ENABLED"] = "1"
os.environ["PAYUNI_INITIAL_CARD_AGREEMENT_SANDBOX_ENABLED"] = "1"
os.environ["PAYUNI_TOKEN_CONTRACT_APPROVED"] = "1"
os.environ["PAYUNI_INITIAL_PAYMENT_OUTCOME_SANDBOX_ENABLED"] = "1"
os.environ["BILLING_TOKEN_ENCRYPTION_KEY"] = FERNET_KEY

TEST_USER_ID = "7b0c6be1-0bdd-4557-8964-b3ff92f9b2ef"
JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long"
DB_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:55434/postgres"


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
    """Clean previous orders/subscriptions for the test user to allow a fresh run."""
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


async def run_e2e():
    engine = sa.create_engine(DB_URL)
    print("--- [0/8] Resetting test user billing state in DB ---")
    reset_test_user_data(engine)
    print("✓ Test state clean.")

    async with httpx.AsyncClient(base_url=SERVER_URL, timeout=30) as client:
        jwt_token = make_jwt(TEST_USER_ID)
        auth_headers = {"Authorization": f"Bearer {jwt_token}"}

        # 1. List Plans
        print("\n--- [1/8] GET /v1/billing/plans ---")
        resp = await client.get("/v1/billing/plans")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        plans = resp.json()
        print(f"✓ Plans returned: {len(plans)} plans available.")
        plan = next((p for p in plans if p["code"] == "p2-callback-monthly"), None)
        assert plan is not None, "Test plan p2-callback-monthly not found!"
        print(f"✓ Found target plan: {plan['code']} ({plan['amount_cents']} cents)")

        # 2. Create Checkout Session
        print("\n--- [2/8] POST /v1/billing/checkout-sessions ---")
        idempotency_key = f"e2e-{uuid.uuid4().hex[:12]}"
        checkout_payload = {
            "plan_code": "p2-callback-monthly",
            "terms_version": "p2-terms-v1",
            "recurring_consent": True,
            "recurring_consent_version": "recurring-v1",
        }
        resp = await client.post(
            "/v1/billing/checkout-sessions",
            json=checkout_payload,
            headers={**auth_headers, "Idempotency-Key": idempotency_key},
        )
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        checkout_data = resp.json()
        order_id = checkout_data["order_id"]
        print(f"✓ Checkout session created successfully! Order ID: {order_id}")
        assert checkout_data["status"] == "pending"
        assert checkout_data["form_action"] is not None
        assert "EncryptInfo" in checkout_data["form_fields"]
        assert "HashInfo" in checkout_data["form_fields"]
        assert checkout_data["form_fields"]["Version"] == "2.0"
        print("✓ Verified encrypted UPP v2 form envelope structure.")

        # Query DB to get merchant_order_no
        with engine.connect() as conn:
            row = conn.execute(
                sa.text("SELECT merchant_order_no, amount_cents, status FROM billing.orders WHERE id = :id"),
                {"id": order_id}
            ).fetchone()
            assert row is not None, "Order row not found in DB!"
            merchant_order_no = row.merchant_order_no
            amount_cents = row.amount_cents
            print(f"✓ DB Order confirmed: {merchant_order_no}, amount_cents={amount_cents}, status={row.status}")

        # 3. Query Order
        print("\n--- [3/8] GET /v1/billing/orders/{order_id} ---")
        resp = await client.get(f"/v1/billing/orders/{order_id}", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        order_status = resp.json()
        assert order_status["status"] == "pending"
        assert order_status["can_resume"] is True
        print(f"✓ Order status verified: {order_status['status']}, can_resume={order_status['can_resume']}")

        # 4. Simulate Signed PAYUNi Callback via simulator script
        print("\n--- [4/8] Running simulate_payuni_callback.py ---")
        callback_url = f"{SERVER_URL}/v1/billing/payuni/callback"
        sim_cmd = [
            sys.executable,
            str(ROOT / "scripts" / "simulate_payuni_callback.py"),
            "--merchant-order-no", merchant_order_no,
            "--amount-twd", str(amount_cents // 100),
            "--outcome", "success",
            "--callback-url", callback_url,
        ]
        sim_proc = subprocess.run(sim_cmd, capture_output=True, text=True, env=os.environ.copy())
        print(f"Simulator stdout: {sim_proc.stdout.strip()}")
        if sim_proc.stderr:
            print(f"Simulator stderr: {sim_proc.stderr.strip()}")
        assert sim_proc.returncode == 0, f"Simulator failed with code {sim_proc.returncode}"
        print("✓ Signed callback sent and accepted by server.")

        # 5. Verify DB Provider Event & Outbox
        print("\n--- [5/8] Verifying Provider Event & Outbox in Database ---")
        with engine.connect() as conn:
            event = conn.execute(
                sa.text("SELECT id, provider, provider_event_ref, token_ciphertext, processed_at FROM billing.provider_events WHERE payload_redacted->>'MerTradeNo' = :order_no"),
                {"order_no": merchant_order_no}
            ).fetchone()
            assert event is not None, "Provider event was not recorded!"
            assert event.processed_at is None, "Provider event should not be processed before worker runs!"
            assert event.token_ciphertext is not None, "Temporary sealed token should be stored in provider event!"
            provider_event_id = event.id
            print(f"✓ Provider event recorded: {event.provider_event_ref}, token is securely sealed.")

            outbox = conn.execute(
                sa.text("SELECT id, topic, processed_at FROM billing.outbox_events WHERE topic = 'billing.provider_callback.received' AND payload->>'provider_event_id' = :eid"),
                {"eid": str(provider_event_id)}
            ).fetchone()
            assert outbox is not None, "Outbox event not found!"
            assert outbox.processed_at is None, "Outbox event should be pending!"
            print(f"✓ Outbox event verified: ID={outbox.id}, topic={outbox.topic}")

        # 6. Execute Callback Worker
        print("\n--- [6/8] Executing BillingCallbackWorker ---")
        async with httpx.AsyncClient(timeout=30) as repo_http:
            repo = BillingRepository(repo_http, SUPABASE_URL, SUPABASE_KEY)
            capabilities = PayUniCapabilities.from_environment()
            assert capabilities.initial_payment_outcome is True
            resolver = PayUniSandboxInitialOutcomeResolver(capabilities)
            worker = BillingCallbackWorker(repo, resolver, max_attempts=20)
            worker_run = await worker.run_once(limit=10)
            print(f"✓ Worker run finished: claimed={worker_run.claimed}, completed={worker_run.completed}, deferred={worker_run.deferred}, dead_lettered={worker_run.dead_lettered}")
            assert worker_run.claimed >= 1, "Worker should have claimed at least 1 job!"
            assert worker_run.completed >= 1, "Worker should have completed at least 1 job!"
            assert worker_run.dead_lettered == 0, "No job should be dead-lettered!"

        # 7. Comprehensive Database Assertions
        print("\n--- [7/8] Verifying Database State Post-Outcome Transaction ---")
        with engine.connect() as conn:
            # Order status
            order_row = conn.execute(
                sa.text("SELECT status, paid_at FROM billing.orders WHERE id = :id"),
                {"id": order_id}
            ).fetchone()
            assert order_row.status == "paid", f"Expected order status 'paid', got '{order_row.status}'"
            assert order_row.paid_at is not None, "Order paid_at must not be NULL"
            print("✓ Order status is 'paid' with valid paid_at timestamp.")

            # Subscription status
            sub_row = conn.execute(
                sa.text("SELECT id, status, current_period_ends_at FROM billing.subscriptions WHERE user_id = :uid"),
                {"uid": TEST_USER_ID}
            ).fetchone()
            assert sub_row is not None, "Subscription not found!"
            assert sub_row.status == "active", f"Expected subscription status 'active', got '{sub_row.status}'"
            assert sub_row.current_period_ends_at is not None, "current_period_ends_at must not be NULL"
            subscription_id = sub_row.id
            print(f"✓ Subscription is 'active' (ID: {subscription_id}), period ends at: {sub_row.current_period_ends_at}")

            # Payment method and decrypted token
            pm_row = conn.execute(
                sa.text("SELECT provider, provider_token_ref, token_ciphertext FROM billing.payment_methods WHERE subscription_id = :sid"),
                {"sid": subscription_id}
            ).fetchone()
            assert pm_row is not None, "Payment method record not found!"
            assert pm_row.provider == "payuni"
            vault = Fernet(FERNET_KEY.encode())
            decrypted_token = vault.decrypt(pm_row.token_ciphertext.encode()).decode()
            fake_credit_hash = "simulated-credit-hash-not-usable"
            assert decrypted_token == fake_credit_hash, f"Decrypted token '{decrypted_token}' does not match expected '{fake_credit_hash}'"
            print("✓ Payment method securely stores Fernet-encrypted CreditHash and successfully decrypts to match original token!")

            # Provider event cleanup (token_ciphertext cleared)
            event_row = conn.execute(
                sa.text("SELECT token_ciphertext, processed_at FROM billing.provider_events WHERE id = :id"),
                {"id": provider_event_id}
            ).fetchone()
            assert event_row.token_ciphertext is None, "Temporary token_ciphertext in provider_events MUST be cleared after outcome transaction!"
            assert event_row.processed_at is not None, "provider_events.processed_at must be populated!"
            print("✓ Temporary token in provider_events successfully purged from event record.")

            # Entitlement change recorded
            ent_row = conn.execute(
                sa.text("SELECT reason, effective_at FROM billing.entitlement_changes WHERE subscription_id = :sid"),
                {"sid": subscription_id}
            ).fetchone()
            assert ent_row is not None, "Entitlement change record not found!"
            print(f"✓ Entitlement change audit logged: reason='{ent_row.reason}'")

            # Legacy projection updated
            legacy_row = conn.execute(
                sa.text("SELECT tier, status FROM public.subscriptions WHERE user_id = :uid"),
                {"uid": TEST_USER_ID}
            ).fetchone()
            assert legacy_row is not None, "Legacy subscription row not found!"
            assert legacy_row.tier == "pro", f"Legacy projection tier expected 'pro', got '{legacy_row.tier}'"
            assert legacy_row.status == "active", f"Legacy projection status expected 'active', got '{legacy_row.status}'"
            print("✓ Legacy subscription projection atomically updated to tier='pro', status='active'.")

            # Outbox completed
            outbox_row = conn.execute(
                sa.text("SELECT processed_at, last_error FROM billing.outbox_events WHERE topic = 'billing.provider_callback.received' AND payload->>'provider_event_id' = :eid"),
                {"eid": str(provider_event_id)}
            ).fetchone()
            assert outbox_row.processed_at is not None, "Outbox event processed_at must not be NULL"
            print("✓ Outbox event marked processed_at.")

        # Check /v1/billing/me
        resp = await client.get("/v1/billing/me", headers=auth_headers)
        assert resp.status_code == 200
        me_data = resp.json()
        assert me_data["subscription_status"] == "active"
        assert len(me_data["orders"]) >= 1
        assert me_data["orders"][0]["status"] == "paid"
        print("✓ GET /v1/billing/me confirmed: subscription_status='active', order[0]='paid'")

        # 8. Idempotency test (re-sending the same callback)
        print("\n--- [8/8] Testing Idempotent Re-Send ---")
        sim_proc = subprocess.run(sim_cmd, capture_output=True, text=True, env=os.environ.copy())
        assert sim_proc.returncode == 0
        print("✓ Re-sent callback accepted without error.")

        # Run worker again
        async with httpx.AsyncClient(timeout=30) as repo_http:
            repo = BillingRepository(repo_http, SUPABASE_URL, SUPABASE_KEY)
            capabilities = PayUniCapabilities.from_environment()
            resolver = PayUniSandboxInitialOutcomeResolver(capabilities)
            worker = BillingCallbackWorker(repo, resolver, max_attempts=20)
            worker_run = await worker.run_once(limit=10)
            print(f"✓ Second worker run: claimed={worker_run.claimed}, completed={worker_run.completed}")

        with engine.connect() as conn:
            order_count = conn.execute(
                sa.text("SELECT count(*) FROM billing.orders WHERE id = :id"),
                {"id": order_id}
            ).scalar_one()
            assert order_count == 1, f"Expected 1 order, found {order_count}"
            sub_count = conn.execute(
                sa.text("SELECT count(*) FROM billing.subscriptions WHERE user_id = :uid"),
                {"uid": TEST_USER_ID}
            ).scalar_one()
            assert sub_count == 1, f"Expected 1 subscription, found {sub_count}"
            attempts_count = conn.execute(
                sa.text("SELECT count(*) FROM billing.payment_attempts WHERE order_id = :oid"),
                {"oid": order_id}
            ).scalar_one()
            assert attempts_count == 1, f"Expected 1 payment_attempt, found {attempts_count}"
            print("✓ Idempotency confirmed: No duplicate orders, subscriptions, or payment attempts created.")

    print("\n=======================================================")
    print("🎉 ALL P2.2 END-TO-END ACCEPTANCE TESTS PASSED (8/8)!")
    print("=======================================================\n")


if __name__ == "__main__":
    asyncio.run(run_e2e())
