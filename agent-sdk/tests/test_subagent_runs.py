import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.goal_manager import GoalManager


class SubagentRunsTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.manager = GoalManager(Path(self._tmp.name))
        self.org = "org-subagent"
        kpi_id = self.manager.create_kpi("Test KPI", organization_id=self.org)
        okr_id = self.manager.create_okr(kpi_id, "Test OKR")
        project_id = self.manager.create_project(okr_id, "Test Project")
        self.task_id = self.manager.create_task(project_id, "Write weekly report", assignee="Ava")

    def tearDown(self):
        self._tmp.cleanup()

    def test_subagent_run_lifecycle(self):
        run = self.manager.create_subagent_run(
            run_id="run-001",
            task_id=self.task_id,
            organization_id=self.org,
            assignee="Ava",
            objective="完成周报",
            supervisor_name="Boss",
            metadata={"auto_complete": True},
        )
        self.assertIsNotNone(run)
        assert run is not None
        self.assertEqual(run["status"], "queued")

        self.assertTrue(self.manager.append_subagent_run_event("run-001", "execute", "开始执行"))
        running = self.manager.set_subagent_run_status("run-001", "running")
        self.assertIsNotNone(running)
        assert running is not None
        self.assertEqual(running["status"], "running")

        done = self.manager.set_subagent_run_status("run-001", "succeeded", result_text="ok")
        self.assertIsNotNone(done)
        assert done is not None
        self.assertEqual(done["status"], "succeeded")
        self.assertEqual(done["result_text"], "ok")

        rows = self.manager.list_subagent_runs(organization_id=self.org, task_id=self.task_id, limit=10)
        self.assertEqual(len(rows), 1)
        events = self.manager.list_subagent_run_events("run-001", limit=10)
        self.assertIsNotNone(events)
        assert events is not None
        self.assertGreaterEqual(len(events), 2)


if __name__ == "__main__":
    unittest.main()

