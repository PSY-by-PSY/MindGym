"""PAYUNi UPP envelope and guarded card-agreement capability.

The public UPP protocol documents the card-agreement fields, but a merchant is
not permitted to use them merely because it has API keys.  The capability is
therefore off by default and must be explicitly enabled only after PAYUNi has
approved the test/production merchant contract and source-IP allowlist.
"""

from dataclasses import dataclass
from hashlib import sha256
from hmac import compare_digest
import base64
import os
from time import time
from urllib.parse import parse_qsl, urlencode

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend.billing.credentials import FernetCredentialVault, SealedCredential
from backend.billing.errors import ProviderNotConfigured
from backend.billing.providers import CheckoutRequest, CheckoutSession
from backend.billing.worker import VerifiedPaymentOutcome

@dataclass(frozen=True)
class VerifiedCallback:
    event_ref: str
    merchant_order_no: str
    payload_redacted: dict[str, str]
    payment_credential: SealedCredential | None = None


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


@dataclass(frozen=True)
class PayUniCapabilities:
    """Merchant capabilities, intentionally independent from API credentials."""

    initial_card_agreement: bool = False
    initial_payment_outcome: bool = False
    backend_token_charge: bool = False
    token_query: bool = False
    token_cancel: bool = False

    @classmethod
    def from_environment(cls) -> "PayUniCapabilities":
        """Read only explicit, dual-confirmed sandbox switches.

        Keeping merchant approval and the operational feature flag separate
        prevents a copied set of credentials from enabling recurring-card
        behaviour by accident.
        """
        approved = os.environ.get("PAYUNI_TOKEN_CONTRACT_APPROVED") == "1"
        return cls(
            initial_card_agreement=(
                approved and os.environ.get("PAYUNI_INITIAL_CARD_AGREEMENT_SANDBOX_ENABLED") == "1"
            ),
            initial_payment_outcome=(
                approved and os.environ.get("PAYUNI_INITIAL_PAYMENT_OUTCOME_SANDBOX_ENABLED") == "1"
            ),
            backend_token_charge=(
                approved and os.environ.get("PAYUNI_BACKEND_TOKEN_CHARGE_SANDBOX_ENABLED") == "1"
            ),
            token_query=(
                approved and os.environ.get("PAYUNI_TOKEN_QUERY_SANDBOX_ENABLED") == "1"
            ),
            token_cancel=(
                approved and os.environ.get("PAYUNI_TOKEN_CANCEL_SANDBOX_ENABLED") == "1"
            ),
        )


class PayUniUppProvider:
    def __init__(
        self,
        settings: PayUniSettings,
        capabilities: PayUniCapabilities | None = None,
        credential_vault: FernetCredentialVault | None = None,
    ):
        self._settings = settings
        self._capabilities = capabilities or PayUniCapabilities()
        self._credential_vault = credential_vault

    async def assert_ready(self) -> None:
        if not self._settings.sandbox:
            raise ProviderNotConfigured("generic PAYUNi UPP is sandbox-only")
        # Every billing checkout in this slice is a recurring-card checkout.
        # Check this before persisting a pending order, rather than discovering
        # the missing merchant approval after the database write.
        if not self._capabilities.initial_card_agreement:
            raise ProviderNotConfigured("PAYUNi card-agreement capability is not approved and enabled")
        if self._credential_vault is None:
            raise ProviderNotConfigured("PAYUNi Token vault is not configured")

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
        return compare_digest(self.hash_info(encrypted_info), hash_info.upper())

    def verify_callback(self, fields: dict[str, str]) -> VerifiedCallback:
        # UPP v2 sends the same outer envelope shape to NotifyURL.  Check the
        # merchant and protocol version before attempting to trust its body.
        # This also makes a simulated callback exercise the real boundary.
        if fields.get("MerID") != self._settings.merchant_id:
            raise ValueError("PAYUNi callback merchant does not match")
        if fields.get("Version") != "2.0":
            raise ValueError("PAYUNi callback version is not UPP 2.0")
        encrypted = fields.get("EncryptInfo", "")
        if not encrypted or not self.verify_hash(encrypted, fields.get("HashInfo", "")):
            raise ValueError("PAYUNi callback hash verification failed")
        payload = self.decrypt_info(encrypted)
        if payload.get("MerID") != self._settings.merchant_id:
            raise ValueError("PAYUNi callback payload merchant does not match")
        order_no = payload.get("MerTradeNo", "")
        if not order_no:
            raise ValueError("PAYUNi callback has no merchant order number")
        safe = {key: payload[key] for key in (
            "MerTradeNo", "TradeNo", "Status", "Message", "TradeAmt", "TradeStatus",
            "PaymentType", "Gateway", "PayTime", "RespondCode", "CreditLife",
        ) if key in payload}
        event_ref = payload.get("TradeNo") or sha256(encrypted.encode()).hexdigest()
        credential = None
        credit_hash = payload.get("CreditHash", "")
        # The UPP contract documents CreditHash only after a successful card
        # authorisation.  Never preserve a token attached to an ambiguous or
        # failed response.
        if (
            credit_hash
            and payload.get("Status", "").upper() == "SUCCESS"
            and payload.get("TradeStatus") == "1"
            and payload.get("PaymentType") == "1"
            and self._capabilities.initial_card_agreement
        ):
            if self._credential_vault is None:
                raise ProviderNotConfigured("PAYUNi Token vault is not configured")
            # The reference lets us correlate a token without persisting the
            # provider token in plaintext.  The original CreditHash remains
            # only in the encrypted vault ciphertext.
            token_ref = "payuni:" + sha256(credit_hash.encode()).hexdigest()
            credential = self._credential_vault.seal(credit_hash, provider_token_ref=token_ref)
        return VerifiedCallback(
            event_ref=event_ref, merchant_order_no=order_no,
            payload_redacted=safe, payment_credential=credential,
        )

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
        if request.recurring_consent is not None:
            if not self._capabilities.initial_card_agreement:
                raise ProviderNotConfigured(
                    "PAYUNi card-agreement capability is not approved and enabled"
                )
            # PAYUNi UPP: 1 = agreement card.  MindGym has one merchant store
            # and must not share a card token with other stores in the PAYUNi
            # member account, so scope the token to this store (2).
            # Do not expose these values in the browser form; they remain in
            # the encrypted provider envelope.
            payload.update({
                "CreditToken": request.recurring_consent.customer_reference,
                "UseTokenType": "1",
                "CreditTokenType": "2",
            })
        encrypted_info = self.encrypt_info(payload)
        return CheckoutSession(
            form_action=self.endpoint,
            form_fields={
                "MerID": self._settings.merchant_id,
                "Version": "2.0",
                "EncryptInfo": encrypted_info,
                "HashInfo": self.hash_info(encrypted_info),
            },
        )


