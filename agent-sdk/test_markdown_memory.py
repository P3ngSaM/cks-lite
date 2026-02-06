"""
测试 Markdown 记忆系统
"""

import sys
from pathlib import Path
import tempfile
import shutil

# 添加路径
sys.path.insert(0, str(Path(__file__).parent / "services"))

from markdown_memory import MarkdownMemory, trigger_memory_flush, format_memory_prompt

def test_initialize():
    """测试初始化"""
    print("=" * 50)
    print("测试 1: 初始化 Markdown 记忆系统")
    print("=" * 50)

    # 创建临时目录
    temp_dir = Path(tempfile.mkdtemp())
    print(f"临时目录: {temp_dir}")

    # 初始化
    md_memory = MarkdownMemory(temp_dir)

    # 检查文件
    assert md_memory.memory_file.exists(), "MEMORY.md 未创建"
    assert md_memory.daily_dir.exists(), "memory/ 目录未创建"

    print(f"[SUCCESS] MEMORY.md 已创建: {md_memory.memory_file}")
    print(f"[SUCCESS] memory/ 目录已创建: {md_memory.daily_dir}")

    # 清理
    shutil.rmtree(temp_dir)
    print()

def test_save_memory():
    """测试保存记忆"""
    print("=" * 50)
    print("测试 2: 保存记忆到 MEMORY.md")
    print("=" * 50)

    temp_dir = Path(tempfile.mkdtemp())
    md_memory = MarkdownMemory(temp_dir)

    # 保存几条记忆
    memories = [
        {
            "content": "用户喜欢使用 Python 进行数据分析和机器学习开发",
            "type": "preference",
            "tags": ["Python", "数据分析"]
        },
        {
            "content": "OpenClaw 使用混合搜索系统（BM25 + 向量）提升检索准确率",
            "type": "knowledge",
            "tags": ["混合搜索", "BM25"]
        },
        {
            "content": "用户正在开发 CKS Lite 桌面应用，集成 Agent SDK",
            "type": "context",
            "tags": ["CKS Lite", "项目"]
        }
    ]

    for memory in memories:
        memory_id = md_memory.save_memory(
            content=memory["content"],
            memory_type=memory["type"],
            tags=memory["tags"]
        )
        print(f"保存记忆: {memory_id}")

    # 读取文件
    content = md_memory.read_memory()
    print(f"\nMEMORY.md 大小: {len(content)} 字符")

    # 验证
    assert "用户喜欢使用 Python" in content
    assert "OpenClaw 使用混合搜索" in content
    assert "CKS Lite 桌面应用" in content
    print("[SUCCESS] 所有记忆已保存到 MEMORY.md")

    # 清理
    shutil.rmtree(temp_dir)
    print()

def test_save_daily_log():
    """测试保存日志"""
    print("=" * 50)
    print("测试 3: 保存每日日志")
    print("=" * 50)

    temp_dir = Path(tempfile.mkdtemp())
    md_memory = MarkdownMemory(temp_dir)

    # 保存日志
    logs = [
        {"content": "用户开始对话，询问混合搜索原理", "type": "conversation"},
        {"content": "AI 解释了 BM25 和向量搜索的区别", "type": "conversation"},
        {"content": "系统检测到 token 数接近限制", "type": "system"}
    ]

    for log in logs:
        log_path = md_memory.save_daily_log(
            content=log["content"],
            log_type=log["type"]
        )
        print(f"保存日志: {log_path}")

    # 读取今日日志
    log_content = md_memory.read_daily_log()
    print(f"\n今日日志大小: {len(log_content)} 字符")

    # 验证
    assert "用户开始对话" in log_content
    assert "AI 解释了" in log_content
    assert "token 数接近限制" in log_content
    print("[SUCCESS] 所有日志已保存")

    # 清理
    shutil.rmtree(temp_dir)
    print()

def test_parse_memories():
    """测试解析记忆"""
    print("=" * 50)
    print("测试 4: 解析 MEMORY.md")
    print("=" * 50)

    temp_dir = Path(tempfile.mkdtemp())
    md_memory = MarkdownMemory(temp_dir)

    # 保存测试数据
    md_memory.save_memory(
        "用户偏好简洁的代码风格",
        memory_type="preference",
        tags=["代码风格"]
    )
    md_memory.save_memory(
        "BM25 算法基于概率排名模型",
        memory_type="knowledge",
        tags=["BM25", "算法"]
    )

    # 解析
    memories = md_memory.parse_memories()
    print(f"解析到 {len(memories)} 条记忆:")

    for memory in memories:
        print(f"  - [{memory['type']}] {memory['content'][:40]}...")
        print(f"    标签: {memory['tags']}")

    # 验证
    assert len(memories) == 2
    assert memories[0]["type"] == "preference"
    assert memories[1]["type"] == "knowledge"
    assert "代码风格" in memories[0]["tags"]
    print("[SUCCESS] 解析正确")

    # 清理
    shutil.rmtree(temp_dir)
    print()

