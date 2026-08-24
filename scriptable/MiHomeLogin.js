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
    "A Xiaomi login page will open in Safari. Sign in to the same account, " +
    "finish any verification, then tap Confirm Login on Xiaomi's login " +
    "confirmation page. Tap Done only after Xiaomi reports success. Your " +
    "existing session is kept unless the refreshed session passes a Mi Home " +
    "API test.";
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
    const completion = client.finishXiaomiLogin(login, existing.userId).then(
      (session) => ({ session }),
      (error) => ({ error }),
    );
    await Safari.openInApp(login.loginUrl, true);

    const result = await completion;
    if (result.error) {
      throw result.error;
    }
    const refreshedSession = result.session;
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
