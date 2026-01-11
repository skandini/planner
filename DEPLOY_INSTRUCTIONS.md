# Инструкция по загрузке на прод

## Вариант 1: Создать новую ветку для прода (рекомендуется)

```bash
# Переключиться на main
git checkout main
git pull origin main

# Создать новую ветку для прода (например, production)
git checkout -b production

# Смержить изменения из вашей рабочей ветки
git merge refactor/split-page-tsx

# Отправить на GitHub
git push origin production
```

## Вариант 2: Использовать ветку develop

```bash
# Переключиться на develop
git checkout develop
git pull origin develop

# Смержить изменения
git merge refactor/split-page-tsx

# Отправить на GitHub
git push origin develop
```

## Вариант 3: Создать копию testmain

```bash
# Создать ветку на основе testmain
git checkout testmain
git pull origin testmain
git checkout -b testmain-copy

# Смержить изменения
git merge refactor/split-page-tsx

# Отправить на GitHub
git push origin testmain-copy
```

## После создания ветки

1. На GitHub создайте Pull Request из новой ветки в main (или нужную целевую ветку)
2. После мерджа на сервере выполните:
   ```bash
   git fetch origin
   git checkout <имя_ветки>
   git pull origin <имя_ветки>
   # Затем запустите деплой скрипты
   ```

