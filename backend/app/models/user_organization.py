from __future__ import annotations

from uuid import UUID

from sqlmodel import Field, SQLModel


class UserOrganization(SQLModel, table=True):
    """Many-to-many relationship between users and organizations."""

    __tablename__ = "user_organizations"
    __table_args__ = {"sqlite_autoincrement": False}

    user_id: UUID = Field(
        foreign_key="users.id", primary_key=True, nullable=False, index=True
    )
    organization_id: UUID = Field(
        foreign_key="organizations.id", primary_key=True, nullable=False, index=True
    )


