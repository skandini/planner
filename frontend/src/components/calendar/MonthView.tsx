"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { EventRecord } from "@/types/event.types";
import type { Room } from "@/types/room.types";
import { addDays, parseUTC } from "@/lib/utils/dateUtils";
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
}: MonthViewProps) {
  const currentMonth = selectedDate.getMonth();
  
  // Состояние для всплывающего окна с деталями события
  const [hoveredEvent, setHoveredEvent] = useState<{
    event: EventRecord;
    position: { top: number; left: number };
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleEventMouseEnter = useCallback((event: EventRecord, element: HTMLDivElement) => {
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
      const rect = element.getBoundingClientRect();
      const container = element.closest('[class*="grid"]') || element.closest('div');
      const containerRect = container?.getBoundingClientRect();
      
      if (!containerRect) return;
      
      const tooltipWidth = 320;
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
      
      setHoveredEvent({
        event,
        position: { top, left },
      });
    }, 300);
  }, [hoveredEvent]);
  
  const handleEventMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredEvent(null);
    }, 100);
  }, []);
  
  const handleTooltipMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  }, []);
  
  const handleTooltipMouseLeave = useCallback(() => {
    setHoveredEvent(null);
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
        // Создаём границы дня в локальном времени
        const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
        const dayEnd = addDays(dayStart, 1);
        // События уже в локальном времени (parseUTC конвертирует UTC в локальное)
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
      {loading && (
        <p className="mb-4 text-sm text-slate-400">Загружаем события…</p>
      )}
      <div className="grid grid-cols-7 gap-3 text-xs uppercase tracking-[0.3em] text-slate-500">
        {WEEKDAY_LABELS.map((label) => (
          <p key={label}>{label}</p>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-3">
        {days.map((day) => {
          const key = day.toDateString();
          const dayEvents = eventsByDay.get(key) ?? [];
          const isCurrentMonth = day.getMonth() === currentMonth;
          const isToday = new Date().toDateString() === key;

          return (
            <button
              type="button"
              key={key}
              onClick={() => onSelectDate(new Date(day))}
              className={`rounded-2xl border p-3 text-left transition ${
                isCurrentMonth
                  ? "border-slate-200 bg-white"
                  : "border-slate-100 bg-slate-50 text-slate-500"
              } ${isToday ? "ring-2 ring-lime-400" : ""}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold text-slate-900">
                  {day.getDate().toString().padStart(2, "0")}
                </p>
                {isToday && (
                  <span className="rounded-full bg-lime-100 px-2 py-1 text-[0.65rem] text-lime-600">
                    сегодня
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-1 relative">
                {dayEvents.slice(0, 3).map((event) => {
                  // Проверяем статус текущего пользователя для события
                  const userParticipant = currentUserEmail && event.participants
                    ? event.participants.find((p) => p.email === currentUserEmail)
                    : null;
                  const isAccepted = userParticipant?.response_status === "accepted";
                  
                  return (
                    <div
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      onMouseEnter={(e) => handleEventMouseEnter(event, e.currentTarget)}
                      onMouseLeave={handleEventMouseLeave}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1 text-[0.65rem] transition ${
                        isAccepted
                          ? "bg-gradient-to-r from-lime-100 to-emerald-100 border border-lime-300 hover:from-lime-200 hover:to-emerald-200 shadow-sm"
                          : "bg-slate-100 hover:bg-slate-200"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isAccepted ? "ring-2 ring-lime-400" : ""
                        }`}
                        style={{ background: isAccepted ? accent : accent }}
                      />
                      <span className={`truncate ${
                        isAccepted ? "font-semibold text-slate-900" : "text-slate-700"
                      }`}>
                        {event.title}
                      </span>
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
          className="absolute z-50 rounded-xl border border-slate-200 bg-white shadow-[0_10px_40px_rgba(15,23,42,0.2)] p-4 pointer-events-auto"
          style={{
            top: `${hoveredEvent.position.top}px`,
            left: `${hoveredEvent.position.left}px`,
            width: "320px",
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-slate-900">
              {hoveredEvent.event.title}
            </h3>
            <p className="mt-1 text-xs text-slate-600">
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
            <p className="mb-2 text-xs text-slate-600 line-clamp-2">
              {hoveredEvent.event.description}
            </p>
          )}
          
          {hoveredEvent.event.participants && hoveredEvent.event.participants.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-xs font-semibold text-slate-700">
                Участники ({hoveredEvent.event.participants.length}):
              </p>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {hoveredEvent.event.participants.map((participant) => {
                  const statusLabels: Record<string, string> = {
                    accepted: "Принял",
                    declined: "Отклонил",
                    tentative: "Возможно",
                    pending: "Нет ответа",
                    needs_action: "Нет ответа",
                  };
                  const statusColors: Record<string, string> = {
                    accepted: "bg-lime-100 text-lime-700 border-lime-300",
                    declined: "bg-red-100 text-red-700 border-red-300",
                    tentative: "bg-amber-100 text-amber-700 border-amber-300",
                    pending: "bg-slate-100 text-slate-600 border-slate-300",
                    needs_action: "bg-slate-100 text-slate-600 border-slate-300",
                  };
                  const status = participant.response_status || "needs_action";
                  
                  return (
                    <div
                      key={participant.user_id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2"
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
          
          {hoveredEvent.event.location && (
            <p className="text-xs text-slate-500">
              📍 {hoveredEvent.event.location}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

