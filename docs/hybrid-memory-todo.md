# CKS Lite 混合记忆系统集成 - 任务清单

创建日期：2026-02-05
策略：**代码移植** - 参考 OpenClaw 实现，直接集成到 CKS Lite
预计完成：1-2 周

---

## 📋 任务概览

| 任务 ID | 任务名称 | 优先级 | 预计工时 | 状态 |
|---------|---------|--------|---------|------|
| #16 | 提取 OpenClaw 混合搜索核心代码 | P0 | 3h | 🔵 待开始 |
| #17 | 在 Agent SDK 中实现混合搜索 | P0 | 6h | 🔵 待开始 |
| #18 | 实现 Markdown 文件记忆系统 | P0 | 5h | 🔵 待开始 |
| #19 | 前端集成混合搜索 API | P0 | 4h | 🔵 待开始 |
| #20 | 实现文件监控和自动同步 | P1 | 5h | 🔵 待开始 |
| #21 | 集成自动记忆刷新机制 | P1 | 4h | 🔵 待开始 |
| #22 | 测试混合搜索效果 | P0 | 6h | 🔵 待开始 |
| #23 | 编写技术文档和指南 | P1 | 4h | 🔵 待开始 |

**总计**：37 小时（约 1 周）

---

## 🎯 核心理念

### 为什么不安装 OpenClaw？

**直接代码移植** 而非依赖外部服务：
- ✅ 无需额外的 WebSocket 连接层
- ✅ 降低架构复杂度
- ✅ 更好的性能（减少网络开销）
- ✅ 完全控制实现细节
- ✅ 更容易调试和定制

### 从 OpenClaw 学习什么？

| 特性 | OpenClaw 实现 | 移植到 CKS Lite |
|------|--------------|----------------|
| **混合搜索** | BM25 + 向量 | ✅ 提取算法代码 |
| **文件优先** | Markdown 存储 | ✅ 实现 MEMORY.md 系统 |
| **自动刷新** | Token 阈值触发 | ✅ 集成到对话流程 |
| **嵌入缓存** | 避免重复计算 | ✅ 实现缓存机制 |
| **混合权重** | 可配置融合 | ✅ 提供配置选项 |

---

## 🔄 任务依赖关系

```
#16 (提取 OpenClaw 代码)
  ↓
#17 (Agent SDK 混合搜索) ────┐
  ↓                          │
#18 (Markdown 记忆系统)      │
  ↓                          │
#19 (前端集成) ←──────────────┘
  ↓
#20 (文件监控)
  ↓
#21 (自动刷新)
  ↓
#22 (测试)
  ↓
#23 (文档)
```

**关键路径**：#16 → #17 → #18 → #19 → #22 → #23

---

## 📝 详细任务说明

### Task #16: 提取 OpenClaw 混合搜索核心代码

**目标**：从 OpenClaw 项目中提取可复用的代码。

**重点文件**：
```
E:\Gitee-Project\openclaw\src\memory\
├── hybrid.ts                 # 核心：混合搜索算法
├── manager-search.ts         # 搜索管理器
├── embeddings-openai.ts      # OpenAI 嵌入
└── internal.ts               # SQLite 操作
```

**提取内容**：

1. **BM25 实现**
```typescript
// hybrid.ts 中的 BM25 算法
function bm25Search(
  query: string,
  documents: string[],
  k1 = 1.5,
  b = 0.75
): number[] {
  // 提取分词、TF-IDF、BM25 计算逻辑
}
```

2. **向量搜索**
```typescript
// manager-search.ts 中的向量搜索
function vectorSearch(
  query: string,
  embeddings: number[][],
  topK: number
): SearchResult[] {
  // 提取余弦相似度计算
}
```

3. **混合融合**
```typescript
// hybrid.ts 中的分数融合
function mergeScores(
  vectorResults: SearchResult[],
  bm25Results: SearchResult[],
  vectorWeight = 0.7,
  textWeight = 0.3
): SearchResult[] {
  // 提取加权融合逻辑
}
```

**输出产物**：
- `docs/openclaw-code-analysis.md` - 代码分析文档
- 标注需要的第三方库（natural, compromise 等）
- Python 实现方案设计

---

### Task #17: 在 Agent SDK 中实现混合搜索

**目标**：用 Python 重写 OpenClaw 的混合搜索算法。

**技术栈**：
- `rank-bm25` - Python BM25 库
- `jieba` - 中文分词
- `faiss` - 向量搜索（已有）
- `numpy` - 数值计算

**实现文件**：
```
agent-sdk/services/
├── hybrid_search.py          # 新增：混合搜索服务
└── memory_service.py         # 修改：集成混合搜索
```

**核心代码**：

