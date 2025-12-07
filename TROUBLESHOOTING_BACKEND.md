# Диагностика проблем с бэкендом

## Проблема: "Backend server is not available" даже когда бэкенд запущен

### Шаг 1: Проверьте, что бэкенд действительно запущен

Откройте PowerShell и выполните:

```powershell
# Проверка, слушает ли что-то на порту 8000
Test-NetConnection -ComputerName localhost -Port 8000

# Или проверьте процессы Python
Get-Process | Where-Object {$_.ProcessName -like "*python*" -or $_.ProcessName -like "*uvicorn*"}
```

### Шаг 2: Проверьте, на каком порту запущен бэкенд

В терминале, где запущен бэкенд, должно быть сообщение:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

Если порт другой, обновите `NEXT_PUBLIC_API_BASE_URL` в `.env.local` фронтенда.

### Шаг 3: Проверьте health endpoint вручную

Откройте в браузере:
```
http://localhost:8000/api/v1/health
```

Должен вернуться: `{"status":"ok"}`

Если не открывается:
- Бэкенд не запущен
- Бэкенд запущен на другом порту
- Есть проблема с сетью

### Шаг 4: Проверьте CORS настройки

Файл: `backend/app/core/config.py`

Должно быть:
```python
BACKEND_CORS_ORIGINS: List[str] = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]
```

### Шаг 5: Проверьте консоль браузера

Откройте DevTools (F12) → Console и проверьте:
- Есть ли ошибки CORS
- Какие именно ошибки при запросах
- Правильно ли формируются URL

### Шаг 6: Проверьте логи бэкенда

В терминале, где запущен бэкенд, должны быть логи запросов:
```
INFO:     127.0.0.1:xxxxx - "GET /api/v1/calendars/.../availability HTTP/1.1" 200 OK
```

Если запросы не приходят:
- Проблема с CORS
- Проблема с аутентификацией
- Неправильный URL

### Шаг 7: Перезапустите бэкенд

1. Остановите бэкенд (Ctrl+C)
2. Запустите заново:
   ```powershell
   cd backend
   .\.venv\Scripts\Activate.ps1
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

### Шаг 8: Проверьте переменные окружения фронтенда

Файл: `frontend/.env.local` (если есть)

Должно быть:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

Или проверьте `frontend/src/lib/constants.ts`:
```typescript
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
```

## Частые проблемы

### 1. Бэкенд запущен на другом порту
**Решение:** Проверьте порт в логах бэкенда и обновите `API_BASE_URL`

### 2. CORS ошибка
**Решение:** Убедитесь, что `BACKEND_CORS_ORIGINS` включает `http://localhost:3000`

### 3. Проблема с аутентификацией
**Решение:** Проверьте, что токен передается в заголовке `Authorization: Bearer <token>`

### 4. Бэкенд не отвечает
**Решение:** Перезапустите бэкенд и проверьте логи на наличие ошибок

## Диагностические команды

```powershell
# Проверка порта
Test-NetConnection -ComputerName localhost -Port 8000

# Проверка процессов
Get-Process | Where-Object {$_.ProcessName -like "*python*"}

# Проверка health endpoint
Invoke-WebRequest -Uri "http://localhost:8000/api/v1/health" -UseBasicParsing
```

