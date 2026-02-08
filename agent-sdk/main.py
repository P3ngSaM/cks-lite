"""
CKS Lite Agent SDK - Main Entry Point
基于 Claude Agent SDK 的智能代理服务
"""

import os
import sys
import re
import json
import time
import httpx
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn
import logging

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent))

from core.agent import ClaudeAgent, _desktop_results
from core.memory import MemoryManager
from core.skills_loader import SkillsLoader
from core.skill_installer import SkillInstaller
from core.web_search import WebSearchService
from core.goal_manager import GoalManager
from core.execution_approval import ExecutionApprovalStore
from core.channel_task_queue import ChannelTaskQueue
from services.feishu_adapter import FeishuAdapter
from models.request import (
    ChatRequest,
    MemoryRequest,
    SkillInstallRequest,
    SkillLocalInstallRequest,
    SkillCreateRequest,
    SkillExecuteRequest,
    MCPExecuteRequest,
    GoalKPIRequest,
    GoalOKRRequest,
    GoalProjectRequest,
    GoalTaskRequest,
    GoalTaskReviewRequest,
    GoalTaskExecutionPhaseRequest,
    GoalTaskExecutionResumeRequest,
    GoalDashboardNextTaskRequest,
    GoalTaskHandoffClaimRequest,
    ExecutionApprovalRequest,
    ExecutionApprovalDecisionRequest,
    ChannelInboundMessageRequest,
    ChannelTaskDispatchRequest,
    FeishuOutboundRequest,
    FeishuConfigUpdateRequest,
    FeishuConfigTestRequest,
    VisionNextActionRequest,
)
from models.response import ChatResponse, MemoryResponse

# 加载环境变量（override=True 确保 .env 文件优先级高于系统环境变量）
load_dotenv(override=True)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(
    title="CKS Lite Agent SDK",
    description="轻量级桌面 AI 工作台 - Agent 服务",
    version="0.1.0"
)

# CORS 配置（允许 Tauri 访问）
default_cors_origins = [
    "tauri://localhost",
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
cors_origins = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
if cors_origins:
    allow_origins = [item.strip() for item in cors_origins.split(",") if item.strip()]
else:
    allow_origins = default_cors_origins

allow_credentials = "*" not in allow_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化核心组件
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
DATA_DIR.mkdir(exist_ok=True)

memory_manager = MemoryManager(data_dir=DATA_DIR)
goal_manager = GoalManager(data_dir=DATA_DIR)
approval_store = ExecutionApprovalStore(data_dir=DATA_DIR)
channel_task_queue = ChannelTaskQueue(data_dir=DATA_DIR)
FEISHU_CONFIG_PATH = DATA_DIR / "feishu_config.json"


def _load_feishu_config() -> dict:
    config = {
        "app_id": os.getenv("FEISHU_APP_ID", ""),
        "app_secret": os.getenv("FEISHU_APP_SECRET", ""),
        "verification_token": os.getenv("FEISHU_VERIFICATION_TOKEN", ""),
        "encrypt_key": os.getenv("FEISHU_ENCRYPT_KEY", ""),
        "domain": os.getenv("FEISHU_DOMAIN", "feishu"),
        "signature_tolerance_sec": int(os.getenv("FEISHU_SIGNATURE_TOLERANCE_SEC", "300")),
        "replay_cache_size": int(os.getenv("FEISHU_REPLAY_CACHE_SIZE", "2048")),
        "auto_dispatch": os.getenv("FEISHU_AUTO_DISPATCH", "1").strip().lower() not in {"0", "false", "off"},
        "enable_approval_card": os.getenv("FEISHU_ENABLE_APPROVAL_CARD", "1").strip().lower() not in {"0", "false", "off"},
        "allowed_senders": os.getenv("FEISHU_ALLOWED_SENDERS", "").strip(),
    }
    if FEISHU_CONFIG_PATH.exists():
        try:
            data = json.loads(FEISHU_CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                config.update({k: data.get(k, v) for k, v in config.items()})
        except Exception as e:
            logger.warning(f"读取飞书配置文件失败: {e}")
    return config


def _save_feishu_config(config: dict) -> None:
    FEISHU_CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def _redact_feishu_config(config: dict) -> dict:
    data = dict(config)
    for key in ("app_secret", "verification_token", "encrypt_key"):
        value = str(data.get(key) or "")
        if not value:
            data[key] = ""
            continue
        data[key] = f"{value[:3]}***{value[-2:]}" if len(value) > 6 else "***"
    return data


def _resolve_secret_field(field_name: str, incoming_value: str) -> str:
    """If UI sends a redacted placeholder, keep the currently stored secret."""
    incoming = (incoming_value or "").strip()
    if incoming == "":
        return ""
    current_raw = str(feishu_runtime_config.get(field_name) or "")
    if current_raw and incoming == _redact_feishu_config({field_name: current_raw}).get(field_name):
        return current_raw
    return incoming


feishu_runtime_config = _load_feishu_config()
feishu_adapter = FeishuAdapter(
    app_id=feishu_runtime_config.get("app_id", ""),
    app_secret=feishu_runtime_config.get("app_secret", ""),
    verification_token=feishu_runtime_config.get("verification_token", ""),
    encrypt_key=feishu_runtime_config.get("encrypt_key", ""),
    domain=feishu_runtime_config.get("domain", "feishu"),
    timestamp_tolerance_sec=int(feishu_runtime_config.get("signature_tolerance_sec", 300)),
    replay_cache_size=int(feishu_runtime_config.get("replay_cache_size", 2048)),
)
_feishu_inbound_recent: dict[str, float] = {}
_FEISHU_INBOUND_DEBOUNCE_SEC = max(1.0, float(os.getenv("FEISHU_INBOUND_DEBOUNCE_SEC", "8")))


def _apply_feishu_runtime_config(config: dict) -> None:
    feishu_runtime_config.update(config)
    feishu_adapter.app_id = str(feishu_runtime_config.get("app_id") or "").strip()
    feishu_adapter.app_secret = str(feishu_runtime_config.get("app_secret") or "").strip()
    feishu_adapter.verification_token = str(feishu_runtime_config.get("verification_token") or "").strip()
    feishu_adapter.encrypt_key = str(feishu_runtime_config.get("encrypt_key") or "").strip()
    feishu_adapter.domain = str(feishu_runtime_config.get("domain") or "feishu").strip().lower()
    feishu_adapter.base_url = "https://open.larksuite.com" if feishu_adapter.domain == "lark" else "https://open.feishu.cn"
    feishu_adapter.timestamp_tolerance_sec = max(0, int(feishu_runtime_config.get("signature_tolerance_sec") or 300))
    feishu_adapter.replay_cache_size = max(32, int(feishu_runtime_config.get("replay_cache_size") or 2048))
    feishu_adapter._token = None
    feishu_adapter._token_expire_at = 0.0


def _build_feishu_callback_urls(base_url: str) -> dict:
    root = (base_url or "").rstrip("/")
    return {
        "events": f"{root}/channels/feishu/events",
        "inbound": f"{root}/channels/feishu/inbound",
        "outbound": f"{root}/channels/feishu/outbound",
    }


def _build_feishu_diagnostic_checks(callback_urls: dict) -> list:
    checks = []
    app_id = str(feishu_runtime_config.get("app_id") or "").strip()
    app_secret = str(feishu_runtime_config.get("app_secret") or "").strip()
    verify_token = str(feishu_runtime_config.get("verification_token") or "").strip()
    encrypt_key = str(feishu_runtime_config.get("encrypt_key") or "").strip()
    domain = str(feishu_runtime_config.get("domain") or "feishu").strip().lower()
    signature_tolerance = int(feishu_runtime_config.get("signature_tolerance_sec") or 0)
    replay_cache_size = int(feishu_runtime_config.get("replay_cache_size") or 0)
    allowed_senders = str(feishu_runtime_config.get("allowed_senders") or "").strip()

    checks.append({
        "id": "credentials",
        "title": "应用凭据",
        "status": "pass" if app_id and app_secret else "fail",
        "detail": "已配置 app_id + app_secret，可获取 tenant_access_token。" if app_id and app_secret else "缺少 app_id 或 app_secret，飞书机器人无法调用消息 API。",
        "action": "在设置页补齐 App ID / App Secret，并点击“测试连通”。" if not (app_id and app_secret) else "",
    })
    checks.append({
        "id": "event_security",
        "title": "事件安全配置",
        "status": "pass" if verify_token and encrypt_key else "warn",
        "detail": "verification_token 与 encrypt_key 已配置。" if verify_token and encrypt_key else "建议配置 verification_token 与 encrypt_key，提升回调安全性。",
        "action": "到飞书事件订阅页复制 Token 与 Encrypt Key。" if not (verify_token and encrypt_key) else "",
    })
    checks.append({
        "id": "domain",
        "title": "飞书区域",
        "status": "pass" if domain in {"feishu", "lark"} else "warn",
        "detail": "当前使用飞书中国站。" if domain == "feishu" else ("当前使用 Lark 国际站。" if domain == "lark" else f"未知域名配置：{domain}"),
        "action": "按租户所在区域选择 feishu 或 lark。" if domain not in {"feishu", "lark"} else "",
    })
    checks.append({
        "id": "signature_tolerance",
        "title": "签名时差容忍",
        "status": "pass" if 60 <= signature_tolerance <= 900 else "warn",
        "detail": f"当前为 {signature_tolerance} 秒，推荐区间 60~900 秒。",
        "action": "建议设置为 300 秒，兼顾安全与时钟漂移。" if not (60 <= signature_tolerance <= 900) else "",
    })
    checks.append({
        "id": "replay_cache",
        "title": "重放缓存容量",
        "status": "pass" if replay_cache_size >= 256 else "warn",
        "detail": f"当前缓存容量 {replay_cache_size}，用于防止 nonce/event_id 重放。",
        "action": "建议至少 256，生产环境可设为 2048。" if replay_cache_size < 256 else "",
    })
    checks.append({
        "id": "sender_allowlist",
        "title": "发送者白名单",
        "status": "pass" if allowed_senders else "warn",
        "detail": "已启用 open_id 白名单过滤。" if allowed_senders else "当前未配置白名单，任何可触达机器人的用户都能发起请求。",
        "action": "若是企业内使用，建议配置 allowed_senders（逗号分隔 open_id）。" if not allowed_senders else "",
    })
    checks.append({
        "id": "callback_urls",
        "title": "回调地址",
        "status": "pass",
        "detail": f"事件回调地址：{callback_urls.get('events', '')}",
        "action": "确保该地址可被飞书公网访问；本地调试请用内网穿透。" ,
    })
    return checks

# Skills 加载：支持多来源技能目录
# 1) agent-sdk/skills（内置）
# 2) ~/.agents/skills（社区技能常用目录）
# 3) ~/.claude/skills（Claude Code 生态目录）
# 4) CKS_EXTRA_SKILL_DIRS（可选，逗号分隔）
_home_dir = Path.home()
_additional_skill_dirs = []
for _candidate in [
    _home_dir / ".agents" / "skills",
    _home_dir / ".claude" / "skills",
]:
    if _candidate.exists():
        _additional_skill_dirs.append(_candidate)

_extra_skill_dirs_raw = os.getenv("CKS_EXTRA_SKILL_DIRS", "").strip()
if _extra_skill_dirs_raw:
    for _item in _extra_skill_dirs_raw.split(","):
        _dir = Path(_item.strip()).expanduser()
        if _dir.exists():
            _additional_skill_dirs.append(_dir)

skills_loader = SkillsLoader(additional_dirs=_additional_skill_dirs)
skill_installer = SkillInstaller(skills_dir=skills_loader.skills_dir)
skills_loader.annotate_sources(skill_installer.get_installed_skills())
agent = ClaudeAgent(
    api_key=os.getenv("ANTHROPIC_API_KEY"),
    memory_manager=memory_manager,
    skills_loader=skills_loader,
    skill_installer=skill_installer,
    goal_manager=goal_manager,
)


def _build_bound_goal_task_context(goal_task_id):
    """Build compact task context for a bound goal task."""
    if goal_task_id is None:
        return ""
    try:
        task_id = int(goal_task_id)
    except Exception:
        return ""
    if task_id <= 0:
        return ""

    rows = goal_manager.list_tasks(task_id=task_id, limit=1)
    if not rows:
        return ""

    task = rows[0]
    state = goal_manager.get_execution_state(task_id) or {}
    context_lines = [
        f"- task_id: {task_id}",
        f"- title: {task.get('title', '')}",
        f"- description: {task.get('description', '')}",
        f"- assignee: {task.get('assignee', '')}",
        f"- department: {task.get('department', '')}",
        f"- status: {task.get('status', '')}",
        f"- review_status: {task.get('review_status', '')}",
        f"- project: {task.get('project_title', '')}",
        f"- okr: {task.get('okr_title', '')}",
        f"- kpi: {task.get('kpi_title', '')}",
    ]
    if state:
        context_lines.extend([
            f"- execution_phase: {state.get('phase', '')}",
            f"- execution_state: {state.get('status', '')}",
            f"- execution_note: {state.get('note', '')}",
            f"- execution_prompt: {state.get('prompt', '')}",
        ])
    return "\n".join(context_lines)


def _inject_goal_task_context(message: str, goal_task_id):
    context = _build_bound_goal_task_context(goal_task_id)
    if not context:
        return message
    return (
        "你当前绑定了一个目标任务。请将它作为本轮执行上下文，不要再向用户追问“是什么任务”。\n"
        "若用户说“基于这个任务”，默认就是下方绑定任务。\n"
        "如果需要回写任务执行状态，必须使用 goal_task_update 工具；禁止用 run_command 写任务状态。\n"
        "\n"
        "[BOUND_GOAL_TASK]\n"
        f"{context}\n"
        "[/BOUND_GOAL_TASK]\n"
        "\n"
        "用户本轮输入：\n"
        f"{message}"
    )

# Auto-check office document dependencies on first startup
def _check_office_deps():
    """Check office document packages at startup."""
    deps = {
        "openpyxl": "openpyxl", "pptx": "python-pptx", "docx": "python-docx",
        "fitz": "PyMuPDF", "matplotlib": "matplotlib", "PIL": "Pillow",
        "chardet": "chardet",
    }
    missing = []
    for import_name, pip_name in deps.items():
        try:
            __import__(import_name)
        except ImportError:
            missing.append(pip_name)

    if not missing:
        return

    auto_install = os.getenv("CKS_AUTO_INSTALL_DEPS", "0") == "1"
    if not auto_install:
        logger.warning(
            "Missing office packages: %s. Auto install disabled; set CKS_AUTO_INSTALL_DEPS=1 to enable.",
            ", ".join(missing)
        )
        return

    logger.info(f"Installing missing office packages: {', '.join(missing)}")
    import subprocess
    for pkg in missing:
        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", pkg, "-q"],
                capture_output=True, timeout=120
            )
            logger.info(f"  Installed {pkg}")
        except Exception as e:
            logger.warning(f"  Failed to install {pkg}: {e}")

_check_office_deps()


def _deploy_helpers():
    """Deploy helper scripts to user's temp dir for easy import."""
    import shutil
    scripts_dir = Path(__file__).parent / "scripts"
    temp_dir = Path(os.environ.get("TEMP", os.environ.get("TMP", "/tmp"))) / "cks_lite"
    temp_dir.mkdir(exist_ok=True)

    # 部署所有助手脚本
    helper_files = [
        "cks_file_helpers.py",
        "cks_ppt_builder.py",
        "cks_email_sender.py",
    ]
    for filename in helper_files:
        src = scripts_dir / filename
        if src.exists():
            try:
                shutil.copy2(src, temp_dir / filename)
                logger.info(f"Deployed: {filename} -> {temp_dir / filename}")
            except Exception as e:
                logger.warning(f"Failed to deploy {filename}: {e}")

_deploy_helpers()

logger.info("Agent SDK 初始化完成")
logger.info(f"数据目录: {DATA_DIR.absolute()}")
logger.info(f"已加载 Skills: {len(skills_loader.skills)} 个")


def _extract_mcp_tools_from_skill_md(skill_path: Path) -> list[str]:
    """Extract MCP tool references from SKILL.md for readiness diagnostics."""
    skill_md = skill_path / "SKILL.md"
    if not skill_md.exists():
        return []

    try:
        content = skill_md.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []

    # Supports both mcp_server_tool and mcp__server__tool patterns.
    pattern = r"(mcp__[a-zA-Z0-9_]+__[a-zA-Z0-9_]+|mcp_[a-zA-Z0-9_]+(?:__[a-zA-Z0-9_]+)*)"
    seen = set()
    results = []
    for match in re.finditer(pattern, content):
        name = match.group(1)
        if name not in seen:
            seen.add(name)
            results.append(name)
    return results


def _check_skill_readiness(skill) -> dict:
    """
    Build a lightweight readiness report for a skill.

    Status values:
    - ready
    - missing_dependency
    - blocked_by_policy
    - runtime_error
    """
    status = "ready"
    message = "Skill is ready"
    required_tools = []
    runtime_checks = []

    # 1) Declared plugin tools from template.json
    if getattr(skill, "tools", None):
        for tool in skill.tools:
            required_tools.append(tool.name)
            if tool.entrypoint:
                module_path = tool.entrypoint.split(":")[0]
                module_file = skill.path / (module_path.replace(".", "/") + ".py")
                module_exists = module_file.exists()
                runtime_checks.append({
                    "name": f"entrypoint:{tool.name}",
                    "ok": module_exists,
                    "detail": str(module_file),
                })
                if not module_exists and status == "ready":
                    status = "missing_dependency"
                    message = f"Tool entrypoint file missing: {module_file.name}"

    # 2) MCP tool references from SKILL.md (e.g., openai-docs)
    mcp_tools = _extract_mcp_tools_from_skill_md(skill.path)
    if mcp_tools:
        required_tools.extend(mcp_tools)
        mcp_runtime_enabled = os.getenv("MCP_RUNTIME_ENABLED", "0") == "1"
        bridge_url = os.getenv("MCP_BRIDGE_URL", "").strip()
        if not bridge_url:
            host = os.getenv("HOST", "127.0.0.1")
            port = int(os.getenv("PORT", 7860))
            bridge_url = f"http://{host}:{port}/mcp/execute"
        runtime_checks.append({
            "name": "mcp_runtime",
            "ok": mcp_runtime_enabled,
            "detail": "Set MCP_RUNTIME_ENABLED=1 and configure MCP bridge/runtime",
        })
        runtime_checks.append({
            "name": "mcp_bridge_url",
            "ok": bool(bridge_url),
            "detail": bridge_url,
        })
        if not mcp_runtime_enabled and status == "ready":
            status = "missing_dependency"
            message = "MCP runtime is not configured"

    # 3) Optional policy block switch for emergency control
    if os.getenv("DISABLE_SKILLS_EXECUTION", "0") == "1":
        status = "blocked_by_policy"
        message = "Skills execution is disabled by policy (DISABLE_SKILLS_EXECUTION=1)"
        runtime_checks.append({
            "name": "skills_execution_policy",
            "ok": False,
            "detail": "DISABLE_SKILLS_EXECUTION=1",
        })

    # 4) Deduplicate required tools and keep stable output
    dedup_required = []
    seen_required = set()
    for t in required_tools:
        if t not in seen_required:
            seen_required.add(t)
            dedup_required.append(t)

    return {
        "name": skill.name,
        "display_name": skill.display_name,
        "source": getattr(skill, "source", "pre-installed"),
        "status": status,
        "message": message,
        "required_tools": dedup_required,
        "runtime_checks": runtime_checks,
    }


async def _run_skill_smoke_test(skill_name: str) -> dict:
    """Run a lightweight smoke test for a single skill."""
    skill = skills_loader.get_skill(skill_name)
    if not skill:
        return {"success": False, "error": f"Skill 不存在: {skill_name}"}

    readiness = _check_skill_readiness(skill)
    if readiness["status"] != "ready":
        return {
            "success": False,
            "skill_name": skill_name,
            "status": readiness["status"],
            "message": readiness["message"],
            "checks": readiness["runtime_checks"],
        }

    # Context-only validation: SKILL.md readable when has_skill is true.
    context_ok = True
    context_len = 0
    if skill.has_skill:
        context = agent.skill_executor.get_skill_context(skill_name)
        context_ok = context is not None
        context_len = len(context or "")

    checks = [
        {"name": "skill_exists", "ok": True, "detail": str(skill.path)},
        {"name": "readiness_status", "ok": True, "detail": "ready"},
        {"name": "skill_context", "ok": context_ok, "detail": f"length={context_len}"},
    ]

    # Optional live probe for find-skills
    if skill_name in ("find-skills", "find_skills"):
        try:
            probe = await skill_installer.search_skills("productivity", limit=3)
            checks.append({
                "name": "live_probe_find_skills",
                "ok": isinstance(probe, list),
                "detail": f"results={len(probe) if isinstance(probe, list) else 0}",
            })
        except Exception as e:
            checks.append({
                "name": "live_probe_find_skills",
                "ok": False,
                "detail": str(e),
            })

    all_ok = all(c["ok"] for c in checks)
    return {
        "success": all_ok,
        "skill_name": skill_name,
        "status": "ready" if all_ok else "runtime_error",
        "message": "Smoke test passed" if all_ok else "Smoke test failed",
        "checks": checks,
    }


@app.get("/")
async def root():
    """????"""
    skills_meta = skills_loader.get_snapshot_meta()
    return {
        "status": "ok",
        "service": "CKS Lite Agent SDK",
        "version": "0.1.0",
        "skills_count": len(skills_loader.skills),
        "skills_snapshot_version": skills_meta.get("version"),
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """对话接口（非流式）"""
    try:
        effective_message = _inject_goal_task_context(request.message, request.goal_task_id)
        response_mode = (request.response_mode or "").strip().lower()
        if response_mode not in {"fast", "balanced", "deep"}:
            response_mode = "fast" if request.fast_mode else "balanced"
        effective_use_memory = request.use_memory and response_mode != "fast"
        response = await agent.chat(
            user_id=request.user_id,
            message=effective_message,
            session_id=request.session_id,
            use_memory=effective_use_memory,
            fast_mode=(response_mode == "fast"),
            response_mode=response_mode,
            preferred_skill=request.preferred_skill,
            skill_strict=request.skill_strict,
        )

        return ChatResponse(
            message=response["message"],
            tool_calls=response.get("tool_calls", []),
            memory_used=response.get("memory_used", [])
        )
    except Exception as e:
        logger.error(f"对话错误: {e}", exc_info=True)
        return ChatResponse(
            message=f"抱歉，发生错误: {str(e)}",
            tool_calls=[],
            memory_used=[]
        )


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """????????????"""
    async def generate():
        has_successful_tool = False
        has_failed_tool = False
        stream_has_error = False
        try:
            effective_message = _inject_goal_task_context(request.message, request.goal_task_id)
            response_mode = (request.response_mode or "").strip().lower()
            if response_mode not in {"fast", "balanced", "deep"}:
                response_mode = "fast" if request.fast_mode else "balanced"
            effective_use_memory = request.use_memory and response_mode != "fast"
            async for chunk in agent.chat_stream(
                user_id=request.user_id,
                message=effective_message,
                session_id=request.session_id,
                use_memory=effective_use_memory,
                fast_mode=(response_mode == "fast"),
                response_mode=response_mode,
                goal_task_id=request.goal_task_id,
                preferred_skill=request.preferred_skill,
                skill_strict=request.skill_strict,
            ):
                try:
                    parsed = json.loads(chunk)
                    if parsed.get("type") == "tool_result" and parsed.get("success"):
                        has_successful_tool = True
                    if parsed.get("type") == "tool_result" and parsed.get("success") is False:
                        has_failed_tool = True
                    if parsed.get("type") == "error":
                        stream_has_error = True
                    if (
                        parsed.get("type") == "done"
                        and request.goal_task_id
                        and has_successful_tool
                        and not has_failed_tool
                        and not stream_has_error
                    ):
                        goal_manager.complete_task(request.goal_task_id)
                except Exception:
                    pass
                yield f"data: {chunk}\n\n"
        except Exception as e:
            logger.error(f"?????????: {e}", exc_info=True)
            yield f"data: {{\"error\": \"{str(e)}\"}}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # 禁用 nginx 缓冲
        }
    )


