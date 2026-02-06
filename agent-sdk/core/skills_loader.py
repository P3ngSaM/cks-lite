"""
Skills 加载器
支持插件化架构：Skill 只需放入 skills/ 目录，系统自动注册
"""

import os
import json
import importlib
import sys
from pathlib import Path
from typing import List, Dict, Optional, Any
import logging
import re

logger = logging.getLogger(__name__)


class SkillTool:
    """Skill 声明的工具"""

    def __init__(
        self,
        name: str,
        description: str,
        parameters: Dict,
        entrypoint: str = None,
        method: str = None,
        skill_path: Path = None
    ):
        self.name = name
        self.description = description
        self.parameters = parameters  # JSON Schema
        self.entrypoint = entrypoint  # "app.email_service:EmailService"
        self.method = method          # "execute_send"
        self.skill_path = skill_path

    def to_claude_tool(self) -> Dict:
        """转换为 Claude Tool Use 格式"""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters
        }

    def execute(self, params: Dict) -> Dict:
        """执行工具"""
        if not self.entrypoint or not self.method:
            return {"success": False, "error": f"工具 {self.name} 没有定义执行入口"}

        try:
            # 解析 entrypoint: "app.email_service:EmailService"
            module_path, class_name = self.entrypoint.split(":")

            # 添加 skill 路径到 sys.path
            skill_str = str(self.skill_path)
            if skill_str not in sys.path:
                sys.path.insert(0, skill_str)

            # 动态导入模块和类
            module = importlib.import_module(module_path)
            cls = getattr(module, class_name)

            # 调用方法
            method_fn = getattr(cls, self.method)
            result = method_fn(params)

            # 清理 sys.path
            if skill_str in sys.path:
                sys.path.remove(skill_str)

            return result

        except Exception as e:
            logger.error(f"工具 {self.name} 执行失败: {e}", exc_info=True)
            return {"success": False, "error": str(e)}


class Skill:
    """Skill 数据模型"""

    def __init__(
        self,
        name: str,
        path: Path,
        display_name: str = None,
        description: str = None,
        category: str = None,
        tags: List[str] = None,
        trigger_keywords: List[str] = None,
        has_skill: bool = False,
        has_app: bool = False,
        project_type: str = None,
        env_vars: List[Dict] = None,
        tools: List[SkillTool] = None,
        source: str = "pre-installed",
        source_url: str = None
    ):
        self.name = name
        self.path = path
        self.display_name = display_name or name
        self.description = description or ""
        self.category = category or "未分类"
        self.tags = tags or []
        self.trigger_keywords = trigger_keywords or []
        self.has_skill = has_skill
        self.has_app = has_app
        self.project_type = project_type
        self.env_vars = env_vars or []
        self.tools = tools or []
        self.source = source
        self.source_url = source_url

    @property
    def is_hybrid(self) -> bool:
        return self.has_skill and self.has_app

    @property
    def has_tools(self) -> bool:
        return len(self.tools) > 0

    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "category": self.category,
            "tags": self.tags,
            "trigger_keywords": self.trigger_keywords,
            "has_skill": self.has_skill,
            "has_app": self.has_app,
            "is_hybrid": self.is_hybrid,
            "has_tools": self.has_tools,
            "project_type": self.project_type,
            "env_vars": self.env_vars,
            "tools": [t.name for t in self.tools],
            "source": self.source,
            "source_url": self.source_url,
        }


