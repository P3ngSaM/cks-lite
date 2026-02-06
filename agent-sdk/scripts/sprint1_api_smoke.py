"""
Sprint 01 API smoke checks for CKS Lite Agent SDK.

Usage:
  python agent-sdk/scripts/sprint1_api_smoke.py
  python agent-sdk/scripts/sprint1_api_smoke.py --base-url http://127.0.0.1:7860
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta
from urllib import parse, request, error


def http_get_json(base_url: str, path: str, params: dict | None = None) -> tuple[int, dict]:
    query = ""
    if params:
        query = "?" + parse.urlencode({k: v for k, v in params.items() if v is not None})
    url = f"{base_url}{path}{query}"
    req = request.Request(url, method="GET")
    with request.urlopen(req, timeout=15) as resp:
        body = resp.read().decode("utf-8", errors="ignore")
        return resp.status, json.loads(body)


def http_post_json(base_url: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
    url = f"{base_url}{path}"
    data = json.dumps(payload or {}).encode("utf-8")
    req = request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8", errors="ignore")
        return resp.status, json.loads(body)


def check(name: str, fn) -> bool:
    try:
        fn()
        print(f"[PASS] {name}")
        return True
    except Exception as e:
        print(f"[FAIL] {name}: {e}")
        return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:7860")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    checks = []

    def c_health():
        status, data = http_get_json(base_url, "/health")
        assert status == 200
        assert data.get("status") == "ok"

    checks.append(("health", c_health))

    def c_skills_readiness():
        status, data = http_get_json(base_url, "/skills/readiness")
        assert status == 200
        assert data.get("success") is True
        assert isinstance(data.get("readiness"), list)

    checks.append(("skills_readiness", c_skills_readiness))

    def c_audit_executions_filters():
        now = datetime.now()
        from_time = (now - timedelta(days=1)).isoformat(timespec="seconds")
        to_time = (now + timedelta(days=1)).isoformat(timespec="seconds")
        status, data = http_get_json(
            base_url,
            "/audit/executions",
            {
                "session_id": "demo-session",
                "tool_name": "web_search",
                "from_time": from_time,
                "to_time": to_time,
                "limit": 20,
            },
        )
        assert status == 200
        assert data.get("success") is True
        assert isinstance(data.get("records"), list)

    checks.append(("audit_executions_filters", c_audit_executions_filters))

    def c_audit_errors_filters():
        now = datetime.now()
        from_time = (now - timedelta(days=1)).isoformat(timespec="seconds")
        to_time = (now + timedelta(days=1)).isoformat(timespec="seconds")
        status, data = http_get_json(
            base_url,
            "/audit/errors",
            {
                "session_id": "demo-session",
                "tool_name": "mcp__openaiDeveloperDocs__search_docs",
                "from_time": from_time,
                "to_time": to_time,
                "limit": 20,
            },
        )
        assert status == 200
        assert data.get("success") is True
        assert isinstance(data.get("records"), list)

    checks.append(("audit_errors_filters", c_audit_errors_filters))

    def c_smoke_test_find_skills():
        status, data = http_post_json(base_url, "/skills/smoke-test?skill_name=find-skills")
        assert status == 200
        assert isinstance(data.get("results"), list)
        assert len(data["results"]) >= 1

    checks.append(("smoke_test_find_skills", c_smoke_test_find_skills))

    passed = 0
    for name, fn in checks:
        if check(name, fn):
            passed += 1

    total = len(checks)
    print(f"\nSummary: {passed}/{total} checks passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except error.URLError as e:
        print(f"[ERROR] Cannot connect to Agent SDK: {e}")
        raise SystemExit(2)
