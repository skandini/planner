"use client";

import { useCallback } from "react";
import type { Calendar } from "@/types/calendar.types";
import { logger } from "@/lib/utils/logger";

interface CalendarSidebarProps {
  calendars: Calendar[];
  selectedCalendarId: string | null;
  onSelectCalendar: (id: string | null) => void;
  onCreateCalendar: () => void;
  onDeleteCalendar: (id: string) => void;
  loading?: boolean;
}

export function CalendarSidebar({
  calendars,
  selectedCalendarId,
  onSelectCalendar,
  onCreateCalendar,
  onDeleteCalendar,
  loading = false,
}: CalendarSidebarProps) {
  const handleDelete = useCallback(
    (calendarId: string, calendarName: string) => {
      if (
        window.confirm(
          `Удалить календарь «${calendarName}»? Все события будут потеряны.`
        )
      ) {
        onDeleteCalendar(calendarId);
      }
    },
    [onDeleteCalendar]
  );

  if (loading) {
    return (
      <div className="w-64 border-r border-slate-200 bg-white p-4">
        <div className="text-sm text-slate-500">Загрузка календарей...</div>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Календари</h2>
        <button
          type="button"
          onClick={onCreateCalendar}
          className="rounded-lg bg-lime-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-lime-700"
        >
          + Создать
        </button>
      </div>

      <div className="space-y-1">
        <button
          type="button"
          onClick={() => onSelectCalendar(null)}
          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
            selectedCalendarId === null
              ? "bg-lime-100 text-lime-900"
              : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          Все календари
        </button>

        {calendars.map((calendar) => (
          <div
            key={calendar.id}
            className="group flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50"
          >
            <button
              type="button"
              onClick={() => onSelectCalendar(calendar.id)}
              className={`flex-1 text-left text-sm transition-colors ${
                selectedCalendarId === calendar.id
                  ? "font-semibold text-lime-900"
                  : "text-slate-700"
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: calendar.color }}
                />
                <span>{calendar.name}</span>
              </div>
            </button>

            {calendar.current_user_role === "owner" && (
              <button
                type="button"
                onClick={() => handleDelete(calendar.id, calendar.name)}
                className="ml-2 opacity-0 text-red-600 hover:text-red-700 group-hover:opacity-100 transition-opacity"
                title="Удалить календарь"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