```python
# hybrid_search.py
from rank_bm25 import BM25Okapi
import jieba
import numpy as np

class HybridSearchService:
    def __init__(self, faiss_index, documents):
        # 1. 初始化向量搜索
        self.faiss_index = faiss_index

        # 2. 构建 BM25 索引
        tokenized_docs = [list(jieba.cut(doc)) for doc in documents]
        self.bm25 = BM25Okapi(tokenized_docs)
        self.documents = documents

    def search(
        self,
        query: str,
        top_k: int = 5,
        vector_weight: float = 0.7,
        text_weight: float = 0.3
    ) -> List[SearchResult]:
        # 1. 向量搜索
        vector_results = self._vector_search(query, top_k * 3)

        # 2. BM25 搜索
        bm25_results = self._bm25_search(query, top_k * 3)

        # 3. 融合分数
        merged = self._merge_results(
            vector_results,
            bm25_results,
            vector_weight,
            text_weight
        )

        return merged[:top_k]

    def _vector_search(self, query, k):
        # 使用现有 FAISS 索引
        embedding = self.embed_query(query)
        distances, indices = self.faiss_index.search(
            np.array([embedding]), k
        )

        # 转换为 0-1 分数
        scores = 1 / (1 + distances[0])
        return [(indices[0][i], scores[i]) for i in range(k)]

    def _bm25_search(self, query, k):
        # BM25 搜索
        tokenized_query = list(jieba.cut(query))
        scores = self.bm25.get_scores(tokenized_query)

        # 归一化到 0-1
        max_score = max(scores) if scores else 1
        normalized = scores / max_score if max_score > 0 else scores

        # 取 top k
        top_indices = np.argsort(normalized)[-k:][::-1]
        return [(idx, normalized[idx]) for idx in top_indices]

    def _merge_results(self, vector_results, bm25_results, vw, tw):
        # 合并两个结果集
        score_map = {}

        for idx, score in vector_results:
            score_map[idx] = score_map.get(idx, 0) + vw * score

        for idx, score in bm25_results:
            score_map[idx] = score_map.get(idx, 0) + tw * score

        # 排序
        merged = sorted(
            score_map.items(),
            key=lambda x: x[1],
            reverse=True
        )

        return [
            {
                'id': idx,
                'content': self.documents[idx],
                'score': score,
                'vector_score': dict(vector_results).get(idx, 0),
                'text_score': dict(bm25_results).get(idx, 0)
            }
            for idx, score in merged
        ]
```

**API 端点**：

```python
# routes/memory.py
@router.post("/memory/hybrid-search")
async def hybrid_search(
    user_id: str,
    query: str,
    top_k: int = 5,
    vector_weight: float = 0.7,
    text_weight: float = 0.3
):
    service = HybridSearchService(faiss_index, documents)
    results = service.search(query, top_k, vector_weight, text_weight)
    return {"success": True, "results": results}
```

**依赖安装**：
```bash
pip install rank-bm25 jieba numpy
```

---

### Task #18: 实现 Markdown 文件记忆系统

**目标**：实现 OpenClaw 风格的 Markdown 记忆存储。

**文件结构**：
```
E:\Users\<user>\.cks-lite\workspace\
├── MEMORY.md                 # 长期记忆（手动编辑友好）
└── memory/
    ├── 2026-02-05.md        # 今日日志
    ├── 2026-02-04.md        # 昨日日志
    └── ...
```

**MEMORY.md 格式**：
```markdown
# 用户信息

- 用户名：Sam
- 职业：软件工程师
- 偏好：简洁的代码风格，使用 TypeScript

# 项目决策

## CKS Lite 架构

- 2026-02-05: 决定采用混合搜索（BM25 + 向量）提升记忆检索准确率
- 2026-02-04: 集成 OpenClaw 的记忆系统设计理念

# 技能偏好

用户喜欢使用 React + TypeScript + Tailwind CSS 进行前端开发。
```

**daily log 格式**：
```markdown
# 2026-02-05 对话日志

## 09:30 - 记忆系统讨论

用户询问如何改进记忆系统，我建议参考 OpenClaw 的实现...

## 14:20 - 功能开发

用户要求实现头像自动保存功能...
```

**实现代码**：

