import json
import unittest

from backend.diary_safety import build_crisis_email, entry_text, excerpt, labeled_fields, match_keywords
from backend.persona_builder import (
    MIN_ENTRIES,
    build_prompt,
    eligible_users,
    format_entries,
    parse_persona,
    response_text,
)

KEYWORDS = ["自殺", "想死", "割腕", "想消失"]


class LabeledFieldsTests(unittest.TestCase):
    def test_gratitude_uses_item_columns(self):
        e = {"practice_type": "gratitude", "item_1": "謝謝媽媽", "item_2": " ", "item_3": "好天氣", "payload": {}}
        self.assertEqual(labeled_fields(e), [("感恩 1", "謝謝媽媽"), ("感恩 3", "好天氣")])

    def test_ai_generated_fields_are_excluded(self):
        # insight / suggestion 是 BOUBA 產生的，不能因為 AI 的字觸發警示
        e = {
            "practice_type": "process_goal",
            "item_1": "", "item_2": "", "item_3": "",
            "payload": {"event": "讀書很專心", "insight": "你想消失的念頭", "suggestion": "割腕"},
        }
        self.assertEqual(entry_text(e), "讀書很專心")

    def test_unknown_practice_scans_payload_strings(self):
        e = {"practice_type": "workshop_last_day", "item_1": "", "payload": {"farewell": "謝謝大家", "workshop_id": "x", "v": 2}}
        self.assertEqual(labeled_fields(e), [("farewell", "謝謝大家")])

    def test_missing_payload_does_not_crash(self):
        self.assertEqual(labeled_fields({"practice_type": "woop", "payload": None}), [])


class KeywordAndExcerptTests(unittest.TestCase):
    def test_negated_phrase_still_matches(self):
        # 寧可誤報：「沒有想著要割腕」也要送人看
        self.assertEqual(match_keywords("頭很痛但沒有想著要割腕", KEYWORDS), ["割腕"])

    def test_no_match(self):
        self.assertEqual(match_keywords("今天很開心", KEYWORDS), [])

    def test_excerpt_centres_on_match(self):
        text = "甲" * 100 + "想消失" + "乙" * 100
        snip = excerpt(text, ["想消失"], width=40)
        self.assertIn("想消失", snip)
        self.assertTrue(snip.startswith("…") and snip.endswith("…"))

    def test_short_text_returned_whole(self):
        self.assertEqual(excerpt("很短", ["想死"]), "很短")


class CrisisEmailTests(unittest.TestCase):
    def test_email_has_summary_but_only_short_user_id(self):
        uid = "384273f7-aaaa-bbbb-cccc-1234567890ab"
        subject, html_body, text_body = build_crisis_email(
            severity="high", source="keyword", matched_terms=["割腕"], practice_type="gratitude",
            entry_date="2026-08-10", is_shared=True, user_id=uid, snippet="<b>x</b>", admin_url="https://x/admin",
        )
        self.assertIn("高風險", subject)
        self.assertIn("384273f7", subject)
        self.assertNotIn(uid, html_body + text_body)  # 完整 user_id 不放進信
        self.assertIn("&lt;b&gt;", html_body)  # 使用者內容要 escape
        self.assertIn("公開到社群", text_body)
        self.assertIn("https://x/admin", html_body)


def _entry(day: int, text: str = "今天很好") -> dict:
    return {"practice_type": "gratitude", "item_1": text, "item_2": "", "item_3": "", "payload": {},
            "entry_date": f"2026-08-{day:02d}", "created_at": f"2026-08-{day:02d}T00:00:00"}


class PersonaBuilderTests(unittest.TestCase):
    def test_eligible_users_strictly_more_than_threshold(self):
        ids = ["a"] * (MIN_ENTRIES + 1) + ["b"] * MIN_ENTRIES + ["c"] * 60
        self.assertEqual(eligible_users(ids), [("c", 60), ("a", MIN_ENTRIES + 1)])

    def test_format_entries_keeps_most_recent_when_too_long(self):
        entries = [_entry(d, "字" * 50) for d in range(1, 21)]
        text, used = format_entries(entries, max_chars=300)
        self.assertLess(used, 20)
        self.assertIn("08-20", text)
        self.assertNotIn("08-01", text)

    def test_prompt_mentions_rules(self):
        prompt, used = build_prompt([_entry(1), _entry(2)])
        self.assertEqual(used, 2)
        self.assertIn("不做任何心理診斷", prompt)
        self.assertIn("restricted", prompt)

    def test_parse_normalizes_unknown_tags_and_status(self):
        raw = "前言\n" + json.dumps({
            "label": "測試標題",
            "pains": [{"tag": "made_up", "text": "拖很久", "status": "weird", "evidence": ["08-01"], "confidence": 3}],
            "strengths": [{"tag": "resilience", "text": "撐得住", "evidence": [], "confidence": 0.8}],
        }, ensure_ascii=False)
        p = parse_persona(raw)
        self.assertEqual(p["pains"][0]["tag"], "other")
        self.assertEqual(p["pains"][0]["status"], "active")
        self.assertEqual(p["pains"][0]["confidence"], 1.0)
        self.assertEqual(p["strengths"][0]["tag"], "resilience")
        self.assertFalse(p["restricted"])

    def test_restricted_persona_drops_pains_and_hooks(self):
        raw = json.dumps({"label": "需要人工處理", "restricted": True, "restricted_reason": "疑似未成年",
                          "pains": [{"tag": "work_stress", "text": "x", "status": "active"}], "service_hooks": ["推薦 WOOP"]})
        p = parse_persona(raw)
        self.assertTrue(p["restricted"])
        self.assertEqual(p["pains"], [])
        self.assertEqual(p["service_hooks"], [])
        self.assertEqual(p["restricted_reason"], "疑似未成年")

    def test_parse_rejects_non_json(self):
        with self.assertRaises(ValueError):
            parse_persona("抱歉，我無法完成")


class ResponseTextTests(unittest.TestCase):
    def test_skips_thinking_blocks(self):
        # Sonnet 5 的回應開頭可能是 thinking 段落（沒有 .text），直接取 content[0].text 會 AttributeError
        from types import SimpleNamespace as NS
        msg = NS(content=[NS(type="thinking", thinking="想一想", signature="s"), NS(type="text", text='{"label":"x"}')])
        self.assertEqual(response_text(msg), '{"label":"x"}')
        self.assertEqual(parse_persona(response_text(msg))["label"], "x")

    def test_joins_multiple_text_blocks_and_handles_empty(self):
        from types import SimpleNamespace as NS
        self.assertEqual(response_text(NS(content=[NS(type="text", text="a"), NS(type="text", text="b")])), "ab")
        self.assertEqual(response_text(NS(content=[])), "")
        self.assertEqual(response_text(NS(content=None)), "")


if __name__ == "__main__":
    unittest.main()
