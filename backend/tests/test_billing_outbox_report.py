from datetime import datetime, timezone
import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.billing_outbox_report import build_report
from backend.billing.repository import OutboxHealth


class FakeMonitor:
    async def callback_queue_health(self):
        return [OutboxHealth(
            topic="billing.provider_callback.received", status="pending",
            event_count=2, oldest_created_at=datetime(2026, 9, 25, tzinfo=timezone.utc),
        )]

    async def callback_dead_letters(self, *, limit=50):
        self.limit = limit
        return []


class BillingOutboxReportTests(unittest.IsolatedAsyncioTestCase):
    async def test_report_contains_only_operational_callback_data(self):
        monitor = FakeMonitor()
        report = await build_report(monitor)

        self.assertEqual(report["topic"], "billing.provider_callback.received")
        self.assertEqual(report["health"][0]["event_count"], 2)
        self.assertEqual(report["dead_letters"], [])
