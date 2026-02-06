"""
Audit logger for tool execution traces.
Writes JSONL records for execution and error streams.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict


SENSITIVE_KEYS = {
    "api_key",
    "apikey",
    "token",
    "access_token",
    "refresh_token",
    "password",
    "auth_code",
    "authorization",
    "secret",
}


def _mask_sensitive(value: Any) -> Any:
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            key_lower = str(k).lower()
            if key_lower in SENSITIVE_KEYS or any(s in key_lower for s in ("token", "secret", "password", "auth")):
                out[k] = "***"
            else:
                out[k] = _mask_sensitive(v)
        return out
    if isinstance(value, list):
        return [_mask_sensitive(v) for v in value]
    if isinstance(value, str) and len(value) > 2000:
        return value[:2000] + "...[truncated]"
    return value


class AuditLogger:
    def __init__(self, audit_dir: Path):
        self.audit_dir = audit_dir
        self.audit_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    def _append_jsonl(self, filename: str, payload: Dict[str, Any]) -> None:
        path = self.audit_dir / filename
        line = json.dumps(payload, ensure_ascii=False)
        with self._lock:
            with path.open("a", encoding="utf-8") as f:
                f.write(line + "\n")

    @staticmethod
    def _daily_filename(prefix: str) -> str:
        date_str = datetime.now().strftime("%Y%m%d")
        return f"{prefix}-{date_str}.jsonl"

    def log_execution(
        self,
        *,
        user_id: str,
        session_id: str,
        tool_name: str,
        tool_input: Dict[str, Any],
        success: bool,
        duration_ms: int,
        message: str = "",
    ) -> None:
        now = datetime.now().isoformat()
        masked_input = _mask_sensitive(tool_input or {})
        payload = {
            "ts": now,
            "timestamp": now,
            "user_id": user_id,
            "session_id": session_id,
            "tool": tool_name,
            "tool_name": tool_name,
            "input": masked_input,
            "tool_input": masked_input,
            "success": success,
            "duration_ms": duration_ms,
            "message": (message or "")[:1000],
        }
        self._append_jsonl(self._daily_filename("execution"), payload)

    def log_error(
        self,
        *,
        user_id: str,
        session_id: str,
        tool_name: str,
        tool_input: Dict[str, Any],
        error: str,
        duration_ms: int,
    ) -> None:
        now = datetime.now().isoformat()
        masked_input = _mask_sensitive(tool_input or {})
        payload = {
            "ts": now,
            "timestamp": now,
            "user_id": user_id,
            "session_id": session_id,
            "tool": tool_name,
            "tool_name": tool_name,
            "input": masked_input,
            "tool_input": masked_input,
            "error": (error or "")[:2000],
            "duration_ms": duration_ms,
        }
        self._append_jsonl(self._daily_filename("error"), payload)
