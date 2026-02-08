"""
Markdown 文件记忆系统 - Markdown File Memory System

参考 OpenClaw 的 file-first 设计理念，将记忆存储在 Markdown 文件中。

特性:
  - 人类可读的 Markdown 格式
  - Git 友好（可版本控制）
  - 自动时间戳
  - 日志分割（每日一个文件）
  - 支持元数据和标签
"""

from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional
import re
import logging
import json
import shutil

logger = logging.getLogger(__name__)


class MarkdownMemory:
    """
    Markdown 记忆管理器

    文件结构:
        ~/.cks-lite/workspace/
        ├── MEMORY.md                 # 长期记忆主文件
        └── memory/
            ├── 2026-02-05.md        # 今日日志
            ├── 2026-02-04.md        # 昨日日志
            └── ...
    """

    def __init__(self, workspace_dir: Path):
        """
        初始化 Markdown 记忆系统

        Args:
            workspace_dir: 工作区目录路径
        """
        self.workspace_dir = Path(workspace_dir)
        self.memory_file = self.workspace_dir / "MEMORY.md"
        self.daily_dir = self.workspace_dir / "memory"
        self.archive_dir = self.daily_dir / "archive"

        # 确保目录存在
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        self.daily_dir.mkdir(parents=True, exist_ok=True)
        self.archive_dir.mkdir(parents=True, exist_ok=True)

        # 确保 MEMORY.md 存在
        if not self.memory_file.exists():
            self._initialize_memory_file()

        logger.info(f"Markdown 记忆系统初始化: {self.workspace_dir}")

    def _initialize_memory_file(self):
        """初始化 MEMORY.md 主文件"""
        content = """# CKS Lite - 长期记忆库

> 这是 AI 助手的长期记忆存储，记录重要的用户偏好、知识和上下文信息。

## 📝 记忆索引

### 用户偏好 (Preferences)
- [暂无记忆]

### 技术知识 (Knowledge)
- [暂无记忆]

### 上下文信息 (Context)
- [暂无记忆]

---

## 📚 详细记忆

"""
        self.memory_file.write_text(content, encoding="utf-8")
        logger.info(f"创建 MEMORY.md: {self.memory_file}")

    def save_memory(
        self,
        content: str,
        memory_type: str = "knowledge",
        tags: Optional[List[str]] = None
    ) -> str:
        """
        保存记忆到 MEMORY.md

        Args:
            content: 记忆内容
            memory_type: 记忆类型 (preference, knowledge, context)
            tags: 标签列表

        Returns:
            记忆 ID
        """
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        memory_id = f"mem_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        # 构建记忆条目
        entry = f"\n### [{memory_type}] {memory_id}\n\n"
        entry += f"**时间**: {timestamp}\n\n"

        if tags:
            entry += f"**标签**: {', '.join(f'`{tag}`' for tag in tags)}\n\n"

        entry += f"{content}\n\n"
        entry += "---\n"

        # 追加到文件末尾
        with self.memory_file.open("a", encoding="utf-8") as f:
            f.write(entry)

        logger.info(f"保存记忆: {memory_id} ({memory_type})")
        return memory_id

    def save_daily_log(self, content: str, log_type: str = "conversation") -> str:
        """
        保存日志到每日文件

        Args:
            content: 日志内容
            log_type: 日志类型 (conversation, system, error)

        Returns:
            日志文件路径
        """
        # 今日日志文件
        today = datetime.now().strftime("%Y-%m-%d")
        daily_file = self.daily_dir / f"{today}.md"

        # 如果文件不存在，创建头部
        if not daily_file.exists():
            header = f"# CKS Lite - Daily Log\n\n**日期**: {today}\n\n---\n\n"
            daily_file.write_text(header, encoding="utf-8")

        # 构建日志条目
        timestamp = datetime.now().strftime("%H:%M:%S")
        entry = f"\n## [{timestamp}] {log_type}\n\n"
        entry += f"{content}\n\n"
        entry += "---\n"

        # 追加到文件末尾
        with daily_file.open("a", encoding="utf-8") as f:
            f.write(entry)

        logger.info(f"保存日志: {daily_file.name}")
        return str(daily_file)

    def read_memory(self) -> str:
        """
        读取完整的 MEMORY.md 内容

        Returns:
            文件内容
        """
        if not self.memory_file.exists():
            return ""

        return self.memory_file.read_text(encoding="utf-8")

    def read_daily_log(self, date: Optional[str] = None) -> str:
        """
        读取指定日期的日志

        Args:
            date: 日期字符串 (YYYY-MM-DD)，默认今天

        Returns:
            日志内容
        """
        if date is None:
            date = datetime.now().strftime("%Y-%m-%d")

        daily_file = self.daily_dir / f"{date}.md"

        if not daily_file.exists():
            return f"# 日志文件不存在: {date}"

        return daily_file.read_text(encoding="utf-8")

    def parse_memories(self, content: Optional[str] = None) -> List[Dict]:
        """
        解析 MEMORY.md 为结构化数据

        Args:
            content: Markdown 内容（可选，默认读取 MEMORY.md）

        Returns:
            记忆列表
        """
        if content is None:
            content = self.read_memory()

        memories = []

        # 正则匹配记忆条目
        # 格式: ### [memory_type] memory_id
        pattern = r"###\s+\[(\w+)\]\s+(mem_[\w]+)\n\n\*\*时间\*\*:\s+([^\n]+)"

        matches = re.finditer(pattern, content)

        for match in matches:
            memory_type = match.group(1)
            memory_id = match.group(2)
            timestamp = match.group(3)

            # 提取内容（下一个三级标题或 --- 之前）
            start = match.end()
            end_match = re.search(r"\n(###|---)", content[start:])
            if end_match:
                end = start + end_match.start()
            else:
                end = len(content)

            memory_content = content[start:end].strip()

            # 提取标签
            tags_match = re.search(r"\*\*标签\*\*:\s+([^\n]+)", memory_content)
            tags = []
            if tags_match:
                tag_str = tags_match.group(1)
                tags = [t.strip("`") for t in tag_str.split(",")]
                tags = [t.strip() for t in tags]

            # 移除元数据，只保留正文
            memory_text = re.sub(r"\*\*时间\*\*:[^\n]+\n+", "", memory_content)
            memory_text = re.sub(r"\*\*标签\*\*:[^\n]+\n+", "", memory_text)
            memory_text = memory_text.strip()

            memories.append({
                "id": memory_id,
                "type": memory_type,
                "timestamp": timestamp,
                "content": memory_text,
                "tags": tags
            })

        logger.info(f"解析记忆: {len(memories)} 条")
        return memories

    def search_memories(
        self,
        query: str,
        memory_type: Optional[str] = None
    ) -> List[Dict]:
        """
        简单文本搜索记忆

        Args:
            query: 搜索关键词
            memory_type: 记忆类型过滤（可选）

        Returns:
            匹配的记忆列表
        """
        memories = self.parse_memories()

        # 关键词匹配（不区分大小写）
        query_lower = query.lower()
        results = []

        for memory in memories:
            # 类型过滤
            if memory_type and memory["type"] != memory_type:
                continue

            # 内容匹配
            if query_lower in memory["content"].lower():
                results.append(memory)

        logger.info(f"搜索记忆: query='{query}', 找到 {len(results)} 条")
        return results

    def get_recent_logs(self, days: int = 7) -> List[Dict]:
        """
        获取最近 N 天的日志文件列表

        Args:
            days: 天数

        Returns:
            日志文件信息列表 [{ 'date', 'path', 'size' }, ...]
        """
        from datetime import timedelta

        logs = []
        today = datetime.now()

        for i in range(days):
            date = today - timedelta(days=i)
            date_str = date.strftime("%Y-%m-%d")
            daily_file = self.daily_dir / f"{date_str}.md"

            if daily_file.exists():
                logs.append({
                    "date": date_str,
                    "path": str(daily_file),
                    "size": daily_file.stat().st_size
                })

        logger.info(f"获取最近 {days} 天日志: {len(logs)} 个文件")
        return logs

    def compress_logs(self, days: int = 30):
        """
        压缩旧日志（超过指定天数的）

        Args:
            days: 保留天数
        """
        from datetime import timedelta

        cutoff_date = datetime.now() - timedelta(days=days)

        # 查找所有旧日志文件
        old_logs = []
        for log_file in self.daily_dir.glob("*.md"):
            try:
                # 从文件名提取日期
                file_date_str = log_file.stem  # 2026-02-05
                file_date = datetime.strptime(file_date_str, "%Y-%m-%d")

                if file_date < cutoff_date:
                    old_logs.append(log_file)
            except ValueError:
                # 文件名不符合日期格式，跳过
                continue

        moved_logs: List[Dict] = []
        for log_file in sorted(old_logs):
            try:
                file_date = datetime.strptime(log_file.stem, "%Y-%m-%d")
                month_bucket = file_date.strftime("%Y-%m")
            except ValueError:
                month_bucket = "unknown"

            target_dir = self.archive_dir / month_bucket
            target_dir.mkdir(parents=True, exist_ok=True)

            target_path = target_dir / log_file.name
            if target_path.exists():
                # 避免覆盖同名文件
                target_path = target_dir / f"{log_file.stem}_{int(datetime.now().timestamp())}.md"

            size = 0
            try:
                size = log_file.stat().st_size
            except Exception:
                pass

            shutil.move(str(log_file), str(target_path))
            moved_logs.append(
                {
                    "date": log_file.stem,
                    "from": str(log_file),
                    "to": str(target_path),
                    "size": size,
                }
            )

        if moved_logs:
            index_file = self.archive_dir / "index.jsonl"
            with index_file.open("a", encoding="utf-8") as f:
                for item in moved_logs:
                    record = {"archived_at": datetime.now().isoformat(), **item}
                    f.write(json.dumps(record, ensure_ascii=False) + "\n")

        logger.info(f"压缩日志: 找到 {len(old_logs)} 个旧文件, 已归档 {len(moved_logs)} 个")
        return moved_logs

    def export_to_json(self) -> Dict:
        """
        导出所有记忆为 JSON 格式

        Returns:
            JSON 格式的记忆数据
        """
        memories = self.parse_memories()
        recent_logs = self.get_recent_logs(days=30)

        return {
            "version": "1.0",
            "export_time": datetime.now().isoformat(),
            "memories": memories,
            "recent_logs": recent_logs
        }

    def import_from_json(self, data: Dict):
        """
        从 JSON 导入记忆

        Args:
            data: JSON 数据
        """
        memories = data.get("memories", [])

        for memory in memories:
            self.save_memory(
                content=memory["content"],
                memory_type=memory["type"],
                tags=memory.get("tags", [])
            )

        logger.info(f"导入记忆: {len(memories)} 条")


# Utility Functions

def trigger_memory_flush(context: str, threshold: int = 150000) -> bool:
    """
    触发记忆刷新检查

    当对话 token 数接近限制时，触发 AI 保存重要信息到 Markdown

    Args:
        context: 当前上下文（用于估算 token 数）
        threshold: token 阈值

    Returns:
        是否需要刷新
    """
    # 简单估算: 1 token ≈ 0.75 英文字符
    estimated_tokens = len(context) / 0.75

    if estimated_tokens > threshold:
        logger.warning(f"Token 数接近限制: {estimated_tokens:.0f} / {threshold}")
        return True

    return False


def format_memory_prompt(memories: List[Dict]) -> str:
    """
    格式化记忆为提示词

    Args:
        memories: 记忆列表

    Returns:
        格式化的提示词
    """
    if not memories:
        return "没有相关记忆。"

    prompt = "相关记忆:\n\n"

    for i, memory in enumerate(memories, 1):
        prompt += f"{i}. [{memory['type']}] {memory['content'][:100]}...\n"

    return prompt
