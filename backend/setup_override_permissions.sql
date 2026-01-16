-- ========================================
-- Скрипт назначения прав can_override_availability
-- ========================================
-- Этот скрипт назначает права игнорирования занятости 
-- администраторам, IT-специалистам и топ-менеджерам
--
-- ИСПОЛЬЗОВАНИЕ на сервере:
-- PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -f setup_override_permissions.sql
--
-- ========================================

\echo '========================================';
\echo 'Назначение прав can_override_availability';
\echo '========================================';
\echo '';

-- 1. Показать текущее состояние
\echo '1. ТЕКУЩЕЕ СОСТОЯНИЕ:';
\echo '--------------------';
SELECT 
    email, 
    full_name, 
    role, 
    can_override_availability
FROM users
ORDER BY role, email;

\echo '';
\echo '2. НАЗНАЧЕНИЕ ПРАВ:';
\echo '--------------------';

-- 2. Дать права всем админам и IT
UPDATE users 
SET can_override_availability = TRUE 
WHERE role IN ('admin', 'it');

\echo 'ADMIN + IT: права назначены';

-- 3. Дать права конкретным пользователям (топ-менеджеры)
-- ВНИМАНИЕ: Замените email-адреса на реальные из вашей базы!
UPDATE users 
SET can_override_availability = TRUE 
WHERE email IN (
    'ceo@corestone.ru',
    'director@corestone.ru'
    -- Добавьте сюда email других топ-менеджеров
);

\echo 'ТОП-МЕНЕДЖЕРЫ: права назначены (если найдены)';

-- 4. Убрать права у обычных сотрудников (на всякий случай)
UPDATE users 
SET can_override_availability = FALSE 
WHERE role = 'employee' 
  AND email NOT IN (
    'ceo@corestone.ru',
    'director@corestone.ru'
    -- Добавьте сюда email топ-менеджеров из списка выше
  );

\echo 'ОБЫЧНЫЕ СОТРУДНИКИ: права сброшены';

\echo '';
\echo '3. РЕЗУЛЬТАТ:';
\echo '--------------------';

-- 5. Показать пользователей с правами override
SELECT 
    email, 
    full_name, 
    role, 
    can_override_availability as "override_права"
FROM users
WHERE can_override_availability = TRUE
ORDER BY role, email;

\echo '';
\echo '========================================';
\echo 'СТАТИСТИКА:';
\echo '========================================';

-- 6. Статистика
SELECT 
    'Всего пользователей' as "Категория",
    COUNT(*) as "Количество"
FROM users
UNION ALL
SELECT 
    'С правами override' as "Категория",
    COUNT(*) as "Количество"
FROM users
WHERE can_override_availability = TRUE
UNION ALL
SELECT 
    'Админы' as "Категория",
    COUNT(*) as "Количество"
FROM users
WHERE role = 'admin'
UNION ALL
SELECT 
    'IT' as "Категория",
    COUNT(*) as "Количество"
FROM users
WHERE role = 'it'
UNION ALL
SELECT 
    'Сотрудники' as "Категория",
    COUNT(*) as "Количество"
FROM users
WHERE role = 'employee';

\echo '';
\echo '✅ Готово!';
\echo '';

