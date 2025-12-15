from __future__ import annotations

from datetime import datetime
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import Ticket, TicketAttachment, User

router = APIRouter()

# Максимальный размер одного файла: 20 МБ
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 МБ в байтах
# Максимальный размер всех файлов для тикета: 20 МБ
MAX_TOTAL_SIZE = 20 * 1024 * 1024  # 20 МБ в байтах

# Директория для хранения файлов
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
UPLOAD_DIR = BASE_DIR / "uploads" / "ticket_attachments"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _get_total_attachment_size(session: SessionDep, ticket_id: UUID) -> int:
    """Получить общий размер всех файлов тикета."""
    attachments = session.exec(
        select(TicketAttachment).where(
            TicketAttachment.ticket_id == ticket_id,
            TicketAttachment.is_deleted == False,
        )
    ).all()
    return sum(att.file_size for att in attachments)


@router.post(
    "/tickets/{ticket_id}/attachments",
    status_code=status.HTTP_201_CREATED,
    summary="Upload attachment to ticket",
)
async def upload_ticket_attachment(
    ticket_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...),
):
    """Загрузить файл к тикету."""
    ticket = session.get(Ticket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    # Проверяем размер файла
    file_content = await file.read()
    file_size = len(file_content)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE / (1024 * 1024):.0f} MB",
        )

    # Проверяем общий размер всех файлов тикета
    total_size = _get_total_attachment_size(session, ticket_id)
    if total_size + file_size > MAX_TOTAL_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Total file size exceeds maximum allowed size of {MAX_TOTAL_SIZE / (1024 * 1024):.0f} MB",
        )

    # Сохраняем файл
    try:
        file_extension = Path(file.filename or "").suffix
        filename = f"{ticket_id}_{uuid4().hex}{file_extension}"
        file_path = UPLOAD_DIR / filename
        
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, "wb") as f:
            f.write(file_content)

        # Создаем запись в БД
        attachment = TicketAttachment(
            ticket_id=ticket_id,
            uploaded_by=current_user.id,
            original_filename=file.filename or "unknown",
            file_path=str(file_path.absolute()),
            file_size=file_size,
            content_type=file.content_type or "application/octet-stream",
        )

        session.add(attachment)
        session.commit()
        session.refresh(attachment)

        return {
            "id": str(attachment.id),
            "ticket_id": str(attachment.ticket_id),
            "original_filename": attachment.original_filename,
            "file_size": attachment.file_size,
            "content_type": attachment.content_type,
            "created_at": attachment.created_at.isoformat(),
        }
    except Exception as e:
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}",
        )


@router.get(
    "/tickets/{ticket_id}/attachments",
    summary="List ticket attachments",
)
def list_ticket_attachments(
    ticket_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
):
    """Получить список вложений тикета."""
    ticket = session.get(Ticket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    attachments = session.exec(
        select(TicketAttachment).where(
            TicketAttachment.ticket_id == ticket_id,
            TicketAttachment.is_deleted == False,
        ).order_by(TicketAttachment.created_at.desc())
    ).all()

    return [
        {
            "id": str(att.id),
            "ticket_id": str(att.ticket_id),
            "original_filename": att.original_filename,
            "file_size": att.file_size,
            "content_type": att.content_type,
            "created_at": att.created_at.isoformat(),
            "uploaded_by": str(att.uploaded_by),
        }
        for att in attachments
    ]


@router.get(
    "/tickets/attachments/{attachment_id}/download",
    summary="Download ticket attachment",
)
def download_ticket_attachment(
    attachment_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
):
    """Скачать вложение тикета."""
    attachment = session.get(TicketAttachment, attachment_id)
    if not attachment or attachment.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found",
        )

    ticket = session.get(Ticket, attachment.ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    file_path = Path(attachment.file_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on server",
        )

    return FileResponse(
        path=str(file_path),
        filename=attachment.original_filename,
        media_type=attachment.content_type,
    )


@router.delete(
    "/tickets/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_ticket_attachment(
    attachment_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
):
    """Удалить вложение тикета (только загрузивший пользователь)."""
    attachment = session.get(TicketAttachment, attachment_id)
    if not attachment or attachment.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found",
        )

    # Только загрузивший пользователь может удалить файл
    if attachment.uploaded_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own attachments",
        )

    # Soft delete
    attachment.is_deleted = True
    attachment.deleted_at = datetime.utcnow()

    session.add(attachment)
    session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
