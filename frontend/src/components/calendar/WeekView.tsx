"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventRecord } from "@/types/event.types";
import type { Room } from "@/types/room.types";
import { addDays, formatDate, parseUTC, toTimeZone, formatTimeInTimeZone } from "@/lib/utils/dateUtils";
import { MINUTES_IN_DAY } from "@/lib/constants";

interface WeekViewProps {
  days: Date[];
  events: EventRecord[];
  loading: boolean;
  accent: string;
  timeZone?: string;
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

export function WeekView({
  days,
  events,
  loading,
  accent,
  timeZone = 'Europe/Moscow',
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
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const HOUR_HEIGHT = 60; // Высота одного часа в пикселях (увеличено для более крупного отображения)
  const DAY_HEIGHT = 24 * HOUR_HEIGHT; // Высота для полного дня (0:00-23:59)
  const todayKey = new Date().toDateString();
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragInfo = useRef<{ event: EventRecord; offsetMinutes: number } | null>(null);
  const draggingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  
  // Состояние для отслеживания текущего времени (обновляется каждую секунду)
  const [currentTime, setCurrentTime] = useState(() => new Date());
  
  // Обновляем текущее время каждую секунду для плавного движения красной линии
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Обновляем каждую секунду для плавного движения
    
    return () => clearInterval(interval);
  }, []);
  
  // Получаем текущее время в выбранном часовом поясе
  const currentTimeInTZ = useMemo(() => {
    return toTimeZone(currentTime, timeZone);
  }, [currentTime, timeZone]);
  
