"use client";

import { useMemo } from "react";
import type { EventRecord } from "@/types/event.types";
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
  rooms: Room[];
}

export function MonthView({
  days,
  selectedDate,
  onSelectDate,
  events,
  loading,
  accent,
  onEventClick,
  rooms: _rooms,
}: MonthViewProps) {
  const currentMonth = selectedDate.getMonth();

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
    <div className="mt-6">
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
              <div className="mt-3 space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-xl bg-slate-100 px-2 py-1 text-[0.65rem] transition hover:bg-slate-200"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: accent }}
                    />
                    <span className="truncate text-slate-700">
                      {event.title}
                    </span>
                  </div>
                ))}
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
    </div>
  );
}

