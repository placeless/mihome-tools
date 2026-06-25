const assert = require("node:assert/strict");
const test = require("node:test");
const zlib = require("node:zlib");

const core = require("../MiHomeCore");

global.importModule = (name) => {
  assert.equal(name, "MiHomeCore");
  return core;
};

const keychainValues = new Map();
global.Keychain = {
  contains: (key) => keychainValues.has(key),
  get: (key) => keychainValues.get(key),
  remove: (key) => keychainValues.delete(key),
  set: (key, value) => keychainValues.set(key, value),
};

global.UUID = {
  string: () => "00010203-0405-0607-0809-0a0b0c0d0e0f",
};

global.Timer = {
  schedule: (_milliseconds, _repeats, callback) => {
    callback();
    return {};
  },
};

global.WebView = class {
  async loadHTML() {}

  async evaluateJavaScript(source) {
    const match = /const encoded = ("(?:[^"\\]|\\.)*")/.exec(source);
    assert.ok(match);
    const compressed = Buffer.from(JSON.parse(match[1]), "base64");
    return {
      ok: true,
      base64: zlib.gunzipSync(compressed).toString("base64"),
    };
  }
};

class FakeData {
  constructor(text) {
    this.text = text;
  }

  toRawString() {
    return this.text;
  }
}

class FakeRequest {
  static instances = [];
  static responseStatus = 200;
  static responseText = '{"code":0,"result":[]}';
  static responseFactory = null;
  static responseHeaders = { "Content-Type": "application/json" };

  constructor(url) {
    this.url = url;
    this.response = null;
    FakeRequest.instances.push(this);
  }

  async load() {
    this.response = {
      statusCode: FakeRequest.responseStatus,
      headers: FakeRequest.responseHeaders,
    };
    const text = FakeRequest.responseFactory
      ? FakeRequest.responseFactory(this)
      : FakeRequest.responseText;
    return new FakeData(text);
  }
}

global.Request = FakeRequest;

const client = require("../MiHomeClient");

function sampleConfig() {
  return {
    ssecurity: "c2VjdXJpdHktMTIzNDU2Nw==",
    serviceToken: "service-token",
    yast: "service-token",
    userId: "user-id",
    passportDeviceId: "passport-device",
    deviceId: "device-id",
    did: "did",
    accessKey: "access-key",
    feedSiid: 2,
    feedAiid: 1,
  };
}

test("configuration is normalized and stored in Keychain", () => {
  keychainValues.clear();
  const saved = client.saveConfig(sampleConfig());
  assert.equal(saved.region, "ES");
  assert.equal(saved.maxPortions, 4);
  assert.deepEqual(client.loadConfig(), saved);
  client.clearConfig();
  assert.equal(Keychain.contains(client.CONFIG_KEY), false);
});

test("plain JSON API response is parsed and request body is encrypted", async () => {
  FakeRequest.instances.length = 0;
  FakeRequest.responseStatus = 200;
  FakeRequest.responseText = '{"code":0,"result":[]}';
  FakeRequest.responseFactory = null;
  FakeRequest.responseHeaders = { "Content-Type": "application/json" };

  const response = await client.stats(7, 200, sampleConfig());

  assert.deepEqual(response, { code: 0, result: [] });
  const request = FakeRequest.instances.at(-1);
  assert.equal(request.method, "POST");
  assert.equal(
    request.url,
    "https://de.api.io.mi.com/app/user/get_user_device_data",
  );
  assert.equal(request.headers["accept-encoding"], "identity");
  assert.equal(request.headers["miot-accept-encoding"], "GZIP");
  assert.match(request.headers.cookie, /serviceToken=service-token/);
  assert.doesNotMatch(request.body, /access-key/);
  assert.match(request.body, /signature=/);
});

test("401 auth error becomes an actionable authentication error", async () => {
  FakeRequest.responseStatus = 401;
  FakeRequest.responseText = '{"code":3,"message":"auth error"}';
  FakeRequest.responseFactory = null;

  await assert.rejects(
    () => client.stats(1, 1, sampleConfig()),
    (error) =>
      error.name === "MiHomeAuthenticationError" &&
      error.message.includes("MiHomeSetup"),
  );
});

