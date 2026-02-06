import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.agent import update_repetition_state


class RepetitionGuardTests(unittest.TestCase):
    def test_update_repetition_state_increments_when_same_signature(self):
        last, count = update_repetition_state("a", 1, "a")
        self.assertEqual(last, "a")
        self.assertEqual(count, 2)

    def test_update_repetition_state_resets_when_signature_changes(self):
        last, count = update_repetition_state("a", 3, "b")
        self.assertEqual(last, "b")
        self.assertEqual(count, 1)


if __name__ == "__main__":
    unittest.main()
