import os
from dataclasses import dataclass
from typing import Optional


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _optional_int(name: str, default: Optional[int] = None) -> Optional[int]:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return int(value)


@dataclass(frozen=True)
class AppConfig:
    ssecurity: str
    service_token: str
    yast: str
    user_id: str
    passport_device_id: str
    device_id: str
    did: str
    access_key: str

    region: str
    language: str
    app_version: str
    platform_version: str
    user_agent: str

    feed_url: str
    feed_stats_url: str

    feed_siid: Optional[int]
    feed_aiid: Optional[int]
    feed_action_did: Optional[str]
    feed_default_portions: int

    @classmethod
    def from_env(cls) -> "AppConfig":
        user_id = _require("MIHOME_USER_ID")
        passport_device_id = _require("MIHOME_PASSPORT_DEVICE_ID")
        app_version = os.environ.get("MIHOME_APP_VERSION", "11.3.203")
        platform_version = os.environ.get("MIHOME_PLATFORM_VERSION", "18.7")
        user_agent = os.environ.get(
            "MIHOME_USER_AGENT",
            f"iOS-{platform_version}-{app_version}-iPad8,6--"
            f"{passport_device_id}-{user_id}-{passport_device_id}-mac",
        )

        service_token = _require("MIHOME_SERVICE_TOKEN")

        return cls(
            ssecurity=_require("MIHOME_SSECURITY"),
            service_token=service_token,
            yast=os.environ.get("MIHOME_YAST", service_token),
            user_id=user_id,
            passport_device_id=passport_device_id,
            device_id=_require("MIHOME_DEVICE_ID"),
            did=_require("MIHOME_DID"),
            access_key=_require("MIHOME_ACCESS_KEY"),
            region=os.environ.get("MIHOME_REGION", "ES"),
            language=os.environ.get("MIHOME_LANGUAGE", "ZH_CN"),
            app_version=app_version,
            platform_version=platform_version,
            user_agent=user_agent,
            feed_url=os.environ.get(
                "MIHOME_FEED_URL",
                "https://de.core.api.io.mi.com/app/miotspec/action",
            ),
            feed_stats_url=os.environ.get(
                "MIHOME_FEED_STATS_URL",
                "https://de.api.io.mi.com/app/user/get_user_device_data",
            ),
            feed_siid=_optional_int("MIHOME_FEED_SIID"),
            feed_aiid=_optional_int("MIHOME_FEED_AIID"),
            feed_action_did=os.environ.get("MIHOME_FEED_ACTION_DID"),
            feed_default_portions=_optional_int("MIHOME_FEED_DEFAULT_PORTIONS", 1) or 1,
        )