test("requests reject non-HTTPS and non-Xiaomi endpoints", async () => {
  FakeRequest.responseFactory = null;
  for (
    const statsUrl of [
      "http://de.api.io.mi.com/app/user/get_user_device_data",
      "https://example.com/app/user/get_user_device_data",
      "https://de.api.io.mi.com@example.com/app/user/get_user_device_data",
    ]
  ) {
    FakeRequest.instances.length = 0;
    await assert.rejects(
      () => client.stats(1, 1, Object.assign(sampleConfig(), { statsUrl })),
      (error) =>
        error.name === "MiHomeError" &&
        error.message.includes(
          statsUrl.startsWith("http:") ? "must use HTTPS" : "must use a Xiaomi",
        ),
    );
    assert.equal(FakeRequest.instances.length, 0);
  }
});

test("JSON-wrapped encrypted responses are decoded", async () => {
  FakeRequest.responseStatus = 200;
  FakeRequest.responseHeaders = { "Content-Type": "text/plain" };
  FakeRequest.responseFactory = (request) => {
    const form = new URLSearchParams(request.body);
    const nonce = form.get("_nonce");
    const signedNonce = core.signedNonce(sampleConfig().ssecurity, nonce);
    const encrypted = core.encryptRc4(
      signedNonce,
      '{"code":0,"message":"ok","result":{}}',
    );
    return JSON.stringify(encrypted);
  };

  const response = await client.feed(1, sampleConfig());

  assert.deepEqual(response, { code: 0, message: "ok", result: {} });
});

test("prefixed JSON and unpadded encrypted responses are decoded", async () => {
  FakeRequest.responseStatus = 200;
  FakeRequest.responseHeaders = { "Content-Type": "text/plain" };
  FakeRequest.responseText = '&&&START&&&{"code":0,"result":[]}';
  FakeRequest.responseFactory = null;
  assert.deepEqual(await client.stats(1, 1, sampleConfig()), {
    code: 0,
    result: [],
  });

  FakeRequest.responseFactory = (request) => {
    const form = new URLSearchParams(request.body);
    const nonce = form.get("_nonce");
    const signedNonce = core.signedNonce(sampleConfig().ssecurity, nonce);
    return core
      .encryptRc4(signedNonce, '{"code":0,"result":[]}')
      .replace(/=+$/, "");
  };
  assert.deepEqual(await client.stats(1, 1, sampleConfig()), {
    code: 0,
    result: [],
  });
});

test("stats retries one transient response-format failure", async () => {
  FakeRequest.instances.length = 0;
  FakeRequest.responseStatus = 200;
  FakeRequest.responseHeaders = { "Content-Type": "text/plain" };
  FakeRequest.responseFactory = () =>
    FakeRequest.instances.length === 1
      ? "temporary upstream response"
      : '{"code":0,"result":[]}';

  assert.deepEqual(await client.stats(7, 200, sampleConfig()), {
    code: 0,
    result: [],
  });
  assert.equal(FakeRequest.instances.length, 2);
});

test("feed never retries a response-format failure", async () => {
  FakeRequest.instances.length = 0;
  FakeRequest.responseStatus = 200;
  FakeRequest.responseHeaders = { "Content-Type": "text/plain" };
  FakeRequest.responseFactory = () => "temporary upstream response";

  await assert.rejects(
    () => client.feed(1, sampleConfig()),
    (error) => error.name === "MiHomeResponseError",
  );
  assert.equal(FakeRequest.instances.length, 1);
});

test("MiOT GZIP encrypted responses are decoded", async () => {
  FakeRequest.responseStatus = 200;
  FakeRequest.responseHeaders = {
    "Content-Type": "text/plain",
    "miot-content-encoding": "GZIP",
  };
  FakeRequest.responseFactory = (request) => {
    const form = new URLSearchParams(request.body);
    const nonce = form.get("_nonce");
    const signedNonce = core.signedNonce(sampleConfig().ssecurity, nonce);
    const compressed = zlib.gzipSync('{"code":0,"result":[]}');
    return core.base64Encode(core.rc4Crypt(signedNonce, [...compressed]));
  };

  assert.deepEqual(await client.stats(7, 200, sampleConfig()), {
    code: 0,
    result: [],
  });
});
