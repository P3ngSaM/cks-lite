import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.channel_task_queue import ChannelTaskQueue
from core.execution_approval import ExecutionApprovalStore


class ChannelAndApprovalStoreTest(unittest.TestCase):
    def test_approval_create_list_decide(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = ExecutionApprovalStore(Path(tmp))
            created = store.create_request(
                source="workbench",
                tool_name="run_command",
                risk_level="high",
                organization_id="org-a",
                payload={"command": "dir", "session_id": "sess-1"},
                ttl_seconds=300,
            )
            self.assertEqual(created["status"], "pending")
            self.assertEqual(created["tool_name"], "run_command")
            self.assertEqual(created["organization_id"], "org-a")

            pending = store.list_requests(status="pending", limit=10)
            self.assertGreaterEqual(len(pending), 1)
            pending_org_a = store.list_requests(status="pending", limit=10, organization_id="org-a")
            pending_org_b = store.list_requests(status="pending", limit=10, organization_id="org-b")
            self.assertGreaterEqual(len(pending_org_a), 1)
            self.assertEqual(len(pending_org_b), 0)
            pending_sess_1 = store.list_requests(status="pending", limit=10, session_id="sess-1")
            pending_sess_2 = store.list_requests(status="pending", limit=10, session_id="sess-2")
            self.assertGreaterEqual(len(pending_sess_1), 1)
            self.assertEqual(len(pending_sess_2), 0)

            decided = store.decide_request(created["id"], "approved", decided_by="manager", note="ok")
            self.assertEqual(decided["status"], "approved")
            self.assertEqual(decided["decided_by"], "manager")

    def test_channel_queue_enqueue_dispatch_status(self):
        with tempfile.TemporaryDirectory() as tmp:
            queue = ChannelTaskQueue(Path(tmp))
            task = queue.enqueue(
                channel="feishu",
                sender_id="ou_xxx",
                chat_id="oc_xxx",
                message="帮我整理今天任务",
                metadata={"tenant": "demo"},
            )
            self.assertEqual(task["status"], "pending")
            self.assertEqual(task["channel"], "feishu")

            running = queue.mark_status(task["id"], "running", result={"step": "dispatch"})
            self.assertEqual(running["status"], "running")

            done = queue.mark_status(task["id"], "completed", result={"reply": "已完成"})
            self.assertEqual(done["status"], "completed")
            self.assertEqual(done["result"].get("reply"), "已完成")

            rows = queue.list(channel="feishu", limit=20)
            self.assertGreaterEqual(len(rows), 1)


if __name__ == "__main__":
    unittest.main()
