export const startOfWeek = (date: Date) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // начинаем с понедельника
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
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
  const firstDay = startOfMonth(date);
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

// Простая функция: конвертирует локальное время из datetime-local в UTC ISO
export const toUTCString = (localStr: string): string => {
  // datetime-local input возвращает строку в формате "YYYY-MM-DDTHH:mm"
  // Когда мы создаём new Date() из такой строки БЕЗ указания timezone,
  // браузер интерпретирует её как локальное время
  
  // Простое решение: создаём Date из строки напрямую
  // Браузер автоматически интерпретирует "YYYY-MM-DDTHH:mm" как локальное время
  const localDate = new Date(localStr);
  
  if (isNaN(localDate.getTime())) {
    throw new Error(`Invalid date: ${localStr}`);
  }
  
  // toISOString() автоматически конвертирует локальное время в UTC
  return localDate.toISOString();
};

export const toUTCDateISO = (date: Date) =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString();

// Получает компоненты времени в указанном часовом поясе
export const getTimeInTimeZone = (date: Date, timeZone: string) => {
  // Используем Intl.DateTimeFormat для получения времени в нужном часовом поясе
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

// Конвертирует UTC Date в указанный часовой пояс (для совместимости)
export const toTimeZone = (date: Date, timeZone: string): Date => {
  const { year, month, day, hour, minute, second } = getTimeInTimeZone(date, timeZone);
  return new Date(year, month, day, hour, minute, second);
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
  const tzDate = toTimeZone(date, timeZone);
  const y = tzDate.getFullYear();
  const m = String(tzDate.getMonth() + 1).padStart(2, "0");
  const d = String(tzDate.getDate()).padStart(2, "0");
  const h = String(tzDate.getHours()).padStart(2, "0");
  const min = String(tzDate.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
};

