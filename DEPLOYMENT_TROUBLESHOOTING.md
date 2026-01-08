# Troubleshooting - Решение проблем при деплое

## 🔍 Общие проблемы и решения

### Проблема 1: Backend не запускается

**Симптомы:**
```bash
systemctl status planner-backend
# Показывает: failed или inactive
```

**Диагностика:**
```bash
# Проверить логи
journalctl -u planner-backend -n 100

# Проверить .env файл
cat /opt/planner/backend/.env

# Проверить подключение к БД
psql -U planner_user -d planner_db -h localhost -c "SELECT 1;"
```

**Решения:**

1. **Ошибка подключения к БД:**
```bash
# Проверить, запущен ли PostgreSQL
systemctl status postgresql

# Если не запущен:
systemctl start postgresql

# Проверить пароль в .env
# Убедиться, что DATABASE_URL правильный
```

2. **Ошибка импорта модулей:**
```bash
cd /opt/planner/backend
source .venv/bin/activate
pip install -r requirements.txt
```

3. **Ошибка прав доступа:**
```bash
# Проверить владельца файлов
ls -la /opt/planner/backend

# Установить правильного владельца
chown -R YOUR_USER:YOUR_USER /opt/planner
```

---

### Проблема 2: 502 Bad Gateway

**Симптомы:**
- Nginx возвращает 502 при обращении к API
- В логах Nginx: `upstream connection failed`

**Диагностика:**
```bash
# Проверить статус backend
systemctl status planner-backend

# Проверить, слушает ли backend порт 8000
netstat -tlnp | grep 8000
# или
ss -tlnp | grep 8000

# Проверить логи Nginx
tail -f /var/log/nginx/planner_error.log
```

**Решения:**

1. **Backend не запущен:**
```bash
# Запустить backend
systemctl start planner-backend

# Проверить статус
systemctl status planner-backend
```

2. **Backend слушает другой порт:**
```bash
# Проверить конфигурацию systemd
cat /etc/systemd/system/planner-backend.service | grep ExecStart

# Проверить конфигурацию Nginx
grep "proxy_pass" /etc/nginx/sites-available/planner

# Порты должны совпадать (обычно 8000)
```

3. **Проблема с правами:**
```bash
# Проверить, может ли пользователь запустить uvicorn
sudo -u YOUR_USER /opt/planner/backend/.venv/bin/uvicorn --version
```

---

### Проблема 3: Ошибки миграций

**Симптомы:**
```bash
alembic upgrade head
# Ошибка: relation "table_name" does not exist
```

**Диагностика:**
```bash
# Проверить текущую версию
alembic current

# Посмотреть историю
alembic history

# Проверить таблицы в БД
psql -U planner_user -d planner_db -h localhost -c "\dt"
```

**Решения:**

1. **Таблицы не созданы:**
```bash
# Применить все миграции с начала
alembic upgrade head

# Если ошибка, попробовать по одной
alembic upgrade +1
```

2. **Конфликт миграций:**
```bash
# Посмотреть историю
alembic history

# Откатить последнюю миграцию
alembic downgrade -1

# Применить заново
alembic upgrade head
```

3. **Проблемы с правами:**
```bash
# Дать права пользователю
sudo -u postgres psql -d planner_db <<EOF
GRANT ALL ON SCHEMA public TO planner_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO planner_user;
EOF
```

---

### Проблема 4: SSL сертификат не работает

**Симптомы:**
- Браузер показывает ошибку SSL
- `certbot certificates` показывает проблемы

**Диагностика:**
```bash
# Проверить сертификаты
certbot certificates

# Проверить конфигурацию Nginx
nginx -t

# Проверить логи
tail -f /var/log/nginx/planner_error.log
```

**Решения:**

1. **Сертификат не получен:**
```bash
# Получить сертификат заново
certbot --nginx -d calendar.corestone.ru -d www.calendar.corestone.ru

# Если домен не резолвится, проверить DNS
nslookup calendar.corestone.ru
```

2. **Сертификат истек:**
```bash
# Обновить сертификат
certbot renew --force-renewal

# Перезагрузить Nginx
systemctl reload nginx
```

3. **Проблема с путями в Nginx:**
```bash
# Проверить пути к сертификатам
ls -la /etc/letsencrypt/live/calendar.corestone.ru/

# Обновить конфигурацию Nginx
certbot --nginx -d calendar.corestone.ru --force-renewal
```

---

### Проблема 5: Rate limiting не работает

**Симптомы:**
- Можно сделать больше запросов, чем установлено в лимитах
- Нет ошибки 429

**Диагностика:**
```bash
# Проверить логи backend
journalctl -u planner-backend | grep -i "rate limit"

# Проверить конфигурацию Nginx
grep "limit_req" /etc/nginx/sites-available/planner

# Проверить, что slowapi установлен
cd /opt/planner/backend
source .venv/bin/activate
pip list | grep slowapi
```

**Решения:**

