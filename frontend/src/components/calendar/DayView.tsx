"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventRecord } from "@/types/event.types";
import type { Room } from "@/types/room.types";
import { formatDate, parseUTC, formatTimeInTimeZone, getTimeInTimeZone, MOSCOW_TIMEZONE } from "@/lib/utils/dateUtils";
import { MINUTES_IN_DAY } from "@/lib/constants";

interface DayViewProps {
  day: Date;
  events: EventRecord[];
  loading: boolean;
  accent: string;
  onEventClick: (event: EventRecord) => void;
  rooms: Room[];
  onEventMove?: (event: EventRecord, newStart: Date) => void;
  onTimeSlotClick?: (date: Date, startTime: Date, endTime: Date) => void;
  onUpdateParticipantStatus?: (eventId: string, userId: string, status: string) => Promise<void>;
  currentUserEmail?: string;
  users?: Array<{ id: string; email: string; avatar_url: string | null; full_name: string | null }>;
  apiBaseUrl?: string;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
}

export function DayView({
  day,
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
}: DayViewProps) {
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const HOUR_HEIGHT = 60;
  const DAY_HEIGHT = 24 * HOUR_HEIGHT;
  const todayKey = new Date().toDateString();
  const dayKey = day.toDateString();
  const isToday = todayKey === dayKey;
  const dragInfo = useRef<{ event: EventRecord; offsetMinutes: number } | null>(null);
  const draggingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  
  const [currentTime, setCurrentTime] = useState(() => new Date());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  const [hoveredEvent, setHoveredEvent] = useState<{
    event: EventRecord;
    position: { top: number; left: number };
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const mousePositionRef = useRef<{ x: number; y: number } | null>(null);
  
  const handleEventMouseMove = useCallback((event: EventRecord, e: React.MouseEvent<HTMLDivElement>) => {
    if (!hoveredEvent || hoveredEvent.event.id !== event.id) {
      return;
    }
    
    const tooltipWidth = 320;
    const tooltipHeight = 400;
    const offset = 15;
    
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    let left = mouseX - tooltipWidth - offset;
    let top = mouseY;
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (left < 10) {
      left = mouseX + offset;
    }
    
    const maxLeft = viewportWidth - tooltipWidth - 10;
    left = Math.max(10, Math.min(maxLeft, left));
    
    const maxTop = viewportHeight - tooltipHeight - 10;
    top = Math.max(10, Math.min(maxTop, top));
    
    setHoveredEvent({
      event,
      position: { top, left },
    });
  }, [hoveredEvent]);
  
  const handleEventMouseEnter = useCallback((event: EventRecord, element: HTMLDivElement) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    hoverTimeoutRef.current = setTimeout(() => {
      const rect = element.getBoundingClientRect();
      const tooltipWidth = 320;
      const tooltipHeight = 400;
      const offset = 15;
      
      let left = rect.right + offset;
      let top = rect.top;
      
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      if (left + tooltipWidth > viewportWidth - 10) {
        left = rect.left - tooltipWidth - offset;
      }
      
      const maxLeft = viewportWidth - tooltipWidth - 10;
      left = Math.max(10, Math.min(maxLeft, left));
      
      const maxTop = viewportHeight - tooltipHeight - 10;
      top = Math.max(10, Math.min(maxTop, top));
      
      setHoveredEvent({
        event,
        position: { top, left },
      });
    }, 300);
  }, []);
  
  const handleEventMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredEvent(null);
  }, []);
  
  const dayEvents = useMemo(() => {
    return events.filter((event) => {
      const eventStart = parseUTC(event.starts_at);
      return eventStart.toDateString() === dayKey;
    });
  }, [events, dayKey]);
  
  const getEventPosition = useCallback((event: EventRecord) => {
    const eventStart = parseUTC(event.starts_at);
    const eventEnd = parseUTC(event.ends_at);
    
    // Получаем компоненты времени в московском часовом поясе
    const eventStartMoscow = getTimeInTimeZone(eventStart, MOSCOW_TIMEZONE);
    const eventEndMoscow = getTimeInTimeZone(eventEnd, MOSCOW_TIMEZONE);
    
    // Получаем компоненты дня в московском часовом поясе
    const dayMoscow = getTimeInTimeZone(day, MOSCOW_TIMEZONE);
    
    const startMinutes = (eventStartMoscow.hour * 60) + eventStartMoscow.minute;
    const endMinutes = (eventEndMoscow.hour * 60) + eventEndMoscow.minute;
    const duration = endMinutes - startMinutes;
    
    const topPx = (startMinutes / 60) * HOUR_HEIGHT;
    const heightPx = (duration / 60) * HOUR_HEIGHT;
    
    return { topPx, heightPx, startMinutes, endMinutes };
  }, [day, HOUR_HEIGHT]);
  
  const handleCardClick = useCallback((event: EventRecord) => {
    if (event.status === "unavailable" || event.status === "available" || event.status === "booked_slot") {
      return;
    }
    onEventClick(event);
  }, [onEventClick]);
  
  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, event: EventRecord) => {
    if (event.status === "unavailable" || event.status === "available" || event.status === "booked_slot") {
      e.preventDefault();
      return;
    }
    
    if (!onEventMove) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const startY = e.clientY;
    const { topPx } = getEventPosition(event);
    const offsetMinutes = Math.round((startY - (rect.top - rect.height / 2 + topPx)) / HOUR_HEIGHT * 60);
    
    dragInfo.current = { event, offsetMinutes };
    draggingRef.current = true;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
  }, [onEventMove, getEventPosition, HOUR_HEIGHT]);
  
  const handleDragEnd = useCallback(() => {
    dragInfo.current = null;
    draggingRef.current = false;
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!dragInfo.current || !onEventMove) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const dropY = e.clientY - rect.top;
    
    // Вычисляем минуты от начала дня в московском времени
    const dropMinutes = (dropY / HOUR_HEIGHT) * 60;
    // Округляем до 5 минут для привязки
    const roundedMinutes = Math.round(dropMinutes / 5) * 5;
    const dropHour = Math.floor(roundedMinutes / 60);
    const dropMinute = roundedMinutes % 60;
    
    // Получаем компоненты дня в московском времени
    const dayMoscow = getTimeInTimeZone(day, MOSCOW_TIMEZONE);
    
    // Создаем новую дату в московском времени
    const pad = (n: number) => String(n).padStart(2, '0');
    const newStartStr = `${dayMoscow.year}-${pad(dayMoscow.month + 1)}-${pad(dayMoscow.day)}T${pad(dropHour)}:${pad(dropMinute)}+03:00`;
    const newStart = new Date(newStartStr);
    
    onEventMove(dragInfo.current.event, newStart);
    dragInfo.current = null;
    draggingRef.current = false;
  }, [onEventMove, HOUR_HEIGHT, day]);
  
  const handleTimeSlotClick = useCallback((hour: number, minute: number = 0) => {
    if (!onTimeSlotClick) return;
    
    // Получаем компоненты дня в московском времени
    const dayMoscow = getTimeInTimeZone(day, MOSCOW_TIMEZONE);
    
    // Создаем время, интерпретируя его как московское время
    const pad = (n: number) => String(n).padStart(2, '0');
    const startDateStr = `${dayMoscow.year}-${pad(dayMoscow.month + 1)}-${pad(dayMoscow.day)}T${pad(hour)}:${pad(minute)}`;
    const endHour = (hour + 1) % 24;
    const endDateStr = `${dayMoscow.year}-${pad(dayMoscow.month + 1)}-${pad(dayMoscow.day)}T${pad(endHour)}:00`;
    
    // Конвертируем московское время в Date объекты (интерпретируем как московское и конвертируем в UTC)
    const startTime = new Date(`${startDateStr}+03:00`);
    const endTime = new Date(`${endDateStr}+03:00`);
    
    onTimeSlotClick(day, startTime, endTime);
  }, [day, onTimeSlotClick]);
  
  useEffect(() => {
    if (isToday && scrollContainerRef.current) {
      const now = new Date();
      const moscowTime = getTimeInTimeZone(now, MOSCOW_TIMEZONE);
      const scrollPosition = (moscowTime.hour * HOUR_HEIGHT) - 200;
      scrollContainerRef.current.scrollTop = Math.max(0, scrollPosition);
    }
  }, [isToday, HOUR_HEIGHT]);
  
  const formatTime = useCallback((date: Date) => {
    return formatTimeInTimeZone(date, MOSCOW_TIMEZONE);
  }, []);
  
  const getCurrentTimePosition = useMemo(() => {
    if (!isToday) return null;
    
    const now = new Date();
    const moscowTime = getTimeInTimeZone(now, MOSCOW_TIMEZONE);
    const position = (moscowTime.hour * HOUR_HEIGHT) + (moscowTime.minute / 60 * HOUR_HEIGHT);
    
    return position;
  }, [isToday, currentTime, HOUR_HEIGHT]);
  
  const dayName = useMemo(() => {
    return new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(day);
  }, [day]);
  
  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 bg-white">
          <h2 className="text-lg font-semibold text-slate-900 capitalize">{dayName}</h2>
        </div>
        
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto relative"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="relative" style={{ minHeight: `${DAY_HEIGHT}px` }}>
            {/* Time grid */}
            <div className="absolute inset-0">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="border-t border-slate-100"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  <div className="flex h-full">
                    <div className="w-20 flex-shrink-0 px-2 py-1 text-xs text-slate-500">
                      {hour.toString().padStart(2, '0')}:00
                    </div>
                    <div 
                      className="flex-1 border-l border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => handleTimeSlotClick(hour, 0)}
                    />
                  </div>
                </div>
              ))}
            </div>
            
            {/* Current time indicator */}
            {getCurrentTimePosition !== null && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none"
                style={{ top: `${getCurrentTimePosition}px` }}
              >
                <div className="flex items-center">
                  <div className="w-20 flex-shrink-0">
                    <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-md" />
                  </div>
                  <div className="flex-1 h-0.5 bg-red-500" />
                </div>
              </div>
            )}
            
            {/* Events */}
            {dayEvents.map((event) => {
              const isUnavailable = event.status === "unavailable";
              const isAvailable = event.status === "available";
              const isBookedSlot = event.status === "booked_slot";
              const { topPx, heightPx } = getEventPosition(event);
              
              const userParticipant = currentUserEmail && event.participants
                ? event.participants.find((p) => p.email === currentUserEmail)
                : null;
              const needsAction = userParticipant && 
                (userParticipant.response_status === "needs_action" || 
                 userParticipant.response_status === "pending" ||
                 !userParticipant.response_status);
              
              const isStartingSoon = (() => {
                const eventStart = parseUTC(event.starts_at);
                const now = new Date();
                const diff = eventStart.getTime() - now.getTime();
                return diff > 0 && diff <= 15 * 60 * 1000;
              })();
              
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
                    if (!isUnavailable && !isAvailable && !isBookedSlot) {
                      handleCardClick(event);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (!isUnavailable && !isAvailable && !isBookedSlot) {
                      const hasContent = (event.participants && event.participants.length > 0) ||
                                       (event.description && event.description.trim().length > 0) ||
                                       event.room_id;
                      if (hasContent) {
                        handleEventMouseEnter(event, e.currentTarget);
                      }
                    }
                  }}
                  onMouseMove={(e) => {
                    if (!isUnavailable && !isAvailable && !isBookedSlot && hoveredEvent?.event.id === event.id) {
                      handleEventMouseMove(event, e);
                    }
                  }}
                  onMouseLeave={handleEventMouseLeave}
                  draggable={Boolean(onEventMove) && !event.all_day && !isUnavailable && !isAvailable && !isBookedSlot}
                  onDragStart={(dragEvent) => {
                    if (!isUnavailable && !isAvailable && !isBookedSlot) {
                      handleDragStart(dragEvent, event);
                    }
                  }}
                  onDragEnd={handleDragEnd}
                  className={`absolute left-20 right-4 rounded-lg border p-1.5 text-xs shadow-md transition ${
                    isUnavailable
                      ? "cursor-default border-slate-300 bg-slate-100 z-5"
                      : isAvailable
                        ? "cursor-default border-green-300 bg-green-50 z-15"
                        : isBookedSlot
                          ? "cursor-default border-orange-400 bg-orange-100 z-10"
                          : isStartingSoon 
                          ? "event-vibrating border-lime-500 border-2 cursor-pointer hover:shadow-lg" 
                          : needsAction
                            ? "border-2 border-slate-300 bg-white cursor-pointer hover:shadow-lg"
                            : "border-slate-200 cursor-pointer hover:shadow-lg"
                  }`}
                  style={{
                    top: `${topPx}px`,
                    height: `${heightPx}px`,
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
                              : event.department_color
                                ? `${event.department_color}20`
                                : `${accent}20`,
                    borderColor: event.department_color && !isUnavailable && !isAvailable && !isBookedSlot && !isStartingSoon && !needsAction
                      ? event.department_color
                      : undefined,
                  }}
                >
                  <p className={`text-xs font-semibold leading-tight truncate ${isUnavailable ? "text-slate-600" : isAvailable ? "text-green-700" : isBookedSlot ? "text-orange-700" : "text-slate-900"}`}>
                    {isUnavailable ? "Недоступен" : isAvailable ? event.title : isBookedSlot ? event.title : event.title}
                  </p>
                  {isAvailable && event.description && event.description !== event.title && (
                    <p className="text-[0.65rem] text-green-600 leading-tight truncate mt-0.5">
                      {event.description}
                    </p>
                  )}
                  {isBookedSlot && event.description && event.description !== event.title && (
                    <p className="text-[0.65rem] text-orange-600 leading-tight truncate mt-0.5">
                      {event.description}
                    </p>
                  )}
                  {!isUnavailable && !isAvailable && !isBookedSlot && (
                    <p className="text-[0.65rem] text-slate-500 leading-tight truncate mt-0.5">
                      {formatTime(parseUTC(event.starts_at))} - {formatTime(parseUTC(event.ends_at))}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Event tooltip */}
      {hoveredEvent && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 p-4 max-w-sm"
          style={{
            top: `${hoveredEvent.position.top}px`,
            left: `${hoveredEvent.position.left}px`,
            pointerEvents: 'none',
          }}
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
            }
          }}
          onMouseLeave={handleEventMouseLeave}
        >
          <h3 className="font-semibold text-slate-900 mb-2 truncate">
            {hoveredEvent.event.title}
          </h3>
          {hoveredEvent.event.description && (
            <p className="text-sm text-slate-600 mb-2 line-clamp-2">
              {hoveredEvent.event.description}
            </p>
          )}
          <div className="text-xs text-slate-500 mb-2">
            {formatTime(parseUTC(hoveredEvent.event.starts_at))} - {formatTime(parseUTC(hoveredEvent.event.ends_at))}
          </div>
          {hoveredEvent.event.participants && hoveredEvent.event.participants.length > 0 && (
            <div className="text-xs text-slate-600 mb-2">
              <span className="font-medium">Участники:</span> {hoveredEvent.event.participants.slice(0, 3).map(p => p.full_name || p.email).join(', ')}
              {hoveredEvent.event.participants.length > 3 && ` +${hoveredEvent.event.participants.length - 3}`}
            </div>
          )}
          {hoveredEvent.event.room_online_meeting_url && (
            <a
              href={hoveredEvent.event.room_online_meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 px-3 py-1.5 bg-lime-500 text-white text-xs font-semibold rounded-lg hover:bg-lime-400 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              Присоединиться к встрече
            </a>
          )}
        </div>
      )}
    </>
  );
}

