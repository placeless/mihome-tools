import sys

from .cli_feed import main as feed_main
from .cli_login import main as login_main
from .cli_stats import main as stats_main


def main():
    if len(sys.argv) < 2:
        print(
            "Usage: python -m mihome_feeder [feed|stats|login] ...",
            file=sys.stderr,
        )
        raise SystemExit(2)

    cmd = sys.argv[1]
    sys.argv = [sys.argv[0]] + sys.argv[2:]

    if cmd == "feed":
        return feed_main()
    elif cmd == "stats":
        return stats_main()
    elif cmd == "login":
        return login_main()
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    raise SystemExit(main())
