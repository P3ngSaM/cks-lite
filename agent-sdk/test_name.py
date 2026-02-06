# -*- coding: utf-8 -*-
"""
测试 AI 助手名字识别
"""

import httpx
import json

print("Testing AI assistant name recognition...")

# 测试对话
response = httpx.post(
    "http://127.0.0.1:7860/chat",
    headers={"Content-Type": "application/json"},
    json={
        "user_id": "default-user",  # 使用实际用户ID
        "message": "你好，你是谁？",
        "session_id": "test-name-session",
        "use_memory": True
    },
    timeout=30.0
)

print(f"Status: {response.status_code}\n")

if response.status_code == 200:
    result = response.json()
    message = result.get('message', '')
    print("AI Response:")
    print(message)
    print("\n" + "="*60)

    # 检查是否包含 ALEX
    if "ALEX" in message or "Alex" in message:
        print("\n✅ SUCCESS! AI is using the name ALEX")
    else:
        print("\n❌ AI did not use the name ALEX")
        print(f"\nMemory used: {result.get('memory_used', [])}")
else:
    print(f"Error: {response.text}")
