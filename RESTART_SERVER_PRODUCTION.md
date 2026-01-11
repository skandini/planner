# Перезапуск сервера на продакшене

## Проблема
Порт 8000 занят системным сервисом `planner-backend`. Нужно перезапустить сервис через systemd.

## Решение: Перезапустить systemd сервис

```bash
# 1. Перезапустить сервис (применяет изменения автоматически)
sudo systemctl restart planner-backend

# 2. Проверить статус
sudo systemctl status planner-backend

# 3. Проверить логи (если есть ошибки)
sudo journalctl -u planner-backend -f --lines 50

# 4. Проверить, что сервер отвечает
curl http://localhost:8000/api/v1/health
```

## Альтернатива: Остановить и запустить заново

```bash
# 1. Остановить сервис
sudo systemctl stop planner-backend

# 2. Подождать секунду
sleep 1

# 3. Запустить сервис
sudo systemctl start planner-backend

# 4. Проверить статус
sudo systemctl status planner-backend
```

## Если нужно запустить вручную (для отладки)

```bash
# 1. Остановить systemd сервис
sudo systemctl stop planner-backend

# 2. Подождать, чтобы порт освободился
sleep 2

# 3. Перейти в директорию
cd /opt/planner/backend
source .venv/bin/activate

# 4. Запустить вручную
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

# НО: после отладки нужно запустить обратно через systemd:
# sudo systemctl start planner-backend
```

## Проверка работы после перезапуска

```bash
# Проверить статус сервиса
sudo systemctl status planner-backend

# Проверить, что порт 8000 слушается
sudo ss -tlnp | grep :8000

# Проверить API
curl http://localhost:8000/api/v1/health

# Проверить логи
sudo journalctl -u planner-backend --since "5 minutes ago"
```

