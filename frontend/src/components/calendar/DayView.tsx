"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventRecord } from "@/types/event.types";
import type { Room } from "@/types/room.types";
import { formatDate, parseUTC, formatTimeInTimeZone, getTimeInTimeZone, MOSCOW_TIMEZONE, getCurrentMoscowDate, isSameDayInMoscow } from "@/lib/utils/dateUtils";
import { MINUTES_IN_DAY } from "@/lib/constants";
import { useTheme } from "@/context/ThemeContext";

// Яркие градиенты для событий в тёмной теме (вдохновлено Bybit)
const DARK_EVENT_COLORS = [
  { bg: "linear-gradient(135deg, rgba(14, 203, 129, 0.25) 0%, rgba(16, 185, 129, 0.15) 100%)", border: "#0ecb81", text: "#34d399" },
  { bg: "linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(139, 92, 246, 0.15) 100%)", border: "#818cf8", text: "#a5b4fc" },
  { bg: "linear-gradient(135deg, rgba(252, 213, 53, 0.2) 0%, rgba(245, 158, 11, 0.12) 100%)", border: "#fcd535", text: "#fde047" },
  { bg: "linear-gradient(135deg, rgba(236, 72, 153, 0.25) 0%, rgba(244, 114, 182, 0.15) 100%)", border: "#ec4899", text: "#f9a8d4" },
  { bg: "linear-gradient(135deg, rgba(6, 182, 212, 0.25) 0%, rgba(34, 211, 238, 0.15) 100%)", border: "#06b6d4", text: "#67e8f9" },
  { bg: "linear-gradient(135deg, rgba(249, 115, 22, 0.25) 0%, rgba(251, 146, 60, 0.15) 100%)", border: "#f97316", text: "#fdba74" },
];

function getDarkEventColor(eventId: string, index: number) {
  const hash = eventId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return DARK_EVENT_COLORS[(hash + index) % DARK_EVENT_COLORS.length];
}

