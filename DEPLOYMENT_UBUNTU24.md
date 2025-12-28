# Подробная инструкция по развертыванию на Ubuntu 24

**Сервер:** 155.212.190.153  
**Домен:** https://calendar.corestone.ru/

---

## Шаг 1: Подключение к серверу

```bash
ssh root@155.212.190.153
# или
ssh ваш_пользователь@155.212.190.153
```

---

## Шаг 2: Обновление системы и установка базовых компонентов

```bash
# Обновление списка пакетов
sudo apt update && sudo apt upgrade -y

# Установка базовых инструментов
sudo apt install -y git curl wget build-essential software-properties-common
```

---

## Шаг 3: Установка Python 3.11+

```bash
# Проверка текущей версии Python
python3 --version

# Установка Python 3.11 и необходимых пакетов
sudo apt install -y python3.11 python3.11-venv python3.11-dev python3-pip

# Создание символической ссылки (если нужно)
sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

# Проверка установки
python3 --version
pip3 --version
```

---

## Шаг 4: Установка Node.js 18+

```bash
# Установка Node.js через NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка установки
node --version
npm --version
```

**Примечание:** Для Next.js 16 рекомендуется Node.js 18+, установка выше использует версию 20.x.

---

## Шаг 5: Установка PostgreSQL (рекомендуется для продакшена)

```bash
# Установка PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Запуск и включение в автозагрузку
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Создание пользователя и базы данных
sudo -u postgres psql << EOF
CREATE USER planner_user WITH PASSWORD 'ваш_надежный_пароль';
CREATE DATABASE planner_db OWNER planner_user;
GRANT ALL PRIVILEGES ON DATABASE planner_db TO planner_user;
\q
EOF

# Проверка подключения
sudo -u postgres psql -d planner_db -c "SELECT version();"
```

**Важно:** Замените `ваш_надежный_пароль` на сложный пароль и сохраните его в безопасном месте!

---

## Шаг 6: Установка и настройка Nginx

```bash
# Установка Nginx
sudo apt install -y nginx

# Запуск и включение в автозагрузку
sudo systemctl start nginx
sudo systemctl enable nginx

# Проверка статуса
sudo systemctl status nginx
```

---

## Шаг 7: Клонирование проекта

```bash
# Создание директории для приложения
sudo mkdir -p /opt/planner
sudo chown $USER:$USER /opt/planner

# Клонирование репозитория
cd /opt
git clone https://github.com/skandini/planner.git planner
cd planner

# Проверка текущей ветки
git branch -a
git checkout testmain  # или нужная вам ветка
```

---

## Шаг 8: Настройка Backend

### 8.1. Создание виртуального окружения

```bash
cd /opt/planner/backend

# Создание виртуального окружения
python3.11 -m venv .venv

# Активация окружения
source .venv/bin/activate

# Обновление pip
pip install --upgrade pip setuptools wheel
```

### 8.2. Установка зависимостей

```bash
# Установка зависимостей из requirements.txt
pip install -r requirements.txt

# Проверка установки основных пакетов
pip list | grep -E "fastapi|uvicorn|sqlmodel|alembic"
```

### 8.3. Настройка переменных окружения

```bash
# Создание файла .env
cp env.example.txt .env
nano .env
```

**Содержимое файла `.env` для продакшена:**

```env
# Database - используйте PostgreSQL для продакшена
DATABASE_URL=postgresql://planner_user:ваш_надежный_пароль@localhost/planner_db

# Security - ОБЯЗАТЕЛЬНО измените SECRET_KEY!
# Генерация секретного ключа: openssl rand -hex 32
SECRET_KEY=ваш_сгенерированный_секретный_ключ_32_символа_hex
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# CORS - укажите ваш домен
BACKEND_CORS_ORIGINS=https://calendar.corestone.ru,https://www.calendar.corestone.ru

# Environment
ENVIRONMENT=production
PROJECT_NAME=Corporate Calendar API
API_V1_STR=/api/v1
```

**Важно:**
1. Замените `ваш_надежный_пароль` на пароль, который вы установили для PostgreSQL
2. Сгенерируйте SECRET_KEY командой: `openssl rand -hex 32`
3. Сохраните файл (Ctrl+O, Enter, Ctrl+X в nano)

### 8.4. Применение миграций базы данных

```bash
# Убедитесь, что виртуальное окружение активно
source .venv/bin/activate

# Применение миграций
alembic upgrade head

# Проверка статуса миграций
alembic current
alembic history
```

### 8.5. Создание начальных данных

