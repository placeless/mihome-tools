import sys
from .cli_feed import main as feed_main
from .cli_stats import main as stats_main

def main():
    if len(sys.argv) < 2:
        print("Usage: python -m mihome_feeder [feed|stats] ...", file=sys.stderr)
        raise SystemExit(2)

    cmd = sys.argv[1]
    sys.argv = [sys.argv[0]] + sys.argv[2:]

    if cmd == "feed":
        feed_main()
    elif cmd == "stats":
        stats_main()
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        raise SystemExit(2)

if __name__ == "__main__":
    main()
