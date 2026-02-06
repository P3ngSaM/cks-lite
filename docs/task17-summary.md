# Task #17 完成总结 - 混合搜索实现

**任务状态**: ✅ 已完成
**完成时间**: 2026-02-05
**预计工时**: 8小时
**实际工时**: ~6小时

---

## 实施内容

### 1. 创建混合搜索服务 (`agent-sdk/services/hybrid_search.py`)

**核心类: HybridSearchService**

```python
class HybridSearchService:
    """
    混合搜索服务
    结合 BM25 关键字搜索和向量语义搜索
    """

    def __init__(
        self,
        vector_weight: float = 0.7,  # 向量权重
        text_weight: float = 0.3,    # BM25权重
        bm25_k1: float = 1.5,
        bm25_b: float = 0.75
    ):
        # 权重之和必须为 1.0
        assert abs(vector_weight + text_weight - 1.0) < 0.001
```

**关键方法:**

| 方法 | 功能 | 输入 | 输出 |
|------|------|------|------|
| `tokenize()` | 中文/英文分词 | 文本字符串 | 词元列表 |
| `build_bm25_index()` | 构建BM25索引 | 文档列表 | 无 (内部状态) |
| `bm25_search()` | BM25关键字搜索 | 查询字符串, top_k | [(doc_id, score), ...] |
| `cosine_similarity()` | 余弦相似度计算 | 两个向量 | 相似度分数 ∈ [-1, 1] |
| `vector_search()` | 向量语义搜索 | 查询向量, 文档向量, top_k | [(doc_id, score), ...] |
| `merge_results()` | 融合两种搜索结果 | 向量结果, BM25结果 | SearchResult列表 |
| `search()` | **主搜索函数** | 查询, 查询向量, 文档, 向量 | SearchResult列表 |

**工具函数:**

- `bm25_rank_to_score()`: 将 SQLite FTS5 的负数排名转换为 [0, 1] 分数
- `build_fts_query()`: 构建 FTS5 查询字符串（AND 连接词元）

---

### 2. 集成到记忆管理器 (`agent-sdk/core/memory.py`)

**修改点:**

```python
class MemoryManager:
    def __init__(self, data_dir: Path, embedding_model: str):
        # ... 原有初始化代码

        # 新增: 初始化混合搜索服务
        self.hybrid_search = HybridSearchService(
            vector_weight=0.7,
            text_weight=0.3
        )
```

**新增方法:**

```python
async def _hybrid_search_v2(
    self,
    user_id: str,
    query: str,
    top_k: int,
    memory_type: Optional[str],
    min_score: float
) -> List[Dict]:
    """
    使用混合搜索服务进行记忆检索

    流程:
    1. 从数据库加载记忆文档
    2. 准备文档向量和查询向量
    3. 构建 BM25 索引
    4. 执行混合搜索
    5. 返回格式化结果
    """
```

**修改现有方法:**

```python
async def search_memories(
    self,
    user_id: str,
    query: str,
    top_k: int = 5,
    memory_type: Optional[str] = None,
    min_score: float = 0.3,
    use_hybrid: bool = True  # 新增参数
) -> List[Dict]:
    """
    支持切换混合搜索或纯向量搜索

    use_hybrid=True: 调用 _hybrid_search_v2()
    use_hybrid=False: 调用 _search_memories_legacy() (原有实现)
    """
```

---

### 3. 依赖安装

**添加到 `requirements.txt`:**

```txt
# Hybrid search (BM25 + Vector)
rank-bm25==0.2.2
jieba==0.42.1
```

**安装状态:** ✅ 已成功安装

```bash
Collecting rank-bm25==0.2.2
  Using cached rank_bm25-0.2.2-py3-none-any.whl.metadata
Collecting jieba==0.42.1
  Using cached jieba-0.42.1.tar.gz
```

---

### 4. 测试验证

#### 单元测试 (`test_hybrid_search.py`)

**测试覆盖:**

| 测试 | 描述 | 状态 |
|------|------|------|
| `test_tokenize()` | 中文/英文分词功能 | ✅ 通过 |
| `test_build_fts_query()` | FTS5 查询构建 | ✅ 通过 |
| `test_bm25_search()` | BM25 关键字搜索 | ✅ 通过 |
| `test_cosine_similarity()` | 余弦相似度计算 | ✅ 通过 |
| `test_hybrid_search()` | 完整混合搜索流程 | ✅ 通过 |

