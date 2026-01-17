"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventRecord } from "@/types/event.types";
import type { Room } from "@/types/room.types";
import { addDays, addDaysInMoscow, formatDate, parseUTC, formatTimeInTimeZone, getTimeInTimeZone, MOSCOW_TIMEZONE, getCurrentMoscowDate, isSameDayInMoscow } from "@/lib/utils/dateUtils";
import { MINUTES_IN_DAY } from "@/lib/constants";
import { calculateEventLayout, getEventPositionStyles, getPastelColor, getCascadeColorVariation } from "@/lib/utils/eventLayout";
import { useTheme } from "@/context/ThemeContext";

// Яркие градиенты для событий в тёмной теме (вдохновлено Bybit)
const DARK_EVENT_COLORS = [
  { bg: "linear-gradient(135deg, rgba(14, 203, 129, 0.25) 0%, rgba(16, 185, 129, 0.15) 100%)", border: "#0ecb81", text: "#34d399" }, // Бирюзовый
  { bg: "linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(139, 92, 246, 0.15) 100%)", border: "#818cf8", text: "#a5b4fc" }, // Индиго
  { bg: "linear-gradient(135deg, rgba(252, 213, 53, 0.2) 0%, rgba(245, 158, 11, 0.12) 100%)", border: "#fcd535", text: "#fde047" }, // Золотой
  { bg: "linear-gradient(135deg, rgba(236, 72, 153, 0.25) 0%, rgba(244, 114, 182, 0.15) 100%)", border: "#ec4899", text: "#f9a8d4" }, // Розовый
  { bg: "linear-gradient(135deg, rgba(6, 182, 212, 0.25) 0%, rgba(34, 211, 238, 0.15) 100%)", border: "#06b6d4", text: "#67e8f9" }, // Циан
  { bg: "linear-gradient(135deg, rgba(249, 115, 22, 0.25) 0%, rgba(251, 146, 60, 0.15) 100%)", border: "#f97316", text: "#fdba74" }, // Оранжевый
];

// Функция получения цвета события для тёмной темы
function getDarkEventColor(eventId: string, index: number) {
  // Используем hash от id события для стабильного цвета
  const hash = eventId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return DARK_EVENT_COLORS[(hash + index) % DARK_EVENT_COLORS.length];
}

interface WeekViewProps {
  days: Date[];
  events: EventRecord[];
  loading: boolean;
  accent: string;
  onEventClick: (event: EventRecord) => void;
  rooms: Room[];
  onEventMove?: (event: EventRecord, newStart: Date) => void;
  onTimeSlotClick?: (date: Date, startTime: Date, endTime: Date, startDateStr?: string, endDateStr?: string) => void;
  onUpdateParticipantStatus?: (eventId: string, userId: string, status: string) => Promise<void>;
  currentUserEmail?: string;
  users?: Array<{ id: string; email: string; avatar_url: string | null; full_name: string | null }>;
  apiBaseUrl?: string;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
}