class PayUniSandboxInitialOutcomeResolver:
    """Map only documented, verified UPP outcomes; defer all other states."""

    def __init__(self, capabilities: PayUniCapabilities):
        self._capabilities = capabilities

    async def resolve(self, event) -> VerifiedPaymentOutcome:
        if not self._capabilities.initial_payment_outcome:
            raise ProviderNotConfigured("PAYUNi initial-payment outcome capability is not enabled")
        if event.provider != "payuni":
            raise ValueError("unexpected provider")
        payload = event.payload_redacted
        status = payload.get("Status", "").upper()
        if event.currency != "TWD" or event.amount_cents <= 0 or event.amount_cents % 100:
            raise ValueError("unsupported order currency or amount")
        if payload.get("TradeAmt") != str(event.amount_cents // 100):
            raise ValueError("callback amount does not match order")
        # UPP v2 documents a paid card response as SUCCESS + TradeStatus 1 +
        # PaymentType 1.  UNKNOWN, UNAPPROVED and error codes are not a safe
        # final failure mapping: they must be reconciled by the documented
        # transaction-query adapter once the merchant contract is approved.
        if status == "SUCCESS" and payload.get("TradeStatus") == "1" and payload.get("PaymentType") == "1":
            transaction_ref = payload.get("TradeNo", "")
            if not transaction_ref:
                raise ValueError("successful callback has no transaction reference")
            if not event.provider_token_ref or not event.token_ciphertext:
                raise ValueError("successful recurring callback has no payment credential")
            return VerifiedPaymentOutcome(
                "succeeded", transaction_ref,
                provider_token_ref=event.provider_token_ref,
                token_ciphertext=event.token_ciphertext,
            )
        raise ProviderNotConfigured("PAYUNi callback requires transaction-query or contract outcome mapping")


def sandbox_provider_from_environment() -> PayUniUppProvider | None:
    if os.environ.get("PAYUNI_GENERIC_UPP_SANDBOX_ENABLED") != "1":
        return None
    settings = PayUniSettings.from_environment()
    if not settings.sandbox:
        raise ProviderNotConfigured("PAYUNi UPP sandbox provider cannot be enabled in production")
    capabilities = PayUniCapabilities.from_environment()
    vault = FernetCredentialVault.from_environment() if capabilities.initial_card_agreement else None
    return PayUniUppProvider(settings, capabilities, vault)


def sandbox_outcome_resolver_from_environment() -> PayUniSandboxInitialOutcomeResolver | None:
    """Return no resolver until a specifically approved sandbox operation is enabled."""
    capabilities = PayUniCapabilities.from_environment()
    if not capabilities.initial_payment_outcome:
        return None
    return PayUniSandboxInitialOutcomeResolver(capabilities)
