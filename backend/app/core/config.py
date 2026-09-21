from functools import lru_cache
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Masir Hooshmand API"
    env: str = "development"
    secret_key: str = "change-me-in-production"
    database_url: str = "sqlite:///./masir_hooshmand.db"
    database_pool_size: int = 5
    database_max_overflow: int = 10
    frontend_origin: str = "http://localhost:5173"
    access_token_minutes: int = 30
    refresh_token_days: int = 14
    upload_dir: str = "uploads"
    static_dir: str = ""
    # Production bootstrap for the first administrator login on a fresh database.
    sms_ir_enabled: bool = False
    sms_ir_api_key: str = ""

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        value = str(value).strip()
        if value.startswith("postgres://"):
            return "postgresql+psycopg://" + value[len("postgres://"):]
        if value.startswith("postgresql://"):
            return "postgresql+psycopg://" + value[len("postgresql://"):]
        return value

    @model_validator(mode="after")
    def production_settings_are_safe(self):
        if self.env == "production":
            if self.secret_key == "change-me-in-production" or len(self.secret_key) < 32:
                raise ValueError("MASIR_SECRET_KEY must be a random value of at least 32 characters in production")
            if not self.database_url.startswith("postgresql+psycopg://"):
                raise ValueError("MASIR_DATABASE_URL must point to PostgreSQL in production")
        return self

    model_config = SettingsConfigDict(env_prefix="MASIR_", env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
