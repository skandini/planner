from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from pathlib import Path
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.api.router import api_router
from app.core.config import settings
from app.db import init_db


def create_application() -> FastAPI:
    app = FastAPI(title=settings.PROJECT_NAME, version="0.1.0")
    
    # Rate limiting - используем Redis если доступен, иначе память
    limiter = Limiter(
        key_func=get_remote_address,
        storage_uri=settings.REDIS_URL,
        default_limits=["100/minute"],
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # CORS middleware - настроен для безопасности
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,  # Разрешенные домены из конфигурации
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],  # Разрешаем все заголовки
        expose_headers=["*"],
    )
    
    # Middleware для безопасных HTTP заголовков
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        # Безопасные HTTP заголовки
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Strict-Transport-Security (только если HTTPS)
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # Content-Security-Policy (базовый)
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        return response
    
    # Middleware для логирования всех запросов и безопасности
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        import logging
        logger = logging.getLogger("security")
        
        client_ip = get_remote_address(request)
        method = request.method
        path = request.url.path
        
        # Логируем запрос
        logger.info(f"[REQUEST] {method} {path} from {client_ip}")
        
        try:
            response = await call_next(request)
            status_code = response.status_code
            
            # Логируем неудачные попытки входа (401, 403)
            if path.startswith("/api/v1/auth/login") and status_code in [401, 403]:
                logger.warning(f"[SECURITY] Failed login attempt from {client_ip} for {path}")
            
            # Логируем ошибки валидации (возможные атаки)
            if status_code == 422:
                logger.warning(f"[SECURITY] Validation error from {client_ip} for {path}")
            
            return response
        except Exception as e:
            logger.error(f"[ERROR] Exception in {path} from {client_ip}: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            raise

    # Helper function to add CORS headers - всегда добавляем для всех origins
    def get_cors_headers(request: Request) -> dict:
        """Get CORS headers for the request origin."""
        origin = request.headers.get("origin")
        headers = {
            "Access-Control-Allow-Origin": origin if origin else "*",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
        return headers

    # Exception handlers - всегда добавляем CORS заголовки
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        headers = get_cors_headers(request)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        headers = get_cors_headers(request)
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": exc.errors()},
            headers=headers,
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        import traceback
        print(f"[ERROR] Unhandled exception: {str(exc)}")
        print(traceback.format_exc())
        headers = get_cors_headers(request)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": f"Internal server error: {str(exc)}"},
            headers=headers,
        )

    app.include_router(api_router, prefix=settings.API_V1_STR)

    # Serve uploaded files
    BASE_DIR = Path(__file__).resolve().parent.parent
    uploads_dir = BASE_DIR / "uploads"
    uploads_dir.mkdir(exist_ok=True)
    # Ensure subdirectories exist
    (uploads_dir / "user_avatars").mkdir(parents=True, exist_ok=True)
    (uploads_dir / "event_attachments").mkdir(parents=True, exist_ok=True)
    (uploads_dir / "ticket_attachments").mkdir(parents=True, exist_ok=True)
    print(f"[INFO] Static files directory: {uploads_dir.resolve()}")
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

    @app.on_event("startup")
    def _startup() -> None:
        init_db()

    return app


app = create_application()
