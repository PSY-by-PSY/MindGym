"""Small, server-only vault for provider payment credentials.

The vault intentionally stores opaque provider tokens only.  It is never
constructed from browser input and its ciphertext must not be logged or
returned by an API.
"""

from dataclasses import dataclass
import os

from cryptography.fernet import Fernet, InvalidToken

from backend.billing.errors import ProviderNotConfigured


@dataclass(frozen=True)
class SealedCredential:
    provider_token_ref: str
    ciphertext: str


class FernetCredentialVault:
    def __init__(self, key: str):
        try:
            self._fernet = Fernet(key.encode())
        except (TypeError, ValueError) as exc:
            raise ProviderNotConfigured("BILLING_TOKEN_ENCRYPTION_KEY is invalid") from exc

    @classmethod
    def from_environment(cls) -> "FernetCredentialVault":
        key = os.environ.get("BILLING_TOKEN_ENCRYPTION_KEY", "").strip()
        if not key:
            raise ProviderNotConfigured("BILLING_TOKEN_ENCRYPTION_KEY is required for PAYUNi Token")
        return cls(key)

    def seal(self, token: str, *, provider_token_ref: str) -> SealedCredential:
        if not token or not provider_token_ref:
            raise ValueError("payment credential and its reference are required")
        return SealedCredential(
            provider_token_ref=provider_token_ref,
            ciphertext=self._fernet.encrypt(token.encode()).decode(),
        )

    def unseal(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except (InvalidToken, UnicodeDecodeError) as exc:
            raise ValueError("payment credential ciphertext is invalid") from exc
