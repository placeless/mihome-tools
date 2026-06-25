const core = importModule("MiHomeCore");

const CONFIG_KEY = "mihome-tools.config.v1";

const DEFAULT_CONFIG = {
  region: "ES",
  language: "ZH_CN",
  appVersion: "11.3.203",
  platformVersion: "18.7",
  feedUrl: "https://de.core.api.io.mi.com/app/miotspec/action",
  statsUrl: "https://de.api.io.mi.com/app/user/get_user_device_data",
  defaultPortions: 1,
  maxPortions: 4,
  portionGrams: 5,
};

class MiHomeError extends Error {
  constructor(message) {
    super(message);
    this.name = "MiHomeError";
  }
}

class MiHomeAuthenticationError extends MiHomeError {
  constructor(message) {
    super(message);
    this.name = "MiHomeAuthenticationError";
  }
}

function normalizeConfig(config) {
  const normalized = Object.assign({}, DEFAULT_CONFIG, config || {});
  normalized.defaultPortions = Number(normalized.defaultPortions);
  normalized.maxPortions = Number(normalized.maxPortions);
  normalized.portionGrams = Number(normalized.portionGrams);
  normalized.feedSiid = Number(normalized.feedSiid);
  normalized.feedAiid = Number(normalized.feedAiid);
  normalized.yast = normalized.yast || normalized.serviceToken;
  return normalized;
}

function loadConfig() {
  if (!Keychain.contains(CONFIG_KEY)) {
    throw new MiHomeError(
      "No Mi Home configuration found. Run MiHomeSetup first.",
    );
  }
  try {
    return normalizeConfig(JSON.parse(Keychain.get(CONFIG_KEY)));
  } catch (error) {
    throw new MiHomeError(`Stored configuration is invalid: ${error}`);
  }
}

function saveConfig(config) {
  const normalized = normalizeConfig(config);
  Keychain.set(CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

function clearConfig() {
  if (Keychain.contains(CONFIG_KEY)) {
    Keychain.remove(CONFIG_KEY);
  }
}

function randomBytes() {
  const hex = UUID.string().replace(/-/g, "");
  const bytes = [];
  for (let index = 0; index < 16; index += 1) {
    bytes.push(Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
  }
  return bytes;
}

function requireFields(config, fields) {
  const missing = fields.filter((field) => {
    const value = config[field];
    return (
      value === undefined ||
      value === null ||
      value === "" ||
      (typeof value === "number" && !Number.isFinite(value))
    );
  });
  if (missing.length > 0) {
    throw new MiHomeError(
      `Missing configuration value(s): ${missing.join(", ")}`,
    );
  }
}

function hostFromUrl(url) {
  const match = /^https:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(String(url || ""));
  if (!match) {
    throw new MiHomeError(`Mi Home URL must use HTTPS: ${url}`);
  }
  const host = match[1].toLowerCase();
  if (
    host.includes("@") ||
    host.includes(":") ||
    (host !== "api.io.mi.com" && !host.endsWith(".api.io.mi.com"))
  ) {
    throw new MiHomeError(
      `Mi Home URL must use a Xiaomi api.io.mi.com host: ${url}`,
    );
  }
  return host;
}

function buildHeaders(url, config) {
  const appVersionNumber = String(config.appVersion).replace(/\./g, "");
  const userAgent = config.userAgent ||
    `iOS-${config.platformVersion}-${config.appVersion}-iPad8,6--` +
      `${config.passportDeviceId}-${config.userId}-` +
      `${config.passportDeviceId}-mac`;

  const cookie = [
    `xm_geo=${config.region}`,
    "locale=zh_cn",
    `PassportDeviceId=${config.passportDeviceId}`,
    `serviceToken=${config.serviceToken}`,
    `userId=${config.userId}`,
    `yetAnotherServiceToken=${config.yast}`,
    `APPVERSION=${appVersionNumber}`,
    `DEVICEID=${config.deviceId}`,
    `IOSVERSION=${appVersionNumber}`,
    "ISIOS=1",
    "canary=1",
    "request_from=mihome_sdk",
    "sdk_version=42000",
    "xm_version=4.0",
    "xm_user_bucket=3",
  ].join("; ");

  return {
    "miot-encrypt-algorithm": "ENCRYPT-RC4",
    "content-type": "application/x-www-form-urlencoded",
    accept: "*/*",
    "accept-language": "en-US;q=1, es-US;q=0.9, es;q=0.8, zh-Hans-US;q=0.7",
    "domain-refer": hostFromUrl(url),
    "origin-from": "MiHome",
    "operate-common": [
      `_region=${config.region}`,
      `_language=${config.language}`,
      `_deviceId=${config.passportDeviceId}`,
      `_appVersion=${config.appVersion}`,
      "_platform=1",
      `_platformVersion=${config.platformVersion}`,
    ].join("&"),
    "x-xiaomi-protocal-flag-cli": "PROTOCAL-HTTP2",
    "user-agent": userAgent,
    cookie,
  };
}

function getHeader(headers, name) {
  const expected = name.toLowerCase();
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === expected) {
      return headers[key];
    }
  }
  return null;
}

async function gunzip(bytes) {
  const inputBase64 = core.base64Encode(bytes);
  const webView = new WebView();
  await webView.loadHTML("<!doctype html><meta charset='utf-8'>");

  const javaScript = `
    (async () => {
      try {
        if (typeof DecompressionStream === "undefined") {
          throw new Error(
            "This iOS WebView does not support gzip decompression"
          )
        }
        const encoded = ${JSON.stringify(inputBase64)}
        const binary = atob(encoded)
        const input = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) {
          input[i] = binary.charCodeAt(i)
        }
        const stream = new Blob([input])
          .stream()
          .pipeThrough(new DecompressionStream("gzip"))
        const output = new Uint8Array(await new Response(stream).arrayBuffer())
        let result = ""
        const chunkSize = 0x8000
        for (let i = 0; i < output.length; i += chunkSize) {
          result += String.fromCharCode(
            ...output.subarray(i, i + chunkSize)
          )
        }
        completion({ ok: true, base64: btoa(result) })
      } catch (error) {
        completion({ ok: false, error: String(error) })
      }
    })()
  `;

  const result = await webView.evaluateJavaScript(javaScript, true);
  if (!result || !result.ok) {
    throw new MiHomeError(
      `Could not decompress Mi Home response: ${
        result ? result.error : "unknown error"
      }`,
    );
  }
  return core.base64Decode(result.base64);
}

function errorMessage(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    return parsed && parsed.message ? String(parsed.message) : "";
  } catch (_error) {
    return "";
  }
}

