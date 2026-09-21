from functools import lru_cache
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    app_name: str = "Masir Hooshmand API"
    env: str = "development"
    secret_key: str = "change-me-in-production"
    database_url: str = "sqlite:///./masir_hooshmand.db"
    database_host: str = ""
    database_port: int = 5432
    database_name: str = ""
    database_user: str = "postgres"
    database_password: str = ""
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
    allow_bootstrap_otp: bool = False
    bootstrap_admin_phone: str = "09399506609"

    @model_validator(mode="before")
    @classmethod
    def assemble_database_url(cls, values):
        if not isinstance(values, dict) or values.get("database_url") or not values.get("database_host"):
            return values
        host = str(values["database_host"]).strip()
        port = int(values.get("database_port") or 5432)
        if host.count(":") == 1:
            possible_host, possible_port = host.rsplit(":", 1)
            if possible_port.isdigit():
                host, port = possible_host, int(possible_port)
        values["database_url"] = URL.create(
            "postgresql+psycopg",
            username=str(values.get("database_user") or "postgres"),
            password=str(values.get("database_password") or ""),
            host=host,
            port=port,
            database=str(values.get("database_name") or ""),
        ).render_as_string(hide_password=False)
        return values
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
