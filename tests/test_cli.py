import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from mihome_feeder.cli_feed import main as feed_main
from mihome_feeder.cli_login import main as login_main
from mihome_feeder.cli_stats import main as stats_main
from tests._helpers import sample_config


class FeedCliTests(unittest.TestCase):
    def test_json_mode_returns_failure_for_unsuccessful_action(self):
        stdout = io.StringIO()
        with (
            patch("sys.argv", ["mihome-feed", "--json"]),
            patch("mihome_feeder.cli_feed.load_env_file"),
            patch(
                "mihome_feeder.cli_feed.AppConfig.from_env",
                return_value=sample_config(),
            ),
            patch(
                "mihome_feeder.cli_feed.post_json",
                return_value={"code": -1, "message": "failed"},
            ),
            redirect_stdout(stdout),
        ):
            result = feed_main()

        self.assertEqual(result, 1)
        self.assertIn('"code": -1', stdout.getvalue())


class StatsCliTests(unittest.TestCase):
    def test_unsuccessful_response_does_not_report_zero_totals(self):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch("sys.argv", ["mihome-feed-stats"]),
            patch("mihome_feeder.cli_stats.load_env_file"),
            patch(
                "mihome_feeder.cli_stats.AppConfig.from_env",
                return_value=sample_config(),
            ),
            patch(
                "mihome_feeder.cli_stats.post_json",
                return_value={"code": -1, "message": "failed"},
            ),
            redirect_stdout(stdout),
            redirect_stderr(stderr),
        ):
            result = stats_main()

        self.assertEqual(result, 1)
        self.assertNotIn("today:", stdout.getvalue())
        self.assertIn("unsuccessful response", stderr.getvalue())

    def test_json_mode_preserves_failure_exit_status(self):
        with (
            patch("sys.argv", ["mihome-feed-stats", "--json"]),
            patch("mihome_feeder.cli_stats.load_env_file"),
            patch(
                "mihome_feeder.cli_stats.AppConfig.from_env",
                return_value=sample_config(),
            ),
            patch(
                "mihome_feeder.cli_stats.post_json",
                return_value={"code": -1, "message": "failed"},
            ),
            redirect_stdout(io.StringIO()),
        ):
            result = stats_main()

        self.assertEqual(result, 1)


class LoginCliTests(unittest.TestCase):
    def test_can_create_auth_values_when_env_has_only_device_config(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            env_file = temporary_path / "feeder.env"
            env_file.write_text(
                "MIHOME_DEVICE_ID='device-id'\n"
                "MIHOME_DID='device-did'\n"
                "MIHOME_ACCESS_KEY='access-key'\n"
            )
            env_file.chmod(0o600)

            fake_migate = SimpleNamespace(
                get_passtoken=lambda _auth: {
                    "userId": "new-user",
                    "deviceId": "new-passport-device",
                    "passToken": "pass-token",
                },
                get_service=lambda _cookies, _params: {
                    "servicedata": {
                        "ssecurity": "c2VjdXJpdHk=",
                        "deviceId": "new-passport-device",
                    },
                    "cookies": {
                        "serviceToken": "new-service-token",
                        "userId": "new-user",
                    },
                },
            )

            with (
                patch.dict(os.environ, {}, clear=True),
                patch.dict(sys.modules, {"migate": fake_migate}),
                patch(
                    "sys.argv",
                    ["mihome-login", "--env-file", str(env_file)],
                ),
                patch(
                    "mihome_feeder.cli_login.Path.home",
                    return_value=temporary_path,
                ),
                patch("mihome_feeder.cli_login.verify_session") as verify,
                patch(
                    "mihome_feeder.cli_login.update_env_file",
                    return_value=temporary_path / "backup",
                ) as update,
                redirect_stdout(io.StringIO()),
            ):
                result = login_main()

            self.assertEqual(result, 0)
            refreshed_session, refreshed_config = verify.call_args.args[:2]
            self.assertEqual(refreshed_session.user_id, "new-user")
            self.assertEqual(refreshed_config.service_token, "new-service-token")
            self.assertEqual(refreshed_config.user_id, "new-user")
            update.assert_called_once()


if __name__ == "__main__":
    unittest.main()
