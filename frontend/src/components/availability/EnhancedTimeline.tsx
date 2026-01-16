"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import type { TimelineRowData } from "@/types/common.types";
import type { EventRecord } from "@/types/event.types";
import { inputToDate, parseUTC, getTimeInTimeZone, formatTimeInTimeZone, MOSCOW_TIMEZONE } from "@/lib/utils/dateUtils";
import { WORKDAY_START_HOUR, WORKDAY_END_HOUR, SLOT_DURATION_MINUTES, MINUTES_IN_DAY } from "@/lib/constants";

interface EnhancedTimelineProps {
  rows: TimelineRowData[];
  referenceDate: Date;
  selectedStart: string;
  selectedEnd: string;
  isAllDay: boolean;
  errorMessage: string | null;
  conflictMap?: Map<string, Array<{ start: Date; end: Date }>>;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  users?: Array<{ id: string; email: string; avatar_url: string | null; full_name: string | null }>;
  organizations?: Array<{ id: string; name: string; slug: string }>;
  departments?: Array<{ id: string; name: string }>;
  apiBaseUrl?: string;
  onTimeRangeSelect?: (start: Date, end: Date) => void;
  onRemoveParticipant?: (participantId: string) => void;
  accentColor?: string; // Цвет календаря для занятого времени
  events?: EventRecord[]; // События из основного массива для отображения как в основной сетке
  rooms?: Array<{ id: string; name: string }>; // Переговорки для отображения названий
  currentUserEmail?: string; // Email текущего пользователя для определения статуса участия
  editingEventId?: string; // ID редактируемого события (чтобы разрешить выделение его слотов)
}

