"""
测试混合搜索集成到记忆系统
"""

import asyncio
import sys
from pathlib import Path

# 添加路径
sys.path.insert(0, str(Path(__file__).parent))

from core.memory import MemoryManager

async def test_memory_hybrid_search():
    """测试记忆系统的混合搜索功能"""
    print("=" * 50)
    print("测试记忆系统混合搜索集成")
    print("=" * 50)

    # 初始化记忆管理器
    import tempfile
    import os

    test_dir = Path(tempfile.gettempdir()) / "cks_test_memory"
    test_dir.mkdir(exist_ok=True)

    memory_manager = MemoryManager(
        data_dir=test_dir,
        embedding_model="all-MiniLM-L6-v2"
    )

    # 测试用户
    user_id = "test_user"

    print("\n1. 添加测试记忆...")

    # 添加一些测试记忆
    test_memories = [
        {
            "content": "用户喜欢使用 Python 进行数据分析和机器学习开发",
            "memory_type": "preference"
        },
        {
            "content": "用户的编程风格偏向简洁和模块化设计",
            "memory_type": "preference"
        },
        {
            "content": "OpenClaw 项目使用混合搜索系统提升检索准确率",
            "memory_type": "knowledge"
        },
        {
            "content": "BM25 算法是一种基于概率的关键字排名算法",
            "memory_type": "knowledge"
        },
        {
            "content": "用户正在开发 CKS Lite 桌面应用程序",
            "memory_type": "context"
        }
    ]

    for memory in test_memories:
        memory_id = await memory_manager.save_memory(
            user_id=user_id,
            content=memory["content"],
            memory_type=memory["memory_type"]
        )
        print(f"  添加记忆: {memory_id} - {memory['content'][:30]}...")

    print("\n2. 测试向量搜索（use_hybrid=False）...")

    vector_results = await memory_manager.search_memories(
        user_id=user_id,
        query="Python 编程",
        top_k=3,
        use_hybrid=False
    )

    print(f"  找到 {len(vector_results)} 条记忆:")
    for i, memory in enumerate(vector_results, 1):
        print(f"    {i}. [{memory['similarity']:.3f}] {memory['content'][:50]}...")

    print("\n3. 测试混合搜索（use_hybrid=True）...")

    hybrid_results = await memory_manager.search_memories(
        user_id=user_id,
        query="Python 编程",
        top_k=3,
        use_hybrid=True
    )

    print(f"  找到 {len(hybrid_results)} 条记忆:")
    for i, memory in enumerate(hybrid_results, 1):
        print(f"    {i}. [{memory['similarity']:.3f}] {memory['content'][:50]}...")
        if 'text_score' in memory:
            print(f"       (向量: {memory.get('vector_score', 0):.3f}, BM25: {memory.get('text_score', 0):.3f})")

    print("\n4. 测试不同查询...")

    test_queries = [
        "用户偏好",
        "混合搜索算法",
        "CKS 应用"
    ]

    for query in test_queries:
        results = await memory_manager.search_memories(
            user_id=user_id,
            query=query,
            top_k=2,
            use_hybrid=True
        )
        print(f"\n  查询: {query}")
        for i, memory in enumerate(results, 1):
            print(f"    {i}. [{memory['similarity']:.3f}] {memory['content'][:40]}...")

    # 清理
    print("\n5. 清理测试数据...")
    import shutil
    if test_dir.exists():
        shutil.rmtree(test_dir)
    print("  测试数据已清理")

    print("\n" + "=" * 50)
    print("[SUCCESS] 混合搜索集成测试通过！")
    print("=" * 50)

if __name__ == "__main__":
    asyncio.run(test_memory_hybrid_search())
