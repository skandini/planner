# 🔧 Решение проблемы с can_override_availability

## 📋 Проблема
После деплоя функционала "Игнорирование занятости участников" чекбокс в админ-панели не работал.

## 🔍 Причины
1. ❌ Колонка `can_override_availability` отсутствовала в PostgreSQL
2. ❌ Поле отсутствовало в Pydantic схемах (`UserBase`, `UserUpdate`)
3. ❌ Поле отсутствовало в SQLModel модели `User`
4. ❌ Backend API не обрабатывал это поле в эндпоинтах

## ✅ Решение (шаги выполнены)

### 1️⃣ Добавление колонки в PostgreSQL
```sql
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS can_override_availability BOOLEAN DEFAULT FALSE NOT NULL;
```

### 2️⃣ Обновление API (backend/app/api/v1/users.py)
Добавлена обработка поля в:
- `PUT /{user_id}` - обновление пользователя
- `POST /admin-create` - создание пользователя

### 3️⃣ Обновление Pydantic схем (backend/app/schemas/user.py)
```python
class UserBase(BaseModel):
    # ... другие поля ...
    access_availability_slots: bool = False
    can_override_availability: bool = False  # ← добавлено

class UserUpdate(BaseModel):
    # ... другие поля ...
    access_availability_slots: Optional[bool] = None
    can_override_availability: Optional[bool] = None  # ← добавлено
```

### 4️⃣ Обновление SQLModel модели (backend/app/models/user.py)
```python
class User(SQLModel, table=True):
    # ... другие поля ...
    access_availability_slots: bool = Field(default=False, nullable=False)
    # Право игнорировать проверку занятости при создании событий
    can_override_availability: bool = Field(default=False, nullable=False)  # ← добавлено
```

### 5️⃣ Назначение прав администраторам
```sql
UPDATE users 
SET can_override_availability = TRUE 
WHERE role IN ('admin', 'it');
```

---

## 📝 Коммиты
- `f9b4421` - fix: добавлена обработка can_override_availability в API users
- `fd6fe06` - fix: добавлено поле can_override_availability в модель User и схемы

---

## 🚀 Быстрая проверка на новом сервере

### Проверка наличия всех компонентов:

```bash
# 1. Проверка колонки в PostgreSQL
PGPASSWORD='YtragtR65A' psql -h localhost -U planner_user -d planner_db -c "\d users" | grep "can_override"

# 2. Проверка в Pydantic схемах
grep "can_override_availability" /opt/planner/backend/app/schemas/user.py

# 3. Проверка в SQLModel модели
grep "can_override_availability" /opt/planner/backend/app/models/user.py

# 4. Проверка в API
grep "can_override_availability" /opt/planner/backend/app/api/v1/users.py

# Если все 4 команды что-то нашли - всё ОК! ✅
```

### Если что-то отсутствует:

#### Добавить колонку в БД:
```bash
PGPASSWORD='YtragtR65A' psql -h localhost -U planner_user -d planner_db << 'EOF'
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS can_override_availability BOOLEAN DEFAULT FALSE NOT NULL;
EOF
```

#### Добавить в схемы:
```bash
# UserBase
sed -i '/access_availability_slots: bool = False/a\    can_override_availability: bool = False' /opt/planner/backend/app/schemas/user.py

# UserUpdate
sed -i '/access_availability_slots: Optional\[bool\] = None/a\    can_override_availability: Optional[bool] = None' /opt/planner/backend/app/schemas/user.py
```

#### Добавить в модель:
```bash
sed -i '/access_availability_slots: bool = Field(default=False, nullable=False)/a\    can_override_availability: bool = Field(default=False, nullable=False)' /opt/planner/backend/app/models/user.py
```

#### Перезапуск:
```bash
systemctl restart planner-backend
```

---

## 🧪 Проверка работоспособности

### В браузере:
1. Откройте Админ-панель → Пользователи
2. Чекбокс "⚠️ Игнор. занятости" должен работать

### Через API:
```bash
# Получить токен
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@corestone.ru","password":"PASSWORD"}' | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

# Проверить что поле возвращается
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/users/me | grep "can_override_availability"
```

### В БД:
```bash
PGPASSWORD='YtragtR65A' psql -h localhost -U planner_user -d planner_db -c "SELECT email, can_override_availability FROM users WHERE role = 'admin';"
```

---

## 📊 Ошибки и их решения

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `column "can_override_availability" does not exist` | Колонки нет в PostgreSQL | Добавить через ALTER TABLE |
| `"User" object has no field "can_override_availability"` | Поле отсутствует в SQLModel модели | Добавить в models/user.py |
| Чекбокс не работает, нет ошибок | Поле не возвращается в API | Добавить в schemas/user.py |
| Response не содержит поле | Схема не обновлена | Проверить UserBase и UserRead |

---

**Дата создания:** 16 января 2026  
**Версия:** 1.0  
**Статус:** ✅ Решено

