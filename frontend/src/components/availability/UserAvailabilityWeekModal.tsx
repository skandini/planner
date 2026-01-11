"use client";

import { useMemo, useState, useEffect } from "react";
import type { EventRecord } from "@/types/event.types";
import type { UserProfile } from "@/types/user.types";
import { parseUTC, formatDate, startOfWeek, addDays, getTimeInTimeZone, formatTimeInTimeZone, MOSCOW_TIMEZONE } from "@/lib/utils/dateUtils";

interface UserAvailabilityWeekModalProps {
  userId: string;
  user: UserProfile | null;
  availability: EventRecord[];
  loading: boolean;
  error: string | null;
  selectedDate: Date;
  onClose: () => void;
  onAddToCalendar: () => void;
  isMember: boolean;
  addToCalendarError: string | null;
  addToCalendarLoading: boolean;
  onWeekChange?: (weekStart: Date) => void;
}

const HOUR_HEIGHT = 60;
const DAY_HEIGHT = 24 * HOUR_HEIGHT;
const MINUTES_IN_DAY = 24 * 60;

export function UserAvailabilityWeekModal({
  userId: _userId,
  user,
  availability,
  loading,
  error,
  selectedDate,
  onClose,
  onAddToCalendar,
  isMember,
  addToCalendarError,
  addToCalendarLoading,
  onWeekChange,
}: UserAvailabilityWeekModalProps) {
  const [weekStart, setWeekStart] = useState(() => {
    const start = startOfWeek(selectedDate);
    start.setHours(0, 0, 0, 0);
    return start;
  });
  const [isInitialMount, setIsInitialMount] = useState(true);

  // Вызываем onWeekChange только при изменении недели пользователем (не при первом рендере)
  useEffect(() => {
    if (isInitialMount) {
      setIsInitialMount(false);
      return;
    }
    if (onWeekChange) {
      onWeekChange(weekStart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      return date;
    });
  }, [weekStart]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  // Фильтруем события для недели
  const weekEvents = useMemo(() => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weekEnd.setHours(23, 59, 59, 999);

    return availability.filter((event) => {
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      return eventStart < weekEnd && eventEnd >= weekStart;
    });
  }, [availability, weekStart]);

  // Группируем события по дням
  const eventsByDay = useMemo(() => {
    const result: Record<string, EventRecord[]> = {};
    weekDays.forEach((day) => {
      const dayKey = day.toDateString();
      result[dayKey] = [];
    });

    weekEvents.forEach((event) => {
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      
      weekDays.forEach((day) => {
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);

        if (eventStart < dayEnd && eventEnd >= dayStart) {
          const dayKey = day.toDateString();
          if (!result[dayKey]) {
            result[dayKey] = [];
          }
          result[dayKey].push(event);
        }
      });
    });

    return result;
  }, [weekEvents, weekDays]);

  const navigateWeek = (direction: "prev" | "next") => {
    setWeekStart((prev) => {
      const newStart = new Date(prev);
      newStart.setDate(newStart.getDate() + (direction === "next" ? 7 : -7));
      return newStart;
    });
  };

  const goToToday = () => {
    const today = new Date();
    const start = startOfWeek(today);
    start.setHours(0, 0, 0, 0);
    setWeekStart(start);
  };

  const isToday = (date: Date) => {
    return date.toDateString() === new Date().toDateString();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-[80vw] max-w-[1400px] max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white p-6 flex-shrink-0">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-slate-900">
              {user?.full_name || user?.email || "Пользователь"}
            </h2>
            <p className="text-sm text-slate-500 mt-1">{user?.email}</p>
          </div>

          {!isMember && (
            <div className="mr-4">
              {addToCalendarError && (
                <p className="text-xs text-red-600 mb-2">{addToCalendarError}</p>
              )}
              <button
                type="button"
                onClick={onAddToCalendar}
                disabled={addToCalendarLoading}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {addToCalendarLoading ? "Добавляем..." : "Добавить в календарь"}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="ml-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Закрыть"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Week Navigation */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => navigateWeek("prev")}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
          >
            ← Предыдущая неделя
          </button>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={goToToday}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              Сегодня
            </button>
            <span className="text-sm font-semibold text-slate-900">
              {formatDate(weekDays[0], { day: "numeric", month: "long" })} — {formatDate(weekDays[6], { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigateWeek("next")}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
          >
            Следующая неделя →
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {error && !error.includes("not a member") && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {!isMember && !error && !loading && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                Чтобы увидеть доступность пользователя, добавьте его в календарь
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-96">
              <p className="text-slate-500">Загружаем доступность...</p>
            </div>
          ) : (error && error.includes("not a member")) || (!isMember && !loading) ? (
            <div className="flex items-center justify-center h-96">
              <p className="text-slate-500">Доступность недоступна</p>
            </div>
          ) : (
            <div className="relative">
              {/* Days Header */}
              <div className="sticky top-0 z-10 bg-white border-b border-slate-200 mb-2">
                <div className="grid grid-cols-8 gap-2">
                  <div className="p-2"></div>
                  {weekDays.map((day) => {
                    const dayKey = day.toDateString();
                    const today = isToday(day);
                    return (
                      <div
                        key={dayKey}
                        className={`p-3 rounded-lg text-center ${
                          today ? "bg-lime-100 border-2 border-lime-500" : "bg-slate-50"
                        }`}
                      >
                        <div className="text-xs font-semibold uppercase text-slate-500 mb-1">
                          {["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][day.getDay()]}
                        </div>
                        <div className={`text-lg font-bold ${today ? "text-lime-700" : "text-slate-900"}`}>
                          {day.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Time Grid */}
              <div className="grid grid-cols-8 gap-2">
                {/* Time Column */}
                <div className="flex flex-col">
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="h-[60px] border-b border-slate-100 flex items-start justify-end pr-2 pt-1"
                    >
                      <span className="text-xs text-slate-500">{String(hour).padStart(2, "0")}:00</span>
                    </div>
                  ))}
                </div>

                {/* Day Columns */}
                {weekDays.map((day) => {
                  const dayKey = day.toDateString();
                  const dayEvents = eventsByDay[dayKey] || [];
                  const today = isToday(day);

                  return (
                    <div key={dayKey} className="relative border border-slate-200 rounded-lg overflow-hidden">
                      <div className="absolute inset-0">
                        {/* Hour Lines */}
                        {hours.map((hour) => (
                          <div
                            key={hour}
                            className="absolute left-0 right-0 border-b border-slate-100"
                            style={{ top: `${hour * HOUR_HEIGHT}px` }}
                          />
                        ))}

                        {/* Events */}
                        {dayEvents.map((event) => {
                          const eventStart = parseUTC(event.starts_at);
                          const eventEnd = parseUTC(event.ends_at);
                          const eventStartMoscow = getTimeInTimeZone(eventStart, MOSCOW_TIMEZONE);
                          const eventEndMoscow = getTimeInTimeZone(eventEnd, MOSCOW_TIMEZONE);

                          // Получаем компоненты дня в московском времени
                          const dayMoscow = getTimeInTimeZone(day, MOSCOW_TIMEZONE);

                          // Вычисляем минуты события в московском времени
                          let eventStartMinutes = eventStartMoscow.hour * 60 + eventStartMoscow.minute;
                          let eventEndMinutes = eventEndMoscow.hour * 60 + eventEndMoscow.minute;

                          // Проверяем, попадает ли событие в текущий день (по московскому времени)
                          // month в getTimeInTimeZone возвращает 0-11, поэтому добавляем 1 для сравнения
                          const eventStartDayKey = `${eventStartMoscow.year}-${eventStartMoscow.month + 1}-${eventStartMoscow.day}`;
                          const dayKey = `${dayMoscow.year}-${dayMoscow.month + 1}-${dayMoscow.day}`;
                          
                          // Если событие начинается в другом дне, показываем с начала дня
                          if (eventStartDayKey !== dayKey) {
                            eventStartMinutes = 0;
                          }

                          // Если событие заканчивается в другом дне, показываем до конца дня
                          const eventEndDayKey = `${eventEndMoscow.year}-${eventEndMoscow.month + 1}-${eventEndMoscow.day}`;
                          if (eventEndDayKey !== dayKey) {
                            eventEndMinutes = MINUTES_IN_DAY;
                          }

                          const startMinutes = Math.max(0, Math.min(MINUTES_IN_DAY, eventStartMinutes));
                          const endMinutes = Math.max(startMinutes, Math.min(MINUTES_IN_DAY, eventEndMinutes));
                          const durationMinutes = endMinutes - startMinutes;
                          const topPx = (startMinutes / MINUTES_IN_DAY) * DAY_HEIGHT;
                          const heightPx = (durationMinutes / MINUTES_IN_DAY) * DAY_HEIGHT;

                          if (heightPx <= 0) {
                            return null;
                          }

                          return (
                            <div
                              key={event.id}
                              className="absolute left-0 right-0 mx-0.5 rounded border-l-4 border-red-500 bg-red-50 p-1 text-xs shadow-sm"
                              style={{
                                top: `${topPx}px`,
                                height: `${Math.max(heightPx, 20)}px`,
                              }}
                              title={`${event.title} ${formatTimeInTimeZone(eventStart, MOSCOW_TIMEZONE)} - ${formatTimeInTimeZone(eventEnd, MOSCOW_TIMEZONE)}`}
                            >
                              <div className="font-semibold text-red-900 truncate">{event.title}</div>
                              <div className="text-[0.65rem] text-red-700">
                                {formatTimeInTimeZone(eventStart, MOSCOW_TIMEZONE)} - {formatTimeInTimeZone(eventEnd, MOSCOW_TIMEZONE)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

