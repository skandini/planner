# 🚀 Деплой функционала "Игнорирование занятости"

## 📋 Что было реализовано

✅ **Frontend:**
- Добавлен чекбокс в админ-панель для управления правом `can_override_availability`
- Обновлены TypeScript типы (`UserProfile`)
- Чекбокс отображается с предупреждением (⚠️ янтарным цветом)

✅ **Backend:**
- Поле `can_override_availability` уже существует в модели `User`
- Логика проверки уже работает в `api/v1/events.py`
- Миграция БД уже применена

✅ **SQL скрипты:**
- `backend/setup_override_permissions.sql` - назначение прав
- `backend/check_override_permissions.sql` - проверка текущего состояния

---

## 🔄 Инструкция по деплою

### 1️⃣ **Локально (разработка завершена)**

```powershell
# Коммит изменений
git add frontend/src/types/user.types.ts
git add frontend/src/components/admin/AdminPanel.tsx
git add backend/setup_override_permissions.sql
git add backend/check_override_permissions.sql
git add DEPLOY_OVERRIDE_PERMISSIONS.md

git commit -m "feat: добавлен UI для управления правами can_override_availability"

# Пуш в основную ветку
git push origin refactor/split-page-tsx
git push origin refactor/split-page-tsx:main
```

---

### 2️⃣ **На сервере - Обновление кода**

```bash
ssh root@calendar.corestone.ru

# Переходим в директорию проекта
cd /opt/planner

# Стягиваем изменения
git pull origin main

# Пересобираем Frontend
cd frontend
npm run build

# Перезапускаем сервисы
systemctl restart planner-frontend
systemctl restart planner-backend

# Проверяем что все работает
sleep 3
systemctl status planner-frontend planner-backend

# Проверяем API
curl http://localhost:8000/api/v1/health
```

---

### 3️⃣ **На сервере - Назначение прав**

#### Вариант А: Автоматический (рекомендуется)

```bash
cd /opt/planner/backend

# Сначала ПРОВЕРКА текущего состояния
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -f check_override_permissions.sql

# Если всё ОК, применяем права
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -f setup_override_permissions.sql
```

#### Вариант Б: Вручную через psql

```bash
# Подключаемся к БД
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db
```

```sql
-- 1. Смотрим текущее состояние
SELECT email, full_name, role, can_override_availability 
FROM users 
ORDER BY role, email;

-- 2. Даем права админам и IT
UPDATE users 
SET can_override_availability = TRUE 
WHERE role IN ('admin', 'it');

-- 3. Даем права конкретным топ-менеджерам
-- ВАЖНО: Замените email на реальные!
UPDATE users 
SET can_override_availability = TRUE 
WHERE email IN (
    'ceo@corestone.ru',
    'director@corestone.ru'
);

-- 4. Убираем права у обычных сотрудников (для безопасности)
UPDATE users 
SET can_override_availability = FALSE 
WHERE role = 'employee';

-- 5. Проверяем результат
SELECT email, full_name, role, can_override_availability 
FROM users 
WHERE can_override_availability = TRUE;

-- Выход
\q
```

---

### 4️⃣ **Проверка функционала**

#### В браузере:

1. Открыть: https://calendar.corestone.ru
2. Войти как **admin**
3. Открыть **Админ-панель**
4. Перейти на вкладку **"Пользователи"**
5. Проверить что есть чекбокс **"⚠️ Игнор. занятости"**
6. Попробовать включить/выключить для тестового пользователя
7. Сохранить и обновить страницу - проверить что изменения применились

#### На сервере:

```bash
# Проверка через SQL
cd /opt/planner/backend
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -f check_override_permissions.sql

# Проверка логов
tail -50 /var/log/planner/backend.log
tail -50 /var/log/planner/frontend.log

# Должно быть 0 ошибок
grep ERROR /var/log/planner/backend-error.log | tail -20
```

---

## 🔍 Проверка работы логики

### Тест 1: Пользователь БЕЗ прав override

1. Создать событие как обычный сотрудник
2. Добавить участника, который занят в это время
3. **Ожидается:** Ошибка 409 "Участник недоступен"

### Тест 2: Пользователь С правами override

1. Создать событие как admin или пользователь с `can_override_availability = TRUE`
2. Добавить участника, который занят в это время
3. **Ожидается:** Событие создано успешно, проверка занятости пропущена

### Тест 3: Групповые участники

1. Создать событие с групповым участником (отдел/организация)
2. **Ожидается:** Проверка занятости НЕ выполняется (независимо от прав)

---

## 📊 SQL запросы для мониторинга

```sql
-- Кто имеет права override
SELECT email, full_name, role 
FROM users 
WHERE can_override_availability = TRUE;

-- Статистика по ролям
SELECT 
    role, 
    COUNT(*) as total,
    SUM(CASE WHEN can_override_availability THEN 1 ELSE 0 END) as with_override
FROM users 
GROUP BY role;

-- Недавние события и их создатели
SELECT 
    e.title,
    e.starts_at,
    u.email as creator,
    u.can_override_availability as has_override_right
FROM events e
LEFT JOIN users u ON e.created_by = u.id
ORDER BY e.created_at DESC
LIMIT 20;
```

---

## ⏮️ Откат изменений (если что-то пошло не так)

```bash
# На сервере
cd /opt/planner

# Откат кода к предыдущему коммиту
git log --oneline -5  # смотрим историю
git reset --hard <PREVIOUS_COMMIT_HASH>

# Пересборка
cd frontend && npm run build
systemctl restart planner-frontend planner-backend

# Откат прав в БД (если нужно)
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db << 'EOF'
UPDATE users SET can_override_availability = FALSE;
EOF
```

---

## 📝 Чеклист деплоя

- [ ] Локально: коммит и пуш в `main`
- [ ] Сервер: `git pull origin main`
- [ ] Сервер: `npm run build` в frontend
- [ ] Сервер: `systemctl restart planner-frontend planner-backend`
- [ ] Сервер: проверка статуса сервисов
- [ ] Сервер: назначение прав через SQL скрипт
- [ ] Браузер: проверка UI админ-панели
- [ ] Браузер: тест создания события с override
- [ ] Сервер: проверка логов на ошибки
- [ ] Документация: обновить changelog

---

## 🔗 Связанные файлы

**Frontend:**
- `frontend/src/types/user.types.ts`
- `frontend/src/components/admin/AdminPanel.tsx`

**Backend:**
- `backend/app/models/user.py` (модель)
- `backend/app/api/v1/events.py` (логика)
- `backend/setup_override_permissions.sql` (SQL скрипт)
- `backend/check_override_permissions.sql` (SQL проверка)

**Документация:**
- `FEATURE_GROUP_PARTICIPANTS.md`
- `DEPLOY_OVERRIDE_PERMISSIONS.md` (этот файл)

---

**Дата создания:** 16 января 2026  
**Версия:** 1.0  
**Автор:** AI Assistant + User

