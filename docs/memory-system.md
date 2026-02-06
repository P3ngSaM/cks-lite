# 长记忆系统设计文档

## 1. 概述

长记忆系统是 CKS Lite 的核心功能，让 Agent 能够"记住"历史对话、用户偏好和知识，提供更智能、个性化的服务。

### 1.1 设计目标

- ✅ **持久化**：记忆永久保存，重启不丢失
- ✅ **智能检索**：语义搜索相关记忆
- ✅ **轻量级**：本地向量搜索，无需云端服务
- ✅ **隐私优先**：所有数据本地存储
- ✅ **自动化**：自动保存和检索，无需用户干预
- ✅ **可控**：用户可查看、编辑、删除记忆

### 1.2 核心价值

**场景示例**：

```
第 1 天：
User: 我最近在做发票整理的工作
Agent: 好的，我帮你整理发票文件夹...

第 7 天：
User: 帮我生成本周的报销单
Agent: 好的！我记得你上周整理了发票，我来基于那些数据生成报销单...
      [自动检索到第 1 天的对话记忆]
```

**价值**：
- 🧠 Agent 能记住长期信息
- 🎯 提供更精准的服务
- ⏱️ 减少用户重复输入
- 🔗 建立上下文连贯性

---

## 2. 记忆分类

基于认知心理学的记忆模型，我们将记忆分为三类：

### 2.1 语义记忆（Semantic Memory）

**定义**：长期知识和事实

**存储内容**：
- 历史对话记录
- 用户分享的知识
- Agent 学习的信息
- 文档摘要

**存储方式**：
- 向量数据库（FAISS）
- SQLite（元数据）

**检索方式**：
- 语义相似度搜索（余弦相似度）
- 混合搜索（向量 70% + 关键词 30%）

**示例**：
```json
{
  "id": "mem_123",
  "content": "用户的公司名称是 ABC 科技，主要业务是 AI 软件开发",
  "embedding": [0.12, 0.45, -0.33, ...],  // 384 维向量
  "metadata": {
    "type": "company_info",
    "timestamp": "2024-01-15T10:30:00Z",
    "source": "conversation"
  }
}
```

---

### 2.2 工作记忆（Working Memory）

**定义**：当前会话的短期上下文

**存储内容**：
- 当前对话历史（最近 N 轮）
- 临时变量和状态
- 当前任务上下文

**存储方式**：
- 内存（Python 变量）
- 会话结束后保存到语义记忆

**大小限制**：
- 最近 20 轮对话
- 约 8K Tokens

**示例**：
```python
working_memory = {
    "session_id": "sess_456",
    "messages": [
        {"role": "user", "content": "帮我生成 PPT"},
        {"role": "assistant", "content": "主题是什么？"},
        {"role": "user", "content": "AI 技术趋势"}
    ],
    "context": {
        "current_task": "ppt_generation",
        "ppt_theme": "AI 技术趋势"
    }
}
```

---

### 2.3 程序记忆（Procedural Memory）

**定义**：用户的习惯、偏好和技能

**存储内容**：
- 用户偏好（主题、语言、风格）
- 常用命令和快捷方式
- 工作习惯（工作时间、任务优先级）
- 技能使用频率

**存储方式**：
- SQLite（结构化数据）

**示例**：
```sql
-- 用户偏好表
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    pref_key TEXT NOT NULL,
    pref_value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, pref_key)
);

-- 示例数据
INSERT INTO user_preferences VALUES
(1, 'user_001', 'theme', 'dark'),
(2, 'user_001', 'language', 'zh-CN'),
(3, 'user_001', 'ppt_style', 'minimalist'),
(4, 'user_001', 'work_hours', '09:00-18:00');
```

---

## 3. 技术架构

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent 对话层                            │
│  - 接收用户输入                                              │
│  - 生成回复                                                  │
│  - 触发记忆保存                                              │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    记忆管理器（Memory Manager）              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 语义记忆模块  │  │ 工作记忆模块  │  │ 程序记忆模块  │      │
│  │ (Semantic)   │  │ (Working)    │  │ (Procedural) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      存储层                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ FAISS 向量库 │  │ SQLite 数据库│  │ 内存缓存      │      │
│  │ (向量搜索)   │  │ (元数据+偏好)│  │ (工作记忆)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心组件

#### 3.2.1 嵌入模型（Embedding Model）

**模型选择**：`sentence-transformers/all-MiniLM-L6-v2`

**参数**：
- 模型大小：~80MB
- 向量维度：384
- 语言支持：多语言（包括中文）
- 推理速度：~100 句/秒（CPU）

