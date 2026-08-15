from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Masir Hooshmand API"
    env: str = "development"
    secret_key: str = "change-me-in-production"
    database_url: str = "sqlite:///./masir_hooshmand.db"
    frontend_origin: str = "http://localhost:5173"
    access_token_minutes: int = 30
    refresh_token_days: int = 14
    upload_dir: str = "uploads"

    model_config = SettingsConfigDict(env_prefix="MASIR_", env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
