from __future__ import annotations

from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import Event, EventComment, User
from app.schemas.event_comment import (
    EventCommentCreate,
    EventCommentRead,
    EventCommentUpdate,
)

router = APIRouter()


@router.get(
    "/events/{event_id}/comments",
    response_model=List[EventCommentRead],
    status_code=status.HTTP_200_OK,
)
def get_event_comments(
    event_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> List[EventCommentRead]:
    """Get all comments for an event."""
    # Check if event exists
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Get all non-deleted comments
    statement = (
        select(EventComment, User)
        .join(User, EventComment.user_id == User.id)
        .where(
            EventComment.event_id == event_id,
            EventComment.is_deleted == False,
        )
        .order_by(EventComment.created_at.asc())
    )
    results = session.exec(statement).all()

    comments = []
    for comment, user in results:
        comment_data = EventCommentRead.model_validate(comment)
        comment_data.user_email = user.email
        comment_data.user_full_name = user.full_name
        comment_data.user_avatar_url = user.avatar_url
        comments.append(comment_data)

    return comments


@router.post(
    "/events/{event_id}/comments",
    response_model=EventCommentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_event_comment(
    event_id: UUID,
    comment_data: EventCommentCreate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> EventCommentRead:
    """Create a new comment on an event."""
    # Verify event exists
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Use current user's ID and event_id from URL
    comment = EventComment(
        event_id=event_id,
        user_id=current_user.id,
        content=comment_data.content,
    )

    session.add(comment)
    session.commit()
    session.refresh(comment)

    # Load user data
    user = session.get(User, current_user.id)
    comment_read = EventCommentRead.model_validate(comment)
    if user:
        comment_read.user_email = user.email
        comment_read.user_full_name = user.full_name
        comment_read.user_avatar_url = user.avatar_url

    return comment_read


@router.put(
    "/events/{event_id}/comments/{comment_id}",
    response_model=EventCommentRead,
    status_code=status.HTTP_200_OK,
)
def update_event_comment(
    event_id: UUID,
    comment_id: UUID,
    comment_update: EventCommentUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> EventCommentRead:
    """Update a comment (only by the author)."""
    comment = session.get(EventComment, comment_id)
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    if comment.event_id != event_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Comment does not belong to this event",
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

    # Update content if provided
    if comment_update.content is not None:
        comment.content = comment_update.content
        comment.touch()

    session.add(comment)
    session.commit()
    session.refresh(comment)

    # Load user data
    user = session.get(User, comment.user_id)
    comment_read = EventCommentRead.model_validate(comment)
    if user:
        comment_read.user_email = user.email
        comment_read.user_full_name = user.full_name
        comment_read.user_avatar_url = user.avatar_url

    return comment_read


@router.delete(
    "/events/{event_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_event_comment(
    event_id: UUID,
    comment_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
):
    """Delete a comment (soft delete, only by the author)."""
    comment = session.get(EventComment, comment_id)
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    if comment.event_id != event_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Comment does not belong to this event",
        )

    if comment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments",
        )

    # Soft delete
    comment.is_deleted = True
    comment.deleted_at = datetime.utcnow()

    session.add(comment)
    session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)

