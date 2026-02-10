import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.goal_manager import GoalManager


class OnePersonCompanyFlowTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.manager = GoalManager(Path(self._tmp.name))

    def tearDown(self):
        self._tmp.cleanup()

    def test_supervisor_to_employee_execution_closed_loop(self):
        org = "solo-studio"

        kpi_id = self.manager.create_kpi("本周交付率", organization_id=org)
        okr_id = self.manager.create_okr(kpi_id, "上线 Demo 任务闭环")
        project_id = self.manager.create_project(okr_id, "老板演示链路")
        task_dev = self.manager.create_task(project_id, "完成 VCR 脚本", assignee="前端员工")
        task_ops = self.manager.create_task(project_id, "整理发布素材", assignee="运营员工")

        self.assertTrue(
            self.manager.upsert_ai_employee(
                name="前端员工",
                role="前端工程师",
                primary_skill="playwright",
                skill_stack=["playwright", "screenshot"],
                status="active",
                organization_id=org,
            )
        )
        self.assertTrue(
            self.manager.upsert_ai_employee(
                name="运营员工",
                role="运营专员",
                primary_skill="internal-comms",
                skill_stack=["internal-comms"],
                status="paused",
                organization_id=org,
            )
        )

        dispatch = self.manager.run_supervisor_dispatch(
            organization_id=org,
            objective="优先推进演示链路",
            max_assignees=4,
        )
        self.assertEqual(dispatch["total"], 1)
        self.assertEqual(dispatch["skipped_paused"], 1)
        self.assertEqual(dispatch["dispatched"][0]["task_id"], task_dev)

        flow = self.manager.get_execution_state(task_dev)
        self.assertIsNotNone(flow)
        assert flow is not None
        self.assertEqual(flow["status"], "active")
        self.assertIn("优先推进演示链路", flow["note"])

        self.assertTrue(
            self.manager.upsert_task_agent_profile(
                task_id=task_dev,
                organization_id=org,
                assignee="前端员工",
                role="前端工程师",
                preferred_skill="playwright",
                skill_stack=["playwright", "screenshot"],
                skill_strict=True,
                seed_prompt="先产出可验收 UI 结果，再补文档",
            )
        )
        profile = self.manager.get_task_agent_profile(task_dev, org)
        self.assertIsNotNone(profile)
        assert profile is not None
        self.assertTrue(profile["skill_strict"])
        self.assertEqual(profile["skill_stack"], ["playwright", "screenshot"])

        self.assertTrue(self.manager.complete_task(task_dev))
        self.assertTrue(self.manager.review_task(task_dev, "reject", "缺少截图证据", "老板"))

        review = self.manager.run_supervisor_review(organization_id=org, window_days=7)
        rows = {item["assignee"]: item for item in review["items"]}
        self.assertIn("前端员工", rows)
        self.assertEqual(rows["前端员工"]["rejected"], 1)
        self.assertGreaterEqual(review["overall_score"], 0)
        self.assertLessEqual(review["overall_score"], 100)

        self.assertTrue(self.manager.claim_task_handoff(task_dev, "Sam", "我来补验收材料"))
        self.assertTrue(self.manager.review_task(task_dev, "accept", "已补齐证据", "老板"))
        task_row = self.manager.list_tasks(organization_id=org, task_id=task_dev)[0]
        self.assertEqual(task_row["review_status"], "accepted")
        self.assertEqual(task_row["handoff_status"], "resolved")

        # paused employee task remains undispatched until resumed by owner.
        pending_ops = self.manager.list_tasks(organization_id=org, task_id=task_ops)[0]
        self.assertEqual(pending_ops["status"], "todo")
        self.assertEqual(pending_ops["review_status"], "pending")


if __name__ == "__main__":
    unittest.main()
