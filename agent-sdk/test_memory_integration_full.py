"""
测试记忆系统是否正常工作
"""

import asyncio
import sys
from pathlib import Path

# 添加路径
sys.path.insert(0, str(Path(__file__).parent))

from core.memory import MemoryManager
from core.agent import ClaudeAgent
from core.skills_loader import SkillsLoader
import os
from dotenv import load_dotenv

load_dotenv()

async def test_memory_integration():
    """测试记忆集成"""
    print("=" * 60)
    print("测试记忆系统集成")
    print("=" * 60)

    # 初始化组件
    data_dir = Path("./test_data")
    data_dir.mkdir(exist_ok=True)

    memory_manager = MemoryManager(data_dir=data_dir)
    skills_loader = SkillsLoader()
    agent = ClaudeAgent(
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        memory_manager=memory_manager,
        skills_loader=skills_loader
    )

    print("\n1. 测试保存记忆...")

    # 保存一些测试记忆
    test_user = "test_user"

    memory_id1 = await memory_manager.save_memory(
        user_id=test_user,
        content="用户名叫 Sam，喜欢使用 Python 进行开发",
        memory_type="preference"
    )
    print(f"   保存记忆 1: {memory_id1}")

    memory_id2 = await memory_manager.save_memory(
        user_id=test_user,
        content="用户正在开发 CKS Lite 桌面应用",
        memory_type="context"
    )
    print(f"   保存记忆 2: {memory_id2}")

    print("\n2. 测试混合搜索...")

    # 搜索记忆
    results = await memory_manager.search_memories(
        user_id=test_user,
        query="Sam 喜欢什么",
        top_k=5,
        use_hybrid=True
    )

    print(f"   搜索结果: {len(results)} 条")
    for i, result in enumerate(results, 1):
        score = result.get("similarity", result.get("final_score", 0))
        print(f"   {i}. [{score:.3f}] {result['content'][:50]}...")

    print("\n3. 测试 Markdown 文件...")

    if memory_manager.markdown_memory:
        # 读取 MEMORY.md
        content = memory_manager.markdown_memory.read_memory()
        print(f"   MEMORY.md 大小: {len(content)} 字符")

        # 解析记忆
        memories = memory_manager.markdown_memory.parse_memories()
        print(f"   解析到 {len(memories)} 条 Markdown 记忆")

        # 读取今日日志
        log_content = memory_manager.markdown_memory.read_daily_log()
        print(f"   今日日志大小: {len(log_content)} 字符")
    else:
        print("   Markdown 记忆系统未启用")

    print("\n4. 测试对话（不调用 API，仅测试记忆检索）...")

    # 直接测试记忆检索
    test_query = "用户喜欢什么编程语言"
    memories = await memory_manager.search_memories(
        user_id=test_user,
        query=test_query,
        top_k=3,
        use_hybrid=True
    )

    if memories:
        print(f"   查询: {test_query}")
        print(f"   检索到 {len(memories)} 条相关记忆:")
        for i, mem in enumerate(memories, 1):
            score = mem.get("similarity", mem.get("final_score", 0))
            print(f"   {i}. [{score:.3f}] {mem['content'][:50]}...")
    else:
        print("   未检索到相关记忆")

    print("\n" + "=" * 60)
    print("测试完成！")
    print("=" * 60)

    # 清理测试数据
    import shutil
    if data_dir.exists():
        shutil.rmtree(data_dir)
    print("\n测试数据已清理")

if __name__ == "__main__":
    asyncio.run(test_memory_integration())
