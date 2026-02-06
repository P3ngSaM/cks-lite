"""
测试 MiniMax API 连接
"""

import os
from dotenv import load_dotenv
from anthropic import Anthropic

# 加载环境变量
load_dotenv(override=True)

api_key = os.getenv("ANTHROPIC_API_KEY")
base_url = os.getenv("ANTHROPIC_BASE_URL")

print(f"API Key: {api_key[:20]}...")
print(f"Base URL: {base_url}")

# 创建客户端
client = Anthropic(
    api_key=api_key,
    base_url=base_url
)

# 测试简单对话
try:
    print("\n正在测试对话...")
    message = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=100,
        messages=[
            {"role": "user", "content": "你好，请简单回复"}
        ]
    )

    print("\n✅ API 调用成功!")
    print(f"Response: {message.content[0].text}")

except Exception as e:
    print(f"\n❌ API 调用失败: {e}")
    import traceback
    traceback.print_exc()