async function parseResponse(data, headers, signedNonce) {
  const rawText = data.toRawString().trim();
  if (!rawText) {
    throw new MiHomeError("Mi Home returned an empty response");
  }

  if (rawText.startsWith("{") || rawText.startsWith("[")) {
    return JSON.parse(rawText);
  }

  let decrypted = core.decryptRc4Bytes(signedNonce, rawText);
  const encoding = getHeader(headers, "miot-content-encoding");
  if (encoding && String(encoding).toUpperCase() === "GZIP") {
    decrypted = await gunzip(decrypted);
  }
  return JSON.parse(core.utf8Decode(decrypted));
}

async function postJson(url, payload, config) {
  requireFields(config, [
    "ssecurity",
    "serviceToken",
    "userId",
    "passportDeviceId",
    "deviceId",
  ]);

  const headers = buildHeaders(url, config);
  const nonce = core.generateNonce(randomBytes());
  const encrypted = core.buildEncryptedBody(
    url,
    payload,
    config.ssecurity,
    nonce,
  );

  const request = new Request(url);
  request.method = "POST";
  request.headers = headers;
  request.body = core.formEncode(encrypted.body);
  request.timeoutInterval = 20;

  let data;
  try {
    data = await request.load();
  } catch (error) {
    throw new MiHomeError(`Mi Home request failed: ${error}`);
  }

  const response = request.response || {};
  const statusCode = Number(response.statusCode || 0);
  if (statusCode >= 400) {
    const rawText = data.toRawString();
    const message = errorMessage(rawText);
    if (
      statusCode === 401 &&
      (rawText.toLowerCase().includes("auth error") ||
        rawText.includes('"code":3'))
    ) {
      throw new MiHomeAuthenticationError(
        "Mi Home session expired. Import a refreshed session with MiHomeSetup.",
      );
    }
    throw new MiHomeError(
      `Mi Home returned HTTP ${statusCode}${message ? `: ${message}` : ""}`,
    );
  }

  return parseResponse(data, response.headers, encrypted.signedNonce);
}

async function feed(portions, suppliedConfig = null) {
  const config = normalizeConfig(suppliedConfig || loadConfig());
  requireFields(config, [
    "accessKey",
    "did",
    "feedSiid",
    "feedAiid",
    "feedUrl",
    "maxPortions",
  ]);

  const count = Number(portions);
  if (!Number.isInteger(count) || count < 1) {
    throw new MiHomeError("Portions must be a positive integer");
  }
  if (count > config.maxPortions) {
    throw new MiHomeError(
      `Portions must not exceed ${config.maxPortions} per request`,
    );
  }

  return postJson(
    config.feedUrl,
    {
      accessKey: config.accessKey,
      params: {
        did: config.feedActionDid || config.did,
        siid: config.feedSiid,
        aiid: config.feedAiid,
        in: [count],
      },
    },
    config,
  );
}

async function stats(days = 7, limit = 200, suppliedConfig = null) {
  const config = normalizeConfig(suppliedConfig || loadConfig());
  requireFields(config, ["accessKey", "did", "userId", "statsUrl"]);

  const dayCount = Number(days);
  const resultLimit = Number(limit);
  if (!Number.isInteger(dayCount) || dayCount < 0) {
    throw new MiHomeError("Days must be zero or greater");
  }
  if (!Number.isInteger(resultLimit) || resultLimit < 1) {
    throw new MiHomeError("Limit must be a positive integer");
  }

  const now = Math.floor(Date.now() / 1000);
  return postJson(
    config.statsUrl,
    {
      uid: config.userId,
      did: config.did,
      time_start: dayCount <= 0 ? 0 : now - dayCount * 86400,
      time_end: now,
      limit: resultLimit,
      accessKey: config.accessKey,
      key: "4.2",
      group: "raw",
      type: "event",
    },
    config,
  );
}

function summarizeStatsResponse(response, now = new Date()) {
  if (
    !response ||
    typeof response !== "object" ||
    response.code !== 0 ||
    !Array.isArray(response.result)
  ) {
    const message = response && response.message ? `: ${response.message}` : "";
    throw new MiHomeError(`Mi Home stats request was unsuccessful${message}`);
  }
  return core.summarizeRecords(response.result, now);
}

module.exports = {
  CONFIG_KEY,
  DEFAULT_CONFIG,
  MiHomeAuthenticationError,
  MiHomeError,
  clearConfig,
  feed,
  loadConfig,
  normalizeConfig,
  postJson,
  saveConfig,
  stats,
  summarizeStatsResponse,
};
