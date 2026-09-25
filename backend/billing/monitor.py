"""Service-role-only operational read model for billing outbox monitoring."""


class BillingOutboxMonitor:
    def __init__(self, repository):
        self._repository = repository

    async def callback_queue_health(self):
        return await self._repository.get_outbox_health(topic="billing.provider_callback.received")

    async def callback_dead_letters(self, *, limit: int = 50):
        return await self._repository.list_dead_outbox_events(
            topic="billing.provider_callback.received", limit=limit,
        )
