#!/bin/bash

# Скрипт диагностики производительности приложения

set -e

echo "=========================================="
echo "Диагностика производительности"
echo "=========================================="
echo ""

# 1. Проверить медленные запросы к БД
echo "1. Медленные запросы к PostgreSQL:"
echo "-----------------------------------"
if command -v psql &> /dev/null; then
    PGPASSWORD=$(grep DATABASE_URL /opt/planner/backend/.env | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')
    DB_USER=$(grep DATABASE_URL /opt/planner/backend/.env | sed 's/.*:\/\/\([^:]*\):.*/\1/')
    DB_NAME=$(grep DATABASE_URL /opt/planner/backend/.env | sed 's/.*\/\([^?]*\).*/\1/')
    
    PGPASSWORD=$PGPASSWORD psql -U $DB_USER -d $DB_NAME -h localhost -c "
    SELECT pid, now() - pg_stat_activity.query_start AS duration, 
           left(query, 100) as query_preview
    FROM pg_stat_activity 
    WHERE state = 'active' 
      AND query NOT LIKE '%pg_stat_activity%'
      AND now() - pg_stat_activity.query_start > interval '1 second'
    ORDER BY duration DESC 
    LIMIT 10;" 2>/dev/null || echo "  (не удалось подключиться к БД)"
else
    echo "  PostgreSQL клиент не установлен"
fi
echo ""

# 2. Проверить блокировки в БД
echo "2. Блокировки в PostgreSQL:"
echo "-----------------------------------"
if command -v psql &> /dev/null && [ -n "$PGPASSWORD" ]; then
    PGPASSWORD=$PGPASSWORD psql -U $DB_USER -d $DB_NAME -h localhost -c "
    SELECT blocked_locks.pid AS blocked_pid,
           blocking_locks.pid AS blocking_pid,
           blocked_activity.query AS blocked_query,
           blocking_activity.query AS blocking_query
    FROM pg_catalog.pg_locks blocked_locks
    JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
    JOIN pg_catalog.pg_locks blocking_locks 
        ON blocking_locks.locktype = blocked_locks.locktype
        AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
        AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
        AND blocking_locks.pid != blocked_locks.pid
    JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
    WHERE NOT blocked_locks.granted;" 2>/dev/null || echo "  (блокировок не найдено)"
fi
echo ""

# 3. Проверить использование ресурсов
echo "3. Использование ресурсов:"
echo "-----------------------------------"
echo "CPU и память:"
top -bn1 | head -5
echo ""
echo "Память:"
free -h
echo ""
echo "Load average:"
uptime | awk -F'load average:' '{print $2}'
echo ""

# 4. Проверить процессы приложения
echo "4. Процессы приложения:"
echo "-----------------------------------"
echo "Uvicorn:"
ps aux | grep uvicorn | grep -v grep | awk '{printf "  PID: %s, CPU: %s%%, MEM: %s%%, RSS: %sMB\n", $2, $3, $4, $6/1024}'
echo ""
echo "Celery:"
ps aux | grep celery | grep -v grep | awk '{printf "  PID: %s, CPU: %s%%, MEM: %s%%, RSS: %sMB\n", $2, $3, $4, $6/1024}'
echo ""

# 5. Проверить очередь Celery
echo "5. Очередь Celery:"
echo "-----------------------------------"
if command -v redis-cli &> /dev/null; then
    redis-cli LLEN celery 2>/dev/null && echo "  Задач в очереди: $(redis-cli LLEN celery)" || echo "  (Redis недоступен)"
else
    echo "  Redis клиент не установлен"
fi
echo ""

# 6. Проверить логи на ошибки
echo "6. Последние ошибки в логах:"
echo "-----------------------------------"
echo "Backend (последние 5 ошибок):"
sudo journalctl -u planner-backend --since "10 minutes ago" --no-pager | grep -i error | tail -5 || echo "  (ошибок не найдено)"
echo ""
echo "Celery (последние 5 ошибок):"
sudo journalctl -u planner-celery-worker --since "10 minutes ago" --no-pager | grep -i error | tail -5 || echo "  (ошибок не найдено)"
echo ""

# 7. Проверить подключения к БД
echo "7. Подключения к PostgreSQL:"
echo "-----------------------------------"
if command -v psql &> /dev/null && [ -n "$PGPASSWORD" ]; then
    PGPASSWORD=$PGPASSWORD psql -U $DB_USER -d $DB_NAME -h localhost -c "
    SELECT count(*) as total_connections,
           count(*) FILTER (WHERE state = 'active') as active,
           count(*) FILTER (WHERE state = 'idle') as idle
    FROM pg_stat_activity 
    WHERE datname = '$DB_NAME';" 2>/dev/null || echo "  (не удалось подключиться)"
fi
echo ""

# 8. Проверить использование индексов
echo "8. Использование индексов:"
echo "-----------------------------------"
if command -v psql &> /dev/null && [ -n "$PGPASSWORD" ]; then
    PGPASSWORD=$PGPASSWORD psql -U $DB_USER -d $DB_NAME -h localhost -c "
    SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public' 
      AND tablename IN ('events', 'event_participants', 'notifications')
    ORDER BY idx_scan DESC
    LIMIT 10;" 2>/dev/null || echo "  (не удалось подключиться)"
fi
echo ""

echo "=========================================="
echo "Диагностика завершена"
echo "=========================================="

