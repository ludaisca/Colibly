import hashlib
import hmac
import unittest

from colibly import ColiblyError, verify_webhook_signature


class WebhookSignatureTest(unittest.TestCase):
    def test_valid_and_rotated(self):
        body = '{"type":"message.received"}'
        t = 1_700_000_000
        sig = hmac.new(b"whsec_x", f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
        self.assertTrue(verify_webhook_signature(body, f"t={t},v1=00,v1={sig}", "whsec_x", now=t + 5))
        self.assertFalse(verify_webhook_signature(body, f"t={t},v1={sig}", "whsec_x", now=t + 1000))
        self.assertFalse(verify_webhook_signature(body, f"t={t},v1={sig}", "otro", now=t))

    def test_error_fields(self):
        err = ColiblyError(502, {"code": "upstream_error", "message": "Meta: x", "meta": {"code": 131047}, "requestId": "req_1"})
        self.assertEqual(err.meta_code, 131047)
        self.assertEqual(err.request_id, "req_1")
        self.assertEqual(str(err), "Meta: x")


if __name__ == "__main__":
    unittest.main()
