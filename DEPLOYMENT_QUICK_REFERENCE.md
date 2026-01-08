# Быстрая шпаргалка по развертыванию

## Быстрая настройка сервера (Ubuntu 24)

```bash
# 1. Обновление системы
sudo apt update && sudo apt upgrade -y

# 2. Установка базовых компонентов
sudo apt install -y git curl wget build-essential python3.11 python3.11-venv python3.11-dev python3-pip
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
sudo apt install -y postgresql postgresql-contrib nginx certbot python3-certbot-nginx

# 3. Клонирование проекта
sudo mkdir -p /opt/planner && sudo chown $USER:$USER /opt/planner
cd /opt && git clone https://github.com/skandini/planner.git planner
cd planner && git checkout testmain
```

## Настройка Backend

```bash
cd /opt/planner/backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip && pip install -r requirements.txt
cp env.example.txt .env
nano .env  # Настройте DATABASE_URL, SECRET_KEY, BACKEND_CORS_ORIGINS
alembic upgrade head
python scripts/create_organizations.py
```

## Настройка Frontend

```bash
cd /opt/planner/frontend
npm install
echo "NEXT_PUBLIC_API_BASE_URL=https://calendar.corestone.ru/api/v1" > .env.local
npm run build
```

## Systemd сервисы

```bash
# Создание сервисов (см. полную инструкцию для содержимого файлов)
sudo nano /etc/systemd/system/planner-backend.service
sudo nano /etc/systemd/system/planner-frontend.service

# Запуск
sudo systemctl daemon-reload
sudo systemctl enable planner-backend planner-frontend
sudo systemctl start planner-backend planner-frontend
sudo systemctl status planner-backend planner-frontend
```

## Nginx конфигурация

```bash
sudo nano /etc/nginx/sites-available/planner
sudo ln -s /etc/nginx/sites-available/planner /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## SSL сертификат

```bash
sudo certbot --nginx -d calendar.corestone.ru -d www.calendar.corestone.ru
```

## Файрвол

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Основные команды управления

```bash
# Статус сервисов
sudo systemctl status planner-backend planner-frontend nginx postgresql

# Перезапуск
sudo systemctl restart planner-backend planner-frontend

# Логи
sudo journalctl -u planner-backend -f
sudo journalctl -u planner-frontend -f
sudo tail -f /var/log/nginx/planner-error.log

# Проверка портов
sudo ss -tlnp | grep -E "8000|3000|80|443"
```

## Обновление

```bash
cd /opt/planner
git pull origin testmain
cd backend && source .venv/bin/activate && pip install -r requirements.txt && alembic upgrade head
cd ../frontend && npm install && npm run build
sudo systemctl restart planner-backend planner-frontend
```

**Полная инструкция:** см. `DEPLOYMENT_UBUNTU24.md`



