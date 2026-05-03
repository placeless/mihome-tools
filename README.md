# mihome-tools

A small personal toolkit for controlling a Xiaomi pet feeder and querying feed history from Mi Home cloud APIs.

## Features

- Trigger feeder actions from the command line.
- Query feed history and aggregate totals for today, last 7 days, current month, and daily totals.
- Keep development sources in your project directory.
- Install runnable artifacts into user-local paths:
  - `~/.local/bin/`
  - `~/.local/share/mihome-tools/`

## Project layout

```text
mihome-tools/
├── Makefile
├── README.md
├── bin/
│   ├── mihome-feed
│   └── mihome-feed-stats
└── src/
    └── mihome_feeder/
        ├── __init__.py
        ├── __main__.py
        ├── cli_feed.py
        ├── cli_stats.py
        ├── cloud.py
        ├── config.py
        └── crypto.py
```

## Requirements

- macOS or Linux
- Python 3.9+
- A working Mi Home account session and extracted credentials
- `~/.local/bin` in your `PATH`

Check whether `~/.local/bin` is already in `PATH`:

```bash
echo "$PATH"
```

If needed, add this to your shell profile:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Environment file

If you do not already have these values, you can capture Mi Home app requests using tools like `mitmproxy` (or similar HTTP proxy/debug tools) and extract the required session/device fields for `feeder.env`. This project does not cover packet-capture setup details; research the workflow that matches your device and network environment.

Create:

```text
~/.config/mihome/feeder.env
```

Example:

```bash
export MIHOME_SSECURITY='your_ssecurity'
export MIHOME_SERVICE_TOKEN='your_serviceToken'
export MIHOME_YAST='your_yetAnotherServiceToken'
export MIHOME_USER_ID='your_userId'
export MIHOME_PASSPORT_DEVICE_ID='your_PassportDeviceId'
export MIHOME_DEVICE_ID='your_DEVICEID'
export MIHOME_DID='your_did'
export MIHOME_ACCESS_KEY='your_accessKey'

export MIHOME_REGION='ES'
export MIHOME_LANGUAGE='ZH_CN'
export MIHOME_APP_VERSION='11.3.203'
export MIHOME_PLATFORM_VERSION='18.7'

# Feed action endpoint
export MIHOME_FEED_URL='https://de.core.api.io.mi.com/app/miotspec/action'
export MIHOME_FEED_SIID='your_siid'
export MIHOME_FEED_AIID='your_aiid'
export MIHOME_FEED_DEFAULT_PORTIONS='1'
export MIHOME_FEED_MAX_PORTIONS='4'

# Feed stats endpoint
export MIHOME_FEED_STATS_URL='https://de.api.io.mi.com/app/user/get_user_device_data'
```

Notes:

- `MIHOME_YAST` can be the same as `MIHOME_SERVICE_TOKEN` if that is what your session uses.
- `MIHOME_FEED_STATS_URL` is intentionally different from `MIHOME_FEED_URL`.
- `MIHOME_FEED_MAX_PORTIONS` defaults to `4`; feed requests above this value are rejected locally before calling the Mi Home API.
- Feed stats for this feeder were verified against:
  - host: `de.api.io.mi.com`
  - path: `/app/user/get_user_device_data`
  - payload key: `"4.2"`
  - type: `"event"`
  - group: `"raw"`

## Install

From the project root:

```bash
cd ~/Developer/projects/mihome-tools
make install
```

This installs:

- `~/.local/bin/mihome-feed`
- `~/.local/bin/mihome-feed-stats`
- `~/.local/share/mihome-tools/mihome_feeder/...`

## Reinstall after code changes

```bash
make reinstall
```

## Uninstall

```bash
make uninstall
```

## Development usage

Run directly from the source tree without installing:

```bash
make run-feed ARGS="1"
make run-stats
make run-stats ARGS="30 2000 --debug"
```

These commands load `~/.config/mihome/feeder.env` and run the source package with `PYTHONPATH=src`.

## Installed usage

Feed one portion:

```bash
mihome-feed 1
```

Feed two portions:

```bash
mihome-feed 2
```

Feed requests above the configured limit fail fast locally:

```bash
mihome-feed 1000
# error: portions must not exceed 4 per request
```

Query stats with defaults:

```bash
mihome-feed-stats
```

Query last 30 days with a higher limit:

```bash
mihome-feed-stats 30 2000
```

Get raw JSON response:

```bash
mihome-feed-stats 30 1000 --json
```

Enable debug output:

```bash
MIHOME_DEBUG=1 mihome-feed-stats 30 1000
```

## Output format

Typical stats output:

```text
feed_today: 20
feed_week:  313
feed_month: 1141

daily:
  2026-03-19: 17
  2026-03-20: 38
  2026-03-21: 40
```

## How feed stats are derived

The feed history request queries Mi Home cloud event records and aggregates the feeder event payloads.

For this feeder, the verified request shape is:

- `key: "4.2"`
- `group: "raw"`
- `type: "event"`
- includes `accessKey`

Each event record contains a `value` JSON array. The feeder portion count is taken from the item where:

```json
{"piid": 4, "value": N}
```

The script sums those values by day and also computes:

- today
- last 7 days
- current month

## Troubleshooting

### 1. `Missing env file`

Make sure this file exists:

```text
~/.config/mihome/feeder.env
```

### 2. `Missing required environment variable`

Open `feeder.env` and verify the missing variable is defined and exported.

### 3. Command not found

Make sure `~/.local/bin` is in `PATH`:

```bash
echo "$PATH"
```

If not, add it to your shell profile and restart the shell.

### 4. Feed stats returns empty results

Check:

- `MIHOME_FEED_STATS_URL` is `https://de.api.io.mi.com/app/user/get_user_device_data`
- the payload uses `key: "4.2"`
- `accessKey` is present
- the correct `did` is used
- your time window and limit are large enough

Useful debug command:

```bash
MIHOME_DEBUG=1 mihome-feed-stats 30 1000
```

### 5. Stats look truncated

If you see a warning like:

```text
warning: result count reached limit=1000, history may be truncated
```

rerun with a higher limit:

```bash
mihome-feed-stats 60 3000
```

### 6. Feed action fails

Check:

- `MIHOME_FEED_URL`
- `MIHOME_FEED_SIID`
- `MIHOME_FEED_AIID`
- whether the action endpoint and stats endpoint are intentionally different hosts

### 7. Need to inspect raw response

Use:

```bash
mihome-feed-stats 30 1000 --json
```

or:

```bash
MIHOME_DEBUG=1 mihome-feed-stats 30 1000
```

## Upgrade workflow

Typical update cycle:

```bash
cd ~/Developer/projects/mihome-tools
# edit source files
make reinstall
mihome-feed-stats 30 1000
```

## Notes for future improvements

Possible next steps:

- add pagination for stats beyond the current limit
- add CSV export
- add per-meal time-of-day summaries
- add tests for payload parsing and date aggregation
