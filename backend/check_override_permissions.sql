-- ========================================
-- Скрипт проверки прав can_override_availability
-- ========================================
-- Быстрая проверка текущего состояния прав
--
-- ИСПОЛЬЗОВАНИЕ на сервере:
-- PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -f check_override_permissions.sql
--
-- ========================================

\echo '========================================';
\echo 'ПРОВЕРКА ПРАВ CAN_OVERRIDE_AVAILABILITY';
\echo '========================================';
\echo '';

\echo '1. ПОЛЬЗОВАТЕЛИ С ПРАВАМИ OVERRIDE:';
\echo '------------------------------------';
SELECT 
    id,
    email, 
    full_name, 
    role,
    position,
    is_active,
    can_override_availability as "override"
FROM users
WHERE can_override_availability = TRUE
ORDER BY role, email;

\echo '';
\echo '2. РАСПРЕДЕЛЕНИЕ ПО РОЛЯМ:';
\echo '------------------------------------';
SELECT 
    role as "Роль",
    COUNT(*) as "Всего",
    SUM(CASE WHEN can_override_availability THEN 1 ELSE 0 END) as "С override",
    ROUND(
        100.0 * SUM(CASE WHEN can_override_availability THEN 1 ELSE 0 END) / COUNT(*), 
        1
    ) as "Процент %"
FROM users
GROUP BY role
ORDER BY role;

\echo '';
\echo '3. НЕДАВНО СОЗДАННЫЕ СОБЫТИЯ:';
\echo '------------------------------------';
\echo 'Последние 10 событий и их создатели:';

SELECT 
    e.id,
    e.title,
    e.starts_at,
    u.email as "Создатель",
    u.role as "Роль",
    u.can_override_availability as "Override права"
FROM events e
LEFT JOIN users u ON e.created_by = u.id
ORDER BY e.created_at DESC
LIMIT 10;

\echo '';
\echo '✅ Проверка завершена!';
\echo '';

