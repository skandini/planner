"""add calendar ownership and membership tables

Revision ID: 6c2d8c1a4f62
Revises: 2f0f463eaf44
Create Date: 2025-11-25 12:34:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "6c2d8c1a4f62"
down_revision: Union[str, None] = "2f0f463eaf44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_columns = {col["name"] for col in inspector.get_columns("calendars")}
    existing_indexes = {ix["name"] for ix in inspector.get_indexes("calendars")}
    existing_fks = {fk["name"] for fk in inspector.get_foreign_keys("calendars") if fk.get("name")}

    needs_column = "owner_id" not in existing_columns
    needs_index = op.f("ix_calendars_owner_id") not in existing_indexes
    needs_fk = "fk_calendars_owner_id_users" not in existing_fks

    op.execute("DROP TABLE IF EXISTS _alembic_tmp_calendars")

    if needs_column or needs_index or needs_fk:
        with op.batch_alter_table("calendars") as batch_op:
            if needs_column:
                batch_op.add_column(sa.Column("owner_id", sa.Uuid(), nullable=True))
            if needs_index:
                batch_op.create_index(
                    op.f("ix_calendars_owner_id"), ["owner_id"], unique=False
                )
            if needs_fk:
                batch_op.create_foreign_key(
                    "fk_calendars_owner_id_users",
                    "users",
                    ["owner_id"],
                    ["id"],
                )

    op.create_table(
        "calendar_members",
        sa.Column("calendar_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "role",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'viewer'"),
        ),
        sa.Column(
            "added_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["calendar_id"], ["calendars.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("calendar_id", "user_id"),
    )
    op.create_index(
        op.f("ix_calendar_members_user_id"),
        "calendar_members",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_calendar_members_user_id"), table_name="calendar_members")
    op.drop_table("calendar_members")
    with op.batch_alter_table("calendars") as batch_op:
        batch_op.drop_constraint(
            "fk_calendars_owner_id_users", type_="foreignkey"
        )
        batch_op.drop_index(op.f("ix_calendars_owner_id"))
        batch_op.drop_column("owner_id")

