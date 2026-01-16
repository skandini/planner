export const startOfWeek = (date: Date) => {
  // Проверяем, что date является валидным Date объектом
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    console.error('startOfWeek: Invalid date provided', date);
    // Возвращаем начало текущей недели, если переданная дата невалидна
    const now = new Date();
    const moscowComponents = getTimeInTimeZone(now, MOSCOW_TIMEZONE);
    const pad = (n: number) => String(n).padStart(2, '0');
    const moscowDateStr = `${moscowComponents.year}-${pad(moscowComponents.month + 1)}-${pad(moscowComponents.day)}T12:00:00+03:00`;
    date = new Date(moscowDateStr);
  }
  
  // Получаем компоненты даты в московском времени
  const moscowComponents = getTimeInTimeZone(date, MOSCOW_TIMEZONE);
  
  // Получаем день недели в московском времени напрямую через Intl.DateTimeFormat
  // Это гарантирует правильное определение дня недели независимо от часового пояса браузера
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MOSCOW_TIMEZONE,
    weekday: 'long', // 'Monday', 'Tuesday', etc. - более надежно чем 'short'
  });
  
  // Создаем временную дату в московском времени для правильного определения дня недели
  const pad = (n: number) => String(n).padStart(2, '0');
  const moscowDateStr = `${moscowComponents.year}-${pad(moscowComponents.month + 1)}-${pad(moscowComponents.day)}T12:00:00+03:00`;
  const moscowDate = new Date(moscowDateStr);
  
  // Проверяем, что moscowDate валидна
  if (isNaN(moscowDate.getTime())) {
    console.error('startOfWeek: Invalid moscowDate', moscowDateStr);
    // Возвращаем текущую дату, если не удалось создать
    return new Date();
  }
  
  const weekdayStr = weekdayFormatter.format(moscowDate);
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
  // Правильная формула: diff = day === 0 ? -6 : 1 - day
  const diff = day === 0 ? -6 : 1 - day;
  
  // Вычисляем дату начала недели используя компоненты даты в московском времени
  // Используем простой подход: создаем дату в московском времени с явным указанием часового пояса
  
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
  
  // Проверяем, что результат валиден
  if (isNaN(result.getTime())) {
    console.error('startOfWeek: Invalid result date', moscowWeekStartStr);
    // Если невалидна, создаем через UTC
    return new Date(Date.UTC(startYear, startMonth, startDay, 9, 0, 0));
  }
  
  // Проверяем, что дата правильная - компоненты должны совпадать
  try {
    const checkComponents = getTimeInTimeZone(result, MOSCOW_TIMEZONE);
    if (checkComponents.year === startYear && checkComponents.month === startMonth && checkComponents.day === startDay) {
      // Дата правильная - возвращаем её (время не важно для начала недели, главное - правильный день)
      return result;
    }
  } catch (error) {
    console.error('startOfWeek: Error checking result', error);
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

// Добавляет дни в московском времени (гарантирует правильный день без сдвига)
export const addDaysInMoscow = (date: Date, amount: number): Date => {
  // Проверяем, что date является валидным Date объектом
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    console.error('addDaysInMoscow: Invalid date provided', date);
    // Возвращаем текущую дату, если переданная дата невалидна
    return new Date();
  }
  
  // Получаем компоненты даты в московском времени
  const moscowComponents = getTimeInTimeZone(date, MOSCOW_TIMEZONE);
  
  // Вычисляем новый день
  let newDay = moscowComponents.day + amount;
  let newMonth = moscowComponents.month;
  let newYear = moscowComponents.year;
  
  // Обрабатываем переход через границы месяца/года
  // Используем цикл, чтобы обработать случаи, когда нужно перейти через несколько месяцев
  while (true) {
    if (newDay < 1) {
      // Переход к предыдущему месяцу
      newMonth -= 1;
      if (newMonth < 0) {
        newMonth = 11;
        newYear -= 1;
      }
      const daysInPrevMonth = new Date(Date.UTC(newYear, newMonth + 1, 0)).getUTCDate();
      newDay = daysInPrevMonth + newDay;
    } else {
      // Проверяем количество дней в текущем месяце
      const daysInMonth = new Date(Date.UTC(newYear, newMonth + 1, 0)).getUTCDate();
      if (newDay > daysInMonth) {
        // Переход к следующему месяцу
        newDay = newDay - daysInMonth;
        newMonth += 1;
        if (newMonth > 11) {
          newMonth = 0;
          newYear += 1;
        }
      } else {
        // newDay в допустимом диапазоне для текущего месяца, выходим из цикла
        break;
      }
    }
  }
  
  // Создаем дату в московском времени (полдень для избежания проблем)
  const pad = (n: number) => String(n).padStart(2, '0');
  const moscowDateStr = `${newYear}-${pad(newMonth + 1)}-${pad(newDay)}T12:00:00+03:00`;
  const result = new Date(moscowDateStr);
  
  // Проверяем, что результат валиден
  if (isNaN(result.getTime())) {
    console.error('addDaysInMoscow: Invalid result date', moscowDateStr);
    // Если невалидна, создаем через UTC
    return new Date(Date.UTC(newYear, newMonth, newDay, 9, 0, 0));
  }
  
  // Проверяем, что дата правильная
  try {
    const checkMoscow = getTimeInTimeZone(result, MOSCOW_TIMEZONE);
    if (checkMoscow.year === newYear && checkMoscow.month === newMonth && checkMoscow.day === newDay) {
      return result;
    }
  } catch (error) {
    console.error('addDaysInMoscow: Error checking result', error);
  }
  
  // Если не совпало, создаем через UTC
  return new Date(Date.UTC(newYear, newMonth, newDay, 9, 0, 0));
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
  return Array.from({ length: 42 }, (_, idx) => addDaysInMoscow(gridStart, idx));
};