```python
# agent-sdk/services/markdown_memory.py
from datetime import datetime
import os

class MarkdownMemoryService:
    def __init__(self, workspace_path: str):
        self.workspace = workspace_path
        self.memory_file = os.path.join(workspace, "MEMORY.md")
        self.memory_dir = os.path.join(workspace, "memory")

        # 确保目录存在
        os.makedirs(self.memory_dir, exist_ok=True)

    def save_long_term(self, content: str, category: str = None):
        """保存到 MEMORY.md"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

        entry = f"\n\n## {category or '记录'}\n\n"
        entry += f"_保存于 {timestamp}_\n\n"
        entry += content

        # 追加模式写入
        with open(self.memory_file, 'a', encoding='utf-8') as f:
            f.write(entry)

    def save_daily_log(self, content: str):
        """保存到今日日志"""
        today = datetime.now().strftime("%Y-%m-%d")
        log_file = os.path.join(self.memory_dir, f"{today}.md")

        timestamp = datetime.now().strftime("%H:%M")
        entry = f"\n\n## {timestamp}\n\n{content}"

        # 如果文件不存在，创建头部
        if not os.path.exists(log_file):
            with open(log_file, 'w', encoding='utf-8') as f:
                f.write(f"# {today} 对话日志\n")

        # 追加内容
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(entry)

    def read_memory(self) -> str:
        """读取 MEMORY.md"""
        if os.path.exists(self.memory_file):
            with open(self.memory_file, 'r', encoding='utf-8') as f:
                return f.read()
        return ""

    def read_daily_logs(self, days: int = 2) -> List[str]:
        """读取最近 N 天的日志"""
        logs = []
        for i in range(days):
            date = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
            log_file = os.path.join(self.memory_dir, f"{date}.md")
            if os.path.exists(log_file):
                with open(log_file, 'r', encoding='utf-8') as f:
                    logs.append(f.read())
        return logs

    def parse_markdown(self, content: str) -> List[Dict]:
        """解析 Markdown 为结构化数据"""
        # 简单解析：按段落分割
        paragraphs = [p.strip() for p in content.split('\n\n') if p.strip()]

        memories = []
        current_category = "未分类"

        for para in paragraphs:
            if para.startswith('# '):
                current_category = para[2:].strip()
            elif para.startswith('## '):
                current_category = para[3:].strip()
            else:
                memories.append({
                    'content': para,
                    'category': current_category,
                    'source': 'MEMORY.md'
                })

        return memories
```

**API 端点**：
```python
@router.post("/memory/save-to-file")
async def save_to_file(
    content: str,
    type: str = "long_term",  # long_term | daily
    category: str = None
):
    service = MarkdownMemoryService(workspace_path)
    if type == "long_term":
        service.save_long_term(content, category)
    else:
        service.save_daily_log(content)
    return {"success": True}
```

---

### Task #19-23: 后续任务

（详细实施计划见任务描述）

---

## 🎯 关键里程碑

### Milestone 1: 核心算法实现（Day 1-3）
- ✅ OpenClaw 代码分析完成
- ✅ Python 混合搜索实现
- ✅ Markdown 文件系统实现

**验收**：
```python
# 测试混合搜索
results = hybrid_search("用户偏好", top_k=5)
assert len(results) == 5
assert all('score' in r for r in results)
```

### Milestone 2: 前端集成（Day 4-5）
- ✅ 前端调用混合搜索 API
- ✅ UI 显示分数
- ✅ 文件监控工作

**验收**：
- 搜索返回结果
- UI 显示混合分数
- MEMORY.md 变化时 UI 更新

### Milestone 3: 自动化（Day 6-7）
- ✅ 自动记忆刷新实现
- ✅ Token 监控工作
- ✅ AI 自动保存记忆

**验收**：
- 对话接近限制时触发刷新
- MEMORY.md 正确更新

### Milestone 4: 测试和文档（Day 8-10）
- ✅ 准确率测试完成
- ✅ 性能测试通过
- ✅ 文档编写完成

**验收**：
- 混合搜索准确率 > 纯向量 15%+
- 搜索延迟 < 500ms
- 所有文档完整

---

## 📊 技术对比

### 纯向量搜索 vs 混合搜索

| 场景 | 纯向量 | 混合搜索 | 提升 |
|------|--------|---------|------|
| 精确关键字 | ⭐⭐ | ⭐⭐⭐⭐⭐ | +150% |
| 语义相似 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 持平 |
| 同义词 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | +25% |
| 多关键字 | ⭐⭐ | ⭐⭐⭐⭐⭐ | +150% |
| 综合平均 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | +40% |

### Markdown vs SQLite

| 特性 | SQLite | Markdown |
|------|--------|----------|
| 人工可读 | ❌ | ✅ |
| 易于编辑 | ❌ | ✅ |
| 版本控制 | ❌ | ✅ Git 友好 |
| 查询速度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 结构化 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## ⚠️ 注意事项

### 代码移植要点

1. **TypeScript → Python 转换**
   - 类型系统差异
   - 异步处理方式
   - 库生态差异

2. **性能考虑**
   - Python BM25 性能不如 Rust/C++
   - 需要缓存优化
   - 考虑批处理

3. **中文支持**
   - OpenClaw 主要英文
   - CKS Lite 需要中文分词（jieba）
   - 测试中文场景

### 风险和缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| BM25 性能不足 | 中 | 使用 Cython 加速 |
| 中文分词不准 | 中 | 使用 jieba + 自定义词典 |
| Markdown 解析复杂 | 低 | 简化格式约定 |
| 文件监控跨平台 | 低 | 使用成熟库（watchdog） |

---

## 📚 参考资源

- **OpenClaw 源码**：E:\Gitee-Project\openclaw\src\memory
- **BM25 算法**：https://en.wikipedia.org/wiki/Okapi_BM25
- **rank-bm25 文档**：https://github.com/dorianbrown/rank_bm25
- **jieba 分词**：https://github.com/fxsjy/jieba

---

**最后更新**：2026-02-05 18:30
**策略**：代码移植而非依赖安装
**下一步**：开始 Task #16 - 提取 OpenClaw 代码