class SkillsLoader:
    """Skills 加载器 - 插件化架构，支持多目录扫描"""

    def __init__(self, skills_dir: Path = None, additional_dirs: List[Path] = None):
        self.skills_dir = skills_dir or Path(__file__).parent.parent / "skills"
        self.additional_dirs = additional_dirs or []
        self.skills: List[Skill] = []

        # 所有已注册的工具 {tool_name: SkillTool}
        self.registered_tools: Dict[str, SkillTool] = {}

        self._load_skills()

        tool_count = len(self.registered_tools)
        logger.info(f"加载 Skills 完成: {len(self.skills)} 个, 工具: {tool_count} 个")

    def _load_skills(self):
        # 收集所有要扫描的目录
        all_dirs = [self.skills_dir] + self.additional_dirs
        loaded_names = set()

        for scan_dir in all_dirs:
            if not scan_dir.exists():
                logger.warning(f"Skills 目录不存在: {scan_dir}")
                continue

            logger.info(f"扫描 Skills 目录: {scan_dir}")

            for skill_dir in scan_dir.iterdir():
                if not skill_dir.is_dir() or skill_dir.name.startswith("."):
                    continue

                # 跳过 shared 等非 skill 目录
                if skill_dir.name in ("shared", "__pycache__", "node_modules"):
                    continue

                # 避免重复加载同名 skill（优先加载先扫描到的）
                if skill_dir.name in loaded_names:
                    logger.debug(f"跳过重复 Skill: {skill_dir.name} (已从其他目录加载)")
                    continue

                skill = self._load_skill(skill_dir)
                if skill:
                    self.skills.append(skill)
                    loaded_names.add(skill_dir.name)

                    # 注册工具
                    for tool in skill.tools:
                        if tool.name in self.registered_tools:
                            logger.warning(f"工具名冲突: {tool.name}，跳过 {skill.name} 的版本")
                            continue
                        self.registered_tools[tool.name] = tool
                        logger.info(f"  注册工具: {tool.name} (来自 {skill.display_name})")

    def _load_skill(self, skill_dir: Path) -> Optional[Skill]:
        skill_name = skill_dir.name

        has_skill_md = (skill_dir / "SKILL.md").exists()
        has_template_json = (skill_dir / "template.json").exists()

        if not has_skill_md and not has_template_json:
            return None

        # 加载 template.json
        template_config = {}
        if has_template_json:
            try:
                with open(skill_dir / "template.json", "r", encoding="utf-8") as f:
                    template_config = json.load(f)
            except Exception as e:
                logger.error(f"解析 template.json 失败 ({skill_name}): {e}")

        # 加载 SKILL.md
        skill_md_content = ""
        skill_md_frontmatter = {}
        if has_skill_md:
            try:
                with open(skill_dir / "SKILL.md", "r", encoding="utf-8") as f:
                    content = f.read()
                    skill_md_content = content

                    if content.startswith("---"):
                        parts = content.split("---", 2)
                        if len(parts) >= 3:
                            for line in parts[1].split("\n"):
                                if ":" in line:
                                    key, value = line.split(":", 1)
                                    skill_md_frontmatter[key.strip()] = value.strip()
            except Exception as e:
                logger.error(f"解析 SKILL.md 失败 ({skill_name}): {e}")

        # 提取触发关键词：优先从 template.json，其次从 SKILL.md
        trigger_keywords = template_config.get("triggerKeywords", [])

        if not trigger_keywords and skill_md_content:
            keyword_match = re.search(
                r'##\s*触发关键词\s*\n(.*?)(?=##|\Z)',
                skill_md_content,
                re.DOTALL
            )
            if keyword_match:
                keywords_text = keyword_match.group(1)
                trigger_keywords = [
                    k.strip().strip("-").strip('"').strip("'")
                    for k in keywords_text.split("\n")
                    if k.strip() and k.strip().startswith("-")
                ]

        # 解析工具定义
        skill_tools = []
        for tool_def in template_config.get("tools", []):
            tool = SkillTool(
                name=tool_def.get("name", ""),
                description=tool_def.get("description", ""),
                parameters=tool_def.get("parameters", {}),
                entrypoint=tool_def.get("entrypoint"),
                method=tool_def.get("method"),
                skill_path=skill_dir
            )
            if tool.name:
                skill_tools.append(tool)

        skill = Skill(
            name=skill_name,
            path=skill_dir,
            display_name=template_config.get("displayName") or skill_md_frontmatter.get("title") or skill_name,
            description=template_config.get("description") or skill_md_frontmatter.get("description") or "",
            category=template_config.get("category") or skill_md_frontmatter.get("category") or "未分类",
            tags=template_config.get("tags") or [],
            trigger_keywords=trigger_keywords,
            has_skill=has_skill_md,
            has_app=has_template_json,
            project_type=template_config.get("projectType"),
            env_vars=template_config.get("envVars") or [],
            tools=skill_tools
        )

        logger.info(f"加载 Skill: {skill.display_name} (关键词: {len(trigger_keywords)}, 工具: {len(skill_tools)})")
        return skill

    def reload(self):
        """重新加载所有技能（安装/卸载后调用）"""
        self.skills.clear()
        self.registered_tools.clear()
        self._load_skills()
        logger.info(f"Skills 重新加载: {len(self.skills)} 个, 工具: {len(self.registered_tools)} 个")

    def annotate_sources(self, installed_manifest: dict):
        """标注技能来源（预装 vs 用户安装）"""
        for skill in self.skills:
            if skill.name in installed_manifest:
                skill.source = "user-installed"
                skill.source_url = installed_manifest[skill.name].get("github_url")

    def get_skill(self, skill_name: str) -> Optional[Skill]:
        for skill in self.skills:
            if skill.name == skill_name:
                return skill
        return None

    def get_tool(self, tool_name: str) -> Optional[SkillTool]:
        """获取已注册的工具"""
        return self.registered_tools.get(tool_name)

    def get_all_tools(self) -> List[SkillTool]:
        """获取所有已注册工具"""
        return list(self.registered_tools.values())

    def get_tools_for_claude(self) -> List[Dict]:
        """获取所有工具的 Claude Tool Use 格式"""
        return [tool.to_claude_tool() for tool in self.registered_tools.values()]

    def execute_tool(self, tool_name: str, params: Dict) -> Dict:
        """执行指定工具"""
        tool = self.registered_tools.get(tool_name)
        if not tool:
            return {"success": False, "error": f"未找到工具: {tool_name}"}
        return tool.execute(params)

    def search_skills(
        self,
        query: str = None,
        category: str = None,
        has_skill: bool = None,
        has_app: bool = None
    ) -> List[Skill]:
        results = self.skills

        if query:
            query_lower = query.lower()
            results = [
                s for s in results
                if query_lower in s.name.lower()
                or query_lower in s.display_name.lower()
                or query_lower in s.description.lower()
                or any(query_lower in tag.lower() for tag in s.tags)
            ]

        if category:
            results = [s for s in results if s.category == category]
        if has_skill is not None:
            results = [s for s in results if s.has_skill == has_skill]
        if has_app is not None:
            results = [s for s in results if s.has_app == has_app]

        return results

    def get_skill_by_keyword(self, message: str) -> Optional[Skill]:
        message_lower = message.lower()
        for skill in self.skills:
            for keyword in skill.trigger_keywords:
                if keyword.lower() in message_lower:
                    return skill
        return None

    def get_skills_by_category(self) -> Dict[str, List[Skill]]:
        categorized = {}
        for skill in self.skills:
            if skill.category not in categorized:
                categorized[skill.category] = []
            categorized[skill.category].append(skill)
        return categorized

    def get_stats(self) -> Dict:
        return {
            "total": len(self.skills),
            "has_skill": len([s for s in self.skills if s.has_skill]),
            "has_app": len([s for s in self.skills if s.has_app]),
            "hybrid": len([s for s in self.skills if s.is_hybrid]),
            "tools": len(self.registered_tools),
            "categories": len(set(s.category for s in self.skills))
        }
