# Чеклист деплоя на production сервер

## ✅ Текущий статус

- ✅ Локально все работает
- ✅ Фаза 1: Критические исправления - завершена
- ✅ Фаза 2: Производительность - частично завершена
- ✅ Сервер запущен и отвечает на запросы

## 📋 Следующие шаги по приоритетам

### Шаг 1: Подготовка к деплою (30 минут)

#### 1.1. Коммит всех изменений

```powershell
# Проверить статус
git status

# Добавить все изменения
git add .

# Закоммитить
git commit -m "Фаза 1 и 2: Критические исправления и оптимизация производительности"

# Отправить на GitHub
git push origin main
```

#### 1.2. Подготовка production конфигурации

Создать файл `.env.production` с настройками для сервера:

```env
# Database - PostgreSQL на сервере
DATABASE_URL=postgresql://planner_user:YOUR_PASSWORD@localhost/planner_db

# Environment
ENVIRONMENT=production

# Security - ОБЯЗАТЕЛЬНО сгенерировать новый ключ!
SECRET_KEY=<сгенерировать: openssl rand -hex 32>

# JWT
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# CORS - ваш домен
BACKEND_CORS_ORIGINS=https://calendar.corestone.ru,https://www.calendar.corestone.ru

# Project
PROJECT_NAME=Corporate Calendar API
API_V1_STR=/api/v1
```

---

### Шаг 2: Деплой на сервер (2-3 часа)

#### 2.1. Подключение к серверу

```bash
ssh root@155.212.190.153
```

#### 2.2. Следовать инструкциям из `DEPLOYMENT_UBUNTU24.md`

**Основные этапы:**

1. **Обновление системы:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Установка PostgreSQL:**
   ```bash
   sudo apt install -y postgresql postgresql-contrib
   ```

3. **Создание БД и пользователя:**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE planner_db;
   CREATE USER planner_user WITH PASSWORD 'YOUR_STRONG_PASSWORD';
   GRANT ALL PRIVILEGES ON DATABASE planner_db TO planner_user;
   \q
   ```

4. **Клонирование проекта:**
   ```bash
   cd /opt
   git clone <ваш_repo_url> planner
   cd planner/backend
   ```

5. **Настройка окружения:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

6. **Настройка .env:**
   ```bash
   cp env.example.txt .env
   nano .env
   # Вставить настройки из .env.production
   ```

7. **Применение миграций:**
   ```bash
   alembic upgrade head
   ```

8. **Создание systemd сервиса:**
   ```bash
   sudo nano /etc/systemd/system/planner-backend.service
   ```

   Содержимое файла:
   ```ini
   [Unit]
   Description=Corporate Calendar API Backend
   After=network.target postgresql.service

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/opt/planner/backend
   Environment="PATH=/opt/planner/backend/.venv/bin"
   ExecStart=/opt/planner/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

9. **Запуск сервиса:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable planner-backend
   sudo systemctl start planner-backend
   sudo systemctl status planner-backend
   ```

10. **Настройка Nginx:**
    ```bash
    sudo apt install -y nginx
    sudo nano /etc/nginx/sites-available/calendar.corestone.ru
    ```

    Конфигурация:
    ```nginx
    server {
        listen 80;
        server_name calendar.corestone.ru www.calendar.corestone.ru;

        location /api {
            proxy_pass http://127.0.0.1:8000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location / {
            root /opt/planner/frontend/.next;
            try_files $uri $uri/ /index.html;
        }
    }
    ```

11. **SSL сертификат:**
    ```bash
    sudo apt install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d calendar.corestone.ru -d www.calendar.corestone.ru
    ```

---

### Шаг 3: Проверка после деплоя (30 минут)

#### 3.1. Проверка health endpoints

```bash
curl https://calendar.corestone.ru/api/v1/health/
curl https://calendar.corestone.ru/api/v1/health/ready
```

#### 3.2. Проверка Swagger

Открыть в браузере: https://calendar.corestone.ru/docs

#### 3.3. Проверка логов

```bash
sudo journalctl -u planner-backend -f
```

#### 3.4. Тестирование основных endpoints

- Регистрация пользователя
- Вход в систему
- Создание календаря
- Создание события

---

### Шаг 4: Дополнительные настройки (опционально)

#### 4.1. Настройка резервного копирования

```bash
# Создать скрипт backup
sudo nano /opt/planner/backup.sh
```

#### 4.2. Настройка мониторинга

- Prometheus метрики
- Grafana дашборды
- Alerting

#### 4.3. Настройка логирования

- Централизованное логирование
- Ротация логов
- Анализ логов

---

## ⚠️ Важные замечания

### Безопасность

1. ✅ **SECRET_KEY** - обязательно изменить на production
2. ✅ **CORS** - указать конкретные домены
3. ✅ **PostgreSQL** - использовать сильные пароли
4. ✅ **Firewall** - настроить ufw или iptables
5. ✅ **SSL** - обязательно использовать HTTPS

### Производительность

1. ✅ **Connection pooling** - уже настроен (20+40)
2. ✅ **Индексы БД** - применены через миграции
3. ✅ **Кеширование** - настроено для пользователей
4. ⚠️ **Rate limiting** - временно отключен (можно включить через nginx)

### Мониторинг

1. ✅ **Health checks** - настроены
2. ⚠️ **Метрики** - можно добавить позже
3. ⚠️ **Алерты** - можно настроить позже

---

## 📝 Быстрая справка

### Перезапуск сервиса

```bash
sudo systemctl restart planner-backend
```

### Просмотр логов

```bash
sudo journalctl -u planner-backend -n 100
sudo journalctl -u planner-backend -f
```

### Проверка статуса

```bash
sudo systemctl status planner-backend
```

### Обновление кода

```bash
cd /opt/planner
git pull
cd backend
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
sudo systemctl restart planner-backend
```

---

## 🎯 Итоговый чеклист

- [ ] Все изменения закоммичены и отправлены на GitHub
- [ ] Подготовлен .env.production с правильными настройками
- [ ] Подключен к серверу
- [ ] Установлен PostgreSQL
- [ ] Создана БД и пользователь
- [ ] Проект склонирован на сервер
- [ ] Настроено виртуальное окружение
- [ ] Установлены зависимости
- [ ] Настроен .env файл
- [ ] Применены миграции
- [ ] Создан systemd сервис
- [ ] Сервис запущен и работает
- [ ] Настроен Nginx
- [ ] Установлен SSL сертификат
- [ ] Проверены health endpoints
- [ ] Протестированы основные функции
- [ ] Настроено резервное копирование (опционально)
- [ ] Настроен мониторинг (опционально)

---

## 📚 Дополнительные ресурсы

- `DEPLOYMENT_UBUNTU24.md` - Детальные инструкции по деплою
- `NEXT_STEPS.md` - Общий план действий
- `TESTING_PLAN.md` - План тестирования
- `CHANGELOG_PHASE1.md` - Изменения Фазы 1
- `CHANGELOG_PHASE2.md` - Изменения Фазы 2



