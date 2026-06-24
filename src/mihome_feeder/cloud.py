import gzip
import json
import urllib.error
import urllib.parse
import urllib.request

from .config import AppConfig
from .crypto import (
    decrypt_rc4_raw,
    encrypt_rc4,
    generate_enc_signature,
    generate_nonce,
    signed_nonce,
)


class MiHomeRequestError(RuntimeError):
    """Raised when a Mi Home API request cannot be completed."""


class MiHomeAuthenticationError(MiHomeRequestError):
    """Raised when Xiaomi rejects the configured cloud session."""


_SENSITIVE_KEYS = {
    "accesskey",
    "deviceid",
    "did",
    "passportdeviceid",
    "servicetoken",
    "ssecurity",
    "uid",
    "userid",
    "yetanotherservicetoken",
}


def redact_data(value):
    if isinstance(value, dict):
        return {
            key: "<redacted>" if key.lower() in _SENSITIVE_KEYS else redact_data(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_data(item) for item in value]
    return value


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
        print("DECRYPTED RESPONSE LENGTH:", len(decrypted))
    return json.loads(decrypted)


def _error_message(raw: str) -> str:
    try:
        error_json = json.loads(raw)
    except json.JSONDecodeError:
        return ""
    if not isinstance(error_json, dict):
        return ""
    message = error_json.get("message")
    return str(message) if message else ""


def post_json(url: str, payload: dict, cfg: AppConfig, debug: bool = False):
    try:
        body_dict, _payload_str, s_nonce = build_encrypted_body(url, payload, cfg)
        body = urllib.parse.urlencode(body_dict).encode()
        headers = build_headers(url, cfg)

        if debug:
            print("API_URL:", url)
            print(
                "REQUEST PAYLOAD:",
                json.dumps(
                    redact_data(payload),
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
            )
            print("POST FIELDS:", ", ".join(body_dict))

        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            miot_encoding = resp.headers.get("miot-content-encoding")

            if debug:
                print("HTTP STATUS:", resp.status)
                print("CONTENT-TYPE:", resp.headers.get("Content-Type"))
                print("MIOT-CONTENT-ENCODING:", miot_encoding)
                print("RAW LENGTH:", len(raw))

        response = parse_response_text(raw, miot_encoding, s_nonce, debug=debug)
        if debug:
            response_code = response.get("code") if isinstance(response, dict) else None
            print("RESPONSE TYPE:", type(response).__name__)
            print("RESPONSE CODE:", response_code)
        return response

    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        if debug:
            print("HTTP STATUS:", e.code)
            print("ERROR LENGTH:", len(err))
        if e.code == 401:
            try:
                error_json = json.loads(err)
            except json.JSONDecodeError:
                error_json = {}
            if error_json.get("code") == 3 or "auth error" in err.lower():
                raise MiHomeAuthenticationError(
                    "Mi Home session expired or was revoked. Run mihome-login "
                    "to refresh MIHOME_SSECURITY and MIHOME_SERVICE_TOKEN."
                ) from None
        message = _error_message(err)
        detail = f": {message}" if message else ""
        raise MiHomeRequestError(
            f"Mi Home API returned HTTP {e.code}{detail}"
        ) from None
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise MiHomeRequestError(f"Could not reach Mi Home API: {reason}") from None
    except (IndexError, OSError, ValueError) as exc:
        raise MiHomeRequestError(
            f"Invalid Mi Home request or response: {exc}"
        ) from None
