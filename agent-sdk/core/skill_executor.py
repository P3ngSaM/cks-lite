"""
Skill 执行器
负责检测用户意图、匹配 Skill、注入上下文、执行脚本
"""

import os
import json
import asyncio
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class SkillExecutor:
    """Skill 执行器"""

    def __init__(self, skills_loader):
        self.skills_loader = skills_loader
        self.skills_dir = skills_loader.skills_dir

    def detect_intent(self, message: str) -> List[str]:
        """
        检测用户消息中的 Skill 意图（插件化：从 skills_loader 动态读取关键词）

        Returns:
            匹配到的 Skill 名称列表
        """
        message_lower = message.lower()
        matched_skills = []

        for skill in self.skills_loader.skills:
            for keyword in skill.trigger_keywords:
                if keyword.lower() in message_lower:
                    matched_skills.append(skill.name)
                    break

        return matched_skills

    def get_skill_context(self, skill_name: str) -> Optional[str]:
        """
        获取 Skill 的上下文（SKILL.md 内容）

        用于注入到系统提示词中
        """
        skill = self.skills_loader.get_skill(skill_name)
        if not skill:
            return None

        skill_md_path = skill.path / "SKILL.md"
        if not skill_md_path.exists():
            return None

        try:
            with open(skill_md_path, "r", encoding="utf-8") as f:
                content = f.read()

            # 移除 frontmatter
            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    content = parts[2].strip()

            return content
        except Exception as e:
            logger.error(f"读取 Skill 上下文失败 ({skill_name}): {e}")
            return None

    def get_combined_skill_context(self, skill_names: List[str]) -> str:
        """
        获取多个 Skills 的组合上下文
        """
        contexts = []

        for name in skill_names:
            context = self.get_skill_context(name)
            if context:
                skill = self.skills_loader.get_skill(name)
                display_name = skill.display_name if skill else name
                contexts.append(f"## {display_name} 技能\n\n{context}")

        if not contexts:
            return ""

        return "# 可用技能参考\n\n以下是与用户请求相关的技能文档，请参考使用：\n\n" + "\n\n---\n\n".join(contexts)

    async def execute_script(
        self,
        skill_name: str,
        script_name: str,
        args: List[str] = None,
        cwd: str = None,
        timeout: int = 60
    ) -> Tuple[bool, str, str]:
        """
        执行 Skill 中的脚本

        Args:
            skill_name: Skill 名称
            script_name: 脚本名称（不含路径）
            args: 脚本参数
            cwd: 工作目录
            timeout: 超时时间（秒）

        Returns:
            (success, stdout, stderr)
        """
        skill = self.skills_loader.get_skill(skill_name)
        if not skill:
            return False, "", f"Skill not found: {skill_name}"

        # 查找脚本
        scripts_dir = skill.path / "scripts"
        script_path = None

        # 支持多种脚本类型
        for ext in [".py", ".js", ".sh", ".bat", ""]:
            candidate = scripts_dir / f"{script_name}{ext}"
            if candidate.exists():
                script_path = candidate
                break

        if not script_path:
            # 也检查 app 目录
            app_dir = skill.path / "app"
            for ext in [".py", ".js", ""]:
                candidate = app_dir / f"{script_name}{ext}"
                if candidate.exists():
                    script_path = candidate
                    break

        if not script_path:
            return False, "", f"Script not found: {script_name} in {skill_name}"

        # 构建命令
        cmd = []
        if script_path.suffix == ".py":
            cmd = ["python", str(script_path)]
        elif script_path.suffix == ".js":
            cmd = ["node", str(script_path)]
        elif script_path.suffix in [".sh", ""]:
            cmd = ["bash", str(script_path)]
        elif script_path.suffix == ".bat":
            cmd = ["cmd", "/c", str(script_path)]
        else:
            cmd = [str(script_path)]

        if args:
            cmd.extend(args)

        # 执行
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd or str(skill.path)
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=timeout
                )

                stdout_str = stdout.decode("utf-8", errors="replace")
                stderr_str = stderr.decode("utf-8", errors="replace")

                success = process.returncode == 0
                return success, stdout_str, stderr_str

            except asyncio.TimeoutError:
                process.kill()
                return False, "", f"Script execution timeout ({timeout}s)"

        except Exception as e:
            logger.error(f"执行脚本失败: {e}", exc_info=True)
            return False, "", str(e)

    def get_tool_definitions(self) -> List[Dict]:
        """
        获取所有工具定义（插件化：从 skills_loader 动态获取 + 内置工具）

        返回可以直接传给 Claude API 的 tools 参数
        """
        # 从 skills_loader 获取所有 Skill 声明的工具
        tools = self.skills_loader.get_tools_for_claude()

        # 内置工具：文档处理
        tools.append({
            "name": "process_document",
            "description": "处理文档文件（Word、PDF、PPT、Excel）。可以执行读取、创建、编辑、转换等操作。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "文档文件路径"
                    },
                    "operation": {
                        "type": "string",
                        "enum": ["read", "create", "edit", "convert", "merge", "split", "extract_text", "extract_tables"],
                        "description": "要执行的操作"
                    },
                    "output_path": {
                        "type": "string",
                        "description": "输出文件路径（可选）"
                    },
                    "options": {
                        "type": "object",
                        "description": "操作选项（可选）"
                    }
                },
                "required": ["file_path", "operation"]
            }
        })

        # 内置工具：视频转文字
        tools.append({
            "name": "video_to_text",
            "description": "从视频中提取音频并转换为文字。支持本地视频文件或抖音/TikTok/B站等平台链接。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "source": {
                        "type": "string",
                        "description": "视频文件路径或URL链接"
                    },
                    "language": {
                        "type": "string",
                        "default": "zh",
                        "description": "音频语言（zh=中文，en=英文）"
                    },
                    "output_format": {
                        "type": "string",
                        "enum": ["txt", "srt", "json"],
                        "default": "txt",
                        "description": "输出格式"
                    }
                },
                "required": ["source"]
            }
        })

        # 内置工具：文件下载
        tools.append({
            "name": "download_file",
            "description": "下载网络文件到本地",
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "文件URL"
                    },
                    "save_path": {
                        "type": "string",
                        "description": "保存路径（可选，默认保存到 downloads 目录）"
                    }
                },
                "required": ["url"]
            }
        })

        # 内置工具：微信公众号发布
        tools.append({
            "name": "wechat_publish",
            "description": "发布文章到微信公众号",
            "input_schema": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "文章标题"
                    },
                    "content": {
                        "type": "string",
                        "description": "文章内容（Markdown 格式）"
                    },
                    "cover_image": {
                        "type": "string",
                        "description": "封面图片路径（可选）"
                    },
                    "draft": {
                        "type": "boolean",
                        "default": True,
                        "description": "是否保存为草稿"
                    }
                },
                "required": ["title", "content"]
            }
        })

        return tools

    async def execute_tool(self, tool_name: str, tool_input: Dict) -> Dict:
        """
        执行工具调用（插件化：优先使用 skills_loader 注册的工具）

        Args:
            tool_name: 工具名称
            tool_input: 工具输入参数

        Returns:
            执行结果
        """
        try:
            # 优先检查 skills_loader 中注册的插件工具
            registered_tool = self.skills_loader.get_tool(tool_name)
            if registered_tool:
                logger.info(f"🔌 使用插件工具: {tool_name}")
                return registered_tool.execute(tool_input)

            # 内置工具
            if tool_name == "process_document":
                return await self._execute_document_tool(tool_input)
            elif tool_name == "video_to_text":
                return await self._execute_video_tool(tool_input)
            elif tool_name == "download_file":
                return await self._execute_download_tool(tool_input)
            elif tool_name == "wechat_publish":
                return await self._execute_wechat_tool(tool_input)
            else:
                return {"success": False, "error": f"Unknown tool: {tool_name}"}
        except Exception as e:
            logger.error(f"工具执行失败: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    async def _execute_document_tool(self, params: Dict) -> Dict:
        """执行文档处理工具"""
        file_path = params.get("file_path", "")
        operation = params.get("operation", "")
        output_path = params.get("output_path")
        options = params.get("options", {})

        # 检测文件类型
        ext = Path(file_path).suffix.lower()
        skill_map = {
            ".docx": "docx",
            ".doc": "docx",
            ".pdf": "pdf",
            ".pptx": "pptx",
            ".ppt": "pptx",
            ".xlsx": "xlsx",
            ".xls": "xlsx"
        }

        skill_name = skill_map.get(ext)
        if not skill_name:
            return {"success": False, "error": f"Unsupported file type: {ext}"}

        # 根据操作类型执行相应脚本
        if operation == "read" or operation == "extract_text":
            if skill_name == "pdf":
                # 使用 pdfplumber 提取文本
                script = f"""
import pdfplumber
with pdfplumber.open("{file_path}") as pdf:
    text = ""
    for page in pdf.pages:
        text += page.extract_text() or ""
        text += "\\n\\n"
    print(text)
"""
                success, stdout, stderr = await self._run_python_code(script)
                return {"success": success, "content": stdout, "error": stderr if not success else None}

            elif skill_name == "docx":
                # 使用 pandoc 转换
                success, stdout, stderr = await self.execute_script(
                    "docx", "pandoc",
                    args=["--track-changes=all", file_path, "-o", "-"]
                )
                if not success:
                    # Fallback: 使用 python-docx
                    script = f"""
from docx import Document
doc = Document("{file_path}")
text = ""
for para in doc.paragraphs:
    text += para.text + "\\n"
print(text)
"""
                    success, stdout, stderr = await self._run_python_code(script)
                return {"success": success, "content": stdout, "error": stderr if not success else None}

        elif operation == "extract_tables" and skill_name == "pdf":
            script = f"""
import pdfplumber
import json
with pdfplumber.open("{file_path}") as pdf:
    all_tables = []
    for i, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        for j, table in enumerate(tables):
            all_tables.append({{"page": i+1, "table": j+1, "data": table}})
    print(json.dumps(all_tables, ensure_ascii=False, indent=2))
"""
            success, stdout, stderr = await self._run_python_code(script)
            return {"success": success, "content": stdout, "error": stderr if not success else None}

        return {"success": False, "error": f"Operation '{operation}' not implemented for {skill_name}"}

    async def _execute_video_tool(self, params: Dict) -> Dict:
        """执行视频转文字工具"""
        source = params.get("source", "")
        language = params.get("language", "zh")
        output_format = params.get("output_format", "txt")

        # 检查 good-TTvideo2text skill
        skill = self.skills_loader.get_skill("good-TTvideo2text")
        if not skill:
            return {"success": False, "error": "Video to text skill not available"}

        # 执行转录脚本
        success, stdout, stderr = await self.execute_script(
            "good-TTvideo2text",
            "transcribe",
            args=[source, "--lang", language, "--format", output_format]
        )

        return {
            "success": success,
            "transcription": stdout if success else None,
            "error": stderr if not success else None
        }

    async def _execute_download_tool(self, params: Dict) -> Dict:
        """执行文件下载工具"""
        url = params.get("url", "")
        save_path = params.get("save_path")

        skill = self.skills_loader.get_skill("gooddowner")
        if not skill:
            # Fallback: 使用 requests
            script = f"""
import requests
from pathlib import Path
url = "{url}"
save_path = "{save_path or 'downloads'}"
response = requests.get(url, stream=True)
response.raise_for_status()
filename = url.split("/")[-1].split("?")[0] or "download"
Path(save_path).mkdir(parents=True, exist_ok=True)
file_path = Path(save_path) / filename
with open(file_path, "wb") as f:
    for chunk in response.iter_content(chunk_size=8192):
        f.write(chunk)
print(f"Downloaded: {{file_path}}")
"""
            success, stdout, stderr = await self._run_python_code(script)
            return {"success": success, "message": stdout, "error": stderr if not success else None}

        # 使用 gooddowner
        args = [url]
        if save_path:
            args.extend(["--output", save_path])

        success, stdout, stderr = await self.execute_script("gooddowner", "main", args)
        return {"success": success, "message": stdout, "error": stderr if not success else None}

    async def _execute_wechat_tool(self, params: Dict) -> Dict:
        """执行微信公众号发布工具"""
        title = params.get("title", "")
        content = params.get("content", "")
        cover_image = params.get("cover_image")
        draft = params.get("draft", True)

        skill = self.skills_loader.get_skill("good-mp-post")
        if not skill:
            return {"success": False, "error": "WeChat publishing skill not available"}

        # 创建临时文件存储内容
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False, encoding="utf-8") as f:
            f.write(content)
            content_file = f.name

        try:
            args = ["--title", title, "--content", content_file]
            if cover_image:
                args.extend(["--cover", cover_image])
            if draft:
                args.append("--draft")

            success, stdout, stderr = await self.execute_script(
                "good-mp-post", "create_draft", args
            )

            return {
                "success": success,
                "message": stdout if success else None,
                "error": stderr if not success else None
            }
        finally:
            os.unlink(content_file)

    async def _run_python_code(self, code: str) -> Tuple[bool, str, str]:
        """运行 Python 代码片段"""
        try:
            process = await asyncio.create_subprocess_exec(
                "python", "-c", code,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=30
            )

            stdout_str = stdout.decode("utf-8", errors="replace")
            stderr_str = stderr.decode("utf-8", errors="replace")

            return process.returncode == 0, stdout_str, stderr_str

        except asyncio.TimeoutError:
            return False, "", "Python execution timeout"
        except Exception as e:
            return False, "", str(e)