```bash
# Создание организаций (если нужно)
python scripts/create_organizations.py

# Создание тестовых пользователей (опционально)
# python scripts/create_demo_users.py
```

### 8.6. Проверка работы Backend

```bash
# Тестовый запуск (в фоновом режиме)
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 &

# Проверка в другом терминале или через curl
curl http://localhost:8000/api/v1/health
# или
curl http://localhost:8000/docs

# Остановка тестового запуска
pkill -f uvicorn
```

---

## Шаг 9: Настройка Frontend

### 9.1. Установка зависимостей

```bash
cd /opt/planner/frontend

# Установка зависимостей
npm install

# Проверка установки
npm list --depth=0
```

### 9.2. Настройка переменных окружения

```bash
# Создание файла .env.local
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_BASE_URL=https://calendar.corestone.ru/api/v1
EOF

# Проверка содержимого
cat .env.local
```

### 9.3. Сборка для продакшена

```bash
# Сборка Next.js приложения
npm run build

# Проверка наличия папки .next
ls -la .next
```

### 9.4. Проверка работы Frontend

```bash
# Тестовый запуск (в фоновом режиме)
npm start &

# Проверка в браузере или через curl
curl http://localhost:3000

# Остановка тестового запуска
pkill -f "next start"
```

---

## Шаг 10: Настройка systemd сервисов

### 10.1. Создание сервиса для Backend

```bash
sudo nano /etc/systemd/system/planner-backend.service
```

**Содержимое файла:**

```ini
[Unit]
Description=Planner Backend API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/planner/backend
Environment="PATH=/opt/planner/backend/.venv/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/opt/planner/backend/.env
ExecStart=/opt/planner/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=planner-backend

[Install]
WantedBy=multi-user.target
```

**Сохранение:** Ctrl+O, Enter, Ctrl+X

### 10.2. Создание сервиса для Frontend

```bash
sudo nano /etc/systemd/system/planner-frontend.service
```

**Содержимое файла:**

```ini
[Unit]
Description=Planner Frontend Next.js
After=network.target planner-backend.service
Requires=planner-backend.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/planner/frontend
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=planner-frontend

[Install]
WantedBy=multi-user.target
```

**Сохранение:** Ctrl+O, Enter, Ctrl+X

### 10.3. Настройка прав доступа

```bash
# Установка прав владельца для проекта
sudo chown -R www-data:www-data /opt/planner

# Права на выполнение для скриптов
sudo chmod +x /opt/planner/backend/.venv/bin/uvicorn
sudo chmod +x /opt/planner/frontend/node_modules/.bin/next

# Права на запись для uploads и базы данных
sudo chmod -R 755 /opt/planner/backend/uploads
sudo chmod 664 /opt/planner/backend/calendar.db 2>/dev/null || true
```

### 10.4. Запуск и включение сервисов

```bash
# Перезагрузка systemd для чтения новых сервисов
sudo systemctl daemon-reload

# Включение автозапуска
sudo systemctl enable planner-backend
sudo systemctl enable planner-frontend

# Запуск сервисов
sudo systemctl start planner-backend
sudo systemctl start planner-frontend

# Проверка статуса
sudo systemctl status planner-backend
sudo systemctl status planner-frontend

# Просмотр логов (если есть ошибки)
sudo journalctl -u planner-backend -n 50 --no-pager
sudo journalctl -u planner-frontend -n 50 --no-pager
```

---

## Шаг 11: Настройка Nginx

### 11.1. Удаление дефолтной конфигурации

```bash
# Удаление символической ссылки на дефолтный сайт
sudo rm -f /etc/nginx/sites-enabled/default

# Остановка или изменение дефолтного сайта (опционально)
sudo mv /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup
```

### 11.2. Создание конфигурации для приложения

```bash
sudo nano /etc/nginx/sites-available/planner
```

**Содержимое файла:**

```nginx
# Backend API
server {
    listen 80;
    server_name calendar.corestone.ru www.calendar.corestone.ru;

    # Увеличение размера загружаемых файлов
    client_max_body_size 50M;

    # Проксирование запросов к Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Статические файлы (uploads)
    location /uploads/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend (все остальные запросы)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Логирование
    access_log /var/log/nginx/planner-access.log;
    error_log /var/log/nginx/planner-error.log;
}
```

**Сохранение:** Ctrl+O, Enter, Ctrl+X

### 11.3. Активация конфигурации

```bash
# Создание символической ссылки
sudo ln -s /etc/nginx/sites-available/planner /etc/nginx/sites-enabled/

# Проверка синтаксиса конфигурации
sudo nginx -t

# Если проверка прошла успешно, перезагрузка Nginx
sudo systemctl reload nginx

# Проверка статуса
sudo systemctl status nginx
```

