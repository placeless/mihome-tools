import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta

from .cloud import post_json
from .config import AppConfig


def parse_portions(value):
    try:
        arr = json.loads(value) if isinstance(value, str) else value
        if not isinstance(arr, list):
            return 0, None

        for item in arr:
            if isinstance(item, dict) and item.get("piid") == 4:
                return int(item.get("value") or 0), arr
    except Exception:
        pass
    return 0, None


def summarize_records(records):
    tz = datetime.now().astimezone().tzinfo
    now = datetime.now(tz)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start.replace(day=1)

    total_today = 0
    total_week = 0
    total_month = 0
    by_day = {}

    for rec in records:
        ts = rec.get("time")
        if not ts:
            continue

        portions, _ = parse_portions(rec.get("value"))
        if portions <= 0:
            continue

        dt = datetime.fromtimestamp(int(ts), tz)
        day_key = dt.strftime("%Y-%m-%d")
        by_day[day_key] = by_day.get(day_key, 0) + portions

        if dt >= today_start:
            total_today += portions
        if dt >= week_start:
            total_week += portions
        if dt >= month_start:
            total_month += portions

    yesterday_key = (today_start - timedelta(days=1)).strftime("%Y-%m-%d")
    return {
        "feed_today": total_today,
        "feed_yesterday": by_day.get(yesterday_key, 0),
        "feed_week": total_week,
        "feed_month": total_month,
        "daily": dict(sorted(by_day.items())),
    }


def build_payload(cfg: AppConfig, days: int, limit: int):
    now = int(time.time())
    if days <= 0:
        time_start = 0
    else:
        time_start = now - days * 86400

    return {
        "uid": cfg.user_id,
        "did": cfg.did,
        "time_start": time_start,
        "time_end": now,
        "limit": limit,
        "accessKey": cfg.access_key,
        "key": "4.2",
        "group": "raw",
        "type": "event",
    }


def main():
    parser = argparse.ArgumentParser(description="Query Xiaomi feeder stats")
    parser.add_argument("days", nargs="?", type=int, default=7)
    parser.add_argument("limit", nargs="?", type=int, default=200)
    parser.add_argument(
        "--full", action="store_true", help="print week/month/daily too"
    )
    parser.add_argument("--json", action="store_true", help="print full response json")
    parser.add_argument("--debug", action="store_true", help="enable debug output")
    args = parser.parse_args()

    debug = args.debug or os.environ.get("MIHOME_DEBUG", "").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    cfg = AppConfig.from_env()
    payload = build_payload(cfg, args.days, args.limit)
    resp_json = post_json(cfg.feed_stats_url, payload, cfg, debug=debug)

    if args.json:
        print(json.dumps(resp_json, ensure_ascii=False, indent=2))
        return

    result = resp_json.get("result") if isinstance(resp_json, dict) else None
    records = result if isinstance(result, list) else []

    if debug:
        print("")
        print("RESULT COUNT:", len(records))

    if len(records) >= args.limit:
        print(
            f"warning: result count reached limit={args.limit}, history may be truncated",
            file=sys.stderr,
        )

    summary = summarize_records(records)

    def fmt_value(portions):
        return f"{portions}, {portions * 5}g"

    print(f"today: {fmt_value(summary['feed_today'])}")
    print(f"yesterday: {fmt_value(summary['feed_yesterday'])}")

    if args.full:
        print(f"feed_week:  {summary['feed_week']}")
        print(f"feed_month: {summary['feed_month']}")
        print("")
        print("daily:")
        for day, total in summary["daily"].items():
            print(f"  {day}: {total}")


if __name__ == "__main__":
    main()
