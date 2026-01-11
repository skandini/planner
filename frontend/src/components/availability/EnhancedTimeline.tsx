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
      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100">
          <svg className="h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
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

    // Проверяем, есть ли событие в этом слоте
    const eventInSlot = rowEvents.find((event) => {
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      return eventStart < slotEnd && eventEnd > slotStart;
    });

    // Если есть событие (кроме available статуса), слот занят
    if (eventInSlot && eventInSlot.status !== "available") {
      return "busy";
    }
    
    // Иначе слот доступен
    return "free";
  }, [buildSlotTimes, getFilteredEventsForRow]);

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
    () => `150px repeat(${timeSlots.length}, minmax(8px, 1fr))`,
    [timeSlots.length],
  );

  return (
    <div className="space-y-4">
      {/* Легенда с тремя состояниями - легкий воздушный дизайн со скруглениями */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-8 rounded-lg border border-red-200/60 bg-red-50/60" />
          <span className="text-[0.65rem] font-medium text-slate-600">Занято</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-8 rounded-lg border border-slate-200/60 bg-white" />
          <span className="text-[0.65rem] font-medium text-slate-600">Свободно</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-8 rounded-lg border-2 border-blue-300/70 bg-blue-50/70" />
          <span className="text-[0.65rem] font-medium text-slate-600">Выбрано</span>
        </div>
      </div>

      {/* Легкий воздушный таймлайн в стиле основного календаря */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.12)]" ref={timelineRef} style={{ maxHeight: "calc(85vh - 300px)" }}>
        <div className="min-w-full space-y-2 p-3">
          {/* Заголовок времени */}
          <div
            className="grid rounded-lg border-b border-slate-200 bg-slate-50 p-2"
            style={{ gridTemplateColumns: templateColumns }}
          >
            <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-[0.3em]">Ресурс</div>
            {timeSlots.map((slot) => {
              // Создаем дату для слота в московском времени для правильного отображения времени
              const slotDate = buildSlotTimes(slot.index).slotStart;
              const moscowTime = getTimeInTimeZone(slotDate, MOSCOW_TIMEZONE);
              const timeLabel = `${String(moscowTime.hour).padStart(2, "0")}:${String(moscowTime.minute).padStart(2, "0")}`;
              
              return slot.minute === 0 ? (
                <div key={slot.index} className="text-center text-xs font-semibold text-slate-600 py-2">
                  {timeLabel}
                </div>
              ) : (
                <div key={slot.index} />
              );
            })}
          </div>

          {/* Строки ресурсов - красивые карточки */}
          {resourceRows.map((row) => {
            const rowConflictSlots = conflictMap?.get(row.id) ?? [];
            const hasConflict = rowConflictSlots.length > 0;
            
            return (
              <div
                key={row.id}
                className={`grid rounded-lg border transition-all ${
                  hasConflict
                    ? "border-amber-200 bg-amber-50/30"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                }`}
                style={{ gridTemplateColumns: templateColumns }}
              >
                {/* Название ресурса */}
                <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 bg-white">
                  {row.avatarUrl ? (
                    <img
                      src={apiBaseUrl && !row.avatarUrl.startsWith("http") ? `${apiBaseUrl}${row.avatarUrl}` : row.avatarUrl}
                      alt={row.label}
                      className="h-7 w-7 rounded-full object-cover border border-slate-200 shadow-sm flex-shrink-0"
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
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-[0.7rem] font-bold text-white shadow-sm flex-shrink-0 bg-gradient-to-br ${
                      row.type === "room" 
                        ? "from-blue-500 to-blue-600" 
                        : "from-indigo-500 to-purple-600"
                    } ${row.avatarUrl ? "hidden" : ""}`}
                  >
                    {row.type === "room" ? "🏢" : row.label[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate leading-tight ${
                      hasConflict ? "text-amber-900" : "text-slate-900"
                    }`}>
                      {row.label}
                    </p>
                    {row.meta && (
                      <p className={`text-[0.65rem] truncate mt-0.5 leading-tight ${
                        hasConflict ? "text-amber-700" : "text-slate-500"
                      }`}>
                        {row.meta}
                      </p>
                    )}
                  </div>
                  {hasConflict && (
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[0.7rem] font-bold bg-amber-400 text-amber-900 border border-amber-500 flex-shrink-0 shadow-sm" title="Конфликт">
                      !
                    </span>
                  )}
                </div>

                {/* Слоты времени */}
                {(() => {
                  // Мемоизируем события для строки один раз, а не для каждого слота (оптимизация производительности)
                  const rowEvents = getFilteredEventsForRow(row);
                  return timeSlots.map((slot) => {
                    const state = getSlotState(row, slot.index);
                    const { slotStart, slotEnd } = buildSlotTimes(slot.index);
                    
                    // Ищем событие в этом слоте
                    const eventInSlot = rowEvents.find((event) => {
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

                    // Формируем tooltip для события с временем в московском времени
                    let tooltipText = "";
                    if (eventInSlot) {
                      const eventStart = parseUTC(eventInSlot.starts_at);
                      const eventEnd = parseUTC(eventInSlot.ends_at);
                      const eventStartMoscow = getTimeInTimeZone(eventStart, MOSCOW_TIMEZONE);
                      const eventEndMoscow = getTimeInTimeZone(eventEnd, MOSCOW_TIMEZONE);
                      const eventStartTime = `${String(eventStartMoscow.hour).padStart(2, "0")}:${String(eventStartMoscow.minute).padStart(2, "0")}`;
                      const eventEndTime = `${String(eventEndMoscow.hour).padStart(2, "0")}:${String(eventEndMoscow.minute).padStart(2, "0")}`;
                      tooltipText = `${eventInSlot.title} (${eventStartTime} - ${eventEndTime})`;
                    } else {
                      tooltipText = state === "busy" ? "Занято" : isSelected ? "Выбрано" : "Доступно - кликните для выбора времени";
                    }

                  // Легкая воздушная цветовая схема с скругленными ячейками и плавными эффектами
                  let slotClassName = "h-8 rounded-lg transition-all duration-300 ease-out relative overflow-hidden group ";
                  
                  if (state === "busy") {
                    // Занято - легкий красный с прозрачностью, скругленный
                    slotClassName += "bg-red-50/60 border border-red-200/60 cursor-not-allowed hover:bg-red-50/80 hover:border-red-300/70 hover:shadow-sm hover:shadow-red-100/40";
                  } else if (isSelected) {
                    // Выбранное - легкий голубой с прозрачностью, скругленный
                    slotClassName += "bg-blue-50/70 border-2 border-blue-300/70 cursor-pointer hover:bg-blue-50/90 hover:border-blue-400/80 hover:shadow-md hover:shadow-blue-200/50";
                  } else {
                    // Свободное - белый фон с легкой границей, скругленный, с плавными hover-эффектами
                    slotClassName += "bg-white border border-slate-200/60 cursor-pointer hover:bg-slate-50 hover:border-slate-300/80 hover:shadow-sm hover:shadow-slate-200/30 active:bg-slate-100/60 active:scale-[0.98]";
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
                    >
                      {/* Плавный декоративный эффект для свободных слотов при hover */}
                      {state === "free" && !isSelected && (
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-out">
                          <div className="absolute inset-0 bg-gradient-to-br from-slate-50/40 via-white/20 to-transparent rounded-lg"></div>
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-slate-300/40 to-transparent"></div>
                        </div>
                      )}
                      
                      {/* Плавный эффект для выбранных слотов */}
                      {isSelected && (
                        <div className="absolute inset-0 rounded-lg">
                          <div className="absolute inset-0 bg-gradient-to-br from-blue-100/30 via-blue-50/20 to-transparent rounded-lg"></div>
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-0.5 bg-gradient-to-r from-transparent via-blue-300/50 to-transparent rounded-full"></div>
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2/3 h-0.5 bg-gradient-to-r from-transparent via-blue-300/50 to-transparent rounded-full"></div>
                        </div>
                      )}
                      
                      {/* Плавный эффект для занятых слотов */}
                      {state === "busy" && (
                        <div className="absolute inset-0 opacity-60 group-hover:opacity-80 transition-opacity duration-300 ease-out rounded-lg">
                          <div className="absolute inset-0 bg-gradient-to-br from-red-100/40 via-red-50/20 to-transparent rounded-lg"></div>
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-red-300/40 to-transparent rounded-full"></div>
                        </div>
                      )}
                    </div>
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
