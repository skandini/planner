# Инструкция: Перезапуск зависшего сервера

## Проблема
Сервер завис и не отвечает на запросы. Нужно его перезапустить.

## Шаги для исправления

### 1. Остановить зависший процесс

```powershell
# Найти процессы на порту 8000
netstat -ano | findstr :8000

# Остановить все процессы Python, которые могут быть сервером
Get-Process python | Where-Object {$_.Path -like "*python*"} | Stop-Process -Force
```

Или более точно:
```powershell
# Найти PID процесса (из вывода netstat)
# Например, если PID = 43848:
taskkill /F /PID 43848
taskkill /F /PID 32172
```

### 2. Проверить, что порт свободен

```powershell
netstat -ano | findstr :8000
```

Если порт все еще занят, подождите несколько секунд и проверьте снова.

### 3. Перезапустить сервер

```powershell
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Проверить работу

В другом терминале:
```powershell
# Быстрая проверка
python -c "import requests; r = requests.get('http://localhost:8000/api/v1/health/', timeout=5); print(f'Status: {r.status_code}'); print(r.json())"
```

Или откройте в браузере:
- http://localhost:8000/docs
- http://localhost:8000/api/v1/health/

## Если проблема повторяется

Если сервер снова зависает, возможно проблема в rate limiting. Временно отключите его:

1. В `backend/app/main.py` закомментируйте:
   ```python
   # app.state.limiter = limiter
   ```

2. В `backend/app/api/v1/auth.py` закомментируйте декораторы:
   ```python
   # @limiter.limit("5/minute")
   def register_user(...):
   
   # @limiter.limit("10/minute")  
   def login(...):
   ```

3. Перезапустите сервер

## Альтернатива: Использовать другой порт

Если порт 8000 проблемный, используйте другой:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

И обновите `check_system.py` и `quick_check.py` с новым портом.

