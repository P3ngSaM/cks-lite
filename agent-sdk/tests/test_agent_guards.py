import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.agent import make_tool_signature, update_repetition_state, is_transient_tool_error


class AgentGuardUtilsTest(unittest.TestCase):
    def test_make_tool_signature_is_stable_for_dict_order(self):
        sig_a = make_tool_signature("web_search", {"query": "ai", "num_results": 5})
        sig_b = make_tool_signature("web_search", {"num_results": 5, "query": "ai"})
        self.assertEqual(sig_a, sig_b)

    def test_update_repetition_state_increments_on_same_signature(self):
        last, count = update_repetition_state(None, 0, "web_search:{\"q\":\"a\"}")
        self.assertEqual(last, "web_search:{\"q\":\"a\"}")
        self.assertEqual(count, 1)

        last, count = update_repetition_state(last, count, "web_search:{\"q\":\"a\"}")
        self.assertEqual(last, "web_search:{\"q\":\"a\"}")
        self.assertEqual(count, 2)

        last, count = update_repetition_state(last, count, "web_search:{\"q\":\"b\"}")
        self.assertEqual(last, "web_search:{\"q\":\"b\"}")
        self.assertEqual(count, 1)

    def test_is_transient_tool_error(self):
        self.assertTrue(is_transient_tool_error({"success": False, "error": "network timeout"}))
        self.assertTrue(is_transient_tool_error({"success": False, "message": "HTTP 503 service unavailable"}))
        self.assertFalse(is_transient_tool_error({"success": False, "error": "file not found"}))
        self.assertFalse(is_transient_tool_error({"success": True, "message": "ok"}))


if __name__ == "__main__":
    unittest.main()
