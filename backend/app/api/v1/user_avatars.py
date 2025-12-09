"""API endpoints for user avatar uploads."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pathlib import Path
from uuid import UUID, uuid4
import os

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import User

router = APIRouter()

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

# Use the same BASE_DIR as in main.py (backend directory)
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
UPLOAD_DIR = BASE_DIR / "uploads" / "user_avatars"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post(
    "/me/avatar",
    status_code=status.HTTP_200_OK,
    summary="Upload user avatar",
)
async def upload_avatar(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...),
) -> dict:
    """Upload avatar for current user."""
    # Validate file size
    file_content = await file.read()
    file_size = len(file_content)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE / 1024 / 1024}MB",
        )
    
    # Validate file extension
    file_extension = Path(file.filename or "").suffix.lower()
    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}",
        )
    
    # Generate unique filename
    filename = f"{current_user.id}_{uuid4().hex}{file_extension}"
    file_path = UPLOAD_DIR / filename
    
    # Delete old avatar if exists
    if current_user.avatar_url:
        old_path = Path(current_user.avatar_url)
        if old_path.is_absolute() and old_path.exists():
            try:
                old_path.unlink()
            except Exception:
                pass  # Ignore errors when deleting old file
    
    # Save new file
    try:
        with open(file_path, "wb") as f:
            f.write(file_content)
    except IOError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {e}",
        )
    
    # Update user record with relative URL
    avatar_url = f"/uploads/user_avatars/{filename}"
    current_user.avatar_url = avatar_url
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    
    return {"avatar_url": avatar_url}


@router.delete(
    "/me/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete user avatar",
)
def delete_avatar(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete avatar for current user."""
    if current_user.avatar_url:
        file_path = Path(current_user.avatar_url)
        if not file_path.is_absolute():
            file_path = BASE_DIR / file_path
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                pass  # Ignore errors when deleting file
        
        current_user.avatar_url = None
        session.add(current_user)
        session.commit()

