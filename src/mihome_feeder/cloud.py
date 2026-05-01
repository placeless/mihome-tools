import gzip
import json
import urllib.error
import urllib.parse
import urllib.request

from .config import AppConfig
from .crypto import (
    decrypt_rc4_raw,
    decrypt_rc4_text,
    encrypt_rc4,
    generate_enc_signature,
    generate_nonce,
    signed_nonce,
)


def build_headers(url: str, cfg: AppConfig) -> dict:
    domain_refer = urllib.parse.urlparse(url).netloc

    cookie = "; ".join(
        [
            f"xm_geo={cfg.region}",
            "locale=zh_cn",
            f"PassportDeviceId={cfg.passport_device_id}",
            f"serviceToken={cfg.service_token}",
            f"userId={cfg.user_id}",
            f"yetAnotherServiceToken={cfg.yast}",
            f"APPVERSION={cfg.app_version.replace('.', '')}",
            f"DEVICEID={cfg.device_id}",
            f"IOSVERSION={cfg.app_version.replace('.', '')}",
            "ISIOS=1",
            "canary=1",
            "request_from=mihome_sdk",
            "sdk_version=42000",
            "xm_version=4.0",
            "xm_user_bucket=3",
        ]
    )

    return {
        "miot-encrypt-algorithm": "ENCRYPT-RC4",
        "content-type": "application/x-www-form-urlencoded",
        "accept": "*/*",
        "accept-language": "en-US;q=1, es-US;q=0.9, es;q=0.8, zh-Hans-US;q=0.7",
        "domain-refer": domain_refer,
        "origin-from": "MiHome",
        "operate-common": (
            f"_region={cfg.region}&_language={cfg.language}&_deviceId={cfg.passport_device_id}"
            f"&_appVersion={cfg.app_version}&_platform=1&_platformVersion={cfg.platform_version}"
        ),
        "x-xiaomi-protocal-flag-cli": "PROTOCAL-HTTP2",
        "user-agent": cfg.user_agent,
        "cookie": cookie,
    }


def build_encrypted_body(url: str, payload: dict, cfg: AppConfig):
    nonce = generate_nonce()
    s_nonce = signed_nonce(cfg.ssecurity, nonce)
    payload_str = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)

    plain_params = {"data": payload_str}
    plain_params["rc4_hash__"] = generate_enc_signature(
        url, "POST", s_nonce, plain_params
    )

    enc_params = {}
    for k, v in plain_params.items():
        enc_params[k] = encrypt_rc4(s_nonce, v)

    signature = generate_enc_signature(url, "POST", s_nonce, enc_params)

    body_dict = {
        "_nonce": nonce,
        "data": enc_params["data"],
        "rc4_hash__": enc_params["rc4_hash__"],
        "signature": signature,
    }
    return body_dict, payload_str, s_nonce


def parse_response_text(
    raw: str, miot_encoding: str, s_nonce: str, debug: bool = False
):
    raw = raw.strip()
    if not raw:
        raise RuntimeError("Empty response body")

    if raw.startswith("{") or raw.startswith("["):
        return json.loads(raw)

    plain = decrypt_rc4_raw(s_nonce, raw)
    if miot_encoding and miot_encoding.upper() == "GZIP":
        plain = gzip.decompress(plain)

    decrypted = plain.decode("utf-8", errors="replace")
    if debug:
        print("DECRYPTED RESPONSE PREVIEW:", repr(decrypted[:500]))
    return json.loads(decrypted)


def post_json(url: str, payload: dict, cfg: AppConfig, debug: bool = False):
    body_dict, payload_str, s_nonce = build_encrypted_body(url, payload, cfg)
    body = urllib.parse.urlencode(body_dict).encode()
    headers = build_headers(url, cfg)

    if debug:
        print("API_URL:", url)
        print("REQUEST PAYLOAD:", payload_str)
        print("POST BODY:", urllib.parse.urlencode(body_dict))
        print("DECRYPT DATA:", decrypt_rc4_text(s_nonce, body_dict["data"]))
        print("DECRYPT RC4_HASH__:", decrypt_rc4_text(s_nonce, body_dict["rc4_hash__"]))

    req = urllib.request.Request(url, data=body, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            miot_encoding = resp.headers.get("miot-content-encoding")

            if debug:
                print("HTTP STATUS:", resp.status)
                print("CONTENT-TYPE:", resp.headers.get("Content-Type"))
                print("MIOT-CONTENT-ENCODING:", miot_encoding)
                print("RAW LENGTH:", len(raw))
                print("RAW PREVIEW:", repr(raw[:200]))

        return parse_response_text(raw, miot_encoding, s_nonce, debug=debug)

    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        if debug:
            print("HTTP STATUS:", e.code)
            print("ERROR PREVIEW:", repr(err[:500]))
        raise
