# Быстрый старт развертывания

## На чистом Ubuntu сервере

### 1. Автоматическая настройка сервера

```bash
# Клонирование проекта
sudo git clone https://github.com/skandini/planner.git /opt/planner
cd /opt/planner

# Запуск скрипта настройки
sudo chmod +x scripts/setup_server.sh
sudo ./scripts/setup_server.sh
```

### 2. Ручная настройка (если нужно)

Следуйте подробным инструкциям в `DEPLOYMENT.md`

### 3. Первоначальное развертывание

```bash
cd /opt/planner

# Настройка Backend
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
nano .env  # Настройте переменные окружения
alembic upgrade head
python scripts/create_organizations.py

# Настройка Frontend
cd ../frontend
npm install
echo "NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com/api/v1" > .env.local
npm run build

# Настройка systemd сервисов (см. DEPLOYMENT.md)
# Настройка Nginx (см. DEPLOYMENT.md)
```

## Обновление версий

### Автоматическое обновление

```bash
cd /opt/planner
chmod +x scripts/deploy.sh

# Обновление до последней версии ветки
./scripts/deploy.sh update refactor/split-page-tsx

# Или обновление до конкретной версии
git checkout v1.0.0
./scripts/deploy.sh update
```

### Ручное обновление

См. подробные инструкции в `UPDATE.md`

## Структура проекта

```
/opt/planner/
├── backend/          # FastAPI приложение
│   ├── .venv/       # Виртуальное окружение Python
│   ├── calendar.db  # База данных (SQLite) или настройте PostgreSQL
│   └── ...
├── frontend/         # Next.js приложение
│   ├── .next/       # Собранное приложение
│   └── ...
├── backups/          # Резервные копии (создается автоматически)
└── scripts/          # Скрипты развертывания
```

## Важные файлы

- `DEPLOYMENT.md` - Подробная инструкция по развертыванию
- `UPDATE.md` - Инструкция по обновлению версий
- `scripts/deploy.sh` - Скрипт автоматического обновления
- `scripts/setup_server.sh` - Скрипт настройки сервера

## Мониторинг

```bash
# Статус сервисов
sudo systemctl status planner-backend
sudo systemctl status planner-frontend

# Логи
sudo journalctl -u planner-backend -f
sudo journalctl -u planner-frontend -f

# Проверка работы API
curl https://api.yourdomain.com/api/v1/health
```

## Резервное копирование

Резервные копии базы данных автоматически создаются в `/opt/planner/backups/` при каждом обновлении.

Для ручного создания резервной копии:
```bash
cd /opt/planner/backend
cp calendar.db ../backups/calendar.db.$(date +%Y%m%d_%H%M%S)
```

