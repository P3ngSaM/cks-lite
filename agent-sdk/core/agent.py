"""
Claude Agent 核心
基于 Claude Agent SDK 实现的智能代理
"""

import os
import json
import asyncio
from uuid import uuid4
from typing import List, Dict, Optional, AsyncGenerator
import logging
from anthropic import Anthropic, AsyncAnthropic
from anthropic.types import Message, MessageStreamEvent

from core.memory import MemoryManager
from core.skills_loader import SkillsLoader
from core.intelligent_memory import IntelligentMemoryExtractor
from core.skill_executor import SkillExecutor
from core.web_search import WebSearchService

logger = logging.getLogger(__name__)

# Desktop tool names that require frontend bridging
DESKTOP_TOOLS = {"run_command", "read_file", "list_directory", "write_file"}

# Module-level dict to store asyncio.Future objects for desktop tool results
_desktop_results: Dict[str, asyncio.Future] = {}


class MiniMaxAnthropic(Anthropic):
    """为 MiniMax API 定制的 Anthropic 客户端"""

    def __init__(self, api_key: str, **kwargs):
        super().__init__(api_key=api_key, **kwargs)
        self._raw_api_key = api_key

    @property
    def auth_headers(self) -> Dict[str, str]:
        """Override auth headers to use raw API key"""
        return {
            "Authorization": f"Bearer {self._raw_api_key}"
        }


class MiniMaxAsyncAnthropic(AsyncAnthropic):
    """为 MiniMax API 定制的异步 Anthropic 客户端"""

    def __init__(self, api_key: str, **kwargs):
        super().__init__(api_key=api_key, **kwargs)
        self._raw_api_key = api_key

    @property
    def auth_headers(self) -> Dict[str, str]:
        """Override auth headers to use raw API key"""
        return {
            "Authorization": f"Bearer {self._raw_api_key}"
        }


