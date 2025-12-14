from __future__ import annotations

from uuid import UUID

from sqlmodel import Field, SQLModel


class UserDepartment(SQLModel, table=True):
    """Many-to-many relationship between users and departments."""

    __tablename__ = "user_departments"
    __table_args__ = {"sqlite_autoincrement": False}

    user_id: UUID = Field(
        foreign_key="users.id", primary_key=True, nullable=False, index=True
    )
    department_id: UUID = Field(
        foreign_key="departments.id", primary_key=True, nullable=False, index=True
    )


