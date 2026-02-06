# -*- coding: utf-8 -*-
"""
快速测试对话功能
"""

import httpx
import json

print("Testing chat endpoint...")

# 测试对话请求
response = httpx.post(
    "http://127.0.0.1:7860/chat",
    headers={"Content-Type": "application/json"},
    json={
        "user_id": "test-user",
        "message": "你好，简单回复一下",
        "session_id": "test-session",
        "use_memory": True
    },
    timeout=30.0
)

print(f"Status: {response.status_code}")

if response.status_code == 200:
    result = response.json()
    print("\n=== SUCCESS ===")
    print(f"Response: {result.get('message', 'N/A')[:200]}")
else:
    print(f"\n=== FAILED ===")
    print(f"Error: {response.text[:300]}")
