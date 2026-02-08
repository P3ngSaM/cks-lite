import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import core.memory as memory_module
from core.memory import MemoryManager


class MemoryManagerTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        # Avoid loading heavy optional dependencies in unit tests.
        memory_module.EMBEDDING_AVAILABLE = False
        memory_module.HYBRID_SEARCH_AVAILABLE = False
        memory_module.MARKDOWN_MEMORY_AVAILABLE = False
        self.manager = MemoryManager(Path(self._tmp.name))

    def tearDown(self):
        self._tmp.cleanup()

    def test_save_memory_deduplicates_exact_content(self):
        memory_id_1 = asyncio.run(
            self.manager.save_memory(
                user_id="u1",
                content="Alice email is alice@example.com",
                memory_type="user_info",
            )
        )
        memory_id_2 = asyncio.run(
            self.manager.save_memory(
                user_id="u1",
                content="  alice email is ALICE@example.com  ",
                memory_type="user_info",
                metadata={"source": "manual"},
            )
        )

        self.assertEqual(memory_id_1, memory_id_2)

        rows = asyncio.run(self.manager.list_memories("u1", memory_type="user_info"))
        self.assertEqual(len(rows), 1)

        conn = self.manager._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT access_count, metadata FROM semantic_memories WHERE id = ?", (memory_id_1,))
        row = cursor.fetchone()
        conn.close()

        self.assertEqual(row["access_count"], 0)
        self.assertIn("manual", row["metadata"])

    def test_search_rerank_prefers_high_importance(self):
        asyncio.run(
            self.manager.save_memory(
                user_id="u2",
                content="project alpha deadline is tomorrow",
                memory_type="project",
                metadata={"importance": 2},
            )
        )
        asyncio.run(
            self.manager.save_memory(
                user_id="u2",
                content="project alpha deadline must be delivered to CEO",
                memory_type="project",
                metadata={"importance": 10},
            )
        )

        results = asyncio.run(
            self.manager.search_memories(
                user_id="u2",
                query="project alpha deadline",
                top_k=2,
                use_hybrid=False,
            )
        )

        self.assertGreaterEqual(len(results), 2)
        self.assertEqual(results[0]["importance"], 10)

    def test_save_memory_deduplicates_near_text(self):
        os.environ["MEMORY_DUPLICATE_THRESHOLD"] = "0.9"
        try:
            memory_id_1 = asyncio.run(
                self.manager.save_memory(
                    user_id="u3",
                    content="Project Alpha deadline is 2026-02-20.",
                    memory_type="project",
                )
            )
            memory_id_2 = asyncio.run(
                self.manager.save_memory(
                    user_id="u3",
                    content="Project alpha deadline is 2026/02/20!",
                    memory_type="project",
                )
            )
        finally:
            del os.environ["MEMORY_DUPLICATE_THRESHOLD"]

        self.assertEqual(memory_id_1, memory_id_2)

    def test_save_memory_adds_freshness_metadata(self):
        memory_id = asyncio.run(
            self.manager.save_memory(
                user_id="u4",
                content="Roadmap draft should be reviewed",
                memory_type="project",
            )
        )

        conn = self.manager._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT metadata FROM semantic_memories WHERE id = ?", (memory_id,))
        row = cursor.fetchone()
        conn.close()

        metadata = json.loads(row["metadata"])
        freshness = metadata.get("freshness")
        self.assertIsInstance(freshness, dict)
        self.assertIn("ttl_days", freshness)
        self.assertIn("expires_at", freshness)

    def test_conflicting_facts_mark_pending_review(self):
        first_id = asyncio.run(
            self.manager.save_memory(
                user_id="u5",
                content="Alice email is alice@oldmail.com",
                memory_type="user_info",
            )
        )
        second_id = asyncio.run(
            self.manager.save_memory(
                user_id="u5",
                content="Alice email is alice@newmail.com",
                memory_type="user_info",
            )
        )

        self.assertNotEqual(first_id, second_id)
        rows = asyncio.run(self.manager.list_memories("u5", memory_type="user_info"))
        by_id = {row["id"]: row for row in rows}
        self.assertEqual(by_id[first_id]["conflict_status"], "pending_review")
        self.assertEqual(by_id[second_id]["conflict_status"], "pending_review")

    def test_compact_memories_dedupes_and_prunes_stale_noise(self):
        os.environ["MEMORY_DUPLICATE_THRESHOLD"] = "0.9"
        try:
            asyncio.run(
                self.manager.save_memory(
                    user_id="u6",
                    content="Project beta note: daily standup at 9am",
                    memory_type="conversation",
                    metadata={"importance": 3},
                )
            )
            asyncio.run(
                self.manager.save_memory(
                    user_id="u6",
                    content="Project beta note daily standup @ 9am",
                    memory_type="conversation",
                    metadata={"importance": 3},
                )
            )
        finally:
            del os.environ["MEMORY_DUPLICATE_THRESHOLD"]

        conn = self.manager._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE semantic_memories
            SET created_at = ?, metadata = ?, importance = 2, access_count = 0
            WHERE user_id = ?
            """,
            (
                "2020-01-01T00:00:00",
                json.dumps({"freshness": {"ttl_days": 30, "expires_at": "2020-02-01T00:00:00"}}),
                "u6",
            ),
        )
        conn.commit()
        conn.close()

        result = asyncio.run(self.manager.compact_memories(user_id="u6", stale_days=30))
        self.assertGreaterEqual(result["pruned_stale"], 1)

    def test_resolve_conflict_marks_linked_memories(self):
        first_id = asyncio.run(
            self.manager.save_memory(
                user_id="u7",
                content="Bob phone is 123-456-7890",
                memory_type="user_info",
            )
        )
        second_id = asyncio.run(
            self.manager.save_memory(
                user_id="u7",
                content="Bob phone is 987-654-3210",
                memory_type="user_info",
            )
        )

        result = asyncio.run(self.manager.resolve_conflict(second_id, action="accept_current"))
        self.assertGreaterEqual(result["updated"], 2)

        rows = asyncio.run(self.manager.list_memories("u7", memory_type="user_info"))
        by_id = {row["id"]: row for row in rows}
        self.assertEqual(by_id[second_id]["conflict_status"], "resolved")
        self.assertEqual(by_id[first_id]["conflict_status"], "superseded")

    def test_get_maintenance_report_contains_risk_counts(self):
        asyncio.run(
            self.manager.save_memory(
                user_id="u8",
                content="Carol email is carol@oldmail.com",
                memory_type="user_info",
            )
        )
        asyncio.run(
            self.manager.save_memory(
                user_id="u8",
                content="Carol email is carol@newmail.com",
                memory_type="user_info",
            )
        )

        report = asyncio.run(self.manager.get_maintenance_report(user_id="u8"))
        self.assertIn("pending_conflicts", report)
        self.assertGreaterEqual(report["pending_conflicts"], 2)
        self.assertIn("dedupe_candidates", report)

    def test_run_scheduled_maintenance_skips_if_not_due(self):
        asyncio.run(
            self.manager.save_memory(
                user_id="u9",
                content="quick note",
                memory_type="manual",
            )
        )

        first = asyncio.run(self.manager.run_scheduled_maintenance(user_id="u9", interval_hours=24))
        self.assertTrue(first["ran"])
        second = asyncio.run(self.manager.run_scheduled_maintenance(user_id="u9", interval_hours=24))
        self.assertFalse(second["ran"])


if __name__ == "__main__":
    unittest.main()
