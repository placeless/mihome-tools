import os
import re
import shlex
import stat
from pathlib import Path

_ENV_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def default_env_file() -> Path:
    configured = os.environ.get("MIHOME_ENV_FILE")
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".config/mihome/feeder.env"


def load_env_file(path: Path | None = None) -> Path:
    env_path = (path or default_env_file()).expanduser()
    if not env_path.is_file():
        raise RuntimeError(f"Missing env file: {env_path}")
    if os.name == "posix":
        mode = stat.S_IMODE(env_path.stat().st_mode)
        if mode & 0o077:
            raise RuntimeError(
                f"Environment file is accessible by other users: {env_path}; "
                "run chmod 600 on it"
            )

    for line_number, original_line in enumerate(env_path.read_text().splitlines(), 1):
        line = original_line.strip()
        if not line or line.startswith("#"):
            continue

        if line.startswith("export "):
            line = line[7:].lstrip()

        name, separator, raw_value = line.partition("=")
        name = name.strip()
        if not separator or not _ENV_NAME_RE.fullmatch(name):
            raise RuntimeError(
                f"Unsupported syntax in {env_path} at line {line_number}; "
                "use simple KEY='value' assignments"
            )

        try:
            values = shlex.split(raw_value, comments=True, posix=True)
        except ValueError as exc:
            raise RuntimeError(
                f"Invalid value in {env_path} at line {line_number}: {exc}"
            ) from exc

        if not values:
            value = ""
        elif len(values) == 1:
            value = values[0]
        else:
            raise RuntimeError(
                f"Unsupported syntax in {env_path} at line {line_number}; "
                "quote values containing spaces"
            )

        os.environ.setdefault(name, value)

    return env_path
