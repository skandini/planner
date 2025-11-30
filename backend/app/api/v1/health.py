from fastapi import APIRouter

router = APIRouter()


@router.get("/", summary="Health check", tags=["health"])
def read_health() -> dict[str, str]:
    """Return basic service health information."""
    return {"status": "ok"}