@app.post("/memory/save")
async def save_memory(request: MemoryRequest):
    """保存记忆"""
    try:
        memory_id = await memory_manager.save_memory(
            user_id=request.user_id,
            content=request.content,
            memory_type=request.memory_type,
            metadata=request.metadata
        )

        return {"success": True, "memory_id": memory_id}
    except Exception as e:
        logger.error(f"保存记忆错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/memory/search")
async def search_memory(user_id: str, query: str, top_k: int = 5):
    """搜索记忆（纯向量搜索）"""
    try:
        memories = await memory_manager.search_memories(
            user_id=user_id,
            query=query,
            top_k=top_k,
            use_hybrid=False
        )

        return {
            "success": True,
            "memories": memories
        }
    except Exception as e:
        logger.error(f"搜索记忆错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/memory/hybrid-search")
async def hybrid_search_memory(
    user_id: str,
    query: str,
    top_k: int = 5,
    vector_weight: float = 0.7,
    text_weight: float = 0.3,
    memory_type: str = None
):
    """混合搜索记忆（BM25 + 向量）"""
    try:
        memories = await memory_manager.search_memories(
            user_id=user_id,
            query=query,
            top_k=top_k,
            memory_type=memory_type,
            use_hybrid=True
        )

        return {
            "success": True,
            "memories": memories,
            "search_params": {
                "vector_weight": vector_weight,
                "text_weight": text_weight,
                "top_k": top_k
            }
        }
    except Exception as e:
        logger.error(f"混合搜索记忆错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/memory/search-v2")
async def search_memory_v2(
    user_id: str,
    query: str,
    top_k: int = 5,
    memory_type: str = None,
):
    """
    Two-stage memory recall (stage 1/search):
    return compact snippet list; client can call /memory/get by id for full content.
    """
    try:
        snippets = await memory_manager.search_memory_snippets(
            user_id=user_id,
            query=query,
            top_k=top_k,
            memory_type=memory_type,
            use_hybrid=True,
        )
        return {
            "success": True,
            "snippets": snippets,
            "total": len(snippets),
        }
    except Exception as e:
        logger.error(f"Memory search-v2 failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/memory/get")
