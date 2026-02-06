"""
测试混合搜索功能
"""

import sys
from pathlib import Path
import numpy as np

# 添加路径
sys.path.insert(0, str(Path(__file__).parent / "services"))

from hybrid_search import HybridSearchService, build_fts_query, bm25_rank_to_score

def test_tokenize():
    """测试分词功能"""
    print("=" * 50)
    print("测试 1: 分词功能")
    print("=" * 50)

    hybrid_search = HybridSearchService()

    test_texts = [
        "如何使用 Python 实现混合搜索？",
        "OpenClaw memory system architecture",
        "用户的编程偏好和技能水平"
    ]

    for text in test_texts:
        tokens = hybrid_search.tokenize(text)
        print(f"文本: {text}")
        print(f"词元: {tokens}\n")

def test_build_fts_query():
    """测试 FTS 查询构建"""
    print("=" * 50)
    print("测试 2: FTS 查询构建")
    print("=" * 50)

    test_queries = [
        "hello world",
        "Python混合搜索",
        "foo-bar baz-1",
        "用户偏好"
    ]

    for query in test_queries:
        fts_query = build_fts_query(query)
        print(f"原始: {query}")
        print(f"FTS: {fts_query}\n")

def test_bm25_search():
    """测试 BM25 搜索"""
    print("=" * 50)
    print("测试 3: BM25 搜索")
    print("=" * 50)

    # 准备测试文档
    documents = [
        {
            'id': 'doc1',
            'content': '用户喜欢使用 Python 进行数据分析和机器学习开发'
        },
        {
            'id': 'doc2',
            'content': '用户偏好简洁的代码风格，使用 TypeScript 和 React'
        },
        {
            'id': 'doc3',
            'content': 'OpenClaw 是一个强大的 AI 助手框架，支持混合搜索'
        },
        {
            'id': 'doc4',
            'content': '混合搜索结合了 BM25 关键字检索和向量语义搜索'
        },
        {
            'id': 'doc5',
            'content': 'Python 是一门流行的编程语言，广泛用于数据科学'
        }
    ]

    hybrid_search = HybridSearchService()
    hybrid_search.build_bm25_index(documents)

    test_queries = [
        "Python 数据分析",
        "用户偏好",
        "混合搜索算法",
        "TypeScript React"
    ]

    for query in test_queries:
        results = hybrid_search.bm25_search(query, top_k=3)
        print(f"查询: {query}")
        for doc_id, score in results:
            doc = next(d for d in documents if d['id'] == doc_id)
            print(f"  [{score:.3f}] {doc['content'][:50]}...")
        print()

def test_cosine_similarity():
    """测试余弦相似度"""
    print("=" * 50)
    print("测试 4: 余弦相似度")
    print("=" * 50)

    hybrid_search = HybridSearchService()

    # 测试向量
    vec1 = np.array([1.0, 0.0, 0.0])
    vec2 = np.array([1.0, 0.0, 0.0])
    vec3 = np.array([0.0, 1.0, 0.0])
    vec4 = np.array([0.5, 0.5, 0.0])

    print(f"vec1 vs vec2 (相同): {hybrid_search.cosine_similarity(vec1, vec2):.3f}")
    print(f"vec1 vs vec3 (正交): {hybrid_search.cosine_similarity(vec1, vec3):.3f}")
    print(f"vec1 vs vec4 (45度): {hybrid_search.cosine_similarity(vec1, vec4):.3f}")
    print()

def test_hybrid_search():
    """测试混合搜索"""
    print("=" * 50)
    print("测试 5: 混合搜索")
    print("=" * 50)

    # 准备测试文档
    documents = [
        {
            'id': 'mem1',
            'content': '用户喜欢使用 Python 和 TypeScript 进行开发',
            'memory_type': 'preference',
            'created_at': '2026-02-05 10:00:00'
        },
        {
            'id': 'mem2',
            'content': '用户的编程风格偏向简洁和模块化',
            'memory_type': 'preference',
            'created_at': '2026-02-05 11:00:00'
        },
        {
            'id': 'mem3',
            'content': '混合搜索系统结合了 BM25 和向量搜索',
            'memory_type': 'knowledge',
            'created_at': '2026-02-05 12:00:00'
        },
        {
            'id': 'mem4',
            'content': 'OpenClaw 使用 SQLite FTS5 实现关键字搜索',
            'memory_type': 'knowledge',
            'created_at': '2026-02-05 13:00:00'
        }
    ]

    # 模拟向量嵌入 (实际应该使用 embedding 模型)
    document_embeddings = [
        np.random.rand(384),  # mem1
        np.random.rand(384),  # mem2
        np.random.rand(384),  # mem3
        np.random.rand(384),  # mem4
    ]

    hybrid_search = HybridSearchService(vector_weight=0.7, text_weight=0.3)
    hybrid_search.build_bm25_index(documents)

    # 查询
    query = "Python 编程风格"
    query_embedding = np.random.rand(384)

    results = hybrid_search.search(
        query=query,
        query_embedding=query_embedding,
        documents=documents,
        document_embeddings=document_embeddings,
        top_k=3,
        use_hybrid=True
    )

    print(f"查询: {query}")
    print(f"使用混合搜索 (vector_weight=0.7, text_weight=0.3)\n")

    for i, result in enumerate(results, 1):
        print(f"{i}. [{result.score:.3f}] {result.content}")
        print(f"   向量分数: {result.vector_score:.3f}, BM25 分数: {result.text_score:.3f}")
        print(f"   类型: {result.memory_type}, 时间: {result.created_at}\n")

def main():
    """运行所有测试"""
    print("\n" + "=" * 50)
    print("混合搜索功能测试")
    print("=" * 50 + "\n")

    try:
        test_tokenize()
        test_build_fts_query()
        test_bm25_search()
        test_cosine_similarity()
        test_hybrid_search()

        print("=" * 50)
        print("[SUCCESS] All tests passed!")
        print("=" * 50)

    except Exception as e:
        print(f"\n[ERROR] Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
