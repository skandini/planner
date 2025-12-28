# Инструкция по настройке Redis + Celery

## ✅ Что уже сделано локально:

1. ✅ Добавлены зависимости в `requirements.txt`:
   - `celery==5.3.4`
   - `redis==5.0.1`
   - `slowapi==0.1.9`

2. ✅ Созданы файлы:
   - `backend/app/celery_app.py` - конфигурация Celery
   - `backend/app/tasks/notifications.py` - Celery tasks для уведомлений
   - `backend/app/core/cache.py` - Redis кеш
   - `backend/app/core/limiter.py` - Redis rate limiting
   - `backend/scripts/setup_celery.sh` - скрипт настройки Celery worker

3. ✅ Обновлены endpoints в `backend/app/api/v1/events.py`:
   - Заменены синхронные уведомления на Celery tasks
   - Все уведомления теперь выполняются асинхронно

4. ✅ Обновлен `backend/app/core/config.py`:
   - Добавлены настройки Redis и Celery

---

## 🚀 Шаги для настройки на сервере:

### Шаг 1: Установить зависимости (уже выполнено - Redis установлен)

```bash
# Redis уже установлен и запущен
# Проверить: redis-cli ping
```

### Шаг 2: Установить Python зависимости

```bash
cd /opt/planner/backend
source .venv/bin/activate
pip install -r requirements.txt
```

### Шаг 3: Обновить .env файл (если нужно)

Проверить, что в `.env` есть настройки Redis (по умолчанию используются значения из config.py):

```env
# Опционально, если нужно изменить URL Redis
REDIS_URL=redis://localhost:6379/0
REDIS_CACHE_URL=redis://localhost:6379/1
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### Шаг 4: Настроить Celery worker

```bash
cd /opt/planner/backend
chmod +x scripts/setup_celery.sh
./scripts/setup_celery.sh
```

Этот скрипт:
- Проверит виртуальное окружение
- Установит зависимости если нужно
- Создаст systemd service для Celery worker
- Запустит и включит автозапуск

### Шаг 5: Перезапустить backend (если он запущен)

```bash
sudo systemctl restart planner-backend
```

### Шаг 6: Проверить работу

```bash
# Проверить статус Celery worker
sudo systemctl status planner-celery-worker

# Проверить логи Celery
sudo journalctl -u planner-celery-worker -f

# Проверить статус backend
sudo systemctl status planner-backend

# Проверить логи backend
sudo journalctl -u planner-backend -f
```

### Шаг 7: Тестирование

1. Создать событие с участниками через API
2. Проверить, что уведомления создаются в БД
3. Проверить логи Celery worker - должны быть записи о выполнении задач

---

## 🔍 Проверка работы Redis

```bash
# Проверить подключение
redis-cli ping
# Должно вернуть: PONG

# Проверить очереди Celery
redis-cli
> KEYS celery*
> LLEN celery  # Длина очереди задач
> EXIT
```

---

## 📊 Мониторинг Celery

### Просмотр активных задач:

```bash
cd /opt/planner/backend
source .venv/bin/activate
celery -A app.celery_app inspect active
```

### Просмотр зарегистрированных задач:

```bash
celery -A app.celery_app inspect registered
```

### Просмотр статистики:

```bash
celery -A app.celery_app inspect stats
```

---

## 🐛 Troubleshooting

### Celery worker не запускается

```bash
# Проверить логи
sudo journalctl -u planner-celery-worker -n 50

# Проверить, что Redis доступен
redis-cli ping

# Проверить виртуальное окружение
ls -la /opt/planner/backend/.venv/bin/celery
```

### Задачи не выполняются

```bash
# Проверить, что worker запущен
sudo systemctl status planner-celery-worker

# Проверить очереди в Redis
redis-cli
> KEYS *
> LLEN celery
> EXIT

# Проверить логи worker
sudo journalctl -u planner-celery-worker -f
```

### Ошибки подключения к Redis

```bash
# Проверить статус Redis
sudo systemctl status redis-server

# Проверить доступность
redis-cli ping

# Проверить конфигурацию в .env
cat /opt/planner/backend/.env | grep REDIS
```

---

## 📝 Структура Redis баз данных

- **DB 0**: Celery broker и results (CELERY_BROKER_URL, CELERY_RESULT_BACKEND)
- **DB 1**: Кеш (REDIS_CACHE_URL)
- **DB 2**: Rate limiting (limiter.py использует REDIS_URL?db=2)

---

## ✅ Чеклист

- [ ] Redis установлен и запущен
- [ ] Python зависимости установлены (celery, redis)
- [ ] .env файл обновлен (опционально)
- [ ] Celery worker настроен через setup_celery.sh
- [ ] Backend перезапущен
- [ ] Проверены логи Celery worker
- [ ] Протестировано создание события с уведомлениями

---

## 🎉 Готово!

После выполнения всех шагов:
- ✅ Уведомления будут обрабатываться через Celery
- ✅ Кеш будет использовать Redis
- ✅ Rate limiting будет работать через Redis
- ✅ Гарантия доставки уведомлений (задачи в очереди)
- ✅ Параллельная обработка уведомлений
- ✅ Retry механизм при ошибках