async def get_memory_v2(user_id: str, memory_id: str):
    """
    Two-stage memory recall (stage 2/get):
    fetch full memory by id.
    """
    try:
        memory = await memory_manager.get_memory_detail(user_id=user_id, memory_id=memory_id)
        if not memory:
            return {"success": False, "error": "memory_not_found"}
        return {"success": True, "memory": memory}
    except Exception as e:
        logger.error(f"Memory get failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/memory/list")
async def list_memories(user_id: str, memory_type: str = None, limit: int = 50):
    """列出记忆"""
    try:
        memories = await memory_manager.list_memories(
            user_id=user_id,
            memory_type=memory_type,
            limit=limit
        )

        return {
            "success": True,
            "memories": memories,
            "total": len(memories)
        }
    except Exception as e:
        logger.error(f"列出记忆错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.delete("/memory/{memory_id}")
async def delete_memory(memory_id: str):
    """删除记忆"""
    try:
        await memory_manager.delete_memory(memory_id)
        return {"success": True}
    except Exception as e:
        logger.error(f"删除记忆错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/memory/{memory_id}/resolve-conflict")
async def resolve_memory_conflict(memory_id: str, action: str = "accept_current"):
    """Resolve memory conflict state for one memory and linked conflicting memories."""
    try:
        result = await memory_manager.resolve_conflict(memory_id=memory_id, action=action)
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"Resolve memory conflict failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/memory/clear-all")
async def clear_all_memories(user_id: str, backup: bool = True):
    """
    清空所有记忆（危险操作）

    Args:
        user_id: 用户ID
        backup: 是否在清空前备份（默认 True）

    Returns:
        success: 是否成功
        backup_path: 备份文件路径（如果 backup=True）
        cleared_count: 清空的记忆数量
    """
    try:
        logger.warning(f"⚠️ 危险操作: 用户 {user_id} 请求清空所有记忆 (backup={backup})")

        # 1. 统计要清空的记忆数量
        memories = await memory_manager.list_memories(user_id, limit=99999)
        total_count = len(memories)

        # 2. 如果需要备份，先导出
        backup_path = None
        if backup and memory_manager.markdown_memory:
            try:
                import json
                from datetime import datetime

                backup_data = memory_manager.markdown_memory.export_to_json()
                backup_filename = f"memory_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                backup_dir = memory_manager.data_dir / "backups"
                backup_dir.mkdir(exist_ok=True)
                backup_path = backup_dir / backup_filename

                with open(backup_path, "w", encoding="utf-8") as f:
                    json.dump(backup_data, f, indent=2, ensure_ascii=False)

                logger.info(f"✅ 备份已保存: {backup_path}")
            except Exception as e:
                logger.error(f"备份失败: {e}")
                return {
                    "success": False,
                    "error": f"备份失败: {str(e)}",
                    "message": "为了安全，清空操作已取消"
                }

        # 3. 清空数据库记忆
        conn = memory_manager._get_connection()
        cursor = conn.cursor()

        # 删除所有该用户的记忆
        cursor.execute("DELETE FROM semantic_memories WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM semantic_memories_fts WHERE id IN (SELECT id FROM semantic_memories WHERE user_id = ?)", (user_id,))

        conn.commit()
        conn.close()

        # 4. 清空 FAISS 索引（重建空索引）
        if memory_manager.index and memory_manager.embedding_dim:
            import faiss
            memory_manager.index = faiss.IndexFlatL2(memory_manager.embedding_dim)
            faiss.write_index(memory_manager.index, str(memory_manager.index_path))

        # 5. 清空 Markdown 文件
        if memory_manager.markdown_memory:
            try:
                # 重新初始化 MEMORY.md（覆盖为空模板）
                memory_manager.markdown_memory._initialize_memory_file()

                # 删除所有每日日志（可选，这里保留日志文件）
                # 如果要删除日志，取消下面的注释
                # import shutil
                # if memory_manager.markdown_memory.daily_dir.exists():
                #     shutil.rmtree(memory_manager.markdown_memory.daily_dir)
                #     memory_manager.markdown_memory.daily_dir.mkdir()

                logger.info("✅ Markdown 文件已清空")
            except Exception as e:
                logger.error(f"清空 Markdown 失败: {e}")

        logger.warning(f"🗑️ 已清空用户 {user_id} 的所有记忆 (共 {total_count} 条)")

        return {
            "success": True,
            "cleared_count": total_count,
            "backup_path": str(backup_path) if backup_path else None,
            "message": f"已成功清空 {total_count} 条记忆" + (f"，备份已保存至 {backup_path}" if backup_path else "")
        }

    except Exception as e:
        logger.error(f"清空记忆错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/memory/maintenance/compact")
async def compact_memories(
    user_id: str,
    dedupe_threshold: float = 0.985,
    stale_days: int = 120,
    dry_run: bool = False
):
    """Run memory anti-corrosion maintenance: deduplication + stale pruning."""
    try:
        result = await memory_manager.compact_memories(
            user_id=user_id,
            dedupe_threshold=dedupe_threshold,
            stale_days=stale_days,
            dry_run=dry_run,
        )
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"Memory maintenance compact failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/memory/conflicts")
async def list_memory_conflicts(user_id: str, status: str = "pending_review", limit: int = 100):
    """List conflict queue for memory triage."""
    try:
        conflicts = await memory_manager.list_conflicts(user_id=user_id, status=status, limit=limit)
        return {"success": True, "conflicts": conflicts, "total": len(conflicts)}
    except Exception as e:
        logger.error(f"List memory conflicts failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/memory/maintenance/report")
async def memory_maintenance_report(
    user_id: str,
    dedupe_threshold: float = 0.985,
    stale_days: int = 120,
):
    """Return anti-corrosion inspection report without mutating data."""
    try:
        report = await memory_manager.get_maintenance_report(
            user_id=user_id,
            dedupe_threshold=dedupe_threshold,
            stale_days=stale_days,
        )
        return {"success": True, "report": report}
    except Exception as e:
        logger.error(f"Get memory maintenance report failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/memory/maintenance/auto-run")
async def memory_maintenance_auto_run(
    user_id: str,
    interval_hours: int = 24,
    force: bool = False,
    dedupe_threshold: float = 0.985,
    stale_days: int = 120,
):
    """Run scheduled anti-corrosion maintenance if due."""
    try:
        result = await memory_manager.run_scheduled_maintenance(
            user_id=user_id,
            interval_hours=interval_hours,
            force=force,
            dedupe_threshold=dedupe_threshold,
            stale_days=stale_days,
        )
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"Auto memory maintenance failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/memory/markdown/read")
async def read_markdown_memory():
    """读取 MEMORY.md 内容"""
    try:
        if not memory_manager.markdown_memory:
            return {"success": False, "error": "Markdown 记忆系统未启用"}

        content = memory_manager.markdown_memory.read_memory()
        memories = memory_manager.markdown_memory.parse_memories()

        return {
            "success": True,
            "content": content,
            "memories": memories,
            "file_path": str(memory_manager.markdown_memory.memory_file)
        }
    except Exception as e:
        logger.error(f"读取 Markdown 记忆错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/memory/markdown/daily-log")
async def read_daily_log(date: str = None):
    """读取每日日志"""
    try:
        if not memory_manager.markdown_memory:
            return {"success": False, "error": "Markdown 记忆系统未启用"}

        content = memory_manager.markdown_memory.read_daily_log(date)
        file_path = str(memory_manager.markdown_memory.daily_dir / f"{date or 'today'}.md")

        return {
            "success": True,
            "content": content,
            "date": date,
            "file_path": file_path
        }
    except Exception as e:
        logger.error(f"读取每日日志错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/memory/markdown/recent-logs")
async def get_recent_logs(days: int = 7):
    """获取最近日志列表"""
    try:
        if not memory_manager.markdown_memory:
            return {"success": False, "error": "Markdown 记忆系统未启用"}

        logs = memory_manager.markdown_memory.get_recent_logs(days)

        return {
            "success": True,
            "logs": logs
        }
    except Exception as e:
        logger.error(f"获取最近日志错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/skills")
async def list_skills():
    """???? Skills"""
    meta = skills_loader.get_snapshot_meta()
    return {
        "success": True,
        "skills": [skill.to_dict() for skill in skills_loader.skills],
        "snapshot": meta,
    }


@app.get("/skills/snapshot")
async def get_skills_snapshot():
    """Get current skills snapshot meta and optionally force refresh."""
    changed = skills_loader.refresh_if_changed()
    return {
        "success": True,
        "changed": changed,
        "snapshot": skills_loader.get_snapshot_meta(),
    }


@app.get("/health")
async def health():
    """健康检查（兼容路径）"""
    return await root()


