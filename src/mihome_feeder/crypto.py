import base64
import hashlib
import secrets
import time


def generate_nonce() -> str:
    raw = secrets.token_bytes(8) + int(time.time() // 60).to_bytes(4, "big")
    return base64.b64encode(raw).decode()


def signed_nonce(ssecurity_b64: str, nonce_b64: str) -> str:
    raw = base64.b64decode(ssecurity_b64) + base64.b64decode(nonce_b64)
    return base64.b64encode(hashlib.sha256(raw).digest()).decode()


def rc4_crypt(key_b64: str, data_bytes: bytes) -> bytes:
    key = base64.b64decode(key_b64)
    s = bytearray(range(256))
    j = 0

    for i in range(256):
        j = (j + s[i] + key[i % len(key)]) % 256
        s[i], s[j] = s[j], s[i]

    i = 0
    j = 0
    for _ in range(1024):
        i = (i + 1) % 256
        j = (j + s[i]) % 256
        s[i], s[j] = s[j], s[i]
        _ = s[(s[i] + s[j]) % 256]

    out = bytearray()
    for b in data_bytes:
        i = (i + 1) % 256
        j = (j + s[i]) % 256
        s[i], s[j] = s[j], s[i]
        out.append(b ^ s[(s[i] + s[j]) % 256])

    return bytes(out)


def encrypt_rc4(key_b64: str, text: str) -> str:
    return base64.b64encode(rc4_crypt(key_b64, text.encode("utf-8"))).decode()


def decrypt_rc4_raw(key_b64: str, b64cipher: str) -> bytes:
    raw = base64.b64decode(b64cipher)
    return rc4_crypt(key_b64, raw)


def decrypt_rc4_text(key_b64: str, b64cipher: str) -> str:
    return decrypt_rc4_raw(key_b64, b64cipher).decode("utf-8", errors="replace")


def generate_enc_signature(
    url: str, method: str, signed_nonce_b64: str, params: dict
) -> str:
    parts = [
        method.upper(),
        url.split("com", 1)[1].replace("/app/", "/"),
    ]
    for k, v in params.items():
        parts.append(f"{k}={v}")
    parts.append(signed_nonce_b64)
    raw = "&".join(parts).encode("utf-8")
    return base64.b64encode(hashlib.sha1(raw).digest()).decode()
