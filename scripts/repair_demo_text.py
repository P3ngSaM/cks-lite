from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]


TEXT_TABLES: dict[str, tuple[str, ...]] = {
    "kpis": ("name", "description"),
    "okrs": ("title", "description"),
    "projects": ("title", "description"),
    "tasks": ("title", "description", "assignee", "review_comment"),
    "task_execution_flows": ("phase", "status", "note"),
    "task_execution_events": ("event_type", "phase", "note", "prompt"),
    "semantic_memories": ("content", "memory_type", "source"),
    "user_preferences": ("key", "value"),
}


def try_repair(value: str) -> str | None:
    if not value or not any("\u4e00" <= ch <= "\u9fff" for ch in value):
        return None
    try:
        repaired = value.encode("gbk").decode("utf-8")
    except UnicodeError:
        return None
    if repaired == value:
        return None
    if not any("\u4e00" <= ch <= "\u9fff" for ch in repaired):
        return None
    return repaired


def existing_tables(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    return {row[0] for row in rows}


def table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {row[1] for row in rows}


def repair_db(db_path: Path) -> int:
    if not db_path.exists():
        return 0
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    changed = 0
    try:
        tables = existing_tables(conn)
        for table, fields in TEXT_TABLES.items():
            if table not in tables:
                continue
            cols = table_columns(conn, table)
            fields = tuple(field for field in fields if field in cols)
            if not fields or "id" not in cols:
                continue
            select_fields = ", ".join(["id", *fields])
            rows = conn.execute(f"SELECT {select_fields} FROM {table}").fetchall()
            for row in rows:
                updates: dict[str, str] = {}
                for field in fields:
                    value = row[field]
                    if not isinstance(value, str):
                        continue
                    repaired = try_repair(value)
                    if repaired:
                        updates[field] = repaired
                if not updates:
                    continue
                assignments = ", ".join(f"{field} = ?" for field in updates.keys())
                params: Iterable[object] = [*updates.values(), row["id"]]
                conn.execute(f"UPDATE {table} SET {assignments} WHERE id = ?", tuple(params))
                changed += 1
        conn.commit()
        return changed
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Repair historical mojibake text in local SQLite demo databases.")
    parser.add_argument(
        "--targets",
        nargs="*",
        default=["data", "agent-sdk/data"],
        help="Relative directories that contain goals.db and/or memories.db",
    )
    args = parser.parse_args()

    total = 0
    for target in args.targets:
        base = ROOT / target
        for name in ("goals.db", "memories.db"):
            db_path = base / name
            changed = repair_db(db_path)
            total += changed
            print(f"{db_path}: repaired rows={changed}")
    print(f"Done. total repaired rows={total}")


if __name__ == "__main__":
    main()
