# -*- coding: utf-8 -*-
"""
测试记忆召回功能（阈值修复后）
"""

import httpx
import time

print("=" * 60)
print("Testing Memory Recall (After Threshold Fix)")
print("=" * 60)

# 1. Check current memories
print("\n[1] Checking existing memories...")
try:
    response = httpx.get(
        "http://127.0.0.1:7860/memory/list",
        params={"user_id": "default-user", "limit": 10},
        timeout=5.0
    )

    if response.status_code == 200:
        data = response.json()
        if data.get("success") and data.get("memories"):
            memories = data["memories"]
            print(f"Found {len(memories)} memories")
            for mem in memories[:3]:
                print(f"  - [{mem.get('memory_type')}] {mem.get('content', '')[:60]}...")
        else:
            print("No memories found")
    else:
        print(f"Failed: {response.status_code}")
except Exception as e:
    print(f"Failed: {e}")

# 2. Test chat with memory
print("\n[2] Testing chat with '你好，请介绍一下你自己'...")
try:
    response = httpx.post(
        "http://127.0.0.1:7860/chat",
        headers={"Content-Type": "application/json"},
        json={
            "user_id": "default-user",
            "message": "你好，请介绍一下你自己",
            "session_id": f"test-recall-{int(time.time())}",
            "use_memory": True
        },
        timeout=30.0
    )

    if response.status_code == 200:
        data = response.json()
        message = data.get("message", "")
        memory_used = data.get("memory_used", [])

        print("\nSUCCESS!")
        print(f"\nMemories used: {len(memory_used)}")
        for mem in memory_used:
            print(f"  - {mem.get('content', '')[:60]}... (score: {mem.get('similarity', 0):.3f})")

        print(f"\nAI Response:")
        print("-" * 60)
        print(message[:300])
        print("-" * 60)

        # Check if AI used its name from memory
        if "ALEX" in message or "Alex" in message:
            print("\n>>> SUCCESS! AI is using its name from memory!")
        else:
            print("\n>>> WARNING: AI did not use its name")

    else:
        print(f"Failed: {response.status_code}")
        print(response.text)
except Exception as e:
    print(f"Failed: {e}")

print("\n" + "=" * 60)
print("Test Complete")
print("=" * 60)