**使用方式**：
```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('all-MiniLM-L6-v2')

# 生成嵌入向量
text = "用户的公司名称是 ABC 科技"
embedding = model.encode(text)  # shape: (384,)
```

---

#### 3.2.2 向量数据库（Vector Database）

**技术选择**：FAISS（Facebook AI Similarity Search）

**索引类型**：`IndexFlatL2`（精确搜索，适合中小规模数据）

**数据量估算**：
- 1 万条记忆：~15MB（向量数据）
- 10 万条记忆：~150MB
- 100 万条记忆：~1.5GB

**实现示例**：
```python
import faiss
import numpy as np

# 创建索引
dimension = 384
index = faiss.IndexFlatL2(dimension)

# 添加向量
embeddings = np.array([[0.1, 0.2, ...], [0.3, 0.4, ...]])  # shape: (n, 384)
index.add(embeddings.astype('float32'))

# 搜索
query_embedding = np.array([[0.15, 0.25, ...]])  # shape: (1, 384)
distances, indices = index.search(query_embedding.astype('float32'), k=5)

# 保存索引
faiss.write_index(index, "memory_index.faiss")

# 加载索引
index = faiss.read_index("memory_index.faiss")
```

---

#### 3.2.3 元数据存储（Metadata Storage）

**技术选择**：SQLite

**数据表设计**：

```sql
-- 语义记忆表
CREATE TABLE semantic_memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding_index INTEGER NOT NULL,  -- FAISS 索引位置
    memory_type TEXT DEFAULT 'conversation',  -- conversation, knowledge, document
    source TEXT,  -- 来源（会话ID、文档路径等）
    importance INTEGER DEFAULT 5,  -- 重要性（1-10）
    access_count INTEGER DEFAULT 0,  -- 访问次数
    last_accessed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 全文搜索索引（FTS5）
CREATE VIRTUAL TABLE semantic_memories_fts USING fts5(
    id UNINDEXED,
    content,
    content='semantic_memories',
    content_rowid='rowid'
);

-- 用户偏好表
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    pref_key TEXT NOT NULL,
    pref_value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, pref_key)
);

-- 记忆标签表
CREATE TABLE memory_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (memory_id) REFERENCES semantic_memories(id),
    UNIQUE(memory_id, tag)
);

-- 索引
CREATE INDEX idx_memories_user ON semantic_memories(user_id);
CREATE INDEX idx_memories_type ON semantic_memories(memory_type);
CREATE INDEX idx_memories_created ON semantic_memories(created_at DESC);
CREATE INDEX idx_tags_memory ON memory_tags(memory_id);
CREATE INDEX idx_tags_tag ON memory_tags(tag);
```

---

## 4. 核心功能实现

### 4.1 记忆保存（Save Memory）

**流程**：
```python
def save_memory(user_id: str, content: str, memory_type: str = "conversation"):
    """保存记忆"""

    # 1. 生成嵌入向量
    embedding = embedding_model.encode(content)

    # 2. 添加到 FAISS 索引
    index.add(np.array([embedding]).astype('float32'))
    embedding_index = index.ntotal - 1  # 最新索引位置

    # 3. 保存元数据到 SQLite
    memory_id = f"mem_{uuid.uuid4().hex[:12]}"
    db.execute("""
        INSERT INTO semantic_memories
        (id, user_id, content, embedding_index, memory_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (memory_id, user_id, content, embedding_index, memory_type, datetime.now()))

    # 4. 保存索引到磁盘
    faiss.write_index(index, "data/memory_index.faiss")

    return memory_id
```

**触发时机**：
- ✅ 用户发送消息后
- ✅ Agent 回复后
- ✅ 完成重要任务后
- ✅ 用户明确要求"记住这个"

---

### 4.2 记忆检索（Retrieve Memory）

**混合检索策略**：

