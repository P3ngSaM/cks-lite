"""
Goal management for KPI / OKR / Project / Task hierarchy.
"""

from __future__ import annotations

import sqlite3
import threading
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


class GoalManager:
    DEFAULT_ORGANIZATION_ID = "default-org"

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
                    organization_id TEXT NOT NULL DEFAULT 'default-org',
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
                    organization_id TEXT NOT NULL DEFAULT 'default-org',
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
                    organization_id TEXT NOT NULL DEFAULT 'default-org',
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
                    organization_id TEXT NOT NULL DEFAULT 'default-org',
                    project_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    assignee TEXT DEFAULT '',
                    department TEXT DEFAULT '',
                    status TEXT DEFAULT 'todo',
                    progress REAL DEFAULT 0,
                    review_status TEXT DEFAULT 'pending',
                    review_note TEXT DEFAULT '',
                    reviewed_by TEXT DEFAULT '',
                    reviewed_at TEXT DEFAULT '',
                    handoff_status TEXT DEFAULT 'none',
                    handoff_owner TEXT DEFAULT '',
                    handoff_note TEXT DEFAULT '',
                    handoff_at TEXT DEFAULT '',
                    handoff_resolved_at TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(id)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS task_execution_flows (
                    task_id INTEGER PRIMARY KEY,
                    phase TEXT DEFAULT 'plan',
                    status TEXT DEFAULT 'idle',
                    note TEXT DEFAULT '',
                    last_prompt TEXT DEFAULT '',
                    resumed_count INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(task_id) REFERENCES tasks(id)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS task_execution_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER NOT NULL,
                    phase TEXT DEFAULT 'plan',
                    status TEXT DEFAULT 'idle',
                    action TEXT DEFAULT '',
                    note TEXT DEFAULT '',
                    prompt TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(task_id) REFERENCES tasks(id)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS task_subagent_runs (
                    run_id TEXT PRIMARY KEY,
                    organization_id TEXT NOT NULL DEFAULT 'default-org',
                    task_id INTEGER NOT NULL,
                    assignee TEXT DEFAULT '',
                    supervisor_name TEXT DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'queued',
                    objective TEXT DEFAULT '',
                    node_id TEXT DEFAULT '',
                    parent_session_id TEXT DEFAULT '',
                    result_text TEXT DEFAULT '',
                    error_text TEXT DEFAULT '',
                    metadata_json TEXT DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    started_at TEXT DEFAULT '',
                    finished_at TEXT DEFAULT '',
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(task_id) REFERENCES tasks(id)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS task_subagent_run_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    stage TEXT DEFAULT 'execute',
                    message TEXT DEFAULT '',
                    payload_json TEXT DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(run_id) REFERENCES task_subagent_runs(run_id)
                )
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_task_subagent_runs_task
                ON task_subagent_runs(task_id, created_at DESC)
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_task_subagent_run_events_run
                ON task_subagent_run_events(run_id, id DESC)
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS assignee_next_tasks (
                    organization_id TEXT NOT NULL DEFAULT 'default-org',
                    assignee TEXT NOT NULL,
                    task_id INTEGER NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (organization_id, assignee),
                    FOREIGN KEY(task_id) REFERENCES tasks(id)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS ai_employees (
                    organization_id TEXT NOT NULL DEFAULT 'default-org',
                    name TEXT NOT NULL,
                    role TEXT DEFAULT '',
                    specialty TEXT DEFAULT '',
                    primary_skill TEXT DEFAULT '',
                    skill_stack TEXT DEFAULT '[]',
                    status TEXT DEFAULT 'active',
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (organization_id, name)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS ai_skill_presets (
                    organization_id TEXT NOT NULL DEFAULT 'default-org',
                    id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    primary_skill TEXT DEFAULT '',
                    skills TEXT DEFAULT '[]',
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (organization_id, id)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS task_agent_profiles (
                    task_id INTEGER PRIMARY KEY,
                    organization_id TEXT NOT NULL DEFAULT 'default-org',
                    assignee TEXT DEFAULT '',
                    role TEXT DEFAULT '',
                    specialty TEXT DEFAULT '',
                    preferred_skill TEXT DEFAULT '',
                    skill_stack TEXT DEFAULT '[]',
                    skill_strict INTEGER DEFAULT 0,
                    seed_prompt TEXT DEFAULT '',
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(task_id) REFERENCES tasks(id)
                )
                """
            )
            self._ensure_task_review_columns(cur)
            self._ensure_organization_columns(cur)
            self._migrate_assignee_next_tasks_table(cur)
            conn.commit()
            conn.close()

    @staticmethod
    def _ensure_task_review_columns(cur: sqlite3.Cursor):
        cur.execute("PRAGMA table_info(tasks)")
        columns = {row[1] for row in cur.fetchall()}
        if "review_status" not in columns:
            cur.execute("ALTER TABLE tasks ADD COLUMN review_status TEXT DEFAULT 'pending'")
        if "review_note" not in columns:
            cur.execute("ALTER TABLE tasks ADD COLUMN review_note TEXT DEFAULT ''")
        if "reviewed_by" not in columns:
            cur.execute("ALTER TABLE tasks ADD COLUMN reviewed_by TEXT DEFAULT ''")
        if "reviewed_at" not in columns:
            cur.execute("ALTER TABLE tasks ADD COLUMN reviewed_at TEXT DEFAULT ''")
        if "handoff_status" not in columns:
            cur.execute("ALTER TABLE tasks ADD COLUMN handoff_status TEXT DEFAULT 'none'")
        if "handoff_owner" not in columns:
            cur.execute("ALTER TABLE tasks ADD COLUMN handoff_owner TEXT DEFAULT ''")
        if "handoff_note" not in columns:
            cur.execute("ALTER TABLE tasks ADD COLUMN handoff_note TEXT DEFAULT ''")
        if "handoff_at" not in columns:
            cur.execute("ALTER TABLE tasks ADD COLUMN handoff_at TEXT DEFAULT ''")
        if "handoff_resolved_at" not in columns:
            cur.execute("ALTER TABLE tasks ADD COLUMN handoff_resolved_at TEXT DEFAULT ''")
        if "department" not in columns:
            cur.execute("ALTER TABLE tasks ADD COLUMN department TEXT DEFAULT ''")

    @classmethod
    def _ensure_organization_columns(cls, cur: sqlite3.Cursor):
        default_org = cls.DEFAULT_ORGANIZATION_ID
        for table in ("kpis", "okrs", "projects", "tasks"):
            cur.execute(f"PRAGMA table_info({table})")
            columns = {row[1] for row in cur.fetchall()}
            if "organization_id" not in columns:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN organization_id TEXT DEFAULT '{default_org}'")
            cur.execute(
                f"UPDATE {table} SET organization_id = ? WHERE organization_id IS NULL OR TRIM(organization_id) = ''",
                (default_org,),
            )

    @classmethod
    def _migrate_assignee_next_tasks_table(cls, cur: sqlite3.Cursor):
        """
        Legacy table used assignee as single PK and could not isolate by organization.
        Migrate it to (organization_id, assignee) composite PK.
        """
        cur.execute("PRAGMA table_info(assignee_next_tasks)")
        columns = cur.fetchall()
        if not columns:
            return
        names = [row[1] for row in columns]
        pk_columns = [row[1] for row in columns if int(row[5]) > 0]
        needs_migration = ("organization_id" not in names) or (pk_columns == ["assignee"])
        if not needs_migration:
            return

        cur.execute("ALTER TABLE assignee_next_tasks RENAME TO assignee_next_tasks_legacy")
        cur.execute(
            """
            CREATE TABLE assignee_next_tasks (
                organization_id TEXT NOT NULL DEFAULT 'default-org',
                assignee TEXT NOT NULL,
                task_id INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (organization_id, assignee),
                FOREIGN KEY(task_id) REFERENCES tasks(id)
            )
            """
        )
        if "organization_id" in names:
            cur.execute(
                """
                INSERT OR REPLACE INTO assignee_next_tasks(organization_id, assignee, task_id, updated_at)
                SELECT COALESCE(NULLIF(TRIM(organization_id), ''), ?), assignee, task_id, updated_at
                FROM assignee_next_tasks_legacy
                """,
                (cls.DEFAULT_ORGANIZATION_ID,),
            )
        else:
            cur.execute(
                """
                INSERT OR REPLACE INTO assignee_next_tasks(organization_id, assignee, task_id, updated_at)
                SELECT ?, assignee, task_id, updated_at
                FROM assignee_next_tasks_legacy
                """,
                (cls.DEFAULT_ORGANIZATION_ID,),
            )
        cur.execute("DROP TABLE assignee_next_tasks_legacy")

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
        dt = datetime.fromisoformat(text)
        # Normalize to naive UTC to avoid aware/naive comparison errors.
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt

    @classmethod
    def _normalize_organization_id(cls, organization_id: Optional[str]) -> str:
        value = (organization_id or "").strip()
        return value or cls.DEFAULT_ORGANIZATION_ID

    @staticmethod
    def _extract_department_hint(assignee: str) -> str:
        raw = (assignee or "").strip()
        if not raw:
            return "未分组"
        marker = raw.replace("：", ":")
        for sep in ("-", "_", "/", ":"):
            if sep in marker:
                head = marker.split(sep, 1)[0].strip()
                if head:
                    return head
        return "未分组"

    def create_kpi(self, title: str, description: str = "", organization_id: Optional[str] = None) -> int:
        now = self._now()
        normalized_org = self._normalize_organization_id(organization_id)
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO kpis(organization_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (normalized_org, title, description, now, now),
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
            cur.execute("SELECT organization_id FROM kpis WHERE id = ?", (kpi_id,))
            parent = cur.fetchone()
            normalized_org = self._normalize_organization_id(parent["organization_id"] if parent else None)
            cur.execute(
                "INSERT INTO okrs(organization_id, kpi_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (normalized_org, kpi_id, title, description, now, now),
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
            cur.execute("SELECT organization_id FROM okrs WHERE id = ?", (okr_id,))
            parent = cur.fetchone()
            normalized_org = self._normalize_organization_id(parent["organization_id"] if parent else None)
            cur.execute(
                "INSERT INTO projects(organization_id, okr_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (normalized_org, okr_id, title, description, now, now),
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
        department: str = "",
    ) -> int:
        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("SELECT organization_id FROM projects WHERE id = ?", (project_id,))
            parent = cur.fetchone()
            normalized_org = self._normalize_organization_id(parent["organization_id"] if parent else None)
            cur.execute(
                """
                INSERT INTO tasks(organization_id, project_id, title, description, assignee, department, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (normalized_org, project_id, title, description, assignee, department, now, now),
            )
            conn.commit()
            task_id = int(cur.lastrowid)
            conn.close()
            self._recompute_progress_chain_for_project(project_id)
            return task_id

    @staticmethod
    def _delete_task_with_cursor(cur: sqlite3.Cursor, task_id: int) -> Optional[int]:
        cur.execute("SELECT project_id FROM tasks WHERE id = ?", (task_id,))
        row = cur.fetchone()
        if not row:
            return None
        project_id = int(row["project_id"])
        cur.execute("DELETE FROM task_execution_events WHERE task_id = ?", (task_id,))
        cur.execute("DELETE FROM task_execution_flows WHERE task_id = ?", (task_id,))
        cur.execute("DELETE FROM assignee_next_tasks WHERE task_id = ?", (task_id,))
        cur.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        return project_id

    def delete_task(self, task_id: int) -> bool:
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            project_id = self._delete_task_with_cursor(cur, task_id)
            if project_id is None:
                conn.close()
                return False
            conn.commit()
            conn.close()
            self._recompute_progress_chain_for_project(project_id)
            return True

    def delete_project(self, project_id: int) -> bool:
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("SELECT okr_id FROM projects WHERE id = ?", (project_id,))
            row = cur.fetchone()
            if not row:
                conn.close()
                return False
            okr_id = int(row["okr_id"])
            cur.execute("SELECT id FROM tasks WHERE project_id = ?", (project_id,))
            task_ids = [int(r["id"]) for r in cur.fetchall()]
            for task_id in task_ids:
                self._delete_task_with_cursor(cur, task_id)
            cur.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            conn.commit()
            conn.close()
            self._recompute_progress_chain_for_okr(okr_id)
            return True

    def delete_okr(self, okr_id: int) -> bool:
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("SELECT kpi_id FROM okrs WHERE id = ?", (okr_id,))
            row = cur.fetchone()
            if not row:
                conn.close()
                return False
            kpi_id = int(row["kpi_id"])
            cur.execute("SELECT id FROM projects WHERE okr_id = ?", (okr_id,))
            project_ids = [int(r["id"]) for r in cur.fetchall()]
            for project_id in project_ids:
                cur.execute("SELECT id FROM tasks WHERE project_id = ?", (project_id,))
                task_ids = [int(r["id"]) for r in cur.fetchall()]
                for task_id in task_ids:
                    self._delete_task_with_cursor(cur, task_id)
                cur.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            cur.execute("DELETE FROM okrs WHERE id = ?", (okr_id,))
            conn.commit()
            conn.close()
            self._recompute_progress_chain_for_kpi(kpi_id)
            return True

    def delete_kpi(self, kpi_id: int) -> bool:
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("SELECT id FROM kpis WHERE id = ?", (kpi_id,))
            if not cur.fetchone():
                conn.close()
                return False
            cur.execute("SELECT id FROM okrs WHERE kpi_id = ?", (kpi_id,))
            okr_ids = [int(r["id"]) for r in cur.fetchall()]
            for okr_id in okr_ids:
                cur.execute("SELECT id FROM projects WHERE okr_id = ?", (okr_id,))
                project_ids = [int(r["id"]) for r in cur.fetchall()]
                for project_id in project_ids:
                    cur.execute("SELECT id FROM tasks WHERE project_id = ?", (project_id,))
                    task_ids = [int(r["id"]) for r in cur.fetchall()]
                    for task_id in task_ids:
                        self._delete_task_with_cursor(cur, task_id)
                    cur.execute("DELETE FROM projects WHERE id = ?", (project_id,))
                cur.execute("DELETE FROM okrs WHERE id = ?", (okr_id,))
            cur.execute("DELETE FROM kpis WHERE id = ?", (kpi_id,))
            conn.commit()
            conn.close()
            return True

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
                "UPDATE tasks SET status = 'done', progress = 100, review_status = 'pending', updated_at = ? WHERE id = ?",
                (now, task_id),
            )
            conn.commit()
            conn.close()

            self._recompute_progress_chain_for_project(project_id)
            return True

    def review_task(self, task_id: int, decision: str, reason: str = "", reviewed_by: str = "manager") -> bool:
        decision = (decision or "").strip().lower()
        if decision not in {"accept", "reject"}:
            return False

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

            if decision == "accept":
                cur.execute(
                    """
                    UPDATE tasks
                    SET status = 'done',
                        progress = 100,
                        review_status = 'accepted',
                        review_note = ?,
                        reviewed_by = ?,
                        reviewed_at = ?,
                        handoff_status = CASE WHEN handoff_status = 'none' THEN 'none' ELSE 'resolved' END,
                        handoff_resolved_at = CASE WHEN handoff_status = 'none' THEN handoff_resolved_at ELSE ? END,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (reason, reviewed_by, now, now, now, task_id),
                )
            else:
                cur.execute(
                    """
                    UPDATE tasks
                    SET status = 'todo',
                        progress = 0,
                        review_status = 'rejected',
                        review_note = ?,
                        reviewed_by = ?,
                        reviewed_at = ?,
                        handoff_status = 'pending',
                        handoff_owner = '',
                        handoff_note = '',
                        handoff_at = '',
                        handoff_resolved_at = '',
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (reason, reviewed_by, now, now, task_id),
                )
            conn.commit()
            conn.close()

            self._recompute_progress_chain_for_project(project_id)
            return True

    def claim_task_handoff(self, task_id: int, owner: str, note: str = "") -> bool:
        owner_text = (owner or "").strip()
        if not owner_text:
            return False
        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("SELECT project_id, review_status FROM tasks WHERE id = ?", (task_id,))
            row = cur.fetchone()
            if not row:
                conn.close()
                return False
            if (row["review_status"] or "").strip().lower() != "rejected":
                conn.close()
                return False

            cur.execute(
                """
                UPDATE tasks
                SET handoff_status = 'claimed',
                    handoff_owner = ?,
                    handoff_note = ?,
                    handoff_at = ?,
                    status = 'todo',
                    updated_at = ?
                WHERE id = ?
                """,
                (owner_text, note or "", now, now, task_id),
            )
            conn.commit()
            conn.close()
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

    def get_tree(self, organization_id: Optional[str] = None) -> Dict[str, Any]:
        normalized_org = self._normalize_organization_id(organization_id)
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("SELECT * FROM kpis WHERE organization_id = ? ORDER BY id DESC", (normalized_org,))
            kpis = self._rows_to_dicts(cur.fetchall())
            cur.execute("SELECT * FROM okrs WHERE organization_id = ? ORDER BY id DESC", (normalized_org,))
            okrs = self._rows_to_dicts(cur.fetchall())
            cur.execute("SELECT * FROM projects WHERE organization_id = ? ORDER BY id DESC", (normalized_org,))
            projects = self._rows_to_dicts(cur.fetchall())
            cur.execute("SELECT * FROM tasks WHERE organization_id = ? ORDER BY id DESC", (normalized_org,))
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
        organization_id: Optional[str] = None,
        task_id: Optional[int] = None,
        assignee: Optional[str] = None,
        department: Optional[str] = None,
        status: Optional[str] = None,
        review_status: Optional[str] = None,
        handoff_status: Optional[str] = None,
        handoff_owner: Optional[str] = None,
        from_time: Optional[str] = None,
        to_time: Optional[str] = None,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        normalized_org = self._normalize_organization_id(organization_id)
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
            if task_id is not None and int(row.get("id") or 0) != int(task_id):
                continue
            if (row.get("organization_id") or "").strip() != normalized_org:
                continue
            if assignee and (row.get("assignee") or "").strip().lower() != assignee.strip().lower():
                continue
            if department and (row.get("department") or "").strip().lower() != department.strip().lower():
                continue
            if status and row.get("status") != status:
                continue
            if review_status and (row.get("review_status") or "pending") != review_status:
                continue
            if handoff_status and (row.get("handoff_status") or "none") != handoff_status:
                continue
            if handoff_owner and (row.get("handoff_owner") or "").strip().lower() != handoff_owner.strip().lower():
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

    def get_dashboard_data(
        self,
        organization_id: Optional[str] = None,
        from_time: Optional[str] = None,
        to_time: Optional[str] = None,
        limit: int = 2000,
    ) -> Dict[str, Any]:
        rows = self.list_tasks(
            organization_id=organization_id,
            from_time=from_time,
            to_time=to_time,
            limit=max(1, min(limit, 10000)),
        )
        normalized_org = self._normalize_organization_id(organization_id)

        summary = {
            "total_tasks": len(rows),
            "pending_review": 0,
            "in_progress": 0,
            "accepted": 0,
            "rejected": 0,
        }

        owners: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            status = (row.get("status") or "").strip().lower()
            review_status = (row.get("review_status") or "pending").strip().lower()
            assignee = (row.get("assignee") or "").strip() or "未分配"

            if status == "done" and review_status == "pending":
                summary["pending_review"] += 1
            if status == "todo":
                summary["in_progress"] += 1
            if review_status == "accepted":
                summary["accepted"] += 1
            if review_status == "rejected":
                summary["rejected"] += 1

            owner = owners.setdefault(
                assignee,
                {
                    "assignee": assignee,
                    "department": "未分组",
                    "total_tasks": 0,
                    "in_progress": 0,
                    "pending_review": 0,
                    "accepted": 0,
                    "rejected": 0,
                    "avg_progress": 0.0,
                    "latest_updated_at": "",
                    "next_task_id": None,
                    "project_titles_set": set(),
                    "okr_titles_set": set(),
                    "kpi_titles_set": set(),
                    "departments_set": set(),
                },
            )
            owner["total_tasks"] += 1
            owner["avg_progress"] += float(row.get("progress") or 0.0)
            owner["project_titles_set"].add((row.get("project_title") or "").strip() or "未命名项目")
            owner["okr_titles_set"].add((row.get("okr_title") or "").strip() or "未命名OKR")
            owner["kpi_titles_set"].add((row.get("kpi_title") or "").strip() or "未命名KPI")
            department = (row.get("department") or "").strip() or self._extract_department_hint(assignee)
            owner["departments_set"].add(department)
            updated = row.get("updated_at") or ""
            if updated and (not owner["latest_updated_at"] or updated > owner["latest_updated_at"]):
                owner["latest_updated_at"] = updated
            if status == "todo":
                owner["in_progress"] += 1
            if status == "done" and review_status == "pending":
                owner["pending_review"] += 1
            if review_status == "accepted":
                owner["accepted"] += 1
            if review_status == "rejected":
                owner["rejected"] += 1

            task_id = int(row.get("id") or 0)
            current_next = owner["next_task_id"]
            if current_next is None:
                if status == "done" and review_status == "pending":
                    owner["next_task_id"] = task_id
                elif status == "todo":
                    owner["next_task_id"] = task_id
            else:
                # Prefer pending-review tasks first, then in-progress tasks.
                if status == "done" and review_status == "pending":
                    owner["next_task_id"] = task_id

        owner_rows: List[Dict[str, Any]] = []
        for owner in owners.values():
            total = max(1, int(owner["total_tasks"]))
            owner["avg_progress"] = round(float(owner["avg_progress"]) / total, 1)
            owner["completion_rate"] = round((float(owner["accepted"]) / total) * 100.0, 1)
            override_task_id = self.get_assignee_next_task(owner["assignee"], organization_id=normalized_org)
            if override_task_id:
                owner["next_task_id"] = override_task_id
            owner["project_titles"] = sorted(list(owner.pop("project_titles_set")))
            owner["okr_titles"] = sorted(list(owner.pop("okr_titles_set")))
            owner["kpi_titles"] = sorted(list(owner.pop("kpi_titles_set")))
            owner["departments"] = sorted(list(owner.pop("departments_set")))
            owner["department"] = owner["departments"][0] if owner["departments"] else "未分组"
            owner_rows.append(owner)

        owner_rows.sort(
            key=lambda item: (
                -int(item["pending_review"]),
                -int(item["in_progress"]),
                -int(item["total_tasks"]),
                str(item["assignee"]),
            )
        )

        return {
            "summary": summary,
            "owners": owner_rows,
            "total_owners": len(owner_rows),
            "total_tasks": len(rows),
        }

    def get_assignee_next_task(self, assignee: str, organization_id: Optional[str] = None) -> Optional[int]:
        normalized = (assignee or "").strip()
        if not normalized:
            return None
        normalized_org = self._normalize_organization_id(organization_id)

        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT t.id AS task_id
                FROM assignee_next_tasks n
                JOIN tasks t ON t.id = n.task_id
                WHERE LOWER(n.assignee) = LOWER(?)
                  AND LOWER(COALESCE(t.assignee, '')) = LOWER(?)
                  AND COALESCE(n.organization_id, ?) = ?
                LIMIT 1
                """,
                (normalized, normalized, normalized_org, normalized_org),
            )
            row = cur.fetchone()
            conn.close()
            if not row:
                return None
            return int(row["task_id"])

    def set_assignee_next_task(self, assignee: str, task_id: int, organization_id: Optional[str] = None) -> bool:
        normalized = (assignee or "").strip()
        if not normalized:
            return False

        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            normalized_org = self._normalize_organization_id(organization_id)
            cur.execute(
                "SELECT organization_id FROM tasks WHERE id = ? LIMIT 1",
                (task_id,),
            )
            task_row = cur.fetchone()
            if task_row:
                normalized_org = self._normalize_organization_id(task_row["organization_id"])
            cur.execute(
                """
                SELECT id FROM tasks
                WHERE id = ?
                  AND LOWER(COALESCE(assignee, '')) = LOWER(?)
                  AND COALESCE(organization_id, ?) = ?
                LIMIT 1
                """,
                (task_id, normalized, normalized_org, normalized_org),
            )
            row = cur.fetchone()
            if not row:
                conn.close()
                return False

            now = self._now()
            cur.execute(
                """
                INSERT OR REPLACE INTO assignee_next_tasks(organization_id, assignee, task_id, updated_at)
                VALUES(?, ?, ?, ?)
                """,
                (normalized_org, normalized, int(task_id), now),
            )
            conn.commit()
            conn.close()
            return True

    def run_supervisor_dispatch(
        self,
        organization_id: Optional[str] = None,
        objective: str = "",
        max_assignees: int = 8,
        prefer_pending_review: bool = True,
        supervisor_name: str = "Supervisor-Agent",
    ) -> Dict[str, Any]:
        normalized_org = self._normalize_organization_id(organization_id)
        capped_assignees = max(1, min(int(max_assignees or 1), 20))
        tasks = self.list_tasks(organization_id=normalized_org, limit=2000)
        if not tasks:
            return {
                "organization_id": normalized_org,
                "objective": objective.strip(),
                "dispatched": [],
                "total": 0,
            }

        def _task_priority(row: Dict[str, Any]) -> tuple:
            status = (row.get("status") or "").strip().lower()
            review = (row.get("review_status") or "pending").strip().lower()
            handoff = (row.get("handoff_status") or "none").strip().lower()
            if prefer_pending_review and status == "done" and review == "pending":
                return (0, row.get("updated_at") or "")
            if handoff == "claimed":
                return (1, row.get("updated_at") or "")
            if status == "todo" and review == "pending":
                return (2, row.get("updated_at") or "")
            if review == "rejected":
                return (3, row.get("updated_at") or "")
            return (4, row.get("updated_at") or "")

        by_assignee: Dict[str, List[Dict[str, Any]]] = {}
        for row in tasks:
            assignee = (row.get("assignee") or "").strip()
            if not assignee:
                continue
            by_assignee.setdefault(assignee, []).append(row)

        employee_status_map = {
            (item.get("name") or "").strip().lower(): (item.get("status") or "active").strip().lower()
            for item in self.list_ai_employees(normalized_org)
        }

        dispatched: List[Dict[str, Any]] = []
        skipped_paused = 0
        for assignee, assignee_tasks in sorted(by_assignee.items(), key=lambda x: x[0].lower()):
            if employee_status_map.get(assignee.strip().lower()) == "paused":
                skipped_paused += 1
                continue
            sorted_tasks = sorted(assignee_tasks, key=_task_priority)
            task = sorted_tasks[0] if sorted_tasks else None
            if not task:
                continue
            task_id = int(task.get("id") or 0)
            if task_id <= 0:
                continue
            if not self.set_assignee_next_task(assignee, task_id, organization_id=normalized_org):
                continue
            phase_note = f"{supervisor_name} dispatch"
            if objective.strip():
                phase_note = f"{phase_note}: {objective.strip()}"
            self.update_execution_phase(
                task_id=task_id,
                phase="plan",
                status="active",
                note=phase_note,
                prompt="Supervisor dispatch cycle",
            )
            dispatched.append(
                {
                    "assignee": assignee,
                    "task_id": task_id,
                    "task_title": task.get("title", ""),
                    "status": task.get("status", ""),
                    "review_status": task.get("review_status", "pending"),
                }
            )
            if len(dispatched) >= capped_assignees:
                break

        return {
            "organization_id": normalized_org,
            "objective": objective.strip(),
            "dispatched": dispatched,
            "total": len(dispatched),
            "skipped_paused": skipped_paused,
        }

    def run_supervisor_review(
        self,
        organization_id: Optional[str] = None,
        window_days: int = 7,
        supervisor_name: str = "Supervisor-Agent",
    ) -> Dict[str, Any]:
        normalized_org = self._normalize_organization_id(organization_id)
        days = max(1, min(int(window_days or 7), 90))
        cutoff_dt = datetime.utcnow().timestamp() - days * 86400

        def _recent(row: Dict[str, Any]) -> bool:
            updated = self._parse_iso(row.get("updated_at"))
            if not updated:
                return True
            return updated.timestamp() >= cutoff_dt

        tasks = [row for row in self.list_tasks(organization_id=normalized_org, limit=4000) if _recent(row)]
        assignee_stats: Dict[str, Dict[str, Any]] = {}
        for row in tasks:
            assignee = (row.get("assignee") or "").strip() or "unassigned"
            stat = assignee_stats.setdefault(
                assignee,
                {
                    "assignee": assignee,
                    "total": 0,
                    "accepted": 0,
                    "pending_review": 0,
                    "in_progress": 0,
                    "rejected": 0,
                    "score": 100,
                },
            )
            stat["total"] += 1
            review_status = (row.get("review_status") or "pending").strip().lower()
            status = (row.get("status") or "").strip().lower()
            if review_status == "accepted":
                stat["accepted"] += 1
            elif review_status == "rejected":
                stat["rejected"] += 1
            elif status == "done":
                stat["pending_review"] += 1
            elif status == "todo":
                stat["in_progress"] += 1

        items: List[Dict[str, Any]] = []
        for stat in assignee_stats.values():
            penalty = (
                stat["rejected"] * 20
                + stat["pending_review"] * 10
                + stat["in_progress"] * 4
            )
            if stat["total"] >= 3 and stat["accepted"] == 0:
                penalty += 12
            stat["score"] = max(0, min(100, 100 - penalty))
            items.append(stat)

        items.sort(key=lambda item: (item["score"], -item["rejected"], -item["pending_review"], item["assignee"].lower()))
        overall = int(round(sum(item["score"] for item in items) / len(items))) if items else 100
        return {
            "organization_id": normalized_org,
            "window_days": days,
            "supervisor_name": supervisor_name,
            "overall_score": overall,
            "items": items,
            "total_assignees": len(items),
        }

    def _task_exists(self, cur: sqlite3.Cursor, task_id: int) -> bool:
        cur.execute("SELECT 1 FROM tasks WHERE id = ?", (task_id,))
        return cur.fetchone() is not None

    def get_execution_state(self, task_id: int) -> Optional[Dict[str, Any]]:
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            if not self._task_exists(cur, task_id):
                conn.close()
                return None
            cur.execute("SELECT * FROM task_execution_flows WHERE task_id = ?", (task_id,))
            row = cur.fetchone()
            conn.close()
            if row:
                return dict(row)

        now = self._now()
        return {
            "task_id": task_id,
            "phase": "plan",
            "status": "idle",
            "note": "",
            "last_prompt": "",
            "resumed_count": 0,
            "created_at": now,
            "updated_at": now,
        }

    def list_execution_events(self, task_id: int, limit: int = 50) -> Optional[List[Dict[str, Any]]]:
        safe_limit = max(1, min(int(limit or 50), 200))
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            if not self._task_exists(cur, task_id):
                conn.close()
                return None
            cur.execute(
                """
                SELECT task_id, phase, status, action, note, prompt, created_at
                FROM task_execution_events
                WHERE task_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (task_id, safe_limit),
            )
            rows = [dict(row) for row in cur.fetchall()]
            conn.close()
            return rows

    def create_subagent_run(
        self,
        *,
        run_id: str,
        task_id: int,
        organization_id: Optional[str] = None,
        assignee: str = "",
        supervisor_name: str = "Supervisor-Agent",
        objective: str = "",
        node_id: str = "",
        parent_session_id: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        normalized_run_id = (run_id or "").strip()
        if not normalized_run_id:
            return None
        normalized_org = self._normalize_organization_id(organization_id)
        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                "SELECT assignee FROM tasks WHERE id = ? AND organization_id = ?",
                (task_id, normalized_org),
            )
            task_row = cur.fetchone()
            if not task_row:
                conn.close()
                return None
            effective_assignee = (assignee or "").strip() or (task_row["assignee"] or "").strip()
            cur.execute(
                """
                INSERT OR REPLACE INTO task_subagent_runs(
                    run_id, organization_id, task_id, assignee, supervisor_name,
                    status, objective, node_id, parent_session_id, metadata_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized_run_id,
                    normalized_org,
                    int(task_id),
                    effective_assignee,
                    (supervisor_name or "Supervisor-Agent").strip(),
                    (objective or "").strip(),
                    (node_id or "").strip(),
                    (parent_session_id or "").strip(),
                    json.dumps(metadata or {}, ensure_ascii=False),
                    now,
                    now,
                ),
            )
            cur.execute(
                """
                INSERT INTO task_subagent_run_events(run_id, stage, message, payload_json, created_at)
                VALUES (?, 'planning', ?, ?, ?)
                """,
                (
                    normalized_run_id,
                    "任务已入队，等待子Agent执行。",
                    json.dumps({"status": "queued"}, ensure_ascii=False),
                    now,
                ),
            )
            conn.commit()
            conn.close()
        return self.get_subagent_run(normalized_run_id)

    def append_subagent_run_event(
        self,
        run_id: str,
        stage: str,
        message: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> bool:
        normalized_run_id = (run_id or "").strip()
        if not normalized_run_id:
            return False
        stage_text = (stage or "execute").strip().lower()
        if stage_text not in {"planning", "clarify", "execute", "verify", "fallback", "deliver"}:
            stage_text = "execute"
        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("SELECT run_id FROM task_subagent_runs WHERE run_id = ?", (normalized_run_id,))
            if not cur.fetchone():
                conn.close()
                return False
            cur.execute(
                """
                INSERT INTO task_subagent_run_events(run_id, stage, message, payload_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    normalized_run_id,
                    stage_text,
                    (message or "").strip(),
                    json.dumps(payload or {}, ensure_ascii=False),
                    now,
                ),
            )
            cur.execute(
                "UPDATE task_subagent_runs SET updated_at = ? WHERE run_id = ?",
                (now, normalized_run_id),
            )
            conn.commit()
            conn.close()
        return True

    def set_subagent_run_status(
        self,
        run_id: str,
        status: str,
        result_text: str = "",
        error_text: str = "",
    ) -> Optional[Dict[str, Any]]:
        normalized_run_id = (run_id or "").strip()
        if not normalized_run_id:
            return None
        normalized_status = (status or "").strip().lower()
        if normalized_status not in {"queued", "running", "succeeded", "failed", "cancelled"}:
            return None
        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                "SELECT status, started_at, finished_at FROM task_subagent_runs WHERE run_id = ?",
                (normalized_run_id,),
            )
            row = cur.fetchone()
            if not row:
                conn.close()
                return None
            started_at = row["started_at"] or ""
            finished_at = row["finished_at"] or ""
            if normalized_status == "running" and not started_at:
                started_at = now
            if normalized_status in {"succeeded", "failed", "cancelled"}:
                finished_at = now
                if not started_at:
                    started_at = now
            cur.execute(
                """
                UPDATE task_subagent_runs
                SET status = ?, result_text = ?, error_text = ?, started_at = ?, finished_at = ?, updated_at = ?
                WHERE run_id = ?
                """,
                (
                    normalized_status,
                    (result_text or "").strip(),
                    (error_text or "").strip(),
                    started_at,
                    finished_at,
                    now,
                    normalized_run_id,
                ),
            )
            conn.commit()
            conn.close()
        return self.get_subagent_run(normalized_run_id)

    def get_subagent_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        normalized_run_id = (run_id or "").strip()
        if not normalized_run_id:
            return None
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT run_id, organization_id, task_id, assignee, supervisor_name, status, objective,
                       node_id, parent_session_id, result_text, error_text, metadata_json,
                       created_at, started_at, finished_at, updated_at
                FROM task_subagent_runs
                WHERE run_id = ?
                """,
                (normalized_run_id,),
            )
            row = cur.fetchone()
            conn.close()
        if not row:
            return None
        item = dict(row)
        try:
            metadata = json.loads(item.get("metadata_json") or "{}")
            if not isinstance(metadata, dict):
                metadata = {}
        except Exception:
            metadata = {}
        item["metadata"] = metadata
        item.pop("metadata_json", None)
        return item

    def list_subagent_runs(
        self,
        organization_id: Optional[str] = None,
        task_id: Optional[int] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        normalized_org = self._normalize_organization_id(organization_id)
        safe_limit = max(1, min(int(limit or 100), 500))
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            if task_id is not None:
                cur.execute(
                    """
                    SELECT run_id, organization_id, task_id, assignee, supervisor_name, status, objective,
                           node_id, parent_session_id, result_text, error_text, metadata_json,
                           created_at, started_at, finished_at, updated_at
                    FROM task_subagent_runs
                    WHERE organization_id = ? AND task_id = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (normalized_org, int(task_id), safe_limit),
                )
            else:
                cur.execute(
                    """
                    SELECT run_id, organization_id, task_id, assignee, supervisor_name, status, objective,
                           node_id, parent_session_id, result_text, error_text, metadata_json,
                           created_at, started_at, finished_at, updated_at
                    FROM task_subagent_runs
                    WHERE organization_id = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (normalized_org, safe_limit),
                )
            rows = [dict(r) for r in cur.fetchall()]
            conn.close()
        items: List[Dict[str, Any]] = []
        for row in rows:
            try:
                metadata = json.loads(row.get("metadata_json") or "{}")
                if not isinstance(metadata, dict):
                    metadata = {}
            except Exception:
                metadata = {}
            row["metadata"] = metadata
            row.pop("metadata_json", None)
            items.append(row)
        return items

    def list_subagent_run_events(self, run_id: str, limit: int = 120) -> Optional[List[Dict[str, Any]]]:
        normalized_run_id = (run_id or "").strip()
        if not normalized_run_id:
            return None
        safe_limit = max(1, min(int(limit or 120), 1000))
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("SELECT run_id FROM task_subagent_runs WHERE run_id = ?", (normalized_run_id,))
            if not cur.fetchone():
                conn.close()
                return None
            cur.execute(
                """
                SELECT id, run_id, stage, message, payload_json, created_at
                FROM task_subagent_run_events
                WHERE run_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (normalized_run_id, safe_limit),
            )
            rows = [dict(r) for r in cur.fetchall()]
            conn.close()
        rows.reverse()
        for row in rows:
            try:
                payload = json.loads(row.get("payload_json") or "{}")
                if not isinstance(payload, dict):
                    payload = {}
            except Exception:
                payload = {}
            row["payload"] = payload
            row.pop("payload_json", None)
        return rows

    def update_execution_phase(
        self,
        task_id: int,
        phase: str,
        status: str = "active",
        note: str = "",
        prompt: str = "",
    ) -> Optional[Dict[str, Any]]:
        phase = (phase or "").strip().lower()
        status = (status or "").strip().lower()
        if phase not in {"plan", "do", "verify"}:
            return None
        if status not in {"idle", "active", "blocked", "done"}:
            return None

        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            if not self._task_exists(cur, task_id):
                conn.close()
                return None

            cur.execute("SELECT resumed_count, created_at FROM task_execution_flows WHERE task_id = ?", (task_id,))
            existing = cur.fetchone()
            resumed_count = int(existing["resumed_count"]) if existing else 0
            created_at = existing["created_at"] if existing else now
            cur.execute(
                """
                INSERT OR REPLACE INTO task_execution_flows(
                    task_id, phase, status, note, last_prompt, resumed_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (task_id, phase, status, note, prompt, resumed_count, created_at, now),
            )
            cur.execute(
                """
                INSERT INTO task_execution_events(task_id, phase, status, action, note, prompt, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (task_id, phase, status, "phase_update", note, prompt, now),
            )

            # Keep task-level updated_at/progress aligned so dashboard reflects fresh execution.
            cur.execute("SELECT status, progress FROM tasks WHERE id = ?", (task_id,))
            task_row = cur.fetchone()
            task_status = (task_row["status"] if task_row else "todo") or "todo"
            task_progress = float(task_row["progress"] or 0.0) if task_row else 0.0

            if status == "done":
                # Execution finished: keep task as done and pending review unless reviewed later.
                cur.execute(
                    """
                    UPDATE tasks
                    SET status = 'done',
                        progress = 100,
                        review_status = CASE
                            WHEN COALESCE(TRIM(review_status), '') = '' THEN 'pending'
                            ELSE review_status
                        END,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (now, task_id),
                )
            else:
                # In-progress execution should still bump task freshness and progress.
                phase_floor = {"plan": 15.0, "do": 55.0, "verify": 85.0}.get(phase, 10.0)
                next_progress = min(99.0, max(task_progress, phase_floor))
                if task_status != "done":
                    cur.execute(
                        "UPDATE tasks SET status = 'todo', progress = ?, updated_at = ? WHERE id = ?",
                        (next_progress, now, task_id),
                    )
                else:
                    cur.execute("UPDATE tasks SET updated_at = ? WHERE id = ?", (now, task_id))

            conn.commit()
            cur.execute("SELECT * FROM task_execution_flows WHERE task_id = ?", (task_id,))
            saved = cur.fetchone()
            conn.close()
            return dict(saved) if saved else None

    def resume_execution(self, task_id: int, note: str = "") -> Optional[Dict[str, Any]]:
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            if not self._task_exists(cur, task_id):
                conn.close()
                return None
            cur.execute("SELECT title FROM tasks WHERE id = ?", (task_id,))
            task = cur.fetchone()
            task_title = (task["title"] if task else f"#{task_id}")
            cur.execute("SELECT * FROM task_execution_flows WHERE task_id = ?", (task_id,))
            state_row = cur.fetchone()
            now = self._now()
            if state_row:
                phase = state_row["phase"] or "plan"
                status = state_row["status"] or "active"
                resumed_count = int(state_row["resumed_count"] or 0) + 1
                merged_note = note or (state_row["note"] or "")
                created_at = state_row["created_at"] or now
            else:
                phase = "plan"
                status = "active"
                resumed_count = 1
                merged_note = note
                created_at = now

            resume_prompt = (
                f"继续任务 #{task_id}：{task_title}，当前阶段为 {phase}。"
                + (f" 恢复备注：{merged_note}。" if merged_note else "")
                + " 请给出下一步可执行动作。"
            )
            cur.execute(
                """
                INSERT OR REPLACE INTO task_execution_flows(
                    task_id, phase, status, note, last_prompt, resumed_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (task_id, phase, status, merged_note, resume_prompt, resumed_count, created_at, now),
            )
            cur.execute(
                """
                INSERT INTO task_execution_events(task_id, phase, status, action, note, prompt, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (task_id, phase, status, "resume", merged_note, resume_prompt, now),
            )
            conn.commit()
            cur.execute("SELECT * FROM task_execution_flows WHERE task_id = ?", (task_id,))
            saved = cur.fetchone()
            conn.close()
            if not saved:
                return None
            data = dict(saved)
            data["resume_prompt"] = resume_prompt
            return data

    def get_task_agent_profile(self, task_id: int, organization_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        normalized_org = self._normalize_organization_id(organization_id)
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT p.task_id, p.organization_id, p.assignee, p.role, p.specialty,
                       p.preferred_skill, p.skill_stack, p.skill_strict, p.seed_prompt, p.updated_at
                FROM task_agent_profiles p
                JOIN tasks t ON t.id = p.task_id
                WHERE p.task_id = ? AND p.organization_id = ? AND t.organization_id = ?
                """,
                (task_id, normalized_org, normalized_org),
            )
            row = cur.fetchone()
            conn.close()
            if not row:
                return None
            item = dict(row)
            try:
                stack = json.loads(item.get("skill_stack") or "[]")
                if not isinstance(stack, list):
                    stack = []
            except Exception:
                stack = []
            item["skill_stack"] = [str(v).strip() for v in stack if str(v).strip()]
            item["skill_strict"] = bool(int(item.get("skill_strict") or 0))
            return item

    def upsert_task_agent_profile(
        self,
        task_id: int,
        organization_id: Optional[str] = None,
        assignee: str = "",
        role: str = "",
        specialty: str = "",
        preferred_skill: str = "",
        skill_stack: Optional[List[str]] = None,
        skill_strict: bool = False,
        seed_prompt: str = "",
    ) -> bool:
        normalized_org = self._normalize_organization_id(organization_id)
        stack = [s.strip() for s in (skill_stack or []) if s and s.strip()]
        normalized_preferred = (preferred_skill or "").strip()
        if normalized_preferred and normalized_preferred not in stack:
            stack.insert(0, normalized_preferred)
        elif not normalized_preferred and stack:
            normalized_preferred = stack[0]
        normalized_assignee = (assignee or "").strip()
        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                "SELECT id, assignee FROM tasks WHERE id = ? AND organization_id = ?",
                (task_id, normalized_org),
            )
            task_row = cur.fetchone()
            if not task_row:
                conn.close()
                return False
            if not normalized_assignee:
                normalized_assignee = (task_row["assignee"] or "").strip()
            cur.execute(
                """
                INSERT OR REPLACE INTO task_agent_profiles(
                    task_id, organization_id, assignee, role, specialty, preferred_skill,
                    skill_stack, skill_strict, seed_prompt, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task_id,
                    normalized_org,
                    normalized_assignee,
                    (role or "").strip(),
                    (specialty or "").strip(),
                    normalized_preferred,
                    json.dumps(stack, ensure_ascii=False),
                    1 if skill_strict else 0,
                    (seed_prompt or "").strip(),
                    now,
                ),
            )
            conn.commit()
            conn.close()
            return True

    def list_ai_employees(self, organization_id: Optional[str] = None) -> List[Dict[str, Any]]:
        org = self._normalize_organization_id(organization_id)
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT organization_id, name, role, specialty, primary_skill, skill_stack, status, updated_at
                FROM ai_employees
                WHERE organization_id = ?
                ORDER BY updated_at DESC, name ASC
                """,
                (org,),
            )
            rows = []
            for row in cur.fetchall():
                item = dict(row)
                try:
                    stack = json.loads(item.get("skill_stack") or "[]")
                    if not isinstance(stack, list):
                        stack = []
                except Exception:
                    stack = []
                item["skill_stack"] = [str(v).strip() for v in stack if str(v).strip()]
                rows.append(item)
            conn.close()
            return rows

    def upsert_ai_employee(
        self,
        name: str,
        role: str = "",
        specialty: str = "",
        primary_skill: str = "",
        skill_stack: Optional[List[str]] = None,
        status: str = "active",
        organization_id: Optional[str] = None,
    ) -> bool:
        normalized_name = (name or "").strip()
        if not normalized_name:
            return False
        normalized_org = self._normalize_organization_id(organization_id)
        normalized_status = (status or "active").strip().lower()
        if normalized_status not in {"active", "paused"}:
            normalized_status = "active"
        stack = [s.strip() for s in (skill_stack or []) if s and s.strip()]
        normalized_primary = (primary_skill or "").strip() or (stack[0] if stack else "")
        if normalized_primary and normalized_primary not in stack:
            stack.insert(0, normalized_primary)
        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT OR REPLACE INTO ai_employees(
                    organization_id, name, role, specialty, primary_skill, skill_stack, status, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized_org,
                    normalized_name,
                    (role or "").strip(),
                    (specialty or "").strip(),
                    normalized_primary,
                    json.dumps(stack, ensure_ascii=False),
                    normalized_status,
                    now,
                ),
            )
            conn.commit()
            conn.close()
            return True

    def delete_ai_employee(self, name: str, organization_id: Optional[str] = None) -> bool:
        normalized_name = (name or "").strip()
        if not normalized_name:
            return False
        normalized_org = self._normalize_organization_id(organization_id)
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                "DELETE FROM ai_employees WHERE organization_id = ? AND name = ?",
                (normalized_org, normalized_name),
            )
            changed = cur.rowcount > 0
            conn.commit()
            conn.close()
            return changed

    def list_skill_presets(self, organization_id: Optional[str] = None) -> List[Dict[str, Any]]:
        org = self._normalize_organization_id(organization_id)
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT organization_id, id, name, primary_skill, skills, updated_at
                FROM ai_skill_presets
                WHERE organization_id = ?
                ORDER BY updated_at DESC, name ASC
                """,
                (org,),
            )
            rows = []
            for row in cur.fetchall():
                item = dict(row)
                try:
                    skills = json.loads(item.get("skills") or "[]")
                    if not isinstance(skills, list):
                        skills = []
                except Exception:
                    skills = []
                item["skills"] = [str(v).strip() for v in skills if str(v).strip()]
                rows.append(item)
            conn.close()
            return rows

    def upsert_skill_preset(
        self,
        preset_id: str,
        name: str,
        primary_skill: str,
        skills: Optional[List[str]] = None,
        organization_id: Optional[str] = None,
    ) -> bool:
        normalized_org = self._normalize_organization_id(organization_id)
        normalized_id = (preset_id or "").strip()
        normalized_name = (name or "").strip()
        stack = [s.strip() for s in (skills or []) if s and s.strip()]
        normalized_primary = (primary_skill or "").strip() or (stack[0] if stack else "")
        if not normalized_id or not normalized_name or not normalized_primary:
            return False
        if normalized_primary not in stack:
            stack.insert(0, normalized_primary)
        now = self._now()
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT OR REPLACE INTO ai_skill_presets(
                    organization_id, id, name, primary_skill, skills, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized_org,
                    normalized_id,
                    normalized_name,
                    normalized_primary,
                    json.dumps(stack, ensure_ascii=False),
                    now,
                ),
            )
            conn.commit()
            conn.close()
            return True

    def delete_skill_preset(self, preset_id: str, organization_id: Optional[str] = None) -> bool:
        normalized_id = (preset_id or "").strip()
        if not normalized_id:
            return False
        normalized_org = self._normalize_organization_id(organization_id)
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute(
                "DELETE FROM ai_skill_presets WHERE organization_id = ? AND id = ?",
                (normalized_org, normalized_id),
            )
            changed = cur.rowcount > 0
            conn.commit()
            conn.close()
            return changed

    def clear_organization_data(self, organization_id: Optional[str] = None) -> None:
        normalized_org = self._normalize_organization_id(organization_id)
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("DELETE FROM task_execution_events WHERE task_id IN (SELECT id FROM tasks WHERE organization_id = ?)", (normalized_org,))
            cur.execute("DELETE FROM task_execution_flows WHERE task_id IN (SELECT id FROM tasks WHERE organization_id = ?)", (normalized_org,))
            cur.execute("DELETE FROM task_subagent_run_events WHERE run_id IN (SELECT run_id FROM task_subagent_runs WHERE organization_id = ?)", (normalized_org,))
            cur.execute("DELETE FROM task_subagent_runs WHERE organization_id = ?", (normalized_org,))
            cur.execute("DELETE FROM task_agent_profiles WHERE organization_id = ?", (normalized_org,))
            cur.execute("DELETE FROM assignee_next_tasks WHERE organization_id = ?", (normalized_org,))
            cur.execute("DELETE FROM tasks WHERE organization_id = ?", (normalized_org,))
            cur.execute("DELETE FROM projects WHERE organization_id = ?", (normalized_org,))
            cur.execute("DELETE FROM okrs WHERE organization_id = ?", (normalized_org,))
            cur.execute("DELETE FROM kpis WHERE organization_id = ?", (normalized_org,))
            cur.execute("DELETE FROM ai_employees WHERE organization_id = ?", (normalized_org,))
            cur.execute("DELETE FROM ai_skill_presets WHERE organization_id = ?", (normalized_org,))
            conn.commit()
            conn.close()

    def bootstrap_one_person_company_demo(
        self,
        organization_id: Optional[str] = None,
        owner_name: str = "Sam",
        reset_existing: bool = False,
    ) -> Dict[str, Any]:
        normalized_org = self._normalize_organization_id(organization_id)
        boss = (owner_name or "Sam").strip() or "Sam"
        if reset_existing:
            self.clear_organization_data(normalized_org)

        employee_defs = [
            {
                "name": "Ava-产品经理",
                "role": "产品经理员工",
                "specialty": "需求拆解、排期、验收标准",
                "primary_skill": "find-skills",
                "skill_stack": ["find-skills", "internal-comms"],
                "status": "active",
            },
            {
                "name": "Noah-前端工程师",
                "role": "前端工程师员工",
                "specialty": "页面实现、交互优化、演示录屏",
                "primary_skill": "playwright",
                "skill_stack": ["playwright", "screenshot"],
                "status": "active",
            },
            {
                "name": "Liam-后端工程师",
                "role": "后端工程师员工",
                "specialty": "接口联调、稳定性、性能优化",
                "primary_skill": "openai-docs",
                "skill_stack": ["openai-docs", "security-best-practices"],
                "status": "active",
            },
            {
                "name": "Mia-运营专员",
                "role": "运营员工",
                "specialty": "内容发布、素材整理、客户沟通",
                "primary_skill": "internal-comms",
                "skill_stack": ["internal-comms", "spreadsheet"],
                "status": "active",
            },
            {
                "name": "Zoe-财务专员",
                "role": "财务员工",
                "specialty": "报销归档、现金流汇总、税务提醒",
                "primary_skill": "spreadsheet",
                "skill_stack": ["spreadsheet", "openai-docs"],
                "status": "active",
            },
        ]
        for employee in employee_defs:
            self.upsert_ai_employee(organization_id=normalized_org, **employee)

        preset_defs = [
            {
                "preset_id": "report-delivery",
                "name": "汇报交付组合",
                "primary_skill": "internal-comms",
                "skills": ["internal-comms", "find-skills", "spreadsheet"],
            },
            {
                "preset_id": "dev-shipping",
                "name": "研发交付组合",
                "primary_skill": "playwright",
                "skills": ["playwright", "openai-docs", "security-best-practices"],
            },
            {
                "preset_id": "ops-automation",
                "name": "运营自动化组合",
                "primary_skill": "internal-comms",
                "skills": ["internal-comms", "spreadsheet", "screenshot"],
            },
        ]
        for preset in preset_defs:
            self.upsert_skill_preset(organization_id=normalized_org, **preset)

        kpi_1 = self.create_kpi(
            "7天内完成老板演示版闭环",
            f"{boss} 负责终验收，AI 员工负责执行落地",
            organization_id=normalized_org,
        )
        okr_1 = self.create_okr(kpi_1, "工作台体验达到可演示水位", "聚焦速度、可见性、结果可验收")
        okr_2 = self.create_okr(kpi_1, "看板闭环可追踪", "任务下发、执行、回流一屏可见")

        p1 = self.create_project(okr_1, "工作台执行优化", "减少等待感并明确执行进度")
        p2 = self.create_project(okr_2, "老板看板闭环", "支持主管调度与验收回流")

        task_ids = [
            self.create_task(
                p1,
                "优化工作台首屏信息折叠",
                "默认收起大块说明，保留对话主区域高度",
                assignee="Noah-前端工程师",
                department="研发",
            ),
            self.create_task(
                p1,
                "修复飞书消息发送确认",
                "发送后必须有可见回执或错误提示",
                assignee="Liam-后端工程师",
                department="研发",
            ),
            self.create_task(
                p2,
                "整理老板看板周报文案",
                "产出老板视角周报模板与 30 秒口播稿",
                assignee="Mia-运营专员",
                department="运营",
            ),
            self.create_task(
                p2,
                "补齐税务提醒任务模板",
                "生成月度报税清单并写入看板",
                assignee="Zoe-财务专员",
                department="财务",
            ),
        ]

        # Seed some status distribution for dashboard realism.
        self.complete_task(task_ids[1])
        self.review_task(task_ids[1], "accept", "接口回执与日志已联通", boss)
        self.complete_task(task_ids[2])
        self.review_task(task_ids[2], "reject", "口播稿缺乏数据引用", boss)
        self.set_assignee_next_task("Noah-前端工程师", task_ids[0], organization_id=normalized_org)

        summary = self.get_dashboard_data(organization_id=normalized_org).get("summary", {})
        return {
            "organization_id": normalized_org,
            "owner_name": boss,
            "employees": len(employee_defs),
            "presets": len(preset_defs),
            "tasks_created": len(task_ids),
            "summary": summary,
        }
