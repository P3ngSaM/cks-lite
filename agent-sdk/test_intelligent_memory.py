# -*- coding: utf-8 -*-
"""
测试智能记忆提取功能
"""

import httpx
import json
import time

print("=" * 60)
print("Testing Intelligent Memory Extraction")
print("=" * 60)

# 1. Clear old memories
print("\n[1] Clearing old memories...")
try:
    response = httpx.post(
        "http://127.0.0.1:7860/memory/clear-all",
        params={"user_id": "test-user", "backup": "false"},
        timeout=10.0
    )
    if response.status_code == 200:
        print("OK - Memories cleared")
    else:
        print(f"Failed: {response.status_code}")
except Exception as e:
    print(f"Failed: {e}")

# 2. Send message with personal info
print("\n[2] Sending test message with personal info, skills, projects...")
test_message = """
Hi! My name is Sam, I'm 28 years old, working at ByteDance as a Senior Frontend Engineer.
I mainly use React and TypeScript for development. Recently I'm working on a project called CKS Lite,
which is an AI workbench built with React + Tauri + Python.
I prefer clean code style and usually work with VSCode.
"""

try:
    response = httpx.post(
        "http://127.0.0.1:7860/chat",
        headers={"Content-Type": "application/json"},
        json={
            "user_id": "test-user",
            "message": test_message,
            "session_id": f"test-{int(time.time())}",
            "use_memory": True
        },
        timeout=30.0
    )

    if response.status_code == 200:
        data = response.json()
        print("\nSUCCESS - Chat completed!")
        print(f"\nAI Response: {data.get('message', '')[:200]}...")
    else:
        print(f"FAILED: {response.status_code}")
        print(response.text)
except Exception as e:
    print(f"FAILED: {e}")

# 3. Wait for extraction
print("\n[3] Waiting for intelligent memory extraction (3 seconds)...")
time.sleep(3)

# 4. Check extracted memories
print("\n[4] Checking extracted memories...")
try:
    response = httpx.get(
        "http://127.0.0.1:7860/memory/list",
        params={"user_id": "test-user", "limit": 20},
        timeout=5.0
    )

    if response.status_code == 200:
        data = response.json()
        if data.get("success") and data.get("memories"):
            memories = data["memories"]
            print(f"\nFound {len(memories)} memories\n")

            # Group by type
            by_type = {}
            for mem in memories:
                mem_type = mem.get("memory_type", "unknown")
                if mem_type not in by_type:
                    by_type[mem_type] = []
                by_type[mem_type].append(mem)

            for mem_type, mems in by_type.items():
                print(f"\n[{mem_type.upper()}] ({len(mems)} items)")
                for mem in mems:
                    content = mem.get("content", "")
                    metadata = mem.get("metadata", {})
                    source = metadata.get("source", "")
                    importance = metadata.get("importance", "")

                    # Show source marker
                    if source == "intelligent_extraction":
                        print(f"  [AI] {content[:80]}")
                        if importance:
                            print(f"       Importance: {importance}/10")
                    else:
                        print(f"  [CONV] {content[:80]}...")
        else:
            print("No memories found")
    else:
        print(f"Failed to get memories: {response.status_code}")
except Exception as e:
    print(f"Failed to get memories: {e}")

# 5. Test memory recall
print("\n[5] Testing memory recall...")
try:
    response = httpx.post(
        "http://127.0.0.1:7860/chat",
        headers={"Content-Type": "application/json"},
        json={
            "user_id": "test-user",
            "message": "What is my name? Where do I work?",
            "session_id": f"test-recall-{int(time.time())}",
            "use_memory": True
        },
        timeout=30.0
    )

    if response.status_code == 200:
        data = response.json()
        message = data.get("message", "")
        print("\nRecall test SUCCESS!")
        print(f"\nAI Response: {message[:300]}...")

        # Check if memory was used
        if "Sam" in message or "ByteDance" in message:
            print("\nSUCCESS! AI used the extracted memories!")
        else:
            print("\nWARNING: AI did not use the extracted memories")
    else:
        print(f"Recall test FAILED: {response.status_code}")
except Exception as e:
    print(f"Recall test FAILED: {e}")

print("\n" + "=" * 60)
print("Test Complete")
print("=" * 60)
