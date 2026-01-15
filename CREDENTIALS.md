# 🔐 Учетные данные и пароли проекта Planner

⚠️ **ВАЖНО: Этот файл содержит конфиденциальную информацию!**
- НЕ коммитьте этот файл в Git
- Храните в безопасном месте (менеджер паролей)
- Регулярно меняйте пароли
- Используйте двухфакторную аутентификацию где возможно

---

## 🖥️ Сервер

### SSH доступ

```
Хост: 155.212.190.153
Порт: 22
Домен: calendar.corestone.ru
Пользователь: root
Пароль: [УСТАНОВЛЕН ПРИ СОЗДАНИИ СЕРВЕРА]
```

**Важно:** Настройте SSH ключи вместо пароля для большей безопасности!

---

## 🗄️ База данных PostgreSQL

### Подключение

```
Хост: localhost
Порт: 5432
База данных: planner_db
Пользователь: planner_user
Пароль: YtragtR65A
```

### Строка подключения

```
postgresql://planner_user:YtragtR65A@localhost:5432/planner_db
```

### Команды для работы

```bash
# Подключение через psql
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -h localhost

# Бэкап базы данных
pg_dump -U planner_user planner_db > backup_$(date +%Y%m%d).sql

# Восстановление из бэкапа
psql -U planner_user planner_db < backup_YYYYMMDD.sql
```

---

## 🔴 Redis

### Подключение

```
Хост: localhost
Порт: 6379
Пароль: НЕТ (защищен через bind 127.0.0.1)
```

### Строки подключения

```
# Общий кэш
redis://localhost:6379/0

# Celery broker
redis://localhost:6379/1

# Celery result backend
redis://localhost:6379/2
```

### Команды

```bash
# Проверка подключения
redis-cli ping

# Мониторинг
redis-cli info
redis-cli --stat
```

---

## 🔑 Backend (.env файл)

Файл: `/opt/planner/backend/.env`

```env
# Database
DATABASE_URL=postgresql://planner_user:YtragtR65A@localhost:5432/planner_db

# Redis
REDIS_URL=redis://localhost:6379/0

# Celery
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# Security
SECRET_KEY=5J9MtncMfISUEwrS9TJ5WU5Wz-m5thuxmOKEhbQZq5_hkDpd7gGUlLwwAu-RfhDJWQjSZ09A7pdlu279wF9Y1w
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Environment
ENVIRONMENT=production

# CORS
BACKEND_CORS_ORIGINS=https://calendar.corestone.ru,http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001
```

### Генерация нового SECRET_KEY

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

⚠️ **ВАЖНО:** При смене SECRET_KEY все существующие JWT токены станут невалидными!

---

## 🎨 Frontend (.env.local файл)

Файл: `/opt/planner/frontend/.env.local`

```env
NEXT_PUBLIC_API_BASE_URL=https://calendar.corestone.ru/api/v1
```

---

## 👤 Администратор приложения

### Учетная запись админа

```
Email: admin@corestone.ru
Пароль: Admin2026!
Роль: admin
ID: 637b5c4f-9e9d-4b22-89c5-4151dbe09cc7
```

**⚠️ ОБЯЗАТЕЛЬНО смените пароль после первого входа!**

### Смена пароля админа

```bash
cd /opt/planner/backend
source .venv/bin/activate

python << 'EOF'
from sqlmodel import Session, select
from app.models.user import User
from app.core.security import get_password_hash
from app.db import engine

with Session(engine) as session:
    statement = select(User).where(User.email == "admin@corestone.ru")
    admin = session.exec(statement).first()
    
    if admin:
        new_password = "НовыйСуперПароль123!"
        admin.hashed_password = get_password_hash(new_password)
        session.add(admin)
        session.commit()
        print(f"✅ Пароль изменен для {admin.email}")
    else:
        print("❌ Админ не найден")
EOF
```

---

## 🔒 SSL/TLS Сертификаты

### Let's Encrypt

```
Email для уведомлений: admin@corestone.ru
Домен: calendar.corestone.ru
Сертификаты: /etc/letsencrypt/live/calendar.corestone.ru/
```

### Обновление сертификатов

```bash
# Тест обновления
certbot renew --dry-run

# Принудительное обновление
certbot renew --force-renewal

# Автоматическое обновление (уже настроено)
systemctl status certbot.timer
```

---

## 🌐 DNS настройки

### A-записи

