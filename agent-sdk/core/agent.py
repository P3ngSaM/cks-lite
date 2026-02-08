"""
Claude Agent 核心
基于 Claude Agent SDK 实现的智能代理
"""

import os
import json
import asyncio
import time
import re
import base64
import mimetypes
from pathlib import Path
from uuid import uuid4
from typing import List, Dict, Optional, AsyncGenerator
import logging
import httpx
from anthropic import Anthropic, AsyncAnthropic
from anthropic.types import Message, MessageStreamEvent

from core.memory import MemoryManager
from core.skills_loader import SkillsLoader
from core.intelligent_memory import IntelligentMemoryExtractor
from core.skill_executor import SkillExecutor
from core.web_search import WebSearchService
from core.audit_logger import AuditLogger

logger = logging.getLogger(__name__)

# Desktop tool names that require frontend bridging
DESKTOP_TOOLS = {
    "run_command",
    "read_file",
    "list_directory",
    "write_file",
    "get_file_info",
    "delete_file",
    "get_platform_info",
    "open_application",
    "type_text",
    "press_hotkey",
    "send_feishu_message",
    "send_desktop_message",
    "capture_screen",
    "mouse_move",
    "mouse_click",
    "mouse_scroll",
}

# Module-level dict to store asyncio.Future objects for desktop tool results
_desktop_results: Dict[str, asyncio.Future] = {}


def update_repetition_state(
    last_signature: Optional[str],
    repeat_count: int,
    current_signature: str,
) -> tuple[str, int]:
    """Update repeat counters for tool-call circuit breaker logic."""
    if current_signature == last_signature:
        return current_signature, repeat_count + 1
    return current_signature, 1


def make_tool_signature(tool_name: str, tool_input: Dict) -> str:
    """Build a stable tool-call signature for repeated-call circuit breaker."""
    try:
        normalized = json.dumps(tool_input or {}, ensure_ascii=False, sort_keys=True)
    except Exception:
        normalized = str(tool_input)
    return f"{tool_name}:{normalized}"


def is_transient_tool_error(result: Dict) -> bool:
    """Heuristic: whether a tool failure is likely transient and worth one retry."""
    if not isinstance(result, dict):
        return False
    if result.get("success", True):
        return False
    text = " ".join(
        str(result.get(k, "") or "")
        for k in ("error", "message")
    ).lower()
    transient_tokens = (
        "timeout",
        "temporarily",
        "connection",
        "network",
        "rate limit",
        "busy",
        "temporary",
        "429",
        "502",
        "503",
        "504",
    )
    return any(token in text for token in transient_tokens)


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
        skill_installer=None,
        goal_manager=None,
    ):
        self.api_key = api_key
        self.memory_manager = memory_manager
        self.skills_loader = skills_loader
        self.skill_installer = skill_installer
        self.goal_manager = goal_manager

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
        self.session_skill_snapshots = {}  # {session_id: {version, skills, updated_at}}
        self.session_memory_flush_state = {}  # {session_id: last_flush_cycle}
        self.memory_flush_soft_chars = int(os.getenv("MEMORY_FLUSH_SOFT_CHARS", "12000"))
        self.skill_tool_retry_max = max(1, int(os.getenv("SKILL_TOOL_RETRY_MAX", "2")))

        # 智能记忆提取器
        self.memory_extractor = IntelligentMemoryExtractor(self.async_client)
        logger.info("智能记忆提取器已初始化")

        # Skill 执行器
        self.skill_executor = SkillExecutor(skills_loader)
        logger.info("Skill 执行器已初始化")

        # 联网搜索服务 (UAPI 免费)
        self.web_search = WebSearchService()
        logger.info("联网搜索服务已初始化 (UAPI 免费)")

        # 审计日志
        audit_dir = getattr(self.memory_manager, "data_dir", None)
        if audit_dir:
            self.audit_logger = AuditLogger(Path(audit_dir) / "audit")
        else:
            self.audit_logger = None

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
- **桌面操作**：`run_command`、`read_file`、`write_file`、`list_directory`、`get_file_info`、`delete_file`、`get_platform_info`、`open_application`、`type_text`、`press_hotkey`、`send_desktop_message`、`send_feishu_message`、`capture_screen`、`mouse_move`、`mouse_click`、`mouse_scroll`
- **视觉理解**：`analyze_screen`（基于 MiniMax 视觉模型分析截图并给出可执行建议）、`visual_next_action`（输出结构化下一步动作）
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

