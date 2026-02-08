import asyncio
import json
import tempfile
import textwrap
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.agent import ClaudeAgent
from core.memory import MemoryManager
from core.skill_installer import SkillInstaller
from core.skills_loader import SkillsLoader


class SkillsWorkbenchFlowTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp_dir = Path(self._tmp.name)
        data_dir = self.tmp_dir / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        self.memory_manager = MemoryManager(data_dir)

        default_skills_dir = Path(__file__).resolve().parents[1] / "skills"
        self.dynamic_skills_dir = self.tmp_dir / "dynamic_skills"
        self.dynamic_skills_dir.mkdir(parents=True, exist_ok=True)

        self._create_mock_skill(self.dynamic_skills_dir / "mock-workbench-skill")

        self.skills_loader = SkillsLoader(
            skills_dir=default_skills_dir,
            additional_dirs=[self.dynamic_skills_dir],
        )
        self.skill_installer = SkillInstaller(skills_dir=self.skills_loader.skills_dir)
        self.agent = ClaudeAgent(
            api_key="test-key",
            memory_manager=self.memory_manager,
            skills_loader=self.skills_loader,
            skill_installer=self.skill_installer,
        )

    def tearDown(self):
        self._tmp.cleanup()

    def _create_mock_skill(self, skill_dir: Path) -> None:
        (skill_dir / "app").mkdir(parents=True, exist_ok=True)
        (skill_dir / "mock_app").mkdir(parents=True, exist_ok=True)
        (skill_dir / "SKILL.md").write_text("# Mock Workbench Skill\n", encoding="utf-8")
        (skill_dir / "app" / "__init__.py").write_text("", encoding="utf-8")
        (skill_dir / "mock_app" / "__init__.py").write_text("", encoding="utf-8")
        (skill_dir / "app" / "main.py").write_text(
            textwrap.dedent(
                """
                class MockWorkbenchSkill:
                    @staticmethod
                    def run(params):
                        return {"success": True, "message": "mock skill executed", "data": params}
                """
            ).strip()
            + "\n",
            encoding="utf-8",
        )
        (skill_dir / "mock_app" / "main.py").write_text(
            textwrap.dedent(
                """
                class MockWorkbenchSkill:
                    @staticmethod
                    def run(params):
                        return {"success": True, "message": "mock skill executed", "data": params}
                """
            ).strip()
            + "\n",
            encoding="utf-8",
        )
        (skill_dir / "template.json").write_text(
            json.dumps(
                {
                    "name": "mock-workbench-skill",
                    "displayName": "Mock Workbench Skill",
                    "description": "Mock skill for workbench smoke testing.",
                    "category": "productivity",
                    "triggerKeywords": ["mock", "workbench"],
                    "tools": [
                        {
                            "name": "mock_workbench_run",
                            "description": "Execute mock skill",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "task": {"type": "string"},
                                },
                                "required": ["task"],
                            },
                            "entrypoint": "mock_app.main:MockWorkbenchSkill",
                            "method": "run",
                        }
                    ],
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    def test_skills_loaded_for_workbench(self):
        names = {skill.name for skill in self.skills_loader.skills}
        self.assertIn("demo-office-assistant", names)
        self.assertIn("mock-workbench-skill", names)
        self.assertIn("mock_workbench_run", self.skills_loader.registered_tools)

    def test_demo_office_skill_tools_execute_successfully(self):
        source_dir = self.tmp_dir / "workspace"
        source_dir.mkdir(parents=True, exist_ok=True)
        (source_dir / "notes.txt").write_text("AI workbench demo checklist", encoding="utf-8")
        (source_dir / "todo.md").write_text("# TODO\n- Prepare demo", encoding="utf-8")
        (source_dir / "image.png").write_bytes(b"\x89PNG\r\n\x1a\n")

        result_ppt = asyncio.run(
            self.agent._execute_tool(
                "u1",
                "demo_prepare_ppt_and_email",
                {
                    "topic": "AI Workbench",
                    "audience": "Founders",
                    "recipient": "demo@example.com",
                    "output_dir": str(self.tmp_dir),
                },
            )
        )
        self.assertTrue(result_ppt.get("success"))
        self.assertTrue(Path(result_ppt["data"]["ppt_outline"]).exists())
        self.assertTrue(Path(result_ppt["data"]["email_draft"]).exists())

        result_organize = asyncio.run(
            self.agent._execute_tool(
                "u1",
                "demo_organize_files",
                {
                    "source_dir": str(source_dir),
                    "dry_run": True,
                    "output_report": str(self.tmp_dir / "organize_report.json"),
                },
            )
        )
        self.assertTrue(result_organize.get("success"))
        self.assertTrue(Path(result_organize["data"]["report"]).exists())

        result_summary = asyncio.run(
            self.agent._execute_tool(
                "u1",
                "demo_summarize_folder",
                {
                    "source_dir": str(source_dir),
                    "output_file": str(self.tmp_dir / "summary.md"),
                },
            )
        )
        self.assertTrue(result_summary.get("success"))
        self.assertTrue(Path(result_summary["data"]["output_file"]).exists())

    def test_newly_added_skill_can_be_executed(self):
        result = asyncio.run(
            self.agent._execute_tool(
                "u1",
                "mock_workbench_run",
                {"task": "smoke-check"},
            )
        )
        self.assertTrue(result.get("success"))
        self.assertEqual(result.get("message"), "mock skill executed")
        self.assertEqual(result.get("data", {}).get("task"), "smoke-check")


if __name__ == "__main__":
    unittest.main()