def test_search_memories():
    """测试搜索记忆"""
    print("=" * 50)
    print("测试 5: 搜索记忆")
    print("=" * 50)

    temp_dir = Path(tempfile.mkdtemp())
    md_memory = MarkdownMemory(temp_dir)

    # 保存测试数据
    test_memories = [
        ("用户喜欢使用 Python", "preference"),
        ("Python 是一门流行的编程语言", "knowledge"),
        ("用户正在学习混合搜索", "context")
    ]

    for content, mem_type in test_memories:
        md_memory.save_memory(content, memory_type=mem_type)

    # 搜索
    results = md_memory.search_memories("Python")
    print(f"搜索 'Python': 找到 {len(results)} 条")
    for result in results:
        print(f"  - {result['content'][:40]}...")

    # 验证
    assert len(results) == 2  # 两条包含 Python

    # 按类型搜索
    results = md_memory.search_memories("Python", memory_type="preference")
    print(f"\n搜索 'Python' (preference): 找到 {len(results)} 条")
    assert len(results) == 1
    print("[SUCCESS] 搜索功能正常")

    # 清理
    shutil.rmtree(temp_dir)
    print()

def test_recent_logs():
    """测试获取最近日志"""
    print("=" * 50)
    print("测试 6: 获取最近日志")
    print("=" * 50)

    temp_dir = Path(tempfile.mkdtemp())
    md_memory = MarkdownMemory(temp_dir)

    # 保存一些日志
    for i in range(3):
        md_memory.save_daily_log(f"测试日志 {i}", log_type="test")

    # 获取最近日志
    logs = md_memory.get_recent_logs(days=7)
    print(f"最近 7 天日志: {len(logs)} 个文件")

    for log in logs:
        print(f"  - {log['date']}: {log['size']} 字节")

    # 验证
    assert len(logs) == 1  # 只有今天的日志
    print("[SUCCESS] 日志列表正确")

    # 清理
    shutil.rmtree(temp_dir)
    print()

def test_export_import():
    """测试导出导入"""
    print("=" * 50)
    print("测试 7: 导出和导入 JSON")
    print("=" * 50)

    temp_dir = Path(tempfile.mkdtemp())
    md_memory = MarkdownMemory(temp_dir)

    # 保存数据
    md_memory.save_memory("测试记忆 1", "knowledge")
    md_memory.save_memory("测试记忆 2", "preference")

    # 导出
    exported_data = md_memory.export_to_json()
    print(f"导出数据: {len(exported_data['memories'])} 条记忆")
    print(f"导出时间: {exported_data['export_time']}")

    # 验证
    assert len(exported_data["memories"]) == 2
    assert exported_data["version"] == "1.0"
    print("[SUCCESS] 导出成功")

    # 创建新实例进行导入测试
    temp_dir2 = Path(tempfile.mkdtemp())
    md_memory2 = MarkdownMemory(temp_dir2)

    md_memory2.import_from_json(exported_data)

    # 验证导入
    imported_memories = md_memory2.parse_memories()
    print(f"导入记忆: {len(imported_memories)} 条")
    assert len(imported_memories) == 2
    print("[SUCCESS] 导入成功")

    # 清理
    shutil.rmtree(temp_dir)
    shutil.rmtree(temp_dir2)
    print()

def test_trigger_flush():
    """测试触发刷新"""
    print("=" * 50)
    print("测试 8: 触发记忆刷新")
    print("=" * 50)

    # 短上下文
    short_context = "这是一个简短的上下文" * 100
    result = trigger_memory_flush(short_context, threshold=150000)
    print(f"短上下文: {len(short_context)} 字符, 需要刷新: {result}")
    assert result is False

    # 长上下文 (需要超过 threshold * 0.75 字符数)
    # 150000 tokens * 0.75 = 112500 字符
    long_context = "这是一个很长的上下文" * 20000  # ~240000 字符
    result = trigger_memory_flush(long_context, threshold=150000)
    print(f"长上下文: {len(long_context)} 字符, 需要刷新: {result}")
    assert result is True

    print("[SUCCESS] 刷新触发逻辑正确")
    print()

def test_format_prompt():
    """测试格式化提示词"""
    print("=" * 50)
    print("测试 9: 格式化记忆为提示词")
    print("=" * 50)

    memories = [
        {"type": "preference", "content": "用户喜欢使用 Python"},
        {"type": "knowledge", "content": "BM25 是一种关键字排名算法"}
    ]

    prompt = format_memory_prompt(memories)
    print("格式化结果:")
    print(prompt)

    assert "用户喜欢使用 Python" in prompt
    assert "BM25" in prompt
    print("[SUCCESS] 格式化正确")
    print()

def main():
    """运行所有测试"""
    print("\n" + "=" * 50)
    print("Markdown 记忆系统测试")
    print("=" * 50 + "\n")

    try:
        test_initialize()
        test_save_memory()
        test_save_daily_log()
        test_parse_memories()
        test_search_memories()
        test_recent_logs()
        test_export_import()
        test_trigger_flush()
        test_format_prompt()

        print("=" * 50)
        print("[SUCCESS] All tests passed!")
        print("=" * 50)

    except Exception as e:
        print(f"\n[ERROR] Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
