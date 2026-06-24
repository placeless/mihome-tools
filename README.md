# mihome-tools

Command-line tools for triggering a Xiaomi Mi Home pet feeder and summarizing
its feed history.

> [!IMPORTANT]
> This is an unofficial community project. It is not affiliated with or
> endorsed by Xiaomi. It uses private Mi Home cloud APIs that may change
> without notice.

## Features

- Trigger a configured feeder action with a local portion limit.
- Query feed events and summarize today, yesterday, the last seven calendar
  days, the current month, and daily totals.
- Refresh an expired Xiaomi cloud session through Xiaomi account login.
- Install isolated commands with locked Python dependencies.
- Redact account and device identifiers from debug output.

The current event parser is tailored to a feeder whose portion count appears
as MIoT property `piid: 4` in event key `4.2`. Other feeder models may require
code or configuration changes.

## Requirements

- macOS or Linux
- Python 3.10 or newer
- [`uv`](https://docs.astral.sh/uv/)
- A Xiaomi account containing the feeder
- Device-specific MIoT identifiers and `accessKey`

## Install

```bash
git clone https://github.com/placeless/mihome-tools.git
cd mihome-tools
make install
```

This installs three isolated commands through `uv tool`:

- `mihome-feed`
- `mihome-feed-stats`
- `mihome-login`

Make sure the user executable directory reported by `uv tool dir --bin` is in
your `PATH`.

To upgrade an existing local checkout:

```bash
git pull --ff-only
make install
```

To uninstall:

```bash
make uninstall
```

## Configuration

Create `~/.config/mihome/feeder.env`:

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

export MIHOME_FEED_URL='https://de.core.api.io.mi.com/app/miotspec/action'
export MIHOME_FEED_STATS_URL='https://de.api.io.mi.com/app/user/get_user_device_data'
export MIHOME_FEED_SIID='your_siid'
export MIHOME_FEED_AIID='your_aiid'
export MIHOME_FEED_DEFAULT_PORTIONS='1'
export MIHOME_FEED_MAX_PORTIONS='4'
```

Protect the file:

```bash
chmod 600 ~/.config/mihome/feeder.env
```

Only simple `KEY='value'` or `export KEY='value'` assignments are supported.
The file is parsed as data and is not executed as a shell script. Existing
process environment variables take precedence over values in the file.

Set `MIHOME_ENV_FILE` or pass `--env-file` to use a different location.

For first-time setup, the five session variables at the top may be omitted.
After the device ID, DID, and access key are present, `mihome-login` will
create and append a matching session.

### Obtaining device values

The session values can be created or refreshed with:

```bash
mihome-login
```

The command uses the pinned
[`migate`](https://github.com/offici5l/migate) authentication library and the
Xiaomi `xiaomiio` service. It:

1. opens Xiaomi account login;
2. verifies that the account matches `MIHOME_USER_ID`;
3. verifies the new session against the configured stats endpoint;
4. atomically updates the session values in `feeder.env`;
5. keeps a timestamped backup of the previous file.

The remaining device-specific values—such as `MIHOME_DID`,
`MIHOME_ACCESS_KEY`, `MIHOME_FEED_SIID`, and `MIHOME_FEED_AIID`—must come from
your device configuration or a request captured from your own Mi Home app.
Never publish captured requests or credentials.

## Usage

Feed one portion:

```bash
mihome-feed 1
```

Feed two portions:

```bash
mihome-feed 2
```

Requests above `MIHOME_FEED_MAX_PORTIONS` are rejected locally:

```console
$ mihome-feed 1000
usage: mihome-feed [-h] [--debug] [--json] [--env-file ENV_FILE] [portions]
mihome-feed: error: portions must not exceed 4 per request
```

Query the last seven days:

```bash
mihome-feed-stats
```

Query a larger window and include daily totals:

```bash
mihome-feed-stats 30 2000 --full
```

Example output:

```text
today: 3, 15g
yesterday: 5, 25g
feed_week:  31
feed_month: 82

daily:
  2026-06-23: 5
  2026-06-24: 3
```

Print the raw API response:

```bash
mihome-feed-stats 30 1000 --json
```

Enable safe diagnostic output:

```bash
mihome-feed-stats 30 1000 --debug
```

`--debug` redacts account IDs, device IDs, and access keys. `--json` prints raw
Mi Home data and may contain private information; review it before sharing.

## Exit status

- `0`: operation succeeded
- `1`: Mi Home returned an unsuccessful business response
- `2`: configuration, authentication, network, or protocol failure
- `130`: interactive login was cancelled

This makes the commands safe to use from scripts and automations.

## Troubleshooting

### HTTP 401 or `code: 3, message: auth error`

The configured cloud session expired or was revoked:

```bash
mihome-login
```

### Missing or insecure environment file

Create the file at the configured path and restrict it:

```bash
chmod 600 ~/.config/mihome/feeder.env
```

### Empty or truncated history

- Confirm `MIHOME_DID`, `MIHOME_ACCESS_KEY`, and event key `4.2`.
- Increase the requested day window and result limit.
- If the result count reaches the limit, rerun with a larger limit.

### Feed action fails

Confirm the action endpoint, `SIID`, `AIID`, action device ID, and expected
input shape for your exact feeder model.

## Development

Install the locked development environment:

```bash
uv sync --locked --all-groups
```

Run all checks:

```bash
make check
```

Run commands from the source checkout:

```bash
make run-feed ARGS="1"
make run-stats ARGS="30 1000 --full"
make run-login
```

Regenerate dependency locks after an intentional dependency change:

```bash
uv lock
uv export --locked --no-dev --no-emit-project \
  --format requirements-txt --output-file requirements.lock
```

CI tests Python 3.10, 3.12, and 3.14 and runs Ruff.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

Read [SECURITY.md](SECURITY.md) before reporting a vulnerability or sharing
diagnostics. Do not open public issues containing Xiaomi credentials, device
identifiers, raw request captures, or unreviewed `--json` output.

## License

MIT. See [LICENSE](LICENSE).
