import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.billing.monitor import BillingOutboxMonitor


class FakeRepository:
    def __init__(self): self.calls = []
    async def get_outbox_health(self, **kwargs): self.calls.append(("health", kwargs)); return ["health"]
    async def list_dead_outbox_events(self, **kwargs): self.calls.append(("dead", kwargs)); return ["dead"]


class BillingOutboxMonitorTests(unittest.IsolatedAsyncioTestCase):
    async def test_monitor_scopes_operational_queries_to_callback_topic(self):
        repository = FakeRepository()
        monitor = BillingOutboxMonitor(repository)

        self.assertEqual(await monitor.callback_queue_health(), ["health"])
        self.assertEqual(await monitor.callback_dead_letters(limit=10), ["dead"])
        self.assertEqual(repository.calls, [
            ("health", {"topic": "billing.provider_callback.received"}),
            ("dead", {"topic": "billing.provider_callback.received", "limit": 10}),
        ])
