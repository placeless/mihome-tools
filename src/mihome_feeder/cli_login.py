import argparse
import os
import sys
from pathlib import Path

from .auth import (
    run_with_private_session_file,
    session_from_migate,
    update_env_file,
    verify_session,
)
from .config import AppConfig
from .env import default_env_file, load_env_file


def main():
    parser = argparse.ArgumentParser(
        description="Refresh the Xiaomi cloud session used by mihome-tools"
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=default_env_file(),
        help="environment file to update",
    )
    parser.add_argument(
        "--debug", action="store_true", help="enable API verification debug output"
    )
    args = parser.parse_args()

    try:
        load_env_file(args.env_file)
    except (RuntimeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    required_device_values = (
        "MIHOME_DEVICE_ID",
        "MIHOME_DID",
        "MIHOME_ACCESS_KEY",
    )
    missing = [name for name in required_device_values if not os.environ.get(name)]
    if missing:
        print(
            "error: Missing required environment variable(s): " + ", ".join(missing),
            file=sys.stderr,
        )
        return 2

    expected_user_id = os.environ.get("MIHOME_USER_ID")

    try:
        import migate
    except ImportError:
        print(
            "mihome-login must be launched from the installed tool or with "
            "`make run-login` so its login dependency is available.",
            file=sys.stderr,
        )
        return 2

    print(
        "Sign in to the Xiaomi account already configured for this feeder.\n"
        "Browser login is recommended; press Enter at the login method prompt."
    )
    session_file = Path.home() / ".migatesession" / "xiaomiio" / "session.json"
    try:
        pass_token = run_with_private_session_file(
            lambda: migate.get_passtoken({"sid": "xiaomiio"}),
            session_file,
        )
    except KeyboardInterrupt:
        print("\nXiaomi login cancelled.", file=sys.stderr)
        return 130
    if not pass_token:
        print("Xiaomi login did not complete.", file=sys.stderr)
        return 2

    service = migate.get_service(pass_token, {"sid": "xiaomiio"})
    if not service:
        print("Could not create a Xiaomi IoT service session.", file=sys.stderr)
        return 2

    try:
        session = session_from_migate(pass_token, service)
        if expected_user_id and str(expected_user_id) != str(session.user_id):
            session_file.unlink(missing_ok=True)
            raise RuntimeError(
                "The signed-in Xiaomi account does not match MIHOME_USER_ID; "
                "the environment file was not changed."
            )

        os.environ.update(session.as_env())
        cfg = AppConfig.from_env()
        print("Verifying the refreshed session against the Mi Home API...")
        verify_session(session, cfg, debug=args.debug)
        backup = update_env_file(args.env_file, session.as_env())
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if session_file.exists():
        os.chmod(session_file, 0o600)

    print(f"Session refreshed successfully. Backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
