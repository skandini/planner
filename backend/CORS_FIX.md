# Исправление CORS ошибки для DELETE запросов

## Проблема
CORS error при DELETE запросах к `/api/v1/notifications/{id}`

## Решение

### 1. Обновлены настройки CORS

Файл `backend/app/core/config.py` обновлен для поддержки нескольких портов:
- `http://localhost:3000`
- `http://localhost:3001`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:3001`

### 2. ВАЖНО: Перезапустите backend!

После изменения настроек CORS **обязательно перезапустите backend сервер**, иначе изменения не применятся (из-за кэширования `@lru_cache`).

```powershell
# Остановите backend (Ctrl+C)
# Затем запустите снова:
cd backend
uvicorn app.main:app --reload
```

### 3. Если Next.js работает на другом порту

Если Next.js работает на порту, которого нет в списке (например, 3002), добавьте его в `backend/app/core/config.py`:

```python
BACKEND_CORS_ORIGINS: List[str] = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",  # Добавьте свой порт
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
]
```

И снова перезапустите backend.

### 4. Альтернатива: использовать переменную окружения

Можно задать CORS origins через переменную окружения в `.env` файле:

```env
BACKEND_CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001
```

### 5. Проверка

После перезапуска backend:
1. Откройте DevTools (F12) → Network
2. Попробуйте удалить уведомление
3. Проверьте, что OPTIONS запрос возвращает статус 200
4. DELETE запрос должен пройти успешно

## Примечание

В production используйте конкретные домены вместо `localhost`!