### 跨平台桌面执行规范（Windows/macOS/Linux）
- `run_command` 默认工作目录是用户主目录
- 脚本文件统一写到 `C:\\\\Users\\\\Public\\\\` 或 `%TEMP%\\\\`
- `run_command` 必须是单条命令，禁止使用 `cmd /c`、`powershell -Command`、`python -c` 这类包裹/内联执行方式
- 执行脚本时优先：`python C:\\\\Users\\\\Public\\\\xxx.py`（不要再拼接 shell 链式命令）
- 目标管理任务的状态回写（phase/status/review）必须用 `goal_task_update` 工具，禁止通过 `run_command` 更新数据库/状态
- 若任务需要真实桌面自动化，先调用 `get_platform_info` 判断系统，再用 `open_application` + `type_text` + `press_hotkey` 组合执行。
- 桌面IM发消息优先使用 `send_desktop_message(channel, recipient, content)`（支持 feishu/wecom/dingtalk）；调用后必须 `capture_screen` + `analyze_screen` 做结果核验，再给结论。若核验不通过，继续重试或切换方案，不要直接宣称“已发送”。
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
        message_lower = (message or "").lower()

        # 默认保守：只有明确搜索意图才联网，减少工作台对话延迟。
        aggressive = os.getenv("AUTO_WEB_SEARCH", "false").strip().lower() in {"1", "true", "yes", "on"}

        # 中文关键词：仅显式搜索词触发
        cn_keywords = [
            "搜索", "查一下", "查找", "搜一下", "找一下",
            "联网搜索", "帮我搜", "帮我查", "上网查",
        ]
        for keyword in cn_keywords:
            if keyword in message_lower:
                return True

        # 英文关键词需要独立单词匹配，避免 "find-skills" 误触发 "find"
        en_keywords = ["search", "find", "look up", "google"]
        for keyword in en_keywords:
            if re.search(r'(?<![a-zA-Z\-])' + re.escape(keyword) + r'(?![a-zA-Z\-])', message_lower):
                return True

        # 可选激进模式：允许“最新/热点”触发自动搜索。
        if aggressive:
            weak_keywords = ["最新", "今天", "最近", "当前", "新闻", "热点", "热搜"]
            for keyword in weak_keywords:
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

    @staticmethod
    def _extract_desktop_message_intent(message: str) -> Optional[Dict[str, str]]:
        """Detect desktop IM send-message intent and parse channel/recipient/content."""
        text = (message or "").strip()
        if not text:
            return None
        lower = text.lower()
        channel = ""
        if any(k in lower for k in ["飞书", "feishu", "lark"]):
            channel = "feishu"
        elif any(k in lower for k in ["企业微信", "wecom", "wxwork"]):
            channel = "wecom"
        elif any(k in lower for k in ["钉钉", "dingtalk"]):
            channel = "dingtalk"

        if not channel:
            return None
        if not any(k in text for k in ["发送", "发", "通知", "告诉"]) and not any(
            k in lower for k in ["send", "message"]
        ):
            return None

        recipient = ""
        content = ""
        patterns = [
            r"(?:给|向)\s*([^\s，。,:：]{1,24})\s*(?:发送|发)\s*(?:飞书)?(?:消息|信息)?[：:]\s*(.+)$",
            r"(?:在|用)?(?:飞书|feishu|lark).{0,8}(?:给|向)\s*([^\s，。,:：]{1,24}).{0,8}(?:发送|发).{0,8}[：:]\s*(.+)$",
            r"(?:给|向)\s*([^\s，。,:：]{1,24}).{0,12}(?:发送|发).{0,8}(?:消息|信息)\s*[“\"']?(.+?)[”\"']?$",
        ]
        for pattern in patterns:
            m = re.search(pattern, text, flags=re.IGNORECASE)
            if m:
                recipient = (m.group(1) or "").strip().strip("，,。")
                content = (m.group(2) or "").strip().strip("“”\"'")
                break

        if not recipient:
            m2 = re.search(r"(?:给|向)\s*([^\s，。,:：]{1,24})", text)
            if m2:
                recipient = (m2.group(1) or "").strip()
        if not content:
            m3 = re.search(r"(?:消息|内容|发送)\s*[：:]\s*(.+)$", text)
            if m3:
                content = (m3.group(1) or "").strip().strip("“”\"'")

        if not recipient or not content:
            return None
        return {"channel": channel, "recipient": recipient, "content": content}

    @staticmethod
    def _is_delivery_verified(answer: str) -> bool:
        text = (answer or "").strip().lower()
        if not text:
            return False
        positive_tokens = ["已发送", "发送成功", "已发出", "sent", "message sent"]
        negative_tokens = ["未发送", "未确认", "没有发送", "not sent", "未看到", "无法确认"]
        if any(token in text for token in negative_tokens):
            return False
        return any(token in text for token in positive_tokens)

    def _get_or_create_session(self, session_id: str) -> List[Dict]:
        """获取或创建会话"""
        if session_id not in self.sessions:
            self.sessions[session_id] = []
        return self.sessions[session_id]

    def _is_skill_tool(self, tool_name: str) -> bool:
        """Whether a tool name is provided by installed skills."""
        return self.skills_loader.get_tool(tool_name) is not None

    def _resolve_preferred_skill_name(self, preferred_skill: Optional[str]) -> Optional[str]:
        if not preferred_skill:
            return None
        candidate = preferred_skill.strip()
        if not candidate:
            return None
        direct = self.skills_loader.get_skill(candidate)
        if direct:
            return direct.name
        candidate_lower = candidate.lower()
        for skill in self.skills_loader.skills:
            if skill.name.lower() == candidate_lower:
                return skill.name
            if (skill.display_name or "").lower() == candidate_lower:
                return skill.name
        return None

    def _resolve_matched_skills(
        self,
        message: str,
        preferred_skill: Optional[str] = None,
        force_only: bool = False,
    ) -> List[str]:
        matched = [] if force_only else list(self.skill_executor.detect_intent(message) or [])
        preferred = self._resolve_preferred_skill_name(preferred_skill)
        if preferred and preferred not in matched:
            matched.insert(0, preferred)
        return matched

    @staticmethod
    def _skill_fallback_hint(tool_name: str) -> str:
        return (
            f"技能工具 `{tool_name}` 执行失败。请改用内置桌面工具链继续完成："
            "list_directory -> read_file/write_file -> run_command（必要时）。"
        )

    def _ensure_session_skill_snapshot(self, session_id: str) -> Dict:
        """
        Ensure session-level skills snapshot is up to date.
        Inspired by OpenClaw's snapshot-per-session strategy.
        """
        changed = self.skills_loader.refresh_if_changed()
        meta = self.skills_loader.get_snapshot_meta()
        existing = self.session_skill_snapshots.get(session_id)
        should_update = changed or not existing or existing.get("version") != meta["version"]
        if should_update:
            snapshot = {
                "version": meta["version"],
                "skills": [skill.name for skill in self.skills_loader.skills],
                "updated_at": int(time.time() * 1000),
            }
            self.session_skill_snapshots[session_id] = snapshot
            return {"snapshot": snapshot, "changed": True}
        return {"snapshot": existing, "changed": False}

    @staticmethod
    def _estimate_session_chars(messages: List[Dict], user_message: str) -> int:
        total = len(user_message or "")
        for msg in messages:
            content = msg.get("content")
            if isinstance(content, str):
                total += len(content)
            elif isinstance(content, list):
                total += len(json.dumps(content, ensure_ascii=False))
            elif content is not None:
                total += len(str(content))
        return total

    async def _run_pre_compaction_memory_flush(
        self,
        user_id: str,
        session_id: str,
        session_messages: List[Dict],
        user_message: str,
        estimated_chars: int,
    ) -> Dict:
        """
        Best-effort pre-compaction memory flush.
        Mirrors OpenClaw's "flush before compaction" idea in a lightweight form.
        """
        saved_count = 0
        # Always save a compact marker so we can resume continuity after trimming history.
        marker_content = (
            f"会话接近压缩阈值，执行记忆刷新。"
            f" session={session_id}, estimated_chars={estimated_chars}, user_message={user_message[:200]}"
        )
        await self.memory_manager.save_memory(
            user_id=user_id,
            content=marker_content,
            memory_type="important_info",
            metadata={
                "source": "pre_compaction_flush",
                "session_id": session_id,
                "estimated_chars": estimated_chars,
            },
        )
        saved_count += 1

        # Try structured extraction from recent turns.
        if self.memory_extractor.should_extract(user_message):
            recent = session_messages[-6:]
            context_lines: List[str] = []
            for item in recent:
                role = item.get("role", "unknown")
                content = item.get("content", "")
                if isinstance(content, str):
                    context_lines.append(f"{role}: {content[:220]}")
            context_lines.append(f"user: {user_message[:220]}")
            conversation_context = "\n".join(context_lines)
            extracted = await self.memory_extractor.extract_memories(
                user_message=user_message,
                conversation_context=conversation_context,
            )
            for mem in extracted[:3]:
                await self.memory_manager.save_memory(
                    user_id=user_id,
                    content=mem["content"],
                    memory_type=mem["memory_type"],
                    metadata={
                        "source": "pre_compaction_flush",
                        "session_id": session_id,
                        "importance": mem.get("importance", 7),
                    },
                )
                saved_count += 1

        return {"saved_count": saved_count, "estimated_chars": estimated_chars}

    async def _build_memory_context(
        self,
        user_id: str,
        message: str,
    ) -> tuple[str, List[Dict], Dict[str, int]]:
        """
        Build memory context with priority memories + two-stage recall.
        Inspired by OpenClaw's search->get memory flow.
        """
        memory_context = ""
        memory_used: List[Dict] = []
        seen_ids = set()
        important_memories: List[Dict] = []
        related_memories: List[Dict] = []

        important_types = ["user_config", "user_info", "personal", "user_preference", "important_info"]
        per_type_limit = max(1, int(os.getenv("MEMORY_IMPORTANT_PER_TYPE", "2")))
        query_top_k = max(1, min(int(os.getenv("MEMORY_TOP_K", "5")), 20))
        detail_limit = max(1, min(int(os.getenv("MEMORY_DETAIL_TOP_K", "4")), query_top_k))
        context_char_limit = max(800, int(os.getenv("MEMORY_CONTEXT_CHAR_LIMIT", "2800")))

        for mtype in important_types:
            try:
                type_mems = await self.memory_manager.list_memories(
                    user_id=user_id,
                    memory_type=mtype,
                    limit=per_type_limit,
                )
                for mem in type_mems:
                    if mem["id"] in seen_ids:
                        continue
                    seen_ids.add(mem["id"])
                    important_memories.append(mem)
            except Exception as e:
                logger.warning(f"加载 {mtype} 记忆失败: {e}")

        try:
            snippets = await self.memory_manager.search_memory_snippets(
                user_id=user_id,
                query=message,
                top_k=query_top_k,
                use_hybrid=True,
            )
            for snippet in snippets[:detail_limit]:
                memory_id = snippet.get("id")
                if not memory_id or memory_id in seen_ids:
                    continue
                detail = await self.memory_manager.get_memory_detail(
                    user_id=user_id,
                    memory_id=memory_id,
                )
                if not detail:
                    continue
                seen_ids.add(memory_id)
                detail["score"] = snippet.get("score")
                related_memories.append(detail)
        except Exception as e:
            logger.warning(f"两段式记忆检索失败，回退到传统检索: {e}")
            fallback = await self.memory_manager.search_memories(
                user_id=user_id,
                query=message,
                top_k=detail_limit,
                use_hybrid=True,
            )
            for mem in fallback:
                if mem["id"] in seen_ids:
                    continue
                seen_ids.add(mem["id"])
                related_memories.append(mem)

        memories = [*important_memories, *related_memories]
        if not memories:
            return memory_context, memory_used, {"important": 0, "related": 0}

        type_labels = {
            "user_config": "[配置]",
            "user_info": "[信息]",
            "personal": "[个人]",
            "user_preference": "[偏好]",
            "important_info": "[重要]",
        }

        lines = ["相关记忆："]
        current_chars = len(lines[0])
        for i, mem in enumerate(memories, 1):
            content = (mem.get("content") or "").strip()
            if not content:
                continue
            label = type_labels.get(mem.get("memory_type", ""), "")
            line = f"{i}. {label} {content}"
            if current_chars + len(line) > context_char_limit:
                lines.append("...（已省略部分记忆，避免上下文过长）")
                break
            lines.append(line)
            current_chars += len(line)
            memory_used.append({
                "id": mem.get("id"),
                "content": (content[:100] + "...") if len(content) > 100 else content,
                "similarity": mem.get("final_score", mem.get("score", mem.get("similarity", 0))),
            })

        memory_context = "\n".join(lines) + "\n"
        return memory_context, memory_used, {
            "important": len(important_memories),
            "related": len(related_memories),
        }

    async def chat(
        self,
        user_id: str,
        message: str,
        session_id: str = "default",
        use_memory: bool = True,
        fast_mode: bool = False,
        response_mode: str = "balanced",
        preferred_skill: Optional[str] = None,
        skill_strict: bool = False,
    ) -> Dict:
        """对话（非流式）"""
        try:
            self._ensure_session_skill_snapshot(session_id)
        except Exception as e:
            logger.warning(f"skills snapshot refresh failed: {e}")

        # 1. 检索相关记忆
        memory_context = ""
        memory_used = []

        if use_memory:
            memory_context, memory_used, memory_stats = await self._build_memory_context(
                user_id=user_id,
                message=message,
            )
            if memory_used:
                logger.info(
                    f"检索到 {len(memory_used)} 条记忆 (重要: {memory_stats.get('important', 0)}, "
                    f"相关: {memory_stats.get('related', 0)})"
                )

        # 2. 检测 Skill 意图并获取上下文
        skill_context = ""
        resolved_preferred = self._resolve_preferred_skill_name(preferred_skill)
        if skill_strict and preferred_skill and not resolved_preferred:
            return {
                "message": f"未找到你指定的技能：{preferred_skill}。请先在技能页确认已安装后重试。",
                "tool_calls": [],
                "memory_used": memory_used,
            }

        matched_skills = self._resolve_matched_skills(
            message,
            preferred_skill=preferred_skill,
            force_only=bool(skill_strict and resolved_preferred),
        )
        if matched_skills:
            logger.info(f"🛠️ 检测到 Skill 意图: {matched_skills}")
            skill_context = self.skill_executor.get_combined_skill_context(matched_skills)

        # 3. 检测是否需要联网搜索
        search_context = ""
        mode = (response_mode or "").strip().lower()
        if mode not in {"fast", "balanced", "deep"}:
            mode = "fast" if fast_mode else "balanced"
        base_auto_search_results = int(os.getenv("AUTO_SEARCH_NUM_RESULTS", "5"))
        auto_search_enabled = mode != "fast"
        if mode == "deep":
            auto_search_results = min(base_auto_search_results + 3, 10)
        elif mode == "fast":
            auto_search_results = min(3, base_auto_search_results)
        else:
            auto_search_results = base_auto_search_results
        if auto_search_enabled and self._should_search(message):
            search_query = self._extract_search_query(message)
            logger.info(f"🔍 检测到搜索意图，开始联网搜索 (query='{search_query}')...")
            search_response = await self.web_search.search(
                search_query,
                num_results=auto_search_results
            )
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

        # 内置工具：记忆搜索（两段式：先 search，再 get）
        tools.append({
            "name": "memory_search",
            "description": "在长期记忆中搜索相关片段。用于回忆历史偏好、决策、上下文。返回摘要列表，不返回完整正文。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索查询词"
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "返回条数，默认5",
                        "default": 5
                    },
                    "memory_type": {
                        "type": "string",
                        "description": "记忆类型过滤（可选）"
                    }
                },
                "required": ["query"]
            }
        })

        tools.append({
            "name": "memory_get",
            "description": "根据 memory_search 返回的 memory_id 获取完整记忆内容。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "memory_id": {
                        "type": "string",
                        "description": "记忆ID"
                    }
                },
                "required": ["memory_id"]
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

        # 内置工具：目标任务状态更新（避免用 run_command 调状态）
        if self.goal_manager:
            tools.append({
                "name": "goal_task_update",
                "description": "更新已绑定目标任务的执行状态。任务状态回写必须优先使用本工具，禁止用 run_command 改写任务状态。",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "task_id": {
                            "type": "integer",
                            "description": "任务ID（可选；若省略则默认使用当前绑定任务ID）",
                        },
                        "phase": {
                            "type": "string",
                            "description": "执行阶段",
                            "enum": ["plan", "do", "verify"],
                        },
                        "status": {
                            "type": "string",
                            "description": "执行状态",
                            "enum": ["idle", "active", "blocked", "done"],
                        },
                        "note": {
                            "type": "string",
                            "description": "执行备注（可选）",
                        },
                        "prompt": {
                            "type": "string",
                            "description": "最后一次执行提示词（可选）",
                        },
                        "review_decision": {
                            "type": "string",
                            "description": "验收结果（可选）：accept / reject / pending",
                        },
                        "review_reason": {
                            "type": "string",
                            "description": "验收说明（可选）",
                        },
                    },
                    "required": ["phase", "status"],
                }
            })

        # Desktop tools (executed via frontend Tauri bridge)
        tools.append({
            "name": "get_platform_info",
            "description": "获取用户电脑系统平台信息（windows/macos/linux 和架构）。低风险。适合在自动化前判断系统差异。",
            "input_schema": {
                "type": "object",
                "properties": {},
                "required": []
            }
        })

        tools.append({
            "name": "open_application",
            "description": "打开本机应用（跨平台：Windows/macOS/Linux）。例如 Notepad、Calculator、TextEdit。需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "app": {
                        "type": "string",
                        "description": "应用名称或可执行路径"
                    },
                    "args": {
                        "type": "array",
                        "description": "应用启动参数（可选）",
                        "items": {"type": "string"}
                    }
                },
                "required": ["app"]
            }
        })

        tools.append({
            "name": "type_text",
            "description": "向当前前台应用输入文本。可选 target_app 先尝试激活目标应用。需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "要输入的文本内容"
                    },
                    "target_app": {
                        "type": "string",
                        "description": "目标应用名称（可选）"
                    }
                },
                "required": ["text"]
            }
        })

        tools.append({
            "name": "press_hotkey",
            "description": "向前台应用发送快捷键组合（例如 Ctrl+S / Cmd+V）。可选 target_app 先激活。需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "keys": {
                        "type": "array",
                        "description": "快捷键数组，如 ['ctrl','s'] 或 ['cmd','v']",
                        "items": {"type": "string"}
                    },
                    "target_app": {
                        "type": "string",
                        "description": "目标应用名称（可选）"
                    }
                },
                "required": ["keys"]
            }
        })

        tools.append({
            "name": "send_desktop_message",
            "description": "通过桌面IM发送消息（确定性流程）：支持 feishu/wecom/dingtalk，自动打开应用、搜索联系人并发送消息。优先用于“给某人发消息”场景。需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "channel": {
                        "type": "string",
                        "description": "消息通道：feishu | wecom | dingtalk"
                    },
                    "recipient": {
                        "type": "string",
                        "description": "联系人名称"
                    },
                    "content": {
                        "type": "string",
                        "description": "消息正文"
                    }
                },
                "required": ["channel", "recipient", "content"]
            }
        })

        tools.append({
            "name": "send_feishu_message",
            "description": "通过飞书发送消息（确定性流程）：自动打开飞书、搜索联系人并发送消息。优先用于“给某人发消息”场景。需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "recipient": {
                        "type": "string",
                        "description": "联系人名称"
                    },
                    "content": {
                        "type": "string",
                        "description": "消息正文"
                    }
                },
                "required": ["recipient", "content"]
            }
        })

        tools.append({
            "name": "capture_screen",
            "description": "截取当前屏幕并返回图片路径。用于后续视觉分析。需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "save_to": {
                        "type": "string",
                        "description": "截图保存路径（可选，建议 .png）",
                    }
                },
                "required": []
            }
        })

        tools.append({
            "name": "mouse_move",
            "description": "将鼠标移动到指定屏幕坐标。高风险，需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "x": {
                        "type": "integer",
                        "description": "横坐标像素"
                    },
                    "y": {
                        "type": "integer",
                        "description": "纵坐标像素"
                    }
                },
                "required": ["x", "y"]
            }
        })

        tools.append({
            "name": "mouse_click",
            "description": "在屏幕坐标执行鼠标点击（left/right/middle）。高风险，需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "x": {
                        "type": "integer",
                        "description": "横坐标像素"
                    },
                    "y": {
                        "type": "integer",
                        "description": "纵坐标像素"
                    },
                    "button": {
                        "type": "string",
                        "description": "left/right/middle，默认 left"
                    }
                },
                "required": ["x", "y"]
            }
        })

        tools.append({
            "name": "mouse_scroll",
            "description": "在当前鼠标位置执行滚轮滚动。正数向上，负数向下。高风险，需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "amount": {
                        "type": "integer",
                        "description": "滚动量（建议 1-10）"
                    }
                },
                "required": ["amount"]
            }
        })

        tools.append({
            "name": "analyze_screen",
            "description": "用 MiniMax 视觉模型分析截图并给出可执行建议。建议先 capture_screen 再调用。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "image_path": {
                        "type": "string",
                        "description": "截图文件绝对路径（png/jpg）"
                    },
                    "question": {
                        "type": "string",
                        "description": "想让视觉模型回答的问题，例如“下一步应该点哪里”"
                    }
                },
                "required": ["image_path", "question"]
            }
        })

        tools.append({
            "name": "visual_next_action",
            "description": "基于截图与目标，输出下一步桌面操作建议（结构化 JSON）。建议先 capture_screen 再调用。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "image_path": {
                        "type": "string",
                        "description": "截图文件绝对路径（png/jpg）"
                    },
                    "goal": {
                        "type": "string",
                        "description": "当前步骤目标，例如“点击发送按钮并提交”"
                    },
                    "history": {
                        "type": "string",
                        "description": "可选：上一轮尝试与失败信息"
                    }
                },
                "required": ["image_path", "goal"]
            }
        })

        tools.append({
            "name": "run_command",
            "description": "在用户电脑上执行终端命令。适合查看信息、运行脚本、安装依赖等。不要用它删除文件/目录，删除请改用 delete_file。需要用户授权。",
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

        tools.append({
            "name": "get_file_info",
            "description": "获取用户电脑上文件或目录的元信息（是否存在、大小、更新时间等）。需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "文件或目录的绝对路径"
                    }
                },
                "required": ["path"]
            }
        })

        tools.append({
            "name": "delete_file",
            "description": "删除用户电脑上的文件或目录。删除目录时可设置 recursive=true。高风险操作，需要用户授权。",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要删除的文件或目录绝对路径"
                    },
                    "recursive": {
                        "type": "boolean",
                        "description": "删除目录时是否递归删除（默认 false）",
                        "default": False
                    }
                },
                "required": ["path"]
            }
        })

        return tools

    async def _execute_tool(
        self,
        user_id: str,
        tool_name: str,
        tool_input: Dict,
        bound_goal_task_id: Optional[int] = None,
    ) -> Dict:
        """执行工具调用 - 自动路由到对应 Skill"""
        logger.info(f"🔧 执行工具: {tool_name}")

        if tool_name == "run_command":
            command = str((tool_input or {}).get("command") or "")
            translated = self._try_translate_task_updater_command(command)
            if translated:
                logger.info("↪️ 检测到任务状态更新脚本命令，已改走 goal_task_update 内置工具")
                return await self._execute_goal_task_update(translated, bound_goal_task_id)

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

        # 内置工具：视觉分析（MiniMax）
        if tool_name == "analyze_screen":
            return await self._execute_analyze_screen(tool_input)
        if tool_name == "visual_next_action":
            return await self._execute_visual_next_action(tool_input)

        # 内置工具：保存记忆
        if tool_name == "save_memory":
            return await self._execute_save_memory(user_id, tool_input)

        # 内置工具：记忆检索（两段式）
        if tool_name == "memory_search":
            return await self._execute_memory_search(user_id, tool_input)
        if tool_name == "memory_get":
            return await self._execute_memory_get(user_id, tool_input)

        # 内置工具：目标任务状态更新（优先走后端直连，避免 run_command）
        if tool_name == "goal_task_update":
            return await self._execute_goal_task_update(tool_input, bound_goal_task_id)

        # 内置工具：搜索社区技能（find_skills 或 find-skills 均路由到此）
        if tool_name in ("find_skills", "find-skills") and self.skill_installer:
            query = tool_input.get("query", "")
            skills = await self.skill_installer.search_skills(query)
            return {
                "success": True,
                "message": f"找到 {len(skills)} 个相关技能",
                "data": {"skills": skills}
            }

        # MCP 工具：支持 mcp__server__tool 与 mcp_server__tool 两种命名
        if tool_name.startswith("mcp__") or tool_name.startswith("mcp_"):
            return await self._execute_mcp_tool(tool_name, tool_input)

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

    async def _execute_tool_with_policy(
        self,
        user_id: str,
        tool_name: str,
        tool_input: Dict,
        bound_goal_task_id: Optional[int] = None,
    ) -> Dict:
        """
        Execute tool with Claude-like policy:
        - skill tools: allow one transient retry
        - skill tools: attach fallback hint on failure
        """
        max_attempts = self.skill_tool_retry_max if self._is_skill_tool(tool_name) else 1
        attempt = 0
        result: Dict = {"success": False, "error": "unknown"}

        while attempt < max_attempts:
            attempt += 1
            result = await self._execute_tool(
                user_id=user_id,
                tool_name=tool_name,
                tool_input=tool_input,
                bound_goal_task_id=bound_goal_task_id,
            )
            if result.get("success"):
                if attempt > 1:
                    result.setdefault("data", {})
                    if isinstance(result["data"], dict):
                        result["data"]["policy_retry_used"] = attempt - 1
                return result

            if not self._is_skill_tool(tool_name):
                break
            if attempt >= max_attempts:
                break
            if not is_transient_tool_error(result):
                break

            logger.warning(
                f"🔁 技能工具重试: {tool_name} (attempt {attempt + 1}/{max_attempts})"
            )
            await asyncio.sleep(0.2 * attempt)

        if self._is_skill_tool(tool_name) and not result.get("success", False):
            result.setdefault("data", {})
            if isinstance(result["data"], dict):
                result["data"].setdefault("fallback_hint", self._skill_fallback_hint(tool_name))
                if attempt > 1:
                    result["data"]["policy_retry_used"] = attempt - 1
            result["message"] = result.get("message") or self._skill_fallback_hint(tool_name)

        return result

    @staticmethod
    def _normalize_mcp_tool_name(tool_name: str) -> str:
        """Normalize MCP tool names to mcp__server__tool style when possible."""
        if tool_name.startswith("mcp__"):
            return tool_name
        # Example: mcp_openaiDeveloperDocs__search_openai_docs -> mcp__openaiDeveloperDocs__search_openai_docs
        if tool_name.startswith("mcp_"):
            rest = tool_name[4:]
            if "__" in rest:
                return f"mcp__{rest}"
        return tool_name

    async def _execute_mcp_tool(self, tool_name: str, tool_input: Dict) -> Dict:
        """Execute MCP tool via optional bridge runtime with clear diagnostics."""
        normalized_name = self._normalize_mcp_tool_name(tool_name)
        mcp_enabled = os.getenv("MCP_RUNTIME_ENABLED", "0") == "1"
        bridge_url = os.getenv("MCP_BRIDGE_URL", "").strip()

        if not mcp_enabled:
            guidance = (
                "MCP 工具运行时未启用。请配置 MCP 运行时后重试。"
                "若你在使用 openai-docs，先执行："
                "`codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp`。"
            )
            return {
                "success": False,
                "error": "MCP runtime is not configured",
                "message": guidance,
                "data": {
                    "tool": normalized_name,
                    "runtime": "missing",
                    "hint": "Set MCP_RUNTIME_ENABLED=1 and MCP_BRIDGE_URL=<your bridge endpoint>"
                }
            }

        if not bridge_url:
            host = os.getenv("HOST", "127.0.0.1")
            port = int(os.getenv("PORT", 7860))
            bridge_url = f"http://{host}:{port}/mcp/execute"

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    bridge_url,
                    json={
                        "tool_name": normalized_name,
                        "tool_input": tool_input or {},
                    },
                )

            if resp.status_code >= 400:
                return {
                    "success": False,
                    "error": f"MCP bridge returned HTTP {resp.status_code}",
                    "message": "MCP 桥接服务请求失败",
                    "data": {"tool": normalized_name, "response": resp.text[:500]}
                }

            result = resp.json()
            if not isinstance(result, dict):
                return {
                    "success": False,
                    "error": "Invalid MCP bridge response",
                    "message": "MCP 桥接服务返回了非 JSON 对象",
                    "data": {"tool": normalized_name}
                }
            # Expect a tool-like result format: {"success": bool, ...}
            if "success" not in result:
                result["success"] = True
            return result
        except Exception as e:
            logger.error(f"MCP 工具执行失败: {tool_name} -> {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "message": "MCP 工具执行异常，请检查桥接服务是否可用",
                "data": {"tool": normalized_name, "runtime": "error"}
            }

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

    @staticmethod
    def _prepare_vision_image_payload(image_path: str) -> tuple[Path, str, str]:
        file_path = Path(str(image_path or "").strip())
        if not file_path.exists() or not file_path.is_file():
            raise FileNotFoundError(f"截图不存在: {image_path}")

        mime_type = mimetypes.guess_type(str(file_path))[0] or "image/png"
        if not mime_type.startswith("image/"):
            raise ValueError(f"不支持的图片类型: {mime_type}")

        max_bytes = int(os.getenv("VISION_MAX_IMAGE_BYTES", str(8 * 1024 * 1024)))
        size = file_path.stat().st_size
        if size > max_bytes:
            raise ValueError(f"图片过大: {size} bytes，超过限制 {max_bytes} bytes")

        image_b64 = base64.b64encode(file_path.read_bytes()).decode("utf-8")
        return file_path, mime_type, image_b64

    async def _execute_analyze_screen(self, params: Dict) -> Dict:
        """内置工具：调用 MiniMax 视觉模型分析截图。"""
        image_path = str((params.get("image_path") or "")).strip()
        question = str((params.get("question") or "")).strip()
        if not image_path:
            return {"success": False, "error": "image_path 不能为空"}
        if not question:
            return {"success": False, "error": "question 不能为空"}

        try:
            file_path, mime_type, image_b64 = self._prepare_vision_image_payload(image_path)
            vision_model = os.getenv("VISION_MODEL_NAME", self.model)
            vision_max_tokens = int(os.getenv("VISION_MAX_TOKENS", "1024"))

            response = await self.async_client.messages.create(
                model=vision_model,
                max_tokens=vision_max_tokens,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": question},
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": mime_type,
                                    "data": image_b64,
                                },
                            },
                        ],
                    }
                ],
            )

            answer_parts = []
            for block in getattr(response, "content", []) or []:
                if hasattr(block, "type") and block.type == "text":
                    answer_parts.append(getattr(block, "text", ""))
            answer = "\n".join([part for part in answer_parts if part]).strip()
            if not answer:
                answer = "视觉模型未返回可读文本。"

            return {
                "success": True,
                "message": "视觉分析完成",
                "data": {
                    "image_path": str(file_path),
                    "model": vision_model,
                    "answer": answer,
                },
            }
        except Exception as e:
            logger.error(f"视觉分析失败: {e}")
            return {"success": False, "error": f"视觉分析失败: {e}"}

    async def _execute_visual_next_action(self, params: Dict) -> Dict:
        """内置工具：视觉下一步动作规划（结构化 JSON）。"""
        image_path = str((params.get("image_path") or "")).strip()
        goal = str((params.get("goal") or "")).strip()
        history = str((params.get("history") or "")).strip()
        if not image_path:
            return {"success": False, "error": "image_path 不能为空"}
        if not goal:
            return {"success": False, "error": "goal 不能为空"}

        try:
            file_path, mime_type, image_b64 = self._prepare_vision_image_payload(image_path)
            vision_model = os.getenv("VISION_MODEL_NAME", self.model)
            vision_max_tokens = int(os.getenv("VISION_MAX_TOKENS", "1024"))
            instruction = (
                "你是桌面自动化视觉规划器。"
                "请根据截图和目标，只输出一个 JSON 对象，不要输出其他文本。"
                "JSON 字段：action, x, y, button, text, hotkey, reason, confidence。"
                "action 取值仅允许：click, type, hotkey, scroll, wait, done。"
                "若无法确定坐标，x/y 设为 null，并在 reason 解释。"
            )
            user_text = f"目标: {goal}\n历史: {history or '(无)'}"

            response = await self.async_client.messages.create(
                model=vision_model,
                max_tokens=vision_max_tokens,
                system=instruction,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": user_text},
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": mime_type,
                                    "data": image_b64,
                                },
                            },
                        ],
                    }
                ],
            )
            text_blocks = []
            for block in getattr(response, "content", []) or []:
                if getattr(block, "type", "") == "text":
                    text_blocks.append(getattr(block, "text", ""))
            raw_text = "\n".join([t for t in text_blocks if t]).strip()
            if not raw_text:
                return {"success": False, "error": "视觉规划未返回文本"}

            parsed = None
            try:
                parsed = json.loads(raw_text)
            except Exception:
                match = re.search(r"\{[\s\S]*\}", raw_text)
                if match:
                    parsed = json.loads(match.group(0))
            if not isinstance(parsed, dict):
                return {"success": False, "error": f"视觉规划返回非JSON: {raw_text[:280]}"}

            return {
                "success": True,
                "message": "视觉动作规划完成",
                "data": {
                    "image_path": str(file_path),
                    "model": vision_model,
                    "plan": parsed,
                    "raw": raw_text[:800],
                },
            }
        except Exception as e:
            logger.error(f"视觉动作规划失败: {e}")
            return {"success": False, "error": f"视觉动作规划失败: {e}"}

    async def vision_next_action(self, image_path: str, goal: str, history: str = "") -> Dict:
        """Public wrapper for visual next-action planning."""
        return await self._execute_visual_next_action(
            {
                "image_path": image_path,
                "goal": goal,
                "history": history,
            }
        )

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

    async def _execute_memory_search(self, user_id: str, params: Dict) -> Dict:
        """内置工具：两段式记忆检索（search）"""
        query = (params.get("query") or "").strip()
        if not query:
            return {"success": False, "error": "query 不能为空"}
        top_k = int(params.get("top_k") or 5)
        memory_type = params.get("memory_type")
        try:
            snippets = await self.memory_manager.search_memory_snippets(
                user_id=user_id,
                query=query,
                top_k=max(1, min(top_k, 20)),
                memory_type=memory_type,
                use_hybrid=True,
            )
            return {
                "success": True,
                "message": f"找到 {len(snippets)} 条相关记忆片段",
                "data": {"snippets": snippets}
            }
        except Exception as e:
            logger.error(f"memory_search 执行失败: {e}")
            return {"success": False, "error": str(e)}

    async def _execute_memory_get(self, user_id: str, params: Dict) -> Dict:
        """内置工具：两段式记忆检索（get）"""
        memory_id = (params.get("memory_id") or "").strip()
        if not memory_id:
            return {"success": False, "error": "memory_id 不能为空"}
        try:
            memory = await self.memory_manager.get_memory_detail(user_id=user_id, memory_id=memory_id)
            if not memory:
                return {"success": False, "error": "memory_not_found"}
            return {
                "success": True,
                "message": "获取记忆成功",
                "data": {"memory": memory}
            }
        except Exception as e:
            logger.error(f"memory_get 执行失败: {e}")
            return {"success": False, "error": str(e)}

    async def _execute_goal_task_update(self, params: Dict, bound_goal_task_id: Optional[int]) -> Dict:
        """内置工具：更新目标任务执行状态（后端直连）。"""
        if not self.goal_manager:
            return {"success": False, "error": "goal_manager_unavailable"}
        try:
            raw_task_id = params.get("task_id")
            task_id = int(raw_task_id) if raw_task_id is not None else int(bound_goal_task_id or 0)
            if task_id <= 0:
                return {
                    "success": False,
                    "error": "task_id_missing",
                    "message": "未提供任务ID，且当前会话没有绑定任务。",
                }

            phase = str(params.get("phase") or "").strip().lower()
            status = str(params.get("status") or "").strip().lower()
            phase = {"planning": "plan", "doing": "do", "verification": "verify"}.get(phase, phase)
            status = {"completed": "done", "complete": "done", "in_progress": "active"}.get(status, status)
            note = str(params.get("note") or "").strip()
            prompt = str(params.get("prompt") or "").strip()

            state = self.goal_manager.update_execution_phase(
                task_id=task_id,
                phase=phase,
                status=status,
                note=note,
                prompt=prompt,
            )
            if not state:
                return {
                    "success": False,
                    "error": "update_execution_phase_failed",
                    "message": "执行阶段更新失败，请检查 phase/status 是否合法或任务是否存在。",
                }

            # 可选：同步验收状态
            review_raw = str(params.get("review_decision") or "").strip().lower()
            review_reason = str(params.get("review_reason") or "").strip()
            review_result = None
            if review_raw:
                if review_raw in {"accept", "approved", "approve"}:
                    review_result = self.goal_manager.review_task(
                        task_id=task_id,
                        decision="accept",
                        reason=review_reason,
                        reviewed_by="agent",
                    )
                elif review_raw in {"reject", "rejected"}:
                    review_result = self.goal_manager.review_task(
                        task_id=task_id,
                        decision="reject",
                        reason=review_reason,
                        reviewed_by="agent",
                    )
                elif review_raw in {"pending", "none"}:
                    review_result = True
                else:
                    review_result = False

            data = {
                "task_id": task_id,
                "phase": state.get("phase"),
                "status": state.get("status"),
                "note": state.get("note"),
                "last_prompt": state.get("last_prompt"),
                "updated_at": state.get("updated_at"),
            }
            if review_result is not None:
                data["review_updated"] = bool(review_result)
                data["review_decision"] = review_raw

            return {
                "success": True,
                "message": f"任务 #{task_id} 执行状态已更新",
                "data": data,
            }
        except Exception as e:
            logger.error(f"goal_task_update 执行失败: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @staticmethod
    def _try_translate_task_updater_command(command: str) -> Optional[Dict]:
        """Translate legacy cks_task_updater script command into goal_task_update params."""
        raw = (command or "").strip()
        if not raw:
            return None
        if "task_updater.py" not in raw and "cks_task_updater.py" not in raw:
            return None

        def pick(name: str) -> Optional[str]:
            pattern = rf"--{name}\s+((?:\"[^\"]*\")|(?:'[^']*')|(?:\S+))"
            m = re.search(pattern, raw)
            if not m:
                return None
            value = m.group(1).strip().strip('"').strip("'")
            return value

        mapped = {
            "task_id": pick("task_id"),
            "phase": pick("execution_phase"),
            "status": pick("execution_state"),
            "note": pick("execution_note"),
            "prompt": pick("execution_prompt"),
            "review_decision": pick("review_status"),
            "review_reason": pick("review_note"),
        }

        if not mapped["phase"] or not mapped["status"]:
            return None
        if mapped["task_id"] is not None:
            try:
                mapped["task_id"] = int(str(mapped["task_id"]))
            except Exception:
                mapped["task_id"] = None

        if mapped["review_decision"]:
            review = str(mapped["review_decision"]).strip().lower()
            mapped["review_decision"] = {
                "approved": "accept",
                "approve": "accept",
                "accepted": "accept",
                "rejected": "reject",
            }.get(review, review)

        return {k: v for k, v in mapped.items() if v not in (None, "")}

    async def chat_stream(
        self,
        user_id: str,
        message: str,
        session_id: str = "default",
        use_memory: bool = True,
        fast_mode: bool = False,
        response_mode: str = "balanced",
        goal_task_id: Optional[int] = None,
        preferred_skill: Optional[str] = None,
        skill_strict: bool = False,
    ) -> AsyncGenerator[str, None]:
        """对话（流式，支持 Tool Use）"""
        mode = (response_mode or "").strip().lower()
        if mode not in {"fast", "balanced", "deep"}:
            mode = "fast" if fast_mode else "balanced"

        # 0) Skills snapshot refresh (session-scoped)
        try:
            snapshot_state = self._ensure_session_skill_snapshot(session_id)
            snapshot = snapshot_state.get("snapshot") or {}
            yield json.dumps({
                "type": "skills_snapshot",
                "version": snapshot.get("version"),
                "skills_count": len(snapshot.get("skills", [])),
                "changed": snapshot_state.get("changed", False),
                "fast_mode": mode == "fast",
                "response_mode": mode,
            })
        except Exception as e:
            logger.warning(f"skills snapshot refresh failed: {e}")

        # 1. 检索相关记忆
        memory_context = ""
        memory_used = []

        if use_memory:
            memory_context, memory_used, memory_stats = await self._build_memory_context(
                user_id=user_id,
                message=message,
            )
            if memory_used:
                logger.info(
                    f"检索到 {len(memory_used)} 条记忆 (重要: {memory_stats.get('important', 0)}, "
                    f"相关: {memory_stats.get('related', 0)})"
                )

                yield json.dumps({
                    "type": "memory",
                    "memories": memory_used
                })

        # 2. 检测 Skill 意图并获取上下文
        skill_context = ""
        resolved_preferred = self._resolve_preferred_skill_name(preferred_skill)
        if skill_strict and preferred_skill and not resolved_preferred:
            yield json.dumps({
                "type": "skill_policy",
                "success": False,
                "message": f"未找到你指定的技能：{preferred_skill}。请先在技能页确认已安装后重试。",
            })
            yield json.dumps({
                "type": "text",
                "content": f"未找到你指定的技能：{preferred_skill}。请先在技能页确认已安装后重试。"
            })
            yield json.dumps({"type": "done"})
            return

        matched_skills = self._resolve_matched_skills(
            message,
            preferred_skill=preferred_skill,
            force_only=bool(skill_strict and resolved_preferred),
        )
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

        desktop_message_intent = self._extract_desktop_message_intent(message)
        if desktop_message_intent:
            logger.info(
                "📨 检测到桌面IM发送意图: channel=%s, recipient=%s",
                desktop_message_intent.get("channel", ""),
                desktop_message_intent.get("recipient", ""),
            )
            yield json.dumps({
                "type": "tool_hint",
                "tool": "send_desktop_message",
                "message": (
                    f"已识别{desktop_message_intent.get('channel', 'desktop')}消息任务，"
                    f"将优先使用 send_desktop_message（联系人：{desktop_message_intent.get('recipient', '')}），并在发送后自动截图核验结果"
                ),
                "data": desktop_message_intent,
            })

        # 3. 检测是否需要联网搜索
        search_context = ""
        base_auto_search_results = int(os.getenv("AUTO_SEARCH_NUM_RESULTS", "5"))
        auto_search_enabled = mode != "fast"
        if mode == "deep":
            auto_search_results = min(base_auto_search_results + 3, 10)
        elif mode == "fast":
            auto_search_results = min(3, base_auto_search_results)
        else:
            auto_search_results = base_auto_search_results
        if auto_search_enabled and self._should_search(message):
            # 提取精简搜索关键词（去掉动作指令部分）
            search_query = self._extract_search_query(message)
            logger.info(f"🔍 检测到搜索意图，开始联网搜索 (query='{search_query}')...")

            yield json.dumps({
                "type": "search_start",
                "query": search_query
            })

            search_response = await self.web_search.search(
                search_query,
                num_results=auto_search_results
            )
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

        # 4.5 预压缩记忆刷新（参考 OpenClaw：接近压缩阈值时先沉淀记忆）
        try:
            estimated_chars = self._estimate_session_chars(session_messages, message)
            soft_threshold = max(2000, self.memory_flush_soft_chars)
            current_cycle = estimated_chars // soft_threshold
            last_cycle = self.session_memory_flush_state.get(session_id, -1)
            if estimated_chars >= soft_threshold and current_cycle > last_cycle:
                self.session_memory_flush_state[session_id] = current_cycle
                yield json.dumps({
                    "type": "memory_flush_start",
                    "estimated_chars": estimated_chars,
                    "threshold": soft_threshold,
                })
                flush_result = await self._run_pre_compaction_memory_flush(
                    user_id=user_id,
                    session_id=session_id,
                    session_messages=session_messages,
                    user_message=message,
                    estimated_chars=estimated_chars,
                )
                yield json.dumps({
                    "type": "memory_flush_done",
                    "saved_count": flush_result.get("saved_count", 0),
                    "estimated_chars": estimated_chars,
                })
        except Exception as e:
            logger.warning(f"pre-compaction memory flush failed: {e}")
            yield json.dumps({
                "type": "memory_flush_error",
                "error": str(e),
            })

        # 5. 调用 API（支持 Tool Use）
        assistant_message = ""
        system_prompt = await self._get_system_prompt(user_id, memory_context, skill_context, search_context)
        if desktop_message_intent:
            system_prompt += (
                "\n\n## 📮 桌面IM发送任务（强约束）\n"
                f"用户本轮意图：通过「{desktop_message_intent.get('channel', '')}」给「{desktop_message_intent.get('recipient', '')}」发送消息，内容「{desktop_message_intent.get('content', '')}」。\n"
                "你必须优先调用 `send_desktop_message`，不要拆分成 open_application/type_text/press_hotkey 多步组合。\n"
                "发送动作之后必须调用 `capture_screen` 与 `analyze_screen` 核验是否进入目标会话且消息已发送；"
                "若核验不通过，继续执行修复步骤后再汇报。"
            )

        try:
            force_desktop_message_direct = os.getenv("FORCE_DESKTOP_MESSAGE_DIRECT", "1").strip().lower() in {"1", "true", "yes", "on"}
            if desktop_message_intent and force_desktop_message_direct:
                channel = str(desktop_message_intent.get("channel") or "feishu").strip()
                recipient = str(desktop_message_intent.get("recipient") or "").strip()
                content = str(desktop_message_intent.get("content") or "").strip()

                # Step 1: deterministic desktop send tool
                send_input = {"channel": channel, "recipient": recipient, "content": content}
                send_start = time.time()
                yield json.dumps({"type": "tool_start", "tool": "send_desktop_message", "input": send_input})
                send_result = await self._execute_tool_with_policy(
                    user_id=user_id,
                    tool_name="send_desktop_message",
                    tool_input=send_input,
                    bound_goal_task_id=goal_task_id,
                )
                send_success = False
                send_message = ""
                if send_result.get("_desktop_tool"):
                    request_id = str(uuid4())
                    yield json.dumps({
                        "type": "desktop_tool_request",
                        "request_id": request_id,
                        "tool": "send_desktop_message",
                        "input": send_input,
                    })
                    desktop_send = await self._wait_for_desktop_result(request_id, timeout=120)
                    send_success = bool(desktop_send.get("success"))
                    send_message = desktop_send.get("content") or desktop_send.get("error", "")
                    yield json.dumps({
                        "type": "tool_result",
                        "tool": "send_desktop_message",
                        "success": send_success,
                        "message": send_message,
                        "data": desktop_send,
                    })
                else:
                    send_success = bool(send_result.get("success"))
                    send_message = send_result.get("message") or send_result.get("error", "")
                    yield json.dumps({
                        "type": "tool_result",
                        "tool": "send_desktop_message",
                        "success": send_success,
                        "message": send_message,
                        "data": send_result,
                    })
                logger.info(f"⏱️ 强制工具 send_desktop_message: {time.time()-send_start:.1f}s ({'✅' if send_success else '❌'})")

                # Step 2: screenshot + vision verification
                verify_text = "未执行核验。"
                verify_ok = False
                screenshot_path = ""
                if send_success:
                    cap_start = time.time()
                    cap_input = {}
                    yield json.dumps({"type": "tool_start", "tool": "capture_screen", "input": cap_input})
                    cap_result = await self._execute_tool_with_policy(
                        user_id=user_id,
                        tool_name="capture_screen",
                        tool_input=cap_input,
                        bound_goal_task_id=goal_task_id,
                    )
                    cap_success = False
                    if cap_result.get("_desktop_tool"):
                        cap_req = str(uuid4())
                        yield json.dumps({
                            "type": "desktop_tool_request",
                            "request_id": cap_req,
                            "tool": "capture_screen",
                            "input": cap_input,
                        })
                        desktop_cap = await self._wait_for_desktop_result(cap_req, timeout=120)
                        cap_success = bool(desktop_cap.get("success"))
                        cap_content = desktop_cap.get("content") or ""
                        try:
                            cap_data = json.loads(cap_content) if cap_content else {}
                            screenshot_path = str(cap_data.get("path") or "")
                        except Exception:
                            screenshot_path = ""
                        yield json.dumps({
                            "type": "tool_result",
                            "tool": "capture_screen",
                            "success": cap_success,
                            "message": desktop_cap.get("content") or desktop_cap.get("error", ""),
                            "data": desktop_cap,
                        })
                    else:
                        cap_success = bool(cap_result.get("success"))
                    logger.info(f"⏱️ 强制工具 capture_screen: {time.time()-cap_start:.1f}s ({'✅' if cap_success else '❌'})")

                    if cap_success and screenshot_path:
                        question = (
                            f"请判断当前桌面IM界面是否已向『{recipient}』发送消息『{content}』。"
                            "只需给结论：已发送/未确认，并简述依据。"
                        )
                        analyze_input = {"image_path": screenshot_path, "question": question}
                        yield json.dumps({"type": "tool_start", "tool": "analyze_screen", "input": analyze_input})
                        analyze_result = await self._execute_tool_with_policy(
                            user_id=user_id,
                            tool_name="analyze_screen",
                            tool_input=analyze_input,
                            bound_goal_task_id=goal_task_id,
                        )
                        verify_ok = bool(analyze_result.get("success"))
                        verify_answer = ""
                        if verify_ok:
                            verify_answer = str((analyze_result.get("data") or {}).get("answer") or "")
                        verify_text = verify_answer or analyze_result.get("message") or analyze_result.get("error", "核验失败")
                        if verify_ok:
                            verify_ok = self._is_delivery_verified(verify_text)
                        yield json.dumps({
                            "type": "tool_result",
                            "tool": "analyze_screen",
                            "success": verify_ok,
                            "message": verify_text,
                            "data": analyze_result.get("data") or {},
                        })
                    else:
                        verify_text = "截图核验失败，未拿到有效截图路径。"
                else:
                    verify_text = f"发送工具执行失败：{send_message or '未知错误'}"

                assistant_message = (
                    f"已执行桌面消息发送流程（通道：{channel}，联系人：{recipient}）。\n"
                    f"发送执行：{'成功' if send_success else '失败'}。\n"
                    f"视觉核验：{'已完成' if verify_ok else '未确认'}。\n"
                    f"核验说明：{verify_text}\n"
                    f"核验截图：{screenshot_path or '无'}"
                )
                yield json.dumps({"type": "text", "content": assistant_message})
                yield json.dumps({"type": "done"})
            elif use_tools:
                # 使用非流式 API 处理工具调用
                async for chunk in self._chat_with_tools(
                    user_id,
                    session_messages,
                    system_prompt,
                    session_id=session_id,
                    goal_task_id=goal_task_id,
                    fast_mode=(mode == "fast"),
                    response_mode=mode,
                ):
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

    async def _chat_with_tools(
        self,
        user_id: str,
        messages: List[Dict],
        system_prompt: str,
        session_id: str = "default",
        goal_task_id: Optional[int] = None,
        fast_mode: bool = False,
        response_mode: str = "balanced",
    ) -> AsyncGenerator[str, None]:
        """带工具的对话（非流式处理工具调用，流式输出文本）"""
        import time
        task_start = time.time()

        tools = self._get_tools()
        current_messages = messages[-20:]
        mode = (response_mode or "").strip().lower()
        if mode not in {"fast", "balanced", "deep"}:
            mode = "fast" if fast_mode else "balanced"

        max_iterations = int(os.getenv("MAX_TOOL_ITERATIONS", "16"))  # 最大工具调用轮数
        if mode == "fast":
            max_iterations = min(max_iterations, 10)
        elif mode == "deep":
            max_iterations = min(max_iterations + 4, 24)
        max_same_tool_repeats = max(1, int(os.getenv("MAX_SAME_TOOL_REPEATS", "2")))
        if mode == "fast":
            max_same_tool_repeats = 1
        elif mode == "deep":
            max_same_tool_repeats = max(max_same_tool_repeats, 3)
        max_repetition_guard_triggers = max(1, int(os.getenv("MAX_REPETITION_GUARD_TRIGGERS", "1")))
        max_web_search_calls = max(1, int(os.getenv("MAX_WEB_SEARCH_CALLS_PER_TASK", "2")))
        if mode == "fast":
            max_web_search_calls = 1
        elif mode == "deep":
            max_web_search_calls = max_web_search_calls + 1
        last_tool_signature = None
        same_tool_repeat_count = 0
        repetition_guard_triggers = 0
        web_search_calls = 0

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
                iteration_guard_triggered = False
                for tool_block in tool_use_blocks:
                    tool_name = tool_block.name
                    tool_input = tool_block.input
                    tool_id = tool_block.id
                    tool_signature = make_tool_signature(tool_name, tool_input)

                    last_tool_signature, same_tool_repeat_count = update_repetition_state(
                        last_tool_signature,
                        same_tool_repeat_count,
                        tool_signature,
                    )

                    if same_tool_repeat_count > max_same_tool_repeats:
                        repetition_guard_triggers += 1
                        iteration_guard_triggered = True
                        guard_error = (
                            f"检测到工具 `{tool_name}` 使用相同参数被连续调用 "
                            f"{same_tool_repeat_count} 次，已触发熔断保护。"
                        )
                        logger.warning(f"🛑 {guard_error}")

                        yield json.dumps({
                            "type": "tool_result",
                            "tool": tool_name,
                            "success": False,
                            "message": guard_error,
                            "data": {"error": guard_error, "repetition_guard": True}
                        })
                        if self.audit_logger:
                            self.audit_logger.log_error(
                                user_id=user_id,
                                session_id=session_id,
                                tool_name=tool_name,
                                tool_input=tool_input,
                                error=guard_error,
                                duration_ms=0,
                            )

                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": json.dumps({
                                "success": False,
                                "error": guard_error,
                                "repetition_guard": True
                            })
                        })
                        continue

                    if tool_name == "web_search" and web_search_calls >= max_web_search_calls:
                        guard_error = (
                            f"联网搜索预算已用尽（最多 {max_web_search_calls} 次），"
                            "请基于已有结果继续整理答案。"
                        )
                        logger.warning(f"🛑 {guard_error}")
                        yield json.dumps({
                            "type": "tool_result",
                            "tool": tool_name,
                            "success": False,
                            "message": guard_error,
                            "data": {"error": guard_error, "budget_guard": True}
                        })
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": json.dumps({
                                "success": False,
                                "error": guard_error,
                                "budget_guard": True
                            })
                        })
                        continue

                    tool_start = time.time()
                    logger.info(f"🔧 调用工具: {tool_name} (输入: {json.dumps(tool_input, ensure_ascii=False)[:100]})")

                    # 通知前端正在执行工具
                    yield json.dumps({
                        "type": "tool_start",
                        "tool": tool_name,
                        "input": tool_input
                    })

                    # 执行工具
                    result = await self._execute_tool_with_policy(
                        user_id=user_id,
                        tool_name=tool_name,
                        tool_input=tool_input,
                        bound_goal_task_id=goal_task_id,
                    )
                    if tool_name == "web_search":
                        web_search_calls += 1

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
                        if self.audit_logger:
                            msg = desktop_result.get("content") or desktop_result.get("error", "")
                            self.audit_logger.log_execution(
                                user_id=user_id,
                                session_id=session_id,
                                tool_name=tool_name,
                                tool_input=tool_input,
                                success=success,
                                duration_ms=int(tool_elapsed * 1000),
                                message=msg,
                            )
                            if not success:
                                self.audit_logger.log_error(
                                    user_id=user_id,
                                    session_id=session_id,
                                    tool_name=tool_name,
                                    tool_input=tool_input,
                                    error=desktop_result.get("error", "desktop tool failed"),
                                    duration_ms=int(tool_elapsed * 1000),
                                )

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
                        if self.audit_logger:
                            msg = result.get("message") or result.get("error", "")
                            self.audit_logger.log_execution(
                                user_id=user_id,
                                session_id=session_id,
                                tool_name=tool_name,
                                tool_input=tool_input,
                                success=success,
                                duration_ms=int(tool_elapsed * 1000),
                                message=msg,
                            )
                            if not success:
                                self.audit_logger.log_error(
                                    user_id=user_id,
                                    session_id=session_id,
                                    tool_name=tool_name,
                                    tool_input=tool_input,
                                    error=result.get("error", "tool failed"),
                                    duration_ms=int(tool_elapsed * 1000),
                                )

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

                if iteration_guard_triggered and repetition_guard_triggers >= max_repetition_guard_triggers:
                    logger.warning("🛑 工具重复调用熔断触发次数过多，终止当前任务以避免死循环")
                    yield json.dumps({
                        "type": "text",
                        "content": "我检测到相同工具调用反复重试，已停止自动重试以避免死循环。"
                    })
                    yield json.dumps({"type": "done"})
                    return

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
        if session_id in self.session_skill_snapshots:
            del self.session_skill_snapshots[session_id]
            logger.info(f"清除会话: {session_id}")
