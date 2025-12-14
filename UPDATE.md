# Инструкция по обновлению версий

## Процесс обновления

### 1. Резервное копирование

**ВАЖНО:** Всегда делайте резервную копию перед обновлением!

```bash
# Резервная копия базы данных
cd /opt/planner/backend
cp calendar.db calendar.db.backup.$(date +%Y%m%d_%H%M%S)

# Или для PostgreSQL:
pg_dump -U planner_user planner_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Резервная копия кода (создание тега)
cd /opt/planner
git tag backup-$(date +%Y%m%d)
git push origin backup-$(date +%Y%m%d)
```

### 2. Получение обновлений

```bash
cd /opt/planner

# Проверка текущей ветки
git branch

# Получение последних изменений
git fetch origin

# Просмотр изменений
git log HEAD..origin/refactor/split-page-tsx

# Переключение на нужную ветку/тег
git checkout refactor/split-page-tsx
# или
git checkout main
# или конкретную версию
git checkout v1.0.0
```

### 3. Обновление Backend

```bash
cd /opt/planner/backend

# Активация виртуального окружения
source .venv/bin/activate

# Обновление зависимостей
pip install --upgrade pip
pip install -r requirements.txt

# Применение миграций базы данных
alembic upgrade head

# Проверка миграций
alembic current
alembic history

# Перезапуск сервиса
sudo systemctl restart planner-backend

# Проверка логов
sudo journalctl -u planner-backend -f --lines=50
```

### 4. Обновление Frontend

```bash
cd /opt/planner/frontend

# Обновление зависимостей
npm install

# Проверка изменений в .env.local
# Если нужно, обновите переменные окружения
nano .env.local

# Сборка новой версии
npm run build

# Перезапуск сервиса
sudo systemctl restart planner-frontend

# Проверка логов
sudo journalctl -u planner-frontend -f --lines=50
```

### 5. Проверка работоспособности

```bash
# Проверка статуса сервисов
sudo systemctl status planner-backend
sudo systemctl status planner-frontend

# Проверка API
curl https://api.yourdomain.com/api/v1/health

# Проверка фронтенда
curl -I https://yourdomain.com
```

### 6. Откат изменений (если что-то пошло не так)

```bash
cd /opt/planner

# Откат к предыдущей версии
git checkout <previous-commit-hash>
# или
git checkout <previous-tag>

# Восстановление базы данных из резервной копии
cd backend
cp calendar.db.backup.YYYYMMDD_HHMMSS calendar.db
# или для PostgreSQL:
psql -U planner_user planner_db < backup_YYYYMMDD_HHMMSS.sql

# Перезапуск сервисов
sudo systemctl restart planner-backend
sudo systemctl restart planner-frontend
```

## Автоматическое обновление (скрипт)

См. `scripts/deploy.sh` для автоматизированного процесса.

## Рекомендации

1. **Тестирование на staging:** Разверните staging окружение для тестирования перед продакшеном
2. **Мониторинг:** Настройте мониторинг сервисов (например, через systemd или внешние сервисы)
3. **Логирование:** Регулярно проверяйте логи на наличие ошибок
4. **Резервные копии:** Делайте резервные копии базы данных ежедневно
5. **Версионирование:** Используйте теги Git для версионирования релизов

