import sys
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, MagicMock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from backend.app import _subscription_tier, app



class SubscriptionCutoverTests(unittest.IsolatedAsyncioTestCase):
    async def test_subscription_tier_returns_free_when_no_user_id(self):
        tier = await _subscription_tier("")
        self.assertEqual(tier, "free")

    async def test_subscription_tier_reads_canonical_entitlement_from_service(self):
        fake_service = MagicMock()
        fake_service.get_canonical_entitlement = AsyncMock(return_value="pro")
        app.state.billing_service = fake_service

        tier = await _subscription_tier("user-123")
        self.assertEqual(tier, "pro")
        fake_service.get_canonical_entitlement.assert_called_once_with("user-123")

    async def test_subscription_tier_returns_free_when_canonical_entitlement_is_free(self):
        fake_service = MagicMock()
        fake_service.get_canonical_entitlement = AsyncMock(return_value="free")
        app.state.billing_service = fake_service

        tier = await _subscription_tier("user-456")
        self.assertEqual(tier, "free")


if __name__ == "__main__":
    unittest.main()
