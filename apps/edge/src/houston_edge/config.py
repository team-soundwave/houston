from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class EdgeSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HOUSTON_", extra="ignore", env_file=".env")

    device_id: str = "edge-sim-1"
    device_token: str = "development-token"
    device_version: str = "0.1.0"
    ground_ws_url: str = "ws://127.0.0.1:8000/ws/edge"
    ground_http_url: str = "http://127.0.0.1:8000"
    edge_mode: str = "mock"
    capture_interval_seconds: float = 15.0
    heartbeat_interval_seconds: float = 5.0
    upload_retry_seconds: float = 3.0
    spool_dir: Path = Path("var/edge/spool")
    capture_source: str = "simulator"
    adcs_source: str = "mock"
    adcs_command: str | None = None
    sample_image_dir: Path | None = None
    bridge_watch_dir: Path | None = None
    bridge_poll_seconds: float = 1.0
    image_width: int = 1920
    image_height: int = 1080
    exposure_time_usec: int = 5000
    anomaly_threshold: int = 20
    minimum_region_area: int = 50

    @model_validator(mode="after")
    def validate_mode(self) -> "EdgeSettings":
        if self.edge_mode not in {"mock", "real"}:
            raise ValueError("edge_mode must be 'mock' or 'real'")
        if self.adcs_source not in {"mock", "command"}:
            raise ValueError("adcs_source must be 'mock' or 'command'")
        if self.edge_mode == "real" and self.capture_source not in {"picamera", "bridge"}:
            raise ValueError("real mode requires capture_source=picamera or capture_source=bridge")
        if self.adcs_source == "command" and not self.adcs_command:
            raise ValueError("adcs_source=command requires HOUSTON_ADCS_COMMAND")
        if self.capture_source == "bridge" and self.bridge_watch_dir is None:
            raise ValueError("bridge mode requires HOUSTON_BRIDGE_WATCH_DIR")
        if self.capture_source == "directory" and self.sample_image_dir is None:
            raise ValueError("directory mode requires HOUSTON_SAMPLE_IMAGE_DIR")
        return self


@lru_cache
def get_settings() -> EdgeSettings:
    return EdgeSettings()
