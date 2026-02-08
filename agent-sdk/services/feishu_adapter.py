"""
Feishu/Lark channel adapter (MVP).
Provides token verification, challenge handling and outbound message sending.
"""

from __future__ import annotations

import json
import time
import hashlib
from collections import OrderedDict
from typing import Any, Dict, Optional

class FeishuAdapter:
    def __init__(
        self,
        app_id: str = "",
        app_secret: str = "",
        verification_token: str = "",
        encrypt_key: str = "",
        domain: str = "feishu",
        timestamp_tolerance_sec: int = 0,
        replay_cache_size: int = 2048,
    ):
        self.app_id = (app_id or "").strip()
        self.app_secret = (app_secret or "").strip()
        self.verification_token = (verification_token or "").strip()
        self.encrypt_key = (encrypt_key or "").strip()
        self.domain = (domain or "feishu").strip().lower()
        self.timestamp_tolerance_sec = max(0, int(timestamp_tolerance_sec or 0))
        self.replay_cache_size = max(32, int(replay_cache_size or 2048))
        if self.domain == "lark":
            self.base_url = "https://open.larksuite.com"
        else:
            self.base_url = "https://open.feishu.cn"

        self._token: Optional[str] = None
        self._token_expire_at: float = 0.0
        self._seen_event_ids: "OrderedDict[str, float]" = OrderedDict()
        self._seen_nonces: "OrderedDict[str, float]" = OrderedDict()

    def _remember(self, bucket: "OrderedDict[str, float]", key: str) -> None:
        if not key:
            return
        now = time.time()
        bucket[key] = now
        bucket.move_to_end(key, last=True)
        while len(bucket) > self.replay_cache_size:
            bucket.popitem(last=False)

    def _is_seen(self, bucket: "OrderedDict[str, float]", key: str) -> bool:
        if not key:
            return False
        return key in bucket

    @property
    def configured(self) -> bool:
        return bool(self.app_id and self.app_secret)

    def verify_event(
        self,
        payload: Dict[str, Any],
        headers: Optional[Dict[str, str]] = None,
        raw_body: str = "",
    ) -> bool:
        """MVP verification: token-based check (payload token / header token)."""
        headers = headers or {}

        if self.encrypt_key:
            ts = str(headers.get("x-lark-request-timestamp") or headers.get("X-Lark-Request-Timestamp") or "").strip()
            nonce = str(headers.get("x-lark-request-nonce") or headers.get("X-Lark-Request-Nonce") or "").strip()
            sig = str(headers.get("x-lark-signature") or headers.get("X-Lark-Signature") or "").strip().lower()
            if not ts or not nonce or not sig:
                return False
            if self.timestamp_tolerance_sec > 0:
                try:
                    ts_int = int(ts)
                    if abs(int(time.time()) - ts_int) > self.timestamp_tolerance_sec:
                        return False
                except Exception:
                    return False
            if self._is_seen(self._seen_nonces, nonce):
                return False
            expected = hashlib.sha256(f"{ts}{nonce}{self.encrypt_key}{raw_body}".encode("utf-8")).hexdigest()
            if sig != expected.lower():
                return False
            self._remember(self._seen_nonces, nonce)

        header_obj = payload.get("header") if isinstance(payload, dict) else {}
        event_id = ""
        if isinstance(header_obj, dict):
            event_id = str(header_obj.get("event_id") or "").strip()
        if event_id and self._is_seen(self._seen_event_ids, event_id):
            return False

        if not self.verification_token:
            if event_id:
                self._remember(self._seen_event_ids, event_id)
            return True
        payload_token = str(payload.get("token") or "").strip()
        header_token = str(headers.get("x-lark-request-token") or headers.get("X-Lark-Request-Token") or "").strip()
        ok = payload_token == self.verification_token or header_token == self.verification_token
        if ok and event_id:
            self._remember(self._seen_event_ids, event_id)
        return ok

    @staticmethod
    def extract_challenge(payload: Dict[str, Any]) -> Optional[str]:
        event_type = str(payload.get("type") or "").strip()
        challenge = payload.get("challenge")
        if event_type in {"url_verification", "challenge"} and challenge:
            return str(challenge)
        return None

    async def _get_tenant_access_token(self) -> str:
        import httpx

        now = time.time()
        if self._token and self._token_expire_at > now + 10:
            return self._token
        if not self.configured:
            raise RuntimeError("Feishu adapter is not configured")

        url = f"{self.base_url}/open-apis/auth/v3/tenant_access_token/internal"
        payload = {"app_id": self.app_id, "app_secret": self.app_secret}
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.post(url, json=payload)
            data = resp.json() if resp.content else {}
        if resp.status_code >= 400:
            raise RuntimeError(f"Feishu auth failed: HTTP {resp.status_code}")
        if int(data.get("code", -1)) != 0:
            raise RuntimeError(f"Feishu auth failed: {data.get('msg') or data.get('message') or data}")

        token = str(data.get("tenant_access_token") or "").strip()
        expire = int(data.get("expire", 7200))
        if not token:
            raise RuntimeError("Feishu auth failed: empty tenant_access_token")
        self._token = token
        self._token_expire_at = now + max(60, expire - 120)
        return token

    async def send_text(self, receive_id: str, text: str, receive_id_type: str = "open_id") -> Dict[str, Any]:
        import httpx

        token = await self._get_tenant_access_token()
        url = f"{self.base_url}/open-apis/im/v1/messages"
        params = {"receive_id_type": receive_id_type}
        payload = {
            "receive_id": receive_id,
            "msg_type": "text",
            "content": json.dumps({"text": text}, ensure_ascii=False),
        }
        headers = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, params=params, json=payload, headers=headers)
            data = resp.json() if resp.content else {}
        ok = resp.status_code < 400 and int(data.get("code", -1)) == 0
        return {
            "success": ok,
            "status_code": resp.status_code,
            "data": data,
            "error": None if ok else (data.get("msg") or data.get("message") or f"HTTP {resp.status_code}"),
        }

    async def send_interactive(self, receive_id: str, card: Dict[str, Any], receive_id_type: str = "open_id") -> Dict[str, Any]:
        import httpx

        token = await self._get_tenant_access_token()
        url = f"{self.base_url}/open-apis/im/v1/messages"
        params = {"receive_id_type": receive_id_type}
        payload = {
            "receive_id": receive_id,
            "msg_type": "interactive",
            "content": json.dumps(card, ensure_ascii=False),
        }
        headers = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, params=params, json=payload, headers=headers)
            data = resp.json() if resp.content else {}
        ok = resp.status_code < 400 and int(data.get("code", -1)) == 0
        return {
            "success": ok,
            "status_code": resp.status_code,
            "data": data,
            "error": None if ok else (data.get("msg") or data.get("message") or f"HTTP {resp.status_code}"),
        }
