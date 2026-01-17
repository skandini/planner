# 🔧 Руководство по обслуживанию Planner

Инструкции по ежедневному обслуживанию, мониторингу и решению проблем.

---

## 📊 Ежедневный мониторинг

### Быстрая проверка системы

```bash
# Запустить скрипт проверки здоровья
/usr/local/bin/planner-status.sh

# Или вручную проверить все сервисы
systemctl status planner-backend planner-celery-worker planner-frontend redis-server postgresql nginx
```

### Проверка доступности

```bash
# API Health check
curl https://calendar.corestone.ru/api/v1/health

# Frontend
curl -I https://calendar.corestone.ru

# SSL сертификат (срок действия)
echo | openssl s_client -servername calendar.corestone.ru -connect calendar.corestone.ru:443 2>/dev/null | openssl x509 -noout -dates
```

---

## 📋 Управление сервисами

### Основные команды

```bash
# Проверка статуса
systemctl status <service_name>

# Запуск
systemctl start <service_name>

# Остановка
systemctl stop <service_name>

# Перезапуск
systemctl restart <service_name>

# Включить автозапуск
systemctl enable <service_name>

# Отключить автозапуск
systemctl disable <service_name>

# Перезагрузка конфигурации
systemctl daemon-reload
```

### Сервисы приложения

```bash
# Backend API
systemctl restart planner-backend
systemctl status planner-backend
journalctl -u planner-backend -f

# Celery Worker
systemctl restart planner-celery-worker
systemctl status planner-celery-worker

# Celery Beat
systemctl restart planner-celery-beat
systemctl status planner-celery-beat

# Frontend
systemctl restart planner-frontend
systemctl status planner-frontend

# PostgreSQL
systemctl restart postgresql
systemctl status postgresql

# Redis
systemctl restart redis-server
systemctl status redis-server

# Nginx
systemctl restart nginx
systemctl status nginx
```

### Перезапуск всего приложения

```bash
# Последовательный перезапуск
systemctl restart redis-server
systemctl restart postgresql
sleep 2
systemctl restart planner-backend
systemctl restart planner-celery-worker
systemctl restart planner-celery-beat
systemctl restart planner-frontend
systemctl restart nginx

# Проверка
sleep 5
/usr/local/bin/planner-status.sh
```

---

## 📝 Логи

### Расположение логов

```bash
# Application logs
/var/log/planner/
├── backend.log
├── backend-error.log
├── celery-worker.log
├── celery-worker-error.log
├── celery-beat.log
├── frontend.log
└── frontend-error.log

# System logs (systemd)
journalctl -u planner-backend
journalctl -u planner-celery-worker
journalctl -u planner-frontend

# Nginx logs
/var/log/nginx/planner-access.log
/var/log/nginx/planner-error.log

# PostgreSQL logs
/var/log/postgresql/postgresql-16-main.log

# Redis logs
/var/log/redis/redis-server.log
```

### Просмотр логов

```bash
# Последние N строк
tail -50 /var/log/planner/backend-error.log

# В реальном времени (follow)
tail -f /var/log/planner/backend.log

# Через journalctl
journalctl -u planner-backend -n 100
journalctl -u planner-backend -f
journalctl -u planner-backend --since "1 hour ago"
journalctl -u planner-backend --since "2026-01-14"

# Поиск по логам
grep "ERROR" /var/log/planner/backend-error.log
grep "500" /var/log/nginx/planner-error.log
```

### Ротация логов

Настроена через logrotate (`/etc/logrotate.d/planner`):
- Ежедневная ротация
- Хранение за 14 дней
- Автоматическое сжатие

```bash
# Принудительная ротация
logrotate -f /etc/logrotate.d/planner

# Проверка конфигурации
logrotate -d /etc/logrotate.d/planner
```

---

## 🗄️ Работа с базой данных

### Подключение

```bash
# Подключение к PostgreSQL
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -h localhost

# Базовые команды в psql
\l                    # Список баз данных
\c planner_db         # Подключиться к базе
\dt                   # Список таблиц
\d users              # Структура таблицы users
\q                    # Выход
```

### Бэкап базы данных

```bash
# Создать бэкап
PGPASSWORD='YtragtR65A' pg_dump -U planner_user -d planner_db > /root/backups/planner_$(date +%Y%m%d_%H%M%S).sql

# Сжатый бэкап
PGPASSWORD='YtragtR65A' pg_dump -U planner_user -d planner_db | gzip > /root/backups/planner_$(date +%Y%m%d_%H%M%S).sql.gz

# Автоматический бэкап (добавить в cron)
0 2 * * * PGPASSWORD='YtragtR65A' pg_dump -U planner_user -d planner_db | gzip > /root/backups/planner_$(date +\%Y\%m\%d).sql.gz
```

### Восстановление из бэкапа

```bash
# Из обычного файла
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db < /root/backups/planner_20260114.sql

# Из сжатого файла
gunzip -c /root/backups/planner_20260114.sql.gz | PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db

# С пересозданием базы (ОСТОРОЖНО!)
PGPASSWORD='YtragtR65A' psql -U postgres << EOF
DROP DATABASE planner_db;
CREATE DATABASE planner_db OWNER planner_user;
\q
EOF
gunzip -c /root/backups/planner_20260114.sql.gz | PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db
```

