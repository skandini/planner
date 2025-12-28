# Пошаговая инструкция по деплою - Детальная версия

## 🎯 Цель
Развернуть проект Planner на Ubuntu сервере (155.212.190.153) с PostgreSQL, Nginx и SSL.

**Домен:** https://calendar.corestone.ru/

**Время выполнения:** 2-3 часа

---

## 📋 ПРЕДВАРИТЕЛЬНАЯ ПОДГОТОВКА

### Что нужно иметь:
- ✅ Доступ к серверу по SSH (root или sudo пользователь)
- ✅ Домен настроен и указывает на IP сервера (155.212.190.153)
- ✅ Git репозиторий с кодом проекта
- ✅ 30-60 минут свободного времени

### Проверка доступа к серверу:

```bash
# С вашего локального компьютера
ssh root@155.212.190.153

# Если используете ключ SSH
ssh -i ~/.ssh/your_key root@155.212.190.153

# Проверить версию Ubuntu
lsb_release -a
# Должно быть: Ubuntu 22.04 или 24.04
```

---

## ШАГ 1: ПОДГОТОВКА СЕРВЕРА (15 минут)

### 1.1. Обновление системы

```bash
# Войти на сервер
ssh root@155.212.190.153

# Обновить список пакетов
apt update

# Обновить систему
apt upgrade -y

# Перезагрузить (если нужно)
# reboot
```

### 1.2. Установка базовых утилит

```bash
# Установить необходимые утилиты
apt install -y \
    curl \
    wget \
    git \
    vim \
    nano \
    htop \
    ufw \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release
```

### 1.3. Настройка файрвола

```bash
# Разрешить SSH (важно сделать первым!)
ufw allow 22/tcp

# Разрешить HTTP и HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Включить файрвол
ufw --force enable

# Проверить статус
ufw status
```

**Ожидаемый результат:**
```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
```

---

## ШАГ 2: УСТАНОВКА PYTHON 3.12 (10 минут)

### 2.1. Проверка текущей версии

```bash
# Проверить версию Python
python3 --version

# Если версия 3.10+, можно использовать её
# Если нет - установить 3.12
```

### 2.2. Установка Python 3.12 (если нужно)

```bash
# Добавить репозиторий deadsnakes
add-apt-repository -y ppa:deadsnakes/ppa
apt update

# Установить Python 3.12
apt install -y \
    python3.12 \
    python3.12-venv \
    python3.12-dev \
    python3-pip

# Проверить установку
python3.12 --version
# Должно быть: Python 3.12.x

# Создать альтернативу (опционально)
update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1
```

### 2.3. Обновление pip

```bash
# Обновить pip
python3.12 -m pip install --upgrade pip

# Проверить версию
python3.12 -m pip --version
```

---

## ШАГ 3: УСТАНОВКА И НАСТРОЙКА POSTGRESQL (20 минут)

### 3.1. Установка PostgreSQL

```bash
# Установить PostgreSQL
apt install -y postgresql postgresql-contrib

# Проверить версию
psql --version
# Должно быть: PostgreSQL 14+ или 16+

# Запустить и включить автозапуск
systemctl start postgresql
systemctl enable postgresql

# Проверить статус
systemctl status postgresql
# Должно быть: active (running)
```

### 3.2. Создание базы данных и пользователя

```bash
# Переключиться на пользователя postgres
su - postgres

# Войти в psql
psql

# В psql выполнить следующие команды:
```

**SQL команды (выполнить в psql):**

```sql
-- Создать базу данных
CREATE DATABASE planner_db;

-- Создать пользователя с паролем
-- ⚠️ ВАЖНО: Замените 'YOUR_STRONG_PASSWORD' на надежный пароль!
CREATE USER planner_user WITH PASSWORD 'YOUR_STRONG_PASSWORD';

-- Дать все права на базу данных
GRANT ALL PRIVILEGES ON DATABASE planner_db TO planner_user;

-- Переключиться на базу данных
\c planner_db

-- Для PostgreSQL 15+ дать права на схему
GRANT ALL ON SCHEMA public TO planner_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO planner_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO planner_user;

-- Выйти из psql
\q
```

**Выйти из пользователя postgres:**
```bash
exit
```

### 3.3. Проверка подключения

```bash
# Проверить подключение (запросит пароль)
psql -U planner_user -d planner_db -h localhost

# Если подключилось успешно, выполнить:
SELECT version();
SELECT current_database();

# Выйти
\q
```

