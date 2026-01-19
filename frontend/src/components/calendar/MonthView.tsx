"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { EventRecord } from "@/types/event.types";
import type { Room } from "@/types/room.types";
import { addDays, parseUTC, formatTimeInTimeZone, getTimeInTimeZone, MOSCOW_TIMEZONE, getCurrentMoscowDate, isSameDayInMoscow } from "@/lib/utils/dateUtils";
import { WEEKDAY_LABELS } from "@/lib/constants";

interface MonthViewProps {
  days: Date[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  events: EventRecord[];
  loading: boolean;
  accent: string;
  onEventClick: (event: EventRecord) => void;
  rooms?: Room[];
  currentUserEmail?: string;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
}

export function MonthView({
  days,
  selectedDate,
  onSelectDate,
  events,
  loading,
  accent,
  onEventClick,
  rooms = [],
  currentUserEmail,
  getUserOrganizationAbbreviation,
}: MonthViewProps) {
  const currentMonth = selectedDate.getMonth();
  
  // Состояние для всплывающего окна с деталями события
  const [hoveredEvent, setHoveredEvent] = useState<{
    event: EventRecord;
    position: { top: number; left: number };
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mousePositionRef = useRef<{ x: number; y: number } | null>(null);
  
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
    }, 200);
  }, [hoveredEvent]);
  
  const handleEventMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
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

  const eventsByDay = useMemo(() => {
    const record = new Map<string, EventRecord[]>();
    days.forEach((day) => {
      const key = day.toDateString();
      record.set(key, []);
    });
    events.forEach((event) => {
      const start = parseUTC(event.starts_at);
      const end = parseUTC(event.ends_at);
      
      // Получаем компоненты времени события в московском времени
      const eventStartMoscow = getTimeInTimeZone(start, MOSCOW_TIMEZONE);
      const eventEndMoscow = getTimeInTimeZone(end, MOSCOW_TIMEZONE);
      
      days.forEach((day) => {
        // Получаем компоненты дня в московском времени
        const dayMoscow = getTimeInTimeZone(day, MOSCOW_TIMEZONE);
        const nextDayMoscow = getTimeInTimeZone(addDays(day, 1), MOSCOW_TIMEZONE);
        
        // Сравниваем даты напрямую по компонентам
        const eventStartKey = eventStartMoscow.year * 10000 + eventStartMoscow.month * 100 + eventStartMoscow.day;
        const eventEndKey = eventEndMoscow.year * 10000 + eventEndMoscow.month * 100 + eventEndMoscow.day;
        const dayKey = dayMoscow.year * 10000 + dayMoscow.month * 100 + dayMoscow.day;
        const nextDayKey = nextDayMoscow.year * 10000 + nextDayMoscow.month * 100 + nextDayMoscow.day;
        
        // Событие попадает в день, если его начало до следующего дня и конец после начала текущего дня
        if (eventStartKey < nextDayKey && eventEndKey >= dayKey) {
          const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
          const key = dayStart.toDateString();
          const list = record.get(key);
          if (list) {
            list.push(event);
          } else {
            record.set(key, [event]);
          }
        }
      });
    });
    return record;
  }, [days, events]);

  return (
    <div className="mt-2 sm:mt-6 relative">
      <div className="grid grid-cols-7 gap-1 sm:gap-3 text-[0.5rem] sm:text-xs uppercase tracking-[0.15em] sm:tracking-[0.3em] text-slate-500">
        {WEEKDAY_LABELS.map((label) => (
          <p key={label} className="text-center sm:text-left">{label}</p>
        ))}
      </div>
      <div className="mt-1 sm:mt-2 grid grid-cols-7 gap-1 sm:gap-3">
        {days.map((day) => {
          const key = day.toDateString();
          const dayEvents = eventsByDay.get(key) ?? [];
          const isCurrentMonth = day.getMonth() === currentMonth;
          const isToday = isSameDayInMoscow(day, getCurrentMoscowDate());

          return (
            <button
              type="button"
              key={key}
              onClick={() => onSelectDate(new Date(day))}
              className={`rounded-lg sm:rounded-2xl border p-1.5 sm:p-3 text-left transition touch-manipulation min-h-[60px] sm:min-h-auto ${
                isCurrentMonth
                  ? "border-slate-200 bg-white"
                  : "border-slate-100 bg-slate-50 text-slate-500"
              } ${isToday ? "ring-1 sm:ring-2 ring-lime-400" : ""}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs sm:text-base font-semibold text-slate-900">
                  {day.getDate().toString().padStart(2, "0")}
                </p>
                {isToday && (
                  <span className="hidden sm:inline rounded-full bg-lime-100 px-2 py-1 text-[0.65rem] text-lime-600">
                    сегодня
                  </span>
                )}
              </div>
              <div className="mt-1 sm:mt-3 space-y-0.5 sm:space-y-1 relative">
                {dayEvents.slice(0, 3).map((event) => {
                  // Проверяем, является ли событие расписанием доступности
                  const isUnavailable = event.status === "unavailable";
                  const isAvailable = event.status === "available";
                  const isBookedSlot = event.status === "booked_slot";
                  
                  // Проверяем статус текущего пользователя для события
                  const userParticipant = currentUserEmail && event.participants
                    ? event.participants.find((p) => p.email === currentUserEmail)
                    : null;
                  const needsAction = userParticipant && 
                    (userParticipant.response_status === "needs_action" || 
                     userParticipant.response_status === "pending" ||
                     !userParticipant.response_status);
                  
                  return (
                    <div
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Не открываем модальное окно для событий расписания доступности и забронированных слотов
                        if (!isUnavailable && !isAvailable && !isBookedSlot) {
                          onEventClick(event);
                        }
                      }}
                      onMouseEnter={(e) => {
                        // Не показываем всплывающее окно для событий расписания доступности и забронированных слотов
                        if (!isUnavailable && !isAvailable && !isBookedSlot) {
                          handleEventMouseEnter(event, e.currentTarget, e);
                        }
                      }}
                      onMouseMove={(e) => {
                        if (!isUnavailable && !isAvailable && !isBookedSlot && hoveredEvent?.event.id === event.id) {
                          handleEventMouseMove(event, e);
                        }
                      }}
                      onMouseLeave={handleEventMouseLeave}
                      className={`flex items-center gap-1 sm:gap-2 rounded-lg sm:rounded-xl px-1 sm:px-2 py-0.5 sm:py-1 text-[0.5rem] sm:text-[0.65rem] transition touch-manipulation ${
                        isUnavailable
                          ? "bg-slate-100 border border-slate-300 cursor-default"
                          : isAvailable
                            ? "bg-green-50 border border-green-300 cursor-default"
                            : isBookedSlot
                              ? "bg-orange-100 border border-orange-400 cursor-default"
                              : needsAction
                                ? "needs-action-event cursor-pointer border-2"
                                : "bg-slate-100 hover:bg-slate-200 cursor-pointer"
                      }`}
                      style={{
                        borderColor: event.department_color && !isUnavailable && !isAvailable && !isBookedSlot && !needsAction
                          ? event.department_color
                          : undefined,
                        backgroundColor: event.department_color && !isUnavailable && !isAvailable && !isBookedSlot && !needsAction
                          ? `${event.department_color}15`
                          : undefined,
                      }}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${isUnavailable ? "" : ""}`}
                        style={{ 
                          background: isUnavailable 
                            ? "#94a3b8" 
                            : isAvailable 
                              ? "#22c55e"
                              : isBookedSlot
                                ? "#f97316"
                                : event.department_color || accent
                        }}
                      />
                      <div className="flex items-center justify-between gap-1 flex-1 min-w-0">
                        <span className={`truncate ${isUnavailable ? "text-slate-600 font-medium" : isAvailable ? "text-green-700 font-medium" : isBookedSlot ? "text-orange-700 font-medium" : "text-slate-700"}`}>
                          {isUnavailable ? "Недоступен" : isAvailable ? event.title : isBookedSlot ? event.title : event.title}
                        </span>
                        {/* Индикаторы вложений и комментариев */}
                        {!isUnavailable && !isAvailable && !isBookedSlot && (
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            {event.attachments && event.attachments.length > 0 && (
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-500/80 flex items-center justify-center" title={`${event.attachments.length} вложение${event.attachments.length > 1 ? 'й' : ''}`}>
                                <svg className="w-1.5 h-1.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                            {event.comments_count !== undefined && event.comments_count > 0 && (
                              <div className="w-2.5 h-2.5 rounded-full bg-red-500/80 flex items-center justify-center" title={`${event.comments_count} комментари${event.comments_count === 1 ? 'й' : event.comments_count < 5 ? 'я' : 'ев'}`}>
                                <span className="text-[0.6rem] font-semibold text-white leading-none">{event.comments_count}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {isAvailable && event.description && event.description !== event.title && (
                        <span className="text-[0.6rem] text-green-600 truncate">
                          {event.description}
                        </span>
                      )}
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <p className="text-[0.65rem] text-slate-500">
                    + {dayEvents.length - 3} ещё
                  </p>
                )}
                {dayEvents.length === 0 && (
                  <p className="text-[0.65rem] text-slate-400">—</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
      
      {/* Всплывающее окно с деталями события */}
      {hoveredEvent && (
        <div
          className="fixed z-50 rounded-xl border border-slate-200 bg-white shadow-[0_10px_40px_rgba(15,23,42,0.2)] p-4 pointer-events-auto overflow-hidden flex flex-col"
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
          <div className="mb-2 flex-shrink-0">
            <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 break-words">
              {hoveredEvent.event.title}
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              {formatTimeInTimeZone(parseUTC(hoveredEvent.event.starts_at), MOSCOW_TIMEZONE, {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              —{" "}
              {formatTimeInTimeZone(parseUTC(hoveredEvent.event.ends_at), MOSCOW_TIMEZONE)}
            </p>
          </div>
          
          {hoveredEvent.event.description && (
            <p className="mb-2 text-xs text-slate-600 line-clamp-2">
              {hoveredEvent.event.description}
            </p>
          )}
          
          {hoveredEvent.event.participants && hoveredEvent.event.participants.length > 0 && (
            <div className="mb-2 flex-1 min-h-0 flex flex-col">
              <p className="mb-1 text-xs font-semibold text-slate-700 flex-shrink-0">
                Участники ({hoveredEvent.event.participants.length}):
              </p>
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto flex-1">
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
                    pending: "bg-amber-500/40 text-amber-300 border-amber-500/60",
                    needs_action: "bg-amber-500/40 text-amber-300 border-amber-500/60",
                  } : {
                    accepted: "bg-lime-100 text-lime-700 border-lime-300",
                    declined: "bg-red-100 text-red-700 border-red-300",
                    pending: "bg-slate-100 text-slate-600 border-slate-300",
                    needs_action: "bg-slate-100 text-slate-600 border-slate-300",
                  };
                  const status = participant.response_status || "needs_action";
                  const orgAbbr = getUserOrganizationAbbreviation ? getUserOrganizationAbbreviation(participant.user_id) : "";
                  
                  return (
                    <div
                      key={participant.user_id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {participant.full_name || participant.email}
                          </p>
                          {orgAbbr && (
                            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[0.6rem] font-semibold text-slate-700 flex-shrink-0">
                              {orgAbbr}
                            </span>
                          )}
                        </div>
                        {participant.full_name && (
                          <p className="text-[0.65rem] text-slate-500 truncate">
                            {participant.email}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold flex-shrink-0 ${
                          statusColors[status] || statusColors.needs_action
                        }`}
                      >
                        {statusLabels[status] || statusLabels.needs_action}
                      </span>
                    </div>
                  );
                })}
                {hoveredEvent.event.participants.length > 8 && (
                  <p className="text-[0.65rem] text-slate-500 text-center pt-1">
                    и ещё {hoveredEvent.event.participants.length - 8} участников
                  </p>
                )}
              </div>
            </div>
          )}
          
          {hoveredEvent.event.location && (
            <p className="text-xs text-slate-500 truncate flex-shrink-0 mb-2">
              📍 {hoveredEvent.event.location}
            </p>
          )}
          
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
        </div>
      )}
    </div>
  );
}

