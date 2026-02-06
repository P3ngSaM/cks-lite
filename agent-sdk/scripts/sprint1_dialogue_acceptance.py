"""
Sprint-01 dialogue acceptance helper.

Runs three standard skill-trigger prompts against /chat and prints results.
This helps verify checklist items C1 quickly in one place.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from urllib import request


PROMPTS = [
    "请使用 /find-skills，找 5 个写作相关技能",
    "请使用 openai-docs skill，总结 Responses API 和 Chat Completions 的区别",
    "请使用 spreadsheet skill，给季度销售分析表模板",
]

EXPECTED_KEYWORDS = [
    ["find-skills", "find_skills", "skills"],
    ["openai-docs", "openaiDeveloperDocs", "Responses API", "Chat Completions"],
    ["spreadsheet", "销售分析表", "模板"],
]


def post_chat(base_url: str, message: str) -> dict:
    url = f"{base_url.rstrip('/')}/chat"
    payload = {
        "user_id": "sprint1-acceptance",
        "session_id": "sprint1-acceptance-session",
        "message": message,
        "use_memory": False,
    }
    req = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8", errors="ignore"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:7860")
    args = parser.parse_args()

    print("Sprint-01 对话验收开始")
    print("=" * 40)
    report_rows = []
    passed = 0
    for i, prompt in enumerate(PROMPTS, 1):
        print(f"[{i}] Prompt: {prompt}")
        row = {"index": i, "prompt": prompt, "ok": False, "error": None}
        try:
            data = post_chat(args.base_url, prompt)
            msg = (data.get("message") or "").strip()
            tool_calls = data.get("tool_calls") or []
            xml_tool_calls = len(re.findall(r"<(?:minimax:)?tool_call>", msg))
            hit = any(k in msg for k in EXPECTED_KEYWORDS[i - 1])
            row.update(
                {
                    "ok": bool(hit and (xml_tool_calls > 0 or len(tool_calls) > 0 or len(msg) > 80)),
                    "response_length": len(msg),
                    "tool_calls_count": len(tool_calls),
                    "xml_tool_calls_count": xml_tool_calls,
                    "preview": msg[:200],
                }
            )
            if row["ok"]:
                passed += 1
            print(f"    响应长度: {len(msg)}")
            print(f"    工具调用数: {len(tool_calls)}")
            print(f"    XML工具调用标记: {xml_tool_calls}")
            print(f"    片段: {msg[:160].replace(chr(10), ' ')}")
        except Exception as e:
            row["error"] = str(e)
            print(f"    失败: {e}")
        report_rows.append(row)
    print("=" * 40)
    print("提示：若需验证“审批拒绝后任务继续并友好反馈”，请在桌面端手动拒绝一次权限弹窗。")

    report = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "base_url": args.base_url,
        "passed": passed,
        "total": len(PROMPTS),
        "results": report_rows,
    }
    report_path = f"data/sprint1_dialogue_acceptance_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"结果报告已写入: {report_path}")
    return 0 if passed == len(PROMPTS) else 1


if __name__ == "__main__":
    raise SystemExit(main())
