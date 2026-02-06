# -*- coding: utf-8 -*-
"""
测试 MiniMax API
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv(override=True)

api_key = os.getenv("ANTHROPIC_API_KEY")
base_url = os.getenv("ANTHROPIC_BASE_URL")

print(f"Testing: {base_url}")

request_body = {
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello"}]
}

# Test 1: Direct API key in Authorization
print("\n[Test 1] Authorization: <api_key>")
try:
    response = httpx.post(
        f"{base_url}/v1/messages",
        headers={
            "Content-Type": "application/json",
            "Authorization": api_key,
            "anthropic-version": "2023-06-01"
        },
        json=request_body,
        timeout=10.0
    )
    print(f"Status: {response.status_code}")
    if response.status_code != 200:
        print(f"Error: {response.text}")
except Exception as e:
    print(f"Exception: {e}")

# Test 2: Bearer + API key
print("\n[Test 2] Authorization: Bearer <api_key>")
try:
    response = httpx.post(
        f"{base_url}/v1/messages",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "anthropic-version": "2023-06-01"
        },
        json=request_body,
        timeout=10.0
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        print("SUCCESS!")
        print(response.json())
    else:
        print(f"Error: {response.text}")
except Exception as e:
    print(f"Exception: {e}")
