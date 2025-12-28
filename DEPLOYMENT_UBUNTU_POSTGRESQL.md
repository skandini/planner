# Подробная инструкция по деплою на Ubuntu с PostgreSQL

## 📋 Содержание

1. [Подготовка сервера](#подготовка-сервера)
2. [Установка зависимостей](#установка-зависимостей)
3. [Настройка PostgreSQL](#настройка-postgresql)
4. [Клонирование и настройка проекта](#клонирование-и-настройка-проекта)
5. [Настройка systemd сервисов](#настройка-systemd-сервисов)
6. [Настройка Nginx](#настройка-nginx)
7. [Настройка SSL (Let's Encrypt)](#настройка-ssl-lets-encrypt)
8. [Настройка автоматического backup](#настройка-автоматического-backup)
9. [Проверка и тестирование](#проверка-и-тестирование)
10. [Мониторинг и обслуживание](#мониторинг-и-обслуживание)

---

## 🖥️ Подготовка сервера

### Требования к серверу

- **ОС:** Ubuntu 22.04 LTS или 24.04 LTS
- **RAM:** Минимум 2GB (рекомендуется 4GB+)
- **CPU:** 2+ ядра
- **Диск:** 20GB+ свободного места
- **Сеть:** Статический IP или домен

### Обновление системы

```bash
# Войти на сервер
ssh root@155.212.190.153

# Обновить систему
sudo apt update
sudo apt upgrade -y

# Установить базовые утилиты
sudo apt install -y curl wget git vim ufw
```

---

## 📦 Установка зависимостей

### 1. Python 3.12

```bash
# Проверить версию Python
python3 --version

# Если Python 3.12 не установлен, установить через deadsnakes PPA
sudo apt install -y software-properties-common
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3.12-dev

# Установить pip
sudo apt install -y python3-pip
```

### 2. PostgreSQL

```bash
# Установить PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Проверить версию
psql --version

# Запустить и включить автозапуск
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 3. Node.js (для frontend, если нужен)

```bash
# Установить Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Проверить версию
node --version
npm --version
```

### 4. Nginx

```bash
# Установить Nginx
sudo apt install -y nginx

# Запустить и включить автозапуск
sudo systemctl start nginx
sudo systemctl enable nginx

# Проверить статус
sudo systemctl status nginx
```

### 5. Certbot (для SSL)

```bash
# Установить Certbot
sudo apt install -y certbot python3-certbot-nginx
```

---

## 🗄️ Настройка PostgreSQL

### 1. Создание базы данных и пользователя

```bash
# Переключиться на пользователя postgres
sudo -u postgres psql

# В psql выполнить:
CREATE DATABASE planner_db;
CREATE USER planner_user WITH PASSWORD 'YOUR_STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE planner_db TO planner_user;

# Для PostgreSQL 15+ нужно также дать права на схему
\c planner_db
GRANT ALL ON SCHEMA public TO planner_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO planner_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO planner_user;

# Выйти из psql
\q
```

**⚠️ ВАЖНО:** Замените `YOUR_STRONG_PASSWORD_HERE` на надежный пароль!

### 2. Настройка PostgreSQL для production

```bash
# Отредактировать конфигурацию
sudo nano /etc/postgresql/*/main/postgresql.conf

# Найти и изменить:
# max_connections = 100
# shared_buffers = 256MB
# effective_cache_size = 1GB
# maintenance_work_mem = 64MB
# checkpoint_completion_target = 0.9
# wal_buffers = 16MB
# default_statistics_target = 100
# random_page_cost = 1.1
# effective_io_concurrency = 200
# work_mem = 4MB
# min_wal_size = 1GB
# max_wal_size = 4GB

# Настроить pg_hba.conf для доступа
sudo nano /etc/postgresql/*/main/pg_hba.conf

# Добавить строку (для локального доступа):
# local   planner_db   planner_user   md5

# Перезапустить PostgreSQL
sudo systemctl restart postgresql
```

### 3. Проверка подключения

```bash
# Проверить подключение
psql -U planner_user -d planner_db -h localhost -c "SELECT version();"

# Если запрашивает пароль и подключается - все ОК
```

---

## 📥 Клонирование и настройка проекта

### 1. Создание директории проекта

```bash
# Создать директорию
sudo mkdir -p /opt/planner
sudo chown $USER:$USER /opt/planner
cd /opt/planner
```

### 2. Клонирование репозитория

```bash
# Клонировать проект (замените на ваш репозиторий)
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git .

# Или если уже есть репозиторий
git pull origin main
```

### 3. Настройка backend

```bash
# Перейти в директорию backend
cd /opt/planner/backend

# Создать виртуальное окружение
python3.12 -m venv .venv

# Активировать виртуальное окружение
source .venv/bin/activate

# Обновить pip
pip install --upgrade pip

# Установить зависимости
pip install -r requirements.txt
```

### 4. Настройка .env файла

```bash
# Создать .env файл
nano .env
```

**Содержимое .env:**

```env
# Database - PostgreSQL
DATABASE_URL=postgresql://planner_user:YOUR_STRONG_PASSWORD_HERE@localhost:5432/planner_db

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

**⚠️ ВАЖНО:**
1. Замените `YOUR_STRONG_PASSWORD_HERE` на пароль из PostgreSQL
2. Сгенерируйте `SECRET_KEY`: `openssl rand -hex 32`
3. Укажите правильные домены в `BACKEND_CORS_ORIGINS`

### 5. Применение миграций

```bash
# Убедитесь, что виртуальное окружение активировано
source .venv/bin/activate

# Применить миграции
alembic upgrade head

# Проверить текущую версию
alembic current
```

### 6. Тестовая проверка

```bash
# Запустить сервер в тестовом режиме
uvicorn app.main:app --host 0.0.0.0 --port 8000

# В другом терминале проверить
curl http://localhost:8000/api/v1/health

# Если ответ {"status":"ok"} - все работает
# Остановить сервер (Ctrl+C)
```

---

## ⚙️ Настройка systemd сервисов

### 1. Создание systemd service для backend

```bash
# Создать service файл
sudo nano /etc/systemd/system/planner-backend.service
```

**Содержимое:**

```ini
[Unit]
Description=Planner Backend API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
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

[Install]
WantedBy=multi-user.target
```

**⚠️ ВАЖНО:** Замените `YOUR_USERNAME` на ваше имя пользователя!

### 2. Запуск и включение сервиса

```bash
# Перезагрузить systemd
sudo systemctl daemon-reload

# Включить автозапуск
sudo systemctl enable planner-backend

# Запустить сервис
sudo systemctl start planner-backend

# Проверить статус
sudo systemctl status planner-backend

# Посмотреть логи
sudo journalctl -u planner-backend -f
```

### 3. Настройка автоматического backup

```bash
# Перейти в директорию backend
cd /opt/planner/backend

# Сделать скрипты исполняемыми
chmod +x scripts/setup_backup.sh

# Запустить настройку
./scripts/setup_backup.sh

# Проверить статус
sudo systemctl status planner-backup.timer
```

---

## 🌐 Настройка Nginx

### 1. Создание конфигурации Nginx

```bash
# Создать конфигурацию
sudo nano /etc/nginx/sites-available/planner
```

**Содержимое:**

```nginx
# Rate limiting zone
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

### 2. Активация конфигурации

```bash
# Создать симлинк
sudo ln -s /etc/nginx/sites-available/planner /etc/nginx/sites-enabled/

# Удалить дефолтную конфигурацию (опционально)
sudo rm /etc/nginx/sites-enabled/default

# Проверить конфигурацию
sudo nginx -t

# Если все ОК, перезагрузить Nginx
sudo systemctl reload nginx
```

---

## 🔒 Настройка SSL (Let's Encrypt)

### 1. Получение SSL сертификата

```bash
# Получить сертификат
sudo certbot --nginx -d calendar.corestone.ru -d www.calendar.corestone.ru

# Следовать инструкциям:
# - Ввести email
# - Принять условия
# - Выбрать редирект на HTTPS (2)
```

### 2. Автоматическое обновление сертификата

```bash
# Certbot автоматически создает cron job для обновления
# Проверить:
sudo certbot renew --dry-run

# Посмотреть статус
sudo systemctl status certbot.timer
```

---

## 🔄 Настройка автоматического backup

### 1. Настройка через systemd (рекомендуется)

```bash
cd /opt/planner/backend
chmod +x scripts/setup_backup.sh
./scripts/setup_backup.sh
```

### 2. Проверка backup

```bash
# Запустить backup вручную
sudo systemctl start planner-backup.service

# Проверить результат
ls -lh /opt/planner/backups/

# Посмотреть логи
sudo journalctl -u planner-backup.service -n 50
```

---

## ✅ Проверка и тестирование

### 1. Проверка всех сервисов

```bash
# Проверить статус всех сервисов
sudo systemctl status planner-backend
sudo systemctl status postgresql
sudo systemctl status nginx
sudo systemctl status planner-backup.timer
```

### 2. Проверка endpoints

```bash
# Health check
curl https://calendar.corestone.ru/api/v1/health

# Readiness check
curl https://calendar.corestone.ru/api/v1/health/ready

# Должны вернуть JSON с {"status":"ok"} или {"status":"ready"}
```

### 3. Проверка rate limiting

```bash
# Попробовать превысить лимит на /register
for i in {1..10}; do
  curl -X POST https://calendar.corestone.ru/api/v1/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test","full_name":"Test"}'
  echo ""
done

# После 5 запросов должен вернуться 429 (Too Many Requests)
```

### 4. Проверка подключения к БД

```bash
# Войти в PostgreSQL
sudo -u postgres psql -d planner_db

# Проверить таблицы
\dt

# Проверить количество записей
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM calendars;
SELECT COUNT(*) FROM events;

# Выйти
\q
```

### 5. Проверка логов

```bash
# Логи backend
sudo journalctl -u planner-backend -f

# Логи Nginx
sudo tail -f /var/log/nginx/planner_access.log
sudo tail -f /var/log/nginx/planner_error.log

# Логи PostgreSQL
sudo tail -f /var/log/postgresql/postgresql-*.log
```

---

## 📊 Мониторинг и обслуживание

### 1. Мониторинг ресурсов

```bash
# Использование CPU и памяти
htop

# Использование диска
df -h

# Использование памяти PostgreSQL
sudo -u postgres psql -c "SELECT * FROM pg_stat_database WHERE datname = 'planner_db';"
```

### 2. Обслуживание базы данных

```bash
# Анализ и вакуум
sudo -u postgres psql -d planner_db -c "VACUUM ANALYZE;"

# Проверка размера БД
sudo -u postgres psql -d planner_db -c "SELECT pg_size_pretty(pg_database_size('planner_db'));"
```

### 3. Обновление проекта

```bash
# Остановить сервис
sudo systemctl stop planner-backend

# Обновить код
cd /opt/planner
git pull origin main

# Обновить зависимости (если нужно)
cd backend
source .venv/bin/activate
pip install -r requirements.txt

# Применить миграции (если есть)
alembic upgrade head

# Запустить сервис
sudo systemctl start planner-backend

# Проверить статус
sudo systemctl status planner-backend
```

### 4. Восстановление из backup

```bash
# Остановить приложение
sudo systemctl stop planner-backend

# Восстановить из backup
cd /opt/planner/backups
pg_restore -h localhost -U planner_user -d planner_db -c planner_db_YYYYMMDD_HHMMSS.sql

# Запустить приложение
sudo systemctl start planner-backend
```

---

## 🆘 Troubleshooting

### Проблема: Backend не запускается

```bash
# Проверить логи
sudo journalctl -u planner-backend -n 100

# Проверить .env файл
cat /opt/planner/backend/.env

# Проверить подключение к БД
psql -U planner_user -d planner_db -h localhost -c "SELECT 1;"
```

### Проблема: 502 Bad Gateway

```bash
# Проверить, запущен ли backend
sudo systemctl status planner-backend

# Проверить порт
sudo netstat -tlnp | grep 8000

# Проверить логи Nginx
sudo tail -f /var/log/nginx/planner_error.log
```

### Проблема: Ошибки миграций

```bash
# Проверить текущую версию
cd /opt/planner/backend
source .venv/bin/activate
alembic current

# Посмотреть историю
alembic history

# Откатить последнюю миграцию (если нужно)
alembic downgrade -1
```

---

## 📝 Чеклист деплоя

- [ ] Сервер обновлен и настроен
- [ ] Python 3.12 установлен
- [ ] PostgreSQL установлен и настроен
- [ ] База данных и пользователь созданы
- [ ] Проект клонирован
- [ ] Виртуальное окружение создано
- [ ] Зависимости установлены
- [ ] .env файл настроен с правильными значениями
- [ ] SECRET_KEY сгенерирован и установлен
- [ ] Миграции применены
- [ ] Backend запускается вручную
- [ ] systemd service создан и запущен
- [ ] Nginx настроен
- [ ] SSL сертификат получен
- [ ] Автоматический backup настроен
- [ ] Health endpoints отвечают
- [ ] Rate limiting работает
- [ ] Логи проверены

---

## 🎉 Готово!

После выполнения всех шагов ваш проект будет развернут на Ubuntu сервере с PostgreSQL и готов к работе!

**Дополнительные ресурсы:**
- `DEPLOYMENT_CHECKLIST.md` - Краткий чеклист
- `backend/scripts/README_BACKUP.md` - Документация по backup
- `PLAN_PROGRESS_REPORT.md` - Прогресс по улучшениям
