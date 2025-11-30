This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Prerequisites
- Node.js 20+ (x64) и npm
- Запущенный backend FastAPI на `http://localhost:8000` (см. папку `backend/`)

### Настройка окружения
1. Скопируйте файл переменных:
   ```powershell
   cd frontend
   copy .env.local.example .env.local
   ```
   При необходимости замените `NEXT_PUBLIC_API_BASE_URL`.
2. Установите зависимости и стартаните дев-сервер:
   ```powershell
   npm install
npm run dev
```
3. Откройте [http://localhost:3000](http://localhost:3000). При успешной связке увидите список календарей из API и форму создания.

## Структура
- `src/app/page.tsx` — главная страница с дашбордом календарей и формой создания.
- `src/app/globals.css` — Tailwind стили.
- `.env.local` — базовый URL API (используется на клиенте).

## Дальше
- Добавить аутентификацию и переключение организаций.
- Реализовать события, напоминания и фильтры.
- Упаковать фронт/бэк в docker-compose для VPS.
