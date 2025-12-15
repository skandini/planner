"""add user access flags

Revision ID: c1b2c3d4e5f6
Revises: 07e19504cccf
Create Date: 2025-12-15 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c1b2c3d4e5f6"
down_revision: Union[str, None] = "07e19504cccf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("access_org_structure", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "users",
        sa.Column("access_tickets", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("users", "access_tickets")
    op.drop_column("users", "access_org_structure")

