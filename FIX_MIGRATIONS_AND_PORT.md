# Решение проблем с миграциями и портом 8000

## Проблема 1: Ошибка миграций Alembic
**Ошибка:** `Can't locate revision identified by 'add_composite_indexes'`

Эта ошибка означает, что в базе данных есть запись о миграции, которой нет в файлах миграций на сервере.

### Решение 1: Проверить текущую версию миграции в БД

```bash
cd /opt/planner/backend
source .venv/bin/activate

# Подключиться к PostgreSQL и проверить текущую версию
psql -U your_user -d your_database -c "SELECT * FROM alembic_version;"
```

### Решение 2: Обновить версию миграции вручную

Если в базе данных записана несуществующая миграция, нужно обновить её до последней реальной версии:

```bash
# Сначала узнайте последнюю ревизию из файлов миграций
cd /opt/planner/backend
ls -la migrations/versions/ | tail -5

# Подключитесь к БД и обновите версию (замените на реальную последнюю ревизию)
psql -U your_user -d your_database -c "UPDATE alembic_version SET version_num = '6c2d8c1a4f62';"

# Или если нужно сбросить до конкретной версии
# Сначала проверьте цепочку миграций:
alembic history

# Затем обновите версию в БД до известной рабочей версии
```

### Решение 3: Сбросить миграции (ОСТОРОЖНО - только если данные не критичны)

```bash
# ВАЖНО: Это удалит все данные! Используйте только на тестовом сервере
# 1. Удалить таблицу версий миграций
psql -U your_user -d your_database -c "DROP TABLE IF EXISTS alembic_version;"

# 2. Отметить текущую структуру БД как базовую
alembic stamp head
```

### Решение 4: Использовать конкретную ревизию

```bash
# Узнать последнюю ревизию из файлов
cd /opt/planner/backend/migrations/versions
ls -t | head -1
cat <имя_последнего_файла> | grep "^revision:"

# Затем обновить БД до этой ревизии
alembic stamp <revision_id>
alembic upgrade head
```

## Проблема 2: Порт 8000 уже занят
**Ошибка:** `ERROR: [Errno 98] Address already in use`

### Решение 1: Найти и остановить процесс на порту 8000

```bash
# Найти процесс, использующий порт 8000
sudo lsof -i :8000
# или
sudo netstat -tlnp | grep :8000
# или
sudo ss -tlnp | grep :8000

# Остановить процесс (замените PID на реальный из предыдущей команды)
sudo kill -9 <PID>

# Или найти по имени процесса
ps aux | grep uvicorn
sudo pkill -f uvicorn
```

### Решение 2: Использовать другой порт

```bash
# Запустить на другом порту (например, 8001)
uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 4
```

### Решение 3: Если используется systemd сервис

```bash
# Проверить статус сервиса
sudo systemctl status planner-backend

# Остановить сервис
sudo systemctl stop planner-backend

# Запустить заново
sudo systemctl start planner-backend

# Или перезапустить
sudo systemctl restart planner-backend
```

### Решение 4: Если используется PM2

```bash
# Посмотреть процессы PM2
pm2 list

# Остановить процесс
pm2 stop planner-backend
# или
pm2 delete planner-backend

# Запустить заново
cd /opt/planner/backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

## Быстрое решение (последовательность команд)

```bash
cd /opt/planner/backend
source .venv/bin/activate

# 1. Остановить процесс на порту 8000
sudo pkill -f uvicorn
# Или если systemd:
sudo systemctl stop planner-backend

# 2. Проверить текущую версию миграции в БД
psql -U your_user -d your_database -c "SELECT version_num FROM alembic_version;"

# 3. Если версия не соответствует файлам, обновить до последней реальной
# Сначала узнайте последнюю ревизию:
ls -t migrations/versions/ | head -1
# Затем обновите БД (замените на реальную последнюю ревизию):
# psql -U your_user -d your_database -c "UPDATE alembic_version SET version_num = '6c2d8c1a4f62';"

# 4. Попробовать миграции снова
alembic upgrade head

# 5. Если миграции всё ещё не работают, использовать stamp head
# (только если структура БД уже актуальна)
# alembic stamp head

# 6. Запустить сервер
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

## Проверка после исправления

```bash
# Проверить, что порт 8000 свободен
sudo ss -tlnp | grep :8000

# Проверить версию миграций в БД
psql -U your_user -d your_database -c "SELECT version_num FROM alembic_version;"

# Проверить историю миграций
cd /opt/planner/backend
alembic history

# Проверить текущую версию
alembic current

# Проверить работу API
curl http://localhost:8000/api/v1/health
```

