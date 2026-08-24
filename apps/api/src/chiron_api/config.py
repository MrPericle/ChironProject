from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = Field(default="development", alias="APP_ENV")
    app_name: str = Field(default="Chiron Project API", alias="APP_NAME")
    cors_origins: str = Field(
        default="http://localhost:5173",
        alias="APP_CORS_ORIGINS",
    )
    database_url: str = Field(
        default="postgresql+psycopg://chiron:chiron_dev_password@localhost:5432/chiron",
        alias="DATABASE_URL",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        populate_by_name=True,
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
