import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from mihome_feeder.auth import (
    run_with_private_session_file,
    session_from_migate,
    update_env_file,
)


class SessionFromMigateTests(unittest.TestCase):
    def test_extracts_matching_auth_values(self):
        session = session_from_migate(
            {"userId": "123", "deviceId": "wb_old"},
            {
                "servicedata": {
                    "ssecurity": "security",
                    "deviceId": "wb_new",
                },
                "cookies": {
                    "serviceToken": "token",
                    "userId": "123",
                },
            },
        )

        self.assertEqual(
            session.as_env(),
            {
                "MIHOME_SSECURITY": "security",
                "MIHOME_SERVICE_TOKEN": "token",
                "MIHOME_YAST": "token",
                "MIHOME_USER_ID": "123",
                "MIHOME_PASSPORT_DEVICE_ID": "wb_new",
            },
        )


class UpdateEnvFileTests(unittest.TestCase):
    def test_updates_auth_values_and_preserves_other_settings(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "feeder.env"
            path.write_text(
                "export MIHOME_SSECURITY='old-security'\n"
                "MIHOME_SERVICE_TOKEN=old-token\n"
                "export MIHOME_DEVICE_ID='keep-me'\n"
            )
            path.chmod(0o600)

            backup = update_env_file(
                path,
                {
                    "MIHOME_SSECURITY": "new'security",
                    "MIHOME_SERVICE_TOKEN": "new-token",
                    "MIHOME_YAST": "new-token",
                },
                now=datetime(2026, 6, 24, 20, 0, 0),
            )

            self.assertEqual(backup.name, "feeder.env.bak-20260624-200000")
            self.assertIn("old-security", backup.read_text())
            updated = path.read_text()
            self.assertIn("export MIHOME_SSECURITY='new'\"'\"'security'", updated)
            self.assertIn("MIHOME_SERVICE_TOKEN='new-token'", updated)
            self.assertIn("export MIHOME_YAST='new-token'", updated)
            self.assertIn("export MIHOME_DEVICE_ID='keep-me'", updated)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)


class PrivateSessionFileTests(unittest.TestCase):
    def test_restricts_session_file_during_login_and_restores_umask(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory) / "session"
            directory.mkdir()
            session_file = directory / "session.json"
            probe_file = Path(temporary_directory) / "probe"

            def login():
                session_file.write_text("secret")
                return "logged-in"

            previous_umask = os.umask(0o022)
            try:
                result = run_with_private_session_file(login, session_file)
                probe_file.write_text("probe")
            finally:
                os.umask(previous_umask)

            self.assertEqual(result, "logged-in")
            self.assertEqual(session_file.stat().st_mode & 0o777, 0o600)
            self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
            self.assertEqual(probe_file.stat().st_mode & 0o777, 0o644)


if __name__ == "__main__":
    unittest.main()
