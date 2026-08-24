const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const scriptDirectory = path.resolve(__dirname, "..");

async function runScript(name, modules, options = {}) {
  const source = fs.readFileSync(path.join(scriptDirectory, name), "utf8");
  const output = { completed: false, shortcut: null };
  const Script = {
    complete: () => {
      output.completed = true;
    },
    setShortcutOutput: (value) => {
      output.shortcut = value;
    },
    setWidget: () => {
      throw new Error("Widget output was not expected");
    },
  };
  class UnsupportedAlert {
    constructor() {
      throw new Error("Alert must not be created in Shortcuts/Siri");
    }
  }
  const execute = new AsyncFunction(
    "importModule",
    "args",
    "config",
    "Alert",
    "QuickLook",
    "Script",
    source,
  );
  await execute(
    (moduleName) => modules[moduleName],
    options.args || {
      shortcutParameter: null,
      queryParameters: {},
      widgetParameter: null,
    },
    options.config || {
      runsInApp: false,
      runsInActionExtension: false,
      runsWithSiri: true,
      runsInWidget: false,
    },
    UnsupportedAlert,
    {
      present: () => {
        throw new Error("QuickLook must not be used in Shortcuts/Siri");
      },
    },
    Script,
  );
  return output;
}

test("stats returns Shortcut output without presenting UI", async () => {
  const client = {
    isInteractiveContext: () => false,
    loadConfig: () => ({ portionGrams: 5 }),
    stats: async () => ({ code: 0, result: [] }),
    summarizeStatsResponse: () => ({
      feedToday: 0,
      feedYesterday: 0,
      feedWeek: 0,
      feedMonth: 0,
      daily: {},
    }),
  };

  const output = await runScript("MiHomeStats.js", { MiHomeClient: client });

  assert.equal(output.completed, true);
  assert.deepEqual(output.shortcut, {
    ok: true,
    days: 7,
    limit: 200,
    truncated: false,
    summary: {
      feedToday: 0,
      feedYesterday: 0,
      feedWeek: 0,
      feedMonth: 0,
      daily: {},
    },
  });
});

test("confirmed Shortcut feeding runs once without presenting UI", async () => {
  let feedCalls = 0;
  const client = {
    isInteractiveContext: () => false,
    isShortcutContext: () => true,
    loadConfig: () => ({ maxPortions: 4, portionGrams: 5 }),
    shortcutFeedPortions: (parameter) => {
      assert.deepEqual(parameter, { portions: 1, confirmed: true });
      return 1;
    },
    feed: async () => {
      feedCalls += 1;
      return { code: 0, message: "ok", result: {} };
    },
  };
  const core = { isOkFeedResponse: () => true };

  const output = await runScript(
    "MiHomeFeed.js",
    { MiHomeClient: client, MiHomeCore: core },
    {
      args: {
        shortcutParameter: { portions: 1, confirmed: true },
        queryParameters: {},
        widgetParameter: null,
      },
    },
  );

  assert.equal(feedCalls, 1);
  assert.equal(output.completed, true);
  assert.equal(output.shortcut.ok, true);
  assert.equal(output.shortcut.portions, 1);
});

test("unconfirmed Shortcut feeding is rejected before the request", async () => {
  let feedCalls = 0;
  const client = {
    isInteractiveContext: () => false,
    isShortcutContext: () => true,
    loadConfig: () => ({ maxPortions: 4, portionGrams: 5 }),
    shortcutFeedPortions: () => {
      throw new Error('Shortcut feeding requires "confirmed": true');
    },
    feed: async () => {
      feedCalls += 1;
      return {};
    },
  };

  const output = await runScript(
    "MiHomeFeed.js",
    { MiHomeClient: client, MiHomeCore: { isOkFeedResponse: () => false } },
    {
      args: {
        shortcutParameter: { portions: 1 },
        queryParameters: {},
        widgetParameter: null,
      },
    },
  );

  assert.equal(feedCalls, 0);
  assert.equal(output.completed, true);
  assert.equal(output.shortcut.ok, false);
  assert.match(output.shortcut.error, /confirmed/);
});

test("interactive login verifies before replacing the stored session", async () => {
  const source = fs.readFileSync(
    path.join(scriptDirectory, "MiHomeLogin.js"),
    "utf8",
  );
  const events = [];
  const existing = {
    userId: "user-id",
    language: "ZH_CN",
    did: "device-did",
    passportDeviceId: "old-passport-device",
  };
  const refreshedSession = {
    userId: "user-id",
    ssecurity: "new-security",
    serviceToken: "new-token",
    yast: "new-token",
    passportDeviceId: "new-passport-device",
  };
  let saved = null;
  let resolveLogin;
  const client = {
    loadConfig: () => existing,
    startXiaomiLogin: async (language) => {
      assert.equal(language, "ZH_CN");
      events.push("start");
      return {
        loginUrl: "https://account.xiaomi.com/login",
        pollUrl: "poll",
        timeout: 300,
      };
    },
    finishXiaomiLogin: async (login, expectedUserId) => {
      assert.equal(login.pollUrl, "poll");
      assert.equal(expectedUserId, "user-id");
      events.push("poll");
      return new Promise((resolve) => {
        resolveLogin = () => resolve(refreshedSession);
      });
    },
    normalizeConfig: (value) => value,
    stats: async (_days, _limit, configValue) => {
      assert.equal(configValue.did, "device-did");
      assert.equal(configValue.serviceToken, "new-token");
      events.push("verify");
      return { code: 0, result: [] };
    },
    saveConfig: (value) => {
      events.push("save");
      saved = value;
    },
  };
  class FakeAlert {
    addAction() {}

    addCancelAction() {}

    async presentAlert() {
      return 0;
    }
  }
  const Safari = {
    openInApp: async (url, fullscreen) => {
      assert.equal(url, "https://account.xiaomi.com/login");
      assert.equal(fullscreen, true);
      events.push("safari");
      resolveLogin();
    },
  };
  let completed = false;
  const execute = new AsyncFunction(
    "importModule",
    "Alert",
    "Safari",
    "Script",
    source,
  );

  await execute(
    (name) => {
      assert.equal(name, "MiHomeClient");
      return client;
    },
    FakeAlert,
    Safari,
    { complete: () => (completed = true) },
  );

  assert.equal(completed, true);
  assert.deepEqual(events, [
    "start",
    "poll",
    "safari",
    "verify",
    "save",
  ]);
  assert.equal(saved.did, "device-did");
  assert.equal(saved.passportDeviceId, "new-passport-device");
});