class ClaudeAgent:
    """Claude 智能代理"""

    def __init__(
        self,
        api_key: str,
        memory_manager: MemoryManager,
        skills_loader: SkillsLoader,
        model: str = None,
        base_url: str = None,
        skill_installer=None
    ):
        self.api_key = api_key
        self.memory_manager = memory_manager
        self.skills_loader = skills_loader
        self.skill_installer = skill_installer

        # 初始化 Claude 客户端（支持自定义 base_url）
        base_url = base_url or os.getenv("ANTHROPIC_BASE_URL")
        client_kwargs = {"api_key": api_key}
        if base_url:
            client_kwargs["base_url"] = base_url

        # 使用 MiniMax 定制客户端（如果是 MiniMax API）
        if base_url and "minimaxi.com" in base_url:
            self.client = MiniMaxAnthropic(**client_kwargs)
            self.async_client = MiniMaxAsyncAnthropic(**client_kwargs)
            logger.info("使用 MiniMax 定制客户端")
        else:
            self.client = Anthropic(**client_kwargs)
            self.async_client = AsyncAnthropic(**client_kwargs)

        # 配置
        self.model = model or os.getenv("MODEL_NAME", "claude-sonnet-4-5-20250929")
        self.max_tokens = int(os.getenv("MAX_TOKENS", 4096))
        self.temperature = float(os.getenv("TEMPERATURE", 1.0))

        # 会话历史（内存缓存）
        self.sessions = {}  # {session_id: [messages]}

        # 智能记忆提取器
        self.memory_extractor = IntelligentMemoryExtractor(self.async_client)
        logger.info("智能记忆提取器已初始化")

        # Skill 执行器
        self.skill_executor = SkillExecutor(skills_loader)
        logger.info("Skill 执行器已初始化")

        # 联网搜索服务 (UAPI 免费)
        self.web_search = WebSearchService()
        logger.info("联网搜索服务已初始化 (UAPI 免费)")

        # 搜索意图关键词
        # search_keywords 已移至 _should_search 方法内

        base_url_info = f", Base URL: {base_url}" if base_url else ""
        logger.info(f"Claude Agent 初始化完成 (模型: {self.model}{base_url_info})")

    async def _get_system_prompt(self, user_id: str, memory_context: str = "", skill_context: str = "", search_context: str = "") -> str:
        """构建系统提示词"""

        # 从重要记忆中直接提取 AI 助手名字和用户名字（使用 list_memories 按类型查找，更快更可靠）
        import re
        assistant_name = "CKS Lite 的智能助手"
        user_name = None

        try:
            # 加载所有重要记忆类型（非对话记忆）
            key_memories = []
            for mtype in ["user_config", "personal", "user_preference", "important_info"]:
                mems = await self.memory_manager.list_memories(user_id=user_id, memory_type=mtype, limit=10)
                key_memories.extend(mems)

            for mem in key_memories:
                content = mem.get("content", "")

                # 提取助手名字
                if "AI助手的名字是" in content:
                    match = re.search(r"AI助手的名字是\s*(\w+)", content)
                    if match:
                        assistant_name = match.group(1)
                        logger.info(f"✅ 助手名字: {assistant_name}")

                # 提取用户名字
                if not user_name:
                    for pattern in [r"用户(?:名)?叫\s*(\w+)", r"我叫\s*(\w+)", r"名字是\s*(\w+)"]:
                        match = re.search(pattern, content)
                        if match:
                            user_name = match.group(1)
                            logger.info(f"✅ 用户名字: {user_name}")
                            break

        except Exception as e:
            logger.warning(f"读取用户/助手名字失败: {e}")

        # 构建可用 Skills 列表
        skills_list = []
        for skill in self.skills_loader.skills:
            if skill.has_skill:
                skills_list.append(f"- **{skill.display_name}**: {skill.description[:100]}...")

        skills_info = "\n".join(skills_list) if skills_list else "暂无可用技能"

        # 获取助手脚本路径
        _helpers_dir = os.environ.get("TEMP", os.environ.get("TMP", "/tmp"))
        _helpers_path = os.path.join(_helpers_dir, "cks_lite")

        base_prompt = f"""你是 {assistant_name}，CKS Lite 的智能助手。

## ❗ 最高优先级规则（必须严格遵守）

1. **🚫 禁止用 run_command 做网络请求！** 不要用 python/curl/wget 访问 URL。使用 `web_search` 工具搜索信息。
2. **🚫 禁止用 `python -c "..."` 执行多行代码！** 多行代码必须先 write_file 再 run_command。
3. **📝 记忆中已有的信息直接使用，不要重复询问用户！**
4. **📋 接到复杂任务时，先列出执行计划（TODO 清单）再行动！** 每完成一步报告进度。
5. **🔄 工具调用失败时，分析错误并用其他方法重试，不要放弃！**
6. **🔍 搜索信息时，使用 `web_search` 工具，可多次调用不同关键词获取充足数据！** 如果第一次结果不够，换关键词再搜。

## 核心能力

- **长期记忆**：上下文中的 "📝 相关记忆" 包含用户历史信息
- **联网搜索**：`web_search` 工具（可多次调用）
- **桌面操作**：`run_command`、`read_file`、`write_file`、`list_directory`
- **文档处理**：Excel/PPT/Word/PDF（用预置脚本，见下方）

## 可用技能
{skills_info}

## ⚡ 预置助手脚本（优先使用，大幅提速）

系统已部署助手脚本到 `{_helpers_path}\\`，**创建 PPT 和发邮件必须使用这些脚本**：

### 创建 PPT（必须用此方式）
1. 用 `write_file` 写 JSON 配置文件
2. 用 `run_command` 执行：`python {_helpers_path}\\cks_ppt_builder.py <config.json>`

JSON 格式：
```json
{{{{
    "title": "演示标题",
    "subtitle": "副标题 | 2026年2月",
    "style": "business",
    "slides": [
        {{{{"title": "章节标题", "bullets": ["要点1（详细说明）", "要点2", "要点3", "要点4", "要点5"]}}}},
        ...更多页面（至少5-8页）
    ],
    "output": "C:\\\\Users\\\\Public\\\\output.pptx"
}}}}
```
style 选项：`business`(蓝黑+青色) | `tech`(纯黑+绿色) | `minimal`(白底黑字) | `creative`(深紫+粉色)

**PPT 内容要求**：每个 PPT 至少 5-8 个内容页，每页 4-6 个要点，要点要有具体描述（不能只写标题）。

### 发送邮件（必须用此方式）
1. 用 `write_file` 写 JSON 配置文件
2. 用 `run_command` 执行：`python {_helpers_path}\\cks_email_sender.py <config.json>`

JSON 格式：
```json
{{{{
    "smtp_server": "smtp.163.com",
    "smtp_port": 465,
    "email_addr": "发件人邮箱",
    "auth_code": "授权码",
    "to": "收件人邮箱",
    "subject": "主题",
    "body": "正文内容",
    "attachments": ["C:\\\\path\\\\to\\\\file.pptx"]
}}}}
```

### 邮箱凭证
- 用户首次提供邮箱和授权码时，立即用 `save_memory` 保存
- 常见服务器：QQ=smtp.qq.com:465, 163=smtp.163.com:465, Gmail=smtp.gmail.com:465

### 文档读写（write_file 写脚本 → run_command 执行）
- **读 PDF**: `import fitz; doc = fitz.open(path); print(doc[0].get_text())`
- **读 Excel**: `import openpyxl; wb = openpyxl.load_workbook(path)`
- **写 Excel**: `wb = openpyxl.Workbook(); ws.append([...]); wb.save(path)`
- **读 Word**: `from docx import Document; doc = Document(path)`
- **写 Word**: `doc = Document(); doc.add_heading(...); doc.save(path)`
- **助手模块**: `from cks_file_helpers import read_pdf, read_excel, read_docx, read_pptx`（位于 `{_helpers_path}\\`）

### 查看收件箱
写 Python 脚本用 `imaplib.IMAP4_SSL` 连接 IMAP 服务器读取邮件。

### Windows 命令
- `run_command` 默认工作目录是用户主目录
- 脚本文件统一写到 `C:\\\\Users\\\\Public\\\\` 或 `%TEMP%\\\\`
"""

        # 添加用户信息上下文
        if user_name:
            base_prompt += f"\n\n## 👤 用户信息\n用户名字：{user_name}\n（请在对话中自然地称呼用户的名字）"
        else:
            base_prompt += "\n\n## 👤 用户信息\n你还不知道用户的名字。在首次对话或适当的时机，友好地询问用户的名字，例如：'对了，我还不知道该怎么称呼你，你叫什么名字呢？'"

        if memory_context:
            base_prompt += f"\n\n## 📝 相关记忆（已自动检索）\n{memory_context}\n\n💡 请在回答中主动使用这些记忆，提供更个性化的服务。"
        else:
            base_prompt += "\n\n注意：本次对话暂无相关历史记忆。"

        # 添加 Skill 上下文（如果检测到相关意图）
        if skill_context:
            base_prompt += f"\n\n## 🛠️ 技能参考文档\n以下是与用户请求相关的技能文档，请参考使用：\n\n{skill_context}"

        # 添加联网搜索上下文
        if search_context:
            base_prompt += f"\n\n## 🔍 联网搜索结果（系统已自动搜索）\n{search_context}\n\n⚠️ **以上搜索结果是系统通过 UAPI 联网搜索引擎获取的最新信息。请直接使用这些结果，不要再用 run_command 执行 python/curl/wget 去爬取网页！**"

        return base_prompt

    def _should_search(self, message: str) -> bool:
        """判断是否需要联网搜索"""
        import re
        message_lower = message.lower()

        # 中文关键词直接包含即可
        cn_keywords = [
            "搜索", "查一下", "查找", "搜一下", "找一下",
            "最新", "今天", "最近", "当前",
            "新闻", "热点", "热搜",
        ]
        for keyword in cn_keywords:
            if keyword in message_lower:
                return True

        # 英文关键词需要独立单词匹配，避免 "find-skills" 误触发 "find"
        en_keywords = ["search", "find", "look up", "google"]
        for keyword in en_keywords:
            if re.search(r'(?<![a-zA-Z\-])' + re.escape(keyword) + r'(?![a-zA-Z\-])', message_lower):
                return True

        # 模糊意图关键词（中文）
        intent_keywords = ["怎么样", "是什么"]
        for keyword in intent_keywords:
            if keyword in message_lower:
                return True

        return False

    def _extract_search_query(self, message: str) -> str:
        """从用户消息中提取精简搜索关键词"""
        import re
        # 去掉常见的动作指令前缀和后缀
        query = message
        # 去掉 "搜索一下"、"帮我查找" 等前缀
        prefixes = [
            r"^(请|帮我|帮忙)?(搜索一下|搜索|查找一下|查找|搜一下|查一下|找一下|搜一搜|查查)",
            r"^(请|帮我|帮忙)?看看",
        ]
        for prefix in prefixes:
            query = re.sub(prefix, "", query)

        # 去掉 "然后做成..."、"然后发送..." 等后续指令
        action_patterns = [
            r"[，,]?\s*然后.*$",
            r"[，,]?\s*并(且)?.*$",
            r"[，,]?\s*接着.*$",
            r"[，,]?\s*之后.*$",
            r"[，,]?\s*(做成|制作|生成|发送|写成|转成).*$",
        ]
        for pattern in action_patterns:
            query = re.sub(pattern, "", query)

        query = query.strip()
        # 如果提取后太短（<2字符），用原始消息的前50字符
        if len(query) < 2:
            query = message[:50]
        return query

    def _get_or_create_session(self, session_id: str) -> List[Dict]:
        """获取或创建会话"""
        if session_id not in self.sessions:
            self.sessions[session_id] = []
        return self.sessions[session_id]

    async def chat(
        self,
        user_id: str,
        message: str,
        session_id: str = "default",
        use_memory: bool = True
    ) -> Dict:
        """对话（非流式）"""

        # 1. 检索相关记忆
        memory_context = ""
        memory_used = []

        if use_memory:
            # 1a. 始终加载重要记忆（user_config, personal, user_preference, important_info）
            important_memories = []
            seen_ids = set()
            for mtype in ["user_config", "personal", "user_preference", "important_info"]:
                try:
                    type_mems = await self.memory_manager.list_memories(
                        user_id=user_id,
                        memory_type=mtype,
                        limit=5
                    )
                    for mem in type_mems:
                        if mem["id"] not in seen_ids:
                            seen_ids.add(mem["id"])
                            important_memories.append(mem)
                except Exception as e:
                    logger.warning(f"加载 {mtype} 记忆失败: {e}")

            # 1b. 混合搜索检索相关记忆
            query_memories = await self.memory_manager.search_memories(
                user_id=user_id,
                query=message,
                top_k=int(os.getenv("MEMORY_TOP_K", 5)),
                use_hybrid=True
            )

            # 1c. 合并：重要记忆优先
            memories = list(important_memories)
            for mem in (query_memories or []):
                if mem["id"] not in seen_ids:
                    seen_ids.add(mem["id"])
                    memories.append(mem)

            if memories:
                memory_context = "相关记忆：\n"
                for i, mem in enumerate(memories, 1):
                    mem_type_label = {"user_config": "[配置]", "personal": "[个人]", "user_preference": "[偏好]", "important_info": "[重要]"}.get(mem.get("memory_type", ""), "")
                    memory_context += f"{i}. {mem_type_label} {mem['content']}\n"
                    memory_used.append({
                        "id": mem["id"],
                        "content": mem["content"][:100] + "...",
                        "similarity": mem.get("final_score", mem.get("score", mem.get("similarity", 0)))
                    })

                logger.info(f"检索到 {len(memories)} 条记忆 (重要: {len(important_memories)}, 相关: {len(query_memories or [])})")

        # 2. 检测 Skill 意图并获取上下文
        skill_context = ""
        matched_skills = self.skill_executor.detect_intent(message)
        if matched_skills:
            logger.info(f"🛠️ 检测到 Skill 意图: {matched_skills}")
            skill_context = self.skill_executor.get_combined_skill_context(matched_skills)

        # 3. 检测是否需要联网搜索
        search_context = ""
        if self._should_search(message):
            search_query = self._extract_search_query(message)
            logger.info(f"🔍 检测到搜索意图，开始联网搜索 (query='{search_query}')...")
            search_response = await self.web_search.search(search_query, num_results=10)
            if search_response.success:
                search_context = self.web_search.format_for_context(search_response)
                logger.info(f"✅ 搜索完成，获取 {len(search_response.results)} 条结果")
            else:
                logger.warning(f"❌ 搜索失败: {search_response.error}")

        # 4. 构建消息历史
        session_messages = self._get_or_create_session(session_id)
        session_messages.append({
            "role": "user",
            "content": message
        })

        # 5. 调用 Claude API
        try:
            system_prompt = await self._get_system_prompt(user_id, memory_context, skill_context, search_context)
            response = self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                system=system_prompt,
                messages=session_messages[-20:]  # 保留最近 20 轮对话
            )

            # 提取回复
            assistant_message = ""
            tool_calls = []

            for content in response.content:
                if content.type == "text":
                    assistant_message += content.text
                elif content.type == "tool_use":
                    tool_calls.append({
                        "name": content.name,
                        "input": content.input
                    })

            # 保存到会话历史
            session_messages.append({
                "role": "assistant",
                "content": assistant_message
            })

            # 4. 保存记忆
            if use_memory:
                # 4.1 保存对话记录
                await self.memory_manager.save_memory(
                    user_id=user_id,
                    content=f"用户: {message}\n助手: {assistant_message}",
                    memory_type="conversation",
                    metadata={
                        "session_id": session_id,
                        "model": self.model
                    }
                )

                # 4.2 智能提取结构化记忆
                if self.memory_extractor.should_extract(message):
                    try:
                        logger.info(f"🧠 开始智能提取记忆: {message[:50]}...")
                        extracted_memories = await self.memory_extractor.extract_memories(
                            user_message=message,
                            conversation_context=f"用户刚才说: {message}\nAI 回复: {assistant_message[:200]}"
                        )

                        # 保存提取的记忆（带去重检查）
                        for mem in extracted_memories:
                            # 检查是否已有相似记忆
                            existing = await self.memory_manager.search_memories(
                                user_id=user_id,
                                query=mem["content"],
                                top_k=3,
                                use_hybrid=True
                            )

                            # 如果已有高度相似的记忆（相似度>0.85），跳过
                            is_duplicate = False
                            for existing_mem in existing:
                                similarity = existing_mem.get("final_score", existing_mem.get("similarity", 0))
                                if similarity > 0.85:
                                    logger.info(f"跳过重复记忆: {mem['content'][:30]}... (相似度: {similarity:.2f})")
                                    is_duplicate = True
                                    break

                            if not is_duplicate:
                                await self.memory_manager.save_memory(
                                    user_id=user_id,
                                    content=mem["content"],
                                    memory_type=mem["memory_type"],
                                    metadata={
                                        "source": "intelligent_extraction",
                                        "importance": mem["importance"],
                                        "extracted_from": message[:100]
                                    }
                                )
                                logger.info(f"✅ 提取记忆: [{mem['memory_type']}] {mem['content']}")

                    except Exception as e:
                        logger.warning(f"智能记忆提取失败: {e}")
                        # 提取失败不影响主流程


            return {
                "message": assistant_message,
                "tool_calls": tool_calls,
                "memory_used": memory_used
            }

        except Exception as e:
            logger.error(f"对话错误: {e}", exc_info=True)
            raise

    def _get_tools(self) -> List[Dict]:
        """从 Skills 系统动态获取所有已注册工具"""
        # 从 skills_loader 获取所有 Skill 声明的工具
        tools = self.skills_loader.get_tools_for_claude()

        # 内置工具：保存记忆
        tools.append({
            "name": "save_memory",
            "description": "保存重要信息到长期记忆。用于保存用户的邮箱配置、偏好设置等需要长期记住的信息。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "要保存的记忆内容"
                    },
                    "memory_type": {
                        "type": "string",
                        "enum": ["user_config", "user_preference", "important_info"],
                        "description": "记忆类型"
                    }
                },
                "required": ["content", "memory_type"]
            }
        })

        # 内置工具：搜索社区技能（find-skills 的可执行工具）
        if self.skill_installer:
            tools.append({
                "name": "find_skills",
                "description": "搜索可安装的社区技能。当用户想查找、搜索、发现新技能，或用户提到 find-skills 时，使用此工具进行搜索。返回可一键安装的技能列表。",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "搜索关键词（英文，如 'pdf', 'email', 'report'）"
                        }
                    },
                    "required": ["query"]
                }
            })

        # 内置工具：联网搜索（AI 可多次调用以获取更多信息）
        tools.append({
            "name": "web_search",
            "description": "联网搜索工具。当需要获取最新新闻、实时信息、技术文档时使用。可以多次调用以获取更多数据。每次搜索使用不同的关键词获取更全面的结果。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词（简洁精准，如 '今日热点新闻 2026'，不要用整句话搜索）"
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "返回结果数量，默认10条",
                        "default": 10
                    },
                    "time_range": {
                        "type": "string",
                        "description": "时间范围: day, week, month, year",
                        "enum": ["day", "week", "month", "year"]
                    }
                },
                "required": ["query"]
            }
        })

        # Desktop tools (executed via frontend Tauri bridge)
        tools.append({
            "name": "run_command",
            "description": "在用户电脑上执行终端命令。可以运行任何 shell 命令，如查看文件、安装软件包、执行脚本等。需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "要执行的终端命令"
                    },
                    "cwd": {
                        "type": "string",
                        "description": "工作目录（可选）"
                    },
                    "timeout_secs": {
                        "type": "integer",
                        "description": "超时秒数（默认30秒）"
                    }
                },
                "required": ["command"]
            }
        })

        tools.append({
            "name": "read_file",
            "description": "读取用户电脑上的文件内容。支持文本文件。需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "文件的绝对路径"
                    }
                },
                "required": ["path"]
            }
        })

        tools.append({
            "name": "list_directory",
            "description": "列出用户电脑上某个目录的内容。返回文件和文件夹列表。需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "目录的绝对路径"
                    }
                },
                "required": ["path"]
            }
        })

        tools.append({
            "name": "write_file",
            "description": "将内容写入用户电脑上的文件。如果文件不存在会自动创建，如果父目录不存在也会自动创建。需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "文件的绝对路径"
                    },
                    "content": {
                        "type": "string",
                        "description": "要写入的文件内容"
                    }
                },
                "required": ["path", "content"]
            }
        })

        return tools

    async def _execute_tool(self, user_id: str, tool_name: str, tool_input: Dict) -> Dict:
        """执行工具调用 - 自动路由到对应 Skill"""
        logger.info(f"🔧 执行工具: {tool_name}")

        # Desktop tools: return special marker for frontend bridging
        if tool_name in DESKTOP_TOOLS:
            return {
                "success": True,
                "_desktop_tool": True,
                "tool_name": tool_name,
                "tool_input": tool_input,
            }

        # 内置工具：联网搜索
        if tool_name == "web_search":
            return await self._execute_web_search(tool_input)

        # 内置工具：保存记忆
        if tool_name == "save_memory":
            return await self._execute_save_memory(user_id, tool_input)

        # 内置工具：搜索社区技能（find_skills 或 find-skills 均路由到此）
        if tool_name in ("find_skills", "find-skills") and self.skill_installer:
            query = tool_input.get("query", "")
            skills = await self.skill_installer.search_skills(query)
            return {
                "success": True,
                "message": f"找到 {len(skills)} 个相关技能",
                "data": {"skills": skills}
            }

        # Skill 注册的工具：由 skills_loader 统一分发
        tool = self.skills_loader.registered_tools.get(tool_name)
        if tool:
            return tool.execute(tool_input)

        # 工具名匹配已加载的 Skill（SKILL.md-only，无可执行工具）
        # 返回成功，告知模型技能已就绪，直接根据 system prompt 中的 SKILL.md 上下文回答
        skill = self.skills_loader.get_skill(tool_name)
        if skill:
            logger.info(f"ℹ️ {tool_name} 是纯上下文技能（无可执行工具），引导模型直接回答")
            return {
                "success": True,
                "message": f"技能已就绪。{skill.display_name} 的完整说明已加载到你的上下文中，请直接按照其中的指引回答用户。"
            }

        return {"success": False, "error": f"未找到工具: {tool_name}"}

    async def _execute_web_search(self, params: Dict) -> Dict:
        """内置工具：联网搜索"""
        query = params.get("query", "")
        if not query:
            return {"success": False, "error": "搜索关键词不能为空"}

        try:
            num_results = params.get("num_results", 10)
            time_range = params.get("time_range")
            response = await self.web_search.search(
                query=query,
                num_results=num_results,
                time_range=time_range
            )
            if response.success and response.results:
                results_text = []
                for i, r in enumerate(response.results, 1):
                    results_text.append(f"{i}. **{r.title}**\n   链接: {r.url}\n   摘要: {r.snippet[:300]}")
                return {
                    "success": True,
                    "message": f"搜索到 {len(response.results)} 条结果",
                    "data": "\n\n".join(results_text)
                }
            else:
                return {"success": False, "error": response.error or "未找到结果"}
        except Exception as e:
            logger.error(f"联网搜索失败: {e}")
            return {"success": False, "error": str(e)}

    async def _execute_save_memory(self, user_id: str, params: Dict) -> Dict:
        """内置工具：保存记忆"""
        content = params.get("content", "")
        memory_type = params.get("memory_type", "important_info")

        if not content:
            return {"success": False, "error": "记忆内容不能为空"}

        try:
            memory_id = await self.memory_manager.save_memory(
                user_id=user_id,
                content=content,
                memory_type=memory_type,
                metadata={"source": "tool_call"}
            )
            logger.info(f"✅ 保存记忆成功: {content[:50]}...")
            return {"success": True, "memory_id": memory_id, "message": "信息已保存到长期记忆"}
        except Exception as e:
            logger.error(f"保存记忆失败: {e}")
            return {"success": False, "error": str(e)}

    async def chat_stream(
        self,
        user_id: str,
        message: str,
        session_id: str = "default",
        use_memory: bool = True
    ) -> AsyncGenerator[str, None]:
        """对话（流式，支持 Tool Use）"""

        # 1. 检索相关记忆
        memory_context = ""
        memory_used = []

        if use_memory:
            # 1a. 始终加载重要记忆（user_config, personal, user_preference, important_info）
            # 这些是用户的核心信息（邮箱、名字、偏好等），不受查询相关性影响
            important_memories = []
            seen_ids = set()
            for mtype in ["user_config", "personal", "user_preference", "important_info"]:
                try:
                    type_mems = await self.memory_manager.list_memories(
                        user_id=user_id,
                        memory_type=mtype,
                        limit=5
                    )
                    for mem in type_mems:
                        if mem["id"] not in seen_ids:
                            seen_ids.add(mem["id"])
                            important_memories.append(mem)
                except Exception as e:
                    logger.warning(f"加载 {mtype} 记忆失败: {e}")

            # 1b. 使用混合搜索检索与当前消息相关的记忆
            query_memories = await self.memory_manager.search_memories(
                user_id=user_id,
                query=message,
                top_k=int(os.getenv("MEMORY_TOP_K", 5)),
                use_hybrid=True
            )

            # 1c. 合并：重要记忆优先，再补充查询相关的记忆（去重）
            memories = []
            for mem in important_memories:
                memories.append(mem)

            for mem in (query_memories or []):
                if mem["id"] not in seen_ids:
                    seen_ids.add(mem["id"])
                    memories.append(mem)

            if memories:
                memory_context = "相关记忆：\n"
                for i, mem in enumerate(memories, 1):
                    mem_type_label = {"user_config": "[配置]", "personal": "[个人]", "user_preference": "[偏好]", "important_info": "[重要]"}.get(mem.get("memory_type", ""), "")
                    memory_context += f"{i}. {mem_type_label} {mem['content']}\n"
                    memory_used.append({
                        "id": mem["id"],
                        "content": mem["content"][:100] + "...",
                        "similarity": mem.get("final_score", mem.get("score", mem.get("similarity", 0)))
                    })

                logger.info(f"检索到 {len(memories)} 条记忆 (重要: {len(important_memories)}, 相关: {len(query_memories or [])})")

                yield json.dumps({
                    "type": "memory",
                    "memories": memory_used
                })

        # 2. 检测 Skill 意图并获取上下文
        skill_context = ""
        matched_skills = self.skill_executor.detect_intent(message)
        use_tools = True  # Always enable tools (desktop tools are always available)

        if matched_skills:
            logger.info(f"🛠️ 检测到 Skill 意图: {matched_skills}")
            skill_context = self.skill_executor.get_combined_skill_context(matched_skills)

            # 匹配到 Skill 时一律启用 tool-capable 路径
            # 即使 Skill 本身没有注册工具，模型仍可能需要内置工具（web_search / save_memory）
            use_tools = True
            for skill_name in matched_skills:
                skill = self.skills_loader.get_skill(skill_name)
                if skill and skill.has_tools:
                    logger.info(f"🔧 启用工具（Skill: {skill.display_name}，工具数: {len(skill.tools)}）")
                    break

            yield json.dumps({
                "type": "skill",
                "skills": matched_skills
            })

        # 3. 检测是否需要联网搜索
        search_context = ""
        if self._should_search(message):
            # 提取精简搜索关键词（去掉动作指令部分）
            search_query = self._extract_search_query(message)
            logger.info(f"🔍 检测到搜索意图，开始联网搜索 (query='{search_query}')...")

            yield json.dumps({
                "type": "search_start",
                "query": search_query
            })

            search_response = await self.web_search.search(search_query, num_results=10)
            if search_response.success:
                search_context = self.web_search.format_for_context(search_response)
                logger.info(f"✅ 搜索完成，获取 {len(search_response.results)} 条结果")

                yield json.dumps({
                    "type": "search_done",
                    "results": [
                        {
                            "title": r.title,
                            "url": r.url,
                            "snippet": r.snippet[:200]
                        }
                        for r in search_response.results[:10]
                    ],
                    "provider": search_response.provider
                })
            else:
                logger.warning(f"❌ 搜索失败: {search_response.error}")
                yield json.dumps({
                    "type": "search_error",
                    "error": search_response.error
                })

        # 4. 构建消息历史
        session_messages = self._get_or_create_session(session_id)
        session_messages.append({
            "role": "user",
            "content": message
        })

        # 5. 调用 API（支持 Tool Use）
        assistant_message = ""
        system_prompt = await self._get_system_prompt(user_id, memory_context, skill_context, search_context)

        try:
            if use_tools:
                # 使用非流式 API 处理工具调用
                async for chunk in self._chat_with_tools(user_id, session_messages, system_prompt):
                    data = json.loads(chunk)
                    if data.get("type") == "text":
                        assistant_message += data.get("content", "")
                    yield chunk
            else:
                # 使用流式 API（无工具）
                async for chunk in self._chat_stream_simple(session_messages, system_prompt):
                    data = json.loads(chunk)
                    if data.get("type") == "text":
                        assistant_message += data.get("content", "")
                    yield chunk

            # 保存到会话历史（清除 XML 工具调用残留）
            if assistant_message:
                clean_message = self._strip_xml_tool_calls(assistant_message)
                session_messages.append({
                    "role": "assistant",
                    "content": clean_message or assistant_message
                })

            # 6. 保存记忆
            if use_memory and assistant_message:
                await self.memory_manager.save_memory(
                    user_id=user_id,
                    content=f"用户: {message}\n助手: {assistant_message}",
                    memory_type="conversation",
                    metadata={
                        "session_id": session_id,
                        "model": self.model
                    }
                )

                # 智能提取结构化记忆
                if self.memory_extractor.should_extract(message):
                    try:
                        logger.info(f"🧠 开始智能提取记忆: {message[:50]}...")
                        extracted_memories = await self.memory_extractor.extract_memories(
                            user_message=message,
                            conversation_context=f"用户刚才说: {message}\nAI 回复: {assistant_message[:200]}"
                        )

                        for mem in extracted_memories:
                            existing = await self.memory_manager.search_memories(
                                user_id=user_id,
                                query=mem["content"],
                                top_k=3,
                                use_hybrid=True
                            )

                            is_duplicate = False
                            for existing_mem in existing:
                                similarity = existing_mem.get("final_score", existing_mem.get("similarity", 0))
                                if similarity > 0.85:
                                    logger.info(f"跳过重复记忆: {mem['content'][:30]}...")
                                    is_duplicate = True
                                    break

                            if not is_duplicate:
                                await self.memory_manager.save_memory(
                                    user_id=user_id,
                                    content=mem["content"],
                                    memory_type=mem["memory_type"],
                                    metadata={
                                        "source": "intelligent_extraction",
                                        "importance": mem["importance"],
                                        "extracted_from": message[:100]
                                    }
                                )
                                logger.info(f"✅ 提取记忆: [{mem['memory_type']}] {mem['content']}")

                    except Exception as e:
                        logger.warning(f"智能记忆提取失败: {e}")

        except Exception as e:
            logger.error(f"对话错误: {e}", exc_info=True)
            yield json.dumps({
                "type": "error",
                "error": str(e)
            })

    async def _chat_stream_simple(self, messages: List[Dict], system_prompt: str) -> AsyncGenerator[str, None]:
        """简单流式对话（无工具）"""
        try:
            async with self.async_client.messages.stream(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                system=system_prompt,
                messages=messages[-20:]
            ) as stream:
                async for event in stream:
                    event_type = getattr(event, 'type', None)

                    if event_type == "content_block_delta":
                        delta = getattr(event, 'delta', None)
                        if delta:
                            delta_type = getattr(delta, 'type', None)

                            if delta_type == "text_delta":
                                text = getattr(delta, 'text', None)
                                if text:
                                    yield json.dumps({"type": "text", "content": text})

                            elif delta_type != "thinking_delta" and hasattr(delta, 'text') and delta.text:
                                yield json.dumps({"type": "text", "content": delta.text})

                    elif event_type in ["message_stop", "message_end"]:
                        yield json.dumps({"type": "done"})

        except Exception as e:
            logger.error(f"流式对话错误: {e}", exc_info=True)
            yield json.dumps({"type": "error", "error": str(e)})

    @staticmethod
    def _strip_xml_tool_calls(text: str) -> str:
        """清除模型输出中的 XML 格式工具调用（MiniMax 兼容）"""
        import re
        # 完整块: <minimax:tool_call>...</minimax:tool_call>
        text = re.sub(r'<minimax:tool_call>[\s\S]*?</minimax:tool_call>', '', text)
        text = re.sub(r'<tool_call>[\s\S]*?</tool_call>', '', text)
        # 不完整块（流式截断）: 只有开头没有结尾
        text = re.sub(r'<minimax:tool_call>[\s\S]*$', '', text)
        text = re.sub(r'<tool_call>[\s\S]*$', '', text)
        # 孤立标签
        text = re.sub(r'</?minimax:tool_call[^>]*>', '', text)
        text = re.sub(r'</?tool_call[^>]*>', '', text)
        text = re.sub(r'<invoke\s[^>]*>[\s\S]*?</invoke>', '', text)
        text = re.sub(r'</?invoke[^>]*>', '', text)
        text = re.sub(r'<parameter[^>]*>[\s\S]*?</parameter>', '', text)
        text = re.sub(r'</?parameter[^>]*>', '', text)
        return text.strip()

    async def _wait_for_desktop_result(self, request_id: str, timeout: int = 120) -> Dict:
        """Wait for the frontend to POST the desktop tool execution result"""
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        _desktop_results[request_id] = future
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning(f"Desktop tool timeout: {request_id}")
            return {"success": False, "error": "桌面工具执行超时"}
        finally:
            _desktop_results.pop(request_id, None)

    async def _chat_with_tools(self, user_id: str, messages: List[Dict], system_prompt: str) -> AsyncGenerator[str, None]:
        """带工具的对话（非流式处理工具调用，流式输出文本）"""
        import time
        task_start = time.time()

        tools = self._get_tools()
        current_messages = messages[-20:]
        max_iterations = 50  # 最大工具调用轮数

        for iteration in range(max_iterations):
            iter_start = time.time()
            logger.info(f"🔄 Tool Use 迭代 {iteration + 1}/{max_iterations} (已用时 {time.time() - task_start:.1f}s)")

            try:
                # 非流式调用以支持工具
                api_start = time.time()
                response = await self.async_client.messages.create(
                    model=self.model,
                    max_tokens=self.max_tokens,
                    temperature=self.temperature,
                    system=system_prompt,
                    messages=current_messages,
                    tools=tools
                )
                api_elapsed = time.time() - api_start
                logger.info(f"⏱️ Claude API 调用: {api_elapsed:.1f}s (stop_reason={response.stop_reason})")

                # 检查是否有工具调用
                tool_use_blocks = []
                text_content = ""

                for block in response.content:
                    if block.type == "text":
                        text_content += block.text
                    elif block.type == "tool_use":
                        tool_use_blocks.append(block)

                # 清除文本中的 XML 工具调用残留（MiniMax 兼容）
                text_content = self._strip_xml_tool_calls(text_content)

                # 如果有文本内容，流式输出
                if text_content:
                    chunk_size = 20
                    for i in range(0, len(text_content), chunk_size):
                        chunk = text_content[i:i+chunk_size]
                        yield json.dumps({"type": "text", "content": chunk})
                        await asyncio.sleep(0.01)

                # 如果没有工具调用，结束
                if not tool_use_blocks:
                    total_elapsed = time.time() - task_start
                    logger.info(f"✅ 任务完成: {iteration + 1} 轮迭代, 总用时 {total_elapsed:.1f}s")
                    yield json.dumps({"type": "done"})
                    return

                # 处理工具调用
                tool_results = []
                for tool_block in tool_use_blocks:
                    tool_name = tool_block.name
                    tool_input = tool_block.input
                    tool_id = tool_block.id

                    tool_start = time.time()
                    logger.info(f"🔧 调用工具: {tool_name} (输入: {json.dumps(tool_input, ensure_ascii=False)[:100]})")

                    # 通知前端正在执行工具
                    yield json.dumps({
                        "type": "tool_start",
                        "tool": tool_name,
                        "input": tool_input
                    })

                    # 执行工具
                    result = await self._execute_tool(user_id, tool_name, tool_input)

                    # Desktop tool: bridge through frontend
                    if result.get("_desktop_tool"):
                        request_id = str(uuid4())
                        logger.info(f"🖥️ Desktop tool request: {tool_name} (request_id={request_id})")

                        yield json.dumps({
                            "type": "desktop_tool_request",
                            "request_id": request_id,
                            "tool": tool_name,
                            "input": tool_input
                        })

                        desktop_result = await self._wait_for_desktop_result(request_id, timeout=120)
                        tool_elapsed = time.time() - tool_start
                        success = desktop_result.get("success", False)
                        logger.info(f"⏱️ 工具 {tool_name}: {tool_elapsed:.1f}s ({'✅' if success else '❌'})")

                        yield json.dumps({
                            "type": "tool_result",
                            "tool": tool_name,
                            "success": success,
                            "message": desktop_result.get("content") or desktop_result.get("error", ""),
                            "data": desktop_result
                        })

                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": json.dumps({
                                "success": success,
                                "content": desktop_result.get("content", ""),
                                "error": desktop_result.get("error")
                            })
                        })
                    else:
                        tool_elapsed = time.time() - tool_start
                        success = result.get("success", False)
                        logger.info(f"⏱️ 工具 {tool_name}: {tool_elapsed:.1f}s ({'✅' if success else '❌'})")

                        yield json.dumps({
                            "type": "tool_result",
                            "tool": tool_name,
                            "success": success,
                            "message": result.get("message") or result.get("error", ""),
                            "data": result.get("data")
                        })

                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": json.dumps(result)
                        })

                # 将工具结果添加到消息历史
                current_messages.append({
                    "role": "assistant",
                    "content": response.content
                })
                current_messages.append({
                    "role": "user",
                    "content": tool_results
                })

                iter_elapsed = time.time() - iter_start
                logger.info(f"⏱️ 迭代 {iteration + 1} 完成: {iter_elapsed:.1f}s (API: {api_elapsed:.1f}s, 工具: {iter_elapsed - api_elapsed:.1f}s)")

                # 检查是否应该结束（stop_reason）
                if response.stop_reason == "end_turn":
                    total_elapsed = time.time() - task_start
                    logger.info(f"✅ 任务完成: {iteration + 1} 轮迭代, 总用时 {total_elapsed:.1f}s")
                    yield json.dumps({"type": "done"})
                    return

            except Exception as e:
                logger.error(f"Tool Use 错误 (迭代 {iteration + 1}): {e}", exc_info=True)
                yield json.dumps({"type": "error", "error": str(e)})
                return

        # 达到最大迭代次数
        total_elapsed = time.time() - task_start
        logger.warning(f"⚠️ 达到最大迭代次数 {max_iterations}, 总用时 {total_elapsed:.1f}s")
        yield json.dumps({"type": "done"})

    def clear_session(self, session_id: str):
        """清除会话历史"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"清除会话: {session_id}")
