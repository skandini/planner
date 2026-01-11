# Пошаговая инструкция по переключению на сервере

## Шаг 1: Найти директорию проекта

Сначала нужно найти, где находится ваш проект на сервере. Попробуйте одну из команд:

```bash
# Поиск директории проекта (обычно называется planner, app, calendar и т.д.)
find /var/www -name ".git" -type d 2>/dev/null
# или
find /home -name ".git" -type d 2>/dev/null
# или
find /opt -name ".git" -type d 2>/dev/null
# или
ls -la /var/www/
# или
ls -la /opt/
```

## Шаг 2: Перейти в директорию проекта

После того, как найдете директорию (например, `/var/www/planner` или `/opt/planner`), перейдите в неё:

```bash
cd /path/to/your/project  # замените на реальный путь
```

## Шаг 3: Проверить текущую ветку

```bash
git branch
git status
```

## Шаг 4: Получить обновления из GitHub

```bash
git fetch origin
```

## Шаг 5: Переключиться на testmain-copy

```bash
git checkout testmain-copy
git pull origin testmain-copy
```

## Шаг 6: Проверить, что переключились

```bash
git branch  # должна показать * testmain-copy
git log --oneline -5  # показать последние коммиты
```

## Шаг 7: Запустить деплой (зависит от вашей настройки)

```bash
# Если используется Docker:
docker-compose down
docker-compose up -d --build

# Если фронтенд отдельно:
cd frontend
npm install
npm run build

# Если бэкенд отдельно:
cd backend
source .venv/bin/activate  # или .venv/Scripts/activate на Windows
pip install -r requirements.txt
alembic upgrade head
# запустить приложение

# Или другие команды деплоя, которые вы используете
```

## Альтернатива: Если не знаете, где проект

Если не знаете точно, где проект, можно проверить запущенные процессы:

```bash
# Посмотреть запущенные Docker контейнеры
docker ps

# Посмотреть запущенные процессы
ps aux | grep -E "uvicorn|node|npm|python"

# Посмотреть, где монтированы диски
df -h
```

