// Portable Mi Home protocol helpers.
// This module intentionally has no Scriptable or Node.js dependencies.

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const ENV_CONFIG_MAP = {
  MIHOME_SSECURITY: "ssecurity",
  MIHOME_SERVICE_TOKEN: "serviceToken",
  MIHOME_YAST: "yast",
  MIHOME_USER_ID: "userId",
  MIHOME_PASSPORT_DEVICE_ID: "passportDeviceId",
  MIHOME_DEVICE_ID: "deviceId",
  MIHOME_DID: "did",
  MIHOME_ACCESS_KEY: "accessKey",
  MIHOME_REGION: "region",
  REGION: "region",
  MIHOME_LANGUAGE: "language",
  LANGUAGE: "language",
  MIHOME_APP_VERSION: "appVersion",
  MIHOME_PLATFORM_VERSION: "platformVersion",
  PLATFORM_VERSION: "platformVersion",
  MIHOME_USER_AGENT: "userAgent",
  MIHOME_FEED_URL: "feedUrl",
  MIHOME_FEED_STATS_URL: "statsUrl",
  MIHOME_FEED_SIID: "feedSiid",
  MIHOME_FEED_AIID: "feedAiid",
  MIHOME_FEED_ACTION_DID: "feedActionDid",
  MIHOME_FEED_DEFAULT_PORTIONS: "defaultPortions",
  MIHOME_FEED_MAX_PORTIONS: "maxPortions",
};

function unquoteShellValue(rawValue) {
  const value = rawValue.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  ) {
    return value.slice(1, -1);
  }
  return value.replace(/\s+#.*$/, "").trim();
}

function parseEnvironmentConfig(text) {
  const parsed = {};
  for (const originalLine of text.split(/\r?\n/)) {
    let line = originalLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("export ")) {
      line = line.slice(7).trim();
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match || !ENV_CONFIG_MAP[match[1]]) {
      continue;
    }
    parsed[ENV_CONFIG_MAP[match[1]]] = unquoteShellValue(match[2]);
  }
  return parsed;
}

function parseConfigText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Configuration text is empty");
  }
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  const parsed = parseEnvironmentConfig(trimmed);
  if (Object.keys(parsed).length === 0) {
    throw new Error("Text is neither config JSON nor feeder.env content");
  }
  return parsed;
}

