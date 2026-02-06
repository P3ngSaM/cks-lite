# -*- coding: utf-8 -*-
"""
完整测试：AI 助手名字识别
"""

import httpx
import json
import time

print("=" * 60)
print("测试 AI 助手名字识别功能")
print("=" * 60)

# 1. 检查 Agent SDK 状态
print("\n[1] 检查 Agent SDK 状态...")
try:
    response = httpx.get("http://127.0.0.1:7860/", timeout=5.0)
    if response.status_code == 200:
        print("✅ Agent SDK 正常运行")
    else:
        print(f"❌ Agent SDK 状态异常: {response.status_code}")
        exit(1)
except Exception as e:
    print(f"❌ 无法连接到 Agent SDK: {e}")
    exit(1)

# 2. 检查记忆中是否有 ALEX
print("\n[2] 检查记忆中的 ALEX...")
try:
    response = httpx.get(
        "http://127.0.0.1:7860/memory/list",
        params={"user_id": "default-user", "memory_type": "preference", "limit": 10},
        timeout=5.0
    )
    data = response.json()
    if data.get("success") and data.get("memories"):
        print(f"✅ 找到 {len(data['memories'])} 条 preference 记忆")
        for mem in data["memories"]:
            content = mem.get("content", "")
            if "ALEX" in content or "Alex" in content:
                print(f"✅ 找到 ALEX 记忆: {mem.get('id')}")
                break
    else:
        print("❌ 没有找到 preference 记忆")
except Exception as e:
    print(f"❌ 检查记忆失败: {e}")

# 3. 测试搜索功能
print("\n[3] 测试搜索 'AI助手的名字'...")
try:
    response = httpx.get(
        "http://127.0.0.1:7860/memory/hybrid-search",
        params={
            "user_id": "default-user",
            "query": "AI助手的名字",
            "top_k": 3
        },
        timeout=5.0
    )
    data = response.json()
    if data.get("success") and data.get("memories"):
        print(f"✅ 搜索成功，找到 {len(data['memories'])} 条记忆")
        for mem in data["memories"]:
            print(f"  - Score: {mem.get('score', 0):.4f}")
    else:
        print("❌ 搜索失败或无结果")
except Exception as e:
    print(f"❌ 搜索失败: {e}")

# 4. 测试对话
print("\n[4] 测试对话 '你好，你是谁？'...")
try:
    response = httpx.post(
        "http://127.0.0.1:7860/chat",
        headers={"Content-Type": "application/json"},
        json={
            "user_id": "default-user",
            "message": "你好，你是谁？",
            "session_id": f"test-{int(time.time())}",
            "use_memory": True
        },
        timeout=30.0
    )

    if response.status_code == 200:
        data = response.json()
        message = data.get("message", "")

        print("\n✅ 对话成功!")
        print("\nAI 回复:")
        print("-" * 60)
        # 只打印 ASCII 和基本字符，避免编码问题
        safe_message = ""
        for char in message:
            if ord(char) < 128 or char in ["你", "好", "我", "是", "的", "了", "和", "A", "L", "E", "X"]:
                safe_message += char
            else:
                safe_message += "?"
        print(safe_message[:300])
        print("-" * 60)

        # 检查是否包含 ALEX
        if "ALEX" in message or "Alex" in message:
            print("\n🎉 成功! AI 使用了名字 ALEX")
        else:
            print("\n⚠️  AI 没有使用 ALEX 这个名字")

    else:
        print(f"❌ 对话失败: HTTP {response.status_code}")

except Exception as e:
    print(f"❌ 对话测试失败: {e}")

print("\n" + "=" * 60)
print("测试完成")
print("=" * 60)
