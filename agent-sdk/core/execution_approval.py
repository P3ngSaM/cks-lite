"""
Execution approval store.
Provides a lightweight approval queue for high-risk tool calls / channel-triggered actions.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Dict, List, Optional
from uuid import uuid4


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ApprovalRecord:
    id: str
    source: str
    organization_id: str
    tool_name: str
    risk_level: str
    status: str
    payload: Dict[str, Any]
    created_at: str
    updated_at: str
    expires_at: Optional[str]
    decided_by: Optional[str] = None
    decision_note: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "source": self.source,
            "organization_id": self.organization_id,
            "tool_name": self.tool_name,
            "risk_level": self.risk_level,
            "status": self.status,
            "payload": self.payload,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "expires_at": self.expires_at,
            "decided_by": self.decided_by,
            "decision_note": self.decision_note,
        }


class ExecutionApprovalStore:
    """SQLite-backed approval queue."""

    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.data_dir / "execution_approvals.db"
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
                    CREATE TABLE IF NOT EXISTS execution_approvals (
                        id TEXT PRIMARY KEY,
                        source TEXT NOT NULL,
                        organization_id TEXT NOT NULL DEFAULT 'default-org',
                        tool_name TEXT NOT NULL,
                        risk_level TEXT NOT NULL,
                        status TEXT NOT NULL,
                        payload_json TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        expires_at TEXT,
                        decided_by TEXT,
                        decision_note TEXT
                    )
                    """
                )
                columns = {
                    row[1]
                    for row in conn.execute("PRAGMA table_info(execution_approvals)").fetchall()
                }
                if "organization_id" not in columns:
                    conn.execute(
                        "ALTER TABLE execution_approvals ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'default-org'"
                    )
                conn.commit()
            finally:
                conn.close()

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> ApprovalRecord:
        payload: Dict[str, Any]
        try:
            payload = json.loads(row["payload_json"] or "{}")
        except Exception:
            payload = {}
        return ApprovalRecord(
            id=row["id"],
            source=row["source"],
            organization_id=row["organization_id"] if "organization_id" in row.keys() else "default-org",
            tool_name=row["tool_name"],
            risk_level=row["risk_level"],
            status=row["status"],
            payload=payload,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            expires_at=row["expires_at"],
            decided_by=row["decided_by"],
            decision_note=row["decision_note"],
        )

    def cleanup_expired(self) -> int:
        now = _utc_now()
        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute(
                    """
                    UPDATE execution_approvals
                    SET status = 'expired', updated_at = ?
                    WHERE status = 'pending'
                      AND expires_at IS NOT NULL
                      AND expires_at < ?
                    """,
                    (now, now),
                )
                conn.commit()
                return int(cur.rowcount or 0)
            finally:
                conn.close()

    def create_request(
        self,
        source: str,
        tool_name: str,
        payload: Optional[Dict[str, Any]] = None,
        risk_level: str = "medium",
        ttl_seconds: Optional[int] = 600,
        organization_id: str = "default-org",
    ) -> Dict[str, Any]:
        now = _utc_now()
        request_id = str(uuid4())
        expires_at = None
        if ttl_seconds and ttl_seconds > 0:
            expires_at = (datetime.now(timezone.utc) + timedelta(seconds=int(ttl_seconds))).isoformat()
        payload_json = json.dumps(payload or {}, ensure_ascii=False)

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT INTO execution_approvals (
                        id, source, tool_name, risk_level, status, payload_json,
                        created_at, updated_at, expires_at, organization_id
                    )
                    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
                    """,
                    (
                        request_id,
                        source.strip() or "unknown",
                        tool_name.strip() or "unknown",
                        risk_level.strip() or "medium",
                        payload_json,
                        now,
                        now,
                        expires_at,
                        (organization_id or "default-org").strip() or "default-org",
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get_request(request_id) or {"id": request_id, "status": "pending"}

    def get_request(self, request_id: str) -> Optional[Dict[str, Any]]:
        self.cleanup_expired()
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT * FROM execution_approvals WHERE id = ?",
                    (request_id,),
                ).fetchone()
            finally:
                conn.close()
        if not row:
            return None
        return self._row_to_record(row).to_dict()

    def list_requests(
        self,
        status: Optional[str] = None,
        limit: int = 50,
        organization_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        self.cleanup_expired()
        safe_limit = max(1, min(int(limit or 50), 200))
        org = (organization_id or "").strip()
        session = (session_id or "").strip()
        with self._lock:
            conn = self._connect()
            try:
                if status and org:
                    rows = conn.execute(
                        """
                        SELECT * FROM execution_approvals
                        WHERE status = ? AND organization_id = ?
                        ORDER BY created_at DESC
                        LIMIT ?
                        """,
                        (status, org, safe_limit),
                    ).fetchall()
                elif status:
                    rows = conn.execute(
                        """
                        SELECT * FROM execution_approvals
                        WHERE status = ?
                        ORDER BY created_at DESC
                        LIMIT ?
                        """,
                        (status, safe_limit),
                    ).fetchall()
                elif org:
                    rows = conn.execute(
                        """
                        SELECT * FROM execution_approvals
                        WHERE organization_id = ?
                        ORDER BY created_at DESC
                        LIMIT ?
                        """,
                        (org, safe_limit),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        """
                        SELECT * FROM execution_approvals
                        ORDER BY created_at DESC
                        LIMIT ?
                        """,
                        (safe_limit,),
                    ).fetchall()
            finally:
                conn.close()
        records = [self._row_to_record(row).to_dict() for row in rows]
        if session:
            records = [r for r in records if str((r.get("payload") or {}).get("session_id", "")).strip() == session]
        return records[:safe_limit]

    def decide_request(
        self,
        request_id: str,
        decision: str,
        decided_by: str = "system",
        note: str = "",
    ) -> Dict[str, Any]:
        normalized = (decision or "").strip().lower()
        if normalized not in {"approved", "denied"}:
            raise ValueError("decision must be 'approved' or 'denied'")

        now = _utc_now()
        with self._lock:
            conn = self._connect()
            try:
                cur = conn.execute(
                    """
                    UPDATE execution_approvals
                    SET status = ?, decided_by = ?, decision_note = ?, updated_at = ?
                    WHERE id = ? AND status = 'pending'
                    """,
                    (
                        normalized,
                        (decided_by or "system").strip() or "system",
                        note or "",
                        now,
                        request_id,
                    ),
                )
                conn.commit()
                changed = int(cur.rowcount or 0)
            finally:
                conn.close()
        record = self.get_request(request_id)
        if not record:
            raise KeyError(f"approval request not found: {request_id}")
        if changed == 0 and record.get("status") == "pending":
            raise RuntimeError("failed to apply decision")
        return record