export function EnhancedTimeline({
  rows,
  referenceDate,
  selectedStart,
  selectedEnd,
  isAllDay,
  errorMessage,
  conflictMap,
  getUserOrganizationAbbreviation,
  users = [],
  organizations = [],
  departments = [],
  apiBaseUrl = "",
  onTimeRangeSelect,
  onRemoveParticipant,
  accentColor = "#6366f1", // По умолчанию indigo-500
  events = [], // События из основного массива
  rooms = [], // Переговорки
  currentUserEmail, // Email текущего пользователя
  editingEventId, // ID редактируемого события
}: EnhancedTimelineProps) {
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [currentSelectionSlot, setCurrentSelectionSlot] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  const selectionRange = useMemo(() => {
    // Парсим даты из формы - они в формате "YYYY-MM-DDTHH:mm" и представляют московское время
    // Нужно интерпретировать их как московское время, а не локальное
    let start: Date | null = null;
    let end: Date | null = null;
    
    if (selectedStart) {
      const [datePart, timePart] = selectedStart.split('T');
      if (datePart) {
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour = 0, minute = 0] = timePart ? timePart.split(':').map(Number) : [0, 0];
        const pad = (n: number) => String(n).padStart(2, '0');
        // Создаем дату в московском времени
        const moscowDateStr = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+03:00`;
        start = new Date(moscowDateStr);
      }
    }
    
    if (selectedEnd) {
      const [datePart, timePart] = selectedEnd.split('T');
      if (datePart) {
        const [year, month, day] = datePart.split('-').map(Number);
        if (isAllDay && !timePart) {
          // Для allDay используем конец дня
          const pad = (n: number) => String(n).padStart(2, '0');
          const moscowDateStr = `${year}-${pad(month)}-${pad(day)}T23:59:59+03:00`;
          end = new Date(moscowDateStr);
        } else {
          const [hour = 0, minute = 0] = timePart ? timePart.split(':').map(Number) : [0, 0];
          const pad = (n: number) => String(n).padStart(2, '0');
          const moscowDateStr = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+03:00`;
          end = new Date(moscowDateStr);
        }
      }
    }
    
    return { start, end };
  }, [selectedEnd, selectedStart, isAllDay]);

  // Получаем базовую дату в московском времени
  const baseDate = useMemo(() => {
    let dateToUse: Date;
    if (selectionRange.start) {
      // selectionRange.start уже в московском времени (создан с +03:00)
      dateToUse = selectionRange.start;
    } else {
      // referenceDate передается из EventModalEnhanced как viewDate
      // Он уже должен быть в московском времени
      dateToUse = referenceDate;
    }
    // Получаем компоненты даты в московском времени
    const moscowComponents = getTimeInTimeZone(dateToUse, MOSCOW_TIMEZONE);
    // Создаем дату в московском времени (полночь для начала дня)
    const pad = (n: number) => String(n).padStart(2, '0');
    const moscowDateStr = `${moscowComponents.year}-${pad(moscowComponents.month + 1)}-${pad(moscowComponents.day)}T00:00:00+03:00`;
    const moscowDate = new Date(moscowDateStr);
    // Проверяем, что дата правильная
    const checkMoscow = getTimeInTimeZone(moscowDate, MOSCOW_TIMEZONE);
    if (checkMoscow.year === moscowComponents.year && checkMoscow.month === moscowComponents.month && checkMoscow.day === moscowComponents.day) {
      return moscowDate;
    }
    // Если не совпало, создаем через UTC (полночь МСК = 21:00 предыдущего дня UTC)
    return new Date(Date.UTC(moscowComponents.year, moscowComponents.month, moscowComponents.day, 21, 0, 0));
  }, [referenceDate, selectionRange.start]);

  // Создаем слоты времени - метки будут отображаться в московском времени
  const timeSlots = useMemo(() => {
    const totalSlots =
      ((WORKDAY_END_HOUR - WORKDAY_START_HOUR) * 60) / SLOT_DURATION_MINUTES;
    return Array.from({ length: totalSlots }, (_, index) => {
      const totalMinutes =
        WORKDAY_START_HOUR * 60 + index * SLOT_DURATION_MINUTES;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      // Метка времени - просто форматирование, будет использоваться в московском времени
      const label = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      return { index, hour, minute, label };
    });
  }, []);

  const resourceRows = useMemo(
    () => rows.filter((row) => row.id !== "placeholder"),
    [rows],
  );

  // Фильтруем события для дня и ресурса (используя ту же логику, что и в WeekView)
  const getFilteredEventsForRow = useCallback((row: TimelineRowData): EventRecord[] => {
    if (!events || events.length === 0) return [];

    // Получаем компоненты базовой даты в московском времени
    const dayMoscow = getTimeInTimeZone(baseDate, MOSCOW_TIMEZONE);
    const dayStartKey = dayMoscow.year * 10000 + dayMoscow.month * 100 + dayMoscow.day;
    const dayEndKey = dayStartKey + 1; // Следующий день

    // Фильтруем события для этого дня
    const dayEvents = events.filter((event) => {
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      
      // Получаем компоненты времени события в московском времени
      const eventStartMoscow = getTimeInTimeZone(eventStart, MOSCOW_TIMEZONE);
      const eventEndMoscow = getTimeInTimeZone(eventEnd, MOSCOW_TIMEZONE);
      
      // Создаем ключи дат для сравнения: YYYYMMDD
      const eventStartKey = eventStartMoscow.year * 10000 + eventStartMoscow.month * 100 + eventStartMoscow.day;
      const eventEndKey = eventEndMoscow.year * 10000 + eventEndMoscow.month * 100 + eventEndMoscow.day;
      
      // Событие попадает в день, если его начало до следующего дня и конец после начала текущего дня
      if (!(eventStartKey < dayEndKey && eventEndKey >= dayStartKey)) {
        return false;
      }

      // Фильтруем по ресурсу (участник или переговорка)
      if (row.type === "participant") {
        // Для участника: событие должно включать этого участника (и он не должен быть declined)
        const participantId = row.id.replace("participant-", "");
        const hasParticipant = event.participants?.some((p) => {
          if (p.user_id === participantId) {
            // Исключаем события, где участник отклонил
            return p.response_status !== "declined";
          }
          return false;
        });
        if (!hasParticipant) return false;
      } else if (row.type === "room") {
        // Для переговорки: событие должно быть назначено на эту переговорку
        const roomId = row.id.replace("room-", "");
        if (event.room_id !== roomId) return false;
      }

      // Исключаем события, где текущий пользователь отклонил (если он участник)
      if (currentUserEmail && event.participants) {
        const userParticipant = event.participants.find((p) => p.email === currentUserEmail);
        if (userParticipant && userParticipant.response_status === "declined") {
          return false;
        }
      }

      return true;
    });

    return dayEvents;
  }, [events, baseDate, currentUserEmail]);

  if (resourceRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
        <svg className="h-12 w-12 text-slate-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm font-medium text-slate-700">Добавьте участников или переговорку</p>
        <p className="mt-1 text-xs text-slate-500">чтобы увидеть таймлайн занятости</p>
      </div>
    );
  }

  // Создаем время слота в московском времени
  // Создаем функцию для вычисления времени слота в московском времени
  const buildSlotTimes = useCallback((slotIndex: number) => {
    const slot = timeSlots[slotIndex];
    // Получаем компоненты базовой даты в московском времени
    const baseMoscow = getTimeInTimeZone(baseDate, MOSCOW_TIMEZONE);
    // Создаем дату начала слота в московском времени
    const pad = (n: number) => String(n).padStart(2, '0');
    const slotStartStr = `${baseMoscow.year}-${pad(baseMoscow.month + 1)}-${pad(baseMoscow.day)}T${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}:00+03:00`;
    const slotStart = new Date(slotStartStr);
    
    // Вычисляем время окончания слота в московском времени
    const totalMinutes = slot.hour * 60 + slot.minute + SLOT_DURATION_MINUTES;
    const endHour = Math.floor(totalMinutes / 60);
    const endMinute = totalMinutes % 60;
    const slotEndStr = `${baseMoscow.year}-${pad(baseMoscow.month + 1)}-${pad(baseMoscow.day)}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00+03:00`;
    const slotEnd = new Date(slotEndStr);
    
    return { slotStart, slotEnd };
  }, [baseDate, timeSlots]);

  // Упрощенная логика: только два состояния - занят или доступен
  // Используем события из основного массива events (как в WeekView)
  const getSlotState = useCallback((
    row: TimelineRowData,
    slotIndex: number,
  ): "free" | "busy" => {
    const { slotStart, slotEnd } = buildSlotTimes(slotIndex);

    // Получаем события для этого ресурса и дня из основного массива
    const rowEvents = getFilteredEventsForRow(row);
    
    // Для участников также проверяем их доступность (события из ВСЕХ их календарей)
    const availabilityEvents = row.type === "participant" && row.availability ? row.availability : [];

    // Проверяем, есть ли событие в этом слоте (из основного календаря)
    const eventInSlot = rowEvents.find((event) => {
      // Исключаем текущее редактируемое событие из проверки занятости
      if (editingEventId && event.id === editingEventId) {
        return false;
      }
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      return eventStart < slotEnd && eventEnd > slotStart;
    });
    
    // Проверяем, есть ли событие в этом слоте (из доступности участника)
    const availabilityEventInSlot = availabilityEvents.find((event) => {
      // Исключаем текущее редактируемое событие из проверки занятости
      if (editingEventId && event.id === editingEventId) {
        return false;
      }
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      return eventStart < slotEnd && eventEnd > slotStart;
    });

    // Если есть событие в основном календаре (кроме available статуса), слот занят
    if (eventInSlot && eventInSlot.status !== "available") {
      return "busy";
    }
    
    // Если есть событие в доступности участника (кроме available статуса), слот занят
    if (availabilityEventInSlot && availabilityEventInSlot.status !== "available") {
      return "busy";
    }
    
    // Иначе слот доступен
    return "free";
  }, [buildSlotTimes, getFilteredEventsForRow, editingEventId]);

  const isSlotBusy = useCallback((slotIndex: number): boolean => {
    if (slotIndex < 0 || slotIndex >= timeSlots.length) return true;
    
    return resourceRows.some((row) => {
      const state = getSlotState(row, slotIndex);
      return state === "busy";
    });
  }, [resourceRows, getSlotState]);

  const handleSlotMouseDown = useCallback((slotIndex: number, e: React.MouseEvent) => {
    if (!onTimeRangeSelect) return;
    
    if (isSlotBusy(slotIndex)) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    setHasMoved(false);
    setSelectionStart(slotIndex);
    setCurrentSelectionSlot(slotIndex);
    setMouseDownPos({ x: e.clientX, y: e.clientY });
    setIsSelecting(true);
  }, [onTimeRangeSelect, isSlotBusy]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isSelecting || selectionStart === null || !timelineRef.current || !mouseDownPos) return;
    
    const moveDistance = Math.abs(e.clientX - mouseDownPos.x) + Math.abs(e.clientY - mouseDownPos.y);
    if (moveDistance < 10) {
      setCurrentSelectionSlot(selectionStart);
      return;
    }
    
    setHasMoved(true);
    
    const timeSlotsContainer = timelineRef.current.querySelector('[style*="grid-template-columns"]') as HTMLElement;
    if (!timeSlotsContainer) return;
    
    const slotsRect = timeSlotsContainer.getBoundingClientRect();
    const relativeX = e.clientX - slotsRect.left;
    
    const computedStyle = window.getComputedStyle(timeSlotsContainer);
    const gridTemplateColumns = computedStyle.gridTemplateColumns;
    
    let firstColumnWidth = 180;
    if (gridTemplateColumns) {
      const parts = gridTemplateColumns.split(' ');
      if (parts.length > 0) {
        const firstCol = parts[0];
        const match = firstCol.match(/(\d+)px/);
        if (match) {
          firstColumnWidth = parseInt(match[1], 10);
        }
      }
    }
    
    const slotsAreaWidth = slotsRect.width - firstColumnWidth;
    const slotWidth = slotsAreaWidth / timeSlots.length;
    const slotAreaX = relativeX - firstColumnWidth;
    let targetSlot = Math.floor(slotAreaX / slotWidth);
    
    if (targetSlot < 0) targetSlot = 0;
    if (targetSlot >= timeSlots.length) targetSlot = timeSlots.length - 1;
    
    const direction = targetSlot > selectionStart ? 1 : -1;
    let finalSlot = targetSlot;
    
    if (direction > 0) {
      for (let i = selectionStart; i <= targetSlot; i++) {
        if (isSlotBusy(i)) {
          finalSlot = Math.max(selectionStart, i - 1);
          break;
        }
      }
    } else {
      for (let i = selectionStart; i >= targetSlot; i--) {
        if (isSlotBusy(i)) {
          finalSlot = Math.min(selectionStart, i + 1);
          break;
        }
      }
    }
    
    if (!isSlotBusy(finalSlot)) {
      setCurrentSelectionSlot(finalSlot);
    } else {
      setCurrentSelectionSlot(selectionStart);
    }
  }, [isSelecting, selectionStart, timeSlots.length, isSlotBusy, mouseDownPos]);

  const handleMouseUp = useCallback(() => {
    if (!isSelecting || selectionStart === null || !onTimeRangeSelect) {
      setIsSelecting(false);
      setSelectionStart(null);
      setCurrentSelectionSlot(null);
      setHasMoved(false);
      setMouseDownPos(null);
      return;
    }

    const endSlot = currentSelectionSlot !== null ? currentSelectionSlot : selectionStart;
    
    if (endSlot >= 0 && endSlot < timeSlots.length) {
      const startSlot = Math.min(selectionStart, endSlot);
      const finalEndSlot = Math.max(selectionStart, endSlot);
      
      if (!hasMoved) {
        const { slotStart, slotEnd } = buildSlotTimes(startSlot);
        // Проверяем границы дня в московском времени
        const baseMoscow = getTimeInTimeZone(baseDate, MOSCOW_TIMEZONE);
        const pad = (n: number) => String(n).padStart(2, '0');
        const dayStartStr = `${baseMoscow.year}-${pad(baseMoscow.month + 1)}-${pad(baseMoscow.day)}T08:00:00+03:00`;
        const dayEndStr = `${baseMoscow.year}-${pad(baseMoscow.month + 1)}-${pad(baseMoscow.day)}T20:00:00+03:00`;
        const dayStart = new Date(dayStartStr);
        const dayEnd = new Date(dayEndStr);
        
        if (slotStart >= dayStart && slotEnd <= dayEnd) {
          onTimeRangeSelect(slotStart, slotEnd);
        }
      } else {
        const { slotStart } = buildSlotTimes(startSlot);
        const { slotEnd } = buildSlotTimes(finalEndSlot);
        
        // Проверяем границы дня в московском времени
        const baseMoscow = getTimeInTimeZone(baseDate, MOSCOW_TIMEZONE);
        const pad = (n: number) => String(n).padStart(2, '0');
        const dayStartStr = `${baseMoscow.year}-${pad(baseMoscow.month + 1)}-${pad(baseMoscow.day)}T08:00:00+03:00`;
        const dayEndStr = `${baseMoscow.year}-${pad(baseMoscow.month + 1)}-${pad(baseMoscow.day)}T20:00:00+03:00`;
        const dayStart = new Date(dayStartStr);
        const dayEnd = new Date(dayEndStr);
        
        if (slotStart >= dayStart && slotEnd <= dayEnd) {
          onTimeRangeSelect(slotStart, slotEnd);
        }
      }
    }
    
    setIsSelecting(false);
    setSelectionStart(null);
    setCurrentSelectionSlot(null);
    setHasMoved(false);
    setMouseDownPos(null);
  }, [isSelecting, selectionStart, currentSelectionSlot, hasMoved, onTimeRangeSelect, timeSlots, baseDate]);

  useEffect(() => {
    if (isSelecting) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isSelecting, handleMouseMove, handleMouseUp]);

  const templateColumns = useMemo(
    () => `150px repeat(${timeSlots.length}, minmax(4px, 1fr))`, // Компактные ячейки для 10-минутных слотов
    [timeSlots.length],
  );

  return (
    <div className="space-y-3">
      {/* Легенда - легкий воздушный дизайн */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-8 rounded border border-rose-200 bg-rose-100" />
          <span className="text-[0.7rem] font-medium text-slate-600">Занято</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-8 rounded border border-emerald-200 bg-emerald-50" />
          <span className="text-[0.7rem] font-medium text-slate-600">Свободно</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-8 rounded border border-blue-300 bg-blue-100" />
          <span className="text-[0.7rem] font-medium text-slate-600">Выбрано</span>
        </div>
      </div>

      {/* Легкий воздушный таймлайн */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white" ref={timelineRef} style={{ maxHeight: "400px" }}>
        <div className="min-w-full space-y-1.5 p-2">
          {/* Заголовок времени */}
          <div
            className="grid rounded border-b border-slate-200 bg-slate-50 p-1.5"
            style={{ gridTemplateColumns: templateColumns }}
          >
            <div className="px-2 py-1.5 text-[0.7rem] font-semibold text-slate-600 uppercase tracking-wider">Ресурс</div>
            {timeSlots.map((slot) => {
              // Создаем дату для слота в московском времени для правильного отображения времени
              const slotDate = buildSlotTimes(slot.index).slotStart;
              const moscowTime = getTimeInTimeZone(slotDate, MOSCOW_TIMEZONE);
              const timeLabel = `${String(moscowTime.hour).padStart(2, "0")}:${String(moscowTime.minute).padStart(2, "0")}`;
              
              // Показываем метки времени каждые 30 минут для читаемости при 10-минутных слотах
              return slot.minute === 0 || slot.minute === 30 ? (
                <div key={slot.index} className="text-center text-[0.65rem] font-semibold text-slate-600 py-2">
                  {timeLabel}
                </div>
              ) : (
                <div key={slot.index} />
              );
            })}
          </div>

          {/* Строки ресурсов - легкие воздушные */}
          {resourceRows.map((row) => {
            const rowConflictSlots = conflictMap?.get(row.id) ?? [];
            const hasConflict = rowConflictSlots.length > 0;
            
            return (
              <div
                key={row.id}
                className={`grid rounded border transition-all ${
                  hasConflict
                    ? "border-amber-200 bg-amber-50/50"
                    : "border-slate-200 bg-white hover:bg-slate-50/50"
                }`}
                style={{ gridTemplateColumns: templateColumns }}
              >
                {/* Название ресурса */}
                <div className="flex items-center gap-2 rounded px-2 py-1.5 bg-white">
                  {row.avatarUrl ? (
                    <img
                      src={apiBaseUrl && !row.avatarUrl.startsWith("http") ? `${apiBaseUrl}${row.avatarUrl}` : row.avatarUrl}
                      alt={row.label}
                      className="h-6 w-6 rounded-full object-cover border border-slate-200 flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                        if (fallback) {
                          fallback.style.display = "flex";
                        }
                      }}
                    />
                  ) : null}
                  <div 
                    className={`h-6 w-6 rounded-full flex items-center justify-center text-[0.65rem] font-semibold text-white flex-shrink-0 ${
                      row.type === "room" 
                        ? "bg-blue-500" 
                        : "bg-indigo-500"
                    } ${row.avatarUrl ? "hidden" : ""}`}
                  >
                    {row.type === "room" ? "🏢" : row.label[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[0.7rem] font-semibold truncate ${
                      hasConflict ? "text-amber-900" : "text-slate-900"
                    }`}>
                      {row.label}
                    </p>
                    {row.meta && (
                      <p className={`text-[0.6rem] truncate mt-0.5 ${
                        hasConflict ? "text-amber-700" : "text-slate-500"
                      }`}>
                        {row.meta}
                      </p>
                    )}
                  </div>
                  {hasConflict && (
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full text-[0.6rem] font-bold bg-amber-400 text-amber-900 flex-shrink-0" title="Конфликт">
                      !
                    </span>
                  )}
                </div>

                {/* Слоты времени */}
                {(() => {
                  // Мемоизируем события для строки один раз, а не для каждого слота (оптимизация производительности)
                  const rowEvents = getFilteredEventsForRow(row);
                  const availabilityEvents = row.type === "participant" && row.availability ? row.availability : [];
                  
                  return timeSlots.map((slot) => {
                    const state = getSlotState(row, slot.index);
                    const { slotStart, slotEnd } = buildSlotTimes(slot.index);
                    
                    // Ищем событие в этом слоте (из основного календаря)
                    const eventInSlot = rowEvents.find((event) => {
                      const eventStart = parseUTC(event.starts_at);
                      const eventEnd = parseUTC(event.ends_at);
                      return eventStart < slotEnd && eventEnd > slotStart;
                    });
                    
                    // Ищем событие в доступности участника
                    const availabilityEventInSlot = availabilityEvents.find((event) => {
                      const eventStart = parseUTC(event.starts_at);
                      const eventEnd = parseUTC(event.ends_at);
                      return eventStart < slotEnd && eventEnd > slotStart;
                    });

                    // Получаем время слота в московском времени для tooltip
                    const slotMoscow = getTimeInTimeZone(slotStart, MOSCOW_TIMEZONE);
                    const slotTimeLabel = `${String(slotMoscow.hour).padStart(2, "0")}:${String(slotMoscow.minute).padStart(2, "0")}`;

                    // Проверяем, попадает ли слот в выбранный диапазон
                    const isSelected = selectionRange.start && selectionRange.end && 
                      slotStart >= selectionRange.start && slotEnd <= selectionRange.end;

                    // Проверяем, находится ли слот в процессе выделения (предварительное выделение)
                    const isBeingSelected = isSelecting && 
                      selectionStart !== null && 
                      currentSelectionSlot !== null && 
                      slot.index >= Math.min(selectionStart, currentSelectionSlot) && 
                      slot.index <= Math.max(selectionStart, currentSelectionSlot);

                    // Приоритет для tooltip: событие из основного календаря, затем из доступности
                    const displayEvent = eventInSlot || availabilityEventInSlot;
                    
                    // Формируем tooltip для события с временем в московском времени
                    let tooltipText = "";
                    if (displayEvent) {
                      const eventStart = parseUTC(displayEvent.starts_at);
                      const eventEnd = parseUTC(displayEvent.ends_at);
                      const eventStartMoscow = getTimeInTimeZone(eventStart, MOSCOW_TIMEZONE);
                      const eventEndMoscow = getTimeInTimeZone(eventEnd, MOSCOW_TIMEZONE);
                      const eventStartTime = `${String(eventStartMoscow.hour).padStart(2, "0")}:${String(eventStartMoscow.minute).padStart(2, "0")}`;
                      const eventEndTime = `${String(eventEndMoscow.hour).padStart(2, "0")}:${String(eventEndMoscow.minute).padStart(2, "0")}`;
                      tooltipText = `${displayEvent.title} (${eventStartTime} - ${eventEndTime})`;
                    } else {
                      tooltipText = state === "busy" ? "Занято" : isSelected ? "Выбрано" : isBeingSelected ? "Выделяется..." : "Доступно - кликните для выбора времени";
                    }

                  // Легкая воздушная цветовая схема с компактными ячейками
                  let slotClassName = "h-6 rounded transition-all duration-75 ease-out relative overflow-hidden group ";
                  
                  if (state === "busy") {
                    // Занято - мягкий розовый
                    slotClassName += "bg-rose-100 border border-rose-200 cursor-not-allowed hover:bg-rose-150";
                  } else if (isBeingSelected) {
                    // Предварительное выделение - яркий голубой с пунктирной рамкой
                    slotClassName += "bg-indigo-100 border-2 border-dashed border-indigo-400 cursor-pointer";
                  } else if (isSelected) {
                    // Выбранное - мягкий голубой
                    slotClassName += "bg-blue-100 border-2 border-blue-300 cursor-pointer hover:bg-blue-150";
                  } else {
                    // Свободное - мягкий зеленый
                    slotClassName += "bg-emerald-50 border border-emerald-200 cursor-pointer hover:bg-emerald-100 hover:border-emerald-300 active:bg-emerald-150";
                  }

                  return (
                    <div
                      key={`${row.id}-${slot.index}`}
                      className={slotClassName}
                      onMouseDown={(e) => {
                        if (state === "busy") {
                          e.preventDefault();
                          return;
                        }
                        if (!isSlotBusy(slot.index) && onTimeRangeSelect) {
                          handleSlotMouseDown(slot.index, e);
                        }
                      }}
                      title={tooltipText}
                    />
                  );
                  });
                })()}
              </div>
            );
          })}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-gradient-to-r from-red-50 to-red-100 p-3 text-xs text-red-700 shadow-sm">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