async def _probe_mcp_bridge(bridge_url: str) -> tuple[bool, str]:
    """Probe MCP bridge reachability with a lightweight request."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(
                bridge_url,
                json={"tool_name": "mcp__probe__ping", "tool_input": {}},
            )
        if resp.status_code in (200, 400):
            return True, f"http={resp.status_code}"
        return False, f"http={resp.status_code}"
    except Exception as e:
        return False, str(e)


def _iter_file_lines_reverse(file_path: Path, chunk_size: int = 8192):
    """Yield file lines in reverse order without loading the full file into memory."""
    with open(file_path, "rb") as f:
        f.seek(0, os.SEEK_END)
        file_size = f.tell()
        buffer = b""
        pos = file_size

        while pos > 0:
            read_size = min(chunk_size, pos)
            pos -= read_size
            f.seek(pos)
            chunk = f.read(read_size)
            buffer = chunk + buffer
            lines = buffer.split(b"\n")
            buffer = lines[0]
            for line in reversed(lines[1:]):
                if line:
                    yield line.decode("utf-8", errors="ignore")

        if buffer:
            yield buffer.decode("utf-8", errors="ignore")


def _read_audit_records(
    kind: str,
    session_id: str = None,
    tool_name: str = None,
    goal_task_id: int = None,
    from_time: str = None,
    to_time: str = None,
    limit: int = 100
) -> list:
    """
    Read audit JSONL records from data/audit.
    kind: execution | error
    """
    limit = max(1, min(limit, 1000))
    audit_dir = memory_manager.data_dir / "audit"
    if not audit_dir.exists():
        return []

    pattern = f"{kind}-*.jsonl"
    files = sorted(audit_dir.glob(pattern), reverse=True)
    records = []

    def parse_dt(value: str):
        if not value:
            return None
        try:
            normalized = value.replace("Z", "+00:00")
            return datetime.fromisoformat(normalized)
        except Exception:
            return None

    from_dt = parse_dt(from_time)
    to_dt = parse_dt(to_time)

    for file in files:
        try:
            line_iter = _iter_file_lines_reverse(file)
        except Exception:
            continue

        for line in line_iter:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue

            # Backward-compatible key mapping for old/new audit schema
            if "timestamp" not in row and "ts" in row:
                row["timestamp"] = row.get("ts")
            if "tool_name" not in row and "tool" in row:
                row["tool_name"] = row.get("tool")
            if "tool_input" not in row and "input" in row:
                row["tool_input"] = row.get("input")

            if session_id and row.get("session_id") != session_id:
                continue

            normalized_tool_name = row.get("tool_name") or row.get("tool")
            if tool_name and normalized_tool_name != tool_name:
                continue
            if goal_task_id is not None and row.get("goal_task_id") != goal_task_id:
                continue

            row_time = parse_dt(row.get("timestamp") or row.get("ts"))
            if from_dt and row_time and row_time < from_dt:
                continue
            if to_dt and row_time and row_time > to_dt:
                continue

            records.append(row)
            if len(records) >= limit:
                return records

    return records


@app.get("/skills/readiness")
async def list_skills_readiness(skill_name: str = None):
    """Skill readiness diagnostics."""
    try:
        async def with_mcp_probe(row: dict) -> dict:
            has_mcp_tools = any(t.startswith("mcp_") or t.startswith("mcp__") for t in row.get("required_tools", []))
            mcp_enabled = os.getenv("MCP_RUNTIME_ENABLED", "0") == "1"
            if not has_mcp_tools or not mcp_enabled:
                return row

            bridge_url = os.getenv("MCP_BRIDGE_URL", "").strip()
            if not bridge_url:
                host = os.getenv("HOST", "127.0.0.1")
                port = int(os.getenv("PORT", 7860))
                bridge_url = f"http://{host}:{port}/mcp/execute"

            ok, detail = await _probe_mcp_bridge(bridge_url)
            checks = row.get("runtime_checks", [])
            checks.append({
                "name": "mcp_bridge_reachable",
                "ok": ok,
                "detail": detail,
            })
            row["runtime_checks"] = checks
            if not ok:
                row["status"] = "runtime_error"
                row["message"] = "MCP bridge is not reachable"
            return row

        if skill_name:
            skill = skills_loader.get_skill(skill_name)
            if not skill:
                return {"success": False, "error": f"Skill 不存在: {skill_name}"}
            row = _check_skill_readiness(skill)
            row = await with_mcp_probe(row)
            return {"success": True, "readiness": [row]}

        readiness = []
        for skill in skills_loader.skills:
            row = _check_skill_readiness(skill)
            row = await with_mcp_probe(row)
            readiness.append(row)
        return {"success": True, "readiness": readiness, "total": len(readiness)}
    except Exception as e:
        logger.error(f"获取 Skill readiness 失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/audit/executions")
async def get_audit_executions(
    session_id: str = None,
    tool_name: str = None,
    goal_task_id: int = None,
    from_time: str = None,
    to_time: str = None,
    limit: int = 100
):
    """查询工具执行审计日志"""
    try:
        rows = _read_audit_records(
            "execution",
            session_id=session_id,
            tool_name=tool_name,
            goal_task_id=goal_task_id,
            from_time=from_time,
            to_time=to_time,
            limit=limit
        )
        return {"success": True, "records": rows, "total": len(rows)}
    except Exception as e:
        logger.error(f"读取 execution 审计日志失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/audit/errors")
async def get_audit_errors(
    session_id: str = None,
    tool_name: str = None,
    goal_task_id: int = None,
    from_time: str = None,
    to_time: str = None,
    limit: int = 100
):
    """查询工具错误审计日志"""
    try:
        rows = _read_audit_records(
            "error",
            session_id=session_id,
            tool_name=tool_name,
            goal_task_id=goal_task_id,
            from_time=from_time,
            to_time=to_time,
            limit=limit
        )
        return {"success": True, "records": rows, "total": len(rows)}
    except Exception as e:
        logger.error(f"读取 error 审计日志失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/skills/smoke-test")
async def smoke_test_skill(skill_name: str = None):
    """Run smoke test for one skill or all skills."""
    try:
        if skill_name:
            result = await _run_skill_smoke_test(skill_name)
            return {"success": result.get("success", False), "results": [result]}

        results = []
        for skill in skills_loader.skills:
            results.append(await _run_skill_smoke_test(skill.name))
        passed = len([r for r in results if r.get("success")])
        return {
            "success": True,
            "results": results,
            "summary": {
                "total": len(results),
                "passed": passed,
                "failed": len(results) - passed,
            }
        }
    except Exception as e:
        logger.error(f"Skill smoke test 失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/mcp/execute")
async def mcp_execute(request: MCPExecuteRequest):
    """
    Local MCP bridge endpoint.
    This is a pragmatic fallback bridge for MCP-dependent skills before full MCP runtime integration.
    """
    try:
        tool_name = request.tool_name
        tool_input = request.tool_input or {}

        # Current fallback implementation for openaiDeveloperDocs MCP tools:
        # map MCP calls to domain-limited web search on developers.openai.com
        if "openaiDeveloperDocs" in tool_name:
            query = (
                tool_input.get("query")
                or tool_input.get("doc_id")
                or tool_input.get("path")
                or "OpenAI developer docs"
            )

            response = await agent.web_search.search(
                query=str(query),
                num_results=5,
                site="developers.openai.com",
                time_range=None
            )

            if not response.success:
                return {
                    "success": False,
                    "error": response.error or "Search failed",
                    "message": "openai docs fallback search failed"
                }

            if "search_openai_docs" in tool_name or "list_openai_docs" in tool_name:
                rows = []
                for i, r in enumerate(response.results, 1):
                    rows.append(f"{i}. {r.title}\n   {r.url}\n   {r.snippet[:220]}")
                return {
                    "success": True,
                    "message": f"找到 {len(response.results)} 条 OpenAI 文档结果（fallback）",
                    "content": "\n\n".join(rows),
                    "data": {
                        "mode": "fallback_web_search",
                        "results": [
                            {"title": r.title, "url": r.url, "snippet": r.snippet}
                            for r in response.results
                        ]
                    }
                }

            # fetch_openai_doc fallback: return top result content/snippet
            top = response.results[0] if response.results else None
            return {
                "success": bool(top),
                "message": "返回最相关文档（fallback）" if top else "未找到文档",
                "content": (top.content or top.snippet) if top else "",
                "data": {
                    "mode": "fallback_web_search",
                    "doc": {
                        "title": top.title,
                        "url": top.url,
                        "content": top.content or top.snippet
                    } if top else None
                }
            }

        return {
            "success": False,
            "error": f"Unsupported MCP tool: {tool_name}",
            "message": "本地 MCP bridge 暂未支持该工具，请接入完整 MCP runtime。"
        }
    except Exception as e:
        logger.error(f"MCP execute 错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/skills/{skill_name}")
async def get_skill(skill_name: str):
    """获取 Skill 详情"""
    skill = skills_loader.get_skill(skill_name)
    if skill:
        return {"success": True, "skill": skill.to_dict()}
    else:
        return {"success": False, "error": "Skill 不存在"}


@app.get("/skills/{skill_name}/context")
async def get_skill_context(skill_name: str):
    """获取 Skill 的上下文（SKILL.md 内容）"""
    context = agent.skill_executor.get_skill_context(skill_name)
    if context:
        return {"success": True, "context": context}
    else:
        return {"success": False, "error": "Skill 上下文不存在"}


@app.post("/skills/execute")
async def execute_skill(
    request: SkillExecuteRequest = None,
    skill_name: str = None,
    script_name: str = None,
):
    """执行 Skill 脚本"""
    try:
        # 兼容两种调用方式：
        # 1) 现代方式：全部参数走 JSON body
        # 2) 旧方式：skill_name/script_name 在 query，args 在 body
        resolved_skill_name = (request.skill_name if request else None) or skill_name
        resolved_script_name = (request.script_name if request else None) or script_name
        resolved_args = (request.args if request else None) or []

        if not resolved_skill_name or not resolved_script_name:
            return {
                "success": False,
                "error": "缺少参数: skill_name 和 script_name 必填"
            }

        success, stdout, stderr = await agent.skill_executor.execute_script(
            skill_name=resolved_skill_name,
            script_name=resolved_script_name,
            args=resolved_args
        )

        return {
            "success": success,
            "stdout": stdout,
            "stderr": stderr
        }
    except Exception as e:
        logger.error(f"执行 Skill 脚本错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/skills/install")
async def install_skill(request: SkillInstallRequest):
    """从 GitHub 安装社区技能"""
    try:
        result = await skill_installer.install_skill(request.ref)
        if result["success"]:
            skills_loader.reload()
            skills_loader.annotate_sources(skill_installer.get_installed_skills())
        return result
    except Exception as e:
        logger.error(f"安装技能错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/skills/install/local")
async def install_local_skill(request: SkillLocalInstallRequest):
    """Install skill from local folder or zip path."""
    try:
        result = await skill_installer.install_local_skill(request.path)
        if result.get("success"):
            skills_loader.reload()
            skills_loader.annotate_sources(skill_installer.get_installed_skills())
        return result
    except Exception as e:
        logger.error(f"Install local skill error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/skills/create")
async def create_skill(request: SkillCreateRequest):
    """Create a local skill scaffold."""
    try:
        result = await skill_installer.create_skill_scaffold(
            name=request.name,
            display_name=request.display_name,
            description=request.description,
            category=request.category,
            trigger_keywords=request.trigger_keywords,
            tags=request.tags,
        )
        if result.get("success"):
            skills_loader.reload()
            skills_loader.annotate_sources(skill_installer.get_installed_skills())
        return result
    except Exception as e:
        logger.error(f"Create skill scaffold error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.delete("/skills/install/{skill_name}")
async def uninstall_skill(skill_name: str):
    """卸载用户安装的技能"""
    try:
        result = await skill_installer.uninstall_skill(skill_name)
        if result["success"]:
            skills_loader.reload()
            skills_loader.annotate_sources(skill_installer.get_installed_skills())
        return result
    except Exception as e:
        logger.error(f"卸载技能错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/skills/installed")
async def list_installed_skills():
    """列出所有用户安装的技能"""
    return {"success": True, "installed": skill_installer.get_installed_skills()}


@app.post("/tools/execute")
async def execute_tool(tool_name: str, tool_input: dict):
    """执行工具调用"""
    try:
        result = await agent.skill_executor.execute_tool(tool_name, tool_input)
        return result
    except Exception as e:
        logger.error(f"执行工具错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/tools")
async def list_tools():
    """列出所有可用工具"""
    return {
        "success": True,
        "tools": agent.skill_executor.get_tool_definitions()
    }


@app.post("/vision/next-action")
async def vision_next_action(request: VisionNextActionRequest):
    """Visual planning API: infer next desktop action from screenshot + goal."""
    try:
        result = await agent.vision_next_action(
            image_path=request.image_path,
            goal=request.goal,
            history=request.history,
        )
        return result
    except Exception as e:
        logger.error(f"视觉下一步规划失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/tools/desktop-result")
async def submit_desktop_result(request_id: str, result: dict):
    """
    Submit the result of a desktop tool execution from the frontend.
    The frontend calls this after executing a Tauri IPC command.
    """
    future = _desktop_results.get(request_id)
    if future and not future.done():
        future.set_result(result)
        logger.info(f"✅ Desktop tool result received: {request_id}")
        return {"success": True}
    logger.warning(f"⚠️ No pending desktop tool request: {request_id}")
    return {"success": False, "error": "No pending request found for this request_id"}


async def _dispatch_channel_task_internal(
    task_id: int,
    user_id: str,
    session_id: str,
    use_memory: bool,
    message_override: str = "",
):
    """Internal helper to dispatch queued channel task through agent chat path."""
    task = channel_task_queue.get(task_id)
    if not task:
        raise KeyError(f"任务不存在: {task_id}")

    channel_task_queue.mark_status(task_id, "running")
    dispatch_message = (message_override or "").strip() or task["message"]
    response = await agent.chat(
        user_id=user_id,
        message=dispatch_message,
        session_id=session_id,
        use_memory=use_memory,
        response_mode="balanced",
    )
    pending_approvals = approval_store.list_requests(status="pending", limit=50, session_id=session_id)
    final_status = "waiting_approval" if pending_approvals else "completed"
    updated = channel_task_queue.mark_status(
        task_id,
        final_status,
        result={
            "session_id": session_id,
            "dispatched_message": dispatch_message,
            "reply": response.get("message", ""),
            "tool_calls": response.get("tool_calls", []),
            "pending_approval_count": len(pending_approvals),
        },
    )
    return updated, response


def _try_writeback_goal_task_from_channel_task(task: dict, response: dict) -> None:
    """Best-effort writeback to goal task when channel task metadata binds goal_task_id."""
    try:
        metadata = task.get("metadata") or {}
        goal_task_id_raw = metadata.get("goal_task_id")
        if goal_task_id_raw in (None, "", 0):
            return
        goal_task_id = int(goal_task_id_raw)
        note = f"渠道任务执行完成（{task.get('channel', 'channel')}）\n\n{(response or {}).get('message', '')[:2000]}"
        goal_manager.update_execution_phase(
            goal_task_id,
            phase="verify",
            status="done",
            note=note,
            prompt=task.get("message", "")[:500],
        )
    except Exception as e:
        logger.warning(f"渠道任务回写 Goals 失败: {e}")


def _parse_feishu_text_message(message: dict, event: dict) -> str:
    content_value = message.get("content")
    if isinstance(content_value, str) and content_value.strip():
        try:
            parsed_content = json.loads(content_value)
            if isinstance(parsed_content, dict):
                if isinstance(parsed_content.get("text"), str):
                    return parsed_content.get("text", "").strip()
                # post/富文本场景：简单拼接可读文本
                if isinstance(parsed_content.get("post"), dict):
                    segments = []
                    zh_cn = parsed_content.get("post", {}).get("zh_cn", {})
                    for row in zh_cn.get("content", []) if isinstance(zh_cn, dict) else []:
                        if not isinstance(row, list):
                            continue
                        for cell in row:
                            if isinstance(cell, dict) and isinstance(cell.get("text"), str):
                                segments.append(cell.get("text", "").strip())
                    if segments:
                        return " ".join([s for s in segments if s]).strip()
        except Exception:
            return content_value.strip()
    return str(event.get("text") or "").strip()


def _parse_feishu_command(text: str) -> dict:
    cleaned = (text or "").strip()
    if not cleaned:
        return {"cmd": "none"}
    normalized = cleaned.lower()
    if normalized in {"/cks help", "cks help", "/help", "帮助", "命令"}:
        return {"cmd": "help"}
    if normalized in {"/cks commands", "cks commands"}:
        return {"cmd": "help"}
    if normalized in {"/cks status", "cks status", "状态"}:
        return {"cmd": "status"}
    if normalized in {"/cks approvals", "cks approvals", "审批", "待审批"}:
        return {"cmd": "approvals"}
    m = re.match(r"^(?:/cks\s+)?approve\s+([a-f0-9\-]{8,})$", normalized)
    if m:
        return {"cmd": "approve", "approval_id": m.group(1)}
    m = re.match(r"^(?:/cks\s+)?deny\s+([a-f0-9\-]{8,})$", normalized)
    if m:
        return {"cmd": "deny", "approval_id": m.group(1)}
    m = re.match(r"^(?:/cks\s+)?(?:pause|暂停)(?:\s+#?(\d+))?$", normalized)
    if m:
        return {"cmd": "pause", "task_id": int(m.group(1)) if m.group(1) else None}
    m = re.match(r"^(?:/cks\s+)?(?:resume|恢复|继续)(?:\s+#?(\d+))?$", normalized)
    if m:
        return {"cmd": "resume", "task_id": int(m.group(1)) if m.group(1) else None}
    m = re.match(r"^(?:/cks\s+)?(?:cancel|取消)(?:\s+#?(\d+))?$", normalized)
    if m:
        return {"cmd": "cancel", "task_id": int(m.group(1)) if m.group(1) else None}
    m = re.match(r"^(?:/cks\s+)?(?:retry|重试)(?:\s+#?(\d+))?$", normalized)
    if m:
        return {"cmd": "retry", "task_id": int(m.group(1)) if m.group(1) else None}
    m = re.match(r"^(?:/cks\s+)?task\s+#?(\d+)$", normalized)
    if m:
        return {"cmd": "task", "goal_task_id": int(m.group(1))}
    m = re.match(r"^(?:/cks\s+)?run\s+(.+)$", cleaned, re.IGNORECASE)
    if m:
        return {"cmd": "run", "prompt": m.group(1).strip()}
    m = re.match(r"^(?:/cks\s+)?desktop\s+(.+)$", cleaned, re.IGNORECASE)
    if m:
        return {"cmd": "desktop", "prompt": m.group(1).strip()}
    m = re.match(r"^(?:/cks\s+)?computer\s+(.+)$", cleaned, re.IGNORECASE)
    if m:
        return {"cmd": "desktop", "prompt": m.group(1).strip()}
    return {"cmd": "none"}


def _parse_feishu_action_command(event: dict) -> dict:
    action = event.get("action") if isinstance(event, dict) else {}
    if not isinstance(action, dict):
        return {"cmd": "none"}
    value = action.get("value")
    if not isinstance(value, dict):
        return {"cmd": "none"}
    cmd = str(value.get("cmd") or "").strip().lower()
    if cmd in {"approve", "deny"}:
        return {"cmd": cmd, "approval_id": str(value.get("approval_id") or "").strip()}
    if cmd in {"pause", "resume", "cancel"}:
        task_id_raw = str(value.get("task_id") or "").strip()
        task_id = int(task_id_raw) if task_id_raw.isdigit() else None
        return {"cmd": cmd, "task_id": task_id}
    if cmd == "status":
        return {"cmd": "status"}
    if cmd == "help":
        return {"cmd": "help"}
    return {"cmd": "none"}


def _is_duplicate_feishu_inbound(chat_id: str, text: str) -> bool:
    normalized_text = " ".join((text or "").strip().lower().split())
    if not chat_id or not normalized_text:
        return False
    now = time.time()
    key = f"{chat_id}|{normalized_text}"
    last = _feishu_inbound_recent.get(key, 0.0)
    _feishu_inbound_recent[key] = now

    # Trim stale keys opportunistically.
    if len(_feishu_inbound_recent) > 1024:
        expire_before = now - (_FEISHU_INBOUND_DEBOUNCE_SEC * 3)
        for k, ts in list(_feishu_inbound_recent.items()):
            if ts < expire_before:
                _feishu_inbound_recent.pop(k, None)

    return (now - last) <= _FEISHU_INBOUND_DEBOUNCE_SEC


async def _try_send_feishu_chat_reply(receive_id: str, text: str, receive_id_type: str = "chat_id") -> None:
    if not receive_id or not text or not feishu_adapter.configured:
        return
    chunks = _split_feishu_text_chunks(text)
    try:
        for chunk in chunks:
            await feishu_adapter.send_text(
                receive_id=receive_id,
                receive_id_type=receive_id_type,
                text=chunk,
            )
    except Exception as e:
        logger.warning(f"发送 Feishu 回执失败: {e}")


def _split_feishu_text_chunks(text: str, max_len: int = 900) -> list[str]:
    content = (text or "").strip()
    if not content:
        return []
    if len(content) <= max_len:
        return [content]

    chunks: list[str] = []
    current = ""
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", content) if p.strip()]
    for paragraph in paragraphs:
        if len(paragraph) > max_len:
            if current:
                chunks.append(current)
                current = ""
            # Fallback: force split long paragraph by fixed length.
            for i in range(0, len(paragraph), max_len):
                chunks.append(paragraph[i:i + max_len])
            continue
        candidate = paragraph if not current else f"{current}\n\n{paragraph}"
        if len(candidate) <= max_len:
            current = candidate
            continue
        if current:
            chunks.append(current)
        current = paragraph
    if current:
        chunks.append(current)
    return chunks


def _format_feishu_help_text() -> str:
    return "\n".join(
        [
            "【CKS 飞书指令】",
            "- /cks status：查看任务与审批状态",
            "- /cks run <需求>：直接下发通用任务",
            "- /cks desktop <需求>：优先走桌面自动化执行",
            "- /cks task #<任务ID>：绑定目标任务后执行",
            "- /cks approvals：查看待审批列表",
            "- approve <审批ID> / deny <审批ID>：审批决策",
            "- /cks pause #<任务ID>：暂停待执行任务",
            "- /cks resume #<任务ID>：恢复并继续执行",
            "- /cks cancel #<任务ID>：取消任务",
            "- /cks retry #<任务ID>：重试失败或取消的任务",
        ]
    )


def _format_feishu_status_text(
    pending_tasks: int,
    running_tasks: int,
    waiting_approval_tasks: int,
    paused_tasks: int,
    pending_approvals: list[dict],
    chat_id: str = "",
) -> str:
    lines = [
        "【CKS 状态】",
        f"- 待派发任务: {pending_tasks}",
        f"- 执行中任务: {running_tasks}",
        f"- 等待审批任务: {waiting_approval_tasks}",
        f"- 暂停任务: {paused_tasks}",
        f"- 待审批数量: {len(pending_approvals)}",
    ]
    if pending_approvals:
        lines.append("- 最近待审批:")
        for row in pending_approvals[:3]:
            lines.append(
                f"  • {row.get('id', '')[:8]}... | {row.get('tool_name', 'tool')} | 风险 {row.get('risk_level', '-')}"
            )
        lines.append("- 快捷命令: approve <审批ID> / deny <审批ID>")
    else:
        lines.append("- 当前无待审批项。")
    recent_task_lines = _format_feishu_recent_tasks(chat_id=chat_id, limit=3)
    if recent_task_lines:
        lines.append("- 最近任务:")
        lines.extend(recent_task_lines)
    lines.append("- 快捷命令: /cks status | /cks pause #任务ID | /cks resume #任务ID | /cks cancel #任务ID | /cks retry #任务ID")
    return "\n".join(lines)


def _build_feishu_approval_card(approval: dict) -> dict:
    approval_id = str(approval.get("id") or "")
    short_id = f"{approval_id[:8]}..." if approval_id else "unknown"
    tool_name = str(approval.get("tool_name") or "tool")
    risk = str(approval.get("risk_level") or "-")
    return {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": f"待审批 | {short_id}"},
            "template": "orange" if risk.lower() in {"high", "medium"} else "blue",
        },
        "elements": [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"**工具**: `{tool_name}`\n**风险**: `{risk}`\n**审批ID**: `{approval_id}`",
                },
            },
            {
                "tag": "note",
                "elements": [
                    {"tag": "plain_text", "content": "可直接发送指令：approve <审批ID> 或 deny <审批ID>"},
                ],
            },
            {
                "tag": "action",
                "actions": [
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "批准"},
                        "type": "primary",
                        "value": {"cmd": "approve", "approval_id": approval_id},
                    },
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "拒绝"},
                        "type": "danger",
                        "value": {"cmd": "deny", "approval_id": approval_id},
                    },
                ],
            },
        ],
    }


def _build_feishu_approval_result_card(approval_id: str, status: str, operator: str, note: str = "") -> dict:
    normalized = (status or "").strip().lower()
    title = "审批已通过" if normalized == "approved" else "审批已拒绝" if normalized == "denied" else "审批状态更新"
    template = "green" if normalized == "approved" else "red" if normalized == "denied" else "blue"
    lines = [
        f"**审批ID**: `{approval_id}`",
        f"**状态**: `{normalized or status}`",
        f"**操作人**: `{operator}`",
    ]
    if note:
        lines.append(f"**备注**: {note[:200]}")
    return {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": title},
            "template": template,
        },
        "elements": [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": "\n".join(lines),
                },
            }
        ],
    }


def _build_feishu_notice_card(title: str, body_lines: list[str], template: str = "blue") -> dict:
    return {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": title[:60]},
            "template": template,
        },
        "elements": [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": "\n".join([line for line in body_lines if line]).strip()[:1600],
                },
            }
        ],
    }


def _format_feishu_task_started(task_id: int, session_id: str, dispatch_message: str) -> str:
    preview = dispatch_message.strip().replace("\n", " ")
    if len(preview) > 80:
        preview = preview[:80] + "..."
    return "\n".join(
        [
            f"【任务开始】#{task_id}",
            f"- 会话: {session_id}",
            f"- 阶段: 已进入执行",
            f"- 指令: {preview or '(空)'}",
        ]
    )


def _format_feishu_task_done(task_id: int, status: str, tool_calls: list, final_text: str, pending_approval_count: int = 0) -> str:
    normalized_status = _normalize_channel_status(status)
    title = "【任务待审批】" if normalized_status == "waiting_approval" else "【任务完成】"
    lines = [f"{title}#{task_id}", f"- 当前状态: {normalized_status}", f"- 工具调用次数: {len(tool_calls)}"]
    if normalized_status == "waiting_approval":
        lines.append(f"- 待审批条数: {pending_approval_count}")
        lines.append("- 操作建议: 先执行 /cks approvals 查看审批，再执行 approve <审批ID>。")
    if final_text:
        lines.append("- 结果摘要:")
        lines.append(final_text[:1000])
    return "\n".join(lines)


def _format_feishu_task_failed(task_id: int, error: Exception) -> str:
    return "\n".join(
        [
            f"【任务失败】#{task_id}",
            "- 阶段: 执行中断",
            f"- 错误: {str(error)}",
            "- 建议: 可重试 run/desktop 指令，或改为更明确的步骤描述。",
        ]
    )


def _is_allowed_feishu_sender(sender_open_id: str) -> bool:
    raw = str(feishu_runtime_config.get("allowed_senders") or "").strip()
    if not raw:
        return True
    allow = {item.strip() for item in raw.split(",") if item.strip()}
    if not allow:
        return True
    return sender_open_id in allow


def _resolve_approval_id(raw_id: str) -> str:
    value = (raw_id or "").strip().lower()
    if not value:
        return ""
    if len(value) >= 32:
        return value
    pending = approval_store.list_requests(status="pending", limit=200)
    matches = [
        str(item.get("id") or "")
        for item in pending
        if str(item.get("id") or "").lower().startswith(value)
    ]
    if len(matches) == 1:
        return matches[0]
    return value


def _normalize_channel_status(value: str) -> str:
    normalized = (value or "").strip().lower()
    alias_map = {
        "done": "completed",
        "complete": "completed",
        "success": "completed",
        "queued": "pending",
        "in_progress": "running",
        "waiting-approval": "waiting_approval",
        "waitingapproval": "waiting_approval",
        "awaiting_approval": "waiting_approval",
        "awaiting-approval": "waiting_approval",
        "paused": "paused",
        "cancelled": "canceled",
    }
    return alias_map.get(normalized, normalized)


def _channel_status_to_cn(status: str) -> str:
    mapping = {
        "pending": "待执行",
        "running": "执行中",
        "waiting_approval": "待审批",
        "paused": "已暂停",
        "completed": "已完成",
        "failed": "执行失败",
        "canceled": "已取消",
    }
    normalized = _normalize_channel_status(status)
    return mapping.get(normalized, normalized or "未知")


def _format_feishu_recent_tasks(chat_id: str, limit: int = 3) -> list[str]:
    if not chat_id:
        return []
    rows = channel_task_queue.list_for_chat(channel="feishu", chat_id=chat_id, limit=max(1, min(limit, 8)))
    if not rows:
        return []
    lines: list[str] = []
    for row in rows[:limit]:
        task_id = int(row.get("id") or 0)
        status = _channel_status_to_cn(str(row.get("status") or ""))
        message = str(row.get("message") or "").strip().replace("\n", " ")
        if len(message) > 36:
            message = message[:36] + "..."
        lines.append(f"  • #{task_id} | {status} | {message or '(空指令)'}")
    return lines


def _find_latest_feishu_task(chat_id: str, allowed_statuses: set[str] | None = None) -> dict | None:
    rows = channel_task_queue.list_for_chat(channel="feishu", chat_id=chat_id, limit=80)
    if not rows:
        return None
    if not allowed_statuses:
        return rows[0]
    for row in rows:
        if _normalize_channel_status(str(row.get("status") or "")) in allowed_statuses:
            return row
    return None


def _find_waiting_approval_task_for_record(chat_id: str, approval_record: dict) -> dict | None:
    rows = channel_task_queue.list_for_chat(channel="feishu", chat_id=chat_id, limit=80)
    if not rows:
        return None

    payload = approval_record.get("payload") if isinstance(approval_record, dict) else {}
    payload = payload if isinstance(payload, dict) else {}
    approval_session_id = str(payload.get("session_id") or "").strip()

    waiting_rows = [
        row
        for row in rows
        if _normalize_channel_status(str(row.get("status") or "")) == "waiting_approval"
    ]
    if not waiting_rows:
        return None
    if not approval_session_id:
        return waiting_rows[0]

    for row in waiting_rows:
        result = row.get("result") if isinstance(row.get("result"), dict) else {}
        task_session_id = str(result.get("session_id") or "").strip()
        if task_session_id and task_session_id == approval_session_id:
            return row
    return waiting_rows[0]


def _extract_dispatch_message(task: dict) -> str:
    result = task.get("result") if isinstance(task.get("result"), dict) else {}
    dispatched = str(result.get("dispatched_message") or "").strip()
    if dispatched:
        return dispatched
    return str(task.get("message") or "").strip()


def _control_channel_task(task: dict, action: str) -> tuple[dict | None, str]:
    task_id = int(task.get("id") or 0)
    if task_id <= 0:
        return None, "任务不存在。"
    status = _normalize_channel_status(str(task.get("status") or "pending"))

    if action == "pause":
        if status == "pending":
            updated = channel_task_queue.mark_status(task_id, "paused")
            return updated, f"任务 #{task_id} 已暂停。"
        if status == "paused":
            return task, f"任务 #{task_id} 已经是暂停状态。"
        if status == "running":
            return task, f"任务 #{task_id} 正在执行，当前版本暂不支持中断运行中的任务。"
        return task, f"任务 #{task_id} 当前状态为 {status}，无法暂停。"

    if action == "resume":
        if status in {"paused", "waiting_approval"}:
            updated = channel_task_queue.mark_status(task_id, "pending")
            return updated, f"任务 #{task_id} 已恢复到待执行队列。"
        if status == "pending":
            return task, f"任务 #{task_id} 已在待执行队列中。"
        if status == "running":
            return task, f"任务 #{task_id} 正在执行中，无需恢复。"
        return task, f"任务 #{task_id} 当前状态为 {status}，无法恢复。"

    if action == "cancel":
        if status in {"pending", "paused", "waiting_approval"}:
            updated = channel_task_queue.mark_status(task_id, "canceled")
            return updated, f"任务 #{task_id} 已取消。"
        if status in {"completed", "failed", "canceled"}:
            return task, f"任务 #{task_id} 已结束（{status}），无需取消。"
        if status == "running":
            return task, f"任务 #{task_id} 正在执行，当前版本暂不支持强制中止。"
        return task, f"任务 #{task_id} 当前状态为 {status}，无法取消。"

    return task, f"暂不支持的控制动作: {action}"


def _prepare_retry_channel_task(task: dict) -> tuple[dict | None, str]:
    task_id = int(task.get("id") or 0)
    if task_id <= 0:
        return None, "任务不存在。"
    status = _normalize_channel_status(str(task.get("status") or "pending"))
    if status not in {"failed", "canceled"}:
        return task, f"任务 #{task_id} 当前状态为 {status}，仅失败/已取消任务可重试。"
    updated = channel_task_queue.mark_status(task_id, "pending")
    return updated, f"任务 #{task_id} 已加入重试队列。"


@app.post("/approvals/request")
async def create_execution_approval(request: ExecutionApprovalRequest):
    """创建一条执行审批记录（供高风险工具/渠道任务复用）"""
    try:
        record = approval_store.create_request(
            source=request.source,
            organization_id=request.organization_id,
            tool_name=request.tool_name,
            risk_level=request.risk_level,
            payload=request.payload,
            ttl_seconds=request.ttl_seconds,
        )
        return {"success": True, "record": record}
    except Exception as e:
        logger.error(f"创建审批请求失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/approvals")
async def list_execution_approvals(
    status: str = "",
    limit: int = 50,
    organization_id: str = "",
    session_id: str = "",
):
    """查询审批记录"""
    try:
        items = approval_store.list_requests(
            status=status.strip() or None,
            limit=limit,
            organization_id=organization_id.strip() or None,
            session_id=session_id.strip() or None,
        )
        return {"success": True, "items": items, "total": len(items)}
    except Exception as e:
        logger.error(f"查询审批记录失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/approvals/{request_id}/decision")
async def decide_execution_approval(request_id: str, request: ExecutionApprovalDecisionRequest):
    """审批通过/拒绝"""
    try:
        record = approval_store.decide_request(
            request_id=request_id,
            decision=request.decision,
            decided_by=request.decided_by,
            note=request.note,
        )
        return {"success": True, "record": record}
    except Exception as e:
        logger.error(f"审批决策失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/channels/feishu/events")
async def feishu_events(payload: dict, request: Request):
    """
    Feishu/Lark 事件入口（MVP）：
    - 处理 challenge
    - 处理 message 事件并入队
    """
    try:
        if not isinstance(payload, dict):
            return {"success": False, "error": "invalid payload"}

        header_map = {k.lower(): v for k, v in request.headers.items()}
        raw_body = (await request.body()).decode("utf-8", errors="ignore")
        if not feishu_adapter.verify_event(payload, header_map, raw_body):
            return {"success": False, "error": "verification failed"}

        challenge = feishu_adapter.extract_challenge(payload)
        if challenge:
            return {"challenge": challenge}

        event = payload.get("event") or {}
        message = event.get("message") or {}
        sender = event.get("sender") or {}
        context = event.get("context") or {}
        operator = event.get("operator") or {}

        chat_id = str(
            message.get("chat_id")
            or event.get("chat_id")
            or context.get("open_chat_id")
            or context.get("chat_id")
            or ""
        ).strip()
        sender_open_id = str(
            (sender.get("sender_id") or {}).get("open_id")
            or operator.get("open_id")
            or ""
        ).strip()
        event_header = payload.get("header") if isinstance(payload.get("header"), dict) else {}
        event_id = str(event_header.get("event_id") or "").strip()
        message_id = str(message.get("message_id") or event.get("message_id") or "").strip()
        external_id = message_id or event_id
        text = _parse_feishu_text_message(message, event)

        cmd = _parse_feishu_action_command(event)
        if cmd.get("cmd") == "none":
            cmd = _parse_feishu_command(text)

        if not chat_id or (not text and cmd.get("cmd") == "none"):
            return {"success": True, "ignored": True, "reason": "missing chat_id or text"}
        if not _is_allowed_feishu_sender(sender_open_id):
            await _try_send_feishu_chat_reply(chat_id, "当前账号未在允许列表中，请联系管理员开通。")
            return {"success": False, "error": "sender not allowed"}
        if _is_duplicate_feishu_inbound(chat_id=chat_id, text=text):
            await _try_send_feishu_chat_reply(chat_id, "收到重复指令，已忽略本次请求（防抖生效，避免重复执行）。")
            return {"success": True, "ignored": True, "reason": "duplicate-inbound"}
        if external_id:
            existing_task = channel_task_queue.get_by_external_id(channel="feishu", external_id=external_id)
            if existing_task:
                await _try_send_feishu_chat_reply(
                    chat_id,
                    f"检测到重复事件，任务 #{existing_task.get('id')} 已存在（状态: {_channel_status_to_cn(str(existing_task.get('status') or 'pending'))}）。",
                )
                return {"success": True, "ignored": True, "reason": "duplicate-external-id", "task": existing_task}

        if cmd.get("cmd") == "help":
            await _try_send_feishu_chat_reply(chat_id, _format_feishu_help_text())
            return {"success": True, "handled": "help"}
        if cmd.get("cmd") in {"status", "approvals"}:
            pending_tasks = channel_task_queue.list(status="pending", channel="feishu", limit=100)
            running_tasks = channel_task_queue.list(status="running", channel="feishu", limit=100)
            waiting_approval_tasks = channel_task_queue.list(status="waiting_approval", channel="feishu", limit=100)
            paused_tasks = channel_task_queue.list(status="paused", channel="feishu", limit=100)
            pending_approvals = approval_store.list_requests(status="pending", limit=20)
            await _try_send_feishu_chat_reply(
                chat_id,
                _format_feishu_status_text(
                    len(pending_tasks),
                    len(running_tasks),
                    len(waiting_approval_tasks),
                    len(paused_tasks),
                    pending_approvals,
                    chat_id=chat_id,
                ),
            )
            send_cards = bool(feishu_runtime_config.get("enable_approval_card", True))
            if send_cards and feishu_adapter.configured:
                for approval in pending_approvals[:2]:
                    try:
                        await feishu_adapter.send_interactive(
                            receive_id=chat_id,
                            receive_id_type="chat_id",
                            card=_build_feishu_approval_card(approval),
                        )
                    except Exception as card_error:
                        logger.warning(f"发送 Feishu 审批卡片失败: {card_error}")
            return {"success": True, "handled": cmd.get("cmd")}
        if cmd.get("cmd") in {"pause", "resume", "cancel", "retry"}:
            requested_task_id = cmd.get("task_id")
            target = channel_task_queue.get(int(requested_task_id)) if requested_task_id else None
            if target and target.get("chat_id") != chat_id:
                await _try_send_feishu_chat_reply(chat_id, f"任务 #{requested_task_id} 不在当前会话内，无法直接控制。")
                return {"success": False, "error": "task not in current chat"}
            if not target:
                allowed_statuses = {"pending", "paused", "waiting_approval", "running"}
                if str(cmd.get("cmd") or "") == "retry":
                    allowed_statuses = {"failed", "canceled"}
                target = _find_latest_feishu_task(
                    chat_id=chat_id,
                    allowed_statuses=allowed_statuses,
                )
            if not target:
                await _try_send_feishu_chat_reply(chat_id, "当前会话没有可控制的任务。")
                return {"success": False, "error": "no controllable task"}

            current_cmd = str(cmd.get("cmd") or "")
            if current_cmd == "retry":
                updated, tip = _prepare_retry_channel_task(target)
            else:
                updated, tip = _control_channel_task(target, action=current_cmd)
            await _try_send_feishu_chat_reply(chat_id, tip)
            if current_cmd in {"resume", "retry"} and updated and _normalize_channel_status(str(updated.get("status") or "")) == "pending":
                try:
                    session_id = f"channel:feishu:{chat_id}"
                    action_desc = "已恢复" if current_cmd == "resume" else "已重试"
                    await _try_send_feishu_chat_reply(chat_id, f"【进度】#{updated['id']} {action_desc}，正在重新派发执行。")
                    updated, response = await _dispatch_channel_task_internal(
                        task_id=int(updated["id"]),
                        user_id=f"feishu:{sender_open_id or 'user'}",
                        session_id=session_id,
                        use_memory=True,
                        message_override=_extract_dispatch_message(updated),
                    )
                    _try_writeback_goal_task_from_channel_task(updated, response)
                    final_text = (response.get("message", "") or "").strip()
                    pending_approval_count = int((updated.get("result") or {}).get("pending_approval_count") or 0)
                    await _try_send_feishu_chat_reply(
                        chat_id,
                        _format_feishu_task_done(
                            int(updated["id"]),
                            str(updated.get("status") or ""),
                            response.get("tool_calls") or [],
                            final_text,
                            pending_approval_count=pending_approval_count,
                        ),
                    )
                    return {"success": True, "task": updated, "handled": cmd.get("cmd"), "auto_dispatched": True}
                except Exception as dispatch_error:
                    failed = channel_task_queue.mark_status(
                        int(updated["id"]),
                        "failed",
                        result={"error": str(dispatch_error)},
                    )
                    await _try_send_feishu_chat_reply(chat_id, _format_feishu_task_failed(int(updated["id"]), dispatch_error))
                    return {"success": False, "task": failed, "error": str(dispatch_error)}
            return {"success": True, "handled": cmd.get("cmd"), "task": updated}
        if cmd.get("cmd") in {"approve", "deny"}:
            decision = "approved" if cmd.get("cmd") == "approve" else "denied"
            approval_id = _resolve_approval_id(str(cmd.get("approval_id") or ""))
            try:
                record = approval_store.decide_request(
                    approval_id,
                    decision=decision,
                    decided_by=f"feishu:{sender_open_id or 'user'}",
                    note=f"Feishu 指令: {text[:120]}",
                )
                operator = f"feishu:{sender_open_id or 'user'}"
                await _try_send_feishu_chat_reply(
                    chat_id,
                    "\n".join(
                        [
                            "【审批更新】",
                            f"- 审批ID: {approval_id}",
                            f"- 状态: {record.get('status')}",
                            f"- 操作人: {operator}",
                        ]
                    ),
                )
                send_cards = bool(feishu_runtime_config.get("enable_approval_card", True))
                if send_cards and feishu_adapter.configured:
                    try:
                        await feishu_adapter.send_interactive(
                            receive_id=chat_id,
                            receive_id_type="chat_id",
                            card=_build_feishu_approval_result_card(
                                approval_id=approval_id,
                                status=str(record.get("status") or decision),
                                operator=operator,
                                note=f"来源: {text[:120]}",
                            ),
                        )
                    except Exception as card_error:
                        logger.warning(f"发送 Feishu 审批结果卡片失败: {card_error}")
                linked_task = _find_waiting_approval_task_for_record(chat_id=chat_id, approval_record=record)
                if not linked_task:
                    return {"success": True, "handled": cmd.get("cmd"), "record": record}

                linked_task_id = int(linked_task.get("id") or 0)
                if linked_task_id <= 0:
                    return {"success": True, "handled": cmd.get("cmd"), "record": record}

                if decision == "denied":
                    denied_note = str(record.get("note") or "审批拒绝")
                    failed_task = channel_task_queue.mark_status(
                        linked_task_id,
                        "failed",
                        result={
                            "error": f"审批拒绝，任务终止：{denied_note}",
                            "approval_id": approval_id,
                            "approval_status": "denied",
                            "session_id": str((linked_task.get("result") or {}).get("session_id") or ""),
                        },
                    )
                    await _try_send_feishu_chat_reply(
                        chat_id,
                        f"【任务终止】#{linked_task_id}\n- 原因: 审批已拒绝\n- 说明: 如需继续，请调整需求后重新下发。",
                    )
                    return {
                        "success": True,
                        "handled": cmd.get("cmd"),
                        "record": record,
                        "task": failed_task,
                        "auto_followup": "terminated",
                    }

                try:
                    resumed = channel_task_queue.mark_status(linked_task_id, "pending")
                    session_id = str((record.get("payload") or {}).get("session_id") or "").strip()
                    if not session_id:
                        session_id = str((linked_task.get("result") or {}).get("session_id") or "").strip()
                    if not session_id:
                        session_id = f"channel:feishu:{chat_id}"
                    dispatch_message = _extract_dispatch_message(linked_task)
                    await _try_send_feishu_chat_reply(
                        chat_id,
                        f"【审批后续跑】#{linked_task_id}\n- 状态: 已恢复执行\n- 会话: {session_id}",
                    )
                    resumed, resumed_response = await _dispatch_channel_task_internal(
                        task_id=linked_task_id,
                        user_id=f"feishu:{sender_open_id or 'user'}",
                        session_id=session_id,
                        use_memory=True,
                        message_override=dispatch_message,
                    )
                    _try_writeback_goal_task_from_channel_task(resumed, resumed_response)
                    final_text = (resumed_response.get("message", "") or "").strip()
                    pending_approval_count = int((resumed.get("result") or {}).get("pending_approval_count") or 0)
                    await _try_send_feishu_chat_reply(
                        chat_id,
                        _format_feishu_task_done(
                            linked_task_id,
                            str(resumed.get("status") or ""),
                            resumed_response.get("tool_calls") or [],
                            final_text,
                            pending_approval_count=pending_approval_count,
                        ),
                    )
                    return {
                        "success": True,
                        "handled": cmd.get("cmd"),
                        "record": record,
                        "task": resumed,
                        "auto_followup": "resumed",
                    }
                except Exception as follow_error:
                    failed_task = channel_task_queue.mark_status(
                        linked_task_id,
                        "failed",
                        result={"error": f"审批通过后自动续跑失败: {str(follow_error)}"},
                    )
                    await _try_send_feishu_chat_reply(
                        chat_id,
                        f"【续跑失败】#{linked_task_id}\n- 错误: {str(follow_error)}\n- 建议: 可在桌面端点击“接管到工作台”手动处理。",
                    )
                    return {
                        "success": False,
                        "handled": cmd.get("cmd"),
                        "record": record,
                        "task": failed_task,
                        "error": str(follow_error),
                    }
            except Exception as approval_error:
                existing = approval_store.get_request(approval_id) if approval_id else None
                if existing:
                    status = str(existing.get("status") or "unknown")
                    decided_by = str(existing.get("decided_by") or "system")
                    await _try_send_feishu_chat_reply(
                        chat_id,
                        "\n".join(
                            [
                                "【审批提示】该审批已被处理，无需重复操作。",
                                f"- 审批ID: {approval_id}",
                                f"- 当前状态: {status}",
                                f"- 处理人: {decided_by}",
                            ]
                        ),
                    )
                    send_cards = bool(feishu_runtime_config.get("enable_approval_card", True))
                    if send_cards and feishu_adapter.configured:
                        try:
                            await feishu_adapter.send_interactive(
                                receive_id=chat_id,
                                receive_id_type="chat_id",
                                card=_build_feishu_notice_card(
                                    title="审批已处理",
                                    body_lines=[
                                        f"**审批ID**: `{approval_id}`",
                                        f"**状态**: `{status}`",
                                        f"**处理人**: `{decided_by}`",
                                        "**说明**: 该审批已完成处理，你可以执行 `/cks approvals` 查看最新队列。",
                                    ],
                                    template="grey",
                                ),
                            )
                        except Exception as card_error:
                            logger.warning(f"发送 Feishu 冲突提示卡片失败: {card_error}")
                    return {"success": True, "handled": "already-decided", "record": existing}

                await _try_send_feishu_chat_reply(chat_id, f"审批失败：{approval_error}")
                send_cards = bool(feishu_runtime_config.get("enable_approval_card", True))
                if send_cards and feishu_adapter.configured:
                    try:
                        await feishu_adapter.send_interactive(
                            receive_id=chat_id,
                            receive_id_type="chat_id",
                            card=_build_feishu_notice_card(
                                title="审批失败",
                                body_lines=[
                                    f"**审批ID**: `{approval_id or 'unknown'}`",
                                    f"**错误**: {str(approval_error)[:240]}",
                                    "**建议**: 使用 `/cks approvals` 刷新状态后重试。",
                                ],
                                template="red",
                            ),
                        )
                    except Exception as card_error:
                        logger.warning(f"发送 Feishu 失败提示卡片失败: {card_error}")
                return {"success": False, "error": str(approval_error)}

        task = channel_task_queue.enqueue(
            channel="feishu",
            external_id=external_id,
            sender_id=sender_open_id or "unknown",
            chat_id=chat_id,
            message=text,
            metadata={
                "raw_event_type": payload.get("header", {}).get("event_type", ""),
                "event_id": event_id,
                "message_id": message_id,
                "raw": payload,
                "receive_id": chat_id,
                "receive_id_type": "chat_id",
                **({"goal_task_id": cmd.get("goal_task_id")} if cmd.get("cmd") == "task" else {}),
            },
        )
        auto_dispatch = bool(feishu_runtime_config.get("auto_dispatch", True))
        if cmd.get("cmd") in {"run", "task", "desktop"}:
            auto_dispatch = True
        if auto_dispatch:
            if cmd.get("cmd") == "desktop" and cmd.get("prompt"):
                dispatch_message = (
                    "请优先使用桌面工具链完成以下任务，并回报可验证产物路径：\n"
                    f"{cmd.get('prompt')}"
                )
            elif cmd.get("cmd") == "run" and cmd.get("prompt"):
                dispatch_message = str(cmd.get("prompt"))
            else:
                dispatch_message = text
            try:
                session_id = f"channel:feishu:{chat_id}"
                await _try_send_feishu_chat_reply(
                    chat_id,
                    _format_feishu_task_started(task["id"], session_id, dispatch_message),
                )
                await _try_send_feishu_chat_reply(chat_id, f"【进度】#{task['id']} 阶段2/3：正在调用 Agent 与工具链…")
                updated, response = await _dispatch_channel_task_internal(
                    task_id=task["id"],
                    user_id=f"feishu:{sender_open_id or 'user'}",
                    session_id=session_id,
                    use_memory=True,
                    message_override=dispatch_message,
                )
                _try_writeback_goal_task_from_channel_task(updated, response)
                tool_calls = response.get("tool_calls") or []
                final_text = (response.get("message", "") or "").strip()
                pending_approval_count = int((updated.get("result") or {}).get("pending_approval_count") or 0)
                await _try_send_feishu_chat_reply(chat_id, "【进度】阶段3/3：执行结果已回写，准备回执。")
                await _try_send_feishu_chat_reply(
                    chat_id,
                    _format_feishu_task_done(
                        task["id"],
                        str(updated.get("status") or ""),
                        tool_calls,
                        final_text,
                        pending_approval_count=pending_approval_count,
                    ),
                )
                return {"success": True, "task": updated, "auto_dispatched": True}
            except Exception as dispatch_error:
                failed = channel_task_queue.mark_status(
                    task["id"],
                    "failed",
                    result={"error": str(dispatch_error)},
                )
                await _try_send_feishu_chat_reply(chat_id, _format_feishu_task_failed(task["id"], dispatch_error))
                return {"success": False, "task": failed, "error": str(dispatch_error)}

        await _try_send_feishu_chat_reply(chat_id, f"已接收任务 #{task['id']}，稍后执行。")
        return {"success": True, "task": task, "queued": True}
    except Exception as e:
        logger.error(f"Feishu events 处理失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/channels/feishu/outbound")
async def feishu_outbound(request: FeishuOutboundRequest):
    """发送文本消息到 Feishu（MVP）"""
    try:
        if not feishu_adapter.configured:
            return {"success": False, "error": "Feishu adapter not configured (FEISHU_APP_ID/SECRET missing)"}
        result = await feishu_adapter.send_text(
            receive_id=request.receive_id,
            text=request.text,
            receive_id_type=request.receive_id_type,
        )
        return result
    except Exception as e:
        logger.error(f"Feishu outbound 失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/channels/feishu/config")
async def get_feishu_config():
    """获取当前飞书机器人配置（敏感字段脱敏）"""
    return {
        "success": True,
        "config": _redact_feishu_config(feishu_runtime_config),
        "configured": bool(feishu_adapter.configured),
    }


@app.post("/channels/feishu/config")
async def update_feishu_config(request: FeishuConfigUpdateRequest):
    """更新飞书机器人配置并持久化到 data/feishu_config.json"""
    try:
        next_config = {
            "app_id": request.app_id.strip(),
            "app_secret": _resolve_secret_field("app_secret", request.app_secret),
            "verification_token": _resolve_secret_field("verification_token", request.verification_token),
            "encrypt_key": _resolve_secret_field("encrypt_key", request.encrypt_key),
            "domain": (request.domain.strip().lower() or "feishu"),
            "auto_dispatch": bool(request.auto_dispatch),
            "enable_approval_card": bool(request.enable_approval_card),
            "allowed_senders": request.allowed_senders.strip(),
            "signature_tolerance_sec": max(0, int(request.signature_tolerance_sec)),
            "replay_cache_size": max(32, int(request.replay_cache_size)),
        }
        _save_feishu_config(next_config)
        _apply_feishu_runtime_config(next_config)
        return {
            "success": True,
            "config": _redact_feishu_config(feishu_runtime_config),
            "configured": bool(feishu_adapter.configured),
        }
    except Exception as e:
        logger.error(f"更新飞书配置失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/channels/feishu/config/test")
async def test_feishu_config(request: FeishuConfigTestRequest):
    """测试飞书配置连通性，可选发送探测消息。"""
    try:
        if not feishu_adapter.configured:
            return {"success": False, "error": "飞书配置不完整：缺少 app_id 或 app_secret"}
        token = await feishu_adapter._get_tenant_access_token()
        result = {"success": True, "token_ok": bool(token)}
        if request.send_probe:
            if not request.receive_id.strip():
                return {"success": False, "error": "发送探测消息时必须提供 receive_id"}
            send_result = await feishu_adapter.send_text(
                receive_id=request.receive_id.strip(),
                receive_id_type=request.receive_id_type.strip() or "chat_id",
                text=request.text.strip() or "CKS 飞书连通性测试成功",
            )
            result["probe"] = send_result
            result["success"] = bool(send_result.get("success"))
        return result
    except Exception as e:
        logger.error(f"测试飞书配置失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/channels/feishu/config/diagnose")
async def diagnose_feishu_config(request: Request, include_probe: int = 1, public_base_url: str = ""):
    """一键诊断飞书机器人配置，并返回建议的回调地址。"""
    try:
        base_url = (
            (public_base_url or "").strip()
            or os.getenv("CKS_PUBLIC_API_BASE_URL", "").strip()
            or str(request.base_url).rstrip("/")
        )
        callback_urls = _build_feishu_callback_urls(base_url)
        checks = _build_feishu_diagnostic_checks(callback_urls)

        probe_ok = False
        if include_probe and feishu_adapter.configured:
            try:
                token = await feishu_adapter._get_tenant_access_token()
                probe_ok = bool(token)
                checks.append({
                    "id": "token_probe",
                    "title": "鉴权连通性",
                    "status": "pass" if probe_ok else "fail",
                    "detail": "tenant_access_token 获取成功。" if probe_ok else "无法获取 tenant_access_token。",
                    "action": "" if probe_ok else "检查 App ID / App Secret 是否正确，确认应用已发布并开通机器人权限。",
                })
            except Exception as e:
                checks.append({
                    "id": "token_probe",
                    "title": "鉴权连通性",
                    "status": "fail",
                    "detail": f"鉴权失败：{e}",
                    "action": "检查应用凭据、飞书开放平台权限与网络连通性。",
                })

        return {
            "success": True,
            "configured": bool(feishu_adapter.configured),
            "probe_ok": probe_ok if include_probe else None,
            "checks": checks,
            "callback_urls": callback_urls,
        }
    except Exception as e:
        logger.error(f"诊断飞书配置失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/channels/feishu/commands")
async def feishu_commands():
    """返回 Feishu 机器人支持的命令列表（用于前端提示/文档）"""
    return {
        "success": True,
        "commands": [
            {"cmd": "/cks status", "description": "查看任务与审批状态"},
            {"cmd": "approve <审批ID>", "description": "批准指定审批（支持短ID前缀）"},
            {"cmd": "deny <审批ID>", "description": "拒绝指定审批（支持短ID前缀）"},
            {"cmd": "run <任务描述>", "description": "普通自动执行"},
            {"cmd": "desktop <任务描述>", "description": "桌面工具优先执行"},
            {"cmd": "computer <任务描述>", "description": "desktop 的同义命令"},
            {"cmd": "task <任务ID>", "description": "绑定 Goal 任务并执行"},
        ],
    }


@app.post("/channels/feishu/inbound")
async def feishu_inbound(request: ChannelInboundMessageRequest):
    """Feishu 入站消息入口（调试/MVP 手工注入）。"""
    try:
        metadata = request.metadata if isinstance(request.metadata, dict) else {}
        external_id = str(
            metadata.get("external_id")
            or metadata.get("event_id")
            or metadata.get("message_id")
            or ""
        ).strip()
        item = channel_task_queue.enqueue(
            channel=request.channel or "feishu",
            external_id=external_id,
            sender_id=request.sender_id,
            chat_id=request.chat_id,
            message=request.message,
            metadata=metadata,
        )
        if request.auto_dispatch:
            dispatch_session_id = f"channel:{item['channel']}:{item['chat_id']}"
            try:
                item, response = await _dispatch_channel_task_internal(
                    task_id=item["id"],
                    user_id=request.user_id,
                    session_id=dispatch_session_id,
                    use_memory=True,
                )
                _try_writeback_goal_task_from_channel_task(item, response)
                if feishu_adapter.configured:
                    receive_id = (item.get("metadata") or {}).get("receive_id") or request.sender_id
                    receive_id_type = (item.get("metadata") or {}).get("receive_id_type") or "open_id"
                    await _try_send_feishu_chat_reply(
                        str(receive_id),
                        response.get("message", "") or "任务已执行完成。",
                        str(receive_id_type),
                    )
            except Exception as dispatch_error:
                item = channel_task_queue.mark_status(
                    item["id"],
                    "failed",
                    result={"error": str(dispatch_error)},
                )
        return {"success": True, "task": item}
    except Exception as e:
        logger.error(f"Feishu 入站处理失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/channels/tasks")
async def list_channel_tasks(channel: str = "", status: str = "", limit: int = 50):
    """查询渠道任务队列（飞书/企业微信/钉钉后续复用）"""
    try:
        normalized_status = _normalize_channel_status(status)
        rows = channel_task_queue.list(
            channel=channel.strip() or None,
            status=normalized_status or None,
            limit=limit,
        )
        return {"success": True, "tasks": rows, "total": len(rows)}
    except Exception as e:
        logger.error(f"查询渠道任务失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/channels/tasks/{task_id}/dispatch")
async def dispatch_channel_task(task_id: int, request: ChannelTaskDispatchRequest):
    """手动派发渠道任务到 Agent（用于老板看板/飞书任务）"""
    try:
        task = channel_task_queue.get(task_id)
        if not task:
            return {"success": False, "error": f"任务不存在: {task_id}"}

        task_status = _normalize_channel_status(str(task.get("status") or ""))
        if task_status == "running":
            return {"success": False, "error": "任务正在执行中"}
        if task_status in {"completed", "failed", "canceled"}:
            return {"success": False, "error": f"任务已结束（{task_status}），无法再次派发"}

        session_id = request.session_id or f"channel:{task['channel']}:{task['chat_id']}"
        try:
            task, response = await _dispatch_channel_task_internal(
                task_id=task_id,
                user_id=request.user_id,
                session_id=session_id,
                use_memory=request.use_memory,
            )
            _try_writeback_goal_task_from_channel_task(task, response)
            if task.get("channel") == "feishu" and feishu_adapter.configured:
                receive_id = task.get("sender_id") or ""
                if receive_id:
                    receive_id_type = (task.get("metadata") or {}).get("receive_id_type") or "open_id"
                    await _try_send_feishu_chat_reply(
                        str(receive_id),
                        response.get("message", "") or "任务已执行完成。",
                        str(receive_id_type),
                    )
            return {"success": True, "task": task}
        except Exception as dispatch_error:
            task = channel_task_queue.mark_status(
                task_id,
                "failed",
                result={"error": str(dispatch_error)},
            )
            return {"success": False, "error": str(dispatch_error), "task": task}
    except Exception as e:
        logger.error(f"派发渠道任务失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/channels/tasks/{task_id}/control")
async def control_channel_task(task_id: int, action: str):
    """控制渠道任务状态：pause | resume | cancel | retry"""
    try:
        normalized_action = (action or "").strip().lower()
        if normalized_action not in {"pause", "resume", "cancel", "retry"}:
            return {"success": False, "error": f"不支持的动作: {normalized_action}"}

        task = channel_task_queue.get(task_id)
        if not task:
            return {"success": False, "error": f"任务不存在: {task_id}"}

        if normalized_action == "retry":
            updated, tip = _prepare_retry_channel_task(task)
        else:
            updated, tip = _control_channel_task(task, normalized_action)
        return {"success": True, "task": updated or task, "message": tip}
    except Exception as e:
        logger.error(f"控制渠道任务失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/search")
async def web_search(
    query: str,
    num_results: int = 5,
    site: str = None,
    time_range: str = None
):
    """联网搜索 (UAPI)"""
    try:
        response = await agent.web_search.search(
            query=query,
            num_results=num_results,
            site=site,
            time_range=time_range
        )

        return {
            "success": response.success,
            "results": [
                {
                    "title": r.title,
                    "url": r.url,
                    "snippet": r.snippet,
                    "content": r.content
                }
                for r in response.results
            ],
            "provider": response.provider,
            "error": response.error
        }
    except Exception as e:
        logger.error(f"联网搜索错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/goals/tree")
async def get_goals_tree(organization_id: str = None):
    """获取 KPI/OKR/项目/任务树"""
    try:
        return {"success": True, "data": goal_manager.get_tree(organization_id=organization_id)}
    except Exception as e:
        logger.error(f"获取 goals tree 失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/goals/tasks")
async def list_goal_tasks(
    organization_id: str = None,
    task_id: int = None,
    assignee: str = None,
    department: str = None,
    status: str = None,
    review_status: str = None,
    handoff_status: str = None,
    handoff_owner: str = None,
    from_time: str = None,
    to_time: str = None,
    limit: int = 200,
):
    try:
        rows = goal_manager.list_tasks(
            organization_id=organization_id,
            task_id=task_id,
            assignee=assignee,
            department=department,
            status=status,
            review_status=review_status,
            handoff_status=handoff_status,
            handoff_owner=handoff_owner,
            from_time=from_time,
            to_time=to_time,
            limit=limit,
        )
        return {"success": True, "tasks": rows, "total": len(rows)}
    except Exception as e:
        logger.error(f"List goals tasks failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/goals/dashboard")
async def get_goals_dashboard(
    organization_id: str = None,
    from_time: str = None,
    to_time: str = None,
    limit: int = 2000,
):
    try:
        data = goal_manager.get_dashboard_data(
            organization_id=organization_id,
            from_time=from_time,
            to_time=to_time,
            limit=limit,
        )
        return {"success": True, **data}
    except Exception as e:
        logger.error(f"Get goals dashboard failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/goals/dashboard/next-task")
async def set_goals_dashboard_next_task(request: GoalDashboardNextTaskRequest):
    try:
        ok = goal_manager.set_assignee_next_task(
            assignee=request.assignee,
            task_id=request.task_id,
            organization_id=request.organization_id,
        )
        if not ok:
            return {"success": False, "error": "Task not found for assignee"}
        return {"success": True}
    except Exception as e:
        logger.error(f"Set goals dashboard next task failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/goals/kpi")
async def create_kpi(request: GoalKPIRequest):
    try:
        kpi_id = goal_manager.create_kpi(request.title, request.description, organization_id=request.organization_id)
        return {"success": True, "id": kpi_id}
    except Exception as e:
        logger.error(f"创建 KPI 失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/goals/okr")
async def create_okr(request: GoalOKRRequest):
    try:
        okr_id = goal_manager.create_okr(request.kpi_id, request.title, request.description)
        return {"success": True, "id": okr_id}
    except Exception as e:
        logger.error(f"创建 OKR 失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/goals/project")
async def create_project(request: GoalProjectRequest):
    try:
        project_id = goal_manager.create_project(request.okr_id, request.title, request.description)
        return {"success": True, "id": project_id}
    except Exception as e:
        logger.error(f"创建项目失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/goals/task")
async def create_task(request: GoalTaskRequest):
    try:
        task_id = goal_manager.create_task(
            project_id=request.project_id,
            title=request.title,
            description=request.description,
            assignee=request.assignee,
            department=request.department,
        )
        return {"success": True, "id": task_id}
    except Exception as e:
        logger.error(f"创建任务失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.delete("/goals/task/{task_id}")
async def delete_task(task_id: int):
    try:
        ok = goal_manager.delete_task(task_id)
        if not ok:
            return {"success": False, "error": "Task not found"}
        return {"success": True}
    except Exception as e:
        logger.error(f"Delete task failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.delete("/goals/project/{project_id}")
async def delete_project(project_id: int):
    try:
        ok = goal_manager.delete_project(project_id)
        if not ok:
            return {"success": False, "error": "Project not found"}
        return {"success": True}
    except Exception as e:
        logger.error(f"Delete project failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.delete("/goals/okr/{okr_id}")
async def delete_okr(okr_id: int):
    try:
        ok = goal_manager.delete_okr(okr_id)
        if not ok:
            return {"success": False, "error": "OKR not found"}
        return {"success": True}
    except Exception as e:
        logger.error(f"Delete okr failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.delete("/goals/kpi/{kpi_id}")
async def delete_kpi(kpi_id: int):
    try:
        ok = goal_manager.delete_kpi(kpi_id)
        if not ok:
            return {"success": False, "error": "KPI not found"}
        return {"success": True}
    except Exception as e:
        logger.error(f"Delete kpi failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/goals/task/{task_id}/complete")
async def complete_task(task_id: int):
    try:
        ok = goal_manager.complete_task(task_id)
        if not ok:
            return {"success": False, "error": "Task not found"}
        return {"success": True}
    except Exception as e:
        logger.error(f"完成任务失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/goals/task/{task_id}/review")
async def review_task(task_id: int, request: GoalTaskReviewRequest):
    try:
        ok = goal_manager.review_task(
            task_id=task_id,
            decision=request.decision,
            reason=request.reason,
            reviewed_by=request.reviewed_by,
        )
        if not ok:
            return {"success": False, "error": "Task not found or invalid decision"}

        try:
            if agent.audit_logger:
                if request.decision == "reject":
                    agent.audit_logger.log_error(
                        user_id=request.reviewed_by or "manager",
                        session_id=f"goals-review-{task_id}",
                        tool_name="goal_task_review",
                        tool_input={"task_id": task_id, "decision": request.decision, "reason": request.reason},
                        error=request.reason or "Task rejected by reviewer",
                        duration_ms=0,
                        goal_task_id=task_id,
                    )
                else:
                    agent.audit_logger.log_execution(
                        user_id=request.reviewed_by or "manager",
                        session_id=f"goals-review-{task_id}",
                        tool_name="goal_task_review",
                        tool_input={"task_id": task_id, "decision": request.decision, "reason": request.reason},
                        success=True,
                        duration_ms=0,
                        message=request.reason or "Task accepted by reviewer",
                        goal_task_id=task_id,
                    )
        except Exception as audit_error:
            logger.warning(f"Failed to write task review audit log: {audit_error}")

        return {"success": True}
    except Exception as e:
        logger.error(f"Review task failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/goals/task/{task_id}/handoff/claim")
async def claim_goal_task_handoff(task_id: int, request: GoalTaskHandoffClaimRequest):
    try:
        ok = goal_manager.claim_task_handoff(
            task_id=task_id,
            owner=request.owner,
            note=request.note,
        )
        if not ok:
            return {"success": False, "error": "Task not found, not rejected, or invalid owner"}
        return {"success": True}
    except Exception as e:
        logger.error(f"Claim task handoff failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/goals/task/{task_id}/execution/state")
async def get_goal_task_execution_state(task_id: int):
    try:
        data = goal_manager.get_execution_state(task_id)
        if not data:
            return {"success": False, "error": "Task not found"}
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Get task execution state failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/goals/task/{task_id}/execution/phase")
async def update_goal_task_execution_phase(task_id: int, request: GoalTaskExecutionPhaseRequest):
    try:
        data = goal_manager.update_execution_phase(
            task_id=task_id,
            phase=request.phase,
            status=request.status,
            note=request.note,
            prompt=request.prompt,
        )
        if not data:
            return {"success": False, "error": "Task not found or invalid phase/status"}
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Update task execution phase failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/goals/task/{task_id}/execution/resume")
async def resume_goal_task_execution(task_id: int, request: GoalTaskExecutionResumeRequest):
    try:
        data = goal_manager.resume_execution(task_id=task_id, note=request.note)
        if not data:
            return {"success": False, "error": "Task not found"}
        resume_prompt = data.pop("resume_prompt", "")
        return {"success": True, "data": data, "resume_prompt": resume_prompt}
    except Exception as e:
        logger.error(f"Resume task execution failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 连接（实时对话）"""
    await websocket.accept()
    logger.info("WebSocket 连接建立")

    try:
        while True:
            data = await websocket.receive_json()

            # 处理消息
            user_id = data.get("user_id")
            message = data.get("message")
            session_id = data.get("session_id")
            goal_task_id = data.get("goal_task_id")
            preferred_skill = data.get("preferred_skill")
            skill_strict = bool(data.get("skill_strict", False))

            # 流式响应
            async for chunk in agent.chat_stream(
                user_id=user_id,
                message=message,
                session_id=session_id,
                use_memory=True,
                goal_task_id=goal_task_id,
                preferred_skill=preferred_skill,
                skill_strict=skill_strict,
            ):
                await websocket.send_json(chunk)

            # 发送结束标记
            await websocket.send_json({"type": "done"})

    except WebSocketDisconnect:
        logger.info("WebSocket 连接断开")
    except Exception as e:
        logger.error(f"WebSocket 错误: {e}", exc_info=True)


def main():
    """启动服务"""
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", 7860))
    reload = os.getenv("RELOAD", "1") == "1"

    logger.info(f"启动 Agent SDK 服务: http://{host}:{port} (reload={reload})")

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        log_level="info",
        reload=reload,
        reload_dirs=[str(Path(__file__).parent)],
    )


if __name__ == "__main__":
    main()