1. **slowapi не установлен:**
```bash
cd /opt/planner/backend
source .venv/bin/activate
pip install slowapi
systemctl restart planner-backend
```

2. **Rate limiting отключен в коде:**
```bash
# Проверить main.py
grep "limiter" /opt/planner/backend/app/main.py

# Должно быть: app.state.limiter = limiter
```

3. **Nginx rate limiting не настроен:**
```bash
# Проверить конфигурацию
grep "limit_req_zone" /etc/nginx/sites-available/planner

# Если нет, добавить (см. DEPLOYMENT_STEP_BY_STEP.md)
```

---

### Проблема 6: Backup не работает

**Симптомы:**
```bash
systemctl start planner-backup.service
# Ошибка или backup не создается
```

**Диагностика:**
```bash
# Проверить логи
journalctl -u planner-backup.service -n 50

# Проверить скрипт
ls -la /opt/planner/backend/scripts/backup_db.py

# Проверить права
chmod +x /opt/planner/backend/scripts/backup_db.py
```

**Решения:**

1. **pg_dump не найден:**
```bash
# Установить PostgreSQL client
apt install -y postgresql-client

# Проверить
which pg_dump
```

2. **Проблема с правами:**
```bash
# Проверить .env файл
cat /opt/planner/backend/.env | grep DATABASE_URL

# Проверить подключение
psql -U planner_user -d planner_db -h localhost -c "SELECT 1;"
```

3. **Директория backups не создана:**
```bash
# Создать вручную
mkdir -p /opt/planner/backups
chmod 755 /opt/planner/backups
```

---

### Проблема 7: Высокая нагрузка на сервер

**Симптомы:**
- Сервер медленно отвечает
- Высокое использование CPU/RAM

**Диагностика:**
```bash
# Проверить использование ресурсов
htop
# или
top

# Проверить количество процессов
ps aux | grep uvicorn

# Проверить логи
journalctl -u planner-backend --since "10 minutes ago"
```

**Решения:**

1. **Слишком много workers:**
```bash
# Уменьшить количество workers в systemd service
nano /etc/systemd/system/planner-backend.service

# Изменить: --workers 2 на --workers 1
# Перезапустить
systemctl daemon-reload
systemctl restart planner-backend
```

2. **Проблемы с БД:**
```bash
# Проверить активные подключения
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"

# Проверить размер БД
sudo -u postgres psql -d planner_db -c "SELECT pg_size_pretty(pg_database_size('planner_db'));"
```

---

### Проблема 8: Логи переполняют диск

**Симптомы:**
```bash
df -h
# Показывает 100% использование
```

**Диагностика:**
```bash
# Проверить размер логов
du -sh /var/log/journal/
du -sh /var/log/nginx/

# Проверить старые логи
journalctl --disk-usage
```

**Решения:**

1. **Очистить старые логи:**
```bash
# Очистить journal logs старше 7 дней
journalctl --vacuum-time=7d

# Очистить Nginx logs
find /var/log/nginx -name "*.log" -mtime +30 -delete

# Настроить ротацию логов
nano /etc/logrotate.d/planner
```

2. **Настроить ротацию логов:**
```bash
# Создать конфигурацию logrotate
cat > /etc/logrotate.d/planner <<EOF
/var/log/nginx/planner_*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        systemctl reload nginx > /dev/null 2>&1 || true
    endscript
}
EOF
```

---

## 📞 Полезные команды для диагностики

### Проверка статуса всех сервисов:
```bash
systemctl status planner-backend postgresql nginx
```

### Просмотр логов в реальном времени:
```bash
# Backend
journalctl -u planner-backend -f

# Nginx
tail -f /var/log/nginx/planner_access.log
tail -f /var/log/nginx/planner_error.log

# PostgreSQL
tail -f /var/log/postgresql/postgresql-*.log
```

### Проверка подключений:
```bash
# Проверить открытые порты
netstat -tlnp | grep -E "8000|5432|80|443"

# Проверить подключения к БД
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"
```

### Проверка конфигурации:
```bash
# Nginx
nginx -t

# PostgreSQL
sudo -u postgres psql -c "SHOW config_file;"

# Systemd
systemctl daemon-reload
```

---

## 🔧 Быстрые исправления

### Перезапуск всех сервисов:
```bash
systemctl restart planner-backend postgresql nginx
```

### Проверка и исправление прав:
```bash
chown -R YOUR_USER:YOUR_USER /opt/planner
chmod +x /opt/planner/backend/scripts/*.sh
chmod +x /opt/planner/backend/scripts/*.py
```

### Обновление проекта:
```bash
cd /opt/planner
git pull
cd backend
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
systemctl restart planner-backend
```

---

## 📚 Дополнительные ресурсы

- `DEPLOYMENT_STEP_BY_STEP.md` - Подробная инструкция
- `DEPLOYMENT_UBUNTU_POSTGRESQL.md` - Альтернативная версия
- Логи сервисов: `journalctl -u SERVICE_NAME`



