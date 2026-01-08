# Быстрый запуск сервера

## Порт 8000 теперь свободен! ✅

## Запуск сервера

### Вариант 1: Через PowerShell скрипт (рекомендуется)

```powershell
cd backend
.\start_server.ps1
```

### Вариант 2: Вручную

```powershell
cd backend

# Активация виртуального окружения (если есть)
.\.venv\Scripts\Activate.ps1

# Запуск сервера
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Проверка работы

После запуска сервера откройте в браузере:

- **Swagger документация:** http://localhost:8000/docs
- **Health check:** http://localhost:8000/api/v1/health/
- **Readiness check:** http://localhost:8000/api/v1/health/ready

Или запустите проверку:

```powershell
python backend/check_system.py
```

## Если возникнут проблемы

1. **Порт занят:**
   ```powershell
   netstat -ano | findstr :8000
   taskkill /F /PID <PID>
   ```

2. **Ошибки импорта:**
   ```powershell
   pip install -r requirements.txt
   ```

3. **Проблемы с БД:**
   ```powershell
   alembic upgrade head
   ```

## Что было исправлено

- ✅ Исправлена конфигурация slowapi (rate limiting)
- ✅ Остановлены зависшие процессы
- ✅ Порт 8000 освобожден

Теперь сервер должен запускаться без проблем!



