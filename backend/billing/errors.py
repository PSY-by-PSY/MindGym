class BillingError(Exception):
    """Known business or infrastructure error safe to expose through the API."""


class ProviderNotConfigured(BillingError):
    """PAYUNi wire contract or credentials have not been enabled."""


class RepositoryError(BillingError):
    """Supabase/PostgREST rejected a billing operation."""