export function WeekView({
  days,
  events,
  loading,
  accent,
  onEventClick,
  rooms,
  onEventMove,
  onTimeSlotClick,
  onUpdateParticipantStatus,
  currentUserEmail,
  users = [],
  apiBaseUrl = "http://localhost:8000",
  getUserOrganizationAbbreviation,
}: WeekViewProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const HOUR_HEIGHT = 60; // Высота одного часа в пикселях (увеличено для более крупного отображения)
  const DAY_HEIGHT = 24 * HOUR_HEIGHT; // Высота для полного дня (0:00-23:59)
  const moscowToday = getCurrentMoscowDate();
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragInfo = useRef<{ event: EventRecord; offsetMinutes: number } | null>(null);
  const draggingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  
  // Состояние для отслеживания текущего времени (обновляется каждую секунду)
  const [currentTime, setCurrentTime] = useState(() => getCurrentMoscowDate());
  
  // Состояние для диалога повторяемых событий
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<{
    eventId: string;
    userId: string;
    status: string;
    event: EventRecord;
  } | null>(null);
  
  // Обертка для обновления статуса с проверкой повторяемости
  const handleUpdateParticipantStatus = useCallback((event: EventRecord, userId: string, status: string) => {
    const isRecurring = !!(event.recurrence_rule || event.recurrence_parent_id);
    
    if (isRecurring) {
      // Показываем диалог для повторяемого события
      setPendingStatusUpdate({ eventId: event.id, userId, status, event });
      setShowRecurringDialog(true);
    } else {
      // Обычное событие - сразу обновляем
      if (onUpdateParticipantStatus) {
        onUpdateParticipantStatus(event.id, userId, status);
      }
    }
  }, [onUpdateParticipantStatus]);
  
  // Применить изменение статуса к серии событий
  const handleRecurringChoice = useCallback(async (applyTo: "this" | "all") => {
    if (!pendingStatusUpdate || !onUpdateParticipantStatus) return;
    
    setShowRecurringDialog(false);
    
    const { eventId, userId, status, event } = pendingStatusUpdate;
    
    if (applyTo === "this") {
      // Обновляем только текущее событие
      await onUpdateParticipantStatus(eventId, userId, status);
    } else if (applyTo === "all") {
      // Определяем ID родительского события
      const parentId = event.recurrence_parent_id || event.id;
      
      // Находим все события серии
      const seriesEvents = events.filter(e => 
        e.id === parentId || e.recurrence_parent_id === parentId
      );
      
      // Обновляем статус для всех событий серии
      for (const e of seriesEvents) {
        try {
          await onUpdateParticipantStatus(e.id, userId, status);
        } catch (err) {
          console.error(`Failed to update status for event ${e.id}:`, err);
        }
      }
    }
    
    setPendingStatusUpdate(null);
  }, [pendingStatusUpdate, onUpdateParticipantStatus, events]);
  
  // Обновляем текущее время каждую секунду для плавного движения красной линии
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getCurrentMoscowDate());
    }, 1000); // Обновляем каждую секунду для плавного движения
    
    return () => clearInterval(interval);
  }, []);
  
  // Состояние для всплывающего окна с участниками
  const [hoveredEvent, setHoveredEvent] = useState<{
    event: EventRecord;
    position: { top: number; left: number };
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const mousePositionRef = useRef<{ x: number; y: number } | null>(null);
  
  // Состояние для отслеживания события над которым курсор (для z-index)
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  
  const handleEventMouseMove = useCallback((event: EventRecord, e: React.MouseEvent<HTMLDivElement>) => {
    if (!hoveredEvent || hoveredEvent.event.id !== event.id) {
      return;
    }
    
    const tooltipWidth = 320;
    const tooltipHeight = 400;
    const offset = 15;
    
    // Позиция мыши относительно viewport
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Рассчитываем позицию слева от курсора (fixed позиционирование)
    let left = mouseX - tooltipWidth - offset;
    let top = mouseY;
    
    // Проверяем границы viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Если слева нет места, показываем справа от курсора
    if (left < 10) {
      left = mouseX + offset;
    }
    
    // Ограничиваем по горизонтали
    const maxLeft = viewportWidth - tooltipWidth - 10;
    left = Math.max(10, Math.min(maxLeft, left));
    
    // Ограничиваем по вертикали
    const maxTop = viewportHeight - tooltipHeight - 10;
    top = Math.max(10, Math.min(maxTop, top));
    
    mousePositionRef.current = { x: mouseX, y: mouseY };
    
    setHoveredEvent({
      event,
      position: { top, left },
    });
  }, [hoveredEvent]);
  
  const handleEventMouseEnter = useCallback((event: EventRecord, element: HTMLDivElement, e?: React.MouseEvent<HTMLDivElement>) => {
    // Устанавливаем z-index для события под курсором
    setHoveredEventId(event.id);
    
    // Проверяем, не показывается ли уже окно для этого события
    if (hoveredEvent?.event.id === event.id) {
      return;
    }
    
    // Показываем окно даже если нет участников, если есть описание или переговорка
    const hasContent = (event.participants && event.participants.length > 0) ||
                     (event.description && event.description.trim().length > 0) ||
                     event.room_id;
    
    if (!hasContent) {
      return;
    }
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    hoverTimeoutRef.current = setTimeout(() => {
      const tooltipWidth = 320;
      const tooltipHeight = 400;
      const offset = 15;
      
      // Используем позицию мыши, если доступна, иначе позицию элемента
      const rect = element.getBoundingClientRect();
      const mouseX = e?.clientX || rect.left;
      const mouseY = e?.clientY || rect.top;
      
      // Позиционируем слева от курсора (fixed позиционирование)
      let left = mouseX - tooltipWidth - offset;
      let top = mouseY;
      
      // Проверяем границы viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Если слева нет места, показываем справа от курсора
      if (left < 10) {
        left = mouseX + offset;
      }
      
      // Ограничиваем по горизонтали
      const maxLeft = viewportWidth - tooltipWidth - 10;
      left = Math.max(10, Math.min(maxLeft, left));
      
      // Ограничиваем по вертикали
      const maxTop = viewportHeight - tooltipHeight - 10;
      top = Math.max(10, Math.min(maxTop, top));
      
      mousePositionRef.current = { x: mouseX, y: mouseY };
      
      setHoveredEvent({
        event,
        position: { top, left },
      });
    }, 200); // Задержка 200мс перед показом
  }, [hoveredEvent]);
  
  const handleEventMouseLeave = useCallback(() => {
    // Сбрасываем z-index
    setHoveredEventId(null);
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    // Небольшая задержка перед скрытием, чтобы можно было навести на само окно
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredEvent(null);
      mousePositionRef.current = null;
    }, 100);
  }, []);
  
  const handleTooltipMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  }, []);
  
  const handleTooltipMouseLeave = useCallback(() => {
    setHoveredEvent(null);
    mousePositionRef.current = null;
  }, []);
  

  // Автоскролл к текущему времени при монтировании компонента (если сегодня в сетке)
  useEffect(() => {
    if (scrollContainerRef.current) {
      const now = getCurrentMoscowDate();
      const moscowTime = getTimeInTimeZone(now, MOSCOW_TIMEZONE);
      const isTodayInView = days.some(day => isSameDayInMoscow(day, now));
      
      if (isTodayInView) {
        // Прокручиваем к текущему времени в московском часовом поясе
        const minutesFromStart = (moscowTime.hour * 60) + moscowTime.minute;
        const topPx = (minutesFromStart / MINUTES_IN_DAY) * DAY_HEIGHT;
        // Отступ 100px сверху, чтобы линия была видна
        scrollContainerRef.current.scrollTop = Math.max(0, topPx - 100);
      } else {
        // Если сегодня не в сетке, прокручиваем к 8 утра
        const scrollTo8AM = 8 * HOUR_HEIGHT;
        scrollContainerRef.current.scrollTop = scrollTo8AM;
      }
    }
  }, [HOUR_HEIGHT, DAY_HEIGHT, days]);
  
  // Функция проверки, начинается ли событие в ближайшие 5 минут
  const isEventStartingSoon = useCallback((event: EventRecord) => {
    const eventStart = parseUTC(event.starts_at);
    const now = currentTime;
    const diffMs = eventStart.getTime() - now.getTime();
    const diffMinutes = diffMs / (1000 * 60);
    // Событие начинается в ближайшие 5 минут и еще не началось
    return diffMinutes >= 0 && diffMinutes <= 5;
  }, [currentTime]);
  
  
  // Состояние для выделения диапазона времени
  const [selection, setSelection] = useState<{
    columnIndex: number;
    startY: number;
    endY: number;
    isActive: boolean;
  } | null>(null);

  const dayColumns = useMemo(
    () =>
      days.map((date) => {
        // Получаем компоненты дня в московском времени
        const dateMoscow = getTimeInTimeZone(date, MOSCOW_TIMEZONE);
        
        // Создаем dayStart и dayEnd в московском времени (полночь МСК = 21:00 предыдущего дня UTC)
        const pad = (n: number) => String(n).padStart(2, '0');
        const dayStartMoscowStr = `${dateMoscow.year}-${pad(dateMoscow.month + 1)}-${pad(dateMoscow.day)}T00:00:00+03:00`;
        const dayEndMoscowStr = `${dateMoscow.year}-${pad(dateMoscow.month + 1)}-${pad(dateMoscow.day)}T23:59:59+03:00`;
        
        const dayStart = new Date(dayStartMoscowStr);
        // Для dayEnd используем начало следующего дня в московском времени
        const nextDay = addDaysInMoscow(date, 1);
        const nextDayMoscow = getTimeInTimeZone(nextDay, MOSCOW_TIMEZONE);
        const dayEndMoscowStrNext = `${nextDayMoscow.year}-${pad(nextDayMoscow.month + 1)}-${pad(nextDayMoscow.day)}T00:00:00+03:00`;
        const dayEnd = new Date(dayEndMoscowStrNext);
        
        // Получаем компоненты дня в московском времени для фильтрации
        const dayStartMoscow = getTimeInTimeZone(dayStart, MOSCOW_TIMEZONE);
        const dayEndMoscow = getTimeInTimeZone(dayEnd, MOSCOW_TIMEZONE);
        
        const dayEvents = events.filter((event) => {
          const start = parseUTC(event.starts_at);
          const end = parseUTC(event.ends_at);
          
          // Получаем компоненты времени события в московском времени
          const eventStartMoscow = getTimeInTimeZone(start, MOSCOW_TIMEZONE);
          const eventEndMoscow = getTimeInTimeZone(end, MOSCOW_TIMEZONE);
          
          // Проверяем, попадает ли событие в день по московскому времени
          // Используем прямое сравнение компонентов даты, чтобы избежать проблем с часовыми поясами
          const eventStartYear = eventStartMoscow.year;
          const eventStartMonth = eventStartMoscow.month;
          const eventStartDay = eventStartMoscow.day;
          const eventEndYear = eventEndMoscow.year;
          const eventEndMonth = eventEndMoscow.month;
          const eventEndDay = eventEndMoscow.day;
          const dayYear = dayStartMoscow.year;
          const dayMonth = dayStartMoscow.month;
          const dayDay = dayStartMoscow.day;
          const nextDayYear = dayEndMoscow.year;
          const nextDayMonth = dayEndMoscow.month;
          const nextDayDay = dayEndMoscow.day;
          
          // Создаем ключи дат для сравнения: YYYYMMDD
          const eventStartKey = eventStartYear * 10000 + eventStartMonth * 100 + eventStartDay;
          const eventEndKey = eventEndYear * 10000 + eventEndMonth * 100 + eventEndDay;
          const dayKey = dayYear * 10000 + dayMonth * 100 + dayDay;
          const nextDayKey = nextDayYear * 10000 + nextDayMonth * 100 + nextDayDay;
          
          // Событие попадает в день, если его начало до следующего дня и конец после начала текущего дня
          return eventStartKey < nextDayKey && eventEndKey >= dayKey;
        });
        
        // Рассчитываем layout для пересекающихся событий
        const eventLayoutMap = calculateEventLayout(
          dayEvents.map(event => ({
            id: event.id,
            start: parseUTC(event.starts_at),
            end: parseUTC(event.ends_at),
          }))
        );

        return {
          date,
          dayStart,
          dayEnd,
          dayStartMoscow, // Сохраняем компоненты дня в московском времени
          events: dayEvents,
          eventLayoutMap, // Добавляем информацию о layout
          isToday: isSameDayInMoscow(date, moscowToday),
        };
      }),
    [days, events, moscowToday],
  );

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    eventRecord: EventRecord,
  ) => {
    if (!onEventMove || eventRecord.all_day) {
      e.preventDefault();
      return;
    }
    draggingRef.current = true;
    const bounds = e.currentTarget.getBoundingClientRect();
    const offsetPx = e.clientY - bounds.top;
    const offsetMinutes = Math.min(
      Math.max((offsetPx / DAY_HEIGHT) * MINUTES_IN_DAY, 0),
      MINUTES_IN_DAY,
    );
    dragInfo.current = { event: eventRecord, offsetMinutes };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", eventRecord.id);

    // Кастомный drag-превью: создаём клон карточки и используем как drag image,
    // чтобы не показывался текстовый ghost.
    const preview = e.currentTarget.cloneNode(true) as HTMLElement;
    preview.style.position = "absolute";
    preview.style.top = "-1000px";
    preview.style.left = "-1000px";
    preview.style.width = `${bounds.width}px`;
    preview.style.height = `${bounds.height}px`;
    preview.style.opacity = "0.85";
    preview.style.pointerEvents = "none";
    document.body.appendChild(preview);
    e.dataTransfer.setDragImage(preview, e.clientX - bounds.left, offsetPx);
    // Удаляем превью чуть позже, чтобы drag image успело примениться
    setTimeout(() => {
      document.body.removeChild(preview);
    }, 0);
  };

  const handleDragEnd = () => {
    dragInfo.current = null;
    setTimeout(() => {
      draggingRef.current = false;
    }, 0);
  };

  const handleDrop = useCallback((
    e: React.DragEvent<HTMLDivElement>,
    dayStart: Date,
    columnIndex: number,
  ) => {
    if (!dragInfo.current || !onEventMove) {
      return;
    }
    e.preventDefault();
    const columnEl = columnRefs.current[columnIndex];
    if (!columnEl) {
      return;
    }
    
    // Получаем колонку дня для правильной даты
    const dayColumn = dayColumns[columnIndex];
    if (!dayColumn) {
      return;
    }
    
    const rect = columnEl.getBoundingClientRect();
    // Вычисляем позицию курсора в минутах от начала дня (0:00-23:59) в московском времени
    let cursorMinutes = ((e.clientY - rect.top) / rect.height) * MINUTES_IN_DAY;
    cursorMinutes = Math.max(0, Math.min(MINUTES_IN_DAY, cursorMinutes));
    
    // Вычитаем offsetMinutes (смещение от начала события, где пользователь схватил событие)
    // чтобы событие размещалось там, где пользователь его отпустил, а не по позиции курсора
    let minutes = cursorMinutes - dragInfo.current.offsetMinutes;
    minutes = Math.max(0, Math.min(MINUTES_IN_DAY, minutes));
    
    // Округляем до 5 минут для привязки
    minutes = Math.round(minutes / 5) * 5;
    
    // Используем компоненты дня в московском времени, которые уже были вычислены
    // Это гарантирует правильный день без сдвига
    const dayMoscow = dayColumn.dayStartMoscow;
    
    // Вычисляем новые час и минуту в московском времени
    const newHour = Math.floor(minutes / 60);
    const newMinute = minutes % 60;
    
    // Создаем новую дату в московском времени (с секундами для корректного парсинга)
    const pad = (n: number) => String(n).padStart(2, '0');
    const newStartStr = `${dayMoscow.year}-${pad(dayMoscow.month + 1)}-${pad(dayMoscow.day)}T${pad(newHour)}:${pad(newMinute)}:00+03:00`;
    const newStart = new Date(newStartStr);
    
    onEventMove(dragInfo.current.event, newStart);
    dragInfo.current = null;
    draggingRef.current = false;
  }, [dayColumns, onEventMove]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (dragInfo.current) {
      e.preventDefault();
    }
  };

  const handleCardClick = (eventRecord: EventRecord) => {
    if (draggingRef.current) {
      return;
    }
    onEventClick(eventRecord);
  };

  const handleMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    columnIndex: number,
    _dayStart: Date,
  ) => {
    if (!onTimeSlotClick || draggingRef.current || e.button !== 0) {
      return;
    }
    // Проверяем, что клик не на событии
    const target = e.target as HTMLElement;
    if (target.closest('[data-event-card]')) {
      return;
    }

    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const currentY = e.clientY - rect.top;
    
    // Привязка к 5-минутным интервалам
    const minutes = (currentY / DAY_HEIGHT) * MINUTES_IN_DAY;
    const snappedMinutes = Math.round(minutes / 5) * 5;
    const startY = (snappedMinutes / MINUTES_IN_DAY) * DAY_HEIGHT;
    
    setSelection({
      columnIndex,
      startY,
      endY: startY,
      isActive: true,
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!selection?.isActive || !onTimeSlotClick) {
      return;
    }

    const columnEl = columnRefs.current[selection.columnIndex];
    if (!columnEl) {
      return;
    }

    const rect = columnEl.getBoundingClientRect();
    const currentY = e.clientY - rect.top;
    const clampedY = Math.max(0, Math.min(DAY_HEIGHT, currentY));
    
    // Привязка к 5-минутным интервалам
    const minutes = (clampedY / DAY_HEIGHT) * MINUTES_IN_DAY;
    const snappedMinutes = Math.round(minutes / 5) * 5;
    const snappedY = (snappedMinutes / MINUTES_IN_DAY) * DAY_HEIGHT;

    setSelection((prev) => {
      if (!prev) return null;
      return { ...prev, endY: snappedY };
    });
  }, [selection, DAY_HEIGHT, onTimeSlotClick, MINUTES_IN_DAY]);

  const handleMouseUp = useCallback(() => {
    if (!selection?.isActive || !onTimeSlotClick) {
      return;
    }

    const columnIndex = selection.columnIndex;
    const dayColumn = dayColumns[columnIndex];
    if (!dayColumn) {
      setSelection(null);
      return;
    }

    const startY = Math.min(selection.startY, selection.endY);
    const endY = Math.max(selection.startY, selection.endY);
    
    // Минимальная высота выделения - 30 минут
    const minHeight = (30 / MINUTES_IN_DAY) * DAY_HEIGHT;
    const actualHeight = Math.max(minHeight, endY - startY);

    const startMinutes = (startY / DAY_HEIGHT) * MINUTES_IN_DAY;
    const endMinutes = startMinutes + (actualHeight / DAY_HEIGHT) * MINUTES_IN_DAY;

    // Привязка к 5-минутным интервалам
    const roundedStartMinutes = Math.floor(startMinutes / 5) * 5;
    const roundedEndMinutes = Math.ceil(endMinutes / 5) * 5;

    // Получаем компоненты дня в московском времени
    const dayMoscow = getTimeInTimeZone(dayColumn.dayStart, MOSCOW_TIMEZONE);
    
    // Создаем время, интерпретируя его как московское время
    const startHour = Math.floor(roundedStartMinutes / 60);
    const startMinute = roundedStartMinutes % 60;
    const endHour = Math.floor(roundedEndMinutes / 60);
    const endMinute = roundedEndMinutes % 60;
    
    // Создаем строку в формате "YYYY-MM-DDTHH:mm" для московского времени
    const pad = (n: number) => String(n).padStart(2, '0');
    const startDateStr = `${dayMoscow.year}-${pad(dayMoscow.month + 1)}-${pad(dayMoscow.day)}T${pad(startHour)}:${pad(startMinute)}`;
    const endDateStr = `${dayMoscow.year}-${pad(dayMoscow.month + 1)}-${pad(dayMoscow.day)}T${pad(endHour)}:${pad(endMinute)}`;
    
    // Конвертируем московское время в Date объекты (интерпретируем как московское и конвертируем в UTC)
    const startTime = new Date(`${startDateStr}+03:00`);
    const endTime = new Date(`${endDateStr}+03:00`);

    // Передаем также строки дат для правильной интерпретации в модальном окне
    onTimeSlotClick(dayColumn.dayStart, startTime, endTime, startDateStr, endDateStr);
    setSelection(null);
  }, [selection, dayColumns, onTimeSlotClick, DAY_HEIGHT]);

  // Глобальные обработчики мыши для выделения
  useEffect(() => {
    if (selection?.isActive) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [selection?.isActive, handleMouseMove, handleMouseUp]);

  return (
    <React.Fragment>
      {/* Диалог для повторяемых событий */}
      {showRecurringDialog && pendingStatusUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowRecurringDialog(false)}>
          <div className="bg-white rounded-lg p-6 shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Повторяющееся событие</h3>
            <p className="text-sm text-slate-600 mb-6">
              Это событие повторяется. Применить изменение статуса к:
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleRecurringChoice("this")}
                className="w-full px-4 py-3 rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition"
              >
                Только этому событию
              </button>
              <button
                onClick={() => handleRecurringChoice("all")}
                className="w-full px-4 py-3 rounded-lg border-2 border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium transition"
              >
                Всем событиям серии
              </button>
              <button
                onClick={() => {
                  setShowRecurringDialog(false);
                  setPendingStatusUpdate(null);
                }}
                className="w-full px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
      
    <div className={`h-full flex flex-col rounded-2xl border overflow-hidden ${
      isDark 
        ? "border-[#2b3139] bg-[#0b0e11] shadow-[0_4px_20px_rgba(0,0,0,0.4)]" 
        : "border-slate-200 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.12)]"
    }`}>
      <div className={`sticky top-0 z-10 grid grid-cols-[80px_repeat(7,minmax(0,1fr))] border-b text-sm flex-shrink-0 ${
        isDark 
          ? "border-[#2b3139] bg-[#181a20]" 
          : "border-slate-200 bg-slate-50"
      }`}>
        <div className={`p-2 text-right text-[0.65rem] uppercase tracking-[0.3em] ${
          isDark ? "text-[#848e9c] bg-[#181a20]" : "text-slate-500 bg-slate-50"
        }`}>
          Время
        </div>
        {dayColumns.map(({ date, isToday }) => (
          <div
            key={`head-${date.toISOString()}`}
            className={`border-l p-2 ${
              isDark 
                ? `border-[#2b3139] bg-[#181a20] ${isToday ? "bg-[#1a1d23]" : ""}` 
                : `border-slate-200 bg-slate-50 ${isToday ? "bg-lime-50" : ""}`
            }`}
          >
            <p className={`uppercase text-[0.65rem] tracking-[0.3em] ${isDark ? "text-[#848e9c]" : "text-slate-400"}`}>
              {new Intl.DateTimeFormat("ru-RU", { 
                weekday: "short",
                timeZone: MOSCOW_TIMEZONE 
              }).format(date)}
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <p className={`text-base font-semibold ${isDark ? "text-[#eaecef]" : ""}`}>
                {new Intl.DateTimeFormat("ru-RU", {
                  day: "numeric",
                  month: "short",
                  timeZone: MOSCOW_TIMEZONE,
                }).format(date)}
              </p>
              {isToday && (
                <span className={`rounded-full px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase ${
                  isDark 
                    ? "bg-[#fcd535]/20 text-[#fcd535]" 
                    : "bg-lime-100 text-lime-600"
                }`}>
                  сегодня
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
        <div className="grid grid-cols-[80px_repeat(7,minmax(0,1fr))]">
          <div
            className={`border-r ${isDark ? "border-[#2b3139] bg-[#0b0e11]" : "border-slate-200 bg-white"}`}
            style={{ height: `${DAY_HEIGHT}px` }}
          >
            <div className={`flex h-full flex-col justify-between text-right text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
              {hours.map((hour) => (
                <div
                  key={`label-${hour}`}
                  className={`pr-1.5 text-[0.6rem] uppercase tracking-wide ${isDark ? "text-[#848e9c]" : ""}`}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  {hour.toString().padStart(2, "0")}:00
                </div>
              ))}
            </div>
          </div>

          {dayColumns.map(({ date, dayStart, dayEnd, events: dayEvents, eventLayoutMap, isToday }, idx) => {
            const isSelecting = selection?.columnIndex === idx && selection.isActive;
            const selectionStartY = isSelecting ? Math.min(selection.startY, selection.endY) : 0;
            const selectionEndY = isSelecting ? Math.max(selection.startY, selection.endY) : 0;
            const selectionHeight = isSelecting ? selectionEndY - selectionStartY : 0;
            
            return (
              <div
                key={`grid-${date.toISOString()}`}
                className={`relative ${
                  isDark 
                    ? `border-l border-[#2b3139] ${idx === dayColumns.length - 1 ? "border-r border-[#2b3139]" : ""} ${isToday ? "bg-[#1a1d23]" : "bg-[#0b0e11]"}`
                    : `border-l border-slate-200 ${idx === dayColumns.length - 1 ? "border-r border-slate-200" : ""} ${isToday ? "bg-lime-50" : "bg-white"}`
                } ${onTimeSlotClick ? "cursor-crosshair" : ""}`}
                style={{ height: `${DAY_HEIGHT}px` }}
                ref={(el) => {
                  columnRefs.current[idx] = el;
                }}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, dayStart, idx)}
                onMouseDown={(e) => handleMouseDown(e, idx, dayStart)}
              >
                {hours.map((hour) => (
                  <div
                    key={`line-${date.toISOString()}-${hour}`}
                    className={`absolute left-0 right-0 border-b ${isDark ? "border-[#2b3139]" : "border-slate-100"}`}
                    style={{ top: `${hour * HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Красная линия текущего времени - показываем только для сегодняшнего дня */}
                {isToday && (() => {
                  const now = currentTime;
                  const moscowTime = getTimeInTimeZone(now, MOSCOW_TIMEZONE);
                  const minutesFromStart = (moscowTime.hour * 60) + moscowTime.minute;
                  const topPx = (minutesFromStart / MINUTES_IN_DAY) * DAY_HEIGHT;
                  const timeStr = `${String(moscowTime.hour).padStart(2, '0')}:${String(moscowTime.minute).padStart(2, '0')}`;
                  
                  // Показываем линию только если она в пределах видимой области (0-23:59)
                  if (topPx >= 0 && topPx <= DAY_HEIGHT) {
                    return (
                      <div
                        className="absolute left-0 right-0 z-30 pointer-events-none"
                        style={{ top: `${topPx}px` }}
                      >
                        {/* Красная линия с тенью для лучшей видимости */}
                        <div className="absolute left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                        {/* Красная точка слева с временем */}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          <div className="h-3 w-3 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] animate-pulse" />
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm ${
                            isDark 
                              ? "bg-red-500/90 text-white" 
                              : "bg-red-500 text-white"
                          }`}>
                            {timeStr}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Визуальное выделение диапазона времени */}
                {isSelecting && selectionHeight > 0 && (
                  <div
                    className={`absolute left-0 right-0 rounded-lg border-2 pointer-events-none z-20 ${
                      isDark 
                        ? "border-[#fcd535] bg-[#fcd535]/10" 
                        : "border-lime-500 bg-lime-100/30"
                    }`}
                    style={{
                      top: `${selectionStartY}px`,
                      height: `${selectionHeight}px`,
                    }}
                  />
                )}

                {dayEvents.filter((event) => {
                  // Скрываем отклоненные события
                  if (currentUserEmail && event.participants) {
                    const userParticipant = event.participants.find((p) => p.email === currentUserEmail);
                    if (userParticipant?.response_status === "declined") {
                      return false; // Не показываем отклоненные
                    }
                  }
                  return true;
                }).map((event) => {
                  const eventStart = parseUTC(event.starts_at);
                  const eventEnd = parseUTC(event.ends_at);
                  
                  // Получаем компоненты времени события в московском времени
                  const eventStartMoscow = getTimeInTimeZone(eventStart, MOSCOW_TIMEZONE);
                  const eventEndMoscow = getTimeInTimeZone(eventEnd, MOSCOW_TIMEZONE);
                  
                  // Рассчитываем позицию на основе московского времени
                  const startMinutes = (eventStartMoscow.hour * 60) + eventStartMoscow.minute;
                  const endMinutes = (eventEndMoscow.hour * 60) + eventEndMoscow.minute;
                  
                  // Ограничиваем отображение границами дня (0:00 - 23:59) в московском времени
                  const displayStartMinutes = Math.max(0, startMinutes);
                  const displayEndMinutes = Math.min(MINUTES_IN_DAY, endMinutes);
                  
                  // Реальная длительность события в минутах (до округления)
                  const realDurationMinutes = endMinutes - startMinutes;
                  // Уровни отображения (как в Google Calendar):
                  const isVeryShort = realDurationMinutes < 30;        // < 30 мин: только название
                  const isShort = realDurationMinutes >= 30 && realDurationMinutes < 60; // 30-59 мин: название + время
                  // >= 60 мин: полная информация
                  // Минимальная высота для отображения - 30 минут (или 40 для коротких с 2 строками)
                  const minHeight = isShort ? 40 : 30; // Для 2 строк нужно больше места
                  const displayDurationMinutes = Math.max(displayEndMinutes - displayStartMinutes, minHeight);
                  const topPx = (displayStartMinutes / MINUTES_IN_DAY) * DAY_HEIGHT;
                  const heightPx = (displayDurationMinutes / MINUTES_IN_DAY) * DAY_HEIGHT;
                  const isStartingSoon = isEventStartingSoon(event);
                  
                  // Получаем информацию о позиционировании для пересекающихся событий
                  const layout = eventLayoutMap?.get(event.id);
                  const positionStyles = layout 
                    ? getEventPositionStyles(layout, { 
                        cascadeOffset: 16,      // Увеличенное смещение каскада для лучшей видимости
                        minWidth: 80,           // Минимальная ширина
                        useClassicCascade: true // Классическое наслоение
                      })
                    : { left: '2px', width: 'calc(100% - 4px)', zIndex: 10 };
                  
                  // Проверяем статус текущего пользователя для события
                  const userParticipant = currentUserEmail && event.participants
                    ? event.participants.find((p) => p.email === currentUserEmail)
                    : null;
                  const isAccepted = userParticipant?.response_status === "accepted";
                  const needsAction = userParticipant && 
                    (userParticipant.response_status === "needs_action" || 
                     userParticipant.response_status === "pending" ||
                     !userParticipant.response_status);

                  // Проверяем, является ли событие расписанием доступности
                  const isUnavailable = event.status === "unavailable";
                  const isAvailable = event.status === "available";
                  const isBookedSlot = event.status === "booked_slot";
                  
                  // Получаем цвет для тёмной темы (яркие градиенты)
                  const darkColor = isDark ? getDarkEventColor(event.id, layout?.column || 0) : null;
                  
                  return (
                    <div
                      key={event.id}
                      data-event-card
                      ref={(el) => {
                        if (el) {
                          eventCardRefs.current.set(event.id, el);
                        } else {
                          eventCardRefs.current.delete(event.id);
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Не открываем модальное окно для событий расписания доступности и забронированных слотов
                        if (!isUnavailable && !isAvailable && !isBookedSlot) {
                          handleCardClick(event);
                        }
                      }}
                      onMouseEnter={(e) => {
                        // Сразу выводим событие на передний план
                        setHoveredEventId(event.id);
                        
                        // Не показываем всплывающее окно для событий расписания доступности и забронированных слотов
                        if (!isUnavailable && !isAvailable && !isBookedSlot) {
                          const hasContent = (event.participants && event.participants.length > 0) ||
                                           (event.description && event.description.trim().length > 0) ||
                                           event.room_id;
                          if (hasContent) {
                            handleEventMouseEnter(event, e.currentTarget);
                          }
                        }
                      }}
                      onMouseLeave={() => {
                        // Сразу убираем с переднего плана
                        setHoveredEventId(null);
                        handleEventMouseLeave();
                      }}
                      draggable={Boolean(onEventMove) && !event.all_day && !isUnavailable && !isAvailable && !isBookedSlot}
                      onDragStart={(dragEvent) => {
                        if (!isUnavailable && !isAvailable && !isBookedSlot) {
                          handleDragStart(dragEvent, event);
                        }
                      }}
                      onDragEnd={handleDragEnd}
                      className={`absolute rounded-lg border p-1.5 text-xs shadow-md transition-all duration-200 ${
                        isUnavailable
                          ? isDark 
                            ? "cursor-default border-slate-600 z-5" 
                            : "cursor-default border-slate-300 bg-slate-100 z-5"
                          : isAvailable
                            ? isDark
                              ? "cursor-default border-emerald-500/50 z-15"
                              : "cursor-default border-green-300 bg-green-50 z-15"
                            : isBookedSlot
                              ? isDark
                                ? "cursor-default border-orange-500/50 z-10"
                                : "cursor-default border-orange-400 bg-orange-100 z-10"
                              : isStartingSoon 
                                ? isDark
                                  ? "event-vibrating border-2 cursor-pointer hover:shadow-xl hover:scale-[1.02]"
                                  : "event-vibrating border-lime-500 border-2 cursor-pointer hover:shadow-lg"
                                : needsAction
                                  ? isDark
                                    ? "border-2 border-[#fcd535] bg-white cursor-pointer hover:shadow-xl hover:scale-[1.02] animate-pulse-subtle"
                                    : "border-2 border-amber-400 bg-white cursor-pointer hover:shadow-lg"
                                  : isDark
                                    ? "border-l-[3px] cursor-pointer hover:shadow-xl hover:scale-[1.02]"
                                    : "border-slate-200 cursor-pointer hover:shadow-lg"
                      }`}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        left: positionStyles.left,
                        width: positionStyles.width,
                        zIndex: hoveredEventId === event.id ? 100 : positionStyles.zIndex,
                        // Тёмная тема: яркие градиенты (не для needsAction - у них белый фон)
                        ...(isDark && !isUnavailable && !isAvailable && !isBookedSlot && !needsAction && darkColor ? {
                          background: darkColor.bg,
                          borderColor: darkColor.border,
                          boxShadow: `0 4px 15px ${darkColor.border}30`,
                        } : {}),
                        // Светлая тема: оригинальные стили
                        ...(!isDark ? {
                          background: isUnavailable
                            ? "rgba(148, 163, 184, 0.3)"
                            : isAvailable
                              ? "rgba(34, 197, 94, 0.2)"
                              : isBookedSlot
                                ? "rgba(249, 115, 22, 0.2)"
                                : isStartingSoon 
                                  ? event.department_color 
                                    ? `${event.department_color}40`
                                    : `${accent}40`
                                  : needsAction
                                    ? "white"
                                    : isAccepted
                                      ? event.department_color
                                        ? (layout && layout.column > 0 
                                            ? getCascadeColorVariation(event.department_color, layout.column) 
                                            : getPastelColor(event.department_color))
                                        : (layout && layout.column > 0 
                                            ? getCascadeColorVariation(accent, layout.column) 
                                            : getPastelColor(accent))
                                      : event.department_color
                                        ? `${event.department_color}20`
                                        : `${accent}20`,
                          borderColor: event.department_color && !isUnavailable && !isAvailable && !isBookedSlot && !isStartingSoon && !needsAction
                            ? event.department_color
                            : undefined,
                        } : {}),
                        // Специальные состояния в тёмной теме
                        ...(isDark && isUnavailable ? {
                          background: "rgba(100, 116, 139, 0.3)",
                        } : {}),
                        ...(isDark && isAvailable ? {
                          background: "rgba(16, 185, 129, 0.2)",
                        } : {}),
                        ...(isDark && isBookedSlot ? {
                          background: "rgba(249, 115, 22, 0.25)",
                          borderColor: "#f97316",
                        } : {}),
                        ...(isDark && isStartingSoon && darkColor ? {
                          borderColor: "#fcd535",
                          background: "linear-gradient(135deg, rgba(252, 213, 53, 0.3) 0%, rgba(245, 158, 11, 0.2) 100%)",
                          boxShadow: "0 0 15px rgba(252, 213, 53, 0.4)",
                        } : {}),
                        ...(isDark && needsAction ? {
                          background: "#ffffff",
                          borderColor: "#fcd535",
                          boxShadow: "0 0 20px rgba(252, 213, 53, 0.6), 0 0 40px rgba(252, 213, 53, 0.3)",
                        } : {}),
                      }}
                    >
                      {/* Очень короткие события (< 30 мин): только название */}
                      {isVeryShort ? (
                        <div className="flex items-center justify-between h-full px-1.5 gap-1">
                          <p 
                            className={`text-xs font-semibold leading-tight truncate flex-1 min-w-0 ${
                              isUnavailable 
                                ? isDark ? "text-slate-400" : "text-slate-600" 
                                : isAvailable 
                                  ? isDark ? "text-emerald-400" : "text-green-700" 
                                  : isBookedSlot 
                                    ? isDark ? "text-orange-400" : "text-orange-700" 
                                    : needsAction
                                      ? "text-slate-800"
                                      : isDark 
                                        ? "text-white" 
                                        : "text-slate-900"
                            }`}
                            style={isDark && darkColor && !isUnavailable && !isAvailable && !isBookedSlot && !needsAction ? { color: darkColor.text } : undefined}
                          >
                            {isUnavailable ? "Недоступен" : isAvailable ? event.title : isBookedSlot ? event.title : event.title}
                          </p>
                          {/* Индикаторы для очень коротких событий */}
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            {event.attachments && event.attachments.length > 0 && (
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-500/80 flex items-center justify-center flex-shrink-0" title={`${event.attachments.length} вложение${event.attachments.length > 1 ? 'й' : ''}`}>
                                <svg className="w-1 h-1 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                            {event.comments_count !== undefined && event.comments_count > 0 && (
                              <div className="w-2.5 h-2.5 rounded-full bg-red-500/80 flex items-center justify-center flex-shrink-0" title={`${event.comments_count} комментари${event.comments_count === 1 ? 'й' : event.comments_count < 5 ? 'я' : 'ев'}`}>
                                <span className="text-[0.5rem] font-bold text-white leading-none">{event.comments_count}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : isShort ? (
                        /* Короткие события (30-59 мин): название + время */
                        <div className="flex flex-col justify-start h-full px-0.5 pt-0.5">
                          <div className="flex items-start justify-between gap-1">
                            <p 
                              className={`text-xs font-semibold truncate leading-none flex-1 min-w-0 ${
                                isUnavailable 
                                  ? isDark ? "text-slate-400" : "text-slate-600" 
                                  : isAvailable 
                                    ? isDark ? "text-emerald-400" : "text-green-700" 
                                    : isBookedSlot 
                                      ? isDark ? "text-orange-400" : "text-orange-700" 
                                      : needsAction
                                        ? "text-slate-800"
                                        : isDark 
                                          ? "text-white" 
                                          : "text-slate-900"
                              }`}
                              style={isDark && darkColor && !isUnavailable && !isAvailable && !isBookedSlot && !needsAction ? { color: darkColor.text } : undefined}
                            >
                              {isUnavailable ? "Недоступен" : isAvailable ? event.title : isBookedSlot ? event.title : event.title}
                            </p>
                            {/* Индикаторы для коротких событий */}
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              {event.attachments && event.attachments.length > 0 && (
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-500/80 flex items-center justify-center flex-shrink-0" title={`${event.attachments.length} вложение${event.attachments.length > 1 ? 'й' : ''}`}>
                                  <svg className="w-1 h-1 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              )}
                              {event.comments_count !== undefined && event.comments_count > 0 && (
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80 flex items-center justify-center flex-shrink-0" title={`${event.comments_count} комментари${event.comments_count === 1 ? 'й' : event.comments_count < 5 ? 'я' : 'ев'}`}>
                                  <span className="text-[0.5rem] font-bold text-white leading-none">{event.comments_count}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <p className={`text-[0.65rem] leading-none truncate mt-0.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                            {eventStart.toLocaleTimeString("ru-RU", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Europe/Moscow",
                            })}—{eventEnd.toLocaleTimeString("ru-RU", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Europe/Moscow",
                            })}
                          </p>
                        </div>
                      ) : (
                        /* Полный вид для длинных событий */
                        <>
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex-1 min-w-0">
                              <p 
                                className={`text-xs font-semibold leading-tight truncate ${
                                  isUnavailable 
                                    ? isDark ? "text-slate-400" : "text-slate-600" 
                                    : isAvailable 
                                      ? isDark ? "text-emerald-400" : "text-green-700" 
                                      : isBookedSlot 
                                        ? isDark ? "text-orange-400" : "text-orange-700" 
                                        : needsAction
                                          ? "text-slate-800"
                                          : isDark 
                                            ? "text-white" 
                                            : "text-slate-900"
                                }`}
                                style={isDark && darkColor && !isUnavailable && !isAvailable && !isBookedSlot && !needsAction ? { color: darkColor.text } : undefined}
                              >
                                {isUnavailable ? "Недоступен" : isAvailable ? event.title : isBookedSlot ? event.title : event.title}
                              </p>
                              {isAvailable && event.description && event.description !== event.title && (
                                <p className={`text-[0.65rem] leading-tight truncate mt-0.5 ${isDark ? "text-emerald-400/80" : "text-green-600"}`}>
                                  {event.description}
                                </p>
                              )}
                            </div>
                            {/* Индикаторы вложений и комментариев */}
                            <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
                              {event.attachments && event.attachments.length > 0 && (
                                <div className={`w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? "bg-blue-400" : "bg-blue-500/80"}`} title={`${event.attachments.length} вложение${event.attachments.length > 1 ? 'й' : ''}`}>
                                  <svg className="w-1.5 h-1.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              )}
                              {event.comments_count !== undefined && event.comments_count > 0 && (
                                <div className={`w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? "bg-red-400" : "bg-red-500/80"}`} title={`${event.comments_count} комментари${event.comments_count === 1 ? 'й' : event.comments_count < 5 ? 'я' : 'ев'}`}>
                                  <span className="text-[0.65rem] font-semibold text-white leading-none">{event.comments_count}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {isAvailable && event.description && event.description !== event.title && (
                            <p className={`text-[0.65rem] leading-tight truncate mt-0.5 ${isDark ? "text-emerald-400/80" : "text-green-600"}`}>
                              {event.description}
                            </p>
                          )}
                          {isBookedSlot && event.description && event.description !== event.title && (
                            <p className={`text-[0.65rem] leading-tight truncate mt-0.5 ${isDark ? "text-orange-400/80" : "text-orange-600"}`}>
                              {event.description}
                            </p>
                          )}
                          <p className={`text-[0.65rem] leading-tight ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                            {formatTimeInTimeZone(eventStart, MOSCOW_TIMEZONE)}{" "}
                            —{" "}
                            {formatTimeInTimeZone(eventEnd, MOSCOW_TIMEZONE)}
                          </p>
                          {event.room_id && (
                            <p className={`mt-0.5 text-[0.6rem] font-semibold uppercase tracking-wide truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              🏢 {rooms.find((r) => r.id === event.room_id)?.name || "Переговорка"}
                            </p>
                          )}
                          {event.location && !event.room_id && (
                            <p className={`mt-0.5 text-[0.6rem] uppercase tracking-wide truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              {event.location}
                            </p>
                          )}
                        </>
                      )}
                      {/* Индикатор что требуется ответ - только для длинных событий (>= 60 минут) */}
                      {!isVeryShort && !isShort && onUpdateParticipantStatus && currentUserEmail && event.participants && (() => {
                        const currentParticipant = event.participants?.find(
                          (p) => p.email === currentUserEmail
                        );
                        const needsAction = currentParticipant && 
                          (currentParticipant.response_status === "needs_action" || 
                           currentParticipant.response_status === "pending" ||
                           !currentParticipant.response_status);
                        
                        if (!needsAction) return null;
                        
                        return (
                          <div className="mt-0.5">
                            <div className={`text-[0.6rem] font-semibold flex items-center gap-1 ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isDark ? "bg-amber-400" : "bg-amber-500"}`} />
                              Требуется ответ
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
      
          {/* Всплывающее окно с деталями события - вынесено за пределы цикла по дням, чтобы показывалось только один раз */}
      {hoveredEvent && (
        <div
          className={`fixed z-50 rounded-xl border p-4 pointer-events-auto overflow-hidden flex flex-col ${
            isDark 
              ? "border-[#2b3139] bg-[#181a20] shadow-[0_10px_40px_rgba(0,0,0,0.5)]" 
              : "border-slate-200 bg-white shadow-[0_10px_40px_rgba(15,23,42,0.2)]"
          }`}
          style={{
            top: `${hoveredEvent.position.top}px`,
            left: `${hoveredEvent.position.left}px`,
            width: "320px",
            maxHeight: "500px",
            maxWidth: "calc(100vw - 20px)",
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          {/* Заголовок события */}
          <div className={`mb-3 border-b pb-3 flex-shrink-0 ${isDark ? "border-[#2b3139]" : "border-slate-100"}`}>
            <p className={`text-sm font-semibold mb-1 line-clamp-2 break-words ${isDark ? "text-[#eaecef]" : "text-slate-900"}`}>{hoveredEvent.event.title}</p>
            <p className={`text-xs ${isDark ? "text-[#848e9c]" : "text-slate-500"}`}>
              {formatTimeInTimeZone(parseUTC(hoveredEvent.event.starts_at), MOSCOW_TIMEZONE)}{" "}
              —{" "}
              {formatTimeInTimeZone(parseUTC(hoveredEvent.event.ends_at), MOSCOW_TIMEZONE)}
            </p>
          </div>
          
          {/* Кнопки ответа на приглашение */}
          {onUpdateParticipantStatus && currentUserEmail && hoveredEvent.event.participants && (() => {
            const currentParticipant = hoveredEvent.event.participants.find(
              (p) => p.email === currentUserEmail
            );
            const needsAction = currentParticipant && 
              (currentParticipant.response_status === "needs_action" || 
               currentParticipant.response_status === "pending" ||
               !currentParticipant.response_status);
            
            if (!needsAction) return null;
            
            return (
              <div className={`mb-3 border-b pb-3 flex-shrink-0 ${isDark ? "border-[#2b3139]" : "border-slate-100"}`}>
                <p className={`text-xs font-semibold mb-2 ${isDark ? "text-[#eaecef]" : "text-slate-700"}`}>Ответить на приглашение</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (currentParticipant) {
                        handleUpdateParticipantStatus(hoveredEvent.event, currentParticipant.user_id, "accepted");
                        setHoveredEvent(null);
                      }
                    }}
                    className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition flex items-center justify-center gap-2 ${
                      isDark 
                        ? "bg-[#0ecb81] hover:bg-[#1ad48a] text-white shadow-[0_0_15px_rgba(14,203,129,0.4)]" 
                        : "bg-gradient-to-r from-lime-500 to-emerald-500 hover:from-lime-600 hover:to-emerald-600 text-white shadow-sm"
                    }`}
                  >
                    <span className="text-base">✓</span> Принять
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (currentParticipant) {
                        handleUpdateParticipantStatus(hoveredEvent.event, currentParticipant.user_id, "declined");
                        setHoveredEvent(null);
                      }
                    }}
                    className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition flex items-center justify-center gap-2 ${
                      isDark 
                        ? "bg-[#f6465d] hover:bg-[#ff5a6e] text-white shadow-[0_0_15px_rgba(246,70,93,0.4)]" 
                        : "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-sm"
                    }`}
                  >
                    <span className="text-base">✕</span> Отклонить
                  </button>
                </div>
              </div>
            );
          })()}
          
          {/* Описание события */}
          {hoveredEvent.event.description && hoveredEvent.event.description.trim().length > 0 && (
            <div className={`mb-3 border-b pb-3 flex-shrink-0 ${isDark ? "border-[#2b3139]" : "border-slate-100"}`}>
              <p className={`text-xs font-semibold mb-1.5 ${isDark ? "text-[#eaecef]" : "text-slate-700"}`}>Описание</p>
              <p className={`text-xs leading-relaxed line-clamp-3 break-words ${isDark ? "text-[#848e9c]" : "text-slate-600"}`}>
                {hoveredEvent.event.description}
              </p>
            </div>
          )}
          
          {/* Переговорка */}
          {hoveredEvent.event.room_id && (
            <div className={`mb-3 border-b pb-3 flex-shrink-0 ${isDark ? "border-[#2b3139]" : "border-slate-100"}`}>
              <p className={`text-xs font-semibold mb-1.5 ${isDark ? "text-[#eaecef]" : "text-slate-700"}`}>Переговорка</p>
              <div className={`flex items-center gap-2 rounded-lg border p-2 ${
                isDark ? "border-[#2b3139] bg-[#1e2329]" : "border-slate-100 bg-slate-50"
              }`}>
                <span className="text-lg flex-shrink-0">🏢</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold truncate ${isDark ? "text-[#eaecef]" : "text-slate-900"}`}>
                    {rooms.find((r) => r.id === hoveredEvent.event.room_id)?.name || "Переговорка"}
                  </p>
                  {rooms.find((r) => r.id === hoveredEvent.event.room_id)?.location && (
                    <p className={`text-[0.65rem] mt-0.5 truncate ${isDark ? "text-[#848e9c]" : "text-slate-500"}`}>
                      {rooms.find((r) => r.id === hoveredEvent.event.room_id)?.location}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Кнопка для перехода по ссылке на онлайн встречу */}
          {hoveredEvent.event.room_online_meeting_url && (
            <a
              href={hoveredEvent.event.room_online_meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:from-blue-600 hover:to-indigo-700 flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Присоединиться к встрече
            </a>
          )}
          
          {/* Участники */}
          {hoveredEvent.event.participants && hoveredEvent.event.participants.length > 0 ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="mb-2 flex-shrink-0">
                <p className={`text-xs font-semibold mb-2 ${isDark ? "text-[#eaecef]" : "text-slate-700"}`}>
                  Участники ({hoveredEvent.event.participants.length})
                </p>
                {/* Аватарки участников в кружочках - показываем максимум 12 */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {hoveredEvent.event.participants.slice(0, 12).map((participant) => {
                    const user = users.find((u) => u.id === participant.user_id || u.email === participant.email);
                    const avatarUrl = user?.avatar_url;
                    const displayName = participant.full_name || participant.email.split("@")[0];
                    const initials = displayName.charAt(0).toUpperCase();
                    
                    return (
                      <div
                        key={participant.user_id || participant.email}
                        className="relative group/avatar"
                        title={displayName}
                      >
                        {avatarUrl ? (
                          <img
                            src={avatarUrl.startsWith('http') ? avatarUrl : `${apiBaseUrl}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`}
                            alt={displayName}
                            className={`w-8 h-8 rounded-full object-cover border-2 shadow-sm hover:scale-110 transition-transform cursor-pointer ${
                              isDark ? "border-[#2b3139]" : "border-white"
                            }`}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                              if (fallback) fallback.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shadow-sm hover:scale-110 transition-transform cursor-pointer ${avatarUrl ? 'hidden' : ''} ${
                          isDark 
                            ? "bg-gradient-to-br from-slate-600 to-slate-700 border-[#2b3139]" 
                            : "bg-gradient-to-br from-slate-300 to-slate-400 border-white"
                        }`}>
                          <span className="text-[0.65rem] font-semibold text-white">
                            {initials}
                          </span>
                        </div>
                        {/* Статус участника (цветная точка) */}
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                            participant.response_status === "accepted"
                              ? "bg-lime-500"
                              : participant.response_status === "declined"
                              ? "bg-red-500"
                              : "bg-amber-500"
                          }`}
                          title={
                            participant.response_status === "accepted"
                              ? "Принял"
                              : participant.response_status === "declined"
                              ? "Отклонил"
                              : "Ожидает ответа"
                          }
                        />
                      </div>
                    );
                  })}
                  {hoveredEvent.event.participants.length > 12 ? (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shadow-sm ${
                      isDark ? "bg-[#2b3139] border-[#2b3139]" : "bg-slate-200 border-white"
                    }`}>
                      <span className={`text-[0.65rem] font-semibold ${isDark ? "text-[#848e9c]" : "text-slate-600"}`}>
                        +{hoveredEvent.event.participants.length - 12}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                {hoveredEvent.event.participants.slice(0, 8).map((participant) => {
                  const statusLabels: Record<string, string> = {
                    accepted: "Принял",
                    declined: "Отклонил",
                    pending: "Нет ответа",
                    needs_action: "Нет ответа",
                  };
                  const statusColors: Record<string, string> = isDark ? {
                    accepted: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                    declined: "bg-red-500/20 text-red-400 border-red-500/30",
                    pending: "bg-slate-600/30 text-slate-400 border-slate-600",
                    needs_action: "bg-slate-600/30 text-slate-400 border-slate-600",
                  } : {
                    accepted: "bg-lime-100 text-lime-700 border-lime-300",
                    declined: "bg-red-100 text-red-700 border-red-300",
                    pending: "bg-slate-100 text-slate-600 border-slate-300",
                    needs_action: "bg-slate-100 text-slate-600 border-slate-300",
                  };
                  const status = participant.response_status || "pending";
                  const orgAbbr = getUserOrganizationAbbreviation ? getUserOrganizationAbbreviation(participant.user_id) : "";
                  
                  return (
                    <div
                      key={participant.user_id}
                      className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${
                        isDark ? "border-[#2b3139] bg-[#1e2329]" : "border-slate-100 bg-slate-50"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-xs font-semibold truncate ${isDark ? "text-[#eaecef]" : "text-slate-900"}`}>
                            {participant.full_name || participant.email}
                          </p>
                          {orgAbbr ? (
                            <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold flex-shrink-0 ${
                              isDark ? "bg-[#2b3139] text-[#848e9c]" : "bg-slate-200 text-slate-700"
                            }`}>
                              {orgAbbr}
                            </span>
                          ) : null}
                        </div>
                        {participant.full_name ? (
                          <p className={`text-[0.65rem] truncate ${isDark ? "text-[#848e9c]" : "text-slate-500"}`}>
                            {participant.email}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold flex-shrink-0 ${
                          statusColors[status] || statusColors.pending
                        }`}
                      >
                        {statusLabels[status] || statusLabels.pending}
                      </span>
                    </div>
                  );
                })}
                {hoveredEvent.event.participants.length > 8 ? (
                  <p className={`text-[0.65rem] text-center pt-1 ${isDark ? "text-[#848e9c]" : "text-slate-500"}`}>
                    и ещё {hoveredEvent.event.participants.length - 8} участников
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </React.Fragment>
  );
}

