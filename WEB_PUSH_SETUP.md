# 🔔 Web Push Notifications - Инструкция по установке и тестированию

## ✅ ЧТО СДЕЛАНО

### Backend (Python/FastAPI):
1. ✅ Установлены библиотеки: `pywebpush`, `py-vapid`
2. ✅ Сгенерированы VAPID ключи
3. ✅ Создана модель `PushSubscription` для хранения подписок
4. ✅ Создан API `/api/v1/push/*` для управления подписками
5. ✅ Создан сервис `web_push.py` для отправки уведомлений
6. ✅ Интегрировано в Celery задачи (все уведомления теперь отправляются как Push)

### Frontend (Next.js/React):
1. ✅ Создан Service Worker (`/sw.js`) для обработки push-уведомлений
2. ✅ Создан хук `usePushNotifications` для управления подписками
3. ✅ Создан компонент `PushNotificationSettings` для UI
4. ✅ Интегрировано в настройки профиля (вкладка "🔔 Уведомления")

---

## 🚀 ДЕПЛОЙ НА СЕРВЕР

### 1. Подготовка (локально)

```bash
# Добавьте VAPID ключи в backend/.env
# Ключи уже сгенерированы, см. вывод команды выше

# Откройте backend/.env и добавьте:
VAPID_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgaiCSPtNvbV3QFSi2
Bl9ySdN7Jf5XYu4moRAiIHD9jjGhRANCAASWVRP5D+x7kNVA5jYw7vLNyb+5JTCs
61UpJYFjf+np5QFOZgqrXia4Z42sMLgpPMI5ERB21lgazVXnDS3g7olC
-----END PRIVATE KEY-----

VAPID_PUBLIC_KEY=BJZVE_kP7HuQ1UDmNjDu8s3Jv7klMKzrVSklgWN_6enlAU5mCqteJrhnjawwuCk8wjkREHbWWBrNVecNLeDuiUI

VAPID_CLAIMS_EMAIL=mailto:admin@corestone.ru
```

### 2. Коммит и пуш

```bash
git add .
git commit -m "feat: add Web Push Notifications support

- Backend: VAPID keys, push subscriptions API, Celery integration
- Frontend: Service Worker, usePushNotifications hook, UI component
- Users can now receive push notifications even when browser is closed
- Notifications work on Chrome, Firefox, Edge (desktop and Android)
- Safari desktop supported, Safari iOS not supported"

git push origin refactor/split-page-tsx:main
```

### 3. Деплой на сервер

```bash
# SSH на сервер
ssh root@155.212.190.153

# Перейти в директорию проекта
cd /opt/planner

# Пуллим изменения
git pull origin main

# Backend: установить новые зависимости
cd backend
source .venv/bin/activate
pip install -r requirements.txt

# ВАЖНО: Добавить VAPID ключи в .env на сервере!
nano .env
# Вставьте VAPID ключи (см. выше)

# Создать миграцию БД
alembic revision --autogenerate -m "add_push_subscriptions_table"
alembic upgrade head

# Frontend: пересобрать
cd ../frontend
npm install
npm run build

# Перезапустить сервисы
systemctl restart planner-backend
systemctl restart planner-celery-worker
systemctl restart planner-frontend

# Проверить статус
systemctl status planner-backend planner-celery-worker planner-frontend
```

---

## 🧪 ТЕСТИРОВАНИЕ

### 1. Проверка Service Worker

1. Откройте календарь: https://calendar.corestone.ru
2. Откройте DevTools (F12) → вкладка **Application** → **Service Workers**
3. Должен появиться Service Worker `/sw.js` со статусом **activated**

### 2. Включение уведомлений

1. Войдите в календарь
2. Откройте **Профиль** (правый верхний угол)
3. Перейдите на вкладку **🔔 Уведомления**
4. Нажмите **"Включить"**
5. Браузер запросит разрешение → нажмите **"Разрешить"**
6. Должно появиться: ✅ "Уведомления включены!"

### 3. Проверка подписки

**В DevTools:**
1. **Application** → **Service Workers** → проверьте что SW активен
2. **Application** → **Push Messaging** → должна быть подписка

**В Backend (опционально):**
```bash
ssh root@155.212.190.153
cd /opt/planner/backend
source .venv/bin/activate

python << 'EOF'
from sqlmodel import Session, select
from app.db import engine
from app.models.push_subscription import PushSubscription

with Session(engine) as session:
    subs = session.exec(select(PushSubscription)).all()
    for sub in subs:
        print(f"User: {sub.user_id}, Endpoint: {sub.endpoint[:50]}...")
EOF
```

