# Contributing

Contributions are welcome, especially fixes for additional feeder models,
regions, and Mi Home API response shapes.

## Development setup

```bash
git clone https://github.com/placeless/mihome-tools.git
cd mihome-tools
uv sync --locked --all-groups
make check
```

`make check` requires Node.js 20 or newer for the Scriptable protocol tests.

Keep changes compatible with Python 3.10 and newer. Add regression tests for
behavior changes and keep dependencies pinned through `uv.lock`.

Scriptable protocol changes must also pass the Node.js tests under
`scriptable/tests/`.

## Security and privacy

Never commit or paste:

- Xiaomi passwords, pass tokens, service tokens, or `ssecurity`;
- access keys, user IDs, device IDs, DIDs, or passport device IDs;
- raw proxy captures or unreviewed `--json` output;
- a real `feeder.env` file.

Use synthetic values in tests and documentation. Follow
[SECURITY.md](SECURITY.md) for vulnerability reports.

## Pull requests

- Explain the feeder model or API behavior being changed.
- Include the relevant tests.
- Run `make check`.
- Keep unrelated formatting or refactors out of the same change.