function utf8Encode(text) {
  const bytes = [];
  for (let index = 0; index < text.length; index += 1) {
    let codePoint = text.codePointAt(index);
    if (codePoint > 0xffff) {
      index += 1;
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >>> 6));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >>> 12));
      bytes.push(0x80 | ((codePoint >>> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(0xf0 | (codePoint >>> 18));
      bytes.push(0x80 | ((codePoint >>> 12) & 0x3f));
      bytes.push(0x80 | ((codePoint >>> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    }
  }
  return bytes;
}

function utf8Decode(bytes) {
  let text = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const first = bytes[index];
    let codePoint;
    let continuationCount;

    if (first <= 0x7f) {
      codePoint = first;
      continuationCount = 0;
    } else if ((first & 0xe0) === 0xc0) {
      codePoint = first & 0x1f;
      continuationCount = 1;
    } else if ((first & 0xf0) === 0xe0) {
      codePoint = first & 0x0f;
      continuationCount = 2;
    } else if ((first & 0xf8) === 0xf0) {
      codePoint = first & 0x07;
      continuationCount = 3;
    } else {
      text += "\ufffd";
      continue;
    }

    if (index + continuationCount >= bytes.length) {
      text += "\ufffd";
      break;
    }

    let valid = true;
    for (let offset = 1; offset <= continuationCount; offset += 1) {
      const next = bytes[index + offset];
      if ((next & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      codePoint = (codePoint << 6) | (next & 0x3f);
    }

    if (!valid || codePoint > 0x10ffff) {
      text += "\ufffd";
      continue;
    }

    index += continuationCount;
    if (codePoint <= 0xffff) {
      text += String.fromCharCode(codePoint);
    } else {
      codePoint -= 0x10000;
      text += String.fromCharCode(
        0xd800 | (codePoint >>> 10),
        0xdc00 | (codePoint & 0x3ff),
      );
    }
  }
  return text;
}

function base64Encode(bytes) {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const combined = (first << 16) | (second << 8) | third;

    encoded += BASE64_ALPHABET[(combined >>> 18) & 0x3f];
    encoded += BASE64_ALPHABET[(combined >>> 12) & 0x3f];
    encoded += index + 1 < bytes.length
      ? BASE64_ALPHABET[(combined >>> 6) & 0x3f]
      : "=";
    encoded += index + 2 < bytes.length
      ? BASE64_ALPHABET[combined & 0x3f]
      : "=";
  }
  return encoded;
}

function base64Decode(encoded) {
  const cleaned = encoded.replace(/\s+/g, "");
  if (cleaned.length % 4 !== 0) {
    throw new Error("Invalid base64 length");
  }

  const bytes = [];
  for (let index = 0; index < cleaned.length; index += 4) {
    const chars = cleaned.slice(index, index + 4);
    const values = [];
    for (const char of chars) {
      if (char === "=") {
        values.push(0);
      } else {
        const value = BASE64_ALPHABET.indexOf(char);
        if (value < 0) {
          throw new Error("Invalid base64 character");
        }
        values.push(value);
      }
    }

    const combined = (values[0] << 18) |
      (values[1] << 12) |
      (values[2] << 6) |
      values[3];
    bytes.push((combined >>> 16) & 0xff);
    if (chars[2] !== "=") {
      bytes.push((combined >>> 8) & 0xff);
    }
    if (chars[3] !== "=") {
      bytes.push(combined & 0xff);
    }
  }
  return bytes;
}

function concatBytes(...parts) {
  const result = [];
  for (const part of parts) {
    result.push(...part);
  }
  return result;
}

function wordsToBytes(words) {
  const bytes = [];
  for (const word of words) {
    bytes.push((word >>> 24) & 0xff);
    bytes.push((word >>> 16) & 0xff);
    bytes.push((word >>> 8) & 0xff);
    bytes.push(word & 0xff);
  }
  return bytes;
}

function appendBitLength(bytes, bitLength) {
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  bytes.push((high >>> 24) & 0xff);
  bytes.push((high >>> 16) & 0xff);
  bytes.push((high >>> 8) & 0xff);
  bytes.push(high & 0xff);
  bytes.push((low >>> 24) & 0xff);
  bytes.push((low >>> 16) & 0xff);
  bytes.push((low >>> 8) & 0xff);
  bytes.push(low & 0xff);
}

function rotateLeft(value, count) {
  return ((value << count) | (value >>> (32 - count))) >>> 0;
}

function rotateRight(value, count) {
  return ((value >>> count) | (value << (32 - count))) >>> 0;
}

function sha1(bytes) {
  const padded = bytes.slice();
  const bitLength = bytes.length * 8;
  padded.push(0x80);
  while (padded.length % 64 !== 56) {
    padded.push(0);
  }
  appendBitLength(padded, bitLength);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let block = 0; block < padded.length; block += 64) {
    const words = new Array(80);
    for (let index = 0; index < 16; index += 1) {
      const offset = block + index * 4;
      words[index] = ((padded[offset] << 24) |
        (padded[offset + 1] << 16) |
        (padded[offset + 2] << 8) |
        padded[offset + 3]) >>>
        0;
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(
        words[index - 3] ^
          words[index - 8] ^
          words[index - 14] ^
          words[index - 16],
        1,
      );
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      let f;
      let constant;
      if (index < 20) {
        f = (b & c) | (~b & d);
        constant = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        constant = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        constant = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        constant = 0xca62c1d6;
      }

      const temporary = (rotateLeft(a, 5) + f + e + constant + words[index]) >>>
        0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temporary;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return wordsToBytes([h0, h1, h2, h3, h4]);
}

const SHA256_CONSTANTS = [
  0x428a2f98,
  0x71374491,
  0xb5c0fbcf,
  0xe9b5dba5,
  0x3956c25b,
  0x59f111f1,
  0x923f82a4,
  0xab1c5ed5,
  0xd807aa98,
  0x12835b01,
  0x243185be,
  0x550c7dc3,
  0x72be5d74,
  0x80deb1fe,
  0x9bdc06a7,
  0xc19bf174,
  0xe49b69c1,
  0xefbe4786,
  0x0fc19dc6,
  0x240ca1cc,
  0x2de92c6f,
  0x4a7484aa,
  0x5cb0a9dc,
  0x76f988da,
  0x983e5152,
  0xa831c66d,
  0xb00327c8,
  0xbf597fc7,
  0xc6e00bf3,
  0xd5a79147,
  0x06ca6351,
  0x14292967,
  0x27b70a85,
  0x2e1b2138,
  0x4d2c6dfc,
  0x53380d13,
  0x650a7354,
  0x766a0abb,
  0x81c2c92e,
  0x92722c85,
  0xa2bfe8a1,
  0xa81a664b,
  0xc24b8b70,
  0xc76c51a3,
  0xd192e819,
  0xd6990624,
  0xf40e3585,
  0x106aa070,
  0x19a4c116,
  0x1e376c08,
  0x2748774c,
  0x34b0bcb5,
  0x391c0cb3,
  0x4ed8aa4a,
  0x5b9cca4f,
  0x682e6ff3,
  0x748f82ee,
  0x78a5636f,
  0x84c87814,
  0x8cc70208,
  0x90befffa,
  0xa4506ceb,
  0xbef9a3f7,
  0xc67178f2,
];

function sha256(bytes) {
  const padded = bytes.slice();
  const bitLength = bytes.length * 8;
  padded.push(0x80);
  while (padded.length % 64 !== 56) {
    padded.push(0);
  }
  appendBitLength(padded, bitLength);

  const hash = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ];

  for (let block = 0; block < padded.length; block += 64) {
    const words = new Array(64);
    for (let index = 0; index < 16; index += 1) {
      const offset = block + index * 4;
      words[index] = ((padded[offset] << 24) |
        (padded[offset + 1] << 16) |
        (padded[offset + 2] << 8) |
        padded[offset + 3]) >>>
        0;
    }
    for (let index = 16; index < 64; index += 1) {
      const value15 = words[index - 15];
      const value2 = words[index - 2];
      const sigma0 = rotateRight(value15, 7) ^ rotateRight(value15, 18) ^
        (value15 >>> 3);
      const sigma1 = rotateRight(value2, 17) ^ rotateRight(value2, 19) ^
        (value2 >>> 10);
      words[index] =
        (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 =
        (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return wordsToBytes(hash);
}

function rc4Crypt(keyBase64, dataBytes) {
  const key = base64Decode(keyBase64);
  if (key.length === 0) {
    throw new Error("RC4 key cannot be empty");
  }

  const state = Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let index = 0; index < 256; index += 1) {
    j = (j + state[index] + key[index % key.length]) % 256;
    [state[index], state[j]] = [state[j], state[index]];
  }

  let i = 0;
  j = 0;
  for (let drop = 0; drop < 1024; drop += 1) {
    i = (i + 1) % 256;
    j = (j + state[i]) % 256;
    [state[i], state[j]] = [state[j], state[i]];
  }

  const output = [];
  for (const byte of dataBytes) {
    i = (i + 1) % 256;
    j = (j + state[i]) % 256;
    [state[i], state[j]] = [state[j], state[i]];
    output.push(byte ^ state[(state[i] + state[j]) % 256]);
  }
  return output;
}

function encryptRc4(keyBase64, text) {
  return base64Encode(rc4Crypt(keyBase64, utf8Encode(text)));
}

function decryptRc4Bytes(keyBase64, cipherBase64) {
  return rc4Crypt(keyBase64, base64Decode(cipherBase64));
}

function decryptRc4Text(keyBase64, cipherBase64) {
  return utf8Decode(decryptRc4Bytes(keyBase64, cipherBase64));
}

function generateNonce(randomBytes, nowMilliseconds = Date.now()) {
  if (!Array.isArray(randomBytes) || randomBytes.length < 8) {
    throw new Error("At least eight random bytes are required");
  }
  const minute = Math.floor(nowMilliseconds / 60000) >>> 0;
  const minuteBytes = [
    (minute >>> 24) & 0xff,
    (minute >>> 16) & 0xff,
    (minute >>> 8) & 0xff,
    minute & 0xff,
  ];
  return base64Encode(randomBytes.slice(0, 8).concat(minuteBytes));
}

function signedNonce(ssecurityBase64, nonceBase64) {
  return base64Encode(
    sha256(
      concatBytes(
        base64Decode(ssecurityBase64),
        base64Decode(nonceBase64),
      ),
    ),
  );
}

function signaturePath(url) {
  const match = /^https?:\/\/[^/]+(\/.*)$/.exec(url);
  if (!match) {
    throw new Error(`Invalid Mi Home URL: ${url}`);
  }
  return match[1].replace("/app/", "/");
}

function generateEncSignature(url, method, signedNonceBase64, params) {
  const parts = [method.toUpperCase(), signaturePath(url)];
  for (const key of Object.keys(params)) {
    parts.push(`${key}=${params[key]}`);
  }
  parts.push(signedNonceBase64);
  return base64Encode(sha1(utf8Encode(parts.join("&"))));
}

function buildEncryptedBody(url, payload, ssecurityBase64, nonceBase64) {
  const signedNonceBase64 = signedNonce(ssecurityBase64, nonceBase64);
  const payloadText = JSON.stringify(payload);
  const plainParams = { data: payloadText };
  plainParams.rc4_hash__ = generateEncSignature(
    url,
    "POST",
    signedNonceBase64,
    plainParams,
  );

  const encryptedParams = {};
  for (const key of Object.keys(plainParams)) {
    encryptedParams[key] = encryptRc4(
      signedNonceBase64,
      plainParams[key],
    );
  }

  return {
    body: {
      _nonce: nonceBase64,
      data: encryptedParams.data,
      rc4_hash__: encryptedParams.rc4_hash__,
      signature: generateEncSignature(
        url,
        "POST",
        signedNonceBase64,
        encryptedParams,
      ),
    },
    signedNonce: signedNonceBase64,
    payloadText,
  };
}

function formEncode(values) {
  return Object.keys(values)
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${
          encodeURIComponent(values[key]).replace(
            /%20/g,
            "+",
          )
        }`,
    )
    .join("&");
}

function isOkFeedResponse(response) {
  if (!response || typeof response !== "object" || response.code !== 0) {
    return false;
  }
  if (response.message !== "ok") {
    return false;
  }
  const result = response.result;
  return !(
    result &&
    typeof result === "object" &&
    Object.prototype.hasOwnProperty.call(result, "code") &&
    result.code !== 0
  );
}

function parsePortions(value) {
  try {
    const items = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(items)) {
      return 0;
    }
    const portion = items.find(
      (item) => item && typeof item === "object" && item.piid === 4,
    );
    return portion ? Number(portion.value || 0) : 0;
  } catch (_error) {
    return 0;
  }
}

function localDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function summarizeRecords(records, now = new Date()) {
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let feedToday = 0;
  let feedWeek = 0;
  let feedMonth = 0;
  const daily = {};

  for (const record of records || []) {
    const timestamp = Number(record.time);
    if (!timestamp) {
      continue;
    }
    const portions = parsePortions(record.value);
    if (portions <= 0) {
      continue;
    }

    const date = new Date(timestamp * 1000);
    const key = localDayKey(date);
    daily[key] = (daily[key] || 0) + portions;
    if (date >= todayStart) {
      feedToday += portions;
    }
    if (date >= weekStart) {
      feedWeek += portions;
    }
    if (date >= monthStart) {
      feedMonth += portions;
    }
  }

  const yesterday = new Date(todayStart);
  yesterday.setDate(yesterday.getDate() - 1);
  const sortedDaily = {};
  for (const key of Object.keys(daily).sort()) {
    sortedDaily[key] = daily[key];
  }

  return {
    feedToday,
    feedYesterday: daily[localDayKey(yesterday)] || 0,
    feedWeek,
    feedMonth,
    daily: sortedDaily,
  };
}

module.exports = {
  base64Decode,
  base64Encode,
  buildEncryptedBody,
  decryptRc4Bytes,
  decryptRc4Text,
  encryptRc4,
  formEncode,
  generateEncSignature,
  generateNonce,
  isOkFeedResponse,
  parsePortions,
  parseConfigText,
  parseEnvironmentConfig,
  rc4Crypt,
  sha1,
  sha256,
  signedNonce,
  summarizeRecords,
  utf8Decode,
  utf8Encode,
};
