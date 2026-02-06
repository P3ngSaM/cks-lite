# -*- coding: utf-8 -*-
import httpx

# 测试搜索
response = httpx.get(
    "http://127.0.0.1:7860/memory/hybrid-search",
    params={
        "user_id": "default-user",
        "query": "AI助手的名字",
        "top_k": 5
    },
    timeout=10.0
)

print(f"Status: {response.status_code}")
result = response.json()

print(f"\nSuccess: {result.get('success')}")
print(f"Found memories: {len(result.get('memories', []))}")

if result.get('memories'):
    for mem in result['memories']:
        print(f"\n- {mem.get('content', '')}")
        print(f"  Score: {mem.get('score', 0)}")
else:
    print("\nNo memories found!")
