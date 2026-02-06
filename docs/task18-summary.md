# Task #18 完成总结 - Markdown 文件记忆系统

**任务状态**: ✅ 已完成
**完成时间**: 2026-02-05
**预计工时**: 6小时
**实际工时**: ~4小时

---

## 实施内容

### 1. 创建 Markdown 记忆服务 (`agent-sdk/services/markdown_memory.py`)

**核心类: MarkdownMemory**

```python
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
```

**关键特性:**

| 特性 | 描述 | 优势 |
|------|------|------|
| 人类可读 | Markdown 格式，支持标题、列表 | 可直接阅读和编辑 |
| Git 友好 | 纯文本文件 | 支持版本控制、diff、merge |
| 自动时间戳 | 每条记忆自动添加时间 | 可追溯历史 |
| 日志分割 | 每日一个文件 | 易于管理和归档 |
| 标签支持 | 支持标签和分类 | 便于过滤和搜索 |
| 导出导入 | JSON 格式 | 易于备份和迁移 |

---

### 2. 关键方法

#### 2.1 保存记忆到 MEMORY.md

```python
def save_memory(
    self,
    content: str,
    memory_type: str = "knowledge",  # preference, knowledge, context
    tags: Optional[List[str]] = None
) -> str:
    """
    保存记忆到 MEMORY.md

    返回: memory_id (mem_20260205_190819)
    """
```

**生成的 Markdown 格式:**

```markdown
### [knowledge] mem_20260205_190819

**时间**: 2026-02-05 19:08:19

**标签**: `Python`, `数据分析`

用户喜欢使用 Python 进行数据分析和机器学习开发

---
```

#### 2.2 保存日志到每日文件

```python
def save_daily_log(
    self,
    content: str,
    log_type: str = "conversation"  # conversation, system, error
) -> str:
    """
    保存日志到 memory/YYYY-MM-DD.md

    返回: 日志文件路径
    """
```

**生成的日志格式:**

```markdown
## [19:08:19] conversation

用户开始对话，询问混合搜索原理

---
```

#### 2.3 解析和搜索

```python
def parse_memories(self, content: Optional[str] = None) -> List[Dict]:
    """
    解析 MEMORY.md 为结构化数据

    返回: [
        {
            'id': 'mem_20260205_190819',
            'type': 'knowledge',
            'timestamp': '2026-02-05 19:08:19',
            'content': '记忆内容',
            'tags': ['标签1', '标签2']
        },
        ...
    ]
    """

def search_memories(
    self,
    query: str,
    memory_type: Optional[str] = None
) -> List[Dict]:
    """
    简单文本搜索记忆（关键词匹配）

    返回: 匹配的记忆列表
    """
```

#### 2.4 日志管理

```python
def read_daily_log(self, date: Optional[str] = None) -> str:
    """读取指定日期的日志（默认今天）"""

def get_recent_logs(self, days: int = 7) -> List[Dict]:
    """获取最近 N 天的日志文件列表"""

def compress_logs(self, days: int = 30):
    """压缩旧日志（超过指定天数的）"""
```

#### 2.5 导出导入

```python
def export_to_json(self) -> Dict:
    """
    导出所有记忆为 JSON 格式

    返回: {
        "version": "1.0",
        "export_time": "2026-02-05T19:08:19",
        "memories": [...],
        "recent_logs": [...]
    }
    """

def import_from_json(self, data: Dict):
    """从 JSON 导入记忆"""
```

---

### 3. 工具函数

#### 3.1 触发记忆刷新

```python
def trigger_memory_flush(context: str, threshold: int = 150000) -> bool:
    """
    当对话 token 数接近限制时，触发 AI 保存重要信息到 Markdown

    Args:
        context: 当前上下文（用于估算 token 数）
        threshold: token 阈值（默认 150000）

    Returns:
        是否需要刷新
    """
    # 简单估算: 1 token ≈ 0.75 英文字符
    estimated_tokens = len(context) / 0.75

    if estimated_tokens > threshold:
        logger.warning(f"Token 数接近限制: {estimated_tokens:.0f} / {threshold}")
        return True

    return False
```

#### 3.2 格式化提示词

```python
def format_memory_prompt(memories: List[Dict]) -> str:
    """
    格式化记忆为提示词

    输入: [
        {"type": "preference", "content": "用户喜欢使用 Python"},
        {"type": "knowledge", "content": "BM25 是一种关键字排名算法"}
    ]

    输出:
    相关记忆:

    1. [preference] 用户喜欢使用 Python...
    2. [knowledge] BM25 是一种关键字排名算法...
    """
```

---

### 4. 集成到 MemoryManager

**修改 `agent-sdk/core/memory.py`:**

