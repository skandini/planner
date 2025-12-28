from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.db import engine

router = APIRouter()


@router.get("/", summary="Health check", tags=["health"])
def read_health() -> dict[str, str]:
    """Return basic service health information."""
    return {"status": "ok"}


@router.get("/ready", summary="Readiness check", tags=["health"])
def read_ready() -> dict[str, str]:
    """Check if service is ready to accept traffic (readiness probe)."""
    try:
        # Проверяем подключение к БД
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "database": "disconnected",
                "error": str(e) if settings.ENVIRONMENT != "production" else "Database connection failed"
            }
        )