interface DayViewProps {
  day: Date;
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
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const HOUR_HEIGHT = 60;
  const DAY_HEIGHT = 24 * HOUR_HEIGHT;
  const moscowToday = getCurrentMoscowDate();
  const isToday = isSameDayInMoscow(day, moscowToday);
  const dragInfo = useRef<{ event: EventRecord; offsetMinutes: number } | null>(null);
  const draggingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  
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
      setPendingStatusUpdate({ eventId: event.id, userId, status, event });
      setShowRecurringDialog(true);
    } else {
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
      await onUpdateParticipantStatus(eventId, userId, status);
    } else if (applyTo === "all") {
      const parentId = event.recurrence_parent_id || event.id;
      const seriesEvents = events.filter(e => 
        e.id === parentId || e.recurrence_parent_id === parentId
      );
      
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
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getCurrentMoscowDate());
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
  
  // Получаем компоненты дня в московском времени для использования в handleDrop
  const dayMoscowComponents = useMemo(() => {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    return getTimeInTimeZone(dayStart, MOSCOW_TIMEZONE);
  }, [day]);

  const dayEvents = useMemo(() => {
    // Нормализуем день: устанавливаем время на полдень для корректного сравнения
    const normalizedDay = new Date(day);
    normalizedDay.setHours(12, 0, 0, 0);
    const dayMoscow = getTimeInTimeZone(normalizedDay, MOSCOW_TIMEZONE);
    
    return events.filter((event) => {
      const eventStart = parseUTC(event.starts_at);
      // Получаем компоненты даты события в московском времени
      const eventStartMoscow = getTimeInTimeZone(eventStart, MOSCOW_TIMEZONE);
      // Сравниваем даты напрямую по компонентам
      return (
        eventStartMoscow.year === dayMoscow.year &&
        eventStartMoscow.month === dayMoscow.month &&
        eventStartMoscow.day === dayMoscow.day
      );
    });
  }, [events, day]);
  
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
    
    // Используем компоненты дня в московском времени, которые уже были вычислены
    // Это гарантирует правильный день без сдвига
    const dayMoscow = dayMoscowComponents;
    
    // Создаем новую дату в московском времени (с секундами для корректного парсинга)
    const pad = (n: number) => String(n).padStart(2, '0');
    const newStartStr = `${dayMoscow.year}-${pad(dayMoscow.month + 1)}-${pad(dayMoscow.day)}T${pad(dropHour)}:${pad(dropMinute)}:00+03:00`;
    const newStart = new Date(newStartStr);
    
    onEventMove(dragInfo.current.event, newStart);
    dragInfo.current = null;
    draggingRef.current = false;
  }, [onEventMove, HOUR_HEIGHT, dayMoscowComponents]);
  
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
    
    // Передаем также строки дат для правильной интерпретации в модальном окне
    onTimeSlotClick(day, startTime, endTime, startDateStr, endDateStr);
  }, [day, onTimeSlotClick]);
  
  useEffect(() => {
    if (isToday && scrollContainerRef.current) {
      const now = getCurrentMoscowDate();
      const moscowTime = getTimeInTimeZone(now, MOSCOW_TIMEZONE);
      const scrollPosition = (moscowTime.hour * HOUR_HEIGHT) - 200;
      scrollContainerRef.current.scrollTop = Math.max(0, scrollPosition);
    }
  }, [isToday, HOUR_HEIGHT]);
  
  const formatTime = useCallback((date: Date) => {
    return formatTimeInTimeZone(date, MOSCOW_TIMEZONE);
  }, []);
  
  const currentTimeInfo = useMemo(() => {
    if (!isToday) return null;
    
    const now = getCurrentMoscowDate();
    const moscowTime = getTimeInTimeZone(now, MOSCOW_TIMEZONE);
    const position = (moscowTime.hour * HOUR_HEIGHT) + (moscowTime.minute / 60 * HOUR_HEIGHT);
    const timeStr = `${String(moscowTime.hour).padStart(2, '0')}:${String(moscowTime.minute).padStart(2, '0')}`;
    
    return { position, timeStr };
  }, [isToday, currentTime, HOUR_HEIGHT]);
  
  const getCurrentTimePosition = currentTimeInfo?.position ?? null;
  
  const dayName = useMemo(() => {
    return new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: MOSCOW_TIMEZONE,
    }).format(day);
  }, [day]);
  
  return (
    <>
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
      
      <div className="flex flex-col h-full">
        <div className={`flex-shrink-0 px-4 py-3 border-b ${isDark ? "border-[#2b3139] bg-[#181a20]" : "border-slate-200 bg-white"}`}>
          <h2 className={`text-lg font-semibold capitalize ${isDark ? "text-[#eaecef]" : "text-slate-900"}`}>{dayName}</h2>
        </div>
        
        <div 
          ref={scrollContainerRef}
          className={`flex-1 overflow-y-auto relative ${isDark ? "bg-[#0b0e11]" : ""}`}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="relative" style={{ minHeight: `${DAY_HEIGHT}px` }}>
            {/* Time grid */}
            <div className="absolute inset-0">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className={`border-t ${isDark ? "border-[#2b3139]" : "border-slate-100"}`}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  <div className="flex h-full">
                    <div className={`w-20 flex-shrink-0 px-2 py-1 text-xs ${isDark ? "text-[#848e9c]" : "text-slate-500"}`}>
                      {hour.toString().padStart(2, '0')}:00
                    </div>
                    <div 
                      className={`flex-1 border-l cursor-pointer transition-colors ${
                        isDark ? "border-[#2b3139] hover:bg-[#1e2329]" : "border-slate-100 hover:bg-slate-50"
                      }`}
                      onClick={() => handleTimeSlotClick(hour, 0)}
                    />
                  </div>
                </div>
              ))}
            </div>
            
            {/* Current time indicator */}
            {currentTimeInfo && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none"
                style={{ top: `${currentTimeInfo.position}px` }}
              >
                <div className="flex items-center">
                  <div className="w-20 flex-shrink-0 flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-md animate-pulse" />
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm ${
                      isDark 
                        ? "bg-red-500/90 text-white" 
                        : "bg-red-500 text-white"
                    }`}>
                      {currentTimeInfo.timeStr}
                    </span>
                  </div>
                  <div className="flex-1 h-0.5 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                </div>
              </div>
            )}
            
            {/* Events */}
            {dayEvents.map((event, index) => {
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
                const now = getCurrentMoscowDate();
                const diff = eventStart.getTime() - now.getTime();
                return diff > 0 && diff <= 15 * 60 * 1000;
              })();
              
              // Получаем цвет для тёмной темы
              const darkColor = isDark ? getDarkEventColor(event.id, index) : null;
              
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
                  className={`absolute left-20 right-4 rounded-lg border p-1.5 text-xs shadow-md transition-all duration-200 ${
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
                          : needsAction
                            ? isDark
                              ? "border-2 border-[#fcd535] bg-white cursor-pointer hover:shadow-xl hover:scale-[1.02] animate-pulse-subtle"
                              : "border-2 border-amber-400 bg-white cursor-pointer hover:shadow-lg"
                            : isStartingSoon 
                              ? isDark
                                ? "event-vibrating border-2 cursor-pointer hover:shadow-xl hover:scale-[1.02]"
                                : "event-vibrating border-lime-500 border-2 cursor-pointer hover:shadow-lg"
                              : isDark
                                ? "border-l-[3px] cursor-pointer hover:shadow-xl hover:scale-[1.02]"
                                : "border-slate-200 cursor-pointer hover:shadow-lg"
                  }`}
                  style={{
                    top: `${topPx}px`,
                    height: `${heightPx}px`,
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
                            : needsAction
                              ? "white"
                              : isStartingSoon 
                                ? event.department_color 
                                  ? `${event.department_color}40`
                                  : `${accent}40`
                                : event.department_color
                                  ? `${event.department_color}20`
                                  : `${accent}20`,
                      borderColor: event.department_color && !isUnavailable && !isAvailable && !isBookedSlot && !isStartingSoon && !needsAction
                        ? event.department_color
                        : undefined,
                    } : {}),
                    // Специальные состояния в тёмной теме
                    ...(isDark && isUnavailable ? { background: "rgba(100, 116, 139, 0.3)" } : {}),
                    ...(isDark && isAvailable ? { background: "rgba(16, 185, 129, 0.2)" } : {}),
                    ...(isDark && isBookedSlot ? { background: "rgba(249, 115, 22, 0.25)", borderColor: "#f97316" } : {}),
                    ...(isDark && isStartingSoon && !needsAction && darkColor ? {
                      borderColor: "#fcd535",
                      background: "linear-gradient(135deg, rgba(252, 213, 53, 0.3) 0%, rgba(245, 158, 11, 0.2) 100%)",
                      boxShadow: "0 0 15px rgba(252, 213, 53, 0.4)",
                    } : {}),
                    // needsAction ВСЕГДА должен быть белым - применяем последним для перезаписи
                    ...(needsAction ? {
                      background: "#ffffff",
                      borderColor: "#fcd535",
                      boxShadow: isDark ? "0 0 20px rgba(252, 213, 53, 0.6), 0 0 40px rgba(252, 213, 53, 0.3)" : "0 4px 12px rgba(251, 191, 36, 0.3)",
                    } : {}),
                  }}
                >
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
                                : isDark ? "text-white" : "text-slate-900"
                        }`}
                        style={isDark && darkColor && !isUnavailable && !isAvailable && !isBookedSlot ? { color: darkColor.text } : undefined}
                      >
                        {isUnavailable ? "Недоступен" : isAvailable ? event.title : isBookedSlot ? event.title : event.title}
                      </p>
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
                    </div>
                    {/* Индикаторы вложений и комментариев */}
                    <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
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
                  {!isUnavailable && !isAvailable && !isBookedSlot && (
                    <p className={`text-[0.65rem] leading-tight truncate mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      {formatTime(parseUTC(event.starts_at))} - {formatTime(parseUTC(event.ends_at))}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Всплывающее окно с деталями события - аналогично WeekView */}
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
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
            }
          }}
          onMouseLeave={handleEventMouseLeave}
        >
          {/* Заголовок события */}
          <div className="mb-3 border-b border-slate-100 pb-3 flex-shrink-0">
            <p className="text-sm font-semibold text-slate-900 mb-1 line-clamp-2 break-words">{hoveredEvent.event.title}</p>
            <p className="text-xs text-slate-500">
              {formatTimeInTimeZone(parseUTC(hoveredEvent.event.starts_at), MOSCOW_TIMEZONE)}{" "}
              —{" "}
              {formatTimeInTimeZone(parseUTC(hoveredEvent.event.ends_at), MOSCOW_TIMEZONE)}
            </p>
          </div>
          
          {/* Описание события */}
          {hoveredEvent.event.description && hoveredEvent.event.description.trim().length > 0 && (
            <div className="mb-3 border-b border-slate-100 pb-3 flex-shrink-0">
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Описание</p>
              <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 break-words">
                {hoveredEvent.event.description}
              </p>
            </div>
          )}
          
          {/* Переговорка */}
          {hoveredEvent.event.room_id && (
            <div className="mb-3 border-b border-slate-100 pb-3 flex-shrink-0">
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Переговорка</p>
              <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
                <span className="text-lg flex-shrink-0">🏢</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {rooms.find((r) => r.id === hoveredEvent.event.room_id)?.name || "Переговорка"}
                  </p>
                  {rooms.find((r) => r.id === hoveredEvent.event.room_id)?.location && (
                    <p className="text-[0.65rem] text-slate-500 mt-0.5 truncate">
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
                <p className="text-xs font-semibold text-slate-700 mb-2">
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
                            className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm hover:scale-110 transition-transform cursor-pointer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                              if (fallback) fallback.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center border-2 border-white shadow-sm hover:scale-110 transition-transform cursor-pointer ${avatarUrl ? 'hidden' : ''}`}>
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
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center border-2 border-white shadow-sm">
                      <span className="text-[0.65rem] font-semibold text-slate-600">
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
                  const statusColors: Record<string, string> = {
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
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {participant.full_name || participant.email}
                          </p>
                          {orgAbbr ? (
                            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[0.6rem] font-semibold text-slate-700 flex-shrink-0">
                              {orgAbbr}
                            </span>
                          ) : null}
                        </div>
                        {participant.full_name ? (
                          <p className="text-[0.65rem] text-slate-500 truncate">
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
                  <p className="text-[0.65rem] text-slate-500 text-center pt-1">
                    и ещё {hoveredEvent.event.participants.length - 8} участников
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