### Полезные SQL запросы

```sql
-- Количество пользователей
SELECT COUNT(*) FROM users;

-- Активные пользователи
SELECT COUNT(*) FROM users WHERE is_active = true;

-- Администраторы
SELECT id, email, full_name, role FROM users WHERE role = 'admin';

-- События на сегодня
SELECT COUNT(*) FROM events 
WHERE DATE(start_time) = CURRENT_DATE;

-- Размер базы данных
SELECT pg_size_pretty(pg_database_size('planner_db'));

-- Размер таблиц
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 🔴 Работа с Redis

### Проверка и мониторинг

```bash
# Подключение к Redis
redis-cli

# Проверка подключения
redis-cli ping

# Информация о Redis
redis-cli info

# Статистика в реальном времени
redis-cli --stat

# Количество ключей
redis-cli DBSIZE

# Память
redis-cli INFO memory
```

### Очистка Redis

```bash
# Очистить конкретную базу
redis-cli -n 0 FLUSHDB  # DB 0 (кэш)
redis-cli -n 1 FLUSHDB  # DB 1 (Celery broker)
redis-cli -n 2 FLUSHDB  # DB 2 (Celery results)

# Очистить все базы (ОСТОРОЖНО!)
redis-cli FLUSHALL
```

### Мониторинг операций

```bash
# Мониторинг команд в реальном времени
redis-cli MONITOR
```

---

## 🔄 Обновление приложения

### Из GitHub

```bash
# Использовать автоматический скрипт
/usr/local/bin/update-planner.sh

# Или вручную:
cd /opt/planner

# 1. Сохранить изменения (если есть)
git stash

# 2. Получить изменения
git pull origin refactor/split-page-tsx

# 3. Backend
cd backend
source .venv/bin/activate
pip install -r requirements.txt

# 4. Frontend
cd ../frontend
npm install
npm run build

# 5. Перезапустить сервисы
systemctl restart planner-backend
systemctl restart planner-celery-worker
systemctl restart planner-celery-beat
systemctl restart planner-frontend

# 6. Проверить
sleep 5
curl https://calendar.corestone.ru/api/v1/health
```

### Откат изменений

```bash
cd /opt/planner

# Посмотреть последние коммиты
git log --oneline -10

# Откатиться на конкретный коммит
git reset --hard <commit_hash>

# Перезапустить сервисы
systemctl restart planner-backend planner-celery-worker planner-frontend
```

---

## 👤 Управление пользователями

### Создание нового пользователя

```bash
cd /opt/planner/backend
source .venv/bin/activate

python << 'EOF'
from sqlmodel import Session, select
from app.models.user import User
from app.core.security import get_password_hash
from app.db import engine

with Session(engine) as session:
    user = User(
        email="new.user@corestone.ru",
        full_name="Новый Пользователь",
        hashed_password=get_password_hash("TempPass123!"),
        is_active=True,
        role="employee",
        position="Должность",
    )
    session.add(user)
    session.commit()
    print(f"✅ Создан: {user.email}")
EOF
```

### Смена пароля пользователя

```bash
cd /opt/planner/backend
source .venv/bin/activate

python << 'EOF'
from sqlmodel import Session, select
from app.models.user import User
from app.core.security import get_password_hash
from app.db import engine

email = "user@corestone.ru"
new_password = "NewPassword123!"

with Session(engine) as session:
    statement = select(User).where(User.email == email)
    user = session.exec(statement).first()
    
    if user:
        user.hashed_password = get_password_hash(new_password)
        session.add(user)
        session.commit()
        print(f"✅ Пароль изменен для {user.email}")
    else:
        print(f"❌ Пользователь {email} не найден")
EOF
```

### Изменение роли пользователя

```bash
cd /opt/planner/backend
source .venv/bin/activate

python << 'EOF'
from sqlmodel import Session, select
from app.models.user import User
from app.db import engine

email = "user@corestone.ru"
new_role = "admin"  # admin/it/employee

with Session(engine) as session:
    statement = select(User).where(User.email == email)
    user = session.exec(statement).first()
    
    if user:
        user.role = new_role
        session.add(user)
        session.commit()
        print(f"✅ Роль изменена для {user.email} -> {new_role}")
    else:
        print(f"❌ Пользователь {email} не найден")
EOF
```

### Деактивация пользователя

```bash
# SQL
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -c \
  "UPDATE users SET is_active = false WHERE email = 'user@corestone.ru';"

# Python
cd /opt/planner/backend && source .venv/bin/activate
python -c "
from sqlmodel import Session, select
from app.models.user import User
from app.db import engine

with Session(engine) as session:
    user = session.exec(select(User).where(User.email == 'user@corestone.ru')).first()
    if user:
        user.is_active = False
        session.add(user)
        session.commit()
        print(f'Деактивирован: {user.email}')
"
```

---

## 🔒 Безопасность

### Проверка Fail2ban

```bash
# Статус
systemctl status fail2ban

