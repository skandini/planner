from __future__ import annotations

from sqlmodel import Session, select

from app.core.security import get_password_hash
from app.db import engine
from app.models import Organization, User


def ensure_organization(session: Session) -> Organization:
    organization = session.exec(
        select(Organization).where(Organization.slug == "demo-org")
    ).one_or_none()
    if organization:
        return organization

    organization = Organization(
        name="Demo Org",
        slug="demo-org",
        timezone="Europe/Moscow",
        description="Demo organization for local development",
    )
    session.add(organization)
    session.commit()
    session.refresh(organization)
    return organization


def ensure_user(
    session: Session,
    *,
    email: str,
    full_name: str,
    password: str,
    organization_id,
) -> User:
    user = session.exec(select(User).where(User.email == email)).one_or_none()
    if user:
        return user

    user = User(
        email=email,
        full_name=full_name,
        hashed_password=get_password_hash(password),
        organization_id=organization_id,
        role="employee",
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def main() -> None:
    with Session(engine) as session:
        org = ensure_organization(session)

        demo_accounts = [
            ("alice@example.com", "Alice Demo", "Password123!"),
            ("bob@example.com", "Bob Demo", "Password123!"),
        ]

        for email, full_name, password in demo_accounts:
            user = ensure_user(
                session,
                email=email,
                full_name=full_name,
                password=password,
                organization_id=org.id,
            )
            print(f"✔ User ensured: {user.email}")


if __name__ == "__main__":
    main()