---

## Шаг 12: Настройка SSL сертификата (Let's Encrypt)

### 12.1. Установка Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 12.2. Получение SSL сертификата

```bash
# Получение сертификата для домена
sudo certbot --nginx -d calendar.corestone.ru -d www.calendar.corestone.ru

# Следуйте инструкциям:
# - Введите email для уведомлений
# - Согласитесь с условиями использования
# - Выберите редирект HTTP -> HTTPS (рекомендуется выбрать вариант 2)
```

### 12.3. Проверка автоматического обновления

```bash
# Проверка настройки автообновления
sudo certbot renew --dry-run

# Проверка таймера автообновления
sudo systemctl status certbot.timer
```

### 12.4. Проверка конфигурации Nginx после Certbot

```bash
# Certbot автоматически обновит конфигурацию Nginx
# Проверьте содержимое:
sudo cat /etc/nginx/sites-available/planner

# Проверка синтаксиса
sudo nginx -t

# Перезагрузка если нужно
sudo systemctl reload nginx
```

---

## Шаг 13: Настройка файрвола (Firewall)

```bash
# Проверка статуса UFW
sudo ufw status

# Разрешение SSH (ОБЯЗАТЕЛЬНО сначала!)
sudo ufw allow OpenSSH

# Разрешение HTTP и HTTPS
sudo ufw allow 'Nginx Full'
# или по отдельности:
# sudo ufw allow 80/tcp
# sudo ufw allow 443/tcp

# Включение файрвола
sudo ufw enable

# Проверка статуса
sudo ufw status verbose
```

**Важно:** Убедитесь, что SSH разрешен ДО включения файрвола, иначе вы можете потерять доступ к серверу!

---

## Шаг 14: Финальная проверка

### 14.1. Проверка статуса всех сервисов

```bash
# Проверка статуса
sudo systemctl status planner-backend
sudo systemctl status planner-frontend
sudo systemctl status nginx
sudo systemctl status postgresql

# Проверка доступности портов
sudo netstat -tlnp | grep -E "8000|3000|80|443"
# или
sudo ss -tlnp | grep -E "8000|3000|80|443"
```

### 14.2. Проверка через curl

```bash
# Проверка Backend API
curl https://calendar.corestone.ru/api/v1/health
# или
curl -k https://calendar.corestone.ru/api/v1/docs

# Проверка Frontend
curl -I https://calendar.corestone.ru/
```

### 14.3. Проверка в браузере

1. Откройте https://calendar.corestone.ru/ в браузере
2. Проверьте, что сайт загружается
3. Проверьте консоль браузера (F12) на наличие ошибок
4. Попробуйте зарегистрироваться или войти

### 14.4. Проверка логов при проблемах

```bash
# Логи Backend
sudo journalctl -u planner-backend -f

# Логи Frontend
sudo journalctl -u planner-frontend -f

# Логи Nginx
sudo tail -f /var/log/nginx/planner-access.log
sudo tail -f /var/log/nginx/planner-error.log

# Логи PostgreSQL (если используете)
sudo tail -f /var/log/postgresql/postgresql-*.log
```

---

## Шаг 15: Настройка резервного копирования (рекомендуется)

### 15.1. Создание скрипта резервного копирования

```bash
sudo nano /opt/planner/scripts/backup.sh
```

**Содержимое:**

```bash
#!/bin/bash
BACKUP_DIR="/opt/planner/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# Резервная копия базы данных PostgreSQL
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw planner_db; then
    sudo -u postgres pg_dump planner_db > "$BACKUP_DIR/planner_db_$TIMESTAMP.sql"
    echo "Backup created: planner_db_$TIMESTAMP.sql"
fi

# Резервная копия SQLite (если используется)
if [ -f /opt/planner/backend/calendar.db ]; then
    cp /opt/planner/backend/calendar.db "$BACKUP_DIR/calendar.db.$TIMESTAMP"
    echo "Backup created: calendar.db.$TIMESTAMP"
fi

# Удаление старых резервных копий (старше 30 дней)
find "$BACKUP_DIR" -name "*.sql" -mtime +30 -delete
find "$BACKUP_DIR" -name "calendar.db.*" -mtime +30 -delete

echo "Backup completed: $TIMESTAMP"
```

```bash
# Делаем скрипт исполняемым
sudo chmod +x /opt/planner/scripts/backup.sh
```

### 15.2. Настройка автоматического резервного копирования (cron)

