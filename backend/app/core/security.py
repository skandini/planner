from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

os.environ.setdefault("PASSLIB_BCRYPT_STRICT", "0")

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_token(
    subject: str | Any,
    expires_delta: timedelta,
    token_type: str,
) -> str:
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {
        "exp": now + expires_delta,
        "iat": now,
        "sub": str(subject),
        "type": token_type,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(subject: str | Any) -> str:
    return create_token(
        subject,
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "access",
    )


def create_refresh_token(subject: str | Any) -> str:
    return create_token(
        subject,
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "refresh",
    )


def verify_token(token: str, token_type: str = "access") -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") != token_type:
            raise JWTError("Invalid token type")
        return payload
    except JWTError as exc:
        raise ValueError("Invalid token") from exc


def _truncate_password(password: str) -> str:
    """
    Обрезает пароль до 72 байт для совместимости с bcrypt.
    bcrypt имеет ограничение на длину пароля в 72 байта.
    """
    password_bytes = password.encode('utf-8')
    if len(password_bytes) > 72:
        # Обрезаем до 72 байт
        truncated = password_bytes[:72]
        # Удаляем неполные UTF-8 последовательности в конце
        # UTF-8 байты начинающиеся с 10xxxxxx (0x80-0xBF) являются продолжением
        while truncated and (truncated[-1] & 0b11000000) == 0b10000000:
            truncated = truncated[:-1]
        # Декодируем с заменой невалидных символов
        password = truncated.decode('utf-8', errors='replace')
    return password


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # bcrypt имеет ограничение на длину пароля в 72 байта
    # Обрезаем пароль до 72 байт, если он длиннее
    try:
        plain_password = _truncate_password(plain_password)
        return pwd_context.verify(plain_password, hashed_password)
    except ValueError as e:
        # Если все еще возникает ошибка с длиной пароля, пробуем еще раз с обрезанным
        if "72" in str(e) or "bytes" in str(e).lower():
            # Пароль уже обрезан, но если все еще ошибка, пробуем еще раз
            password_bytes = plain_password.encode('utf-8')
            if len(password_bytes) > 72:
                truncated = password_bytes[:72]
                while truncated and (truncated[-1] & 0b11000000) == 0b10000000:
                    truncated = truncated[:-1]
                plain_password = truncated.decode('utf-8', errors='replace')
                return pwd_context.verify(plain_password, hashed_password)
        raise


def get_password_hash(password: str) -> str:
    # bcrypt имеет ограничение на длину пароля в 72 байта
    # Обрезаем пароль до 72 байт, если он длиннее
    password = _truncate_password(password)
    return pwd_context.hash(password)

