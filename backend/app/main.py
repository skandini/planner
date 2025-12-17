from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from pathlib import Path

from app.api.router import api_router
from app.core.config import settings
from app.db import init_db


def create_application() -> FastAPI:
    app = FastAPI(title=settings.PROJECT_NAME, version="0.1.0")

    # CORS middleware - максимально простой и надежный
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Разрешаем все origins для упрощения
        allow_credentials=True,
        allow_methods=["*"],  # Разрешаем все методы
        allow_headers=["*"],  # Разрешаем все заголовки
        expose_headers=["*"],
    )
    
    # Middleware для логирования всех запросов
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        print(f"\n[REQUEST] {request.method} {request.url.path}")
        print(f"[REQUEST] Origin: {request.headers.get('origin')}")
        print(f"[REQUEST] Authorization: {'Present' if request.headers.get('authorization') else 'Missing'}")
        try:
            response = await call_next(request)
            print(f"[RESPONSE] {response.status_code} for {request.method} {request.url.path}")
            cors_headers = {k: v for k, v in response.headers.items() if 'access-control' in k.lower()}
            if cors_headers:
                print(f"[RESPONSE] CORS headers present: {list(cors_headers.keys())}")
            else:
                print(f"[RESPONSE] WARNING: No CORS headers in response!")
            return response
        except Exception as e:
            print(f"[ERROR] Exception in middleware: {e}")
            import traceback
            traceback.print_exc()
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
    (uploads_dir / "user_avatars").mkdir(exist_ok=True)
    (uploads_dir / "event_attachments").mkdir(exist_ok=True)
    print(f"[INFO] Static files directory: {uploads_dir.resolve()}")
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

    @app.on_event("startup")
    def _startup() -> None:
        init_db()

    return app


app = create_application()
