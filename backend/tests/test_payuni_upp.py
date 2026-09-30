import asyncio
import os
import sys
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.parse import parse_qsl

from cryptography.fernet import Fernet

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.billing.errors import ProviderNotConfigured
from backend.billing.credentials import FernetCredentialVault
from backend.billing.payuni import (
    PayUniCapabilities, PayUniSandboxInitialOutcomeResolver, PayUniSettings, PayUniUppProvider,
)
from backend.billing.providers import CheckoutRequest, RecurringConsent
from backend.billing.repository import ProviderEventForProcessing


class PayUniUppTests(unittest.TestCase):
    def setUp(self):
        self.settings = PayUniSettings(
            merchant_id="sandbox-shop", hash_key="K" * 32, hash_iv="I" * 16,
            return_url="https://web.example.invalid/return",
        )
        self.provider = PayUniUppProvider(self.settings)

    def test_envelope_round_trip_and_hash(self):
        encrypted = self.provider.encrypt_info({"MerID":"sandbox-shop", "TradeAmt":"99", "ProdDesc":"Mind Gym"})
        self.assertEqual(self.provider.decrypt_info(encrypted)["ProdDesc"], "Mind Gym")
        self.assertTrue(self.provider.verify_hash(encrypted, self.provider.hash_info(encrypted)))
        self.assertFalse(self.provider.verify_hash(encrypted, "0" * 64))

    def test_sandbox_upp_returns_post_form_not_card_data(self):
        provider = PayUniUppProvider(
            self.settings, PayUniCapabilities(initial_card_agreement=True),
            FernetCredentialVault(Fernet.generate_key().decode()),
        )
        session = asyncio.run(provider.create_initial_checkout(CheckoutRequest(
            merchant_order_no="MG-TEST", amount_cents=9900, currency="TWD",
            description="MindGym subscription", callback_url="https://api.example.invalid/v1/billing/payuni/callback",
        )))
        self.assertEqual(session.form_action, "https://sandbox-api.payuni.com.tw/api/upp")
        self.assertEqual(set(session.form_fields), {"MerID", "Version", "EncryptInfo", "HashInfo"})
        self.assertEqual(session.form_fields["Version"], "2.0")
        self.assertNotIn("CardNo", session.form_fields)

    def test_callback_verifies_and_redacts_token_fields(self):
        encrypted = self.provider.encrypt_info({
            "MerID":"sandbox-shop", "MerTradeNo":"MG-TEST", "TradeNo":"PU-1", "Status":"SUCCESS",
            "TradeAmt":"99", "TradeStatus":"1", "PaymentType":"1", "CreditHash":"must-not-persist",
        })
        callback = self.provider.verify_callback({"MerID":"sandbox-shop", "Version":"2.0", "EncryptInfo": encrypted, "HashInfo": self.provider.hash_info(encrypted)})
        self.assertEqual(callback.event_ref, "PU-1")
        self.assertEqual(callback.payload_redacted["MerTradeNo"], "MG-TEST")
        self.assertNotIn("CreditHash", callback.payload_redacted)

    def test_callback_rejects_wrong_outer_merchant_or_protocol_version(self):
        encrypted = self.provider.encrypt_info({"MerID":"sandbox-shop", "MerTradeNo":"MG-TEST"})
        fields = {"MerID":"other-shop", "Version":"2.0", "EncryptInfo": encrypted, "HashInfo": self.provider.hash_info(encrypted)}
        with self.assertRaisesRegex(ValueError, "merchant"):
            self.provider.verify_callback(fields)
        fields["MerID"] = "sandbox-shop"
        fields["Version"] = "1.0"
        with self.assertRaisesRegex(ValueError, "version"):
            self.provider.verify_callback(fields)

    def test_card_agreement_requires_explicit_merchant_capability(self):
        request = CheckoutRequest(
            merchant_order_no="MG-TEST", amount_cents=9900, currency="TWD",
            description="MindGym subscription", callback_url="https://api.example.invalid/callback",
            recurring_consent=RecurringConsent("member-123", "recurring-v1"),
        )

        with self.assertRaisesRegex(ProviderNotConfigured, "card-agreement capability"):
            asyncio.run(self.provider.create_initial_checkout(request))

    def test_card_agreement_fields_remain_inside_the_encrypted_upp_envelope(self):
        provider = PayUniUppProvider(
            self.settings, PayUniCapabilities(initial_card_agreement=True),
            FernetCredentialVault(Fernet.generate_key().decode()),
        )
        session = asyncio.run(provider.create_initial_checkout(CheckoutRequest(
            merchant_order_no="MG-TEST", amount_cents=9900, currency="TWD",
            description="MindGym subscription", callback_url="https://api.example.invalid/callback",
            recurring_consent=RecurringConsent("member-123", "recurring-v1"),
        )))

        self.assertEqual(set(session.form_fields), {"MerID", "Version", "EncryptInfo", "HashInfo"})
        payload = provider.decrypt_info(session.form_fields["EncryptInfo"])
        self.assertEqual(payload["CreditToken"], "member-123")
        self.assertEqual(payload["UseTokenType"], "1")
        self.assertEqual(payload["CreditTokenType"], "2")
        self.assertNotIn("CreditHash", payload)

    def test_environment_requires_both_contract_approval_and_operation_flag(self):
        names = {
            "PAYUNI_TOKEN_CONTRACT_APPROVED",
            "PAYUNI_INITIAL_CARD_AGREEMENT_SANDBOX_ENABLED",
            "PAYUNI_BACKEND_TOKEN_CHARGE_SANDBOX_ENABLED",
        }
        environment = {key: value for key, value in os.environ.items() if key not in names}

        with patch.dict(os.environ, environment, clear=True):
            self.assertFalse(PayUniCapabilities.from_environment().initial_card_agreement)
            with patch.dict(os.environ, {"PAYUNI_INITIAL_CARD_AGREEMENT_SANDBOX_ENABLED": "1"}):
                self.assertFalse(PayUniCapabilities.from_environment().initial_card_agreement)
            with patch.dict(os.environ, {
                "PAYUNI_TOKEN_CONTRACT_APPROVED": "1",
                "PAYUNI_INITIAL_CARD_AGREEMENT_SANDBOX_ENABLED": "1",
            }):
                capabilities = PayUniCapabilities.from_environment()
                self.assertTrue(capabilities.initial_card_agreement)
                self.assertFalse(capabilities.backend_token_charge)

    def test_verified_card_token_is_sealed_not_added_to_redacted_callback(self):
        vault = FernetCredentialVault(Fernet.generate_key().decode())
        provider = PayUniUppProvider(
            self.settings, PayUniCapabilities(initial_card_agreement=True), vault,
        )
        encrypted = provider.encrypt_info({
            "MerID":"sandbox-shop", "MerTradeNo": "MG-TEST", "TradeNo": "PU-1", "Status": "SUCCESS",
            "TradeAmt": "99", "TradeStatus":"1", "PaymentType":"1", "CreditHash": "provider-secret-token",
        })
        callback = provider.verify_callback({"MerID":"sandbox-shop", "Version":"2.0", "EncryptInfo": encrypted, "HashInfo": provider.hash_info(encrypted)})

        self.assertNotIn("CreditHash", callback.payload_redacted)
        self.assertIsNotNone(callback.payment_credential)
        self.assertNotIn("provider-secret-token", callback.payment_credential.ciphertext)
        self.assertEqual(vault.unseal(callback.payment_credential.ciphertext), "provider-secret-token")

    def test_outcome_resolver_requires_matching_amount_and_sealed_credential(self):
        resolver = PayUniSandboxInitialOutcomeResolver(
            PayUniCapabilities(initial_payment_outcome=True),
        )
        event = ProviderEventForProcessing(
            "event-1", "payuni", "order-1", {"Status": "SUCCESS", "TradeNo": "PU-1", "TradeAmt": "99", "TradeStatus":"1", "PaymentType":"1"},
            9900, "TWD", "payuni:token-ref", "ciphertext",
        )
        outcome = asyncio.run(resolver.resolve(event))
        self.assertEqual(outcome.status, "succeeded")
        self.assertEqual(outcome.provider_token_ref, "payuni:token-ref")

    def test_charge_token_requires_backend_token_charge_capability(self):
        with self.assertRaisesRegex(ProviderNotConfigured, "backend token charge capability"):
            asyncio.run(self.provider.charge_token(
                merchant_order_no="RNW-123",
                amount_cents=9900,
                credit_hash="some-token",
            ))

    def test_charge_token_sends_payload_and_returns_success(self):
        import httpx
        provider = PayUniUppProvider(
            self.settings,
            PayUniCapabilities(backend_token_charge=True),
        )

        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/api/credit")
            body = dict(parse_qsl(request.content.decode()))
            self.assertEqual(body["MerID"], "sandbox-shop")
            self.assertIn(body["Version"], ("1.0", "1.3"))
            decrypted = provider.decrypt_info(body["EncryptInfo"])
            self.assertEqual(decrypted["MerTradeNo"], "RNW-123")
            self.assertEqual(decrypted["TradeAmt"], "99")
            self.assertEqual(decrypted["CreditHash"], "token-xyz")
            resp_enc = provider.encrypt_info({
                "Status": "SUCCESS",
                "TradeStatus": "1",
                "TradeNo": "PU-TX-999",
                "Message": "Charge OK",
            })
            return httpx.Response(200, json={"EncryptInfo": resp_enc})

        with patch("httpx.AsyncClient", return_value=httpx.AsyncClient(transport=httpx.MockTransport(handler))):
            res = asyncio.run(provider.charge_token(
                merchant_order_no="RNW-123",
                amount_cents=9900,
                credit_hash="token-xyz",
            ))

        self.assertTrue(res.succeeded)
        self.assertEqual(res.trade_no, "PU-TX-999")
        self.assertEqual(res.message, "Charge OK")

    def test_charge_token_handles_failure_response(self):
        import httpx
        provider = PayUniUppProvider(
            self.settings,
            PayUniCapabilities(backend_token_charge=True),
        )

        async def handler(request: httpx.Request) -> httpx.Response:
            resp_enc = provider.encrypt_info({
                "Status": "FAIL",
                "TradeStatus": "0",
                "ErrCode": "CARD_EXPIRED",
                "Message": "Card has expired",
            })
            return httpx.Response(200, json={"EncryptInfo": resp_enc})

        with patch("httpx.AsyncClient", return_value=httpx.AsyncClient(transport=httpx.MockTransport(handler))):
            res = asyncio.run(provider.charge_token(
                merchant_order_no="RNW-123",
                amount_cents=9900,
                credit_hash="token-expired",
            ))

        self.assertFalse(res.succeeded)
        self.assertEqual(res.failure_code, "CARD_EXPIRED")
        self.assertEqual(res.message, "Card has expired")


if __name__ == "__main__":
    unittest.main()