**测试结果示例:**

```
测试 3: BM25 搜索
查询: Python 数据分析
  [1.000] 用户喜欢使用 Python 进行数据分析和机器学习开发...
  [0.278] Python 是一门流行的编程语言，广泛用于数据科学...

测试 4: 余弦相似度
vec1 vs vec2 (相同): 1.000
vec1 vs vec3 (正交): 0.000
vec1 vs vec4 (45度): 0.707

测试 5: 混合搜索
查询: Python 编程风格
1. [0.829] 用户的编程风格偏向简洁和模块化
   向量分数: 0.755, BM25 分数: 1.000
2. [0.721] 用户喜欢使用 Python 和 TypeScript 进行开发
   向量分数: 0.774, BM25 分数: 0.596

[SUCCESS] All tests passed!
```

---

## 技术亮点

### 1. 算法实现

**BM25 评分公式 (rank-bm25 库):**

```
score(D, Q) = Σ IDF(qi) × f(qi, D) × (k1 + 1) / (f(qi, D) + k1 × (1 - b + b × |D| / avgdl))

其中:
- IDF(qi): 逆文档频率
- f(qi, D): 词频
- |D|: 文档长度
- avgdl: 平均文档长度
- k1=1.5, b=0.75 (调参)
```

**余弦相似度:**

```python
similarity = dot(vec_a, vec_b) / (norm(vec_a) * norm(vec_b))
```

**融合策略:**

```python
final_score = 0.7 × vector_score + 0.3 × text_score
```

### 2. 中文支持

- 使用 `jieba` 库进行中文分词
- `jieba.cut_for_search()` 模式适合搜索场景
- Fallback 到正则表达式分词（仅英文）

### 3. 归一化

- BM25 分数归一化到 [0, 1] 区间 (`scores / max_score`)
- 余弦相似度本身在 [-1, 1]，过滤负值
- 统一分数尺度，便于加权融合

### 4. 灵活配置

```python
# 可调整的参数
HybridSearchService(
    vector_weight=0.7,    # 语义权重
    text_weight=0.3,      # 关键字权重
    bm25_k1=1.5,          # BM25 词频饱和参数
    bm25_b=0.75           # BM25 长度归一化参数
)
```

---

## 与 OpenClaw 的对比

| 特性 | OpenClaw (TypeScript) | CKS Lite (Python) |
|------|----------------------|-------------------|
| BM25 实现 | SQLite FTS5 | rank-bm25 库 |
| 向量搜索 | FAISS | FAISS |
| 中文分词 | 无 | jieba |
| 融合权重 | 0.7 / 0.3 | 0.7 / 0.3 (可配置) |
| 索引构建 | 内存 + SQLite | 内存 (BM25Okapi) |
| 结果格式 | `SearchResult` 数据类 | `SearchResult` 数据类 |

---

## 性能优化

### 1. BM25 索引缓存

- 一次构建，多次查询
- 索引存储在 `self.bm25_index`
- 文档更新时需要重建索引

### 2. 向量归一化

- 预计算向量范数
- 避免重复计算

### 3. Top-K 候选倍数

```python
# 先从两种搜索各取 top_k × 2 候选
vector_results = self.vector_search(query_embedding, top_k=top_k * 2)
bm25_results = self.bm25_search(query, top_k=top_k * 2)

# 融合后再截取 top_k
merged_results = self.merge_results(vector_results, bm25_results)
final_results = merged_results[:top_k]
```

### 4. 零分过滤

```python
# BM25 过滤零分文档
if normalized_scores[idx] > 0:
    results.append((document_ids[idx], score))

# 余弦相似度过滤负值
if similarity > 0:
    similarities.append((doc_id, similarity))
```

---

## 后续优化建议

### 短期 (Phase 2)

1. **支持 SQLite FTS5**
   - 直接查询数据库，减少内存占用
   - 更快的索引更新

2. **缓存优化**
   - 查询结果缓存 (LRU)
   - 分词结果缓存

3. **增量索引**
   - 支持增量添加文档
   - 避免每次重建完整索引

### 中期 (Phase 3-4)