```python
def retrieve_memories(user_id: str, query: str, top_k: int = 5):
    """检索相关记忆"""

    # 1. 向量搜索（语义相似度）
    query_embedding = embedding_model.encode(query)
    distances, indices = index.search(
        np.array([query_embedding]).astype('float32'),
        k=top_k * 2  # 多检索一些候选
    )

    # 2. 获取候选记忆
    candidate_ids = []
    for idx in indices[0]:
        result = db.execute("""
            SELECT id FROM semantic_memories
            WHERE user_id = ? AND embedding_index = ?
        """, (user_id, int(idx))).fetchone()
        if result:
            candidate_ids.append(result['id'])

    # 3. 全文搜索（关键词匹配）
    keyword_results = db.execute("""
        SELECT m.id, m.content,
               bm25(semantic_memories_fts) as score
        FROM semantic_memories_fts f
        JOIN semantic_memories m ON f.id = m.id
        WHERE f.content MATCH ? AND m.user_id = ?
        ORDER BY score DESC
        LIMIT ?
    """, (query, user_id, top_k)).fetchall()

    # 4. 混合排序（向量 70% + 关键词 30%）
    final_results = merge_and_rank(
        vector_results=candidate_ids,
        keyword_results=keyword_results,
        vector_weight=0.7,
        keyword_weight=0.3
    )

    # 5. 更新访问统计
    for memory_id in final_results[:top_k]:
        db.execute("""
            UPDATE semantic_memories
            SET access_count = access_count + 1,
                last_accessed_at = ?
            WHERE id = ?
        """, (datetime.now(), memory_id))

    return final_results[:top_k]
```

---

### 4.3 记忆增强（Memory Enhancement）

**自动增强对话上下文**：

```python
def enhance_context_with_memory(user_id: str, user_message: str,
                                  conversation_history: list):
    """使用记忆增强对话上下文"""

    # 1. 检索相关记忆
    relevant_memories = retrieve_memories(user_id, user_message, top_k=5)

    # 2. 过滤低相关性记忆（相似度 < 0.7）
    filtered_memories = [
        m for m in relevant_memories
        if m['similarity'] > 0.7
    ]

    # 3. 构建增强上下文
    if filtered_memories:
        memory_context = "相关记忆：\n"
        for i, mem in enumerate(filtered_memories, 1):
            memory_context += f"{i}. {mem['content']}\n"

        # 插入到对话历史前
        enhanced_history = [
            {"role": "system", "content": memory_context}
        ] + conversation_history
    else:
        enhanced_history = conversation_history

    return enhanced_history
```

**使用示例**：

```python
# 用户输入
user_message = "帮我生成本周的报销单"

# 原始对话历史
conversation_history = [
    {"role": "user", "content": user_message}
]

# 增强上下文
enhanced_history = enhance_context_with_memory(
    user_id="user_001",
    user_message=user_message,
    conversation_history=conversation_history
)

# 增强后的上下文
# [
#   {"role": "system", "content": "相关记忆：\n1. 上周用户整理了发票文件夹..."},
#   {"role": "user", "content": "帮我生成本周的报销单"}
# ]

# 发送给 Claude
response = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    messages=enhanced_history
)
```

---

### 4.4 记忆管理

#### 4.4.1 查看记忆

```python
def list_memories(user_id: str, memory_type: str = None,
                  limit: int = 50, offset: int = 0):
    """查看记忆列表"""

    query = """
        SELECT id, content, memory_type, importance,
               access_count, created_at
        FROM semantic_memories
        WHERE user_id = ?
    """
    params = [user_id]

    if memory_type:
        query += " AND memory_type = ?"
        params.append(memory_type)

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    return db.execute(query, params).fetchall()
```

#### 4.4.2 编辑记忆

```python
def update_memory(memory_id: str, new_content: str):
    """编辑记忆"""

    # 1. 获取原记忆
    memory = db.execute("""
        SELECT embedding_index FROM semantic_memories WHERE id = ?
    """, (memory_id,)).fetchone()

    # 2. 重新生成嵌入向量
    new_embedding = embedding_model.encode(new_content)

    # 3. 更新 FAISS 索引
    index.remove_ids(np.array([memory['embedding_index']]))
    index.add(np.array([new_embedding]).astype('float32'))
    new_index = index.ntotal - 1

    # 4. 更新 SQLite
    db.execute("""
        UPDATE semantic_memories
        SET content = ?, embedding_index = ?, updated_at = ?
        WHERE id = ?
    """, (new_content, new_index, datetime.now(), memory_id))

    # 5. 保存索引
    faiss.write_index(index, "data/memory_index.faiss")
```

#### 4.4.3 删除记忆

```python
def delete_memory(memory_id: str):
    """删除记忆"""

    # 1. 获取嵌入索引
    memory = db.execute("""
        SELECT embedding_index FROM semantic_memories WHERE id = ?
    """, (memory_id,)).fetchone()

    # 2. 从 FAISS 删除（标记为删除，不真正删除）
    # FAISS 不支持真删除，需要重建索引或使用 IDSelector

    # 3. 从 SQLite 删除
    db.execute("DELETE FROM semantic_memories WHERE id = ?", (memory_id,))
    db.execute("DELETE FROM memory_tags WHERE memory_id = ?", (memory_id,))
```

---

## 5. 性能优化

### 5.1 索引优化

**问题**：随着记忆增加，向量搜索变慢

