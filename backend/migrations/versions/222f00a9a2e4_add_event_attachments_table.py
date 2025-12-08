"""add_event_attachments_table

Revision ID: 222f00a9a2e4
Revises: a1b2c3d4e5f6
Create Date: 2025-12-08 21:54:54.814511

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


# revision identifiers, used by Alembic.
revision: str = '222f00a9a2e4'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite не поддерживает ALTER для внешних ключей, поэтому пропускаем их создание для events
    # Внешние ключи для events уже должны быть созданы в предыдущих миграциях
    
    # Проверяем, существует ли уже таблица event_attachments
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()
    
    if 'event_attachments' not in tables:
        # Создаем таблицу event_attachments
        op.create_table(
            'event_attachments',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('event_id', sa.UUID(), nullable=False),
            sa.Column('filename', sa.String(length=255), nullable=False),
            sa.Column('original_filename', sa.String(length=255), nullable=False),
            sa.Column('file_size', sa.Integer(), nullable=False),
            sa.Column('content_type', sa.String(length=100), nullable=False),
            sa.Column('file_path', sa.String(length=500), nullable=False),
            sa.Column('uploaded_by', sa.UUID(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['event_id'], ['events.id'], ),
            sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_event_attachments_id'), 'event_attachments', ['id'], unique=False)
        op.create_index(op.f('ix_event_attachments_event_id'), 'event_attachments', ['event_id'], unique=False)
    else:
        # Таблица уже существует, проверяем индексы
        indexes = {idx['name'] for idx in inspector.get_indexes('event_attachments')}
        if op.f('ix_event_attachments_id') not in indexes:
            op.create_index(op.f('ix_event_attachments_id'), 'event_attachments', ['id'], unique=False)
        if op.f('ix_event_attachments_event_id') not in indexes:
            op.create_index(op.f('ix_event_attachments_event_id'), 'event_attachments', ['event_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_event_attachments_event_id'), table_name='event_attachments')
    op.drop_index(op.f('ix_event_attachments_id'), table_name='event_attachments')
    op.drop_table('event_attachments')
