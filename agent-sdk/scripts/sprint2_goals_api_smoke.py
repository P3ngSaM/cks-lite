"""
Sprint-02 goals API smoke test.

Usage:
    python agent-sdk/scripts/sprint2_goals_api_smoke.py --base-url http://127.0.0.1:7860
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict, Optional

import requests


def expect(condition: bool, ok_msg: str, fail_msg: str) -> bool:
    if condition:
        print(f"[PASS] {ok_msg}")
        return True
    print(f"[FAIL] {fail_msg}")
    return False


def post_json(base_url: str, path: str, payload: Optional[Dict[str, Any]] = None):
    return requests.post(f"{base_url}{path}", json=payload or {}, timeout=20)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:7860")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    all_ok = True

    kpi_resp = post_json(base_url, "/goals/kpi", {"title": "Sprint2 KPI Smoke"})
    all_ok &= expect(kpi_resp.ok, "创建 KPI 成功", f"创建 KPI 失败: {kpi_resp.text}")
    if not kpi_resp.ok:
        return 1
    kpi_id = kpi_resp.json().get("id")

    okr_resp = post_json(base_url, "/goals/okr", {"kpi_id": kpi_id, "title": "Sprint2 OKR Smoke"})
    all_ok &= expect(okr_resp.ok, "创建 OKR 成功", f"创建 OKR 失败: {okr_resp.text}")
    if not okr_resp.ok:
        return 1
    okr_id = okr_resp.json().get("id")

    project_resp = post_json(
        base_url,
        "/goals/project",
        {"okr_id": okr_id, "title": "Sprint2 Project Smoke"},
    )
    all_ok &= expect(project_resp.ok, "创建项目成功", f"创建项目失败: {project_resp.text}")
    if not project_resp.ok:
        return 1
    project_id = project_resp.json().get("id")

    task_resp = post_json(
        base_url,
        "/goals/task",
        {"project_id": project_id, "title": "Sprint2 Task Smoke", "assignee": "agent"},
    )
    all_ok &= expect(task_resp.ok, "创建任务成功", f"创建任务失败: {task_resp.text}")
    if not task_resp.ok:
        return 1
    task_id = task_resp.json().get("id")

    complete_resp = post_json(base_url, f"/goals/task/{task_id}/complete")
    all_ok &= expect(complete_resp.ok, "完成任务成功", f"完成任务失败: {complete_resp.text}")

    tree_resp = requests.get(f"{base_url}/goals/tree", timeout=20)
    all_ok &= expect(tree_resp.ok, "读取 goals 树成功", f"读取 goals 树失败: {tree_resp.text}")
    if tree_resp.ok:
        body = tree_resp.json()
        kpis = body.get("data", {}).get("kpis", [])
        target = None
        for kpi in kpis:
            if kpi.get("id") == kpi_id:
                target = kpi
                break
        all_ok &= expect(target is not None, "在树中找到 KPI", "未找到刚创建的 KPI")
        if target:
            all_ok &= expect(
                float(target.get("progress", 0.0)) >= 100.0,
                "KPI 进度已联动更新",
                f"KPI 进度未更新: {json.dumps(target, ensure_ascii=False)}",
            )

    print("RESULT:", "PASS" if all_ok else "FAIL")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
