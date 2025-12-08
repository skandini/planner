"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventRecord } from "@/types/event.types";
import type { Room } from "@/types/room.types";
import { addDays, formatDate, parseUTC } from "@/lib/utils/dateUtils";
import { MINUTES_IN_DAY } from "@/lib/constants";

interface WeekViewProps {
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

export function WeekView({
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
}: WeekViewProps) {
  const hours = useMemo(() => {
    const startHour = 8;
    const endHour = 19;
    return Array.from({ length: endHour - startHour + 1 }, (_, i) => i + startHour);
  }, []);
  const HOUR_HEIGHT = 40; // Высота одного часа в пикселях
  const DAY_HEIGHT = (19 - 8 + 1) * HOUR_HEIGHT; // Высота для диапазона 8:00-19:00
  const todayKey = new Date().toDateString();
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragInfo = useRef<{ event: EventRecord; offsetMinutes: number } | null>(null);
  const draggingRef = useRef(false);
  
  // Состояние для отслеживания текущего времени (обновляется каждую секунду)
  const [currentTime, setCurrentTime] = useState(() => new Date());
  
  // Состояние для всплывающего окна с участниками
  const [hoveredEvent, setHoveredEvent] = useState<{
    event: EventRecord;
    position: { top: number; left: number };
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
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
      // Еще раз проверяем, не изменилось ли состояние
      const rect = element.getBoundingClientRect();
      const scrollContainer = element.closest('[class*="overflow"]');
      const containerRect = scrollContainer?.getBoundingClientRect() || 
                           element.closest('[class*="grid"]')?.getBoundingClientRect();
      
      if (!containerRect) return;
      
      // Увеличиваем ширину окна для дополнительной информации
      const tooltipWidth = 320;
      // Позиционируем справа от события, если есть место, иначе слева
      const spaceOnRight = window.innerWidth - rect.right;
      const spaceOnLeft = rect.left;
      
      let left: number;
      if (spaceOnRight >= tooltipWidth + 10) {
        left = rect.right - containerRect.left + 10;
      } else if (spaceOnLeft >= tooltipWidth + 10) {
        left = rect.left - containerRect.left - tooltipWidth - 10;
      } else {
        // По центру, если нет места сбоку
        left = rect.left - containerRect.left + (rect.width / 2) - (tooltipWidth / 2);
      }
      
      // Вертикальное позиционирование - выравниваем по верху события
      const top = rect.top - containerRect.top;
      
      setHoveredEvent({
        event,
        position: { top, left },
      });
    }, 300); // Задержка 300мс перед показом
  }, [hoveredEvent]);
  
  const handleEventMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    // Небольшая задержка перед скрытием, чтобы можно было навести на само окно
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
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Обновляем каждую секунду
    
    return () => clearInterval(interval);
  }, []);
  
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
    let newStartMinutes = minutes - dragInfo.current.offsetMinutes;
    newStartMinutes = Math.max(0, Math.min(MINUTES_IN_DAY, newStartMinutes));
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

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[80px_repeat(7,minmax(0,1fr))]">
          <div
            className="border-r border-slate-200 bg-white"
            style={{ height: `${DAY_HEIGHT}px` }}
          >
            <div className="flex h-full flex-col justify-between text-right text-xs text-slate-500">
              {hours.map((hour) => (
                <div
                  key={`label-${hour}`}
                  className="pr-1.5 text-[0.6rem] uppercase tracking-wide"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  {hour.toString().padStart(2, "0")}:00
                </div>
              ))}
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
                  const durationMinutes = Math.max(
                    (displayEnd.getTime() - displayStart.getTime()) / 60000,
                    30,
                  );
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
                        handleCardClick(event);
                      }}
                      onMouseEnter={(e) => {
                        const hasContent = (event.participants && event.participants.length > 0) ||
                                         (event.description && event.description.trim().length > 0) ||
                                         event.room_id;
                        if (hasContent) {
                          handleEventMouseEnter(event, e.currentTarget);
                        }
                      }}
                      onMouseLeave={handleEventMouseLeave}
                      draggable={Boolean(onEventMove) && !event.all_day}
                      onDragStart={(dragEvent) => handleDragStart(dragEvent, event)}
                      onDragEnd={handleDragEnd}
                      className={`absolute left-0.5 right-0.5 cursor-pointer rounded-lg border p-1.5 text-xs text-slate-900 shadow-md transition hover:shadow-lg z-10 ${
                        isStartingSoon 
                          ? "event-vibrating border-lime-500 border-2" 
                          : needsAction
                            ? "border-2 border-slate-300 bg-white"
                            : "border-slate-200"
                      }`}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        background: isStartingSoon 
                          ? `${accent}40` 
                          : needsAction
                            ? "white"
                            : `${accent}20`,
                      }}
                    >
                      <p className="text-xs font-semibold leading-tight truncate">{event.title}</p>
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
      
      {/* Всплывающее окно с деталями события - вынесено за пределы цикла по дням, чтобы показывалось только один раз */}
      {hoveredEvent && (
        <div
          className="absolute z-50 rounded-xl border border-slate-200 bg-white shadow-[0_10px_40px_rgba(15,23,42,0.2)] p-4 pointer-events-auto"
          style={{
            top: `${hoveredEvent.position.top}px`,
            left: `${hoveredEvent.position.left}px`,
            width: "320px",
            maxHeight: "500px",
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          {/* Заголовок события */}
          <div className="mb-3 border-b border-slate-100 pb-3">
            <p className="text-sm font-semibold text-slate-900 mb-1">{hoveredEvent.event.title}</p>
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
          
          {/* Описание события */}
          {hoveredEvent.event.description && hoveredEvent.event.description.trim().length > 0 && (
            <div className="mb-3 border-b border-slate-100 pb-3">
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Описание</p>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
                {hoveredEvent.event.description}
              </p>
            </div>
          )}
          
          {/* Переговорка */}
          {hoveredEvent.event.room_id && (
            <div className="mb-3 border-b border-slate-100 pb-3">
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Переговорка</p>
              <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
                <span className="text-lg">🏢</span>
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
          
          {/* Участники */}
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
                    accepted: "bg-lime-100 text-lime-700 border-lime-300",
                    declined: "bg-red-100 text-red-700 border-red-300",
                    pending: "bg-slate-100 text-slate-600 border-slate-300",
                    needs_action: "bg-slate-100 text-slate-600 border-slate-300",
                  };
                  const status = participant.response_status || "pending";
                  
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

