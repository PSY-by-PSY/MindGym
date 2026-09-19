import unittest
from types import SimpleNamespace

from backend.usage_metering import claude_cost, whisper_cost


class ClaudeCostTests(unittest.TestCase):
    def test_sonnet_input_and_output_cost(self):
        usage = SimpleNamespace(input_tokens=1_000_000, output_tokens=1_000_000)

        cost, breakdown = claude_cost("claude-sonnet-4-6", usage)

        self.assertEqual(cost, 18.0)
        self.assertEqual(breakdown["input_tokens"], 1_000_000)
        self.assertEqual(breakdown["output_tokens"], 1_000_000)

    def test_dated_model_name_uses_base_model_rate(self):
        usage = SimpleNamespace(input_tokens=1_000_000, output_tokens=0)

        cost, _ = claude_cost("claude-haiku-4-5-20251001", usage)

        self.assertEqual(cost, 1.0)

    def test_unknown_model_uses_conservative_default(self):
        usage = SimpleNamespace(input_tokens=1_000_000, output_tokens=0)

        cost, _ = claude_cost("future-model", usage)

        self.assertEqual(cost, 3.0)

    def test_cache_tokens_use_expected_multipliers(self):
        usage = SimpleNamespace(
            input_tokens=0,
            output_tokens=0,
            cache_creation_input_tokens=1_000_000,
            cache_read_input_tokens=1_000_000,
        )

        cost, breakdown = claude_cost("claude-sonnet-4-6", usage)

        self.assertEqual(cost, 4.05)
        self.assertEqual(breakdown["cache_write_tokens"], 1_000_000)
        self.assertEqual(breakdown["cache_read_tokens"], 1_000_000)

    def test_missing_or_invalid_usage_fields_become_zero(self):
        usage = SimpleNamespace(input_tokens="invalid", output_tokens=None)

        cost, breakdown = claude_cost("claude-sonnet-4-6", usage)

        self.assertEqual(cost, 0.0)
        self.assertEqual(
            breakdown,
            {
                "input_tokens": 0,
                "output_tokens": 0,
                "cache_write_tokens": 0,
                "cache_read_tokens": 0,
            },
        )


class WhisperCostTests(unittest.TestCase):
    def test_one_minute_cost(self):
        self.assertEqual(whisper_cost(60), 0.006)

    def test_negative_or_invalid_duration_is_zero(self):
        self.assertEqual(whisper_cost(-30), 0.0)
        self.assertEqual(whisper_cost("invalid"), 0.0)


if __name__ == "__main__":
    unittest.main()
