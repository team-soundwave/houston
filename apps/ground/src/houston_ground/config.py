from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class GroundSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HOUSTON_", extra="ignore", env_file=".env")

    ground_host: str = "0.0.0.0"
    ground_port: int = 8000
    edge_token: str = "development-token"
    database_path: Path = Path("var/ground/houston.db")
    storage_dir: Path = Path("var/ground/storage")
    web_dist_dir: Path = Path("apps/web/dist")
    ui_allowed_origins: list[str] = ["*"]


@lru_cache
def get_settings() -> GroundSettings:
    return GroundSettings()
