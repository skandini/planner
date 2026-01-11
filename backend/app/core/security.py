from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

os.environ.setdefault("PASSLIB_BCRYPT_STRICT", "0")

# Патчим passlib ДО импорта CryptContext для обхода проверки бага обертки bcrypt
# которая использует длинный тестовый пароль (>72 байт)
try:
    # Импортируем модуль passlib.handlers.bcrypt
    import passlib.handlers.bcrypt as bcrypt_module
    
    # Патчим функцию detect_wrap_bug - это статический метод класса
    def _patched_detect_wrap_bug(ident):
        # Всегда возвращаем False, чтобы пропустить проверку с длинным паролем
        return False
    
    # Применяем патч на всех возможных уровнях
    # 1. Патчим функцию в модуле
    bcrypt_module.detect_wrap_bug = _patched_detect_wrap_bug
    
    # 2. Патчим через __dict__ модуля
    if hasattr(bcrypt_module, '__dict__'):
        bcrypt_module.__dict__['detect_wrap_bug'] = _patched_detect_wrap_bug
    
    # 3. Патчим все классы bcrypt в модуле
    for name in dir(bcrypt_module):
        try:
            obj = getattr(bcrypt_module, name, None)
            if obj is None:
                continue
                
            # Если это класс
            if isinstance(obj, type):
                # Патчим через __dict__ класса
                if hasattr(obj, '__dict__'):
                    obj.__dict__['detect_wrap_bug'] = staticmethod(_patched_detect_wrap_bug)
                # Также патчим через setattr
                setattr(obj, 'detect_wrap_bug', staticmethod(_patched_detect_wrap_bug))
                
                # Патчим все классы в MRO (Method Resolution Order)
                for cls in obj.__mro__:
                    if hasattr(cls, '__dict__'):
                        cls.__dict__['detect_wrap_bug'] = staticmethod(_patched_detect_wrap_bug)
                    setattr(cls, 'detect_wrap_bug', staticmethod(_patched_detect_wrap_bug))
        except Exception:
            # Игнорируем ошибки при патчинге отдельных атрибутов
            pass
    
    # 4. Патчим _bcrypt.hashpw напрямую для обрезки паролей
    try:
        import bcrypt as _bcrypt_module
        _original_hashpw = _bcrypt_module.hashpw
        
        def _patched_hashpw(secret, salt):
            # Обрезаем пароль до 72 байт перед передачей в bcrypt
            if isinstance(secret, bytes):
                if len(secret) > 72:
                    secret = secret[:72]
            elif isinstance(secret, str):
                secret_bytes = secret.encode('utf-8')
                if len(secret_bytes) > 72:
                    truncated = secret_bytes[:72]
                    while truncated and (truncated[-1] & 0b11000000) == 0b10000000:
                        truncated = truncated[:-1]
                    secret = truncated if truncated else secret_bytes[:72]
            return _original_hashpw(secret, salt)
        
        _bcrypt_module.hashpw = _patched_hashpw
        # Также патчим в passlib.handlers.bcrypt, если он использует свой импорт
        if hasattr(bcrypt_module, '_bcrypt'):
            bcrypt_module._bcrypt.hashpw = _patched_hashpw
    except Exception:
        # Если не удалось патчить _bcrypt, продолжаем без этого
        pass
        
except Exception as e:
    # Если патч не удался, логируем и продолжаем
    import logging
    logging.warning(f"Failed to patch bcrypt detect_wrap_bug: {e}")

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# Инициализируем CryptContext после патча
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
    if not password:
        return password
    
    password_bytes = password.encode('utf-8')
    if len(password_bytes) <= 72:
        return password
    
    # Обрезаем до 72 байт
    truncated = password_bytes[:72]
    
    # Удаляем неполные UTF-8 последовательности в конце
    # UTF-8 байты начинающиеся с 10xxxxxx (0x80-0xBF) являются продолжением
    while truncated and (truncated[-1] & 0b11000000) == 0b10000000:
        truncated = truncated[:-1]
        # Если удалили все байты, возвращаем пустую строку
        if not truncated:
            return ""
    
    # Декодируем с заменой невалидных символов
    try:
        password = truncated.decode('utf-8', errors='replace')
    except Exception:
        # Если не удалось декодировать, используем только ASCII символы
        password = truncated.decode('ascii', errors='ignore')
    
    # Финальная проверка - убеждаемся, что результат не длиннее 72 байт
    final_bytes = password.encode('utf-8')
    if len(final_bytes) > 72:
        # Если все еще длиннее, обрезаем еще раз
        truncated = final_bytes[:72]
        while truncated and (truncated[-1] & 0b11000000) == 0b10000000:
            truncated = truncated[:-1]
        password = truncated.decode('utf-8', errors='replace')
    
    return password


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # bcrypt имеет ограничение на длину пароля в 72 байта
    # Обрезаем пароль до 72 байт, если он длиннее
    plain_password = _truncate_password(plain_password)
    
    # Финальная проверка - гарантируем, что пароль не длиннее 72 байт
    password_bytes = plain_password.encode('utf-8')
    if len(password_bytes) > 72:
        # Агрессивная обрезка до 72 байт
        truncated = password_bytes[:72]
        # Удаляем неполные UTF-8 последовательности
        while truncated and (truncated[-1] & 0b11000000) == 0b10000000:
            truncated = truncated[:-1]
        if truncated:
            plain_password = truncated.decode('utf-8', errors='replace')
        else:
            # Если после обрезки ничего не осталось, возвращаем False
            return False
    
    # Еще одна финальная проверка перед вызовом bcrypt
    final_check = plain_password.encode('utf-8')
    if len(final_check) > 72:
        # Если все еще длиннее, обрезаем до 72 байт напрямую
        plain_password = final_check[:72].decode('utf-8', errors='replace')
    
    # Множественные попытки с разными вариантами обрезки
    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            return pwd_context.verify(plain_password, hashed_password)
        except (ValueError, Exception) as e:
            error_str = str(e).lower()
            # Если ошибка связана с длиной пароля
            if "72" in error_str or "bytes" in error_str or "truncate" in error_str or "longer" in error_str:
                if attempt < max_attempts - 1:
                    # Пробуем еще более агрессивную обрезку
                    password_bytes = plain_password.encode('utf-8')
                    if len(password_bytes) > 72:
                        # Обрезаем до 72 байт
                        truncated = password_bytes[:72]
                        # Удаляем все байты продолжения UTF-8
                        while truncated and (truncated[-1] & 0b11000000) == 0b10000000:
                            truncated = truncated[:-1]
                        if truncated:
                            plain_password = truncated.decode('utf-8', errors='replace')
                            # Проверяем еще раз длину
                            if len(plain_password.encode('utf-8')) <= 72:
                                continue
                    # Если не удалось обрезать, возвращаем False
                    return False
                else:
                    # Последняя попытка - возвращаем False
                    return False
            else:
                # Если ошибка не связана с длиной пароля, пробрасываем дальше
                raise


def get_password_hash(password: str) -> str:
    # bcrypt имеет ограничение на длину пароля в 72 байта
    # Обрезаем пароль до 72 байт, если он длиннее
    password = _truncate_password(password)
    return pwd_context.hash(password)

