"""
Sprint-01 acceptance for: "审批拒绝后，任务可继续并给出友好反馈".

Flow:
1) Call /chat/stream with a desktop-tool-likely prompt.
2) When receiving desktop_tool_request, immediately POST denied result to /tools/desktop-result.
3) Continue reading stream and assert final response includes friendly denial feedback.
"""

from __future__ import annotations

import argparse
import json
from urllib import request


def post_json(url: str, payload: dict) -> dict:
    req = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8", errors="ignore"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:7860")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    stream_payload = {
        "user_id": "sprint1-permission",
        "session_id": "sprint1-permission-session",
        "use_memory": False,
        "message": "请读取 C:\\\\Windows\\\\System32\\\\drivers\\\\etc\\\\hosts 文件内容。",
    }

    req = request.Request(
        f"{base_url}/chat/stream",
        data=json.dumps(stream_payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    saw_desktop_request = False
    posted_denial = False
    saw_done = False
    final_text = []

    with request.urlopen(req, timeout=180) as resp:
        for raw_line in resp:
            line = raw_line.decode("utf-8", errors="ignore").strip()
            if not line.startswith("data: "):
                continue
            payload = line[6:].strip()
            if not payload:
                continue

            try:
                chunk = json.loads(payload)
            except Exception:
                continue

            ctype = chunk.get("type")
            if ctype == "text" and chunk.get("content"):
                final_text.append(chunk["content"])

            if ctype == "desktop_tool_request" and not posted_denial:
                saw_desktop_request = True
                request_id = chunk.get("request_id")
                if request_id:
                    result = {
                        "success": False,
                        "content": "",
                        "error": "用户拒绝了此次操作（自动验收脚本）",
                    }
                    ack = post_json(f"{base_url}/tools/desktop-result?request_id={request_id}", result)
                    posted_denial = bool(ack.get("success"))

            if ctype == "done":
                saw_done = True
                break

    combined = "".join(final_text)
    has_friendly_feedback = ("拒绝" in combined) or ("无法" in combined) or ("不能" in combined)

    print("saw_desktop_request =", saw_desktop_request)
    print("posted_denial =", posted_denial)
    print("saw_done =", saw_done)
    print("friendly_feedback =", has_friendly_feedback)
    print("response_preview =", combined[:200].replace("\n", " "))

    if saw_desktop_request and posted_denial and saw_done and has_friendly_feedback:
        print("[PASS] 审批拒绝后，任务继续并给出友好反馈")
        return 0

    print("[FAIL] 审批拒绝验收未通过")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
