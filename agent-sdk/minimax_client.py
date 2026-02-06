"""
自定义 Anthropic 客户端，使用原始 API key for MiniMax
"""

from anthropic import Anthropic, AsyncAnthropic
from typing import Any, Dict, Optional

class MiniMaxAnthropic(Anthropic):
    """为 MiniMax API 定制的 Anthropic 客户端"""

    def __init__(self, api_key: str, base_url: str, **kwargs):
        super().__init__(api_key=api_key, base_url=base_url, **kwargs)
        # 强制使用原始 API key 作为 Bearer token
        self._api_key = api_key

    @property
    def auth_headers(self) -> Dict[str, str]:
        """Override auth headers to use raw API key"""
        return {
            "Authorization": f"Bearer {self._api_key}"
        }

class MiniMaxAsyncAnthropic(AsyncAnthropic):
    """异步版本"""

    def __init__(self, api_key: str, base_url: str, **kwargs):
        super().__init__(api_key=api_key, base_url=base_url, **kwargs)
        self._api_key = api_key

    @property
    def auth_headers(self) -> Dict[str, str]:
        """Override auth headers to use raw API key"""
        return {
            "Authorization": f"Bearer {self._api_key}"
        }

# 测试
if __name__ == "__main__":
    import os
    from dotenv import load_dotenv

    load_dotenv(override=True)

    client = MiniMaxAnthropic(
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        base_url=os.getenv("ANTHROPIC_BASE_URL")
    )

    print("Auth headers:", client.auth_headers)

    try:
        message = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=100,
            messages=[
                {"role": "user", "content": "Hello"}
            ]
        )
        print("\nSUCCESS!")
        print(f"Response: {message.content[0].text if hasattr(message.content[0], 'text') else 'N/A'}")
    except Exception as e:
        print(f"\nFAILED: {e}")
