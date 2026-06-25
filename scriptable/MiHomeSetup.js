const client = importModule("MiHomeClient");
const core = importModule("MiHomeCore");

function showMessage(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("OK");
  return alert.presentAlert();
}

function currentConfig() {
  try {
    return client.loadConfig();
  } catch (_error) {
    return client.normalizeConfig({});
  }
}

function validateConfig(config) {
  const required = [
    "ssecurity",
    "serviceToken",
    "userId",
    "passportDeviceId",
    "deviceId",
    "did",
    "accessKey",
    "feedSiid",
    "feedAiid",
  ];
  const missing = required.filter((key) => {
    const value = config[key];
    return value === undefined || value === null || value === "";
  });
  if (missing.length > 0) {
    throw new Error(`Missing value(s): ${missing.join(", ")}`);
  }
  core.base64Decode(config.ssecurity);
  if (!Number.isInteger(Number(config.feedSiid))) {
    throw new Error("feedSiid must be an integer");
  }
  if (!Number.isInteger(Number(config.feedAiid))) {
    throw new Error("feedAiid must be an integer");
  }
  if (
    !Number.isInteger(Number(config.defaultPortions)) ||
    Number(config.defaultPortions) < 1
  ) {
    throw new Error("defaultPortions must be a positive integer");
  }
  if (
    !Number.isInteger(Number(config.maxPortions)) ||
    Number(config.maxPortions) < Number(config.defaultPortions)
  ) {
    throw new Error(
      "maxPortions must be an integer no smaller than defaultPortions",
    );
  }
}

async function promptFields(title, message, fields) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  for (const field of fields) {
    if (field.secure) {
      alert.addSecureTextField(field.label, String(field.value || ""));
    } else {
      alert.addTextField(field.label, String(field.value || ""));
    }
  }
  alert.addAction("Continue");
  alert.addCancelAction("Cancel");
  const choice = await alert.presentAlert();
  if (choice === -1) {
    return null;
  }
  const values = {};
  fields.forEach((field, index) => {
    values[field.key] = alert.textFieldValue(index).trim();
  });
  return values;
}

async function guidedSetup(existing) {
  let config = Object.assign({}, existing);

  const session = await promptFields(
    "Mi Home session",
    "These values are stored only in Scriptable Keychain.",
    [
      {
        key: "ssecurity",
        label: "ssecurity",
        value: config.ssecurity,
        secure: true,
      },
      {
        key: "serviceToken",
        label: "serviceToken",
        value: config.serviceToken,
        secure: true,
      },
      {
        key: "yast",
        label: "yetAnotherServiceToken (optional)",
        value: config.yast || config.serviceToken,
        secure: true,
      },
      { key: "userId", label: "userId", value: config.userId },
      {
        key: "passportDeviceId",
        label: "PassportDeviceId",
        value: config.passportDeviceId,
      },
    ],
  );
  if (!session) {
    return null;
  }
  config = Object.assign(config, session);

  const device = await promptFields(
    "Device",
    "Values for the feeder registered in Mi Home.",
    [
      { key: "deviceId", label: "DEVICEID", value: config.deviceId },
      { key: "did", label: "did", value: config.did },
      {
        key: "accessKey",
        label: "accessKey",
        value: config.accessKey,
        secure: true,
      },
    ],
  );
  if (!device) {
    return null;
  }
  config = Object.assign(config, device);

  const action = await promptFields(
    "Feed action",
    "Use the SIID and AIID captured for your feeder action.",
    [
      { key: "feedSiid", label: "Feed SIID", value: config.feedSiid },
      { key: "feedAiid", label: "Feed AIID", value: config.feedAiid },
      {
        key: "feedActionDid",
        label: "Action DID (optional)",
        value: config.feedActionDid,
      },
      {
        key: "defaultPortions",
        label: "Default portions",
        value: config.defaultPortions,
      },
      {
        key: "maxPortions",
        label: "Maximum portions",
        value: config.maxPortions,
      },
    ],
  );
  if (!action) {
    return null;
  }
  config = Object.assign(config, action);

  const endpoints = await promptFields(
    "Region and endpoints",
    "Defaults match the Europe setup used by this project.",
    [
      { key: "region", label: "Region", value: config.region },
      { key: "language", label: "Language", value: config.language },
      {
        key: "appVersion",
        label: "Mi Home app version",
        value: config.appVersion,
      },
      { key: "feedUrl", label: "Feed URL", value: config.feedUrl },
      { key: "statsUrl", label: "Stats URL", value: config.statsUrl },
    ],
  );
  if (!endpoints) {
    return null;
  }
  return Object.assign(config, endpoints);
}

async function testConnection(config) {
  const response = await client.stats(1, 1, config);
  const summary = client.summarizeStatsResponse(response);
  return summary;
}

async function showConnectionSuccess(summary) {
  await showMessage(
    "Connection successful",
    `Today: ${summary.feedToday} portion(s)`,
  );
}

async function importClipboard(existing) {
  const clipboardText = Pasteboard.pasteString();
  Pasteboard.copyString("");
  const imported = core.parseConfigText(clipboardText);
  const config = client.normalizeConfig(Object.assign({}, existing, imported));
  validateConfig(config);
  const summary = await testConnection(config);
  client.saveConfig(config);
  await showMessage(
    "Configuration saved",
    `Credentials were stored in Keychain, the clipboard was cleared, and ` +
      `the connection succeeded. Today: ${summary.feedToday} portion(s).`,
  );
  return config;
}

async function main() {
  const existing = currentConfig();
  const menu = new Alert();
  menu.title = "Mi Home setup";
  menu.message = Keychain.contains(client.CONFIG_KEY)
    ? "A configuration already exists."
    : "No configuration is stored yet.";
  menu.addAction("Import JSON or feeder.env from Clipboard");
  menu.addAction("Guided setup");
  menu.addAction("Test stored configuration");
  menu.addDestructiveAction("Delete stored configuration");
  menu.addCancelAction("Cancel");

  const choice = await menu.presentSheet();
  try {
    if (choice === 0) {
      await importClipboard(existing);
    } else if (choice === 1) {
      const config = await guidedSetup(existing);
      if (!config) {
        return;
      }
      validateConfig(config);
      const summary = await testConnection(config);
      client.saveConfig(config);
      await showMessage(
        "Configuration saved",
        `Credentials are stored in Scriptable Keychain. ` +
          `Today: ${summary.feedToday} portion(s).`,
      );
    } else if (choice === 2) {
      const summary = await testConnection(client.loadConfig());
      await showConnectionSuccess(summary);
    } else if (choice === 3) {
      client.clearConfig();
      await showMessage("Configuration deleted", "Keychain entry removed.");
    }
  } catch (error) {
    await showMessage("Setup failed", String(error.message || error));
  }
}

await main();
Script.complete();
