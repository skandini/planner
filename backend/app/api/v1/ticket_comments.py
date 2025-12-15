from __future__ import annotations

from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import Ticket, TicketComment, User
from app.schemas.ticket_comment import (
    TicketCommentCreate,
    TicketCommentRead,
    TicketCommentUpdate,
)

router = APIRouter()


@router.get(
    "/tickets/{ticket_id}/comments",
    response_model=List[TicketCommentRead],
    status_code=status.HTTP_200_OK,
)
def get_ticket_comments(
    ticket_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> List[TicketCommentRead]:
    """Get all comments for a ticket."""
    ticket = session.get(Ticket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    statement = (
        select(TicketComment, User)
        .join(User, TicketComment.user_id == User.id)
        .where(
            TicketComment.ticket_id == ticket_id,
            TicketComment.is_deleted == False,
        )
        .order_by(TicketComment.created_at.asc())
    )
    results = session.exec(statement).all()

    comments = []
    for comment, user in results:
        comment_data = TicketCommentRead.model_validate(comment)
        comment_data.user_email = user.email
        comment_data.user_full_name = user.full_name
        comment_data.user_avatar_url = user.avatar_url
        comments.append(comment_data)

    return comments


@router.post(
    "/tickets/{ticket_id}/comments",
    response_model=TicketCommentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_ticket_comment(
    ticket_id: UUID,
    comment_data: TicketCommentCreate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> TicketCommentRead:
    """Create a new comment on a ticket."""
    ticket = session.get(Ticket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    comment = TicketComment(
        ticket_id=ticket_id,
        user_id=current_user.id,
        content=comment_data.content,
    )

    session.add(comment)
    session.commit()
    session.refresh(comment)

    # Load user data
    user = session.get(User, current_user.id)
    comment_read = TicketCommentRead.model_validate(comment)
    if user:
        comment_read.user_email = user.email
        comment_read.user_full_name = user.full_name
        comment_read.user_avatar_url = user.avatar_url

    return comment_read


@router.put(
    "/tickets/{ticket_id}/comments/{comment_id}",
    response_model=TicketCommentRead,
    status_code=status.HTTP_200_OK,
)
def update_ticket_comment(
    ticket_id: UUID,
    comment_id: UUID,
    comment_update: TicketCommentUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> TicketCommentRead:
    """Update a comment (only by the author)."""
    comment = session.get(TicketComment, comment_id)
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    if comment.ticket_id != ticket_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Comment does not belong to this ticket",
        )

    if comment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own comments",
        )

    if comment.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    if comment_update.content is not None:
        comment.content = comment_update.content
        comment.touch()

    session.add(comment)
    session.commit()
    session.refresh(comment)

    user = session.get(User, comment.user_id)
    comment_read = TicketCommentRead.model_validate(comment)
    if user:
        comment_read.user_email = user.email
        comment_read.user_full_name = user.full_name
        comment_read.user_avatar_url = user.avatar_url

    return comment_read


@router.delete(
    "/tickets/{ticket_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_ticket_comment(
    ticket_id: UUID,
    comment_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
):
    """Delete a comment (soft delete, only by the author)."""
    comment = session.get(TicketComment, comment_id)
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    if comment.ticket_id != ticket_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Comment does not belong to this ticket",
        )

    if comment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments",
        )

    comment.is_deleted = True
    comment.deleted_at = datetime.utcnow()

    session.add(comment)
    session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)