# Забаненные IP
fail2ban-client status sshd

# Разбанить IP
fail2ban-client set sshd unbanip <IP_ADDRESS>

# Логи
tail -f /var/log/fail2ban.log
```

### Проверка Firewall

```bash
# Статус UFW
ufw status verbose

# Открытые порты
ss -tlnp | grep -E "(22|80|443)"
netstat -tlnp | grep -E "(22|80|443)"
```

### Обновление системы

```bash
# Обновить список пакетов
apt update

# Посмотреть доступные обновления
apt list --upgradable

# Установить обновления безопасности
apt-get upgrade -y

# Полное обновление
apt-get dist-upgrade -y

# Автоперезагрузка (если требуется)
if [ -f /var/run/reboot-required ]; then
    echo "Требуется перезагрузка"
    # reboot
fi
```

---

## 📊 Мониторинг ресурсов

### Диск

```bash
# Использование диска
df -h

# Большие файлы/директории
du -sh /opt/planner/*
du -sh /var/log/*
du -sh /var/lib/postgresql/*

# Найти большие файлы
find /var/log -type f -size +100M

# Очистка логов (старше 30 дней)
find /var/log/planner -name "*.log" -mtime +30 -delete
find /var/log/nginx -name "*.gz" -mtime +30 -delete
```

### Память

```bash
# Использование памяти
free -h

# Топ процессов по памяти
ps aux --sort=-%mem | head -10

# Память конкретного сервиса
systemctl status planner-backend | grep Memory
```

### CPU

```bash
# Загрузка CPU
top -bn1 | grep "Cpu(s)"

# Топ процессов по CPU
ps aux --sort=-%cpu | head -10

# Загрузка системы
uptime
cat /proc/loadavg
```

---

## 🚨 Решение типичных проблем

### Сервис не запускается

```bash
# 1. Проверить логи
journalctl -u planner-backend -n 100

# 2. Проверить зависимости
systemctl status redis-server
systemctl status postgresql

# 3. Проверить порты
ss -tlnp | grep -E "(8000|6379|5432)"

# 4. Попробовать запустить вручную
cd /opt/planner/backend
source .venv/bin/activate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### База данных недоступна

```bash
# 1. Проверить статус PostgreSQL
systemctl status postgresql

# 2. Проверить подключение
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -h localhost -c "SELECT 1;"

# 3. Проверить логи
tail -100 /var/log/postgresql/postgresql-16-main.log

# 4. Перезапустить PostgreSQL
systemctl restart postgresql
```

### Redis недоступен

```bash
# 1. Проверить статус
systemctl status redis-server

# 2. Проверить подключение
redis-cli ping

# 3. Проверить логи
tail -100 /var/log/redis/redis-server.log

# 4. Проверить что директория существует
ls -la /run/redis/

# 5. Создать директорию если нужно
mkdir -p /run/redis
chown redis:redis /run/redis

# 6. Перезапустить Redis
systemctl restart redis-server
```

### Сайт недоступен (502/504)

```bash
# 1. Проверить Nginx
systemctl status nginx
nginx -t

# 2. Проверить backend
systemctl status planner-backend
curl http://localhost:8000/

# 3. Проверить frontend
systemctl status planner-frontend
curl http://localhost:3000/

# 4. Проверить логи Nginx
tail -50 /var/log/nginx/planner-error.log

# 5. Перезапустить все
systemctl restart planner-backend planner-frontend nginx
```

### SSL сертификат истек

```bash
# 1. Проверить срок действия
echo | openssl s_client -servername calendar.corestone.ru -connect calendar.corestone.ru:443 2>/dev/null | openssl x509 -noout -dates

# 2. Обновить сертификат
certbot renew --force-renewal

# 3. Перезагрузить Nginx
systemctl reload nginx
```

---

## 📅 Регулярное обслуживание

### Ежедневно

- [ ] Проверить статус сервисов
- [ ] Проверить доступность сайта
- [ ] Просмотреть логи на критические ошибки

```bash
/usr/local/bin/planner-status.sh
tail -50 /var/log/planner/backend-error.log | grep ERROR
```

### Еженедельно

- [ ] Проверить использование диска
- [ ] Проверить бэкапы
- [ ] Просмотреть fail2ban логи

```bash
df -h
ls -lh /root/backups/
tail -100 /var/log/fail2ban.log
```

### Ежемесячно

- [ ] Создать бэкап базы данных
- [ ] Проверить SSL сертификат
- [ ] Обновить системные пакеты
- [ ] Очистить старые логи

```bash
# Бэкап
PGPASSWORD='YtragtR65A' pg_dump -U planner_user -d planner_db | gzip > /root/backups/monthly_$(date +%Y%m).sql.gz

# Обновления
apt update && apt list --upgradable

# SSL
certbot certificates

# Очистка логов
find /var/log/planner -name "*.log.*" -mtime +30 -delete
```

### Ежеквартально

- [ ] Сменить пароли
- [ ] Провести аудит безопасности
- [ ] Проверить актуальность документации
- [ ] Проанализировать производительность

---

**Последнее обновление:** 14 января 2026



