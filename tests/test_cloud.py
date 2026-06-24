import io
import unittest
import urllib.error
from contextlib import redirect_stdout
from email.message import Message
from unittest.mock import patch

from mihome_feeder.cloud import (
    MiHomeAuthenticationError,
    MiHomeRequestError,
    post_json,
    redact_data,
)
from tests._helpers import sample_config


class FakeResponse:
    def __init__(self, body: bytes):
        self.body = body
        self.headers = Message()
        self.headers["Content-Type"] = "application/json"
        self.status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body


class AuthenticationErrorTests(unittest.TestCase):
    def test_converts_xiaomi_auth_401_to_actionable_error(self):
        error = urllib.error.HTTPError(
            sample_config().feed_stats_url,
            401,
            "Unauthorized",
            Message(),
            io.BytesIO(b'{"code":3,"message":"auth error"}'),
        )

        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaisesRegex(MiHomeAuthenticationError, "mihome-login"):
                post_json(
                    sample_config().feed_stats_url,
                    {"data": "test"},
                    sample_config(),
                )

    def test_converts_other_http_errors_to_request_error(self):
        error = urllib.error.HTTPError(
            sample_config().feed_stats_url,
            503,
            "Unavailable",
            Message(),
            io.BytesIO(b'{"code":-1,"message":"busy"}'),
        )

        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaisesRegex(MiHomeRequestError, "HTTP 503: busy"):
                post_json(
                    sample_config().feed_stats_url,
                    {"data": "test"},
                    sample_config(),
                )


class DebugRedactionTests(unittest.TestCase):
    def test_redacts_nested_account_and_device_values(self):
        self.assertEqual(
            redact_data(
                {
                    "uid": "user",
                    "accessKey": "key",
                    "params": {"did": "device", "in": [1]},
                }
            ),
            {
                "uid": "<redacted>",
                "accessKey": "<redacted>",
                "params": {"did": "<redacted>", "in": [1]},
            },
        )

    def test_debug_output_does_not_include_sensitive_payload_values(self):
        payload = {
            "uid": "user-123",
            "did": "device-did",
            "accessKey": "secret-access-key",
        }
        output = io.StringIO()

        with (
            patch(
                "urllib.request.urlopen",
                return_value=FakeResponse(b'{"code":0,"result":[]}'),
            ),
            redirect_stdout(output),
        ):
            post_json(
                sample_config().feed_stats_url,
                payload,
                sample_config(),
                debug=True,
            )

        debug_text = output.getvalue()
        self.assertNotIn("user-123", debug_text)
        self.assertNotIn("device-did", debug_text)
        self.assertNotIn("secret-access-key", debug_text)
        self.assertIn("<redacted>", debug_text)


if __name__ == "__main__":
    unittest.main()