```
Тип: A
Имя: calendar.corestone.ru
Значение: 155.212.190.153
TTL: 3600
```

Если нужен www:
```
Тип: A
Имя: www.calendar.corestone.ru
Значение: 155.212.190.153
TTL: 3600
```

---

## 🔧 Системные пользователи

### www-data (для запуска сервисов)

```
Пользователь: www-data
Группа: www-data
Домашняя директория: /var/www
Shell: /usr/sbin/nologin
```

Все сервисы приложения (backend, frontend, celery) запускаются от имени `www-data` для безопасности.

---

## 📁 Важные пути и файлы

### Конфигурационные файлы

```bash
# Systemd сервисы
/etc/systemd/system/planner-backend.service
/etc/systemd/system/planner-celery-worker.service
/etc/systemd/system/planner-celery-beat.service
/etc/systemd/system/planner-frontend.service

# Nginx
/etc/nginx/sites-available/planner
/etc/nginx/sites-enabled/planner

# Redis
/etc/redis/redis.conf
/etc/systemd/system/redis-server.service.d/override.conf

# PostgreSQL
/etc/postgresql/16/main/postgresql.conf
/etc/postgresql/16/main/pg_hba.conf

# Логи
/var/log/planner/
/var/log/nginx/
```

### Данные приложения

```bash
# Проект
/opt/planner/

# Загруженные файлы
/opt/planner/backend/uploads/

# База данных PostgreSQL
/var/lib/postgresql/16/main/

# Redis данные
/var/lib/redis/
```

---

## 🔐 GitHub

### Repository

```
URL: https://github.com/skandini/planner.git
Ветка: refactor/split-page-tsx
```

### Клонирование

```bash
# С HTTPS
git clone https://github.com/skandini/planner.git

# С SSH (нужен SSH ключ)
git clone git@github.com:skandini/planner.git
```

### Настройка Git на сервере

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@corestone.ru"
```

---

## 📋 Чек-лист смены паролей

При компрометации или плановой смене паролей:

- [ ] PostgreSQL пароль (planner_user)
  - Изменить в PostgreSQL: `ALTER USER planner_user PASSWORD 'новый_пароль';`
  - Обновить в `/opt/planner/backend/.env`
  - Перезапустить backend и celery

- [ ] Backend SECRET_KEY
  - Сгенерировать новый ключ
  - Обновить в `/opt/planner/backend/.env`
  - Перезапустить backend
  - ⚠️ Все пользователи будут разлогинены!

- [ ] Администратор приложения
  - Использовать скрипт смены пароля (см. выше)
  - Или через интерфейс приложения

- [ ] SSH доступ к серверу
  - Изменить пароль root: `passwd`
  - Или настроить SSH ключи (рекомендуется)

- [ ] SSL Email (admin@corestone.ru)
  - Обновить в настройках Let's Encrypt при необходимости

---

## 🆘 Восстановление доступа

### Если забыли пароль админа

```bash
cd /opt/planner/backend
source .venv/bin/activate
python create_admin.py  # Создаст нового админа если старый есть
# Или используйте скрипт смены пароля выше
```

### Если потеряли SSH доступ

1. Используйте консоль хостинга (VNC/Serial console)
2. Войдите как root
3. Сбросьте пароль: `passwd root`
4. Или добавьте SSH ключ в `~/.ssh/authorized_keys`

### Если база данных недоступна

```bash
# Проверить статус
systemctl status postgresql

# Перезапустить
systemctl restart postgresql

# Проверить логи
journalctl -u postgresql -n 100

# Восстановить из бэкапа
psql -U planner_user planner_db < /root/backup_YYYYMMDD.sql
```

---

## 🔄 Регулярное обслуживание

### Еженедельно

- [ ] Проверить логи на ошибки
- [ ] Проверить место на диске
- [ ] Проверить статус всех сервисов

### Ежемесячно

- [ ] Создать бэкап базы данных
- [ ] Проверить SSL сертификат
- [ ] Обновить системные пакеты
- [ ] Проверить безопасность (fail2ban логи)

### Ежеквартально

- [ ] Сменить пароли
- [ ] Провести аудит безопасности
- [ ] Проверить актуальность документации

---

**Последнее обновление:** 14 января 2026  
**Ответственный:** [Ваше имя]

⚠️ **НЕ КОММИТЬТЕ ЭТОТ ФАЙЛ В GIT!**


