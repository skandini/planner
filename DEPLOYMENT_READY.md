# ✅ Проект готов к деплою на Ubuntu с PostgreSQL

## 📊 Результаты проверки

### ✅ Все критические компоненты реализованы:

1. **Connection Pooling** - настроен для PostgreSQL
2. **CORS** - безопасная конфигурация
3. **Пагинация** - реализована во всех списках
4. **Обработка ошибок** - скрытие деталей в production
5. **Health Checks** - liveness и readiness endpoints
6. **Database Indexes** - оптимизация запросов
7. **Кеширование** - in-memory cache для пользователей
8. **Graceful Shutdown** - корректное завершение работы
9. **Асинхронные уведомления** - через BackgroundTasks
10. **Rate Limiting** - защита от DDoS
11. **Security Headers** - базовые заголовки безопасности
12. **Backup скрипты** - автоматическое резервное копирование

---

## 📚 Документация

### Основные документы:

1. **`DEPLOYMENT_UBUNTU_POSTGRESQL.md`** ⭐
   - Подробная пошаговая инструкция
   - Настройка Ubuntu сервера
   - Настройка PostgreSQL
   - Настройка Nginx и SSL
   - Настройка systemd сервисов
   - Автоматический backup

2. **`backend/test_deployment_readiness.py`**
   - Скрипт проверки готовности
   - Запуск: `python backend/test_deployment_readiness.py`

3. **`DEPLOYMENT_CHECKLIST.md`**
   - Краткий чеклист деплоя

4. **`backend/scripts/README_BACKUP.md`**
   - Документация по backup скриптам

---

## 🚀 Быстрый старт деплоя

### 1. Подготовка сервера (30 минут)

```bash
# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить зависимости
sudo apt install -y python3.12 python3.12-venv python3.12-dev postgresql postgresql-contrib nginx certbot git
```

### 2. Настройка PostgreSQL (15 минут)

```bash
# Создать БД и пользователя
sudo -u postgres psql
CREATE DATABASE planner_db;
CREATE USER planner_user WITH PASSWORD 'YOUR_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE planner_db TO planner_user;
\q
```

### 3. Клонирование проекта (10 минут)

```bash
# Клонировать проект
cd /opt
sudo mkdir planner && sudo chown $USER:$USER planner
cd planner
git clone YOUR_REPO_URL .

# Настроить backend
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4. Настройка .env (5 минут)

```bash
# Создать .env
nano backend/.env
```

**Минимальная конфигурация:**
```env
DATABASE_URL=postgresql://planner_user:YOUR_PASSWORD@localhost:5432/planner_db
ENVIRONMENT=production
SECRET_KEY=$(openssl rand -hex 32)
BACKEND_CORS_ORIGINS=https://calendar.corestone.ru,https://www.calendar.corestone.ru
```

### 5. Применение миграций (5 минут)

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

### 6. Настройка systemd (10 минут)

```bash
# Создать service файл
sudo nano /etc/systemd/system/planner-backend.service
# (см. DEPLOYMENT_UBUNTU_POSTGRESQL.md для содержимого)

# Запустить
sudo systemctl daemon-reload
sudo systemctl enable planner-backend
sudo systemctl start planner-backend
```

### 7. Настройка Nginx (15 минут)

```bash
# Создать конфигурацию
sudo nano /etc/nginx/sites-available/planner
# (см. DEPLOYMENT_UBUNTU_POSTGRESQL.md для содержимого)

# Активировать
sudo ln -s /etc/nginx/sites-available/planner /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 8. SSL сертификат (5 минут)

```bash
sudo certbot --nginx -d calendar.corestone.ru -d www.calendar.corestone.ru
```

### 9. Автоматический backup (5 минут)

```bash
cd backend
chmod +x scripts/setup_backup.sh
./scripts/setup_backup.sh
```

---

## ✅ Проверка после деплоя

```bash
# 1. Проверить сервисы
sudo systemctl status planner-backend
sudo systemctl status postgresql
sudo systemctl status nginx

# 2. Проверить endpoints
curl https://calendar.corestone.ru/api/v1/health
curl https://calendar.corestone.ru/api/v1/health/ready

# 3. Проверить rate limiting
curl -X POST https://calendar.corestone.ru/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test","full_name":"Test"}'
# Повторить 6 раз - должен вернуть 429

# 4. Проверить логи
sudo journalctl -u planner-backend -f
```

---

## 📋 Чеклист деплоя

- [ ] Сервер обновлен
- [ ] Python 3.12 установлен
- [ ] PostgreSQL установлен и настроен
- [ ] База данных создана
- [ ] Проект клонирован
- [ ] Зависимости установлены
- [ ] .env настроен
- [ ] SECRET_KEY сгенерирован
- [ ] Миграции применены
- [ ] systemd service создан и запущен
- [ ] Nginx настроен
- [ ] SSL сертификат получен
- [ ] Автоматический backup настроен
- [ ] Health endpoints отвечают
- [ ] Rate limiting работает

---

## 🆘 Troubleshooting

### Backend не запускается

```bash
# Проверить логи
sudo journalctl -u planner-backend -n 100

# Проверить .env
cat backend/.env

# Проверить подключение к БД
psql -U planner_user -d planner_db -h localhost -c "SELECT 1;"
```

### 502 Bad Gateway

```bash
# Проверить статус backend
sudo systemctl status planner-backend

# Проверить порт
sudo netstat -tlnp | grep 8000

# Проверить логи Nginx
sudo tail -f /var/log/nginx/planner_error.log
```

### Ошибки миграций

```bash
cd backend
source .venv/bin/activate
alembic current
alembic history
```

---

## 📖 Подробная инструкция

**См. `DEPLOYMENT_UBUNTU_POSTGRESQL.md`** для полной пошаговой инструкции со всеми деталями.

---

## 🎉 Готово!

После выполнения всех шагов проект будет развернут и готов к работе!

**Время деплоя:** ~2-3 часа (включая настройку всех компонентов)



