"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventRecord } from "@/types/event.types";
import type { Room } from "@/types/room.types";
import { addDays, formatDate, parseUTC, getCurrentMoscowDate, isSameDayInMoscow } from "@/lib/utils/dateUtils";
import { MINUTES_IN_DAY } from "@/lib/constants";
import { calculateEventLayout, getEventPositionStyles, getPastelColor } from "@/lib/utils/eventLayout";

interface WeekViewEnhancedProps {
  days: Date[];
  events: EventRecord[];
  loading: boolean;
  accent: string;
  onEventClick: (event: EventRecord) => void;
  rooms: Room[];
  onEventMove?: (event: EventRecord, newStart: Date) => void;
  onTimeSlotClick?: (date: Date, startTime: Date, endTime: Date) => void;
  onUpdateParticipantStatus?: (eventId: string, userId: string, status: string) => Promise<void>;
  currentUserEmail?: string;
}

export function WeekViewEnhanced({
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
}: WeekViewEnhancedProps) {
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const HOUR_HEIGHT = 48; // Увеличена высота часа для лучшей читаемости
  const DAY_HEIGHT = 24 * HOUR_HEIGHT; // 1152px
  const moscowToday = getCurrentMoscowDate();
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragInfo = useRef<{ event: EventRecord; offsetMinutes: number } | null>(null);
  const draggingRef = useRef(false);
  
  const [currentTime, setCurrentTime] = useState(() => getCurrentMoscowDate());
  const [hoveredEvent, setHoveredEvent] = useState<{
    event: EventRecord;
    position: { top: number; left: number };
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // Состояние для отслеживания события над которым курсор (для z-index)
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  
  const [selection, setSelection] = useState<{
    columnIndex: number;
    startY: number;
    endY: number;
    isActive: boolean;
  } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getCurrentMoscowDate());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleEventMouseEnter = useCallback((event: EventRecord, element: HTMLDivElement) => {
    // Устанавливаем z-index для события под курсором
    setHoveredEventId(event.id);
    
    if (hoveredEvent?.event.id === event.id) return;
    
    const hasContent = (event.participants && event.participants.length > 0) ||
                     (event.description && event.description.trim().length > 0) ||
                     event.room_id;
    
    if (!hasContent) return;
    
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    
    hoverTimeoutRef.current = setTimeout(() => {
      const rect = element.getBoundingClientRect();
      const scrollContainer = element.closest('[class*="overflow"]');
      const containerRect = scrollContainer?.getBoundingClientRect() || 
                           element.closest('[class*="grid"]')?.getBoundingClientRect();
      
      if (!containerRect) return;
      
      const tooltipWidth = 340;
      const spaceOnRight = window.innerWidth - rect.right;
      const spaceOnLeft = rect.left;
      
      let left: number;
      if (spaceOnRight >= tooltipWidth + 10) {
        left = rect.right - containerRect.left + 10;
      } else if (spaceOnLeft >= tooltipWidth + 10) {
        left = rect.left - containerRect.left - tooltipWidth - 10;
      } else {
        left = rect.left - containerRect.left + (rect.width / 2) - (tooltipWidth / 2);
      }
      
      const top = rect.top - containerRect.top;
      
      setHoveredEvent({ event, position: { top, left } });
    }, 300);
  }, [hoveredEvent]);
  
  const handleEventMouseLeave = useCallback(() => {
    // Сбрасываем z-index
    setHoveredEventId(null);
    
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setHoveredEvent(null), 100);
  }, []);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, eventRecord: EventRecord) => {
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
  };

  const handleDragEnd = () => {
    dragInfo.current = null;
    setTimeout(() => { draggingRef.current = false; }, 0);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dayStart: Date, columnIndex: number) => {
    if (!dragInfo.current || !onEventMove) return;
    e.preventDefault();
    const columnEl = columnRefs.current[columnIndex];
    if (!columnEl) return;
    const rect = columnEl.getBoundingClientRect();
    let minutes = ((e.clientY - rect.top) / rect.height) * MINUTES_IN_DAY;
    minutes = Math.max(0, Math.min(MINUTES_IN_DAY, minutes));
    let newStartMinutes = minutes - dragInfo.current.offsetMinutes;
    newStartMinutes = Math.max(0, Math.min(MINUTES_IN_DAY, newStartMinutes));
    const newStart = new Date(dayStart.getTime() + newStartMinutes * 60000);
    onEventMove(dragInfo.current.event, newStart);
    dragInfo.current = null;
    draggingRef.current = false;
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (dragInfo.current) e.preventDefault();
  };

  const handleCardClick = (eventRecord: EventRecord) => {
    if (draggingRef.current) return;
    onEventClick(eventRecord);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, columnIndex: number) => {
    if (!onTimeSlotClick || draggingRef.current || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-event-card]')) return;

    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const currentY = e.clientY - rect.top;
    
    // Привязка к 5-минутным интервалам
    const minutes = (currentY / DAY_HEIGHT) * MINUTES_IN_DAY;
    const snappedMinutes = Math.round(minutes / 5) * 5;
    const startY = (snappedMinutes / MINUTES_IN_DAY) * DAY_HEIGHT;
    
    setSelection({ columnIndex, startY, endY: startY, isActive: true });
  };

  const dayColumns = useMemo(
    () =>
      days.map((date) => {
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = addDays(dayStart, 1);
        const dayEvents = events.filter((event) => {
          const start = parseUTC(event.starts_at);
          const end = parseUTC(event.ends_at);
          return start < dayEnd && end > dayStart;
        });
        
        // Рассчитываем layout для пересекающихся событий
        const eventLayoutMap = calculateEventLayout(
          dayEvents.map(event => ({
            id: event.id,
            start: parseUTC(event.starts_at),
            end: parseUTC(event.ends_at),
          }))
        );

        const isTodayCheck = isSameDayInMoscow(date, moscowToday);
        
        return {
          date,
          dayStart,
          dayEnd,
          events: dayEvents,
          eventLayoutMap,
          isToday: isTodayCheck,
        };
      }),
    [days, events, moscowToday],
  );

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!selection?.isActive || !onTimeSlotClick) return;
    const columnEl = columnRefs.current[selection.columnIndex];
    if (!columnEl) return;
    const rect = columnEl.getBoundingClientRect();
    const currentY = e.clientY - rect.top;
    const clampedY = Math.max(0, Math.min(DAY_HEIGHT, currentY));
    
    // Привязка к 5-минутным интервалам
    const minutes = (clampedY / DAY_HEIGHT) * MINUTES_IN_DAY;
    const snappedMinutes = Math.round(minutes / 5) * 5;
    const snappedY = (snappedMinutes / MINUTES_IN_DAY) * DAY_HEIGHT;
    
    setSelection((prev) => prev ? { ...prev, endY: snappedY } : null);
  }, [selection, DAY_HEIGHT, onTimeSlotClick, MINUTES_IN_DAY]);

  const handleMouseUp = useCallback(() => {
    if (!selection?.isActive || !onTimeSlotClick) return;
    const columnIndex = selection.columnIndex;
    const dayColumn = dayColumns[columnIndex];
    if (!dayColumn) {
      setSelection(null);
      return;
    }

    const startY = Math.min(selection.startY, selection.endY);
    const endY = Math.max(selection.startY, selection.endY);
    const minHeight = (30 / MINUTES_IN_DAY) * DAY_HEIGHT;
    const actualHeight = Math.max(minHeight, endY - startY);

    const startMinutes = (startY / DAY_HEIGHT) * MINUTES_IN_DAY;
    const endMinutes = startMinutes + (actualHeight / DAY_HEIGHT) * MINUTES_IN_DAY;

    // Привязка к 5-минутным интервалам
    const roundedStartMinutes = Math.floor(startMinutes / 5) * 5;
    const roundedEndMinutes = Math.ceil(endMinutes / 5) * 5;

    const startTime = new Date(dayColumn.dayStart);
    startTime.setHours(Math.floor(roundedStartMinutes / 60), roundedStartMinutes % 60, 0, 0);

    const endTime = new Date(dayColumn.dayStart);
    endTime.setHours(Math.floor(roundedEndMinutes / 60), roundedEndMinutes % 60, 0, 0);

    onTimeSlotClick(dayColumn.dayStart, startTime, endTime);
    setSelection(null);
  }, [selection, dayColumns, onTimeSlotClick, DAY_HEIGHT]);

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

  // Текущее время для индикатора
  const currentTimePosition = useMemo(() => {
    const now = currentTime;
    const hours = now.getHours();
    const minutes = now.getMinutes();
    return (hours * HOUR_HEIGHT) + (minutes / 60) * HOUR_HEIGHT;
  }, [currentTime, HOUR_HEIGHT]);

  return (
    <div className="h-full flex flex-col rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50/30 to-white shadow-xl overflow-hidden">
      {/* Улучшенный заголовок */}
      <div className="sticky top-0 z-20 grid grid-cols-[100px_repeat(7,minmax(0,1fr))] border-b-2 border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 backdrop-blur-sm">
        <div className="p-3 text-right">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Время</p>
        </div>
        {dayColumns.map(({ date, isToday }) => (
          <div
            key={`head-${date.toISOString()}`}
            className={`border-l border-slate-200 p-3 transition-all ${
              isToday 
                ? "bg-gradient-to-br from-lime-50 to-emerald-50 border-lime-300" 
                : "bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {formatDate(date, { weekday: "short" })}
            </p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <p className={`text-lg font-bold ${
                isToday ? "text-lime-700" : "text-slate-900"
              }`}>
                {new Intl.DateTimeFormat("ru-RU", {
                  day: "numeric",
                  month: "short",
                }).format(date)}
              </p>
              {isToday && (
                <span className="rounded-full bg-gradient-to-r from-lime-500 to-emerald-500 px-2 py-0.5 text-[0.6rem] font-bold text-white shadow-sm">
                  сегодня
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[100px_repeat(7,minmax(0,1fr))] relative">
          {/* Колонка времени */}
          <div className="border-r-2 border-slate-200 bg-gradient-to-b from-white to-slate-50/50 sticky left-0 z-10" style={{ height: `${DAY_HEIGHT}px` }}>
            <div className="flex h-full flex-col justify-between text-right pr-3 py-2">
              {hours.map((hour) => (
                <div
                  key={`label-${hour}`}
                  className="text-xs font-semibold text-slate-600"
                  style={{ height: `${HOUR_HEIGHT}px`, lineHeight: `${HOUR_HEIGHT}px` }}
                >
                  {hour.toString().padStart(2, "0")}:00
                </div>
              ))}
            </div>
          </div>

          {/* Колонки дней */}
          {dayColumns.map(({ date, dayStart, dayEnd, events: dayEvents, eventLayoutMap, isToday }, idx) => {
            const isSelecting = selection?.columnIndex === idx && selection.isActive;
            const selectionStartY = isSelecting ? Math.min(selection.startY, selection.endY) : 0;
            const selectionEndY = isSelecting ? Math.max(selection.startY, selection.endY) : 0;
            const selectionHeight = isSelecting ? selectionEndY - selectionStartY : 0;
            
            return (
              <div
                key={`grid-${date.toISOString()}`}
                className={`relative border-l border-slate-200 ${
                  idx === dayColumns.length - 1 ? "border-r border-slate-200" : ""
                } ${
                  isToday 
                    ? "bg-gradient-to-br from-lime-50/30 to-emerald-50/30" 
                    : "bg-white"
                } ${onTimeSlotClick ? "cursor-crosshair" : ""}`}
                style={{ height: `${DAY_HEIGHT}px` }}
                ref={(el) => { columnRefs.current[idx] = el; }}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, dayStart, idx)}
                onMouseDown={(e) => handleMouseDown(e, idx)}
              >
                {/* Линии часов с градиентом */}
                {hours.map((hour) => (
                  <div
                    key={`line-${date.toISOString()}-${hour}`}
                    className={`absolute left-0 right-0 border-b ${
                      hour % 4 === 0 
                        ? "border-slate-300" 
                        : hour % 2 === 0 
                          ? "border-slate-200" 
                          : "border-slate-100"
                    }`}
                    style={{ top: `${hour * HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Индикатор текущего времени (только для сегодня) */}
                {isToday && (
                  <div
                    className="absolute left-0 right-0 z-30 pointer-events-none"
                    style={{ top: `${currentTimePosition}px` }}
                  >
                    <div className="relative">
                      <div className="absolute left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-lg" />
                      <div className="absolute -left-2 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-red-500 border-2 border-white shadow-lg" />
                    </div>
                  </div>
                )}

                {/* Выделение диапазона времени */}
                {isSelecting && selectionHeight > 0 && (
                  <div
                    className="absolute left-0 right-0 rounded-lg border-2 border-lime-500 bg-gradient-to-br from-lime-100/50 to-emerald-100/50 pointer-events-none z-20 shadow-lg"
                    style={{
                      top: `${selectionStartY}px`,
                      height: `${selectionHeight}px`,
                    }}
                  />
                )}

                {/* События */}
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
                  const displayStart = eventStart < dayStart ? dayStart : eventStart;
                  const displayEnd = eventEnd > dayEnd ? dayEnd : eventEnd;
                  const minutesFromStart = (displayStart.getTime() - dayStart.getTime()) / 60000;
                  const durationMinutes = Math.max(
                    (displayEnd.getTime() - displayStart.getTime()) / 60000,
                    30,
                  );
                  const topPx = (minutesFromStart / MINUTES_IN_DAY) * DAY_HEIGHT;
                  const heightPx = (durationMinutes / MINUTES_IN_DAY) * DAY_HEIGHT;
                  
                  const isStartingSoon = (() => {
                    const diffMs = eventStart.getTime() - currentTime.getTime();
                    const diffMinutes = diffMs / (1000 * 60);
                    return diffMinutes >= 0 && diffMinutes <= 5;
                  })();
                  
                  // Проверяем статус текущего пользователя
                  const userParticipant = currentUserEmail && event.participants
                    ? event.participants.find((p) => p.email === currentUserEmail)
                    : null;
                  const isAccepted = userParticipant?.response_status === "accepted";
                  
                  // Реальная длительность события
                  const realDurationMinutes = (eventEnd.getTime() - eventStart.getTime()) / 60000;
                  // Уровни отображения (как в Google Calendar):
                  const isVeryShort = realDurationMinutes < 30;        // < 30 мин: только название
                  const isShort = realDurationMinutes >= 30 && realDurationMinutes < 60; // 30-59 мин: название + время
                  // >= 60 мин: полная информация

                  const participantCount = event.participants?.length || 0;
                  const hasRoom = Boolean(event.room_id);
                  
                  // Получаем информацию о позиционировании для пересекающихся событий
                  const layout = eventLayoutMap?.get(event.id);
                  const positionStyles = layout 
                    ? getEventPositionStyles(layout, { 
                        cascadeOffset: 6,       // Уменьшенное смещение для более плотного прилегания
                        minWidth: 70,           // Минимальная ширина
                        useClassicCascade: true // Классическое наслоение
                      })
                    : { left: '2px', width: 'calc(100% - 4px)', zIndex: 10 };

                  return (
                    <div
                      key={event.id}
                      data-event-card
                      ref={(el) => {
                        if (el) eventCardRefs.current.set(event.id, el);
                        else eventCardRefs.current.delete(event.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCardClick(event);
                      }}
                      onMouseEnter={(e) => {
                        // Сразу выводим событие на передний план
                        setHoveredEventId(event.id);
                        
                        const hasContent = (event.participants && event.participants.length > 0) ||
                                         (event.description && event.description.trim().length > 0) ||
                                         event.room_id;
                        if (hasContent) handleEventMouseEnter(event, e.currentTarget);
                      }}
                      onMouseLeave={() => {
                        // Сразу убираем с переднего плана
                        setHoveredEventId(null);
                        handleEventMouseLeave();
                      }}
                      draggable={Boolean(onEventMove) && !event.all_day}
                      onDragStart={(dragEvent) => handleDragStart(dragEvent, event)}
                      onDragEnd={handleDragEnd}
                      className={`absolute cursor-pointer rounded-lg border-l-[3px] shadow-md transition-all hover:shadow-lg hover:scale-[1.01] z-10 ${
                        isStartingSoon 
                          ? "border-lime-500 border-2 animate-pulse" 
                          : "border-lime-400"
                      }`}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        left: positionStyles.left,
                        width: positionStyles.width,
                        zIndex: hoveredEventId === event.id ? 100 : positionStyles.zIndex, // При hover - на передний план
                        background: isStartingSoon 
                          ? `linear-gradient(135deg, ${accent}15 0%, ${accent}25 100%)`
                          : isAccepted
                            ? getPastelColor(accent) // Пастельный непрозрачный для принятых
                            : `linear-gradient(135deg, ${accent}08 0%, ${accent}15 100%)`,
                        borderColor: accent,
                      }}
                    >
                      {/* Очень короткие события (< 30 мин): только название */}
                      {isVeryShort ? (
                        <div className="h-full flex items-center justify-start px-1.5">
                          <p className="text-xs font-bold text-slate-900 leading-tight truncate">
                            {event.title}
                          </p>
                        </div>
                      ) : isShort ? (
                        /* Короткие события (30-59 мин): название + время */
                        <div className="h-full flex flex-col justify-start px-1 pt-0.5">
                          <p className="text-xs font-bold text-slate-900 truncate leading-none">
                            {event.title}
                          </p>
                          <p className="text-[0.65rem] text-slate-600 leading-none truncate mt-0.5">
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
                        <div className="h-full p-1.5 flex flex-col justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <p className="text-xs font-bold text-slate-900 leading-tight truncate mb-0.5 flex-1">
                                {event.title}
                              </p>
                              {/* Индикаторы вложений и комментариев */}
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                {event.attachments && event.attachments.length > 0 && (
                                  <div className="w-3 h-3 rounded-full bg-blue-500/80 flex items-center justify-center" title={`${event.attachments.length} вложение${event.attachments.length > 1 ? 'й' : ''}`}>
                                    <svg className="w-1.5 h-1.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                                    </svg>
                                  </div>
                                )}
                                {event.comments_count !== undefined && event.comments_count > 0 && (
                                  <div className="w-3 h-3 rounded-full bg-red-500/80 flex items-center justify-center" title={`${event.comments_count} комментари${event.comments_count === 1 ? 'й' : event.comments_count < 5 ? 'я' : 'ев'}`}>
                                    <span className="text-[0.65rem] font-semibold text-white leading-none">{event.comments_count}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <p className="text-[0.65rem] font-medium text-slate-600 leading-tight">
                              {new Intl.DateTimeFormat("ru-RU", {
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(eventStart)}{" "}
                              —{" "}
                              {new Intl.DateTimeFormat("ru-RU", {
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(eventEnd)}
                            </p>
                          </div>
                          
                          {/* Метаинформация */}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {hasRoom && (
                              <div className="flex items-center gap-1 rounded-md bg-white/80 px-1.5 py-0.5">
                                <svg className="h-3 w-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                <span className="text-[0.6rem] font-semibold text-slate-700 truncate max-w-[60px]">
                                  {rooms.find((r) => r.id === event.room_id)?.name || "Комната"}
                                </span>
                              </div>
                            )}
                            {participantCount > 0 && (
                              <div className="flex items-center gap-1 rounded-md bg-white/80 px-1.5 py-0.5">
                                <svg className="h-3 w-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <span className="text-[0.6rem] font-semibold text-slate-700">
                                  {participantCount}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Индикатор что требуется ответ */}
                          {onUpdateParticipantStatus && currentUserEmail && event.participants && (() => {
                            const currentParticipant = event.participants?.find(
                              (p) => p.email === currentUserEmail
                            );
                            const needsAction = currentParticipant && 
                              (currentParticipant.response_status === "needs_action" || 
                               currentParticipant.response_status === "pending" ||
                               !currentParticipant.response_status);
                            if (!needsAction) return null;
                            
                            return (
                              <div className="mt-1">
                                <div className="text-[0.6rem] text-amber-600 font-semibold flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  Требуется ответ
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Всплывающее окно с деталями события */}
      {hoveredEvent && (
        <div
          className="absolute z-50 rounded-xl border border-slate-200 bg-white shadow-2xl p-4 pointer-events-auto backdrop-blur-sm"
          style={{
            top: `${hoveredEvent.position.top}px`,
            left: `${hoveredEvent.position.left}px`,
            width: "340px",
            maxHeight: "500px",
          }}
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          }}
          onMouseLeave={() => setHoveredEvent(null)}
        >
          <div className="mb-3 border-b border-slate-100 pb-3">
            <p className="text-sm font-bold text-slate-900 mb-1">{hoveredEvent.event.title}</p>
            <p className="text-xs text-slate-500">
              {new Intl.DateTimeFormat("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(parseUTC(hoveredEvent.event.starts_at))}{" "}
              —{" "}
              {new Intl.DateTimeFormat("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(parseUTC(hoveredEvent.event.ends_at))}
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
              <div className="mb-3 border-b border-slate-100 pb-3">
                <p className="text-xs font-semibold text-slate-700 mb-2">Ответить на приглашение</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (currentParticipant && onUpdateParticipantStatus) {
                        onUpdateParticipantStatus(hoveredEvent.event.id, currentParticipant.user_id, "accepted");
                        setHoveredEvent(null);
                      }
                    }}
                    className="flex-1 rounded-lg bg-gradient-to-r from-lime-500 to-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:from-lime-600 hover:to-emerald-600 shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <span className="text-sm">✓</span> Принять
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (currentParticipant && onUpdateParticipantStatus) {
                        onUpdateParticipantStatus(hoveredEvent.event.id, currentParticipant.user_id, "declined");
                        setHoveredEvent(null);
                      }
                    }}
                    className="flex-1 rounded-lg bg-gradient-to-r from-red-500 to-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:from-red-600 hover:to-red-700 shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <span className="text-sm">✕</span> Отклонить
                  </button>
                </div>
              </div>
            );
          })()}
          
          {hoveredEvent.event.description && hoveredEvent.event.description.trim().length > 0 && (
            <div className="mb-3 border-b border-slate-100 pb-3">
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Описание</p>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
                {hoveredEvent.event.description}
              </p>
            </div>
          )}
          
          {hoveredEvent.event.room_id && (
            <div className="mb-3 border-b border-slate-100 pb-3">
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Переговорка</p>
              <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-gradient-to-r from-slate-50 to-white p-2">
                <svg className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900">
                    {rooms.find((r) => r.id === hoveredEvent.event.room_id)?.name || "Переговорка"}
                  </p>
                  {rooms.find((r) => r.id === hoveredEvent.event.room_id)?.location && (
                    <p className="text-[0.65rem] text-slate-500 mt-0.5">
                      {rooms.find((r) => r.id === hoveredEvent.event.room_id)?.location}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {hoveredEvent.event.participants && hoveredEvent.event.participants.length > 0 && (
            <div>
              <div className="mb-2">
                <p className="text-xs font-semibold text-slate-700">Участники</p>
                <p className="text-[0.65rem] text-slate-500 mt-0.5">
                  {hoveredEvent.event.participants.length}{" "}
                  {hoveredEvent.event.participants.length === 1 ? "участник" : 
                   hoveredEvent.event.participants.length < 5 ? "участника" : "участников"}
                </p>
              </div>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {hoveredEvent.event.participants.map((participant) => {
                  const statusLabels: Record<string, string> = {
                    accepted: "Принял",
                    declined: "Отклонил",
                    pending: "Нет ответа",
                    needs_action: "Нет ответа",
                  };
                  const statusColors: Record<string, string> = {
                    accepted: "bg-gradient-to-r from-lime-100 to-emerald-100 text-lime-700 border-lime-300",
                    declined: "bg-gradient-to-r from-red-100 to-red-200 text-red-700 border-red-300",
                    pending: "bg-slate-100 text-slate-600 border-slate-300",
                    needs_action: "bg-slate-100 text-slate-600 border-slate-300",
                  };
                  const status = participant.response_status || "pending";
                  
                  return (
                    <div
                      key={participant.user_id}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-gradient-to-r from-slate-50 to-white p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {participant.full_name || participant.email}
                        </p>
                        {participant.full_name && (
                          <p className="text-[0.65rem] text-slate-500 truncate">
                            {participant.email}
                          </p>
                        )}
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
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

