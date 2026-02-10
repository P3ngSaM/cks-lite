"""
Node registry for desktop automation hosts.
Tracks connected execution nodes (Windows/macOS/Linux) and their capabilities.
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


class NodeRegistry:
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.data_dir / "nodes.db"
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
                    CREATE TABLE IF NOT EXISTS nodes (
                        node_id TEXT PRIMARY KEY,
                        organization_id TEXT NOT NULL DEFAULT 'default-org',
                        display_name TEXT NOT NULL DEFAULT '',
                        host TEXT NOT NULL DEFAULT '',
                        os TEXT NOT NULL DEFAULT '',
                        arch TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT 'online',
                        capabilities_json TEXT NOT NULL DEFAULT '[]',
                        metadata_json TEXT NOT NULL DEFAULT '{}',
                        last_seen_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_nodes_org_seen
                    ON nodes(organization_id, last_seen_at DESC)
                    """
                )
                conn.commit()
            finally:
                conn.close()

    @staticmethod
    def _parse_json_object(raw: Optional[str]) -> Dict[str, Any]:
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    @staticmethod
    def _parse_json_list(raw: Optional[str]) -> List[str]:
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            if not isinstance(parsed, list):
                return []
            return [str(item).strip() for item in parsed if str(item).strip()]
        except Exception:
            return []

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "node_id": row["node_id"],
            "organization_id": row["organization_id"],
            "display_name": row["display_name"],
            "host": row["host"],
            "os": row["os"],
            "arch": row["arch"],
            "status": row["status"],
            "capabilities": self._parse_json_list(row["capabilities_json"]),
            "metadata": self._parse_json_object(row["metadata_json"]),
            "last_seen_at": row["last_seen_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _normalize_org(organization_id: Optional[str]) -> str:
        value = (organization_id or "").strip()
        return value or "default-org"

    def register(
        self,
        node_id: str,
        organization_id: Optional[str] = None,
        display_name: str = "",
        host: str = "",
        os: str = "",
        arch: str = "",
        status: str = "online",
        capabilities: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        normalized_id = (node_id or "").strip()
        if not normalized_id:
            raise ValueError("node_id is required")
        normalized_org = self._normalize_org(organization_id)
        normalized_status = (status or "online").strip().lower()
        if normalized_status not in {"online", "busy", "offline"}:
            normalized_status = "online"
        clean_caps = [str(item).strip() for item in (capabilities or []) if str(item).strip()]
        now = _now_iso()
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO nodes(
                        node_id, organization_id, display_name, host, os, arch,
                        status, capabilities_json, metadata_json, last_seen_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        normalized_id,
                        normalized_org,
                        (display_name or "").strip(),
                        (host or "").strip(),
                        (os or "").strip(),
                        (arch or "").strip(),
                        normalized_status,
                        json.dumps(clean_caps, ensure_ascii=False),
                        json.dumps(metadata or {}, ensure_ascii=False),
                        now,
                        now,
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        node = self.get(normalized_id)
        if not node:
            raise RuntimeError("failed to persist node")
        return node

    def heartbeat(
        self,
        node_id: str,
        status: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        normalized_id = (node_id or "").strip()
        if not normalized_id:
            return None
        now = _now_iso()
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT status, metadata_json FROM nodes WHERE node_id = ?",
                    (normalized_id,),
                ).fetchone()
                if not row:
                    return None
                next_status = (status or row["status"] or "online").strip().lower()
                if next_status not in {"online", "busy", "offline"}:
                    next_status = "online"
                next_meta = self._parse_json_object(row["metadata_json"])
                if metadata:
                    next_meta.update(metadata)
                conn.execute(
                    """
                    UPDATE nodes
                    SET status = ?, metadata_json = ?, last_seen_at = ?, updated_at = ?
                    WHERE node_id = ?
                    """,
                    (
                        next_status,
                        json.dumps(next_meta, ensure_ascii=False),
                        now,
                        now,
                        normalized_id,
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        return self.get(normalized_id)

    def set_status(self, node_id: str, status: str) -> Optional[Dict[str, Any]]:
        return self.heartbeat(node_id=node_id, status=status)

    def get(self, node_id: str) -> Optional[Dict[str, Any]]:
        normalized_id = (node_id or "").strip()
        if not normalized_id:
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT * FROM nodes WHERE node_id = ?",
                    (normalized_id,),
                ).fetchone()
            finally:
                conn.close()
        if not row:
            return None
        return self._row_to_dict(row)

    def list(
        self,
        organization_id: Optional[str] = None,
        status: Optional[str] = None,
        capability: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        normalized_org = self._normalize_org(organization_id)
        safe_limit = max(1, min(int(limit or 100), 500))
        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT * FROM nodes
                    WHERE organization_id = ?
                    ORDER BY last_seen_at DESC
                    LIMIT ?
                    """,
                    (normalized_org, safe_limit),
                ).fetchall()
            finally:
                conn.close()
        items = [self._row_to_dict(row) for row in rows]
        if status:
            normalized_status = status.strip().lower()
            items = [item for item in items if item["status"] == normalized_status]
        if capability:
            token = capability.strip().lower()
            items = [
                item for item in items
                if any(cap.strip().lower() == token for cap in item.get("capabilities", []))
            ]
        return items

    def select_best_node(
        self,
        organization_id: Optional[str] = None,
        capability: Optional[str] = None,
        preferred_os: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        normalized_org = self._normalize_org(organization_id)
        capability_token = (capability or "").strip().lower()
        preferred_os_token = (preferred_os or "").strip().lower()
        nodes = self.list(organization_id=normalized_org, limit=500)
        if not nodes:
            return None

        def score(item: Dict[str, Any]) -> int:
            value = 0
            status = (item.get("status") or "").strip().lower()
            if status == "online":
                value += 100
            elif status == "busy":
                value += 40
            elif status == "offline":
                value -= 100
            if capability_token:
                caps = [str(v).strip().lower() for v in (item.get("capabilities") or []) if str(v).strip()]
                if capability_token in caps:
                    value += 30
                else:
                    value -= 20
            if preferred_os_token and (item.get("os") or "").strip().lower() == preferred_os_token:
                value += 10
            return value

        ranked = sorted(nodes, key=lambda item: (score(item), item.get("last_seen_at", "")), reverse=True)
        top = ranked[0] if ranked else None
        if not top:
            return None
        if capability_token:
            caps = [str(v).strip().lower() for v in (top.get("capabilities") or []) if str(v).strip()]
            if capability_token not in caps and (top.get("status") or "").strip().lower() == "offline":
                return None
        return top
