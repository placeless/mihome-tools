import os
import re
import stat
import tempfile
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from datetime import datetime
from pathlib import Path
from typing import TypeVar

from .cli_stats import build_payload as build_stats_payload
from .cloud import post_json
from .config import AppConfig

AUTH_ENV_NAMES = (
    "MIHOME_SSECURITY",
    "MIHOME_SERVICE_TOKEN",
    "MIHOME_YAST",
    "MIHOME_USER_ID",
    "MIHOME_PASSPORT_DEVICE_ID",
)

_ASSIGNMENT_RE = re.compile(
    r"^(?P<prefix>\s*(?:export\s+)?)(?P<name>[A-Za-z_][A-Za-z0-9_]*)="
)

T = TypeVar("T")


@dataclass(frozen=True)
class RefreshedSession:
    ssecurity: str
    service_token: str
    user_id: str
    passport_device_id: str

    def as_env(self) -> dict[str, str]:
        return {
            "MIHOME_SSECURITY": self.ssecurity,
            "MIHOME_SERVICE_TOKEN": self.service_token,
            "MIHOME_YAST": self.service_token,
            "MIHOME_USER_ID": self.user_id,
            "MIHOME_PASSPORT_DEVICE_ID": self.passport_device_id,
        }


def session_from_migate(
    pass_token: Mapping[str, object],
    service: Mapping[str, object],
) -> RefreshedSession:
    raw_service_data = service.get("servicedata")
    raw_cookies = service.get("cookies")
    service_data = raw_service_data if isinstance(raw_service_data, Mapping) else {}
    cookies = raw_cookies if isinstance(raw_cookies, Mapping) else {}

    ssecurity = service_data.get("ssecurity")
    service_token = cookies.get("serviceToken")
    user_id = cookies.get("userId") or pass_token.get("userId")
    passport_device_id = service_data.get("deviceId") or pass_token.get("deviceId")

    values = (ssecurity, service_token, user_id, passport_device_id)
    names = ("ssecurity", "service_token", "user_id", "passport_device_id")
    missing = [name for name, value in zip(names, values) if not value]
    if missing:
        raise RuntimeError(
            "Xiaomi login did not return required values: " + ", ".join(missing)
        )

    return RefreshedSession(
        ssecurity=str(ssecurity),
        service_token=str(service_token),
        user_id=str(user_id),
        passport_device_id=str(passport_device_id),
    )


def run_with_private_session_file(login: Callable[[], T], session_file: Path) -> T:
    previous_umask = os.umask(0o077)
    try:
        return login()
    finally:
        os.umask(previous_umask)
        if session_file.exists():
            os.chmod(session_file, 0o600)
            os.chmod(session_file.parent, 0o700)


def verify_session(
    session: RefreshedSession, cfg: AppConfig, debug: bool = False
) -> None:
    refreshed_cfg = replace(
        cfg,
        ssecurity=session.ssecurity,
        service_token=session.service_token,
        yast=session.service_token,
        user_id=session.user_id,
        passport_device_id=session.passport_device_id,
    )
    response = post_json(
        refreshed_cfg.feed_stats_url,
        build_stats_payload(refreshed_cfg, days=1, limit=1),
        refreshed_cfg,
        debug=debug,
    )
    if not isinstance(response, dict) or response.get("code") != 0:
        raise RuntimeError(
            f"The refreshed Xiaomi session could not be verified: {response!r}"
        )


def _shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def update_env_file(
    path: Path, updates: Mapping[str, str], now: datetime | None = None
) -> Path:
    path = path.expanduser()
    if not path.exists():
        raise RuntimeError(f"Missing env file: {path}")

    current_text = path.read_text()
    original_lines = current_text.splitlines(keepends=True)
    remaining = dict(updates)
    new_lines = []

    for line in original_lines:
        match = _ASSIGNMENT_RE.match(line)
        if match and match.group("name") in remaining:
            name = match.group("name")
            newline = "\n" if line.endswith("\n") else ""
            new_lines.append(
                f"{match.group('prefix')}{name}={_shell_quote(remaining.pop(name))}"
                f"{newline}"
            )
        else:
            new_lines.append(line)

    if remaining:
        if new_lines and not new_lines[-1].endswith("\n"):
            new_lines[-1] += "\n"
        if new_lines and new_lines[-1].strip():
            new_lines.append("\n")
        new_lines.append("# Refreshed Mi Home session\n")
        for name in AUTH_ENV_NAMES:
            if name in remaining:
                new_lines.append(f"export {name}={_shell_quote(remaining[name])}\n")

    timestamp = (now or datetime.now().astimezone()).strftime("%Y%m%d-%H%M%S")
    backup_path = path.with_name(f"{path.name}.bak-{timestamp}")
    backup_path.write_text(current_text)

    mode = stat.S_IMODE(path.stat().st_mode)
    os.chmod(backup_path, mode)

    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(fd, "w") as temporary_file:
            temporary_file.writelines(new_lines)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.chmod(temporary_path, mode)
        os.replace(temporary_path, path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()

    return backup_path