### 3.4. Настройка PostgreSQL для production (опционально)

```bash
# Найти файл конфигурации
find /etc/postgresql -name postgresql.conf

# Обычно это:
# /etc/postgresql/14/main/postgresql.conf (для PostgreSQL 14)
# или
# /etc/postgresql/16/main/postgresql.conf (для PostgreSQL 16)

# Отредактировать конфигурацию
nano /etc/postgresql/*/main/postgresql.conf
```

**Рекомендуемые настройки (для 2-4GB RAM):**

```ini
# Подключения
max_connections = 100

# Память
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
work_mem = 4MB

# WAL
wal_buffers = 16MB
min_wal_size = 1GB
max_wal_size = 4GB
checkpoint_completion_target = 0.9

# Производительность
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
```

**Применить изменения:**
```bash
# Перезапустить PostgreSQL
systemctl restart postgresql

# Проверить статус
systemctl status postgresql
```

---

## ШАГ 4: КЛОНИРОВАНИЕ ПРОЕКТА (10 минут)

### 4.1. Создание директории проекта

```bash
# Создать директорию
mkdir -p /opt/planner

# Установить владельца (замените YOUR_USER на ваше имя пользователя)
# Если используете root, пропустите эту команду
# chown YOUR_USER:YOUR_USER /opt/planner

# Перейти в директорию
cd /opt/planner
```

### 4.2. Клонирование репозитория

```bash
# Если репозиторий публичный
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git .

# Если репозиторий приватный (с SSH ключом)
git clone git@github.com:YOUR_USERNAME/YOUR_REPO.git .

# Если репозиторий приватный (с токеном)
git clone https://YOUR_TOKEN@github.com/YOUR_USERNAME/YOUR_REPO.git .

# Проверить содержимое
ls -la
# Должны быть директории: backend, frontend и т.д.
```

### 4.3. Проверка структуры проекта

```bash
# Проверить структуру
tree -L 2
# или
ls -R

# Должны быть:
# - backend/
# - frontend/
# - README.md
# и т.д.
```

---

## ШАГ 5: НАСТРОЙКА BACKEND (20 минут)

### 5.1. Создание виртуального окружения

```bash
# Перейти в директорию backend
cd /opt/planner/backend

# Создать виртуальное окружение
python3.12 -m venv .venv

# Активировать виртуальное окружение
source .venv/bin/activate

# Проверить, что активировано (должен показать путь к .venv)
which python
# Должно быть: /opt/planner/backend/.venv/bin/python
```

### 5.2. Установка зависимостей

```bash
# Убедиться, что виртуальное окружение активировано
# (должно быть (.venv) в начале строки)

# Обновить pip
pip install --upgrade pip

# Установить зависимости
pip install -r requirements.txt

# Проверить установку
pip list | grep -E "fastapi|uvicorn|sqlmodel|alembic"
```

**Ожидаемый результат:**
```
fastapi         0.115.0
uvicorn         0.30.5
sqlmodel        0.0.21
alembic         1.13.3
```

### 5.3. Создание .env файла

```bash
# Создать .env файл
nano .env
```

**Содержимое .env файла:**

```env
# Database - PostgreSQL
# ⚠️ ВАЖНО: Замените YOUR_STRONG_PASSWORD на пароль из шага 3.2!
DATABASE_URL=postgresql://planner_user:YOUR_STRONG_PASSWORD@localhost:5432/planner_db

# Environment
ENVIRONMENT=production
PROJECT_NAME=Corporate Calendar API
API_V1_STR=/api/v1

# Security - ОБЯЗАТЕЛЬНО сгенерировать новый ключ!
# Генерация: openssl rand -hex 32
SECRET_KEY=YOUR_GENERATED_SECRET_KEY_HERE

# JWT
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# CORS - ваш домен
BACKEND_CORS_ORIGINS=https://calendar.corestone.ru,https://www.calendar.corestone.ru
```

**Генерация SECRET_KEY:**

```bash
# Сгенерировать SECRET_KEY
openssl rand -hex 32

# Скопировать результат и вставить в .env вместо YOUR_GENERATED_SECRET_KEY_HERE
```

**Сохранение файла:**
- В nano: `Ctrl+O` (сохранить), `Enter` (подтвердить), `Ctrl+X` (выйти)

### 5.4. Проверка .env файла

