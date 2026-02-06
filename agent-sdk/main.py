"""
CKS Lite Agent SDK - Main Entry Point
基于 Claude Agent SDK 的智能代理服务
"""

import os
import sys
import re
import json
import httpx
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
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
from models.request import (
    ChatRequest,
    MemoryRequest,
    SkillInstallRequest,
    SkillExecuteRequest,
    MCPExecuteRequest,
    GoalKPIRequest,
    GoalOKRRequest,
    GoalProjectRequest,
    GoalTaskRequest,
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

# Skills 加载：扫描 agent-sdk/skills/ 和 .claude/skills/ 两个目录
# .claude/skills/ 包含从 Claude Code 安装的社区技能
_project_root = Path(__file__).parent.parent.parent  # E:\GalaxyProject
_claude_skills_dir = _project_root / ".claude" / "skills"
_additional_skill_dirs = [_claude_skills_dir] if _claude_skills_dir.exists() else []

skills_loader = SkillsLoader(additional_dirs=_additional_skill_dirs)
skill_installer = SkillInstaller(skills_dir=skills_loader.skills_dir)
skills_loader.annotate_sources(skill_installer.get_installed_skills())
agent = ClaudeAgent(
    api_key=os.getenv("ANTHROPIC_API_KEY"),
    memory_manager=memory_manager,
    skills_loader=skills_loader,
    skill_installer=skill_installer
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
    """健康检查"""
    return {
        "status": "ok",
        "service": "CKS Lite Agent SDK",
        "version": "0.1.0",
        "skills_count": len(skills_loader.skills)
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """对话接口（非流式）"""
    try:
        response = await agent.chat(
            user_id=request.user_id,
            message=request.message,
            session_id=request.session_id,
            use_memory=request.use_memory
        )

        if request.goal_task_id and response.get("tool_calls"):
            goal_manager.complete_task(request.goal_task_id)

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
        try:
            async for chunk in agent.chat_stream(
                user_id=request.user_id,
                message=request.message,
                session_id=request.session_id,
                use_memory=request.use_memory
            ):
                try:
                    parsed = json.loads(chunk)
                    if parsed.get("type") == "tool_result" and parsed.get("success"):
                        has_successful_tool = True
                    if (
                        parsed.get("type") == "done"
                        and request.goal_task_id
                        and has_successful_tool
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
    """列出所有 Skills"""
    return {
        "success": True,
        "skills": [skill.to_dict() for skill in skills_loader.skills]
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
async def get_goals_tree():
    """获取 KPI/OKR/项目/任务树"""
    try:
        return {"success": True, "data": goal_manager.get_tree()}
    except Exception as e:
        logger.error(f"获取 goals tree 失败: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.get("/goals/tasks")
async def list_goal_tasks(
    assignee: str = None,
    status: str = None,
    from_time: str = None,
    to_time: str = None,
    limit: int = 200,
):
    try:
        rows = goal_manager.list_tasks(
            assignee=assignee,
            status=status,
            from_time=from_time,
            to_time=to_time,
            limit=limit,
        )
        return {"success": True, "tasks": rows, "total": len(rows)}
    except Exception as e:
        logger.error(f"List goals tasks failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/goals/kpi")
async def create_kpi(request: GoalKPIRequest):
    try:
        kpi_id = goal_manager.create_kpi(request.title, request.description)
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
        )
        return {"success": True, "id": task_id}
    except Exception as e:
        logger.error(f"创建任务失败: {e}", exc_info=True)
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

            # 流式响应
            async for chunk in agent.chat_stream(
                user_id=user_id,
                message=message,
                session_id=session_id,
                use_memory=True
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
