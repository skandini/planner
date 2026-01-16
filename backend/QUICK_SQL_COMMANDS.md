# 🔧 Быстрые SQL команды для управления правами

## 🚀 Назначить права can_override_availability

### Одной командой (через терминал сервера)

```bash
# Назначить права админам и IT
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db << 'EOF'
UPDATE users SET can_override_availability = TRUE WHERE role IN ('admin', 'it');
SELECT email, full_name, role, can_override_availability FROM users WHERE can_override_availability = TRUE;
EOF
```

### Назначить конкретному пользователю

```bash
# Замените EMAIL на реальный email
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db << 'EOF'
UPDATE users SET can_override_availability = TRUE WHERE email = 'user@corestone.ru';
SELECT email, full_name, role, can_override_availability FROM users WHERE email = 'user@corestone.ru';
EOF
```

### Убрать права

```bash
# Убрать права у конкретного пользователя
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db << 'EOF'
UPDATE users SET can_override_availability = FALSE WHERE email = 'user@corestone.ru';
EOF
```

---

## 📊 Проверка текущего состояния

### Показать всех с правами override

```bash
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -c "SELECT email, full_name, role, can_override_availability FROM users WHERE can_override_availability = TRUE ORDER BY role;"
```

### Статистика по ролям

```bash
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -c "SELECT role, COUNT(*) as total, SUM(CASE WHEN can_override_availability THEN 1 ELSE 0 END) as with_override FROM users GROUP BY role;"
```

---

## 🎯 Типичные сценарии

### 1. Первичная настройка (после деплоя)

```bash
# Дать права всем админам и IT
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db << 'EOF'
UPDATE users SET can_override_availability = TRUE WHERE role IN ('admin', 'it');
EOF
```

### 2. Добавить CEO и директоров

```bash
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db << 'EOF'
UPDATE users 
SET can_override_availability = TRUE 
WHERE email IN (
    'ceo@corestone.ru',
    'director1@corestone.ru',
    'director2@corestone.ru'
);
EOF
```

### 3. Убрать права у уволенного сотрудника

```bash
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db << 'EOF'
UPDATE users 
SET can_override_availability = FALSE, is_active = FALSE 
WHERE email = 'fired@corestone.ru';
EOF
```

---

## 📋 Полные SQL скрипты

Для более сложных операций используйте готовые скрипты:

```bash
# Полная настройка прав
cd /opt/planner/backend
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -f setup_override_permissions.sql

# Проверка состояния
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -f check_override_permissions.sql
```

---

**Сохранено:** 16 января 2026

