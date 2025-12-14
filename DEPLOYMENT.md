# Инструкция по развертыванию на Ubuntu сервере

## Требования

- Ubuntu 20.04 или новее
- Python 3.11+
- Node.js 18+ и npm
- PostgreSQL (рекомендуется) или SQLite (для разработки)
- Nginx (для проксирования)
- SSL сертификат (Let's Encrypt)

## 1. Подготовка сервера

### Обновление системы
```bash
sudo apt update && sudo apt upgrade -y
```

### Установка базовых инструментов
```bash
sudo apt install -y git curl wget build-essential
```

### Установка Python 3.11+
```bash
sudo apt install -y python3.11 python3.11-venv python3.11-dev python3-pip
```

### Установка Node.js 18+
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### Установка PostgreSQL (опционально, для продакшена)
```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres createuser --interactive --pwprompt planner_user
sudo -u postgres createdb -O planner_user planner_db
```

### Установка Nginx
```bash
sudo apt install -y nginx
```

## 2. Клонирование проекта

```bash
cd /opt
sudo git clone https://github.com/skandini/planner.git
sudo chown -R $USER:$USER planner
cd planner
```

## 3. Настройка Backend

```bash
cd backend

# Создание виртуального окружения
python3.11 -m venv .venv
source .venv/bin/activate

# Установка зависимостей
pip install --upgrade pip
pip install -r requirements.txt

# Настройка переменных окружения
cp .env.example .env
nano .env  # Отредактируйте настройки
```

### Настройка .env для продакшена:
```env
DATABASE_URL=postgresql://planner_user:password@localhost/planner_db
# или для SQLite:
# DATABASE_URL=sqlite:///./calendar.db

SECRET_KEY=your-secret-key-here-generate-with-openssl-rand-hex-32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS настройки
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Применение миграций
```bash
alembic upgrade head
```

### Создание организаций
```bash
python scripts/create_organizations.py
```

## 4. Настройка Frontend

```bash
cd ../frontend

# Установка зависимостей
npm install

# Создание .env.local
cat > .env.local << EOF
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com/api/v1
EOF

# Сборка для продакшена
npm run build
```

## 5. Настройка systemd сервисов

### Backend сервис
```bash
sudo nano /etc/systemd/system/planner-backend.service
```

Содержимое:
```ini
[Unit]
Description=Planner Backend API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/planner/backend
Environment="PATH=/opt/planner/backend/.venv/bin"
ExecStart=/opt/planner/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Frontend сервис (Next.js)
```bash
sudo nano /etc/systemd/system/planner-frontend.service
```

Содержимое:
```ini
[Unit]
Description=Planner Frontend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/planner/frontend
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Запуск сервисов
```bash
sudo systemctl daemon-reload
sudo systemctl enable planner-backend
sudo systemctl enable planner-frontend
sudo systemctl start planner-backend
sudo systemctl start planner-frontend
```

## 6. Настройка Nginx

```bash
sudo nano /etc/nginx/sites-available/planner
```

Содержимое:
```nginx
# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Активация конфигурации:
```bash
sudo ln -s /etc/nginx/sites-available/planner /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 7. SSL сертификат (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com
```

## 8. Проверка работы

```bash
# Проверка статуса сервисов
sudo systemctl status planner-backend
sudo systemctl status planner-frontend

# Проверка логов
sudo journalctl -u planner-backend -f
sudo journalctl -u planner-frontend -f
```

## Обновление версий

См. `UPDATE.md` для инструкций по обновлению.

