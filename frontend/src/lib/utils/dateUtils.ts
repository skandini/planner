export const startOfWeek = (date: Date) => {
  // Получаем компоненты даты в московском времени
  const moscowComponents = getTimeInTimeZone(date, MOSCOW_TIMEZONE);
  
  // Получаем день недели в московском времени через Intl.DateTimeFormat
  // Это гарантирует правильное определение дня недели независимо от часового пояса браузера
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MOSCOW_TIMEZONE,
    weekday: 'short', // 'Mon', 'Tue', 'Wed', etc.
  });
  
  const weekdayStr = weekdayFormatter.format(date);
  // Маппинг дня недели на число (0 = воскресенье, 1 = понедельник, ..., 6 = суббота)
  const weekdayMap: Record<string, number> = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
  };
  const day = weekdayMap[weekdayStr] ?? 0;
  
  // Вычисляем разницу до понедельника (понедельник = 1)
  // Если воскресенье (0), откатываемся на 6 дней назад к понедельнику
  // Если понедельник (1), diff = 0 (уже понедельник)
  // Если вторник (2), diff = -1 (откатываемся на 1 день)
  // И так далее
  const diff = (day === 0 ? -6 : 1) - day;
  
  // Создаем дату начала недели в московском времени, используя компоненты даты
  // Используем UTC для создания правильной даты, вычитая 3 часа из московского времени
  // Но лучше использовать компоненты даты напрямую и создать Date в московском времени
  const pad = (n: number) => String(n).padStart(2, '0');
  const moscowWeekStartStr = `${moscowComponents.year}-${pad(moscowComponents.month + 1)}-${pad(moscowComponents.day)}T12:00:00+03:00`;
  const moscowWeekStart = new Date(moscowWeekStartStr);
  
  // Применяем diff к дате
  moscowWeekStart.setDate(moscowWeekStart.getDate() + diff);
  moscowWeekStart.setHours(0, 0, 0, 0);
  
  return moscowWeekStart;
};

export const addDays = (date: Date, amount: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
};

export const startOfMonth = (date: Date) => {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
};

export const addMonths = (date: Date, amount: number) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + amount);
  return result;
};

export const getMonthGridDays = (date: Date) => {
  // Получаем первый день месяца в московском времени
  const firstDay = startOfMonth(date);
  // Получаем начало недели для первого дня месяца (понедельник недели, в которой находится первый день месяца)
  const gridStart = startOfWeek(firstDay);
  return Array.from({ length: 42 }, (_, idx) => addDays(gridStart, idx));
};

export const formatDate = (date: Date, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ru-RU", options).format(date);

// Простая функция: парсит UTC строку в Date (явно указываем UTC)
export const parseUTC = (utcStr: string): Date => {
  const utcString = utcStr.endsWith("Z") ? utcStr : utcStr + "Z";
  return new Date(utcString);
};

export const inputToDate = (
  value: string,
  {
    allDay,
    endOfDay = false,
  }: {
    allDay: boolean;
    endOfDay?: boolean;
  },
) => {
  if (!value) {
    return null;
  }
  const hasTime = value.includes("T");
  const normalized =
    allDay && !hasTime
      ? `${value}${endOfDay ? "T23:59:59" : "T00:00:00"}`
      : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

// Простая функция: конвертирует UTC Date в строку для datetime-local (локальное время)
export const toLocalString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
};

// Простая функция: конвертирует московское время из datetime-local в UTC ISO
export const toUTCString = (localStr: string): string => {
  // datetime-local input возвращает строку в формате "YYYY-MM-DDTHH:mm"
  // Мы интерпретируем её как московское время (Europe/Moscow, UTC+3)
  // и конвертируем в UTC для отправки на сервер
  
  const [datePart, timePart] = localStr.split('T');
  if (!datePart || !timePart) {
    throw new Error(`Invalid date format: ${localStr}`);
  }
  
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  
  // Создаём дату, интерпретируя строку как московское время (UTC+3)
  const moscowDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+03:00`;
  
  const date = new Date(moscowDateStr);
  
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${localStr}`);
  }
  
  return date.toISOString();
};

export const toUTCDateISO = (date: Date) =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString();

// Константа для московского времени
export const MOSCOW_TIMEZONE = 'Europe/Moscow';

// Получает компоненты времени в указанном часовом поясе
export const getTimeInTimeZone = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
  
  return { year, month, day, hour, minute, second };
};

// Форматирует время в указанном часовом поясе
export const formatTimeInTimeZone = (date: Date, timeZone: string, options?: Intl.DateTimeFormatOptions): string => {
  return new Intl.DateTimeFormat('ru-RU', {
    ...options,
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    ...(options?.second && { second: '2-digit' }),
  }).format(date);
};

// Конвертирует UTC Date в строку для datetime-local в указанном часовом поясе
export const toTimeZoneString = (date: Date, timeZone: string): string => {
  const { year, month, day, hour, minute } = getTimeInTimeZone(date, timeZone);
  const y = year;
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  const min = String(minute).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
};

