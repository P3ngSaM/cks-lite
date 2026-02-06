import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.goal_manager import GoalManager


class GoalManagerTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.manager = GoalManager(Path(self._tmp.name))

    def tearDown(self):
        self._tmp.cleanup()

    def test_progress_rollup_after_task_completion(self):
        kpi_id = self.manager.create_kpi("k1")
        okr_id = self.manager.create_okr(kpi_id, "o1")
        project_id = self.manager.create_project(okr_id, "p1")
        t1 = self.manager.create_task(project_id, "t1")
        self.manager.create_task(project_id, "t2")

        tree_before = self.manager.get_tree()
        kpi_before = next(k for k in tree_before["kpis"] if k["id"] == kpi_id)
        self.assertAlmostEqual(float(kpi_before["progress"]), 0.0)

        self.assertTrue(self.manager.complete_task(t1))

        tree_after = self.manager.get_tree()
        kpi_after = next(k for k in tree_after["kpis"] if k["id"] == kpi_id)
        self.assertAlmostEqual(float(kpi_after["progress"]), 50.0)

    def test_complete_unknown_task_returns_false(self):
        self.assertFalse(self.manager.complete_task(9999))

    def test_list_tasks_filter_by_assignee_status_and_time(self):
        kpi_id = self.manager.create_kpi("k")
        okr_id = self.manager.create_okr(kpi_id, "o")
        project_id = self.manager.create_project(okr_id, "p")
        todo_id = self.manager.create_task(project_id, "todo", assignee="alice")
        done_id = self.manager.create_task(project_id, "done", assignee="bob")
        self.manager.complete_task(done_id)

        todo_rows = self.manager.list_tasks(assignee="alice", status="todo")
        self.assertEqual(len(todo_rows), 1)
        self.assertEqual(todo_rows[0]["id"], todo_id)

        done_rows = self.manager.list_tasks(assignee="bob", status="done")
        self.assertEqual(len(done_rows), 1)
        self.assertEqual(done_rows[0]["id"], done_id)

        from_time = done_rows[0]["updated_at"]
        rows_after = self.manager.list_tasks(from_time=from_time)
        self.assertGreaterEqual(len(rows_after), 1)


if __name__ == "__main__":
    unittest.main()
