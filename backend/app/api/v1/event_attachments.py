from __future__ import annotations

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import Event, EventAttachment, User
from app.schemas.event_attachment import EventAttachmentRead
from app.services.permissions import ensure_calendar_access

router = APIRouter()

# Максимальный размер одного файла: 20 МБ
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 МБ в байтах
# Максимальный размер всех файлов для события: 20 МБ
MAX_TOTAL_SIZE = 20 * 1024 * 1024  # 20 МБ в байтах

# Директория для хранения файлов
UPLOAD_DIR = Path("uploads/event_attachments")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _get_total_attachment_size(session: SessionDep, event_id: UUID) -> int:
    """Получить общий размер всех файлов события."""
    attachments = session.exec(
        select(EventAttachment).where(EventAttachment.event_id == event_id)
    ).all()
    return sum(att.file_size for att in attachments)


@router.post(
    "/{event_id}/attachments",
    response_model=EventAttachmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload attachment to event",
)
async def upload_attachment(
    event_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...),
) -> EventAttachmentRead:
    """Загрузить файл к событию."""
    # Проверяем, что событие существует
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Проверяем доступ к календарю события
    ensure_calendar_access(session, event.calendar_id, current_user)

    # Проверяем размер файла
    file_content = await file.read()
    file_size = len(file_content)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE / (1024 * 1024):.0f} MB",
        )

    # Проверяем общий размер всех файлов события
    total_size = _get_total_attachment_size(session, event_id)
    if total_size + file_size > MAX_TOTAL_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Total file size exceeds maximum allowed size of {MAX_TOTAL_SIZE / (1024 * 1024):.0f} MB",
        )

    # Сохраняем файл
    file_extension = Path(file.filename or "").suffix
    filename = f"{event_id}_{UUID().hex}{file_extension}"
    file_path = UPLOAD_DIR / filename
    
    with open(file_path, "wb") as f:
        f.write(file_content)

    # Создаем запись в БД
    attachment = EventAttachment(
        event_id=event_id,
        filename=filename,
        original_filename=file.filename or "unknown",
        file_size=file_size,
        content_type=file.content_type or "application/octet-stream",
        file_path=str(file_path),
        uploaded_by=current_user.id,
    )
    session.add(attachment)
    session.commit()
    session.refresh(attachment)

    return EventAttachmentRead.model_validate(attachment)


@router.get(
    "/{event_id}/attachments",
    response_model=list[EventAttachmentRead],
    summary="Get event attachments",
)
def list_attachments(
    event_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> list[EventAttachmentRead]:
    """Получить список файлов события."""
    # Проверяем, что событие существует
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Проверяем доступ к календарю события
    ensure_calendar_access(session, event.calendar_id, current_user)

    attachments = session.exec(
        select(EventAttachment).where(EventAttachment.event_id == event_id)
    ).all()

    return [EventAttachmentRead.model_validate(att) for att in attachments]


@router.get(
    "/attachments/{attachment_id}/download",
    summary="Download attachment",
)
def download_attachment(
    attachment_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """Скачать файл."""
    attachment = session.get(EventAttachment, attachment_id)
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found",
        )

    # Проверяем доступ к событию
    event = session.get(Event, attachment.event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Проверяем доступ к календарю события
    ensure_calendar_access(session, event.calendar_id, current_user)

    # Проверяем, что файл существует
    file_path = Path(attachment.file_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on server",
        )

    return FileResponse(
        path=file_path,
        filename=attachment.original_filename,
        media_type=attachment.content_type,
    )


@router.delete(
    "/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete attachment",
)
def delete_attachment(
    attachment_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> None:
    """Удалить файл."""
    attachment = session.get(EventAttachment, attachment_id)
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found",
        )

    # Проверяем доступ к событию
    event = session.get(Event, attachment.event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Проверяем доступ к календарю события (только владелец календаря может удалять файлы)
    from app.models import Calendar
    calendar = session.get(Calendar, event.calendar_id)
    if not calendar or calendar.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only calendar owner can delete attachments",
        )

    # Удаляем файл с диска
    file_path = Path(attachment.file_path)
    if file_path.exists():
        file_path.unlink()

    # Удаляем запись из БД
    session.delete(attachment)
    session.commit()

