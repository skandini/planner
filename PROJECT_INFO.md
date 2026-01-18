# Planner для Corestone - Информация о проекте

## 📋 Общая информация

**Название проекта:** Corporate Calendar Application (Planner)  
**Организация:** Corestone  
**Домен:** https://calendar.corestone.ru  
**IP сервера:** 155.212.190.153  
**Операционная система:** Ubuntu 24.04 LTS  
**Дата развертывания:** 14 января 2026  

## 🏗️ Архитектура

### Stack технологий

**Backend:**
- FastAPI (Python 3.12)
- PostgreSQL 16
- Redis (кэш и очереди)
- Celery (фоновые задачи)
- SQLModel (ORM)
- Pydantic (валидация)
- Uvicorn (ASGI сервер)

**Frontend:**
- Next.js 16.0.3 (React)
- TypeScript
- Tailwind CSS
- Turbopack (билдер)

**Infrastructure:**
- Nginx (reverse proxy)
- Systemd (управление сервисами)
- Let's Encrypt (SSL сертификаты)
- UFW Firewall
- Fail2ban (защита от брутфорса)

### Структура проекта

```
/opt/planner/
├── backend/                 # FastAPI приложение
│   ├── .venv/              # Виртуальное окружение Python
│   ├── app/                # Код приложения
│   │   ├── api/           # API endpoints
│   │   │   ├── v1/       # API версии 1
│   │   │   └── router.py
│   │   ├── core/         # Конфигурация, безопасность
│   │   ├── models/       # Модели базы данных
│   │   ├── schemas/      # Pydantic схемы
│   │   ├── services/     # Бизнес-логика
│   │   ├── tasks/        # Celery задачи
│   │   ├── db.py         # Подключение к БД
│   │   └── main.py       # Точка входа
│   ├── uploads/          # Загруженные файлы
│   ├── .env              # Переменные окружения (НЕ в Git!)
│   └── requirements.txt  # Python зависимости
│
├── frontend/               # Next.js приложение
│   ├── src/
│   │   ├── app/          # App Router страницы
│   │   ├── components/   # React компоненты
│   │   ├── context/      # React Context
│   │   ├── lib/          # Утилиты
│   │   └── utils/        # Вспомогательные функции
│   ├── public/           # Статические файлы
│   ├── .next/            # Собранное приложение (не в Git)
│   ├── .env.local        # Переменные окружения (НЕ в Git!)
│   └── package.json      # Node.js зависимости
│
└── .gitignore            # Исключения Git
```

## 🔧 Конфигурация сервисов

### Systemd Services

Все сервисы управляются через systemd:

```bash
# Backend API
/etc/systemd/system/planner-backend.service
# Порт: 8000, Workers: 4

# Celery Worker
/etc/systemd/system/planner-celery-worker.service
# Concurrency: 4

# Celery Beat (планировщик)
/etc/systemd/system/planner-celery-beat.service

# Frontend
/etc/systemd/system/planner-frontend.service
# Порт: 3000
```

### Nginx Configuration

```bash
# Конфигурация
/etc/nginx/sites-available/planner
/etc/nginx/sites-enabled/planner -> /etc/nginx/sites-available/planner

# Rate Limiting:
- API: 10 req/s (burst 20)
- Login: 5 req/minute (burst 3)
- General: 30 req/s (burst 50)
```

### SSL/TLS

```bash
# Сертификаты Let's Encrypt
/etc/letsencrypt/live/calendar.corestone.ru/
├── fullchain.pem    # Полная цепочка сертификатов
├── privkey.pem      # Приватный ключ
├── cert.pem         # Сертификат
└── chain.pem        # Промежуточные сертификаты

# Автообновление
systemctl status certbot.timer
```

## 📊 Базы данных

### PostgreSQL

```
Версия: PostgreSQL 16
База данных: planner_db
Пользователь: planner_user
Хост: localhost:5432
Max connections: 200
```

**Таблицы:**
- users (пользователи)
- organizations (организации)
- departments (отделы)
- calendars (календари)
- events (события)
- event_participants (участники событий)
- rooms (комнаты/переговорные)
- tickets (тикеты)
- notifications (уведомления)
- и другие...

