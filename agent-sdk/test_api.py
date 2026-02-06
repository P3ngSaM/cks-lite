"""
简单的 API 测试脚本
"""

import sys
import requests
import json

# Fix Windows console encoding
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:7860"

def test_health():
    """测试健康检查"""
    print("=" * 60)
    print("测试健康检查")
    print("=" * 60)

    response = requests.get(f"{BASE_URL}/")
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), ensure_ascii=False, indent=2)}")

def test_chat():
    """测试对话"""
    print("\n" + "=" * 60)
    print("测试对话接口")
    print("=" * 60)

    payload = {
        "user_id": "demo_user",
        "message": "你好，请简单介绍一下你自己",
        "session_id": "test_session",
        "use_memory": True
    }

    print(f"发送消息: {payload['message']}")

    try:
        response = requests.post(
            f"{BASE_URL}/chat",
            json=payload,
            timeout=30
        )

        print(f"状态码: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print(f"\n助手回复: {result.get('message', '')}")

            if result.get('memory_used'):
                print(f"\n使用的记忆: {len(result['memory_used'])} 条")
                for i, mem in enumerate(result['memory_used'], 1):
                    print(f"  {i}. [{mem['similarity']:.2f}] {mem['content']}")
        else:
            print(f"错误响应: {response.text}")

    except Exception as e:
        print(f"请求失败: {e}")

def test_memory_search():
    """测试记忆搜索"""
    print("\n" + "=" * 60)
    print("测试记忆搜索")
    print("=" * 60)

    response = requests.get(
        f"{BASE_URL}/memory/search",
        params={
            "user_id": "demo_user",
            "query": "公司",
            "top_k": 3
        }
    )

    print(f"状态码: {response.status_code}")

    if response.status_code == 200:
        result = response.json()
        if result.get('success'):
            memories = result.get('memories', [])
            print(f"找到 {len(memories)} 条记忆:")
            for i, mem in enumerate(memories, 1):
                score = mem.get('final_score', mem.get('similarity', 0))
                print(f"  {i}. [{score:.2f}] {mem['content'][:60]}...")
        else:
            print(f"搜索失败: {result.get('error')}")

def test_skills():
    """测试 Skills 列表"""
    print("\n" + "=" * 60)
    print("测试 Skills 列表")
    print("=" * 60)

    response = requests.get(f"{BASE_URL}/skills")
    print(f"状态码: {response.status_code}")

    if response.status_code == 200:
        result = response.json()
        skills = result.get('skills', [])
        print(f"可用 Skills: {len(skills)} 个")
        for i, skill in enumerate(skills, 1):
            mode = "🔄 混合" if skill.get('is_hybrid') else ("🤖 AI" if skill.get('has_skill') else "📱 应用")
            print(f"  {i}. {mode} {skill['display_name']}")

if __name__ == "__main__":
    try:
        test_health()
        test_skills()
        test_memory_search()
        test_chat()

        print("\n" + "=" * 60)
        print("✅ 所有测试完成")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