4. **权重自适应**
   - 根据查询类型动态调整权重
   - 短查询增加 BM25 权重，长查询增加向量权重

5. **多字段搜索**
   - 支持标题、内容、标签分别评分
   - 字段权重可配置

6. **重排序 (Reranking)**
   - 使用更大的模型对 top-k 候选重排序
   - 提升最终结果质量

### 长期 (Phase 5+)

7. **学习排序 (LTR)**
   - 收集用户点击数据
   - 训练排序模型优化权重

8. **个性化搜索**
   - 基于用户历史行为
   - 调整个性化权重

---

## 文件清单

**新增文件:**

```
agent-sdk/
├── services/
│   └── hybrid_search.py          (440 行, 新建)
├── test_hybrid_search.py         (208 行, 新建)
└── test_memory_integration.py    (128 行, 新建)
```

**修改文件:**

```
agent-sdk/
├── core/
│   └── memory.py                 (新增 _hybrid_search_v2 方法)
└── requirements.txt              (新增 rank-bm25, jieba)
```

**文档:**

```
docs/
├── openclaw-code-analysis.md     (深度代码分析)
└── task17-summary.md             (本文档)
```

---

## 关键代码片段

### 混合搜索主函数

```python
def search(
    self,
    query: str,
    query_embedding: np.ndarray,
    documents: List[Dict],
    document_embeddings: List[np.ndarray],
    top_k: int = 10,
    min_score: float = 0.0,
    use_hybrid: bool = True
) -> List[SearchResult]:
    """
    混合搜索主函数

    1. 向量搜索 (语义相似度)
    2. BM25 搜索 (关键字匹配)
    3. 加权融合
    4. 排序和截断
    """

    # 1. 向量搜索
    vector_results = self.vector_search(
        query_embedding,
        doc_embeddings_with_id,
        top_k=top_k * 2
    )

    # 2. BM25 搜索
    bm25_results = self.bm25_search(query, top_k=top_k * 2)

    # 3. 融合结果
    merged_results = self.merge_results(
        vector_results,
        bm25_results,
        docs_dict
    )

    # 4. 过滤和截断
    final_results = [r for r in merged_results if r.score >= min_score][:top_k]

    return final_results
```

### 融合算法

```python
def merge_results(
    self,
    vector_results: List[Tuple[str, float]],
    bm25_results: List[Tuple[str, float]],
    documents: Dict[str, Dict]
) -> List[SearchResult]:
    """
    融合向量和 BM25 搜索结果

    使用加权和: score = w_v × s_v + w_t × s_t
    """
    merged = {}

    # 添加向量结果
    for doc_id, score in vector_results:
        merged[doc_id] = {
            'vector_score': score,
            'text_score': 0.0
        }

    # 合并 BM25 结果
    for doc_id, score in bm25_results:
        if doc_id in merged:
            merged[doc_id]['text_score'] = score
        else:
            merged[doc_id] = {
                'vector_score': 0.0,
                'text_score': score
            }

    # 计算融合分数
    results = []
    for doc_id, scores in merged.items():
        final_score = (
            self.vector_weight * scores['vector_score'] +
            self.text_weight * scores['text_score']
        )

        results.append(SearchResult(
            id=doc_id,
            content=documents[doc_id]['content'],
            score=final_score,
            vector_score=scores['vector_score'],
            text_score=scores['text_score'],
            ...
        ))

    # 按最终分数降序排序
    results.sort(key=lambda x: x.score, reverse=True)

    return results
```

---

## 验收标准 ✅

- [x] 实现 HybridSearchService 类
- [x] 支持 BM25 关键字搜索
- [x] 支持向量语义搜索
- [x] 支持中文分词 (jieba)
- [x] 支持加权融合
- [x] 支持可配置权重
- [x] 集成到 MemoryManager
- [x] 编写单元测试
- [x] 所有测试通过
- [x] 更新依赖文件
- [x] 编写技术文档

---

## 下一步: Task #18

**任务**: 实现 Markdown 文件记忆系统
**预计工时**: 6小时

**实施内容**:
1. 支持从 Markdown 文件导入记忆
2. 支持导出记忆到 Markdown 文件
3. 实现文件监控和自动同步
4. 集成到前端 UI

---

**文档创建时间**: 2026-02-05
**创建者**: Claude (Sonnet 4.5)
