from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent-sdk"))

from core.goal_manager import GoalManager  # noqa: E402


BLUEPRINT = {
    "acme-cn": {
        "kpi": "2026 Q1 Delivery Efficiency",
        "okr": "Reduce request-to-release cycle",
        "projects": [
            ("Workbench Core", [("Task pipeline hardening", "Ava Chen", "研发"), ("Skill routing polish", "Leo Wang", "研发")]),
            ("Board Visual Upgrade", [("Pixel dashboard UX", "Iris Zhou", "产品"), ("Manager workflow demo", "Noah Xu", "管理")]),
        ],
    },
    "acme-global": {
        "kpi": "2026 Q1 Product Reliability",
        "okr": "Improve release stability",
        "projects": [
            ("Desktop Packaging", [("Windows smoke test", "Mia Patel", "QA"), ("macOS notarization check", "Owen Brooks", "QA")]),
            ("Org Ops", [("Org-level KPI dashboard", "Ethan Cole", "运营"), ("Cross-team handoff flow", "Luna Park", "运营")]),
        ],
    },
    "acme-labs": {
        "kpi": "2026 Q1 Innovation Throughput",
        "okr": "Increase validated experiments",
        "projects": [
            ("Skill Playground", [("Community skill intake", "Ruby Kim", "创新"), ("Skill sandbox runner", "Kai Morgan", "创新")]),
            ("Agent Automation", [("Local file automation demo", "Nora Diaz", "研发"), ("Browser automation demo", "Liam Reed", "研发")]),
        ],
    },
}


def seed(data_dir: Path, reset: bool) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "goals.db"
    if reset and db_path.exists():
        os.remove(db_path)

    manager = GoalManager(data_dir=data_dir)
    created = 0
    for org_id, org in BLUEPRINT.items():
        kpi_id = manager.create_kpi(org["kpi"], "Seeded multi-org demo data", organization_id=org_id)
        okr_id = manager.create_okr(kpi_id, org["okr"], "Seeded OKR")
        for project_title, tasks in org["projects"]:
            project_id = manager.create_project(okr_id, project_title, "Seeded project")
            for title, assignee, department in tasks:
                task_id = manager.create_task(project_id, title, "Seeded task", assignee, department=department)
                # Make state distribution visible in dashboard.
                if created % 3 == 0:
                    manager.complete_task(task_id)
                    manager.review_task(task_id, "accept", "seeded accepted", "manager")
                elif created % 3 == 1:
                    manager.complete_task(task_id)  # pending review
                else:
                    manager.review_task(task_id, "reject", "seeded rework", "manager")
                created += 1

    report = {}
    for org_id in BLUEPRINT:
        report[org_id] = manager.get_dashboard_data(organization_id=org_id)["summary"]
    print("Seed complete.")
    print(f"Data dir: {data_dir}")
    print(json.dumps(report, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed multi-organization demo data for goals dashboard.")
    parser.add_argument("--data-dir", default=str(ROOT / "data"), help="Data directory containing goals.db")
    parser.add_argument("--reset", action="store_true", help="Delete existing goals.db before seeding")
    parser.add_argument(
        "--all-targets",
        action="store_true",
        help="Seed both ./data and ./agent-sdk/data to cover different backend working directories",
    )
    args = parser.parse_args()

    if args.all_targets:
        for target in [ROOT / "data", ROOT / "agent-sdk" / "data"]:
            print("=" * 60)
            seed(target, args.reset)
        return

    seed(Path(args.data_dir), args.reset)


if __name__ == "__main__":
    main()
