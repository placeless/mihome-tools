import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mihome_feeder.env import load_env_file


class LoadEnvFileTests(unittest.TestCase):
    def test_loads_exported_and_quoted_values_without_overriding_environment(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "feeder.env"
            path.write_text(
                "# comment\n"
                "export MIHOME_USER_ID='file user'\n"
                "MIHOME_REGION=ES # inline comment\n"
            )
            path.chmod(0o600)

            with patch.dict(os.environ, {"MIHOME_USER_ID": "process-user"}, clear=True):
                load_env_file(path)
                self.assertEqual(os.environ["MIHOME_USER_ID"], "process-user")
                self.assertEqual(os.environ["MIHOME_REGION"], "ES")

    @unittest.skipUnless(os.name == "posix", "POSIX file permissions required")
    def test_rejects_env_file_readable_by_other_users(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "feeder.env"
            path.write_text("MIHOME_USER_ID=user\n")
            path.chmod(0o644)

            with self.assertRaisesRegex(RuntimeError, "chmod 600"):
                load_env_file(path)

    def test_rejects_shell_commands(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "feeder.env"
            path.write_text("echo unsafe\n")
            path.chmod(0o600)

            with self.assertRaisesRegex(RuntimeError, "simple KEY"):
                load_env_file(path)


if __name__ == "__main__":
    unittest.main()
