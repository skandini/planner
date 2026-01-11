"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { EventRecord } from "@/types/event.types";
import type { Room } from "@/types/room.types";
import { addDays, parseUTC } from "@/lib/utils/dateUtils";
import { WEEKDAY_LABELS } from "@/lib/constants";

interface MonthViewEnhancedProps {
  days: Date[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  events: EventRecord[];
  loading: boolean;
  accent: string;
  onEventClick: (event: EventRecord) => void;
  rooms?: Room[];
}

export function MonthViewEnhanced({
  days,
  selectedDate,
  onSelectDate,
  events,
  loading,
  accent,
  onEventClick,
  rooms = [],
}: MonthViewEnhancedProps) {
  const currentMonth = selectedDate.getMonth();
  
  const [hoveredEvent, setHoveredEvent] = useState<{
    event: EventRecord;
    position: { top: number; left: number };
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleEventMouseEnter = useCallback((event: EventRecord, element: HTMLDivElement) => {
    if (hoveredEvent?.event.id === event.id) return;
    
    const hasContent = (event.participants && event.participants.length > 0) ||
                     (event.description && event.description.trim().length > 0) ||
                     event.room_id;
    
    if (!hasContent) return;
    
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    
    hoverTimeoutRef.current = setTimeout(() => {
      const rect = element.getBoundingClientRect();
      const container = element.closest('[class*="grid"]') || element.closest('div');
      const containerRect = container?.getBoundingClientRect();
      
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
      
      const top = rect.bottom - containerRect.top + 5;
      
      setHoveredEvent({ event, position: { top, left } });
    }, 300);
  }, [hoveredEvent]);
  
  const handleEventMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setHoveredEvent(null), 100);
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
      days.forEach((day) => {
        const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
        const dayEnd = addDays(dayStart, 1);
        if (start < dayEnd && end > dayStart) {
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
    <div className="mt-6 relative">
      {/* Заголовок дней недели */}
      <div className="grid grid-cols-7 gap-2 mb-3">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="p-2 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      
      {/* Сетка календаря */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const key = day.toDateString();
          const dayEvents = eventsByDay.get(key) ?? [];
          const isCurrentMonth = day.getMonth() === currentMonth;
          const isToday = new Date().toDateString() === key;
          const isSelected = selectedDate.toDateString() === key;

          return (
            <button
              type="button"
              key={key}
              onClick={() => onSelectDate(new Date(day))}
              className={`group relative rounded-xl border-2 p-3 text-left transition-all hover:shadow-lg ${
                isCurrentMonth
                  ? isToday
                    ? "border-lime-400 bg-gradient-to-br from-lime-50 to-emerald-50 shadow-md"
                    : isSelected
                      ? "border-lime-300 bg-gradient-to-br from-slate-50 to-white shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  : "border-slate-100 bg-slate-50/50 text-slate-400"
              }`}
            >
              {/* Номер дня */}
              <div className="flex items-center justify-between mb-2">
                <span className={`text-base font-bold ${
                  isToday 
                    ? "text-lime-700" 
                    : isCurrentMonth 
                      ? "text-slate-900" 
                      : "text-slate-400"
                }`}>
                  {day.getDate().toString().padStart(2, "0")}
                </span>
                {isToday && (
                  <span className="rounded-full bg-gradient-to-r from-lime-500 to-emerald-500 px-2 py-0.5 text-[0.65rem] font-bold text-white shadow-sm">
                    сегодня
                  </span>
                )}
              </div>
              
              {/* События */}
              <div className="space-y-1.5 min-h-[60px]">
                {dayEvents.slice(0, 3).map((event, idx) => {
                  const eventStart = parseUTC(event.starts_at);
                  const participantCount = event.participants?.length || 0;
                  const hasRoom = Boolean(event.room_id);
                  
                  return (
                    <div
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      onMouseEnter={(e) => handleEventMouseEnter(event, e.currentTarget)}
                      onMouseLeave={handleEventMouseLeave}
                      className="group/event flex items-center gap-2 rounded-lg border-l-3 bg-gradient-to-r from-white to-slate-50 px-2 py-1.5 text-[0.7rem] transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer"
                      style={{
                        borderLeftColor: accent,
                        background: `linear-gradient(135deg, ${accent}08 0%, ${accent}15 100%)`,
                      }}
                    >
                      {/* Индикатор времени */}
                      <div className="flex-shrink-0">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm">
                          <span className="text-[0.6rem] font-bold text-slate-700">
                            {new Intl.DateTimeFormat("ru-RU", {
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(eventStart)}
                          </span>
                        </div>
                      </div>
                      
                      {/* Информация о событии */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 truncate leading-tight">
                          {event.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {hasRoom && (
                            <div className="flex items-center gap-0.5">
                              <svg className="h-2.5 w-2.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              <span className="text-[0.55rem] text-slate-600 truncate max-w-[50px]">
                                {rooms.find((r) => r.id === event.room_id)?.name || "Комната"}
                              </span>
                            </div>
                          )}
                          {participantCount > 0 && (
                            <div className="flex items-center gap-0.5">
                              <svg className="h-2.5 w-2.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                              </svg>
                              <span className="text-[0.55rem] text-slate-600">
                                {participantCount}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Индикатор дополнительных событий */}
                {dayEvents.length > 3 && (
                  <div className="rounded-lg border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-2 py-1 text-center">
                    <p className="text-[0.65rem] font-semibold text-slate-600">
                      + {dayEvents.length - 3} ещё
                    </p>
                  </div>
                )}
                
                {/* Пустое состояние */}
                {dayEvents.length === 0 && (
                  <div className="flex items-center justify-center h-[60px]">
                    <p className="text-[0.65rem] text-slate-300">—</p>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
      
      {/* Всплывающее окно с деталями события */}
      {hoveredEvent && (
        <div
          className="absolute z-50 rounded-xl border border-slate-200 bg-white shadow-2xl p-4 pointer-events-auto backdrop-blur-sm"
          style={{
            top: `${hoveredEvent.position.top}px`,
            left: `${hoveredEvent.position.left}px`,
            width: "340px",
          }}
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          }}
          onMouseLeave={() => setHoveredEvent(null)}
        >
          <div className="mb-3 border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              {hoveredEvent.event.title}
            </h3>
            <p className="text-xs text-slate-600">
              {new Intl.DateTimeFormat("ru-RU", {
                day: "numeric",
                month: "long",
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
          
          {hoveredEvent.event.description && (
            <div className="mb-3 border-b border-slate-100 pb-3">
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Описание</p>
              <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                {hoveredEvent.event.description}
              </p>
            </div>
          )}
          
          {hoveredEvent.event.participants && hoveredEvent.event.participants.length > 0 && (
            <div className="mb-3 border-b border-slate-100 pb-3">
              <p className="text-xs font-semibold text-slate-700 mb-1.5">
                Участники ({hoveredEvent.event.participants.length})
              </p>
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
                  const status = participant.response_status || "needs_action";
                  
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
                          statusColors[status] || statusColors.needs_action
                        }`}
                      >
                        {statusLabels[status] || statusLabels.needs_action}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {hoveredEvent.event.room_id && (
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
          )}
        </div>
      )}
    </div>
  );
}

