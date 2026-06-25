# Security Policy

## Reporting a vulnerability

Please do not open a public issue containing Mi Home credentials, account
identifiers, device identifiers, request payloads, or raw API responses.

Use GitHub's private vulnerability reporting feature for security issues:

https://github.com/placeless/mihome-tools/security/advisories/new

Remove or rotate any exposed Xiaomi credentials before sharing diagnostic
information.

## Credential handling

- Keep `~/.config/mihome/feeder.env` readable only by your user (`chmod 600`).
- The `mihome-login` cache is restricted to mode `0600`.
- `--debug` redacts account and device identifiers.
- `--json` intentionally prints raw API data and should not be pasted into
  public issues without manual review.
- The optional Scriptable client stores Xiaomi credentials in Scriptable
  Keychain on the iPhone. Any untrusted Scriptable code may attempt to read the
  same entry, so only install scripts you have reviewed.
- Scriptable cloud requests are restricted to HTTPS endpoints under Xiaomi's
  `api.io.mi.com` domain.
