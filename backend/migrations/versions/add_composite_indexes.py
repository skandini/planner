"""add composite indexes for frequently used queries

Revision ID: add_composite_indexes
Revises: 
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_composite_indexes'
down_revision: Union[str, None] = 'f02947049b63'  # add_schedule_access_permissions_table
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Добавляем составные индексы для часто используемых запросов:
    
    1. events(calendar_id, starts_at, ends_at) - для фильтрации событий по календарю и времени
    2. events(room_id, starts_at, ends_at) - для проверки доступности комнат
    3. event_participants(event_id, user_id) - уже есть как PK, но добавим для response_status
    4. event_participants(user_id, response_status) - для фильтрации по пользователю и статусу
    5. calendars(owner_id, is_active) - для списка календарей пользователя
    6. notifications(user_id, is_read, created_at) - для списка уведомлений
    """
    
    # Индекс для событий по календарю и времени (для list_events)
    op.create_index(
        'ix_events_calendar_time',
        'events',
        ['calendar_id', 'starts_at', 'ends_at'],
        unique=False
    )
    
    # Индекс для событий по комнате и времени (для проверки доступности комнат)
    op.create_index(
        'ix_events_room_time',
        'events',
        ['room_id', 'starts_at', 'ends_at'],
        unique=False
    )
    
    # Индекс для участников событий по пользователю и статусу
    op.create_index(
        'ix_event_participants_user_status',
        'event_participants',
        ['user_id', 'response_status'],
        unique=False
    )
    
    # Индекс для календарей по владельцу и активности
    op.create_index(
        'ix_calendars_owner_active',
        'calendars',
        ['owner_id', 'is_active'],
        unique=False
    )
    
    # Индекс для уведомлений по пользователю, статусу прочтения и дате создания
    op.create_index(
        'ix_notifications_user_read_created',
        'notifications',
        ['user_id', 'is_read', 'created_at'],
        unique=False
    )
    
    # Индекс для календарных участников по календарю и пользователю
    op.create_index(
        'ix_calendar_members_calendar_user',
        'calendar_members',
        ['calendar_id', 'user_id'],
        unique=False
    )


def downgrade() -> None:
    """Удаляем составные индексы."""
    op.drop_index('ix_calendar_members_calendar_user', table_name='calendar_members')
    op.drop_index('ix_notifications_user_read_created', table_name='notifications')
    op.drop_index('ix_calendars_owner_active', table_name='calendars')
    op.drop_index('ix_event_participants_user_status', table_name='event_participants')
    op.drop_index('ix_events_room_time', table_name='events')
    op.drop_index('ix_events_calendar_time', table_name='events')

