import argparse
import json
import os
import sys

from .cloud import post_json
from .config import AppConfig


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
    parser.add_argument("portions", nargs="?", type=int, help="number of portions")
    parser.add_argument("--debug", action="store_true", help="enable debug output")
    parser.add_argument("--json", action="store_true", help="print full response json")
    args = parser.parse_args()

    debug = args.debug or os.environ.get("MIHOME_DEBUG", "").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    cfg = AppConfig.from_env()
    portions = args.portions if args.portions is not None else cfg.feed_default_portions

    payload = build_payload(cfg, portions)
    resp_json = post_json(cfg.feed_url, payload, cfg, debug=debug)

    if args.json or debug:
        print(json.dumps(resp_json, ensure_ascii=False, indent=2))
        return

    if is_ok_response(resp_json):
        print("ok")
        return

    print(json.dumps(resp_json, ensure_ascii=False, indent=2))
    sys.exit(1)


if __name__ == "__main__":
    main()
