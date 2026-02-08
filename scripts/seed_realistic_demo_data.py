from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent-sdk"))

from core.goal_manager import GoalManager  # noqa: E402


DATA_BLUEPRINT = [
    {
        "kpi": "2026 Q1 交付效率提升",
        "okr": "缩短需求到上线周期",
        "projects": [
            {
                "title": "Agent 工作台核心链路",
                "tasks": [
                    {"title": "需求文档结构化整理", "assignee": "Ava Chen", "state": "accepted"},
                    {"title": "实现任务执行状态机", "assignee": "Leo Wang", "state": "done_pending"},
                    {"title": "修复记忆页中文乱码", "assignee": "Iris Zhou", "state": "accepted"},
                    {"title": "整理演示脚本并彩排", "assignee": "Noah Xu", "state": "todo"},
                ],
            },
            {
                "title": "老板看板体验升级",
                "tasks": [
                    {"title": "看板 KPI 卡片聚合", "assignee": "Leo Wang", "state": "accepted"},
                    {"title": "游戏风负责人视图", "assignee": "Iris Zhou", "state": "done_pending"},
                    {"title": "看板到工作台联动", "assignee": "Ava Chen", "state": "todo"},
                    {"title": "负责人任务透视与筛选", "assignee": "Noah Xu", "state": "rejected"},
                ],
            },
        ],
    },
    {
        "kpi": "2026 Q1 客户成功与稳定性",
        "okr": "提升演示通过率与发布稳定性",
        "projects": [
            {
                "title": "桌面发布与自检",
                "tasks": [
                    {"title": "Windows 打包冒烟测试", "assignee": "Ava Chen", "state": "accepted"},
                    {"title": "macOS 打包产物验证", "assignee": "Leo Wang", "state": "todo"},
                    {"title": "启动诊断信息面板", "assignee": "Iris Zhou", "state": "accepted"},
                ],
            },
            {
                "title": "技能生态接入",
                "tasks": [
                    {"title": "热门 skills 安装验证", "assignee": "Noah Xu", "state": "done_pending"},
                    {"title": "工具循环熔断验证", "assignee": "Leo Wang", "state": "accepted"},
                    {"title": "技能文档翻译入口", "assignee": "Iris Zhou", "state": "rejected_claimed"},
                ],
            },
        ],
    },
]


def apply_task_state(manager: GoalManager, task_id: int, state: str) -> None:
    if state == "todo":
        manager.update_execution_phase(
            task_id=task_id,
            phase="do",
            status="active",
            note="执行中，等待下一步指令",
            prompt="继续执行当前任务并反馈进展",
        )
        return

    manager.complete_task(task_id)
    if state == "done_pending":
        manager.update_execution_phase(
            task_id=task_id,
            phase="verify",
            status="active",
            note="已完成，等待管理者验收",
            prompt="请核对完成标准并准备验收材料",
        )
        manager.resume_execution(task_id, "演示数据自动恢复：等待验收")
        return

    if state == "accepted":
        manager.review_task(task_id, "accept", "演示数据：已通过验收", "manager")
        manager.update_execution_phase(
            task_id=task_id,
            phase="verify",
            status="done",
            note="验收通过",
            prompt="任务已完成，可进入下一阶段规划",
        )
        return

    if state == "rejected":
        manager.review_task(task_id, "reject", "演示数据：需要返工", "manager")
        manager.update_execution_phase(
            task_id=task_id,
            phase="do",
            status="blocked",
            note="验收驳回，等待返工",
            prompt="请输出返工计划并开始第一步修复",
        )
        manager.resume_execution(task_id, "演示数据自动恢复：返工中")
        return

    if state == "rejected_claimed":
        manager.review_task(task_id, "reject", "演示数据：需要返工", "manager")
        manager.claim_task_handoff(task_id, "manager", "演示数据：已转人工接手")
        manager.update_execution_phase(
            task_id=task_id,
            phase="do",
            status="active",
            note="转人工处理中",
            prompt="请基于驳回原因执行最小修复并同步进度",
        )
        manager.resume_execution(task_id, "演示数据自动恢复：人工接手处理中")


def seed_data(data_dir: Path, reset: bool) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "goals.db"
    if reset and db_path.exists():
        os.remove(db_path)

    manager = GoalManager(data_dir=data_dir)

    created_tasks = 0
    for kpi_block in DATA_BLUEPRINT:
        kpi_id = manager.create_kpi(kpi_block["kpi"], "演示数据自动生成")
        okr_id = manager.create_okr(kpi_id, kpi_block["okr"], "演示 OKR")
        for project in kpi_block["projects"]:
            project_id = manager.create_project(okr_id, project["title"], "演示项目")
            for task in project["tasks"]:
                task_id = manager.create_task(project_id, task["title"], "演示任务", task["assignee"])
                apply_task_state(manager, task_id, task["state"])
                created_tasks += 1

    dashboard = manager.get_dashboard_data()
    print("Seed complete.")
    print(f"Data dir: {data_dir}")
    print(f"Created tasks: {created_tasks}")
    print("Dashboard summary:")
    print(json.dumps(dashboard["summary"], ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed realistic demo data for goals dashboard and workbench flow.")
    parser.add_argument("--data-dir", default=str(ROOT / "data"), help="Data directory containing goals.db")
    parser.add_argument("--reset", action="store_true", help="Delete existing goals.db before seeding")
    parser.add_argument(
        "--all-targets",
        action="store_true",
        help="Seed both ./data and ./agent-sdk/data to cover different backend working directories",
    )
    args = parser.parse_args()
    if args.all_targets:
        targets = [ROOT / "data", ROOT / "agent-sdk" / "data"]
        for target in targets:
            print("=" * 60)
            seed_data(target, args.reset)
        return

    seed_data(Path(args.data_dir), args.reset)


if __name__ == "__main__":
    main()
