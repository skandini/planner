export const startOfWeek = (date: Date) => {
  // Получаем день недели в московском времени напрямую через Intl.DateTimeFormat
  // Это гарантирует правильное определение дня недели независимо от часового пояса браузера
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MOSCOW_TIMEZONE,
    weekday: 'long', // 'Monday', 'Tuesday', etc. - более надежно чем 'short'
  });
  
  const weekdayStr = weekdayFormatter.format(date);
  // Маппинг дня недели на число (0 = воскресенье, 1 = понедельник, ..., 6 = суббота)
  const weekdayMap: Record<string, number> = {
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
  };
  const day = weekdayMap[weekdayStr] ?? 0;
  
  // Вычисляем разницу до понедельника (понедельник = 1)
  // Если воскресенье (0), откатываемся на 6 дней назад к понедельнику
  // Если понедельник (1), diff = 0 (уже понедельник)
  // Если вторник (2), diff = -1 (откатываемся на 1 день)
  // И так далее
  const diff = (day === 0 ? -6 : 1) - day;
  
  // Получаем компоненты даты в московском времени
  const moscowComponents = getTimeInTimeZone(date, MOSCOW_TIMEZONE);
  
  // Вычисляем дату начала недели используя компоненты даты в московском времени
  // Используем простой подход: создаем дату в московском времени с явным указанием часового пояса
  const pad = (n: number) => String(n).padStart(2, '0');
  
  // Вычисляем день начала недели
  let startDay = moscowComponents.day + diff;
  let startMonth = moscowComponents.month;
  let startYear = moscowComponents.year;
  
  // Обрабатываем переход через границы месяца/года
  if (startDay < 1) {
    // Переход к предыдущему месяцу
    startMonth -= 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear -= 1;
    }
    // Получаем количество дней в предыдущем месяце (используя UTC для надежности)
    const daysInPrevMonth = new Date(Date.UTC(startYear, startMonth + 1, 0)).getUTCDate();
    startDay = daysInPrevMonth + startDay;
  } else {
    // Проверяем, не выходим ли за границы текущего месяца
    const daysInMonth = new Date(Date.UTC(startYear, startMonth + 1, 0)).getUTCDate();
    if (startDay > daysInMonth) {
      // Переход к следующему месяцу
      startDay = startDay - daysInMonth;
      startMonth += 1;
      if (startMonth > 11) {
        startMonth = 0;
        startYear += 1;
      }
    }
  }
  
  // Создаем дату начала недели в московском времени (UTC+3)
  // Используем полдень (12:00) для избежания проблем с переходом дня при создании Date
  // Полночь МСК = 21:00 предыдущего дня UTC
  // Полдень МСК = 09:00 того же дня UTC
  // Используем полдень для создания Date, чтобы избежать проблем с переходом дня
  const moscowWeekStartStr = `${startYear}-${pad(startMonth + 1)}-${pad(startDay)}T12:00:00+03:00`;
  const result = new Date(moscowWeekStartStr);
  
  // Проверяем, что дата правильная - компоненты должны совпадать
  const checkComponents = getTimeInTimeZone(result, MOSCOW_TIMEZONE);
  if (checkComponents.year === startYear && checkComponents.month === startMonth && checkComponents.day === startDay) {
    // Дата правильная - возвращаем её (время не важно для начала недели, главное - правильный день)
    return result;
  }
  
  // Если компоненты не совпали (маловероятно), создаем через UTC напрямую
  // Полночь МСК = 21:00 предыдущего дня UTC (но это может быть неправильно)
  // Лучше использовать полдень МСК = 09:00 того же дня UTC
  return new Date(Date.UTC(startYear, startMonth, startDay, 9, 0, 0));
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

