from mihome_feeder.config import AppConfig


def sample_config() -> AppConfig:
    return AppConfig(
        ssecurity="c2VjdXJpdHk=",
        service_token="service-token",
        yast="service-token",
        user_id="user-123",
        passport_device_id="passport-device",
        device_id="device-id",
        did="device-did",
        access_key="secret-access-key",
        region="ES",
        language="ZH_CN",
        app_version="11.3.203",
        platform_version="18.7",
        user_agent="test-agent",
        feed_url="https://de.core.api.io.mi.com/app/miotspec/action",
        feed_stats_url="https://de.api.io.mi.com/app/user/get_user_device_data",
        feed_siid=2,
        feed_aiid=1,
        feed_action_did=None,
        feed_default_portions=1,
        feed_max_portions=4,
    )
