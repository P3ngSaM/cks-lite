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

        dep_rows = self.manager.list_tasks(department="研发")
        self.assertEqual(len(dep_rows), 0)

        from_time = done_rows[0]["updated_at"]
        rows_after = self.manager.list_tasks(from_time=from_time)
        self.assertGreaterEqual(len(rows_after), 1)

    def test_list_tasks_filter_by_task_id(self):
        kpi_id = self.manager.create_kpi("k")
        okr_id = self.manager.create_okr(kpi_id, "o")
        project_id = self.manager.create_project(okr_id, "p")
        task_id = self.manager.create_task(project_id, "t")

        rows = self.manager.list_tasks(task_id=task_id)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], task_id)

    def test_review_task_accept_and_reject_update_status_and_progress(self):
        kpi_id = self.manager.create_kpi("k")
        okr_id = self.manager.create_okr(kpi_id, "o")
        project_id = self.manager.create_project(okr_id, "p")
        task_id = self.manager.create_task(project_id, "t")

        self.assertTrue(self.manager.complete_task(task_id))
        self.assertTrue(self.manager.review_task(task_id, "accept", "looks good", "lead"))

        accepted = self.manager.list_tasks(task_id=task_id)[0]
        self.assertEqual(accepted["status"], "done")
        self.assertEqual(float(accepted["progress"]), 100.0)
        self.assertEqual(accepted["review_status"], "accepted")
        self.assertEqual(accepted["review_note"], "looks good")
        self.assertEqual(accepted["reviewed_by"], "lead")
        self.assertTrue(accepted["reviewed_at"])

        self.assertTrue(self.manager.review_task(task_id, "reject", "needs fixes", "lead"))
        rejected = self.manager.list_tasks(task_id=task_id)[0]
        self.assertEqual(rejected["status"], "todo")
        self.assertEqual(float(rejected["progress"]), 0.0)
        self.assertEqual(rejected["review_status"], "rejected")
        self.assertEqual(rejected["review_note"], "needs fixes")

    def test_review_task_invalid_decision_or_missing_task(self):
        self.assertFalse(self.manager.review_task(12345, "accept"))
        kpi_id = self.manager.create_kpi("k")
        okr_id = self.manager.create_okr(kpi_id, "o")
        project_id = self.manager.create_project(okr_id, "p")
        task_id = self.manager.create_task(project_id, "t")
        self.assertFalse(self.manager.review_task(task_id, "hold"))

    def test_list_tasks_filter_by_review_status(self):
        kpi_id = self.manager.create_kpi("k")
        okr_id = self.manager.create_okr(kpi_id, "o")
        project_id = self.manager.create_project(okr_id, "p")
        t1 = self.manager.create_task(project_id, "t1")
        t2 = self.manager.create_task(project_id, "t2")
        self.manager.complete_task(t1)
        self.manager.complete_task(t2)
        self.manager.review_task(t1, "accept", "ok", "lead")
        self.manager.review_task(t2, "reject", "redo", "lead")

        accepted = self.manager.list_tasks(review_status="accepted")
        rejected = self.manager.list_tasks(review_status="rejected")
        pending = self.manager.list_tasks(review_status="pending")

        self.assertEqual(len(accepted), 1)
        self.assertEqual(accepted[0]["id"], t1)
        self.assertEqual(len(rejected), 1)
        self.assertEqual(rejected[0]["id"], t2)
        self.assertEqual(len(pending), 0)

    def test_execution_phase_update_and_readback(self):
        kpi_id = self.manager.create_kpi("k")
        okr_id = self.manager.create_okr(kpi_id, "o")
        project_id = self.manager.create_project(okr_id, "p")
        task_id = self.manager.create_task(project_id, "t")

        updated = self.manager.update_execution_phase(
            task_id=task_id,
            phase="do",
            status="active",
            note="running tools",
            prompt="execute first step",
        )
        self.assertIsNotNone(updated)
        self.assertEqual(updated["phase"], "do")
        self.assertEqual(updated["status"], "active")

        state = self.manager.get_execution_state(task_id)
        self.assertIsNotNone(state)
        self.assertEqual(state["phase"], "do")
        self.assertEqual(state["note"], "running tools")
        self.assertEqual(state["last_prompt"], "execute first step")

    def test_resume_execution_increments_count_and_generates_prompt(self):
        kpi_id = self.manager.create_kpi("k")
        okr_id = self.manager.create_okr(kpi_id, "o")
        project_id = self.manager.create_project(okr_id, "p")
        task_id = self.manager.create_task(project_id, "task-title")
        self.manager.update_execution_phase(task_id=task_id, phase="verify", status="blocked", note="need check")

        resumed = self.manager.resume_execution(task_id, "resume now")
        self.assertIsNotNone(resumed)
        self.assertEqual(resumed["phase"], "verify")
        self.assertGreaterEqual(int(resumed["resumed_count"]), 1)
        self.assertIn("resume_prompt", resumed)
        self.assertIn("任务", resumed["resume_prompt"])

    def test_execution_phase_invalid_input_returns_none(self):
        kpi_id = self.manager.create_kpi("k")
        okr_id = self.manager.create_okr(kpi_id, "o")
        project_id = self.manager.create_project(okr_id, "p")
        task_id = self.manager.create_task(project_id, "t")

        self.assertIsNone(self.manager.update_execution_phase(task_id, phase="unknown", status="active"))
        self.assertIsNone(self.manager.update_execution_phase(task_id, phase="plan", status="bad"))
        self.assertIsNone(self.manager.update_execution_phase(99999, phase="plan", status="active"))
        self.assertIsNone(self.manager.resume_execution(99999, "x"))

    def test_dashboard_data_summary_and_owner_rows(self):
        kpi_id = self.manager.create_kpi("k")
        okr_id = self.manager.create_okr(kpi_id, "o")
        project_id = self.manager.create_project(okr_id, "p")
        t1 = self.manager.create_task(project_id, "t1", assignee="alice")
        t2 = self.manager.create_task(project_id, "t2", assignee="alice")
        t3 = self.manager.create_task(project_id, "t3", assignee="bob")
        self.manager.complete_task(t1)
        self.manager.review_task(t1, "accept", "ok", "lead")
        self.manager.complete_task(t2)  # pending_review
        self.manager.complete_task(t3)
        self.manager.review_task(t3, "reject", "redo", "lead")

        dashboard = self.manager.get_dashboard_data()
        summary = dashboard["summary"]
        self.assertEqual(summary["total_tasks"], 3)
        self.assertEqual(summary["accepted"], 1)
        self.assertEqual(summary["pending_review"], 1)
        self.assertEqual(summary["rejected"], 1)
        self.assertEqual(summary["in_progress"], 1)  # rejected task returns to todo

        owners = {row["assignee"]: row for row in dashboard["owners"]}
        self.assertIn("alice", owners)
        self.assertIn("bob", owners)
        self.assertEqual(owners["alice"]["accepted"], 1)
        self.assertEqual(owners["alice"]["pending_review"], 1)
        self.assertEqual(owners["bob"]["rejected"], 1)
        self.assertIn("p", owners["alice"]["project_titles"])
        self.assertIn("k", owners["alice"]["kpi_titles"])
        self.assertIn("o", owners["alice"]["okr_titles"])
        self.assertTrue(owners["alice"]["next_task_id"] in {t1, t2})

    def test_set_assignee_next_task_override(self):
        kpi_id = self.manager.create_kpi("k")
        okr_id = self.manager.create_okr(kpi_id, "o")
        project_id = self.manager.create_project(okr_id, "p")
        t1 = self.manager.create_task(project_id, "t1", assignee="alice")
        t2 = self.manager.create_task(project_id, "t2", assignee="alice")
        self.manager.complete_task(t1)
        self.manager.complete_task(t2)

        self.assertTrue(self.manager.set_assignee_next_task("alice", t1))
        dashboard = self.manager.get_dashboard_data()
        owners = {row["assignee"]: row for row in dashboard["owners"]}
        self.assertEqual(owners["alice"]["next_task_id"], t1)

        self.assertTrue(self.manager.set_assignee_next_task("alice", t2))
        dashboard2 = self.manager.get_dashboard_data()
        owners2 = {row["assignee"]: row for row in dashboard2["owners"]}
        self.assertEqual(owners2["alice"]["next_task_id"], t2)

        self.assertFalse(self.manager.set_assignee_next_task("bob", t1))

    def test_dashboard_isolated_by_organization(self):
        kpi_a = self.manager.create_kpi("k-a", organization_id="org-a")
        okr_a = self.manager.create_okr(kpi_a, "o-a")
        project_a = self.manager.create_project(okr_a, "p-a")
        self.manager.create_task(project_a, "task-a1", assignee="alpha", department="研发")

        kpi_b = self.manager.create_kpi("k-b", organization_id="org-b")
        okr_b = self.manager.create_okr(kpi_b, "o-b")
        project_b = self.manager.create_project(okr_b, "p-b")
        self.manager.create_task(project_b, "task-b1", assignee="bravo")

        dashboard_a = self.manager.get_dashboard_data(organization_id="org-a")
        owners_a = {row["assignee"]: row for row in dashboard_a["owners"]}
        self.assertEqual(dashboard_a["summary"]["total_tasks"], 1)
        self.assertIn("alpha", owners_a)
        self.assertEqual(owners_a["alpha"]["department"], "研发")
        self.assertNotIn("bravo", owners_a)

        dashboard_b = self.manager.get_dashboard_data(organization_id="org-b")
        owners_b = {row["assignee"]: row for row in dashboard_b["owners"]}
        self.assertEqual(dashboard_b["summary"]["total_tasks"], 1)
        self.assertIn("bravo", owners_b)
        self.assertNotIn("alpha", owners_b)

    def test_list_tasks_filter_by_department(self):
        kpi_id = self.manager.create_kpi("k", organization_id="org-a")
        okr_id = self.manager.create_okr(kpi_id, "o")
        project_id = self.manager.create_project(okr_id, "p")
        self.manager.create_task(project_id, "t1", assignee="alice", department="研发")
        self.manager.create_task(project_id, "t2", assignee="bob", department="运营")

        rd = self.manager.list_tasks(organization_id="org-a", department="研发")
        self.assertEqual(len(rd), 1)
        self.assertEqual(rd[0]["assignee"], "alice")

        ops = self.manager.list_tasks(organization_id="org-a", department="运营")
        self.assertEqual(len(ops), 1)
        self.assertEqual(ops[0]["assignee"], "bob")


    def test_claim_handoff_and_filter(self):
        kpi_id = self.manager.create_kpi("k")
        okr_id = self.manager.create_okr(kpi_id, "o")
        project_id = self.manager.create_project(okr_id, "p")
        task_id = self.manager.create_task(project_id, "t1", assignee="alice")
        self.manager.complete_task(task_id)
        self.manager.review_task(task_id, "reject", "need rework", "lead")

        self.assertFalse(self.manager.claim_task_handoff(task_id, ""))
        self.assertTrue(self.manager.claim_task_handoff(task_id, "manager", "take over now"))

        claimed_rows = self.manager.list_tasks(handoff_status="claimed")
        self.assertEqual(len(claimed_rows), 1)
        self.assertEqual(claimed_rows[0]["id"], task_id)
        self.assertEqual(claimed_rows[0]["handoff_owner"], "manager")
        self.assertEqual(claimed_rows[0]["handoff_note"], "take over now")

        self.assertTrue(self.manager.review_task(task_id, "accept", "fixed", "lead"))
        accepted = self.manager.list_tasks(task_id=task_id)[0]
        self.assertEqual(accepted["handoff_status"], "resolved")
        self.assertTrue(accepted["handoff_resolved_at"])


if __name__ == "__main__":
    unittest.main()
