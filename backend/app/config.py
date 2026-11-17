from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=RAIZ / "backend" / ".env", extra="ignore")

    # auto: usa a base real se existir (data/processed/*.parquet); "sintetica": amostra de desenvolvimento
    fonte: str = "auto"
    cors_origins: list[str] = ["http://localhost:5101", "http://127.0.0.1:5101"]
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
