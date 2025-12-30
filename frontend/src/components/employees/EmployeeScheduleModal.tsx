"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { EventRecord } from "@/types/event.types";
import type { UserProfile } from "@/types/user.types";
import type { Room } from "@/types/room.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { EVENT_ENDPOINT } from "@/lib/constants";

interface EmployeeScheduleModalProps {
  user: UserProfile | null;
  isOpen: boolean;
  onClose: () => void;
  authFetch: AuthenticatedFetch;
  onEventClick?: (event: EventRecord) => void;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  apiBaseUrl?: string;
  rooms?: Room[];
}

export function EmployeeScheduleModal({
  user,
  isOpen,
  onClose,
  authFetch,
  onEventClick,
  getUserOrganizationAbbreviation,
  apiBaseUrl = "",
  rooms = [],
}: EmployeeScheduleModalProps) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<EventRecord | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Понедельник
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  // Состояние для выделения времени (слотов)
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ dayIndex: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ dayIndex: number; y: number } | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ dayIndex: number; startY: number; endY: number; startTime: Date; endTime: Date } | null>(null);
  const selectionRef = useRef<HTMLDivElement | null>(null);
  const dayRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Загрузка событий сотрудника
  const loadEvents = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const from = new Date(currentWeekStart);
      from.setDate(from.getDate() - 7); // Загружаем на неделю раньше
      const to = new Date(currentWeekStart);
      to.setDate(to.getDate() + 14); // И на 2 недели вперед

      const url = new URL(EVENT_ENDPOINT);
      url.searchParams.set("from", from.toISOString());
      url.searchParams.set("to", to.toISOString());

      const response = await authFetch(url.toString(), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Не удалось загрузить события");
      }

      const allEvents: EventRecord[] = await response.json();
      // Фильтруем события, где пользователь является участником
      const userEvents = allEvents.filter(
        (event) =>
          event.participants?.some((p) => p.user_id === user.id)
      );
      setEvents(userEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки событий");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [user, currentWeekStart, authFetch]);

  useEffect(() => {
    if (isOpen && user) {
      loadEvents();
    }
  }, [isOpen, user, loadEvents]);

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Генерация дней недели - мемоизировано
  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  }, [currentWeekStart]);

  // Группировка событий по дням - мемоизировано
  const eventsByDay = useMemo(() => {
    return weekDays.reduce((acc, day) => {
      const dayKey = day.toISOString().split("T")[0];
      acc[dayKey] = events.filter((event) => {
        const eventDate = new Date(event.starts_at);
        return eventDate.toISOString().split("T")[0] === dayKey;
      });
      return acc;
    }, {} as Record<string, EventRecord[]>);
  }, [weekDays, events]);

  // Навигация по неделям
  const navigateWeek = (direction: "prev" | "next") => {
    const newWeekStart = new Date(currentWeekStart);
    newWeekStart.setDate(newWeekStart.getDate() + (direction === "next" ? 7 : -7));
    setCurrentWeekStart(newWeekStart);
  };

  const goToToday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
  };

  const formatTime = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  if (!isOpen || !user) return null;

  const getEventPosition = useCallback((event: EventRecord) => {
    const start = new Date(event.starts_at);
    const end = new Date(event.ends_at);
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    const minutesFromDayStart = (start.getTime() - dayStart.getTime()) / (1000 * 60);
    const duration = (end.getTime() - start.getTime()) / (1000 * 60);
    const pixelsPerHour = 40; // 40px на час для компактности (было 60px)
    const totalHeight = 960; // 24 часа * 40px (было 1440px)
    const top = (minutesFromDayStart / 60) * pixelsPerHour;
    const height = Math.max((duration / 60) * pixelsPerHour, 30); // Минимум 30px высоты (было 40px)
    return { top, height, totalHeight };
  }, []);

  const orgAbbr = useMemo(
    () => getUserOrganizationAbbreviation ? getUserOrganizationAbbreviation(user.id) : "",
    [getUserOrganizationAbbreviation, user.id]
  );

  const isToday = useCallback((date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }, []);

  const getRoomName = useCallback((roomId: string | null) => {
    if (!roomId) return null;
    const room = rooms.find((r) => r.id === roomId);
    return room?.name || null;
  }, [rooms]);

  // Функции для работы с выделением времени
  const pixelsPerHour = 40;
  const totalHeight = 960;

  const getTimeFromY = useCallback((y: number): Date => {
    const hours = (y / totalHeight) * 24;
    const minutes = Math.floor((hours % 1) * 60);
    const hoursInt = Math.floor(hours);
    return new Date(2000, 0, 1, hoursInt, minutes);
  }, []);

  const getYFromTime = useCallback((date: Date): number => {
    const hours = date.getHours() + date.getMinutes() / 60;
    return (hours / 24) * totalHeight;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>, dayIndex: number) => {
    // Проверяем, что клик не на событии
    const target = e.target as HTMLElement;
    if (target.closest('button[type="button"]')) return;
    
    if (e.button !== 0) return; // Только левая кнопка мыши
    e.preventDefault();
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    // Получаем родительский контейнер со скроллом
    const scrollContainer = e.currentTarget.closest('.overflow-y-auto');
    const scrollTop = scrollContainer ? (scrollContainer as HTMLElement).scrollTop : 0;
    const y = Math.max(0, Math.min(totalHeight, e.clientY - rect.top + scrollTop));
    
    setIsSelecting(true);
    setSelectionStart({ dayIndex, y });
    setSelectionEnd({ dayIndex, y });
    setSelectedSlot(null);
  }, [totalHeight]);

  // Глобальный обработчик для перемещения мыши
  useEffect(() => {
    if (!isSelecting || !selectionStart) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const dayElement = dayRefs.current[selectionStart.dayIndex];
      if (!dayElement) return;

      const rect = dayElement.getBoundingClientRect();
      // Получаем родительский контейнер со скроллом
      const scrollContainer = dayElement.closest('.overflow-y-auto');
      const scrollTop = scrollContainer ? (scrollContainer as HTMLElement).scrollTop : 0;
      const y = Math.max(0, Math.min(totalHeight, e.clientY - rect.top + scrollTop));
      setSelectionEnd({ dayIndex: selectionStart.dayIndex, y });
    };

    const handleGlobalMouseUp = () => {
      if (!isSelecting || !selectionStart || !selectionEnd) return;
      
      const startY = Math.min(selectionStart.y, selectionEnd.y);
      const endY = Math.max(selectionStart.y, selectionEnd.y);
      const minSlotHeight = 20; // Минимальная высота слота в пикселях
      
      if (Math.abs(endY - startY) < minSlotHeight) {
        setIsSelecting(false);
        setSelectionStart(null);
        setSelectionEnd(null);
        return;
      }

      const day = weekDays[selectionStart.dayIndex];
      const startTime = getTimeFromY(startY);
      const endTime = getTimeFromY(endY);
      
      const slotStart = new Date(day);
      slotStart.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
      
      const slotEnd = new Date(day);
      slotEnd.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);

      setSelectedSlot({
        dayIndex: selectionStart.dayIndex,
        startY,
        endY,
        startTime: slotStart,
        endTime: slotEnd,
      });
      
      setIsSelecting(false);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isSelecting, selectionStart, selectionEnd, weekDays, getTimeFromY, totalHeight]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>, dayIndex: number) => {
    if (!isSelecting || !selectionStart || selectionStart.dayIndex !== dayIndex) return;
    e.preventDefault();
    e.stopPropagation();
  }, [isSelecting, selectionStart]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>, dayIndex: number) => {
    if (!isSelecting || !selectionStart) return;
    e.preventDefault();
    e.stopPropagation();
  }, [isSelecting, selectionStart]);

  const handleCreateSlot = useCallback(() => {
    if (!selectedSlot || !onEventClick) return;
    
    // Создаем временное событие для предложения слота
    const now = new Date().toISOString();
    const slotEvent: EventRecord = {
      id: `slot-${Date.now()}`,
      title: "Предложенный слот",
      description: null,
      location: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      starts_at: selectedSlot.startTime.toISOString(),
      ends_at: selectedSlot.endTime.toISOString(),
      all_day: false,
      status: "confirmed",
      calendar_id: "",
      room_id: null,
      created_at: now,
      updated_at: now,
      participants: [],
      recurrence_rule: null,
      attachments: [],
    };
    
    onEventClick(slotEvent);
    setSelectedSlot(null);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [selectedSlot, onEventClick]);

  const handleCancelSelection = useCallback(() => {
    setSelectedSlot(null);
    setSelectionStart(null);
    setSelectionEnd(null);
    setIsSelecting(false);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        // Закрываем только если клик был именно на затемнение, а не на дочерние элементы
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-6xl h-[85vh] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок - компактный */}
        <div className="sticky top-0 z-10 border-b border-slate-200/60 bg-gradient-to-r from-slate-50/80 via-white to-slate-50/80 backdrop-blur-sm">
          <div className="px-3 py-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                {user.avatar_url ? (
                  <img
                    src={
                      apiBaseUrl && !user.avatar_url.startsWith("http")
                        ? `${apiBaseUrl}${user.avatar_url}`
                        : user.avatar_url
                    }
                    alt={user.full_name || user.email}
                    className="h-8 w-8 rounded-full object-cover border-2 border-white shadow-sm"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center border-2 border-white shadow-sm">
                    <span className="text-xs font-bold text-white">
                      {(user.full_name || user.email || "U")[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {user.full_name || user.email}
                  </h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {user.position && (
                      <span className="text-[0.65rem] text-slate-600">{user.position}</span>
                    )}
                    {orgAbbr && (
                      <span className="inline-flex items-center px-1 py-0.5 rounded text-[0.6rem] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {orgAbbr}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="rounded-lg border border-slate-200/60 bg-white/80 p-1.5 text-slate-400 transition-all hover:border-slate-300 hover:bg-white hover:text-slate-600"
                aria-label="Закрыть"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Навигация по неделям - компактная */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => navigateWeek("prev")}
                  className="rounded border border-slate-200/60 bg-white/80 px-1.5 py-0.5 text-[0.65rem] font-medium text-slate-700 hover:bg-white hover:border-slate-300 transition"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={goToToday}
                  className="rounded border border-slate-200/60 bg-white/80 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-700 hover:bg-white hover:border-slate-300 transition"
                >
                  Сегодня
                </button>
                <button
                  type="button"
                  onClick={() => navigateWeek("next")}
                  className="rounded border border-slate-200/60 bg-white/80 px-1.5 py-0.5 text-[0.65rem] font-medium text-slate-700 hover:bg-white hover:border-slate-300 transition"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <div className="ml-2 px-2 py-0.5 text-[0.65rem] font-bold text-slate-900 bg-gradient-to-r from-slate-50/80 to-white rounded border border-slate-200/60">
                  {currentWeekStart.toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  -{" "}
                  {new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                  })}
                </div>
              </div>
              {loading && (
                <div className="text-[0.65rem] text-slate-500 flex items-center gap-1">
                  <svg className="h-3 w-3 animate-spin text-lime-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Загрузка...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Контент - недельное расписание */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {error ? (
            <div className="p-4 text-center text-xs text-red-600">{error}</div>
          ) : (
            <div className="flex-1 flex flex-col p-2 overflow-hidden min-h-0">
              {/* Заголовки дней недели - компактные */}
              <div className="grid grid-cols-7 gap-1 mb-1 flex-shrink-0">
                {weekDays.map((day, index) => {
                  const dayName = day.toLocaleDateString("ru-RU", { weekday: "short" });
                  const dayNumber = day.getDate();
                  const isCurrentDay = isToday(day);
                  const dayEvents = eventsByDay[day.toISOString().split("T")[0]] || [];

                  return (
                    <div
                      key={index}
                      className={`text-center p-1.5 rounded border ${
                        isCurrentDay
                          ? "bg-gradient-to-br from-lime-50 to-lime-50/50 border-lime-300 shadow-sm"
                          : "bg-white/60 border-slate-200/60"
                      }`}
                    >
                      <div className="text-[0.6rem] font-semibold text-slate-600 uppercase mb-0.5">
                        {dayName}
                      </div>
                      <div
                        className={`text-xs font-bold ${
                          isCurrentDay ? "text-lime-700" : "text-slate-900"
                        }`}
                      >
                        {dayNumber}
                      </div>
                      {dayEvents.length > 0 && (
                        <div className="mt-0.5 text-[0.6rem] text-slate-500">
                          {dayEvents.length}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Сетка времени и событий - компактная */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="grid grid-cols-7 gap-1" style={{ height: "960px" }}>
                  {weekDays.map((day, dayIndex) => {
                    const dayKey = day.toISOString().split("T")[0];
                    const dayEvents = eventsByDay[dayKey] || [];
                    const isCurrentDay = isToday(day);

                    return (
                      <div
                        key={dayIndex}
                        ref={(el) => {
                          dayRefs.current[dayIndex] = el;
                          if (dayIndex === 0) selectionRef.current = el;
                        }}
                        className={`relative rounded-lg border h-full cursor-crosshair ${
                          isCurrentDay
                            ? "bg-lime-50/30 border-lime-200/60"
                            : "bg-white/40 border-slate-200/60"
                        }`}
                        onMouseDown={(e) => handleMouseDown(e, dayIndex)}
                        onMouseMove={(e) => handleMouseMove(e, dayIndex)}
                        onMouseUp={(e) => handleMouseUp(e, dayIndex)}
                      >
                      {/* Временные метки */}
                      <div className="absolute inset-0 pointer-events-none" style={{ height: "960px" }}>
                        {Array.from({ length: 24 }, (_, hour) => {
                          const hourTop = (hour / 24) * 960; // 960px общая высота
                          return (
                            <div
                              key={hour}
                              className="absolute left-0 right-0 border-t border-slate-200/30"
                              style={{ top: `${hourTop}px` }}
                            >
                              <span className="absolute left-0.5 text-[0.6rem] font-medium text-slate-400 -mt-1 bg-white/90 px-0.5 py-0 rounded text-[0.55rem]">
                                {hour.toString().padStart(2, "0")}:00
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Выделенная область (слот) */}
                      {selectedSlot && selectedSlot.dayIndex === dayIndex && (
                        <div
                          className="absolute left-0 right-0 z-20 bg-lime-200/40 border-2 border-lime-500 rounded pointer-events-none"
                          style={{
                            top: `${selectedSlot.startY}px`,
                            height: `${selectedSlot.endY - selectedSlot.startY}px`,
                            minHeight: "20px",
                          }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[0.65rem] font-bold text-lime-700 bg-white/90 px-2 py-0.5 rounded border border-lime-500">
                              {formatTime(selectedSlot.startTime.toISOString())} - {formatTime(selectedSlot.endTime.toISOString())}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Область выделения (во время перетаскивания) */}
                      {isSelecting && selectionStart && selectionEnd && selectionStart.dayIndex === dayIndex && (
                        <div
                          className="absolute left-0 right-0 z-25 bg-blue-200/50 border-2 border-blue-600 border-dashed rounded pointer-events-none shadow-lg"
                          style={{
                            top: `${Math.min(selectionStart.y, selectionEnd.y)}px`,
                            height: `${Math.abs(selectionEnd.y - selectionStart.y)}px`,
                            minHeight: "10px",
                          }}
                        >
                          <div className="absolute top-1 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white text-[0.65rem] font-bold px-2 py-0.5 rounded shadow-md whitespace-nowrap">
                            {(() => {
                              const startTime = getTimeFromY(Math.min(selectionStart.y, selectionEnd.y));
                              const endTime = getTimeFromY(Math.max(selectionStart.y, selectionEnd.y));
                              return `${formatTime(startTime.toISOString())} - ${formatTime(endTime.toISOString())}`;
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Прозрачный слой для выделения поверх событий */}
                      {isSelecting && (
                        <div 
                          className="absolute inset-0 z-30 pointer-events-none"
                          style={{ height: "960px" }}
                        />
                      )}

                      {/* События */}
                      <div className="relative z-10" style={{ height: "960px" }}>
                        {dayEvents.length === 0 ? (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-xs text-slate-400">Нет событий</span>
                          </div>
                        ) : (
                          dayEvents
                            .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
                          .map((event) => {
                            const { top, height } = getEventPosition(event);
                            const isAccepted = event.participants?.some(
                              (p) => p.user_id === user.id && p.response_status === "accepted"
                            );
                            const isDeclined = event.participants?.some(
                              (p) => p.user_id === user.id && p.response_status === "declined"
                            );

                            return (
                              <button
                                key={event.id}
                                type="button"
                                onClick={() => onEventClick?.(event)}
                                onMouseEnter={(e) => {
                                  // Очищаем таймер, если он был установлен
                                  if (hoverTimeoutRef.current) {
                                    clearTimeout(hoverTimeoutRef.current);
                                    hoverTimeoutRef.current = null;
                                  }
                                  setHoveredEvent(event);
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const modalRect = e.currentTarget.closest('[class*="fixed"]')?.getBoundingClientRect();
                                  if (modalRect) {
                                    setHoverPosition({
                                      x: rect.left + rect.width / 2,
                                      y: rect.top,
                                    });
                                  }
                                }}
                                onMouseLeave={() => {
                                  // Добавляем задержку перед скрытием tooltip
                                  hoverTimeoutRef.current = setTimeout(() => {
                                    setHoveredEvent(null);
                                  }, 200);
                                }}
                                onMouseMove={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setHoverPosition({
                                    x: rect.left + rect.width / 2,
                                    y: rect.top,
                                  });
                                }}
                                className={`absolute left-0.5 right-0.5 rounded border p-1 text-left transition-all hover:shadow-md hover:z-20 cursor-pointer ${
                                  isDeclined
                                    ? "bg-red-50/90 border-red-400/70 opacity-70"
                                    : isAccepted
                                    ? "bg-lime-100/90 border-lime-500/70 shadow-sm"
                                    : "bg-blue-50/90 border-blue-400/70"
                                }`}
                                onMouseDown={(e) => e.stopPropagation()}
                                onMouseUp={(e) => e.stopPropagation()}
                                style={{
                                  top: `${top}px`,
                                  height: `${height}px`,
                                  minHeight: "30px",
                                }}
                              >
                                <div className="text-[0.65rem] font-bold text-slate-900 truncate leading-tight">
                                  {event.title}
                                </div>
                                <div className="text-[0.6rem] font-medium text-slate-700 leading-tight">
                                  {formatTime(event.starts_at)}-{formatTime(event.ends_at)}
                                </div>
                                {getRoomName(event.room_id) && (
                                  <div className="text-[0.6rem] text-slate-600 truncate leading-tight">
                                    {getRoomName(event.room_id)}
                                  </div>
                                )}
                                {isDeclined && (
                                  <div className="text-[0.6rem] font-bold text-red-700 leading-tight">
                                    ✕
                                  </div>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                  })}
                </div>
              </div>

              {/* Легенда и кнопка создания слота */}
              <div className="mt-1 flex items-center justify-between gap-2 text-[0.65rem] flex-shrink-0 border-t border-slate-200/60 pt-1.5">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded bg-lime-100 border border-lime-500"></div>
                    <span className="text-slate-600 font-medium">Принято</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded bg-blue-50 border border-blue-400"></div>
                    <span className="text-slate-600 font-medium">Ожидает</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded bg-red-50 border border-red-400 opacity-70"></div>
                    <span className="text-slate-600 font-medium">Отклонено</span>
                  </div>
                  {!selectedSlot && !isSelecting && (
                    <div className="ml-2 text-slate-500 italic text-[0.6rem]">
                      💡 Зажмите и перетащите для выделения времени
                    </div>
                  )}
                  {isSelecting && (
                    <div className="ml-2 text-blue-600 font-semibold text-[0.6rem]">
                      Выделение времени...
                    </div>
                  )}
                </div>
                
                {selectedSlot && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCancelSelection}
                      className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-[0.65rem] font-medium transition"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateSlot}
                      className="px-2 py-1 rounded border border-lime-500 bg-lime-500 text-white hover:bg-lime-600 text-[0.65rem] font-medium transition"
                    >
                      Создать слот
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tooltip с информацией о событии */}
      {hoveredEvent && (
        <div
          className="fixed z-[70] bg-white border-2 border-slate-200/80 rounded-xl shadow-2xl p-4 max-w-sm pointer-events-auto"
          style={{
            left: `${Math.min(Math.max(hoverPosition.x, 200), window.innerWidth - 200)}px`,
            top: `${Math.max(hoverPosition.y - 10, 50)}px`,
            transform: hoverPosition.x > window.innerWidth - 400 
              ? "translateX(-100%) translateY(-100%)" 
              : "translateX(-50%) translateY(-100%)",
          }}
          onMouseEnter={() => {
            // Очищаем таймер при наведении на tooltip
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = null;
            }
            setHoveredEvent(hoveredEvent);
          }}
          onMouseLeave={() => {
            // Добавляем задержку перед скрытием tooltip
            hoverTimeoutRef.current = setTimeout(() => {
              setHoveredEvent(null);
            }, 200);
          }}
        >
          <div className="space-y-2">
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">{hoveredEvent.title}</h4>
              <div className="text-xs text-slate-600 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>
                    {new Date(hoveredEvent.starts_at).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    {formatTime(hoveredEvent.starts_at)} - {formatTime(hoveredEvent.ends_at)}
                  </span>
                </div>
                {getRoomName(hoveredEvent.room_id) && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{getRoomName(hoveredEvent.room_id)}</span>
                  </div>
                )}
              </div>
            </div>
            {hoveredEvent.description && (
              <div className="border-t border-slate-200 pt-2">
                <p className="text-xs text-slate-700 line-clamp-3">{hoveredEvent.description}</p>
              </div>
            )}
            {hoveredEvent.participants && hoveredEvent.participants.length > 0 && (
              <div className="border-t border-slate-200 pt-2">
                <div className="text-[0.65rem] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Участники ({hoveredEvent.participants.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {hoveredEvent.participants.slice(0, 5).map((participant) => (
                    <span
                      key={participant.user_id}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[0.65rem] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                    >
                      {participant.full_name || participant.email}
                    </span>
                  ))}
                  {hoveredEvent.participants.length > 5 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[0.65rem] font-medium text-slate-500">
                      +{hoveredEvent.participants.length - 5}
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className="border-t border-slate-200 pt-2">
              <button
                type="button"
                onClick={() => {
                  setHoveredEvent(null);
                  onEventClick?.(hoveredEvent);
                }}
                className="text-xs font-semibold text-lime-600 hover:text-lime-700 transition-colors"
              >
                Открыть для просмотра →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

