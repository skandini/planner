# Инструкция по деплою изменений Redis + Celery

## 📋 Что было изменено:

1. **Новые файлы:**
   - `backend/app/celery_app.py`
   - `backend/app/core/cache.py`
   - `backend/app/core/limiter.py`
   - `backend/app/tasks/notifications.py`
   - `backend/app/tasks/__init__.py`
   - `backend/scripts/setup_celery.sh`
   - `backend/scripts/celery_worker.service`

2. **Измененные файлы:**
   - `backend/requirements.txt` (добавлены celery, redis, slowapi)
   - `backend/app/core/config.py` (добавлены настройки Redis)
   - `backend/app/api/v1/events.py` (заменены уведомления на Celery)

---

## 🚀 Вариант 1: Через Git (рекомендуется)

### Шаг 1: Локально - закоммитить и запушить изменения

```bash
# Добавить все изменения
git add .

# Закоммитить
git commit -m "Add Redis + Celery for async notifications with guaranteed delivery"

# Запушить в репозиторий
git push origin testmain
```

### Шаг 2: На сервере - обновить код

```bash
# Подключиться к серверу
ssh root@155.212.190.153

# Перейти в директорию проекта
cd /opt/planner

# Обновить код из git
git pull origin testmain

# Перейти в backend
cd backend
```

### Шаг 3: Установить зависимости

```bash
# Активировать виртуальное окружение
source .venv/bin/activate

# Установить новые зависимости
pip install -r requirements.txt
```

### Шаг 4: Настроить Celery worker

```bash
# Сделать скрипт исполняемым
chmod +x scripts/setup_celery.sh

# Запустить настройку
./scripts/setup_celery.sh
```

### Шаг 5: Перезапустить backend

```bash
sudo systemctl restart planner-backend
```

### Шаг 6: Проверить работу

```bash
# Проверить статус Celery worker
sudo systemctl status planner-celery-worker

# Проверить логи
sudo journalctl -u planner-celery-worker -f
```

---

## 🔧 Вариант 2: Прямое копирование файлов (если нет git)

Если по каким-то причинам не хотите использовать git, можно скопировать файлы напрямую:

### На локальной машине:

```bash
# Создать архив с изменениями
tar -czf celery_changes.tar.gz \
  backend/app/celery_app.py \
  backend/app/core/cache.py \
  backend/app/core/limiter.py \
  backend/app/tasks/ \
  backend/scripts/setup_celery.sh \
  backend/scripts/celery_worker.service \
  backend/requirements.txt \
  backend/app/core/config.py \
  backend/app/api/v1/events.py
```

### На сервере:

```bash
# Скопировать архив на сервер (с локальной машины)
scp celery_changes.tar.gz root@155.212.190.153:/opt/planner/

# На сервере распаковать
cd /opt/planner
tar -xzf celery_changes.tar.gz

# Установить зависимости
cd backend
source .venv/bin/activate
pip install -r requirements.txt

# Настроить Celery
chmod +x scripts/setup_celery.sh
./scripts/setup_celery.sh

# Перезапустить backend
sudo systemctl restart planner-backend
```

---

## ✅ Проверка после деплоя

1. **Проверить статус сервисов:**
   ```bash
   sudo systemctl status planner-backend
   sudo systemctl status planner-celery-worker
   sudo systemctl status redis-server
   ```

2. **Проверить логи:**
   ```bash
   # Backend логи
   sudo journalctl -u planner-backend -n 50
   
   # Celery логи
   sudo journalctl -u planner-celery-worker -n 50
   ```

3. **Проверить Redis:**
   ```bash
   redis-cli ping
   # Должно вернуть: PONG
   ```

4. **Проверить Celery:**
   ```bash
   cd /opt/planner/backend
   source .venv/bin/activate
   celery -A app.celery_app inspect registered
   # Должны быть видны задачи: notify_event_invited_task, notify_event_updated_task и т.д.
   ```

5. **Тестирование:**
   - Создать событие с участниками через API
   - Проверить, что уведомления создаются в БД
   - Проверить логи Celery - должны быть записи о выполнении задач

---

## 🐛 Если что-то пошло не так

### Backend не запускается:

```bash
# Проверить логи
sudo journalctl -u planner-backend -n 100

# Проверить синтаксис Python
cd /opt/planner/backend
source .venv/bin/activate
python -m py_compile app/celery_app.py
python -m py_compile app/tasks/notifications.py
```

### Celery worker не запускается:

```bash
# Проверить логи
sudo journalctl -u planner-celery-worker -n 100

# Проверить вручную
cd /opt/planner/backend
source .venv/bin/activate
celery -A app.celery_app worker --loglevel=info
```

### Redis недоступен:

```bash
# Проверить статус
sudo systemctl status redis-server

# Перезапустить
sudo systemctl restart redis-server

# Проверить подключение
redis-cli ping
```

---

## 📝 Резюме

**Рекомендуемый порядок:**
1. ✅ Закоммитить изменения локально
2. ✅ Запушить в git
3. ✅ На сервере: `git pull`
4. ✅ Установить зависимости: `pip install -r requirements.txt`
5. ✅ Настроить Celery: `./scripts/setup_celery.sh`
6. ✅ Перезапустить backend: `sudo systemctl restart planner-backend`
7. ✅ Проверить работу всех сервисов

