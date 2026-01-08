# Workflow работы с веткой testmain

## Процесс разработки и деплоя

### Шаг 1: Начало работы (локально)

```bash
# 1. Убедиться что на правильной ветке
git checkout testmain

# 2. Обновить локальную версию из GitHub
git pull origin testmain

# 3. Проверить статус
git status
# Должно быть: "nothing to commit, working tree clean"
```

### Шаг 2: Разработка (локально)

```bash
# Делаете изменения в коде
# ... редактируете файлы ...

# Проверить что изменилось
git status

# Посмотреть конкретные изменения
git diff
```

### Шаг 3: Коммит изменений (локально)

```bash
# 1. Добавить измененные файлы
git add .

# Или добавить конкретные файлы
# git add frontend/src/components/MyComponent.tsx
# git add backend/app/api/v1/my_endpoint.py

# 2. Закоммитить с понятным сообщением
git commit -m "Описание изменений: что было добавлено/исправлено"

# 3. Проверить что коммит создан
git log --oneline -1
```

### Шаг 4: Загрузка в GitHub

```bash
# 1. Запушить изменения в GitHub
git push origin testmain

# 2. Проверить что запушено
git log --oneline -1
```

### Шаг 5: Деплой на сервер

Выполните на сервере (155.212.190.153):

```bash
# 1. Перейти в проект
cd /opt/planner

# 2. Убедиться что на ветке testmain
git checkout testmain

# 3. Обновить код из GitHub
git pull origin testmain

# 4. Проверить что обновилось
git log --oneline -1
# Должен быть ваш последний коммит

# 5. Перезапустить сервисы (если нужно)
sudo systemctl restart planner-backend
sudo systemctl restart planner-celery-worker

# 6. Если изменился фронтенд - пересобрать
cd frontend
npm install  # если изменились зависимости
npm run build
sudo systemctl restart planner-frontend
```

## Полный пример workflow

### Пример 1: Изменение в backend

```bash
# ЛОКАЛЬНО:

# 1. Обновить код
cd C:\testprj
git checkout testmain
git pull origin testmain

# 2. Внести изменения
# ... редактируете backend/app/api/v1/events.py ...

# 3. Закоммитить
git add backend/app/api/v1/events.py
git commit -m "Добавлена функция X в events API"
git push origin testmain

# НА СЕРВЕРЕ:

ssh root@155.212.190.153
cd /opt/planner
git checkout testmain
git pull origin testmain
sudo systemctl restart planner-backend
```

### Пример 2: Изменение во фронтенде

```bash
# ЛОКАЛЬНО:

cd C:\testprj
git checkout testmain
git pull origin testmain

# ... редактируете frontend/src/components/MyComponent.tsx ...

git add frontend/src/components/MyComponent.tsx
git commit -m "Исправлен баг в MyComponent"
git push origin testmain

# НА СЕРВЕРЕ:

ssh root@155.212.190.153
cd /opt/planner
git checkout testmain
git pull origin testmain
cd frontend
npm run build
sudo systemctl restart planner-frontend
```

### Пример 3: Изменения в backend и frontend

```bash
# ЛОКАЛЬНО:

cd C:\testprj
git checkout testmain
git pull origin testmain

# ... делаете изменения в backend и frontend ...

git add .
git commit -m "Добавлена новая функция: X"
git push origin testmain

# НА СЕРВЕРЕ:

ssh root@155.212.190.153
cd /opt/planner
git checkout testmain
git pull origin testmain

# Backend
sudo systemctl restart planner-backend
sudo systemctl restart planner-celery-worker

# Frontend
cd frontend
npm run build
sudo systemctl restart planner-frontend
```

## Полезные команды

### Проверка статуса

```bash
# Локально
git status
git log --oneline -5

# На сервере
cd /opt/planner
git status
git log --oneline -5
```

### Отмена изменений (если что-то пошло не так)

```bash
# Отменить незакоммиченные изменения в файле
git restore <файл>

# Отменить все незакоммиченные изменения
git restore .

# Отменить последний коммит (но оставить изменения)
git reset --soft HEAD~1

# Отменить последний коммит (удалить изменения)
git reset --hard HEAD~1
```

### Просмотр изменений

```bash
# Посмотреть что изменилось
git diff

# Посмотреть изменения в конкретном файле
git diff <файл>

# Посмотреть историю коммитов
git log --oneline -10

# Посмотреть изменения в последнем коммите
git show HEAD
```

## Важные моменты

1. **Всегда начинайте с `git pull`** - чтобы получить последние изменения
2. **Коммитьте часто** - небольшие коммиты лучше больших
3. **Пишите понятные сообщения коммитов** - что и зачем изменено
4. **Проверяйте на сервере** - после деплоя убедитесь что все работает
5. **Не коммитьте конфиги** - `.env`, пароли, секреты не должны быть в git

## Структура коммитов (рекомендуется)

```
feat: Добавлена новая функция X
fix: Исправлен баг в компоненте Y
refactor: Рефакторинг кода в модуле Z
docs: Обновлена документация
perf: Оптимизация производительности
```

## Быстрая команда для деплоя на сервер

Создайте скрипт на сервере `/opt/planner/deploy.sh`:

```bash
#!/bin/bash
cd /opt/planner
git checkout testmain
git pull origin testmain
sudo systemctl restart planner-backend
sudo systemctl restart planner-celery-worker
cd frontend && npm run build && sudo systemctl restart planner-frontend
```

Тогда деплой будет одной командой:
```bash
ssh root@155.212.190.153 '/opt/planner/deploy.sh'
```

