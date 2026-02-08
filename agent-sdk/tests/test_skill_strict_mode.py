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


class SkillStrictModeTest(unittest.TestCase):
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
        (skill_dir / "mock_app").mkdir(parents=True, exist_ok=True)
        (skill_dir / "mock_app" / "__init__.py").write_text("", encoding="utf-8")
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
        (skill_dir / "SKILL.md").write_text("# Mock Workbench Skill\n", encoding="utf-8")
        (skill_dir / "template.json").write_text(
            json.dumps(
                {
                    "name": "mock-workbench-skill",
                    "displayName": "Mock Workbench Skill",
                    "description": "Mock skill for strict mode tests.",
                    "category": "productivity",
                    "triggerKeywords": ["mock", "strict"],
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

    def test_strict_unknown_skill_returns_policy_error_in_stream(self):
        async def _collect():
            chunks = []
            async for chunk in self.agent.chat_stream(
                user_id="u1",
                message="帮我做个演示",
                session_id="s1",
                use_memory=False,
                preferred_skill="not-installed-skill",
                skill_strict=True,
            ):
                chunks.append(json.loads(chunk))
            return chunks

        chunks = asyncio.run(_collect())
        self.assertGreaterEqual(len(chunks), 3)
        self.assertEqual(chunks[1]["type"], "skill_policy")
        self.assertFalse(chunks[1]["success"])
        self.assertIn("未找到你指定的技能", chunks[1]["message"])
        self.assertEqual(chunks[-1]["type"], "done")

    def test_strict_force_only_keeps_preferred_skill_only(self):
        # Simulate that intent matcher also returns another skill;
        # strict mode should still keep only preferred one.
        self.agent.skill_executor.detect_intent = lambda _message: [
            "demo-office-assistant",
            "mock-workbench-skill",
        ]
        matched = self.agent._resolve_matched_skills(
            message="请帮我处理任务",
            preferred_skill="Mock Workbench Skill",
            force_only=True,
        )
        self.assertEqual(matched, ["mock-workbench-skill"])


if __name__ == "__main__":
    unittest.main()
