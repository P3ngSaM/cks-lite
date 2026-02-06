"""
Goal management for KPI / OKR / Project / Task hierarchy.
"""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


class GoalManager:
    def __init__(self, data_dir: Path):
        self.db_path = data_dir / "goals.db"
        self._lock = threading.RLock()
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS kpis (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    status TEXT DEFAULT 'active',
                    progress REAL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS okrs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kpi_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    status TEXT DEFAULT 'active',
                    progress REAL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(kpi_id) REFERENCES kpis(id)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    okr_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    status TEXT DEFAULT 'active',
                    progress REAL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(okr_id) REFERENCES okrs(id)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    assignee TEXT DEFAULT '',
                    status TEXT DEFAULT 'todo',
                    progress REAL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(id)
                )
                """
            )
            conn.commit()
            conn.close()

    @staticmethod
    def _now() -> str:
        return datetime.now().isoformat(timespec="seconds")

    @staticmethod
    def _rows_to_dicts(rows: List[sqlite3.Row]) -> List[Dict[str, Any]]:
        return [dict(r) for r in rows]

    @staticmethod
    def _parse_iso(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text)

    def create_kpi(self, title: str, description: str = "") -> int:
        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO kpis(title, description, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (title, description, now, now),
            )
            conn.commit()
            kpi_id = int(cur.lastrowid)
            conn.close()
            return kpi_id

    def create_okr(self, kpi_id: int, title: str, description: str = "") -> int:
        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO okrs(kpi_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (kpi_id, title, description, now, now),
            )
            conn.commit()
            okr_id = int(cur.lastrowid)
            conn.close()
            self._recompute_progress_chain_for_kpi(kpi_id)
            return okr_id

    def create_project(self, okr_id: int, title: str, description: str = "") -> int:
        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO projects(okr_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (okr_id, title, description, now, now),
            )
            conn.commit()
            project_id = int(cur.lastrowid)
            conn.close()
            self._recompute_progress_chain_for_okr(okr_id)
            return project_id

    def create_task(
        self,
        project_id: int,
        title: str,
        description: str = "",
        assignee: str = "",
    ) -> int:
        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO tasks(project_id, title, description, assignee, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (project_id, title, description, assignee, now, now),
            )
            conn.commit()
            task_id = int(cur.lastrowid)
            conn.close()
            self._recompute_progress_chain_for_project(project_id)
            return task_id

    def complete_task(self, task_id: int) -> bool:
        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("SELECT project_id FROM tasks WHERE id = ?", (task_id,))
            row = cur.fetchone()
            if not row:
                conn.close()
                return False

            project_id = int(row["project_id"])
            cur.execute(
                "UPDATE tasks SET status = 'done', progress = 100, updated_at = ? WHERE id = ?",
                (now, task_id),
            )
            conn.commit()
            conn.close()

            self._recompute_progress_chain_for_project(project_id)
            return True

    def _avg_progress(self, conn: sqlite3.Connection, table: str, key_name: str, key_val: int) -> float:
        cur = conn.cursor()
        cur.execute(f"SELECT AVG(progress) AS p FROM {table} WHERE {key_name} = ?", (key_val,))
        row = cur.fetchone()
        if not row or row["p"] is None:
            return 0.0
        return float(row["p"])

    def _recompute_progress_chain_for_project(self, project_id: int):
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            progress = self._avg_progress(conn, "tasks", "project_id", project_id)
            now = self._now()
            cur.execute("UPDATE projects SET progress = ?, updated_at = ? WHERE id = ?", (progress, now, project_id))

            cur.execute("SELECT okr_id FROM projects WHERE id = ?", (project_id,))
            row = cur.fetchone()
            conn.commit()
            conn.close()
            if row:
                self._recompute_progress_chain_for_okr(int(row["okr_id"]))

    def _recompute_progress_chain_for_okr(self, okr_id: int):
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            progress = self._avg_progress(conn, "projects", "okr_id", okr_id)
            now = self._now()
            cur.execute("UPDATE okrs SET progress = ?, updated_at = ? WHERE id = ?", (progress, now, okr_id))

            cur.execute("SELECT kpi_id FROM okrs WHERE id = ?", (okr_id,))
            row = cur.fetchone()
            conn.commit()
            conn.close()
            if row:
                self._recompute_progress_chain_for_kpi(int(row["kpi_id"]))

    def _recompute_progress_chain_for_kpi(self, kpi_id: int):
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            progress = self._avg_progress(conn, "okrs", "kpi_id", kpi_id)
            now = self._now()
            cur.execute("UPDATE kpis SET progress = ?, updated_at = ? WHERE id = ?", (progress, now, kpi_id))
            conn.commit()
            conn.close()

    def get_tree(self) -> Dict[str, Any]:
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("SELECT * FROM kpis ORDER BY id DESC")
            kpis = self._rows_to_dicts(cur.fetchall())
            cur.execute("SELECT * FROM okrs ORDER BY id DESC")
            okrs = self._rows_to_dicts(cur.fetchall())
            cur.execute("SELECT * FROM projects ORDER BY id DESC")
            projects = self._rows_to_dicts(cur.fetchall())
            cur.execute("SELECT * FROM tasks ORDER BY id DESC")
            tasks = self._rows_to_dicts(cur.fetchall())
            conn.close()

        okrs_by_kpi: Dict[int, List[Dict[str, Any]]] = {}
        projects_by_okr: Dict[int, List[Dict[str, Any]]] = {}
        tasks_by_project: Dict[int, List[Dict[str, Any]]] = {}

        for t in tasks:
            tasks_by_project.setdefault(int(t["project_id"]), []).append(t)
        for p in projects:
            p["tasks"] = tasks_by_project.get(int(p["id"]), [])
            projects_by_okr.setdefault(int(p["okr_id"]), []).append(p)
        for o in okrs:
            o["projects"] = projects_by_okr.get(int(o["id"]), [])
            okrs_by_kpi.setdefault(int(o["kpi_id"]), []).append(o)
        for k in kpis:
            k["okrs"] = okrs_by_kpi.get(int(k["id"]), [])

        return {"kpis": kpis, "total_kpis": len(kpis)}

    def list_tasks(
        self,
        assignee: Optional[str] = None,
        status: Optional[str] = None,
        from_time: Optional[str] = None,
        to_time: Optional[str] = None,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        from_dt = self._parse_iso(from_time)
        to_dt = self._parse_iso(to_time)

        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT
                    t.*,
                    p.title AS project_title,
                    o.title AS okr_title,
                    k.title AS kpi_title
                FROM tasks t
                JOIN projects p ON p.id = t.project_id
                JOIN okrs o ON o.id = p.okr_id
                JOIN kpis k ON k.id = o.kpi_id
                ORDER BY t.updated_at DESC
                """
            )
            rows = self._rows_to_dicts(cur.fetchall())
            conn.close()

        items: List[Dict[str, Any]] = []
        for row in rows:
            if assignee and (row.get("assignee") or "").strip().lower() != assignee.strip().lower():
                continue
            if status and row.get("status") != status:
                continue
            row_updated = self._parse_iso(row.get("updated_at"))
            if from_dt and row_updated and row_updated < from_dt:
                continue
            if to_dt and row_updated and row_updated > to_dt:
                continue
            items.append(row)
            if len(items) >= max(1, min(limit, 2000)):
                break

        return items
