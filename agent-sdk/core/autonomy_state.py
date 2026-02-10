"""
Autonomy execution event store.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AutonomyStateStore:
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.data_dir / "autonomy.db"
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        conn = self._get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS autonomy_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                organization_id TEXT,
                user_id TEXT,
                session_id TEXT NOT NULL,
                goal_task_id INTEGER,
                stage TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_autonomy_session ON autonomy_events(session_id, created_at DESC)"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_autonomy_goal_task ON autonomy_events(goal_task_id, created_at DESC)"
        )
        conn.commit()
        conn.close()

    def append_event(
        self,
        *,
        session_id: str,
        stage: str,
        message: str,
        user_id: Optional[str] = None,
        organization_id: Optional[str] = None,
        goal_task_id: Optional[int] = None,
        metadata: Optional[str] = None,
    ) -> int:
        conn = self._get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO autonomy_events
                (organization_id, user_id, session_id, goal_task_id, stage, message, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                organization_id,
                user_id,
                session_id,
                goal_task_id,
                stage,
                message,
                metadata,
                _utc_now_iso(),
            ),
        )
        event_id = int(cur.lastrowid)
        conn.commit()
        conn.close()
        return event_id

    def list_events(
        self,
        *,
        session_id: Optional[str] = None,
        goal_task_id: Optional[int] = None,
        stage: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict]:
        safe_limit = max(1, min(int(limit), 1000))
        where = []
        params: List[object] = []
        if session_id:
            where.append("session_id = ?")
            params.append(session_id)
        if goal_task_id is not None:
            where.append("goal_task_id = ?")
            params.append(int(goal_task_id))
        if stage:
            where.append("stage = ?")
            params.append(stage.strip())
        where_sql = f"WHERE {' AND '.join(where)}" if where else ""
        conn = self._get_conn()
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT id, organization_id, user_id, session_id, goal_task_id, stage, message, metadata, created_at
            FROM autonomy_events
            {where_sql}
            ORDER BY id DESC
            LIMIT ?
            """,
            (*params, safe_limit),
        )
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        rows.reverse()
        return rows
