# Celery Beat - Настройка периодических задач

## Описание

Celery Beat - это планировщик задач для Celery. Он запускает задачи по расписанию.

В нашем проекте используется для:
- **Отправка напоминаний о событиях** - каждую минуту проверяет события, которые начнутся через 5 минут, и создает напоминания

## Текущие периодические задачи

### send-event-reminders
- **Расписание**: Каждую минуту (60 секунд)
- **Задача**: `app.tasks.reminders.send_event_reminders`
- **Описание**: Находит события, начинающиеся через 5 минут, и создает напоминания для участников
- **Логика**:
  - Проверяет события в окне 4-6 минут от текущего времени
  - Создает уведомления типа `event_reminder` для участников
  - Не дублирует напоминания (проверяет существующие)
  - Не отправляет напоминания для отмененных событий и участников, которые отклонили приглашение

## Запуск Celery Beat на сервере

### 1. Создание systemd сервиса для Celery Beat

Создайте файл `/etc/systemd/system/planner-celery-beat.service`:

```ini
[Unit]
Description=Planner Celery Beat Service
After=network.target redis.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/planner/backend
Environment="PATH=/opt/planner/backend/venv/bin"
ExecStart=/opt/planner/backend/venv/bin/celery -A app.celery_app beat --loglevel=info

Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 2. Включение и запуск сервиса

```bash
# Перезагрузить systemd для применения изменений
sudo systemctl daemon-reload

# Включить автозапуск
sudo systemctl enable planner-celery-beat

# Запустить сервис
sudo systemctl start planner-celery-beat

# Проверить статус
sudo systemctl status planner-celery-beat
```

### 3. Управление сервисом

```bash
# Остановить
sudo systemctl stop planner-celery-beat

# Перезапустить
sudo systemctl restart planner-celery-beat

# Просмотр логов
sudo journalctl -u planner-celery-beat -f
```

## Проверка работы

### Просмотр логов Celery Beat
```bash
sudo journalctl -u planner-celery-beat -f
```

Вы должны видеть:
```
[2026-01-16 12:34:00,123: INFO] Scheduler: Sending due task send-event-reminders
[Reminder Task] Finished: 2 created, 0 skipped, 1 events checked
```

### Просмотр логов Celery Worker
```bash
sudo journalctl -u planner-celery -f
```

Вы должны видеть выполнение задач:
```
[2026-01-16 12:34:00,456: INFO] Task app.tasks.reminders.send_event_reminders[...] succeeded
[Reminder] Created reminder for user ... about event '...' (starts at ...)
```

## Важные замечания

1. **Celery Beat и Celery Worker - это разные процессы**:
   - **Celery Worker** (`planner-celery.service`) - выполняет задачи
   - **Celery Beat** (`planner-celery-beat.service`) - планирует задачи по расписанию
   - Оба должны работать одновременно!

2. **Часовой пояс**:
   - Celery Beat работает в UTC (настройка в `celery_app.py`)
   - Задача `send_event_reminders` конвертирует время в Московское (UTC+3)

3. **Redis**:
   - Celery Beat хранит свое состояние в Redis
   - Убедитесь что Redis работает: `sudo systemctl status redis`

4. **Перезапуск после изменений**:
   - После изменения кода задач или расписания нужно перезапустить оба сервиса:
     ```bash
     sudo systemctl restart planner-celery-beat
     sudo systemctl restart planner-celery
     ```

## Мониторинг

### Проверка что оба сервиса работают
```bash
sudo systemctl status planner-celery
sudo systemctl status planner-celery-beat
```

Оба должны быть в статусе `active (running)`.

### Проверка создания напоминаний в БД
```bash
PGPASSWORD='YtragtR65A' psql -U planner_user -c "SELECT COUNT(*) FROM notifications WHERE type = 'event_reminder' AND created_at > NOW() - INTERVAL '5 minutes';"
```

## Отладка

### Если задачи не выполняются:
1. Проверьте что Beat запущен: `sudo systemctl status planner-celery-beat`
2. Проверьте что Worker запущен: `sudo systemctl status planner-celery`
3. Проверьте логи Beat: `sudo journalctl -u planner-celery-beat -n 50`
4. Проверьте логи Worker: `sudo journalctl -u planner-celery -n 50`
5. Проверьте Redis: `redis-cli ping` (должен ответить `PONG`)

### Если задачи выполняются, но напоминания не создаются:
1. Проверьте логи Worker на наличие ошибок
2. Проверьте что есть события которые начнутся через 5 минут
3. Проверьте что события имеют участников
4. Проверьте что участники не отклонили приглашение (`response_status != 'declined'`)

## Добавление новых периодических задач

Чтобы добавить новую задачу:

1. Создайте задачу в `backend/app/tasks/`:
```python
@celery_app.task(name="app.tasks.example.my_task")
def my_task():
    # ... ваш код ...
    pass
```

2. Добавьте в `beat_schedule` в `backend/app/celery_app.py`:
```python
celery_app.conf.beat_schedule = {
    "my-task": {
        "task": "app.tasks.example.my_task",
        "schedule": 300.0,  # Каждые 5 минут
    },
}
```

3. Перезапустите сервисы:
```bash
sudo systemctl restart planner-celery-beat
sudo systemctl restart planner-celery
```