**解决方案**：

1. **使用 IVF 索引**（倒排文件索引）
```python
# 当记忆数量 > 10 万时，切换到 IVF 索引
if index.ntotal > 100000:
    quantizer = faiss.IndexFlatL2(dimension)
    index = faiss.IndexIVFFlat(quantizer, dimension, 100)  # 100 个聚类中心
    index.train(embeddings)  # 需要训练
    index.add(embeddings)
```

2. **定期重建索引**
```python
def rebuild_index():
    """定期重建索引（每月一次）"""

    # 1. 获取所有记忆
    memories = db.execute("""
        SELECT id, content, embedding_index
        FROM semantic_memories
        ORDER BY embedding_index
    """).fetchall()

    # 2. 重新生成嵌入
    contents = [m['content'] for m in memories]
    embeddings = embedding_model.encode(contents)

    # 3. 创建新索引
    new_index = faiss.IndexFlatL2(dimension)
    new_index.add(embeddings.astype('float32'))

    # 4. 更新数据库
    for i, memory in enumerate(memories):
        db.execute("""
            UPDATE semantic_memories
            SET embedding_index = ? WHERE id = ?
        """, (i, memory['id']))

    # 5. 保存新索引
    faiss.write_index(new_index, "data/memory_index.faiss")
```

---

### 5.2 缓存策略

**热点记忆缓存**：
```python
from functools import lru_cache

@lru_cache(maxsize=100)
def get_memory_by_id(memory_id: str):
    """缓存最近访问的记忆"""
    return db.execute("""
        SELECT * FROM semantic_memories WHERE id = ?
    """, (memory_id,)).fetchone()
```

**嵌入向量缓存**：
```python
# 缓存最近查询的嵌入向量
embedding_cache = {}  # {query: embedding}

def get_query_embedding(query: str):
    if query not in embedding_cache:
        embedding_cache[query] = embedding_model.encode(query)
    return embedding_cache[query]
```

---

### 5.3 异步处理

**后台保存记忆**：
```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=2)

async def save_memory_async(user_id: str, content: str):
    """异步保存记忆"""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        executor,
        save_memory,
        user_id,
        content
    )
```

---

## 6. 用户界面

### 6.1 记忆管理页面

**功能**：
- 查看所有记忆
- 搜索记忆
- 编辑记忆
- 删除记忆
- 标记重要记忆

**UI 设计**：
```
┌─────────────────────────────────────────────────────────────┐
│  记忆管理                                   [搜索: ____]     │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 📝 对话记忆 (125)                                     │  │
│  │ ├─ 用户的公司名称是 ABC 科技              [编辑][删除] │  │
│  │ ├─ 上周整理了发票文件夹                   [编辑][删除] │  │
│  │ └─ 用户偏好使用深色主题                   [编辑][删除] │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 📚 知识记忆 (42)                                      │  │
│  │ ├─ Python 装饰器的使用方法                [编辑][删除] │  │
│  │ └─ Tauri 打包流程                         [编辑][删除] │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 📄 文档记忆 (18)                                      │  │
│  │ └─ 项目需求文档摘要                       [编辑][删除] │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [+ 手动添加记忆]                                          │
└─────────────────────────────────────────────────────────────┘
```

---

### 6.2 对话中的记忆提示

**实时显示使用的记忆**：

```
┌─────────────────────────────────────────────────────────────┐
│  User: 帮我生成本周的报销单                                 │
│  ────────────────────────────────────────────────────────── │
│  [🧠 使用了 3 条相关记忆]                                   │
│  • 上周整理了发票文件夹                                     │
│  • 发票存放在 D:/Documents/发票/2024                       │
│  • 报销单模板格式为 Excel                                   │
│  ────────────────────────────────────────────────────────── │
│  Agent: 好的！我根据你上周整理的发票数据生成报销单...       │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 隐私与安全

### 7.1 数据加密

**数据库加密**（使用 SQLCipher）：
```python
import sqlcipher3 as sqlite3

# 打开加密数据库
conn = sqlite3.connect("data/memories.db")
conn.execute(f"PRAGMA key = '{user_password}'")
```

**向量索引加密**（可选）：
```python
# 保存时加密
from cryptography.fernet import Fernet

key = Fernet.generate_key()
cipher = Fernet(key)

# 加密索引文件
with open("memory_index.faiss", "rb") as f:
    data = f.read()
encrypted_data = cipher.encrypt(data)

with open("memory_index.faiss.enc", "wb") as f:
    f.write(encrypted_data)