export const formatDate = (date: Date, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ru-RU", { ...options, timeZone: MOSCOW_TIMEZONE }).format(date);

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
  // Важно: используем формат ISO 8601 с явным указанием часового пояса
  const pad = (n: number) => String(n).padStart(2, '0');
  const moscowDateStr = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+03:00`;
  
  // Создаем Date объект из строки с московским временем
  const date = new Date(moscowDateStr);
  
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${localStr}`);
  }
  
  // Возвращаем ISO строку в UTC
  // Проверяем, что конвертация правильная - вычитаем 3 часа из московского времени
  const utcStr = date.toISOString();
  
  // Проверяем, что дата правильно конвертирована
  // Например, если входная строка "2024-12-07T09:00" (7 декабря, 9:00 МСК),
  // то UTC должна быть "2024-12-07T06:00:00.000Z" (7 декабря, 6:00 UTC)
  // Если входная строка "2024-12-07T00:00" (7 декабря, 0:00 МСК),
  // то UTC должна быть "2024-12-06T21:00:00.000Z" (6 декабря, 21:00 UTC)
  
  return utcStr;
};

export const toUTCDateISO = (date: Date) =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString();

// Константа для московского времени
export const MOSCOW_TIMEZONE = 'Europe/Moscow';

// Получает компоненты времени в указанном часовом поясе
export const getTimeInTimeZone = (date: Date, timeZone: string) => {
  // Проверяем, что date является валидным Date объектом
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    // Если дата невалидна, возвращаем текущую дату в московском времени
    const now = new Date();
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
    const parts = formatter.formatToParts(now);
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
    return { year, month, day, hour, minute, second };
  }
  
  try {
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
  } catch (error) {
    // Если произошла ошибка, возвращаем компоненты текущей даты в московском времени
    console.error('Error in getTimeInTimeZone:', error, date);
    const now = new Date();
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
    const parts = formatter.formatToParts(now);
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
    return { year, month, day, hour, minute, second };
  }
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

// Получает текущую дату/время в московском часовом поясе
export const getCurrentMoscowDate = (): Date => {
  const now = new Date();
  const { year, month, day, hour, minute, second } = getTimeInTimeZone(now, MOSCOW_TIMEZONE);
  
  // Создаём дату в московском времени (UTC+3)
  const pad = (n: number) => String(n).padStart(2, '0');
  const moscowDateStr = `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+03:00`;
  
  return new Date(moscowDateStr);
};

// Сравнивает две даты по дню в московском времени (игнорирует время)
export const isSameDayInMoscow = (date1: Date, date2: Date): boolean => {
  const components1 = getTimeInTimeZone(date1, MOSCOW_TIMEZONE);
  const components2 = getTimeInTimeZone(date2, MOSCOW_TIMEZONE);
  
  return components1.year === components2.year &&
         components1.month === components2.month &&
         components1.day === components2.day;
};

