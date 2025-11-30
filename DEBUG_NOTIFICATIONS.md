# Отладка проблемы с удалением уведомлений

## Проблема
Ошибка "Failed to fetch" при PATCH запросе к `/api/v1/notifications/{id}`

## Шаги для диагностики

### 1. Проверьте, что backend запущен

```powershell
# Проверьте, что backend отвечает
Invoke-WebRequest -Uri "http://localhost:8000/api/v1/health" -Method GET
```

Если не отвечает - запустите backend:
```powershell
cd backend
uvicorn app.main:app --reload
```

### 2. Проверьте логи в консоли браузера

Откройте DevTools (F12) → Console и найдите логи:
- `[API] PATCH http://localhost:8000/api/v1/notifications/...`
- `[API] Fetch options for PATCH ...`
- `[API] Attempting fetch to: ...`
- `[API Error] Failed to fetch: ...`

### 3. Проверьте Network tab

1. Откройте DevTools (F12) → Network
2. Попробуйте удалить уведомление
3. Найдите PATCH запрос к `/api/v1/notifications/{id}`
4. Проверьте:
   - **Status**: Что показывает? (200, 404, CORS error, Failed?)
   - **Request Headers**: Есть ли `Authorization: Bearer ...`?
   - **Request Payload**: `{"is_deleted": true}`?
   - **Response**: Что в ответе?

### 4. Проверьте, работает ли markAsRead

Попробуйте отметить уведомление как прочитанное - работает ли? Если работает, значит проблема специфична для `is_deleted`.

### 5. Проверьте backend логи

В терминале где запущен backend должны быть логи:
```
INFO:     127.0.0.1:xxxxx - "PATCH /api/v1/notifications/... HTTP/1.1" 200 OK
```

Если нет логов - запрос не доходит до backend (проблема сети/CORS).

### 6. Проверьте CORS настройки

Убедитесь, что в `backend/app/core/config.py` есть ваш порт:
```python
BACKEND_CORS_ORIGINS: List[str] = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]
```

И **перезапустите backend** после изменений!

### 7. Проверьте миграцию

Убедитесь, что миграция применена:
```powershell
cd backend
python -m alembic current
```

Должно показать: `a1b2c3d4e5f6 (head)`

## Возможные причины

1. **Backend не запущен** - самая частая причина
2. **Backend не перезапущен** после изменений в коде
3. **Миграция не применена** - поле `is_deleted` не существует в БД
4. **CORS проблема** - порт frontend не в списке разрешенных
5. **Проблема с токеном** - токен истек или не передается

## Быстрая проверка

Выполните в консоли браузера:
```javascript
fetch('http://localhost:8000/api/v1/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

Если ошибка - backend не доступен.
Если работает - проблема в запросе с токеном.

