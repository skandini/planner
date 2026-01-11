# Команды для деплоя на сервере (директория: /opt/planner/)

## Шаг 1: Переключение на ветку testmain-copy

```bash
# Перейти в директорию проекта
cd /opt/planner/

# Получить обновления из GitHub
git fetch origin

# Переключиться на ветку testmain-copy (если еще не на ней)
git checkout testmain-copy

# Получить последние изменения
git pull origin testmain-copy

# Проверить текущую ветку и последние коммиты
git branch
git log --oneline -5
```

## Шаг 2: Запуск Backend (FastAPI)

```bash
cd /opt/planner/backend

# Активировать виртуальное окружение
source .venv/bin/activate

# Обновить зависимости (если нужно)
pip install -r requirements.txt

# Применить миграции базы данных
alembic upgrade head

# Запустить сервер (варианты):
# Вариант 1: Прямой запуск (для теста)
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Вариант 2: Запуск с несколькими воркерами (для production)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

# Вариант 3: Через systemd (если настроен сервис)
sudo systemctl restart planner-backend
sudo systemctl status planner-backend
```

## Шаг 3: Запуск Frontend (Next.js)

```bash
cd /opt/planner/frontend

# Установить/обновить зависимости (если нужно)
npm install

# Собрать production версию
npm run build

# Запустить production сервер (варианты):
# Вариант 1: Прямой запуск
npm start

# Вариант 2: Через PM2 (рекомендуется для production)
pm2 start npm --name "planner-frontend" -- start
pm2 save
pm2 status

# Вариант 3: Через systemd (если настроен сервис)
sudo systemctl restart planner-frontend
sudo systemctl status planner-frontend
```

## Шаг 4: Проверка работы

```bash
# Проверить бэкенд
curl http://localhost:8000/api/v1/health

# Проверить фронтенд
curl http://localhost:3000

# Проверить запущенные процессы
ps aux | grep -E "uvicorn|node|npm"

# Проверить порты
netstat -tlnp | grep -E "8000|3000"
# или
ss -tlnp | grep -E "8000|3000"
```

## Шаг 5: Дополнительные сервисы (если используются)

### Redis (если используется)
```bash
sudo systemctl status redis
sudo systemctl restart redis
```

### Celery Worker (если используется)
```bash
cd /opt/planner/backend
source .venv/bin/activate
celery -A app.celery_app worker --loglevel=info
# Или через systemd:
sudo systemctl restart celery-worker
```

### Nginx (если используется как reverse proxy)
```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx
```

## Быстрый деплой (все команды подряд)

```bash
cd /opt/planner/
git fetch origin
git checkout testmain-copy
git pull origin testmain-copy

# Backend
cd backend
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
# Запуск backend (выберите нужный вариант)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

# Frontend (в другом терминале или в фоне)
cd /opt/planner/frontend
npm install
npm run build
npm start
```

## Если что-то пошло не так

```bash
# Посмотреть логи бэкенда (если через systemd)
sudo journalctl -u planner-backend -f

# Посмотреть логи фронтенда (если через systemd)
sudo journalctl -u planner-frontend -f

# Посмотреть логи PM2
pm2 logs planner-frontend

# Остановить процессы
pkill -f uvicorn
pkill -f "npm start"
pm2 stop planner-frontend
```