  // Состояние для всплывающего окна с участниками
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
    }, 200); // Задержка 200мс перед показом
  }, [hoveredEvent]);
  
  const handleEventMouseLeave = useCallback(() => {
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
      const now = new Date();
      const todayKey = new Date().toDateString();
      const isTodayInView = days.some(day => day.toDateString() === todayKey);
      
      if (isTodayInView) {
        // Прокручиваем к текущему времени в выбранном часовом поясе с небольшим отступом сверху
        const tzNow = toTimeZone(now, timeZone);
        const todayStart = new Date(tzNow);
        todayStart.setHours(0, 0, 0, 0);
        const minutesFromStart = (tzNow.getTime() - todayStart.getTime()) / 60000;
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

  const handleDrop = (
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
    const rect = columnEl.getBoundingClientRect();
    let minutes = ((e.clientY - rect.top) / rect.height) * MINUTES_IN_DAY;
    minutes = Math.max(0, Math.min(MINUTES_IN_DAY, minutes));
    // Округляем до ближайших 5 минут
    minutes = Math.round(minutes / 5) * 5;
    let newStartMinutes = minutes - dragInfo.current.offsetMinutes;
    newStartMinutes = Math.max(0, Math.min(MINUTES_IN_DAY, newStartMinutes));
    // Округляем итоговое время начала до ближайших 5 минут
    newStartMinutes = Math.round(newStartMinutes / 5) * 5;
    const newStart = new Date(dayStart.getTime() + newStartMinutes * 60000);
    onEventMove(dragInfo.current.event, newStart);
    dragInfo.current = null;
    draggingRef.current = false;
  };

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
    const startY = e.clientY - rect.top;
    
    setSelection({
      columnIndex,
      startY,
      endY: startY,
      isActive: true,
    });
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

        return {
          date,
          dayStart,
          dayEnd,
          events: dayEvents,
          isToday: date.toDateString() === todayKey,
        };
      }),
    [days, events, todayKey],
  );

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

    setSelection((prev) => {
      if (!prev) return null;
      return { ...prev, endY: clampedY };
    });
  }, [selection, DAY_HEIGHT, onTimeSlotClick]);

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

    const roundedStartMinutes = Math.floor(startMinutes / 15) * 15; // Округляем до 15 минут
    const roundedEndMinutes = Math.ceil(endMinutes / 15) * 15;

    const startTime = new Date(dayColumn.dayStart);
    startTime.setHours(
      Math.floor(roundedStartMinutes / 60),
      roundedStartMinutes % 60,
      0,
      0,
    );

    const endTime = new Date(dayColumn.dayStart);
    endTime.setHours(
      Math.floor(roundedEndMinutes / 60),
      roundedEndMinutes % 60,
      0,
      0,
    );

    onTimeSlotClick(dayColumn.dayStart, startTime, endTime);
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
    <div className="h-full flex flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.12)] overflow-hidden">
      <div className="sticky top-0 z-10 grid grid-cols-[80px_repeat(7,minmax(0,1fr))] border-b border-slate-200 bg-slate-50 text-sm flex-shrink-0">
        <div className="p-2 text-right text-[0.65rem] uppercase tracking-[0.3em] text-slate-500 bg-slate-50">
          Время
        </div>
        {dayColumns.map(({ date, isToday }) => (
          <div
            key={`head-${date.toISOString()}`}
            className={`border-l border-slate-200 p-2 bg-slate-50 ${isToday ? "bg-lime-50" : ""}`}
          >
            <p className="uppercase text-[0.65rem] tracking-[0.3em] text-slate-400">
              {formatDate(date, { weekday: "short" })}
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <p className="text-base font-semibold">
                {new Intl.DateTimeFormat("ru-RU", {
                  day: "numeric",
                  month: "short",
                }).format(date)}
              </p>
              {isToday && (
                <span className="rounded-full bg-lime-100 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase text-lime-600">
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
            className="border-r border-slate-200 bg-white"
            style={{ height: `${DAY_HEIGHT}px` }}
          >
            <div className="flex h-full flex-col justify-between text-right text-xs text-slate-500">
              {hours.map((hour) => {
                // Создаем дату для этого часа в выбранном часовом поясе
                // Используем первый день недели как базовую дату
                const baseDate = new Date(days[0]);
                baseDate.setHours(0, 0, 0, 0);
                const dayStartInTZ = toTimeZone(baseDate, timeZone);
                const hourDate = new Date(dayStartInTZ);
                hourDate.setHours(hour, 0, 0, 0);
                
                // Форматируем час в выбранном часовом поясе
                const hourLabel = formatTimeInTimeZone(hourDate, timeZone, { hour: '2-digit', minute: '2-digit' });
                
                return (
                  <div
                    key={`label-${hour}`}
                    className="pr-1.5 text-[0.6rem] uppercase tracking-wide"
                    style={{ height: `${HOUR_HEIGHT}px` }}
                  >
                    {hourLabel}
                  </div>
                );
              })}
            </div>
          </div>

          {dayColumns.map(({ date, dayStart, dayEnd, events: dayEvents, isToday }, idx) => {
            const isSelecting = selection?.columnIndex === idx && selection.isActive;
            const selectionStartY = isSelecting ? Math.min(selection.startY, selection.endY) : 0;
            const selectionEndY = isSelecting ? Math.max(selection.startY, selection.endY) : 0;
            const selectionHeight = isSelecting ? selectionEndY - selectionStartY : 0;
            
            return (
              <div
                key={`grid-${date.toISOString()}`}
                className={`relative border-l border-slate-200 ${idx === dayColumns.length - 1 ? "border-r border-slate-200" : ""} ${
                  isToday ? "bg-lime-50" : "bg-white"
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
                    className="absolute left-0 right-0 border-b border-slate-100"
                    style={{ top: `${hour * HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Красная линия текущего времени - показываем только для сегодняшнего дня */}
                {isToday && (() => {
                  const tzNow = currentTimeInTZ;
                  const todayStart = new Date(tzNow);
                  todayStart.setHours(0, 0, 0, 0);
                  const minutesFromStart = (tzNow.getTime() - todayStart.getTime()) / 60000;
                  const secondsFromStart = (tzNow.getTime() - todayStart.getTime()) / 1000;
                  const topPx = (secondsFromStart / (24 * 3600)) * DAY_HEIGHT;
                  
                  // Показываем линию только если она в пределах видимой области (0-23:59)
                  if (topPx >= 0 && topPx <= DAY_HEIGHT) {
                    return (
                      <div
                        className="absolute left-0 right-0 z-30 pointer-events-none"
                        style={{ top: `${topPx}px` }}
                      >
                        {/* Красная линия с тенью для лучшей видимости */}
                        <div className="absolute left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                        {/* Красная точка слева с анимацией пульсации */}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] animate-pulse" />
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Визуальное выделение диапазона времени */}
                {isSelecting && selectionHeight > 0 && (
                  <div
                    className="absolute left-0 right-0 rounded-lg border-2 border-lime-500 bg-lime-100/30 pointer-events-none z-20"
                    style={{
                      top: `${selectionStartY}px`,
                      height: `${selectionHeight}px`,
                    }}
                  />
                )}

                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-slate-500">
                    Загружаем события…
                  </div>
                )}

                {dayEvents.map((event) => {
                  const eventStart = parseUTC(event.starts_at);
                  const eventEnd = parseUTC(event.ends_at);
                  const displayStart = eventStart < dayStart ? dayStart : eventStart;
                  const displayEnd = eventEnd > dayEnd ? dayEnd : eventEnd;
                  const minutesFromStart =
                    (displayStart.getTime() - dayStart.getTime()) / 60000;
                  // Реальная длительность события в минутах (до округления)
                  const realDurationMinutes = (displayEnd.getTime() - displayStart.getTime()) / 60000;
                  const isShortEvent = realDurationMinutes < 30; // Событие меньше 30 минут
                  // Минимальная высота для отображения - 30 минут
                  const durationMinutes = Math.max(realDurationMinutes, 30);
                  const topPx = (minutesFromStart / MINUTES_IN_DAY) * DAY_HEIGHT;
                  const heightPx = (durationMinutes / MINUTES_IN_DAY) * DAY_HEIGHT;
                  const isStartingSoon = isEventStartingSoon(event);
                  
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
                      onMouseLeave={handleEventMouseLeave}
                      draggable={Boolean(onEventMove) && !event.all_day && !isUnavailable && !isAvailable && !isBookedSlot}
                      onDragStart={(dragEvent) => {
                        if (!isUnavailable && !isAvailable && !isBookedSlot) {
                          handleDragStart(dragEvent, event);
                        }
                      }}
                      onDragEnd={handleDragEnd}
                      className={`absolute left-0.5 right-0.5 rounded-lg border p-1.5 text-xs shadow-md transition ${
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
                      {!isShortEvent && (
                        <>
                          <p className="text-[0.65rem] text-slate-600 leading-tight">
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
                          {event.room_id && (
                            <p className="mt-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-500 truncate">
                              🏢 {rooms.find((r) => r.id === event.room_id)?.name || "Переговорка"}
                            </p>
                          )}
                          {event.location && !event.room_id && (
                            <p className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-slate-500 truncate">
                              {event.location}
                            </p>
                          )}
                        </>
                      )}
                      {onUpdateParticipantStatus && currentUserEmail && event.participants && (() => {
                        const currentParticipant = event.participants?.find(
                          (p) => p.email === currentUserEmail
                        );
                        // Показываем кнопки только если статус needs_action, pending или null
                        // НЕ показываем если уже accepted или declined
                        const needsAction = currentParticipant && 
                          (currentParticipant.response_status === "needs_action" || 
                           currentParticipant.response_status === "pending" ||
                           !currentParticipant.response_status);
                        if (!needsAction) return null;
                        
                        // Если событие слишком короткое (меньше 60px), показываем компактное меню
                        const isShortEvent = heightPx < 60;
                        
                        if (isShortEvent) {
                          // Компактная версия - одна кнопка с выпадающим меню при hover
                          return (
                            <div className="group/buttons mt-1 relative" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="w-full rounded bg-gradient-to-r from-lime-500 to-emerald-500 px-1 py-0.5 text-[0.6rem] font-semibold text-white transition hover:from-lime-600 hover:to-emerald-600 shadow-sm"
                                title="Ответить на приглашение"
                              >
                                Ответить
                              </button>
                              {/* Выпадающее меню при hover */}
                              <div className="absolute top-full left-0 right-0 mt-1 opacity-0 invisible group-hover/buttons:opacity-100 group-hover/buttons:visible transition-all z-50 bg-white rounded-lg border border-slate-200 shadow-lg p-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (currentParticipant) {
                                      onUpdateParticipantStatus(event.id, currentParticipant.user_id, "accepted");
                                    }
                                  }}
                                  className="w-full rounded bg-lime-500 px-2 py-1 text-[0.65rem] font-semibold text-white transition hover:bg-lime-600 mb-1 flex items-center justify-center gap-1"
                                  title="Принять"
                                >
                                  <span>✓</span> Принять
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (currentParticipant) {
                                      onUpdateParticipantStatus(event.id, currentParticipant.user_id, "declined");
                                    }
                                  }}
                                  className="w-full rounded bg-red-500 px-2 py-1 text-[0.65rem] font-semibold text-white transition hover:bg-red-600 flex items-center justify-center gap-1"
                                  title="Отклонить"
                                >
                                  <span>✕</span> Отклонить
                                </button>
                              </div>
                            </div>
                          );
                        }
                        
                        // Для длинных событий показываем все три кнопки
                        return (
                          <div className="mt-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (currentParticipant) {
                                  onUpdateParticipantStatus(event.id, currentParticipant.user_id, "accepted");
                                }
                              }}
                              className="flex-1 rounded bg-lime-500 px-1 py-0.5 text-[0.6rem] font-semibold text-white transition hover:bg-lime-400"
                              title="Принять"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (currentParticipant) {
                                  onUpdateParticipantStatus(event.id, currentParticipant.user_id, "declined");
                                }
                              }}
                              className="flex-1 rounded bg-red-500 px-1 py-0.5 text-[0.6rem] font-semibold text-white transition hover:bg-red-400"
                              title="Отклонить"
                            >
                              ✕
                            </button>
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
          {/* Заголовок события */}
          <div className="mb-3 border-b border-slate-100 pb-3 flex-shrink-0">
            <p className="text-sm font-semibold text-slate-900 mb-1 line-clamp-2 break-words">{hoveredEvent.event.title}</p>
            <p className="text-xs text-slate-500">
              {formatTimeInTimeZone(parseUTC(hoveredEvent.event.starts_at), timeZone)}{" "}
              —{" "}
              {formatTimeInTimeZone(parseUTC(hoveredEvent.event.ends_at), timeZone)}
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
    </React.Fragment>
  );
}

