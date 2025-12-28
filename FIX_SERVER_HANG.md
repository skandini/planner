# Быстрое исправление: Сервер зависает

## Проблема
Сервер запущен, но не отвечает на HTTP запросы (timeout).

## Решение

### Вариант 1: Исправлена конфигурация slowapi (рекомендуется)

Конфигурация slowapi обновлена. Теперь нужно:

1. **Остановить зависший процесс:**
   ```powershell
   # Найти PID процесса на порту 8000
   netstat -ano | findstr :8000
   
   # Остановить (замените PID)
   taskkill /F /PID <PID>
   ```

2. **Перезапустить сервер:**
   ```powershell
   cd backend
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

3. **Проверить:**
   ```powershell
   python backend/quick_check.py
   ```

### Вариант 2: Временно отключить rate limiting (если вариант 1 не помог)

Если проблема сохраняется, временно отключите rate limiting:

1. **В `backend/app/main.py` закомментируйте:**
   ```python
   # app.state.limiter = limiter
   ```

2. **В `backend/app/api/v1/auth.py` закомментируйте декораторы:**
   ```python
   # @limiter.limit("5/minute")
   def register_user(...):
   
   # @limiter.limit("10/minute")
   def login(...):
   ```

3. **Перезапустите сервер**

## Проверка

После исправления запустите:
```powershell
python backend/check_system.py
```

Должны пройти все проверки.


