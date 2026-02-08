import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.markdown_memory import MarkdownMemory


class MarkdownMemoryTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.workspace = Path(self._tmp.name)
        self.mm = MarkdownMemory(self.workspace)

    def tearDown(self):
        self._tmp.cleanup()

    def test_compress_logs_moves_only_old_daily_logs(self):
        old_date = (datetime.now() - timedelta(days=40)).strftime("%Y-%m-%d")
        recent_date = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
        old_file = self.mm.daily_dir / f"{old_date}.md"
        recent_file = self.mm.daily_dir / f"{recent_date}.md"
        old_file.write_text("old", encoding="utf-8")
        recent_file.write_text("recent", encoding="utf-8")

        moved = self.mm.compress_logs(days=30)

        self.assertEqual(len(moved), 1)
        self.assertFalse(old_file.exists())
        self.assertTrue(recent_file.exists())
        archived_path = Path(moved[0]["to"])
        self.assertTrue(archived_path.exists())
        self.assertIn(str(self.mm.archive_dir), str(archived_path))

    def test_compress_logs_writes_archive_index(self):
        old_date = (datetime.now() - timedelta(days=31)).strftime("%Y-%m-%d")
        (self.mm.daily_dir / f"{old_date}.md").write_text("old", encoding="utf-8")

        moved = self.mm.compress_logs(days=30)

        self.assertEqual(len(moved), 1)
        index_file = self.mm.archive_dir / "index.jsonl"
        self.assertTrue(index_file.exists())
        content = index_file.read_text(encoding="utf-8").strip().splitlines()
        self.assertGreaterEqual(len(content), 1)
        self.assertIn(old_date, content[-1])


if __name__ == "__main__":
    unittest.main()