```bash
# Редактирование crontab
sudo crontab -e

# Добавьте строку для ежедневного резервного копирования в 2:00 ночи:
0 2 * * * /opt/planner/scripts/backup.sh >> /var/log/planner-backup.log 2>&1
```

---

## Шаг 16: Оптимизация и мониторинг

### 16.1. Настройка логирования

```bash
# Создание директории для логов
sudo mkdir -p /var/log/planner
sudo chown www-data:www-data /var/log/planner

# Ротация логов (опционально)
sudo nano /etc/logrotate.d/planner
```

**Содержимое `/etc/logrotate.d/planner`:**

```
/var/log/planner/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
```

### 16.2. Мониторинг использования ресурсов

```bash
# Установка утилит для мониторинга
sudo apt install -y htop iotop nethogs

# Просмотр использования ресурсов
htop
```

---

## Возможные проблемы и решения

### Проблема: Backend не запускается

**Решение:**
```bash
# Проверка логов
sudo journalctl -u planner-backend -n 100

# Проверка прав доступа
ls -la /opt/planner/backend/.venv/bin/uvicorn

# Проверка переменных окружения
sudo -u www-data cat /opt/planner/backend/.env

# Ручной запуск для отладки
sudo -u www-data /opt/planner/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Проблема: Frontend не запускается

**Решение:**
```bash
# Проверка логов
sudo journalctl -u planner-frontend -n 100

# Проверка сборки
cd /opt/planner/frontend
ls -la .next

# Ручной запуск для отладки
sudo -u www-data npm run start
```

### Проблема: 502 Bad Gateway

**Решение:**
```bash
# Проверка, что сервисы запущены
sudo systemctl status planner-backend
sudo systemctl status planner-frontend

# Проверка доступности портов
curl http://localhost:8000/api/v1/health
curl http://localhost:3000

# Проверка конфигурации Nginx
sudo nginx -t
```

### Проблема: CORS ошибки

**Решение:**
- Проверьте настройки `BACKEND_CORS_ORIGINS` в `.env`
- Убедитесь, что домен указан правильно (с https://)
- Перезапустите Backend: `sudo systemctl restart planner-backend`

### Проблема: База данных недоступна

**Решение:**
```bash
# Проверка статуса PostgreSQL
sudo systemctl status postgresql

# Проверка подключения
sudo -u postgres psql -d planner_db -c "SELECT 1;"

# Проверка DATABASE_URL в .env
cat /opt/planner/backend/.env | grep DATABASE_URL
```

---

## Обновление приложения

### Быстрое обновление

```bash
cd /opt/planner

# Создание резервной копии
./scripts/backup.sh

# Обновление кода
git fetch origin
git pull origin testmain  # или нужная ветка

# Обновление Backend
cd backend
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
sudo systemctl restart planner-backend

# Обновление Frontend
cd ../frontend
npm install
npm run build
sudo systemctl restart planner-frontend

# Проверка
sudo systemctl status planner-backend
sudo systemctl status planner-frontend
```

### Использование скрипта deploy.sh

```bash
cd /opt/planner
chmod +x scripts/deploy.sh
./scripts/deploy.sh update testmain
```

---

## Полезные команды

```bash
# Перезапуск всех сервисов
sudo systemctl restart planner-backend planner-frontend nginx

# Просмотр логов в реальном времени
sudo journalctl -u planner-backend -f
sudo journalctl -u planner-frontend -f

# Проверка использования дискового пространства
df -h

# Проверка использования памяти
free -h

# Проверка активных подключений
sudo netstat -tulpn | grep LISTEN
```

---

## Безопасность

1. **Регулярно обновляйте систему:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Используйте сложные пароли** для PostgreSQL и SECRET_KEY

3. **Ограничьте SSH доступ** (опционально):
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Измените Port 22 на другой порт
   # Отключите root login: PermitRootLogin no
   sudo systemctl restart sshd
   ```

4. **Настройте fail2ban** для защиты от брутфорса:
   ```bash
   sudo apt install -y fail2ban
   sudo systemctl enable fail2ban
   sudo systemctl start fail2ban
   ```

5. **Регулярно создавайте резервные копии** базы данных

---

## Контакты и поддержка

При возникновении проблем проверьте:
- Логи сервисов: `sudo journalctl -u planner-backend -n 100`
- Логи Nginx: `sudo tail -f /var/log/nginx/planner-error.log`
- Статус сервисов: `sudo systemctl status planner-backend planner-frontend`

---

**Готово! Ваше приложение должно быть доступно по адресу: https://calendar.corestone.ru/**