```python
class MemoryManager:
    def __init__(self, data_dir: Path, embedding_model: str = "all-MiniLM-L6-v2"):
        # ... 原有初始化代码

        # 初始化 Markdown 记忆系统
        self.markdown_memory = None
        if MARKDOWN_MEMORY_AVAILABLE:
            try:
                workspace_dir = data_dir / "workspace"
                self.markdown_memory = MarkdownMemory(workspace_dir)
                logger.info(f"Markdown 记忆系统初始化: {workspace_dir}")
            except Exception as e:
                logger.error(f"Markdown 记忆系统初始化失败: {e}")
```

---

### 5. 测试覆盖

**测试文件: `test_markdown_memory.py`**

| 测试 | 描述 | 状态 |
|------|------|------|
| `test_initialize()` | 初始化文件结构 | ✅ 通过 |
| `test_save_memory()` | 保存记忆到 MEMORY.md | ✅ 通过 |
| `test_save_daily_log()` | 保存每日日志 | ✅ 通过 |
| `test_parse_memories()` | 解析 Markdown 为结构化数据 | ✅ 通过 |
| `test_search_memories()` | 关键词搜索记忆 | ✅ 通过 |
| `test_recent_logs()` | 获取最近日志列表 | ✅ 通过 |
| `test_export_import()` | JSON 导出导入 | ✅ 通过 |
| `test_trigger_flush()` | Token 刷新触发逻辑 | ✅ 通过 |
| `test_format_prompt()` | 格式化记忆为提示词 | ✅ 通过 |

**测试结果:**

```
==================================================
[SUCCESS] All tests passed!
==================================================
```

---

## 文件结构示例

### MEMORY.md (长期记忆主文件)

```markdown
# CKS Lite - 长期记忆库

> 这是 AI 助手的长期记忆存储，记录重要的用户偏好、知识和上下文信息。

## 📝 记忆索引

### 用户偏好 (Preferences)
- 用户喜欢使用 Python
- 用户偏好简洁的代码风格

### 技术知识 (Knowledge)
- BM25 是一种关键字排名算法
- OpenClaw 使用混合搜索系统

### 上下文信息 (Context)
- 用户正在开发 CKS Lite 桌面应用

---

## 📚 详细记忆

### [preference] mem_20260205_100000

**时间**: 2026-02-05 10:00:00

**标签**: `Python`, `编程语言`

用户喜欢使用 Python 进行数据分析和机器学习开发

---

### [knowledge] mem_20260205_110000

**时间**: 2026-02-05 11:00:00

**标签**: `混合搜索`, `BM25`, `算法`

OpenClaw 使用混合搜索系统（BM25 + 向量）提升检索准确率。BM25 算法基于概率排名模型，考虑词频、逆文档频率和文档长度。

---
```

### 2026-02-05.md (每日日志)

```markdown
# CKS Lite - Daily Log

**日期**: 2026-02-05

---

## [10:00:00] conversation

用户: 能介绍一下混合搜索的原理吗？

---

## [10:05:00] conversation

AI: 混合搜索结合了 BM25 关键字搜索和向量语义搜索...

---

## [10:30:00] system

系统检测到 token 数接近限制 (145000 / 150000)

---
```

---

## 技术亮点

### 1. File-First 设计理念

参考 OpenClaw 的设计思想:
- **数据透明**: 用户可以直接打开 Markdown 文件查看和编辑
- **可版本控制**: Git 可以追踪每次记忆的变更
- **易于迁移**: 纯文本文件，无需数据库导出
- **人机协作**: AI 写入，人类可修改和补充

### 2. 正则表达式解析

使用正则表达式解析 Markdown 结构:

```python
# 匹配记忆条目
pattern = r"###\s+\[(\w+)\]\s+(mem_[\w]+)\n\n\*\*时间\*\*:\s+([^\n]+)"

# 提取标签
tags_match = re.search(r"\*\*标签\*\*:\s+([^\n]+)", memory_content)
```

### 3. 自动时间戳和 ID 生成

```python
timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
memory_id = f"mem_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
```

### 4. 日志轮转

- 每天一个独立文件
- 便于归档和压缩
- 易于按日期查询

### 5. Token 阈值检测

```python
# 估算 token 数: 1 token ≈ 0.75 字符
estimated_tokens = len(context) / 0.75

if estimated_tokens > threshold:
    # 触发刷新逻辑
    return True
```

---

## 与 OpenClaw 的对比

