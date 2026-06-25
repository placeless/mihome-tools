const assert = require("node:assert/strict");
const test = require("node:test");

const core = require("../MiHomeCore");

test("UTF-8 and base64 round trip", () => {
  const input = "Mi Home 猫 🐈";
  const bytes = core.utf8Encode(input);
  assert.equal(core.utf8Decode(bytes), input);
  assert.deepEqual(core.base64Decode(core.base64Encode(bytes)), bytes);
});

test("SHA implementations match standard vectors", () => {
  const input = core.utf8Encode("abc");
  assert.equal(
    core.base64Encode(core.sha1(input)),
    "qZk+NkcGgWq6PiVxeFDCbJzQ2J0=", // pragma: allowlist secret
  );
  assert.equal(
    core.base64Encode(core.sha256(input)),
    "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=", // pragma: allowlist secret
  );
});

test("encrypted request matches the Python implementation", () => {
  const url = "https://de.core.api.io.mi.com/app/miotspec/action";
  const ssecurity = "c2VjdXJpdHktMTIzNDU2Nw==";
  const nonce = "AAECAwQFBgcAB1vN";
  const payload = {
    accessKey: "test-key",
    params: { did: "123", siid: 2, aiid: 1, in: [1] },
  };

  const encrypted = core.buildEncryptedBody(
    url,
    payload,
    ssecurity,
    nonce,
  );

  assert.equal(
    encrypted.signedNonce,
    "Zh7yGatDE2zL+Bg+jpbKpDyFZhPKgi2nTjCGqDjZb2Q=", // pragma: allowlist secret
  );
  assert.equal(
    encrypted.body.data,
    "k3aHJgeFzV0V+9jy6U2jljd4AFNK0/uNxOuZIGuyR7D+fJmAWjrpRLMW2gibRt2tK6ER33iwrmDRyl7v2axUCvzfSmdvDZ6rZIQ=", // pragma: allowlist secret
  );
  assert.equal(
    encrypted.body.rc4_hash__,
    "sgyOBhel61gT+NWavDiavzVKd3NB/Y6KgLCpbw==", // pragma: allowlist secret
  );
  assert.equal(encrypted.body.signature, "C/1m8MMCPrfV+trhxvGMDO6eG0w=");
  assert.equal(
    core.decryptRc4Text(encrypted.signedNonce, encrypted.body.data),
    JSON.stringify(payload),
  );
});

test("nonce contains eight random bytes and a big-endian minute", () => {
  const nonce = core.generateNonce(
    [0, 1, 2, 3, 4, 5, 6, 7],
    123456 * 60000,
  );
  assert.deepEqual(core.base64Decode(nonce), [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    0,
    1,
    226,
    64,
  ]);
});

test("seven-day summary excludes the eighth calendar day", () => {
  const now = new Date(2026, 5, 25, 12, 0, 0);
  const records = [];
  for (let daysAgo = 0; daysAgo < 8; daysAgo += 1) {
    const date = new Date(2026, 5, 25 - daysAgo, 1, 0, 0);
    records.push({
      time: Math.floor(date.getTime() / 1000),
      value: JSON.stringify([{ piid: 4, value: 1 }]),
    });
  }
  const summary = core.summarizeRecords(records, now);
  assert.equal(summary.feedToday, 1);
  assert.equal(summary.feedYesterday, 1);
  assert.equal(summary.feedWeek, 7);
  assert.equal(Object.keys(summary.daily).length, 8);
});

test("feeder.env content maps to Scriptable configuration fields", () => {
  const parsed = core.parseConfigText(`
    # comment
    export MIHOME_SSECURITY='security'
    MIHOME_SERVICE_TOKEN='token'
    MIHOME_USER_ID=123
    REGION=ES # legacy alias
    MIHOME_FEED_SIID=2
  `);
  assert.deepEqual(parsed, {
    ssecurity: "security",
    serviceToken: "token",
    userId: "123",
    region: "ES",
    feedSiid: "2",
  });
});

test("JSON configuration import is accepted", () => {
  assert.deepEqual(core.parseConfigText('{"did":"123","feedAiid":1}'), {
    did: "123",
    feedAiid: 1,
  });
});
