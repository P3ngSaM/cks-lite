"""
CKS Lite Agent SDK - 演示脚本
无需 Claude API Key 即可测试基础功能
"""

import asyncio
import sys
from pathlib import Path

# Fix Windows console encoding for emoji support
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

from core.memory import MemoryManager
from core.skills_loader import SkillsLoader


async def test_memory_system():
    """测试长记忆系统"""
    print("\n" + "="*60)
    print("🧠 测试长记忆系统")
    print("="*60)

    # 创建数据目录
    data_dir = Path("./data")
    data_dir.mkdir(exist_ok=True)

    # 初始化记忆管理器（会自动检测 FAISS 是否可用）
    memory_manager = MemoryManager(data_dir=data_dir)

    print(f"\n✅ 记忆管理器初始化完成")
    print(f"   - 数据库路径: {memory_manager.db_path}")
    print(f"   - FAISS 可用: {memory_manager.index is not None}")
    print(f"   - 嵌入模型: {memory_manager.embedding_model is not None}")

    # 测试保存记忆
    print("\n📝 测试保存记忆...")
    memories = [
        "用户的公司名称是 ABC 科技，主营业务是 AI 软件开发",
        "用户偏好使用深色主题",
        "用户最近在做发票整理的工作",
        "用户希望学习 Python 和 Rust 编程语言",
        "项目需要在 3 月底前完成 MVP 版本"
    ]

    for i, content in enumerate(memories, 1):
        memory_id = await memory_manager.save_memory(
            user_id="demo_user",
            content=content,
            memory_type="conversation"
        )
        print(f"   {i}. 已保存: {content[:40]}... (ID: {memory_id})")

    # 测试搜索记忆
    print("\n🔍 测试搜索记忆...")
    queries = [
        "用户的公司是什么？",
        "用户在做什么工作？",
        "项目的截止日期"
    ]

    for query in queries:
        print(f"\n   查询: {query}")
        results = await memory_manager.search_memories(
            user_id="demo_user",
            query=query,
            top_k=3
        )

        if results:
            for j, result in enumerate(results, 1):
                similarity = result.get("final_score", result.get("similarity", 0))
                print(f"      {j}. [{similarity:.2f}] {result['content'][:50]}...")
        else:
            print("      (未找到相关记忆)")

    # 获取统计信息
    stats = memory_manager.get_stats()
    print(f"\n📊 记忆系统统计:")
    print(f"   - 总记忆数: {stats['total_memories']}")
    print(f"   - 按类型分布: {stats['by_type']}")
    print(f"   - 索引大小: {stats['index_size']}")


def test_skills_loader():
    """测试 Skills 加载器"""
    print("\n" + "="*60)
    print("🛠️  测试 Skills 加载器")
    print("="*60)

    # 初始化 Skills 加载器
    skills_loader = SkillsLoader()

    print(f"\n✅ Skills 加载器初始化完成")
    print(f"   - 已加载 Skills: {len(skills_loader.skills)} 个")

    # 显示所有 Skills
    print("\n📦 已加载的 Skills:")
    for i, skill in enumerate(skills_loader.skills, 1):
        mode = "🔄 混合" if skill.is_hybrid else ("🤖 AI" if skill.has_skill else "📱 应用")
        print(f"   {i}. {mode} {skill.display_name}")
        print(f"      类型: {skill.project_type or 'AI 触发'}")
        print(f"      描述: {skill.description[:50]}..." if skill.description else "")
        if skill.trigger_keywords:
            print(f"      触发词: {', '.join(skill.trigger_keywords[:3])}")
        print()

    # 按分类展示
    print("\n📂 按分类分组:")
    categorized = skills_loader.get_skills_by_category()
    for category, skills in categorized.items():
        print(f"   {category}: {len(skills)} 个")
        for skill in skills:
            print(f"      - {skill.display_name}")

    # 测试关键词匹配
    print("\n🔍 测试关键词匹配:")
    test_messages = [
        "帮我下载这个视频",
        "生成一份 PPT",
        "帮我处理 Excel 文件",
        "发布到微信公众号"
    ]

    for msg in test_messages:
        skill = skills_loader.get_skill_by_keyword(msg)
        if skill:
            print(f"   '{msg}' → {skill.display_name}")
        else:
            print(f"   '{msg}' → (未匹配到 Skill)")

    # 获取统计信息
    stats = skills_loader.get_stats()
    print(f"\n📊 Skills 统计:")
    print(f"   - 总数: {stats['total']}")
    print(f"   - AI 触发: {stats['has_skill']}")
    print(f"   - 独立应用: {stats['has_app']}")
    print(f"   - 混合模式: {stats['hybrid']}")
    print(f"   - 分类数: {stats['categories']}")


def test_api_routes():
    """测试 API 路由"""
    print("\n" + "="*60)
    print("🚀 Agent SDK API 路由")
    print("="*60)

    print("\n可用的 API 接口:")
    routes = [
        ("GET", "/", "健康检查"),
        ("POST", "/chat", "对话接口（非流式）"),
        ("POST", "/chat/stream", "对话接口（流式）"),
        ("POST", "/memory/save", "保存记忆"),
        ("GET", "/memory/search", "搜索记忆"),
        ("GET", "/memory/list", "列出记忆"),
        ("DELETE", "/memory/{memory_id}", "删除记忆"),
        ("GET", "/skills", "列出所有 Skills"),
        ("GET", "/skills/{skill_name}", "获取 Skill 详情"),
        ("WS", "/ws", "WebSocket 实时对话")
    ]

    for i, (method, path, desc) in enumerate(routes, 1):
        print(f"   {i}. [{method:6}] {path:30} - {desc}")

    print("\n💡 提示:")
    print("   配置 Claude API Key 后，运行以下命令启动服务:")
    print("   $ cd agent-sdk")
    print("   $ venv\\Scripts\\activate  # Windows")
    print("   $ python main.py")
    print("   服务将在 http://127.0.0.1:7860 启动")


async def main():
    """主函数"""
    print("\n" + "🌟"*30)
    print("CKS Lite Agent SDK - 功能演示")
    print("版本: v0.0.1-alpha")
    print("🌟"*30)

    try:
        # 测试长记忆系统
        await test_memory_system()

        # 测试 Skills 加载器
        test_skills_loader()

        # 显示 API 路由
        test_api_routes()

        print("\n" + "="*60)
        print("✅ 所有测试完成！")
        print("="*60)

        print("\n下一步:")
        print("1. 编辑 .env 文件，添加你的 Claude API Key")
        print("2. 运行: python main.py")
        print("3. 访问: http://127.0.0.1:7860/docs 查看 API 文档")
        print("4. 测试对话: curl -X POST http://127.0.0.1:7860/chat \\")
        print("             -H 'Content-Type: application/json' \\")
        print("             -d '{\"user_id\":\"test\",\"message\":\"你好\"}'")

    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