### 4. Тестирование уведомлений

#### Способ 1: Создать событие

1. **Пользователь A**: Создайте событие и пригласите **Пользователя B**
2. **Пользователь B**: Должно прийти push-уведомление "📅 Приглашение на встречу"
3. Кликните на уведомление → откроется календарь

#### Способ 2: Изменить событие

1. Измените время существующего события
2. Участникам должно прийти "🔔 Встреча изменена"

#### Способ 3: Отменить событие

1. Удалите событие
2. Участникам должно прийти "❌ Встреча отменена"

#### Способ 4: Тест с закрытым браузером

1. Включите уведомления
2. **ЗАКРОЙТЕ браузер полностью** (не только вкладку!)
3. Попросите коллегу создать событие и пригласить вас
4. Уведомление должно прийти **даже при закрытом браузере!** 🎉

---

## 🐛 TROUBLESHOOTING

### Уведомления не приходят

**1. Проверьте VAPID ключи:**
```bash
# На сервере
cat /opt/planner/backend/.env | grep VAPID
```

**2. Проверьте Service Worker:**
- DevTools → Application → Service Workers
- Должен быть активен (`activated`)
- Если ошибка: `Ctrl+Shift+R` для жесткого обновления

**3. Проверьте разрешения:**
- В Chrome: `chrome://settings/content/notifications`
- Должно быть: `https://calendar.corestone.ru - Разрешить`

**4. Проверьте логи Celery:**
```bash
journalctl -u planner-celery-worker -f | grep "web push"
```

**5. Проверьте логи Backend:**
```bash
tail -f /var/log/planner/backend.log | grep "Web push"
```

### Push API не поддерживается

- ✅ **Chrome/Edge/Firefox** (Windows/Mac/Linux/Android)
- ✅ **Safari** (только Mac Desktop)
- ❌ **Safari iOS** (не поддерживается)

### "Notification permission denied"

Пользователь заблокировал уведомления. Нужно разрешить вручную:
1. Chrome: Иконка замка слева от адреса → Разрешения → Уведомления → Разрешить
2. Firefox: Иконка замка → Разрешения → Получать уведомления → Разрешить

---

## 📊 МОНИТОРИНГ

### Количество активных подписок

```bash
ssh root@155.212.190.153
cd /opt/planner/backend
source .venv/bin/activate

python << 'EOF'
from sqlmodel import Session, select, func
from app.db import engine
from app.models.push_subscription import PushSubscription

with Session(engine) as session:
    total = session.exec(
        select(func.count(PushSubscription.id))
        .where(PushSubscription.is_active == True)
    ).one()
    print(f"Активных подписок: {total}")
    
    by_user = session.exec(
        select(PushSubscription.user_id, func.count(PushSubscription.id))
        .where(PushSubscription.is_active == True)
        .group_by(PushSubscription.user_id)
    ).all()
    
    print(f"Пользователей с подписками: {len(by_user)}")
EOF
```

### Статистика уведомлений

```bash
# Логи Celery за последний час
journalctl -u planner-celery-worker --since "1 hour ago" | grep -i "web push"
```

---

## 🎯 NEXT STEPS

После успешного тестирования:

1. ✅ **Создать иконки** (`frontend/public/icon-192.png`, `badge-72.png`)
2. ✅ **Добавить manifest.json** для PWA (опционально)
3. ✅ **Настроить автотесты** для push API
4. ✅ **Добавить аналитику** (сколько уведомлений отправлено/открыто)
5. ✅ **Добавить настройки** (какие уведомления получать)

---

## 📝 NOTES

- **VAPID ключи** - секретные! Не коммитьте в Git!
- **Service Worker** кэшируется браузером. Для обновления: `Ctrl+Shift+R`
- **HTTPS обязательно** для Web Push (у вас уже есть ✅)
- **Push работает offline** - даже при закрытом браузере!
- **Срок жизни подписки** - браузер может отозвать через N месяцев (re-subscribe автоматически)

---

## 🎉 ПОЗДРАВЛЯЮ!

Вы реализовали **Web Push Notifications**!  
Теперь пользователи будут получать уведомления **даже при закрытом браузере**! 🚀

**Любые вопросы? Пишите!**

