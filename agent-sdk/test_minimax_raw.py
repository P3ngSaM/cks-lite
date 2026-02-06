"""
测试 MiniMax API 的原始 HTTP 请求
"""

import os
import httpx
import json
from dotenv import load_dotenv

# 加载环境变量
load_dotenv(override=True)

api_key = os.getenv("ANTHROPIC_API_KEY")
base_url = os.getenv("ANTHROPIC_BASE_URL")

print(f"API Key: {api_key[:20]}...")
print(f"Base URL: {base_url}\n")

# 测试请求体
request_body = {
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 100,
    "messages": [
        {"role": "user", "content": "你好"}
    ]
}

# 尝试不同的 Authorization 格式
headers_variations = [
    ("Direct API Key", {
        "Content-Type": "application/json",
        "Authorization": api_key,
        "anthropic-version": "2023-06-01"
    }),
    ("Bearer + API Key", {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "anthropic-version": "2023-06-01"
    }),
    ("X-Api-Key", {
        "Content-Type": "application/json",
        "X-Api-Key": api_key,
        "anthropic-version": "2023-06-01"
    }),
]

# 测试每种格式
for name, headers in headers_variations:
    print(f"\n尝试: {name}")
    print(f"Headers: {list(headers.keys())}")

    try:
        response = httpx.post(
            f"{base_url}/v1/messages",
            headers=headers,
            json=request_body,
            timeout=10.0
        )

        print(f"状态码: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print(f"✅ 成功! 响应: {result.get('content', [{}])[0].get('text', 'N/A')[:50]}")
            print("=" * 60)
            print(f"\n🎉 找到正确的认证方式: {name}")
            break
        else:
            print(f"❌ 失败: {response.text[:200]}")

    except Exception as e:
        print(f"❌ 错误: {str(e)[:200]}")

print("\n测试完成")

