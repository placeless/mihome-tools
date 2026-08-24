# Scriptable client

This directory contains a direct iPhone client for the same Mi Home cloud
protocol used by the Python CLI. It does not require a Mac, Raspberry Pi, web
server, or inbound network access.

```text
Scriptable on iPhone → Mi Home cloud API
```

## Security model

- Xiaomi session and device credentials are stored in Scriptable Keychain.
- Credentials are never written into the JavaScript files.
- The setup importer clears the clipboard as soon as import begins.
- Feeding always displays a confirmation dialog.
- The configured maximum portion count is enforced on the phone.
- Requests are restricted to HTTPS endpoints under Xiaomi's `api.io.mi.com`
  domain.

Anyone who can unlock the iPhone and run these scripts may be able to operate
the feeder. Do not install untrusted Scriptable code that could read the same
Keychain entry.

## Installation

1. Install [Scriptable](https://scriptable.app/) from the App Store.
2. Copy the contents of [`MiHomeInstaller.js`](MiHomeInstaller.js) into a new
   Scriptable script with that exact name.
3. Run `MiHomeInstaller`.
4. Run `MiHomeSetup`.

The installer downloads the remaining scripts from the `main` branch of this
repository into Scriptable's iCloud folder. Review the source before running it
if this is a concern.

Run `MiHomeInstaller` again to update an existing installation. Stored Keychain
configuration is preserved, and current installers also update themselves. If
your installed copy predates `MiHomeLogin`, replace `MiHomeInstaller.js` once
from this repository before running it; alternatively, manually copy
`MiHomeLogin.js` and the updated `MiHomeClient.js`.

Alternatively, manually copy these files into the same Scriptable folder:

- `MiHomeCore.js`
- `MiHomeClient.js`
- `MiHomeSetup.js`
- `MiHomeLogin.js`
- `MiHomeFeed.js`
- `MiHomeStats.js`
- `MiHomeWidget.js`

## Configuration

The easiest path for an existing CLI user is:

1. On the Mac, copy the contents of `~/.config/mihome/feeder.env`.
2. Let Universal Clipboard make it available on the iPhone.
3. Run `MiHomeSetup`.
4. Choose **Import JSON or feeder.env from Clipboard**.

The importer accepts either the CLI `feeder.env` format or JSON using the
following field names:

```json
{
  "ssecurity": "...",
  "serviceToken": "...",
  "yast": "...",
  "userId": "...",
  "passportDeviceId": "...",
  "deviceId": "...",
  "did": "...",
  "accessKey": "...",
  "feedSiid": 2,
  "feedAiid": 1,
  "feedActionDid": "",
  "region": "ES",
  "language": "ZH_CN",
  "appVersion": "11.3.203",
  "platformVersion": "18.7",
  "feedUrl": "https://de.core.api.io.mi.com/app/miotspec/action",
  "statsUrl": "https://de.api.io.mi.com/app/user/get_user_device_data",
  "defaultPortions": 1,
  "maxPortions": 4,
  "portionGrams": 5
}
```

The clipboard is cleared as soon as import begins, including when validation or
the connection test fails. A one-record stats request is used to test the
session before the configuration is saved. `MiHomeSetup` can also collect the
values through guided forms.

The initial setup still needs the device-specific values above. After that,
when the Xiaomi session expires, run `MiHomeLogin` directly on the iPhone. It
opens Xiaomi's account page in an in-app Safari view, requires the same Xiaomi
account as the stored configuration, verifies the refreshed session with a
one-record stats request, and only then replaces the session values in
Keychain. The device DID, access key, action IDs, and other settings are
preserved.

## Usage

### Login refresh

Run `MiHomeLogin` and finish signing in on Xiaomi's page. Xiaomi may label the
final page as a QR-code login confirmation even though browser login does not
display a QR code. Tap **Confirm Login** on that page, wait for the success
message, and only then tap **Done**. A successful refresh leaves all device and
feeder settings unchanged. If login, the account check, or the API verification
fails, the previous Keychain configuration remains in place.

### Feed

Run `MiHomeFeed` and choose the number of portions. A confirmation dialog is
always shown before the request is sent.

When used from Apple Shortcuts, pass a dictionary with an explicit confirmation:

```json
{ "portions": 1, "confirmed": true }
```

The script does not present alerts in Shortcuts/Siri. It returns a dictionary
containing `ok`, `portions`, and the Mi Home response. Requiring
`"confirmed": true` prevents an unattended Shortcut from feeding accidentally;
consider adding an **Ask for Confirmation** action before **Run Script** as an
additional safeguard.

### Stats

Run `MiHomeStats` to show today, yesterday, the last seven calendar days, the
current month, and daily details.

Apple Shortcuts may pass:

```json
{ "days": 30, "limit": 1000 }
```

`MiHomeStats` does not present alerts in Shortcuts/Siri and returns its result
as a dictionary for subsequent Shortcut actions.

### Widget

The iOS widget picker lists **Scriptable**, not individual script names:

1. Long-press the Home Screen and tap **+**.
2. Add a small or medium **Scriptable** widget.
3. Long-press the new widget, choose **Edit Widget**, and select `MiHomeWidget`
   under **Script**.

Small widgets show today's portions; medium widgets also show yesterday,
seven-day, and monthly totals. Tapping the widget opens `MiHomeStats`. Use
`MiHomeStats`, not `MiHomeWidget`, from Apple Shortcuts.

Widget refresh timing is controlled by iOS and is not guaranteed to occur at the
exact requested interval.

Stats requests use transport-level identity encoding and retry once only when
Xiaomi returns an intermittent raw response-format error. Feed actions,
decompression failures, and decoded-response errors are never retried.

## Compatibility

Scriptable does not proactively request MiOT GZIP because its networking stack
has shown inconsistent behavior with those responses. If Xiaomi sends an
encrypted GZIP response anyway, it is decompressed with the WebKit
`DecompressionStream` API through Scriptable's `WebView`.

The client is tailored to the same feeder event (`key: "4.2"`, portion property
`piid: 4`) and MIoT action shape as the Python implementation.