```bash
# Проверить, что файл создан
ls -la .env

# Проверить содержимое (без показа паролей)
grep -v "PASSWORD\|SECRET_KEY" .env
```

---

## ШАГ 6: ПРИМЕНЕНИЕ МИГРАЦИЙ (10 минут)

### 6.1. Проверка текущего состояния

```bash
# Убедиться, что виртуальное окружение активировано
source .venv/bin/activate

# Проверить текущую версию миграций
alembic current

# Посмотреть историю миграций
alembic history
```

### 6.2. Применение миграций

```bash
# Применить все миграции
alembic upgrade head

# Ожидаемый результат:
# INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
# INFO  [alembic.runtime.migration] Will assume transactional DDL.
# INFO  [alembic.runtime.migration] Running upgrade -> c3a032063819, create base calendar tables
# ... (много строк)
# INFO  [alembic.runtime.migration] Running upgrade ... -> ..., последняя миграция
```

### 6.3. Проверка таблиц в БД

```bash
# Войти в PostgreSQL
psql -U planner_user -d planner_db -h localhost

# Проверить таблицы
\dt

# Должны быть таблицы:
# - users
# - calendars
# - events
# - notifications
# и т.д.

# Проверить количество таблиц
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';

# Выйти
\q
```

### 6.4. Тестовый запуск сервера

```bash
# Убедиться, что виртуальное окружение активировано
source .venv/bin/activate

# Запустить сервер в тестовом режиме
uvicorn app.main:app --host 0.0.0.0 --port 8000

# В другом терминале (или на локальном компьютере) проверить:
curl http://155.212.190.153:8000/api/v1/health

# Ожидаемый результат:
# {"status":"ok"}

# Остановить сервер (Ctrl+C)
```

---

## ШАГ 7: НАСТРОЙКА SYSTEMD СЕРВИСА (15 минут)

### 7.1. Создание service файла

```bash
# Создать service файл
nano /etc/systemd/system/planner-backend.service
```

**Содержимое файла:**

```ini
[Unit]
Description=Planner Backend API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
# ⚠️ ВАЖНО: Замените YOUR_USERNAME на ваше имя пользователя!
User=YOUR_USERNAME
Group=YOUR_USERNAME
WorkingDirectory=/opt/planner/backend
Environment="PATH=/opt/planner/backend/.venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/opt/planner/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=planner-backend

# Ограничения ресурсов (опционально)
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

**⚠️ ВАЖНО:** 
- Замените `YOUR_USERNAME` на ваше имя пользователя (или `root`, если используете root)
- Если используете root, можно убрать строки `User=` и `Group=`

**Сохранение:** `Ctrl+O`, `Enter`, `Ctrl+X`

### 7.2. Запуск и включение сервиса

```bash
# Перезагрузить systemd
systemctl daemon-reload

# Включить автозапуск
systemctl enable planner-backend

# Запустить сервис
systemctl start planner-backend

# Проверить статус
systemctl status planner-backend
```

**Ожидаемый результат:**
```
● planner-backend.service - Planner Backend API
     Loaded: loaded (/etc/systemd/system/planner-backend.service; enabled; vendor preset: enabled)
     Active: active (running) since ...
```

### 7.3. Проверка логов

```bash
# Посмотреть последние логи
journalctl -u planner-backend -n 50

# Следить за логами в реальном времени
journalctl -u planner-backend -f

# Проверить, что нет ошибок
journalctl -u planner-backend --since "5 minutes ago" | grep -i error
```

### 7.4. Проверка работы сервиса

```bash
# Проверить, что сервер отвечает
curl http://localhost:8000/api/v1/health

# Ожидаемый результат:
# {"status":"ok"}

# Проверить readiness
curl http://localhost:8000/api/v1/health/ready

# Ожидаемый результат:
# {"status":"ready","database":"connected"}
```

---

## ШАГ 8: УСТАНОВКА И НАСТРОЙКА NGINX (20 минут)

### 8.1. Установка Nginx

```bash
# Установить Nginx
apt install -y nginx

# Запустить и включить автозапуск
systemctl start nginx
systemctl enable nginx

# Проверить статус
systemctl status nginx
```

### 8.2. Создание конфигурации Nginx

```bash
# Создать конфигурацию
nano /etc/nginx/sites-available/planner
```

**Содержимое файла:**

```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/s;

# Upstream для backend
upstream planner_backend {
    server 127.0.0.1:8000;
    keepalive 32;
}