### Redis

```
Версия: Redis 7.0.15
Порт: 6379
Хост: localhost
Max memory: 512MB
Policy: allkeys-lru
```

**Использование:**
- DB 0: Общий кэш
- DB 1: Celery broker
- DB 2: Celery результаты

## 🔒 Безопасность

### Firewall (UFW)

```bash
# Открытые порты
22/tcp   - SSH
80/tcp   - HTTP (редирект на HTTPS)
443/tcp  - HTTPS

# Все остальное закрыто
```

### Fail2ban

Защита от брутфорса:
- SSH (5 попыток за 10 минут = бан на 1 час)
- Nginx rate limiting

### Security Headers

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

## 📈 Производительность

### Текущая конфигурация (для 150 пользователей)

**Backend:**
- 4 Uvicorn workers
- CPUQuota: 200%
- MemoryMax: 2GB

**Celery:**
- 4 concurrent workers
- MemoryMax: 1.5GB

**Frontend:**
- 1 процесс npm start
- MemoryMax: 1GB

**Рекомендуемые ресурсы сервера:**
- CPU: 4 ядра
- RAM: 8GB минимум
- Disk: 50GB SSD

## 🔄 Git Repository

```
URL: https://github.com/skandini/planner.git
Основная ветка: refactor/split-page-tsx
```

**Важно:** 
- `.env` файлы НЕ коммитятся
- Используйте `.env.example` для документации
- Секреты хранятся только на сервере

## 📞 Управление сервисами

### Основные команды

```bash
# Статус всех сервисов
systemctl status planner-backend planner-celery-worker planner-frontend redis-server postgresql nginx

# Перезапуск
systemctl restart planner-backend
systemctl restart planner-celery-worker
systemctl restart planner-frontend

# Логи
journalctl -u planner-backend -f
tail -f /var/log/planner/backend.log
tail -f /var/log/planner/celery-worker.log

# Проверка здоровья
/usr/local/bin/planner-status.sh
```

### Обновление из Git

```bash
# Автоматический скрипт
/usr/local/bin/update-planner.sh

# Или вручную
cd /opt/planner
git pull origin refactor/split-page-tsx
cd backend && source .venv/bin/activate && pip install -r requirements.txt
cd ../frontend && npm install && npm run build
systemctl restart planner-backend planner-celery-worker planner-frontend
```

## 📝 Логирование

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

# Nginx logs
/var/log/nginx/
├── planner-access.log
└── planner-error.log

# System logs
journalctl -u planner-backend
journalctl -u planner-celery-worker
journalctl -u planner-frontend
```

### Ротация логов

Настроена через logrotate:
```bash
/etc/logrotate.d/planner
# Ротация: ежедневно
# Хранение: 14 дней
# Сжатие: да
```

## 🎯 Мониторинг

### Скрипты мониторинга

```bash
# Общий статус системы
/usr/local/bin/planner-status.sh

# Проверка здоровья
/usr/local/bin/check-planner-health.sh
```

### Метрики для мониторинга

- Статус сервисов (systemctl)
- Доступность API endpoints
- Время отклика
- Использование диска/памяти
- Статус SSL сертификата
- Количество ошибок в логах

## 📚 Дополнительная документация

- `CREDENTIALS.md` - Пароли и ключи доступа
- `BACKEND_STRUCTURE.md` - Подробная структура backend
- `DEPLOYMENT_GUIDE.md` - Полная инструкция по развертыванию
- `MAINTENANCE.md` - Руководство по обслуживанию
- `TROUBLESHOOTING.md` - Решение типичных проблем

## 🔗 Полезные ссылки

- **Сайт:** https://calendar.corestone.ru
- **API Docs:** https://calendar.corestone.ru/docs
- **API Health:** https://calendar.corestone.ru/api/v1/health
- **GitHub:** https://github.com/skandini/planner

---

**Последнее обновление:** 14 января 2026  
**Версия документа:** 1.0




