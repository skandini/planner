/**
 * Утилиты для расчета позиционирования пересекающихся событий в календаре
 * Реализует алгоритм распределения событий по колонкам для красивого отображения
 */

/**
 * Конвертирует hex цвет в пастельный непрозрачный оттенок
 * @param hexColor - цвет в формате #RRGGBB
 * @returns пастельный цвет в формате rgb()
 */
export function getPastelColor(hexColor: string): string {
  // Убираем # если есть
  const hex = hexColor.replace('#', '');
  
  // Парсим RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Создаем пастельный оттенок: смешиваем с белым (255, 255, 255) в пропорции 30% цвета + 70% белого
  const pastelR = Math.round(r * 0.3 + 255 * 0.7);
  const pastelG = Math.round(g * 0.3 + 255 * 0.7);
  const pastelB = Math.round(b * 0.3 + 255 * 0.7);
  
  return `rgb(${pastelR}, ${pastelG}, ${pastelB})`;
}

export interface EventLayoutInfo {
  id: string;
  start: Date;
  end: Date;
  column: number;      // номер колонки (0-based)
  totalColumns: number; // общее количество колонок в группе
}

interface EventWithPosition {
  id: string;
  start: Date;
  end: Date;
  column?: number;
  colSpan?: number;
}

/**
 * Проверяет, пересекаются ли два события по времени
 */
function eventsOverlap(a: EventWithPosition, b: EventWithPosition): boolean {
  return a.start < b.end && a.end > b.start;
}

/**
 * Находит все группы пересекающихся событий
 */
function findOverlappingGroups(events: EventWithPosition[]): EventWithPosition[][] {
  if (events.length === 0) return [];
  
  // Сортируем события по времени начала
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  
  const groups: EventWithPosition[][] = [];
  let currentGroup: EventWithPosition[] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const event = sorted[i];
    
    // Проверяем, пересекается ли событие с любым событием в текущей группе
    const overlapsWithGroup = currentGroup.some(groupEvent => eventsOverlap(event, groupEvent));
    
    if (overlapsWithGroup) {
      currentGroup.push(event);
    } else {
      // Начинаем новую группу
      groups.push(currentGroup);
      currentGroup = [event];
    }
  }
  
  // Добавляем последнюю группу
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  
  return groups;
}

/**
 * Распределяет события в группе по колонкам
 */
function assignColumnsToGroup(group: EventWithPosition[]): void {
  // Сортируем по времени начала, затем по времени окончания
  const sorted = [...group].sort((a, b) => {
    const startDiff = a.start.getTime() - b.start.getTime();
    if (startDiff !== 0) return startDiff;
    return a.end.getTime() - b.end.getTime();
  });
  
  // Массив для отслеживания занятости колонок (время окончания последнего события в колонке)
  const columns: Date[] = [];
  
  for (const event of sorted) {
    // Ищем первую свободную колонку
    let columnIndex = 0;
    while (columnIndex < columns.length && columns[columnIndex] > event.start) {
      columnIndex++;
    }
    
    // Назначаем событие в найденную колонку
    event.column = columnIndex;
    
    // Обновляем время окончания для этой колонки
    if (columnIndex >= columns.length) {
      columns.push(event.end);
    } else {
      columns[columnIndex] = event.end;
    }
  }
  
  // Определяем общее количество колонок в группе
  const maxColumns = Math.max(...sorted.map(e => (e.column ?? 0) + 1));
  
  // Расширяем события, которые могут занять несколько колонок
  for (const event of sorted) {
    if (event.column === undefined) continue;
    
    // Проверяем, может ли событие расшириться вправо
    let colSpan = 1;
    for (let col = event.column + 1; col < maxColumns; col++) {
      // Проверяем, пересекается ли с событиями в следующей колонке
      const hasConflict = sorted.some(other => 
        other.column === col && eventsOverlap(event, other)
      );
      
      if (!hasConflict) {
        colSpan++;
      } else {
        break;
      }
    }
    
    event.colSpan = colSpan;
  }
}

/**
 * Основная функция для расчета позиций событий
 * Возвращает Map с информацией о позиционировании для каждого события
 */
export function calculateEventLayout(
  events: Array<{ id: string; start: Date; end: Date }>
): Map<string, EventLayoutInfo> {
  const result = new Map<string, EventLayoutInfo>();
  
  if (events.length === 0) return result;
  
  // Преобразуем в рабочий формат
  const eventsWithPosition: EventWithPosition[] = events.map(e => ({
    id: e.id,
    start: e.start,
    end: e.end,
  }));
  
  // Находим группы пересекающихся событий
  const groups = findOverlappingGroups(eventsWithPosition);
  
  // Распределяем события по колонкам в каждой группе
  for (const group of groups) {
    assignColumnsToGroup(group);
    
    const totalColumns = Math.max(...group.map(e => (e.column ?? 0) + (e.colSpan ?? 1)));
    
    for (const event of group) {
      result.set(event.id, {
        id: event.id,
        start: event.start,
        end: event.end,
        column: event.column ?? 0,
        totalColumns: totalColumns,
      });
    }
  }
  
  // Для событий, которые не пересекаются ни с чем, устанавливаем column=0, totalColumns=1
  for (const event of eventsWithPosition) {
    if (!result.has(event.id)) {
      result.set(event.id, {
        id: event.id,
        start: event.start,
        end: event.end,
        column: 0,
        totalColumns: 1,
      });
    }
  }
  
  return result;
}

/**
 * Вспомогательная функция для расчета стилей позиционирования события
 * Реализует классическое каскадное наслоение как в Google Calendar
 */
export function getEventPositionStyles(
  layout: EventLayoutInfo,
  options: {
    cascadeOffset?: number;  // смещение каскада в px (по умолчанию 8)
    minWidth?: number;       // минимальная ширина события в px (по умолчанию 80)
    useClassicCascade?: boolean; // использовать классическое каскадное наслоение
  } = {}
): {
  left: string;
  width: string;
  zIndex: number;
} {
  const { cascadeOffset = 8, minWidth = 80, useClassicCascade = true } = options;
  
  const { column, totalColumns } = layout;
  
  if (useClassicCascade && totalColumns > 1) {
    // Классическое каскадное наслоение (как в Google Calendar)
    // Каждое событие смещается вправо и слегка перекрывает предыдущее
    
    // Улучшенная формула для более плотного и красивого размещения
    const baseWidth = 88; // Увеличена базовая ширина для лучшего заполнения
    const offsetPx = column * cascadeOffset; // Смещение в пикселях
    
    return {
      left: `${offsetPx}px`,
      width: `calc(${baseWidth}% - ${offsetPx}px)`,
      zIndex: 10 + column, // Каждое следующее событие выше предыдущего
    };
  } else {
    // Режим колонок - события впритык, каждое в своей колонке
    // Рассчитываем ширину одной колонки в процентах
    const columnWidthPercent = 100 / totalColumns;
    
    // Рассчитываем отступ слева в процентах
    const leftPercent = column * columnWidthPercent;
    
    // Рассчитываем ширину события с учетом отступов
    const widthPercent = columnWidthPercent;
    
    // Минимальные отступы для визуального разделения (1px между событиями)
    const leftPx = column === 0 ? 1 : 1;
    const rightPx = column === totalColumns - 1 ? 1 : 1;
    
    return {
      left: `calc(${leftPercent}% + ${leftPx}px)`,
      width: `calc(${widthPercent}% - ${leftPx + rightPx}px)`,
      zIndex: 10 + column,
    };
  }
}

