import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.node_registry import NodeRegistry


class NodeRegistryTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.registry = NodeRegistry(Path(self._tmp.name))

    def tearDown(self):
        self._tmp.cleanup()

    def test_register_and_get_node(self):
        node = self.registry.register(
            node_id="node-win-1",
            organization_id="org-a",
            display_name="Windows Worker",
            host="192.168.0.9",
            os="windows",
            arch="x64",
            capabilities=["desktop", "terminal", "vision"],
            metadata={"version": "0.1.0"},
        )
        self.assertEqual(node["node_id"], "node-win-1")
        self.assertEqual(node["organization_id"], "org-a")
        self.assertIn("desktop", node["capabilities"])
        loaded = self.registry.get("node-win-1")
        self.assertIsNotNone(loaded)
        assert loaded is not None
        self.assertEqual(loaded["display_name"], "Windows Worker")

    def test_list_filter_by_status_and_capability(self):
        self.registry.register(
            node_id="node-a",
            organization_id="org-a",
            status="online",
            capabilities=["desktop", "vision"],
        )
        self.registry.register(
            node_id="node-b",
            organization_id="org-a",
            status="busy",
            capabilities=["terminal"],
        )
        self.registry.register(
            node_id="node-c",
            organization_id="org-b",
            status="online",
            capabilities=["desktop"],
        )

        online_a = self.registry.list(organization_id="org-a", status="online")
        self.assertEqual(len(online_a), 1)
        self.assertEqual(online_a[0]["node_id"], "node-a")

        desktop_a = self.registry.list(organization_id="org-a", capability="desktop")
        self.assertEqual(len(desktop_a), 1)
        self.assertEqual(desktop_a[0]["node_id"], "node-a")

    def test_heartbeat_updates_status_and_metadata(self):
        self.registry.register(
            node_id="node-a",
            organization_id="org-a",
            status="online",
            metadata={"uptime": 1},
        )
        updated = self.registry.heartbeat(
            node_id="node-a",
            status="busy",
            metadata={"uptime": 2, "queue": 3},
        )
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated["status"], "busy")
        self.assertEqual(updated["metadata"].get("uptime"), 2)
        self.assertEqual(updated["metadata"].get("queue"), 3)

    def test_select_best_node_prefers_online_and_capability(self):
        self.registry.register(
            node_id="node-offline",
            organization_id="org-a",
            status="offline",
            os="windows",
            capabilities=["desktop", "vision"],
        )
        self.registry.register(
            node_id="node-online-no-cap",
            organization_id="org-a",
            status="online",
            os="windows",
            capabilities=["terminal"],
        )
        self.registry.register(
            node_id="node-online-cap",
            organization_id="org-a",
            status="online",
            os="windows",
            capabilities=["desktop", "vision"],
        )
        chosen = self.registry.select_best_node(
            organization_id="org-a",
            capability="desktop",
            preferred_os="windows",
        )
        self.assertIsNotNone(chosen)
        assert chosen is not None
        self.assertEqual(chosen["node_id"], "node-online-cap")


if __name__ == "__main__":
    unittest.main()
