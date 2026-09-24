"""PAYUNi generic UPP envelope, derived from PAYUNi's public PHP SDK.

This is deliberately limited to generic sandbox UPP. Card-binding/token fields
are not inferred here and require the merchant's approved recurring contract.
"""

from dataclasses import dataclass
from hashlib import sha256
import base64
import os
from time import time
from urllib.parse import parse_qsl, urlencode

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend.billing.errors import ProviderNotConfigured
from backend.billing.providers import CheckoutRequest, CheckoutSession


@dataclass(frozen=True)
class PayUniSettings:
    merchant_id: str
    hash_key: str
    hash_iv: str
    return_url: str
    sandbox: bool = True

    @classmethod
    def from_environment(cls) -> "PayUniSettings":
        values = {name: os.environ.get(name, "").strip() for name in (
            "PAYUNI_MERCHANT_ID", "PAYUNI_HASH_KEY", "PAYUNI_HASH_IV", "PAYUNI_RETURN_URL",
        )}
        if not all(values.values()):
            raise ProviderNotConfigured("PAYUNi sandbox settings are incomplete")
        if len(values["PAYUNI_HASH_KEY"]) != 32 or len(values["PAYUNI_HASH_IV"]) != 16:
            raise ProviderNotConfigured("PAYUNi key material has an invalid length")
        return cls(
            merchant_id=values["PAYUNI_MERCHANT_ID"], hash_key=values["PAYUNI_HASH_KEY"],
            hash_iv=values["PAYUNI_HASH_IV"], return_url=values["PAYUNI_RETURN_URL"],
            sandbox=os.environ.get("PAYUNI_ENV", "sandbox") == "sandbox",
        )


class PayUniUppProvider:
    def __init__(self, settings: PayUniSettings):
        self._settings = settings

    async def assert_ready(self) -> None:
        if not self._settings.sandbox:
            raise ProviderNotConfigured("generic PAYUNi UPP is sandbox-only")

    @property
    def endpoint(self) -> str:
        host = "sandbox-api.payuni.com.tw" if self._settings.sandbox else "api.payuni.com.tw"
        return f"https://{host}/api/upp"

    def encrypt_info(self, payload: dict[str, str]) -> str:
        plaintext = urlencode(payload).encode()
        encrypted = AESGCM(self._settings.hash_key.encode()).encrypt(self._settings.hash_iv.encode(), plaintext, None)
        ciphertext, tag = encrypted[:-16], encrypted[-16:]
        return (base64.b64encode(ciphertext) + b":::" + base64.b64encode(tag)).hex()

    def decrypt_info(self, encrypted_hex: str) -> dict[str, str]:
        try:
            ciphertext_b64, tag_b64 = bytes.fromhex(encrypted_hex).split(b":::", 1)
            plaintext = AESGCM(self._settings.hash_key.encode()).decrypt(
                self._settings.hash_iv.encode(), base64.b64decode(ciphertext_b64) + base64.b64decode(tag_b64), None
            )
        except Exception as exc:
            raise ValueError("invalid PAYUNi encrypted envelope") from exc
        return dict(parse_qsl(plaintext.decode(), keep_blank_values=True))

    def hash_info(self, encrypted_info: str) -> str:
        return sha256((self._settings.hash_key + encrypted_info + self._settings.hash_iv).encode()).hexdigest().upper()

    def verify_hash(self, encrypted_info: str, hash_info: str) -> bool:
        return self.hash_info(encrypted_info) == hash_info.upper()

    async def create_initial_checkout(self, request: CheckoutRequest) -> CheckoutSession:
        await self.assert_ready()
        if request.currency != "TWD" or request.amount_cents <= 0 or request.amount_cents % 100:
            raise ProviderNotConfigured("generic UPP requires a whole-TWD amount")
        payload = {
            "MerID": self._settings.merchant_id,
            "Timestamp": str(int(time())),
            "MerTradeNo": request.merchant_order_no,
            "TradeAmt": str(request.amount_cents // 100),
            "ProdDesc": request.description,
            "ReturnURL": self._settings.return_url,
            "NotifyURL": request.callback_url,
        }
        encrypted_info = self.encrypt_info(payload)
        return CheckoutSession(
            form_action=self.endpoint,
            form_fields={
                "MerID": self._settings.merchant_id,
                "Version": "1.0",
                "EncryptInfo": encrypted_info,
                "HashInfo": self.hash_info(encrypted_info),
            },
        )


def sandbox_provider_from_environment() -> PayUniUppProvider | None:
    if os.environ.get("PAYUNI_GENERIC_UPP_SANDBOX_ENABLED") != "1":
        return None
    return PayUniUppProvider(PayUniSettings.from_environment())
