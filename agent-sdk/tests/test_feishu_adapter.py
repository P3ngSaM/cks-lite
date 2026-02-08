import unittest
from pathlib import Path
import sys
import hashlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.feishu_adapter import FeishuAdapter


class FeishuAdapterTest(unittest.TestCase):
    def test_challenge_extract(self):
        payload = {"type": "url_verification", "challenge": "abc123"}
        self.assertEqual(FeishuAdapter.extract_challenge(payload), "abc123")

    def test_verify_event_with_payload_token(self):
        adapter = FeishuAdapter(
            app_id="",
            app_secret="",
            verification_token="verify-token",
        )
        ok = adapter.verify_event({"token": "verify-token"}, {})
        self.assertTrue(ok)
        bad = adapter.verify_event({"token": "bad"}, {})
        self.assertFalse(bad)

    def test_verify_event_with_encrypt_signature(self):
        encrypt_key = "enc-key"
        body = '{"event":"hello"}'
        ts = "1700000000"
        nonce = "nonce-x"
        signature = hashlib.sha256(f"{ts}{nonce}{encrypt_key}{body}".encode("utf-8")).hexdigest()
        adapter = FeishuAdapter(
            app_id="",
            app_secret="",
            verification_token="",
            encrypt_key=encrypt_key,
        )
        ok = adapter.verify_event(
            {},
            {
                "x-lark-request-timestamp": ts,
                "x-lark-request-nonce": nonce,
                "x-lark-signature": signature,
            },
            body,
        )
        self.assertTrue(ok)

    def test_verify_event_replay_nonce_rejected(self):
        encrypt_key = "enc-key"
        body = '{"event":"hello"}'
        ts = str(int(__import__("time").time()))
        nonce = "nonce-replay"
        signature = hashlib.sha256(f"{ts}{nonce}{encrypt_key}{body}".encode("utf-8")).hexdigest()
        adapter = FeishuAdapter(
            app_id="",
            app_secret="",
            verification_token="",
            encrypt_key=encrypt_key,
            timestamp_tolerance_sec=120,
        )
        ok1 = adapter.verify_event(
            {},
            {
                "x-lark-request-timestamp": ts,
                "x-lark-request-nonce": nonce,
                "x-lark-signature": signature,
            },
            body,
        )
        ok2 = adapter.verify_event(
            {},
            {
                "x-lark-request-timestamp": ts,
                "x-lark-request-nonce": nonce,
                "x-lark-signature": signature,
            },
            body,
        )
        self.assertTrue(ok1)
        self.assertFalse(ok2)


if __name__ == "__main__":
    unittest.main()