| 特性 | OpenClaw (TypeScript) | CKS Lite (Python) |
|------|----------------------|-------------------|
| 文件格式 | Markdown | Markdown |
| 长期记忆 | `MEMORY.md` | `MEMORY.md` |
| 每日日志 | `memory/YYYY-MM-DD.md` | `memory/YYYY-MM-DD.md` |
| 时间戳 | 自动添加 | 自动添加 |
| 标签支持 | ✅ | ✅ |
| 解析器 | 正则表达式 | 正则表达式 |
| Token 刷新 | 自动检测 | 自动检测 |
| 导出格式 | JSON | JSON |

---

## 使用场景

### 场景 1: AI 自动保存用户偏好

```python
# AI 在对话中发现用户偏好
memory_manager.markdown_memory.save_memory(
    content="用户喜欢使用 TypeScript 而不是 JavaScript",
    memory_type="preference",
    tags=["TypeScript", "编程偏好"]
)
```

### 场景 2: 记录每日对话日志

```python
# 记录对话内容
memory_manager.markdown_memory.save_daily_log(
    content=f"用户: {user_message}\nAI: {ai_response}",
    log_type="conversation"
)
```

### 场景 3: Token 接近限制时自动刷新

```python
# 在对话流程中检测
if trigger_memory_flush(conversation_context, threshold=150000):
    # 系统提示 AI 保存重要信息
    system_prompt = "当前 token 数接近限制，请将重要信息保存到 MEMORY.md"
    # 触发 AI 总结和保存
```

### 场景 4: 用户手动搜索记忆

```python
# 搜索包含 "Python" 的记忆
results = memory_manager.markdown_memory.search_memories("Python")

# 按类型搜索
prefs = memory_manager.markdown_memory.search_memories("Python", memory_type="preference")
```

### 场景 5: 导出备份

```python
# 导出所有记忆
backup_data = memory_manager.markdown_memory.export_to_json()

# 保存到文件
with open("memory_backup.json", "w") as f:
    json.dump(backup_data, f, indent=2, ensure_ascii=False)
```

---

## 性能优化

### 1. 追加写入

- 使用 `open("a")` 追加模式，无需读取整个文件
- 高效的写入操作

### 2. 文件分割

- 每日日志独立文件，避免单文件过大
- 查询和归档更高效

### 3. 惰性解析

- 解析操作按需执行
- 缓存解析结果（可选）

### 4. 压缩归档

- 旧日志可以压缩或移动到 archive/ 目录
- 减少主目录文件数

---

## 未来增强

### 短期 (Phase 2)

1. **自动同步到数据库**
   - Markdown → SQLite 双向同步
   - 保持数据一致性

2. **文件监控**
   - 监听 Markdown 文件变化
   - 自动更新数据库和索引

3. **全文搜索**
   - 集成 SQLite FTS5
   - 更快的关键词搜索

### 中期 (Phase 3-4)

4. **Markdown 渲染**
   - 在前端以富文本形式展示
   - 支持实时编辑

5. **版本控制集成**
   - 自动 git commit
   - 查看历史版本

6. **多文件支持**
   - 按主题分类（`memory/projects.md`, `memory/preferences.md`）
   - 更清晰的组织结构

### 长期 (Phase 5+)

7. **协作编辑**
   - 多用户共享记忆库
   - 冲突解决机制

8. **AI 自动整理**
   - 定期整理和归档
   - 自动生成索引和摘要

---

## 文件清单

**新增文件:**

```
agent-sdk/
├── services/
│   └── markdown_memory.py        (500 行, 新建)
├── test_markdown_memory.py       (330 行, 新建)
└── docs/
    └── task18-summary.md         (本文档)
```

**修改文件:**

```
agent-sdk/
└── core/
    └── memory.py                 (新增 Markdown 记忆集成)
```

**生成的数据文件:**

```
~/.cks-lite/workspace/
├── MEMORY.md                     (长期记忆)
└── memory/
    ├── 2026-02-05.md            (今日日志)
    ├── 2026-02-04.md
    └── ...
```

---

## 验收标准 ✅

- [x] 实现 MarkdownMemory 类
- [x] 支持保存记忆到 MEMORY.md
- [x] 支持保存日志到每日文件
- [x] 支持解析 Markdown 为结构化数据
- [x] 支持关键词搜索
- [x] 支持标签和分类
- [x] 支持导出导入 JSON
- [x] 实现 token 刷新触发逻辑
- [x] 集成到 MemoryManager
- [x] 编写完整的单元测试
- [x] 所有测试通过 (9/9)
- [x] 编写技术文档

---

## 下一步: Task #19

**任务**: 前端集成混合搜索 API
**预计工时**: 4小时

**实施内容**:
1. 在前端添加记忆搜索 UI
2. 调用混合搜索 API
3. 显示搜索结果（向量分数 + BM25 分数）
4. 支持按类型过滤
5. 支持查看 Markdown 文件

---

**文档创建时间**: 2026-02-05
**创建者**: Claude (Sonnet 4.5)
