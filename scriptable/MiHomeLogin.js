const client = importModule("MiHomeClient");

function showMessage(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("OK");
  return alert.presentAlert();
}

async function confirmLogin() {
  const alert = new Alert();
  alert.title = "Refresh Mi Home login";
  alert.message =
    "A Xiaomi login page will open. Sign in to the same account, finish any " +
    "verification, then tap Done when Xiaomi reports success. Your existing " +
    "session is kept unless the refreshed session passes a Mi Home API test.";
  alert.addAction("Open Xiaomi login");
  alert.addCancelAction("Cancel");
  return (await alert.presentAlert()) === 0;
}

async function main() {
  let existing;
  try {
    existing = client.loadConfig();
  } catch (_error) {
    await showMessage(
      "Setup required",
      "Run MiHomeSetup once before using MiHomeLogin.",
    );
    return;
  }

  if (!(await confirmLogin())) {
    return;
  }

  try {
    const login = await client.startXiaomiLogin(existing.language);
    const webView = new WebView();
    await webView.loadURL(login.loginUrl);
    await webView.present(true);

    const refreshedSession = await client.finishXiaomiLogin(
      login,
      existing.userId,
    );
    if (!refreshedSession.passportDeviceId) {
      delete refreshedSession.passportDeviceId;
    }
    const refreshed = client.normalizeConfig(
      Object.assign({}, existing, refreshedSession),
    );
    await client.stats(1, 1, refreshed);
    client.saveConfig(refreshed);
    await showMessage(
      "Login refreshed",
      "The new Xiaomi session was verified and saved in Scriptable Keychain.",
    );
  } catch (error) {
    await showMessage(
      "Login not changed",
      String(error.message || error),
    );
  }
}

await main();
Script.complete();