# HTTP сервер (редирект на HTTPS)
server {
    listen 80;
    listen [::]:80;
    server_name calendar.corestone.ru www.calendar.corestone.ru;

    # Для Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Редирект на HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS сервер
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name calendar.corestone.ru www.calendar.corestone.ru;

    # SSL сертификаты (будут настроены через Certbot)
    ssl_certificate /etc/letsencrypt/live/calendar.corestone.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/calendar.corestone.ru/privkey.pem;
    
    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Логи
    access_log /var/log/nginx/planner_access.log;
    error_log /var/log/nginx/planner_error.log;

    # Максимальный размер загружаемых файлов
    client_max_body_size 50M;

    # Backend API
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        
        proxy_pass http://planner_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $server_name;
        
        # Таймауты
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Auth endpoints с более строгим rate limiting
    location /api/v1/auth/ {
        limit_req zone=auth_limit burst=10 nodelay;
        
        proxy_pass http://planner_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check (без rate limiting)
    location /api/v1/health {
        proxy_pass http://planner_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }

    # Frontend (если используется)
    location / {
        root /opt/planner/frontend/.next;
        try_files $uri $uri/ /index.html;
        
        # Кеширование статических файлов
        location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Статические файлы (uploads)
    location /uploads/ {
        alias /opt/planner/backend/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

**Сохранение:** `Ctrl+O`, `Enter`, `Ctrl+X`

### 8.3. Активация конфигурации

```bash
# Создать симлинк
ln -s /etc/nginx/sites-available/planner /etc/nginx/sites-enabled/

# Удалить дефолтную конфигурацию (опционально)
rm /etc/nginx/sites-enabled/default

# Проверить конфигурацию
nginx -t
```

**Ожидаемый результат:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**⚠️ ВАЖНО:** Если есть ошибки, исправьте их перед продолжением!

### 8.4. Запуск Nginx (пока без SSL)

```bash
# Перезагрузить Nginx
systemctl reload nginx

# Проверить статус
systemctl status nginx

# Проверить, что Nginx слушает порты
netstat -tlnp | grep nginx
# Должно быть: :80 и :443
```

---

## ШАГ 9: НАСТРОЙКА SSL (Let's Encrypt) (10 минут)

### 9.1. Установка Certbot

```bash
# Установить Certbot
apt install -y certbot python3-certbot-nginx
```

### 9.2. Получение SSL сертификата

```bash
# Получить сертификат
certbot --nginx -d calendar.corestone.ru -d www.calendar.corestone.ru
```

**Интерактивные вопросы:**

1. **Email address:** Введите ваш email (для уведомлений об истечении сертификата)
2. **Terms of Service:** Введите `A` (Agree)
3. **Share email:** Введите `N` (No) или `Y` (Yes) - по желанию
4. **Redirect HTTP to HTTPS:** Введите `2` (Redirect) - рекомендуется

**Ожидаемый результат:**
```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/calendar.corestone.ru/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/calendar.corestone.ru/privkey.pem
```

### 9.3. Проверка автоматического обновления

```bash
# Проверить, что таймер создан
systemctl status certbot.timer

# Протестировать обновление (dry-run)
certbot renew --dry-run
```

### 9.4. Проверка SSL

```bash
# Проверить сертификат
openssl s_client -connect calendar.corestone.ru:443 -servername calendar.corestone.ru

# Или через браузер
# Откройте https://calendar.corestone.ru
# Должен быть зеленый замочек
```

---

## ШАГ 10: НАСТРОЙКА АВТОМАТИЧЕСКОГО BACKUP (10 минут)

### 10.1. Настройка через systemd

```bash
# Перейти в директорию backend
cd /opt/planner/backend

# Сделать скрипт исполняемым
chmod +x scripts/setup_backup.sh

# Запустить настройку
./scripts/setup_backup.sh
```

**Ожидаемый результат:**
```
✅ Backup system configured successfully!

Status:
● planner-backup.timer - Planner Database Backup Timer
     Loaded: loaded (/etc/systemd/system/planner-backup.timer; enabled; vendor preset: enabled)
     Active: active (waiting) since ...
```

### 10.2. Проверка backup

```bash
# Запустить backup вручную
systemctl start planner-backup.service

# Проверить результат
ls -lh /opt/planner/backups/

# Должен быть файл: planner_db_YYYYMMDD_HHMMSS.sql

# Посмотреть логи
journalctl -u planner-backup.service -n 50
```

### 10.3. Проверка расписания

```bash
# Посмотреть следующее время запуска
systemctl list-timers planner-backup.timer

# Ожидаемый результат:
# NEXT                         LEFT          LAST                         PASSED
# Mon 2025-12-27 02:00:00 UTC  14h left      n/a                          n/a
```

---

## ШАГ 11: ФИНАЛЬНАЯ ПРОВЕРКА (15 минут)

### 11.1. Проверка всех сервисов

```bash
# Проверить статус всех сервисов
systemctl status planner-backend
systemctl status postgresql
systemctl status nginx
systemctl status planner-backup.timer
```

**Все должны быть `active (running)` или `active (waiting)`**

### 11.2. Проверка endpoints

```bash
# Health check
curl https://calendar.corestone.ru/api/v1/health

# Ожидаемый результат:
# {"status":"ok"}

# Readiness check
curl https://calendar.corestone.ru/api/v1/health/ready

# Ожидаемый результат:
# {"status":"ready","database":"connected"}
```

### 11.3. Проверка rate limiting

```bash
# Попробовать превысить лимит на /register
for i in {1..10}; do
  echo "Request $i:"
  curl -X POST https://calendar.corestone.ru/api/v1/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test","full_name":"Test"}' \
    -w "\nHTTP Status: %{http_code}\n\n"
  sleep 1
done

# После 5 запросов должен вернуться 429 (Too Many Requests)
```

### 11.4. Проверка подключения к БД

```bash
# Войти в PostgreSQL
psql -U planner_user -d planner_db -h localhost

# Проверить таблицы
\dt

# Проверить количество записей
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM calendars;
SELECT COUNT(*) FROM events;

# Выйти
\q
```

### 11.5. Проверка логов

```bash
# Логи backend
journalctl -u planner-backend -n 50 --no-pager

# Логи Nginx
tail -n 50 /var/log/nginx/planner_access.log
tail -n 50 /var/log/nginx/planner_error.log

# Проверить на ошибки
journalctl -u planner-backend --since "1 hour ago" | grep -i error
```

---

## ✅ ЧЕКЛИСТ ЗАВЕРШЕНИЯ

- [ ] Сервер обновлен
- [ ] Python 3.12 установлен
- [ ] PostgreSQL установлен и настроен
- [ ] База данных и пользователь созданы
- [ ] Проект клонирован
- [ ] Виртуальное окружение создано
- [ ] Зависимости установлены
- [ ] .env файл настроен
- [ ] SECRET_KEY сгенерирован
- [ ] DATABASE_URL настроен на PostgreSQL
- [ ] Миграции применены
- [ ] Backend запускается вручную
- [ ] systemd service создан и запущен
- [ ] Nginx настроен
- [ ] SSL сертификат получен
- [ ] Автоматический backup настроен
- [ ] Health endpoints отвечают
- [ ] Rate limiting работает
- [ ] Логи проверены
- [ ] Нет ошибок в логах

---

## 🎉 ГОТОВО!

Ваш проект развернут и готов к работе!

**Доступ:**
- API: https://calendar.corestone.ru/api/v1/
- Health: https://calendar.corestone.ru/api/v1/health
- Docs: https://calendar.corestone.ru/docs (если включено)

---

## 🆘 ЕСЛИ ЧТО-ТО НЕ РАБОТАЕТ

### Backend не запускается

```bash
# Проверить логи
journalctl -u planner-backend -n 100

# Проверить .env
cat /opt/planner/backend/.env

# Проверить подключение к БД
psql -U planner_user -d planner_db -h localhost -c "SELECT 1;"
```

### 502 Bad Gateway

```bash
# Проверить статус backend
systemctl status planner-backend

# Проверить порт
netstat -tlnp | grep 8000

# Проверить логи Nginx
tail -f /var/log/nginx/planner_error.log
```

### SSL не работает

```bash
# Проверить сертификат
certbot certificates

# Обновить сертификат
certbot renew --force-renewal
```

---

## 📚 ДОПОЛНИТЕЛЬНЫЕ РЕСУРСЫ

- `DEPLOYMENT_UBUNTU_POSTGRESQL.md` - Альтернативная версия инструкции
- `backend/scripts/README_BACKUP.md` - Документация по backup
- `DEPLOYMENT_CHECKLIST.md` - Краткий чеклист