```

---

### 7.2 数据隔离

**多用户隔离**：
- 每个用户独立的 SQLite 数据库
- 或单一数据库但严格按 `user_id` 过滤

**云端同步安全**：
- HTTPS 加密传输
- 服务端数据加密存储
- 访问令牌（JWT）

---

## 8. 测试与验证

### 8.1 功能测试

```python
def test_memory_system():
    """测试记忆系统"""

    # 1. 保存记忆
    mem_id = save_memory("user_001", "用户的公司是 ABC 科技")
    assert mem_id is not None

    # 2. 检索记忆
    results = retrieve_memories("user_001", "用户的公司名称")
    assert len(results) > 0
    assert "ABC 科技" in results[0]['content']

    # 3. 更新记忆
    update_memory(mem_id, "用户的公司是 ABC 科技有限公司")

    # 4. 删除记忆
    delete_memory(mem_id)

    print("✅ 所有测试通过")
```

---

### 8.2 性能测试

**测试指标**：
- 保存速度：< 100ms / 条
- 检索速度：< 200ms（1 万条数据）
- 内存占用：< 500MB（10 万条数据）

```python
import time

def benchmark_memory_system():
    """性能测试"""

    # 1. 测试保存速度
    start = time.time()
    for i in range(1000):
        save_memory("user_001", f"测试记忆 {i}")
    save_time = (time.time() - start) / 1000
    print(f"平均保存时间: {save_time*1000:.2f}ms")

    # 2. 测试检索速度
    start = time.time()
    for i in range(100):
        retrieve_memories("user_001", f"测试记忆 {i}")
    search_time = (time.time() - start) / 100
    print(f"平均检索时间: {search_time*1000:.2f}ms")
```

---

## 9. 未来优化方向

### 9.1 智能记忆选择

**自动判断重要性**：
```python
def calculate_importance(content: str, context: dict) -> int:
    """自动计算记忆重要性（1-10）"""

    importance = 5  # 默认中等重要性

    # 规则 1: 包含数字、日期 → +2
    if re.search(r'\d{4}-\d{2}-\d{2}|\d+', content):
        importance += 2

    # 规则 2: 用户明确说"记住" → +3
    if "记住" in content or "重要" in content:
        importance += 3

    # 规则 3: 内容很长（> 100 字） → +1
    if len(content) > 100:
        importance += 1

    return min(importance, 10)
```

---

### 9.2 记忆遗忘机制

**模拟遗忘曲线**：
```python
def calculate_memory_strength(memory: dict) -> float:
    """计算记忆强度（0-1）"""

    days_elapsed = (datetime.now() - memory['created_at']).days
    access_count = memory['access_count']
    importance = memory['importance']

    # 遗忘曲线: strength = e^(-t/τ)
    tau = 30 * (importance / 5)  # 重要性越高，遗忘越慢
    strength = math.exp(-days_elapsed / tau)

    # 访问次数增强记忆
    strength *= (1 + math.log(access_count + 1) / 10)

    return min(strength, 1.0)


def cleanup_weak_memories():
    """清理弱记忆（强度 < 0.1）"""

    memories = db.execute("""
        SELECT * FROM semantic_memories
    """).fetchall()

    for memory in memories:
        strength = calculate_memory_strength(memory)
        if strength < 0.1:
            delete_memory(memory['id'])
            print(f"删除弱记忆: {memory['content'][:50]}")
```

---

### 9.3 记忆可视化

**记忆图谱**（类似知识图谱）：
- 节点 = 记忆
- 边 = 相似度（余弦相似度 > 0.8）
- 可视化工具：Cytoscape.js / D3.js

**时间轴视图**：
- 按时间线展示记忆
- 可筛选日期范围
- 可查看某天的所有记忆

---

## 10. 总结

长记忆系统是 CKS Lite 的核心竞争力，通过本地向量搜索和智能检索，让 Agent 能够"记住"用户的历史对话和知识，提供更智能、个性化的服务。

**关键技术**：
- ✅ FAISS 向量搜索（轻量级、高性能）
- ✅ sentence-transformers 嵌入模型（本地、无 API 成本）
- ✅ 混合检索（向量 + 关键词）
- ✅ SQLite 元数据存储（轻量级、跨平台）

**核心优势**：
- 🔒 隐私优先（本地存储）
- ⚡ 性能优秀（< 200ms 检索）
- 💰 零成本（无需云端 API）
- 🎯 智能检索（语义相似度）
- 🛠️ 易扩展（支持多种记忆类型）

**下一步**：
1. 实现 Python Agent SDK 的记忆管理器
2. 集成到 Tauri 桌面应用
3. 实现记忆管理 UI
4. 性能测试与优化
