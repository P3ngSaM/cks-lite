"""
CKS Lite Agent SDK - Main Entry Point
基于 Claude Agent SDK 的智能代理服务
"""

import os
import sys
from pathlib import Path
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
from models.request import ChatRequest, MemoryRequest, SkillInstallRequest
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "tauri://localhost",
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://localhost:5173",  # Vite 默认端口
        "http://127.0.0.1:5173",
        "*"  # 开发环境允许所有来源
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化核心组件
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
DATA_DIR.mkdir(exist_ok=True)

memory_manager = MemoryManager(data_dir=DATA_DIR)

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
    """Check and install missing office document packages at startup."""
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

    if missing:
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
    """对话接口（流式）"""
    async def generate():
        try:
            async for chunk in agent.chat_stream(
                user_id=request.user_id,
                message=request.message,
                session_id=request.session_id,
                use_memory=request.use_memory
            ):
                yield f"data: {chunk}\n\n"
        except Exception as e:
            logger.error(f"流式对话错误: {e}", exc_info=True)
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
async def execute_skill(skill_name: str, script_name: str, args: list = None):
    """执行 Skill 脚本"""
    try:
        success, stdout, stderr = await agent.skill_executor.execute_script(
            skill_name=skill_name,
            script_name=script_name,
            args=args or []
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
