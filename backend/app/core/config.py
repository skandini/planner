from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_parse_none_str="",
    )

    PROJECT_NAME: str = "Corporate Calendar API"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "local"
    # Храним БД в корне проекта, чтобы при запуске из любого каталога использовать один файл
    DATABASE_URL: str = "sqlite:///../calendar.db"
    SECRET_KEY: str = "changeme"  # Должен быть установлен через переменную окружения в .env
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    JWT_ALGORITHM: str = "HS256"
    BACKEND_CORS_ORIGINS: str = "https://calendar.corestone.ru,http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001"
    
    # Redis configuration
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_CACHE_URL: str = "redis://localhost:6379/1"  # Separate DB for cache
    
    # Celery configuration
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    
    # Web Push Notifications (VAPID keys)
    VAPID_PRIVATE_KEY: str = ""
    VAPID_PUBLIC_KEY: str = ""
    VAPID_CLAIMS_EMAIL: str = "mailto:admin@corestone.ru"

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins string into a list."""
        if not self.BACKEND_CORS_ORIGINS or not self.BACKEND_CORS_ORIGINS.strip():
            return ["http://localhost:3000", "http://localhost:3001"]
        return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
