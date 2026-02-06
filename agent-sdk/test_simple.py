import httpx
import time

print("Testing AI name recognition...")

# Test chat
response = httpx.post(
    "http://127.0.0.1:7860/chat",
    headers={"Content-Type": "application/json"},
    json={
        "user_id": "default-user",
        "message": "Hello, who are you?",
        "session_id": f"test-{int(time.time())}",
        "use_memory": True
    },
    timeout=30.0
)

print(f"\nStatus: {response.status_code}")

if response.status_code == 200:
    data = response.json()
    message = data.get("message", "")

    # Check for ALEX
    if "ALEX" in message or "Alex" in message:
        print("\nSUCCESS! AI is using the name ALEX")
        print(f"\nFirst 200 chars of response: {message[:200]}")
    else:
        print("\nAI did NOT use the name ALEX")
        print(f"\nFirst 200 chars of response: {message[:200]}")
