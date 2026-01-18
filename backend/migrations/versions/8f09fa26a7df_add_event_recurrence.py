"""add recurrence fields to events

Revision ID: 8f09fa26a7df
Revises: d56578feb442
Create Date: 2025-05-09 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "8f09fa26a7df"
down_revision = "d56578feb442"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("recurrence_rule", sa.JSON(), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column("recurrence_parent_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_events_recurrence_parent_id", "events", ["recurrence_parent_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_events_recurrence_parent_id", table_name="events")
    op.drop_column("events", "recurrence_parent_id")
    op.drop_column("events", "recurrence_rule")









