import argparse
import json
import os
import sys
from pathlib import Path

from .cloud import MiHomeRequestError, post_json
from .config import AppConfig
from .env import default_env_file, load_env_file


def validate_portions(portions: int, max_portions: int):
    if portions < 1:
        raise ValueError("portions must be at least 1")
    if portions > max_portions:
        raise ValueError(f"portions must not exceed {max_portions} per request")


def build_payload(cfg: AppConfig, portions: int):
    if cfg.feed_siid is None or cfg.feed_aiid is None:
        raise RuntimeError(
            "Missing MIHOME_FEED_SIID or MIHOME_FEED_AIID in environment"
        )

    return {
        "accessKey": cfg.access_key,
        "params": {
            "did": cfg.feed_action_did or cfg.did,
            "siid": cfg.feed_siid,
            "aiid": cfg.feed_aiid,
            "in": [portions],
        },
    }


def is_ok_response(resp_json):
    if not isinstance(resp_json, dict):
        return False

    if resp_json.get("code") != 0:
        return False

    if resp_json.get("message") != "ok":
        return False

    result = resp_json.get("result")
    if isinstance(result, dict) and "code" in result and result.get("code") != 0:
        return False

    return True


def main():
    parser = argparse.ArgumentParser(description="Trigger Xiaomi feeder action")
    parser.add_argument(
        "portions",
        nargs="?",
        type=int,
        help="number of portions (must be within configured limit)",
    )
    parser.add_argument("--debug", action="store_true", help="enable debug output")
    parser.add_argument("--json", action="store_true", help="print full response json")
    parser.add_argument(
        "--env-file",
        type=str,
        default=str(default_env_file()),
        help="environment file to load",
    )
    args = parser.parse_args()

    debug = args.debug or os.environ.get("MIHOME_DEBUG", "").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    try:
        load_env_file(Path(args.env_file))
        cfg = AppConfig.from_env()
    except (RuntimeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    portions = args.portions if args.portions is not None else cfg.feed_default_portions
    try:
        validate_portions(portions, cfg.feed_max_portions)
    except ValueError as exc:
        parser.error(str(exc))

    try:
        payload = build_payload(cfg, portions)
        resp_json = post_json(cfg.feed_url, payload, cfg, debug=debug)
    except (MiHomeRequestError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    ok = is_ok_response(resp_json)
    if args.json:
        print(json.dumps(resp_json, ensure_ascii=False, indent=2))
    elif ok:
        print("ok")
    else:
        print(json.dumps(resp_json, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
