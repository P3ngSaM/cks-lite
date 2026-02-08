"""
Channel task queue.
Stores inbound channel messages (e.g., Feishu/Lark) and tracks dispatch status.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Dict, List, Optional


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ChannelTaskQueue:
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.data_dir / "channel_tasks.db"
        self._lock = RLock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS channel_tasks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        channel TEXT NOT NULL,
                        external_id TEXT NOT NULL DEFAULT '',
                        sender_id TEXT NOT NULL,
                        chat_id TEXT NOT NULL,
                        message TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'pending',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        metadata_json TEXT NOT NULL DEFAULT '{}',
                        result_json TEXT
                    )
                    """
                )
                columns = {
                    row["name"] for row in conn.execute("PRAGMA table_info(channel_tasks)").fetchall()
                }
                if "external_id" not in columns:
                    conn.execute(
                        "ALTER TABLE channel_tasks ADD COLUMN external_id TEXT NOT NULL DEFAULT ''"
                    )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_channel_tasks_channel_external
                    ON channel_tasks(channel, external_id)
                    """
                )
                conn.commit()
            finally:
                conn.close()

    @staticmethod
    def _decode_json(raw: Optional[str]) -> Dict[str, Any]:
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": int(row["id"]),
            "channel": row["channel"],
            "external_id": row["external_id"] if "external_id" in row.keys() else "",
            "sender_id": row["sender_id"],
            "chat_id": row["chat_id"],
            "message": row["message"],
            "status": row["status"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "metadata": self._decode_json(row["metadata_json"]),
            "result": self._decode_json(row["result_json"]),
        }

    def enqueue(
        self,
        channel: str,
        sender_id: str,
        chat_id: str,
        message: str,
        external_id: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        now = _now_iso()
        normalized_channel = (channel or "unknown").strip() or "unknown"
        normalized_external_id = (external_id or "").strip()
        if normalized_external_id:
            existing = self.get_by_external_id(
                channel=normalized_channel,
                external_id=normalized_external_id,
            )
            if existing:
                return existing
        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute(
                    """
                    INSERT INTO channel_tasks (
                        channel, external_id, sender_id, chat_id, message, status, created_at, updated_at, metadata_json
                    )
                    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
                    """,
                    (
                        normalized_channel,
                        normalized_external_id,
                        (sender_id or "unknown").strip() or "unknown",
                        (chat_id or "unknown").strip() or "unknown",
                        (message or "").strip(),
                        now,
                        now,
                        json.dumps(metadata or {}, ensure_ascii=False),
                    ),
                )
                task_id = int(cur.lastrowid)
                conn.commit()
            finally:
                conn.close()
        return self.get(task_id) or {"id": task_id, "status": "pending"}

    def get(self, task_id: int) -> Optional[Dict[str, Any]]:
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT * FROM channel_tasks WHERE id = ?",
                    (int(task_id),),
                ).fetchone()
            finally:
                conn.close()
        if not row:
            return None
        return self._row_to_dict(row)

    def list(self, status: Optional[str] = None, channel: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        safe_limit = max(1, min(int(limit or 50), 200))
        clauses = []
        args: List[Any] = []
        if status:
            clauses.append("status = ?")
            args.append(status)
        if channel:
            clauses.append("channel = ?")
            args.append(channel)

        sql = "SELECT * FROM channel_tasks"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY created_at DESC LIMIT ?"
        args.append(safe_limit)

        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(sql, args).fetchall()
            finally:
                conn.close()
        return [self._row_to_dict(row) for row in rows]

    def list_for_chat(
        self,
        channel: str,
        chat_id: str,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        safe_limit = max(1, min(int(limit or 50), 200))
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT * FROM channel_tasks
                    WHERE channel = ? AND chat_id = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (
                        (channel or "").strip(),
                        (chat_id or "").strip(),
                        safe_limit,
                    ),
                ).fetchall()
            finally:
                conn.close()
        return [self._row_to_dict(row) for row in rows]

    def mark_status(
        self,
        task_id: int,
        status: str,
        result: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        now = _now_iso()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    UPDATE channel_tasks
                    SET status = ?, updated_at = ?, result_json = ?
                    WHERE id = ?
                    """,
                    (
                        status,
                        now,
                        json.dumps(result or {}, ensure_ascii=False),
                        int(task_id),
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        task = self.get(task_id)
        if not task:
            raise KeyError(f"task not found: {task_id}")
        return task

    def get_by_external_id(self, channel: str, external_id: str) -> Optional[Dict[str, Any]]:
        normalized_channel = (channel or "").strip()
        normalized_external_id = (external_id or "").strip()
        if not normalized_channel or not normalized_external_id:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT * FROM channel_tasks
                    WHERE channel = ? AND external_id = ?
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (normalized_channel, normalized_external_id),
                ).fetchone()
            finally:
                conn.close()
        if not row:
            return None
        return self._row_to_dict(row)
