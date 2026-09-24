import asyncio
import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.billing.payuni import PayUniSettings, PayUniUppProvider
from backend.billing.providers import CheckoutRequest


class PayUniUppTests(unittest.TestCase):
    def setUp(self):
        self.provider = PayUniUppProvider(PayUniSettings(
            merchant_id="sandbox-shop", hash_key="K" * 32, hash_iv="I" * 16,
            return_url="https://web.example.invalid/return",
        ))

    def test_envelope_round_trip_and_hash(self):
        encrypted = self.provider.encrypt_info({"MerID":"sandbox-shop", "TradeAmt":"99", "ProdDesc":"Mind Gym"})
        self.assertEqual(self.provider.decrypt_info(encrypted)["ProdDesc"], "Mind Gym")
        self.assertTrue(self.provider.verify_hash(encrypted, self.provider.hash_info(encrypted)))
        self.assertFalse(self.provider.verify_hash(encrypted, "0" * 64))

    def test_sandbox_upp_returns_post_form_not_card_data(self):
        session = asyncio.run(self.provider.create_initial_checkout(CheckoutRequest(
            merchant_order_no="MG-TEST", amount_cents=9900, currency="TWD",
            description="MindGym subscription", callback_url="https://api.example.invalid/v1/billing/payuni/callback",
        )))
        self.assertEqual(session.form_action, "https://sandbox-api.payuni.com.tw/api/upp")
        self.assertEqual(set(session.form_fields), {"MerID", "Version", "EncryptInfo", "HashInfo"})
        self.assertNotIn("CardNo", session.form_fields)


if __name__ == "__main__":
    unittest.main()
