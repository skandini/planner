"use client";

import { useMemo, useCallback, useRef } from "react";
import type { TimelineRowData } from "@/types/common.types";
import { inputToDate, parseUTC, getTimeInTimeZone, MOSCOW_TIMEZONE } from "@/lib/utils/dateUtils";
import { WORKDAY_START_HOUR, WORKDAY_END_HOUR } from "@/lib/constants";

interface EnhancedTimelineProps {
  rows: TimelineRowData[];
  referenceDate: Date;
  selectedStart: string;
  selectedEnd: string;
  isAllDay: boolean;
  errorMessage: string | null;
  conflictMap?: Map<string, Array<{ start: Date; end: Date }>>;
  apiBaseUrl?: string;
  onTimeRangeSelect?: (start: Date, end: Date) => void;
}

export function EnhancedTimeline({
  rows,
  referenceDate,
  selectedStart,
  selectedEnd,
  isAllDay,
  errorMessage,
  conflictMap,
  apiBaseUrl = "",
  onTimeRangeSelect,
}: EnhancedTimelineProps) {
  const HOUR_HEIGHT = 60; // Высота часа в пикселях (как в DayView)
  const hours = useMemo(() => 
    Array.from({ length: WORKDAY_END_HOUR - WORKDAY_START_HOUR }, (_, i) => WORKDAY_START_HOUR + i),
    []
  );
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const selectionRange = useMemo(() => {
    const start = inputToDate(selectedStart, { allDay: isAllDay });
    const end = inputToDate(selectedEnd, { allDay: isAllDay, endOfDay: true });
    return { start, end };
  }, [selectedEnd, selectedStart, isAllDay]);

  const baseDate = useMemo(() => {
    if (selectionRange.start) {
      const normalized = new Date(selectionRange.start);
      normalized.setHours(0, 0, 0, 0);
      return normalized;
    }
    const fallback = new Date(referenceDate);
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }, [referenceDate, selectionRange.start]);

  const resourceRows = useMemo(
    () => rows.filter((row) => row.id !== "placeholder"),
    [rows],
  );

  // Проверяем занятость для конкретного часа и ресурса
  const isHourBusy = useCallback((hour: number, row: TimelineRowData): boolean => {
    const hourStart = new Date(baseDate);
    hourStart.setHours(hour, 0, 0, 0);
    const hourEnd = new Date(baseDate);
    hourEnd.setHours(hour + 1, 0, 0, 0);

    // Проверяем события в этом часе
    return row.availability.some((event) => {
      // Пропускаем события со статусом "available" - они не считаются занятыми
      if (event.status === "available") {
        return false;
      }
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      return eventStart < hourEnd && eventEnd > hourStart;
    });
  }, [baseDate]);

  // Проверяем, выбран ли этот час
  const isHourSelected = useCallback((hour: number): boolean => {
    if (!selectionRange.start || !selectionRange.end) return false;
    const hourStart = new Date(baseDate);
    hourStart.setHours(hour, 0, 0, 0);
    const hourEnd = new Date(baseDate);
    hourEnd.setHours(hour + 1, 0, 0, 0);
    return selectionRange.start < hourEnd && selectionRange.end > hourStart;
  }, [selectionRange, baseDate]);

  // Обработчик клика на час
  const handleHourClick = useCallback((hour: number) => {
    if (!onTimeRangeSelect) return;
    
    // Создаем время в московском времени
    const moscowTime = getTimeInTimeZone(baseDate, MOSCOW_TIMEZONE);
    const pad = (n: number) => String(n).padStart(2, '0');
    const startStr = `${moscowTime.year}-${pad(moscowTime.month + 1)}-${pad(moscowTime.day)}T${pad(hour)}:00+03:00`;
    const endStr = `${moscowTime.year}-${pad(moscowTime.month + 1)}-${pad(moscowTime.day)}T${pad(hour + 1)}:00+03:00`;
    
    const start = new Date(startStr);
    const end = new Date(endStr);
    onTimeRangeSelect(start, end);
  }, [onTimeRangeSelect, baseDate]);

  if (resourceRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">Добавьте участников или переговорку</p>
      </div>
    );
  }


  return (
    <div className="space-y-2" ref={timelineRef}>
      {/* Упрощенный таймлайн - вертикальная сетка как в DayView */}
      <div className="overflow-auto border border-slate-200 bg-white rounded-lg" style={{ maxHeight: "400px" }}>
        <div className="inline-block min-w-full">
          {/* Заголовок с часами */}
          <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
            <div className="w-24 flex-shrink-0 border-r border-slate-200 px-2 py-2">
              <p className="text-xs font-semibold text-slate-700">Ресурс</p>
            </div>
            <div className="flex flex-1">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="flex-1 border-r border-slate-200 px-2 py-2 text-center"
                  style={{ minWidth: `${HOUR_HEIGHT * 2}px` }}
                >
                  <p className="text-xs font-medium text-slate-600">
                    {hour.toString().padStart(2, '0')}:00
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Ресурсы */}
          {resourceRows.map((row) => (
            <div
              key={row.id}
              className="flex border-b border-slate-100 hover:bg-slate-50 transition-colors"
            >
              {/* Имя ресурса */}
              <div className="w-24 flex-shrink-0 px-2 py-2 border-r border-slate-200 bg-white">
                <div className="flex items-center gap-1.5 mb-1">
                  {row.avatarUrl ? (
                    <img
                      src={apiBaseUrl && !row.avatarUrl.startsWith("http") ? `${apiBaseUrl}${row.avatarUrl}` : row.avatarUrl}
                      alt={row.label}
                      className="h-5 w-5 rounded-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                        if (fallback) {
                          fallback.style.display = "flex";
                        }
                      }}
                    />
                  ) : null}
                  <div 
                    className={`h-5 w-5 rounded-full flex items-center justify-center text-[0.65rem] font-semibold text-white ${row.type === "room" ? "bg-blue-500" : "bg-indigo-500"} ${row.avatarUrl ? "hidden" : ""}`}
                  >
                    {row.type === "room" ? "🏢" : row.label[0]?.toUpperCase() || "?"}
                  </div>
                </div>
                <p className="text-xs font-medium text-slate-900 truncate leading-tight" title={row.label}>
                  {row.label}
                </p>
              </div>

              {/* Часы с занятостью */}
              <div className="flex flex-1">
                {hours.map((hour) => {
                  const isBusy = isHourBusy(hour, row);
                  const isSelected = isHourSelected(hour);
                  const hourStart = new Date(baseDate);
                  hourStart.setHours(hour, 0, 0, 0);
                  const hourEnd = new Date(baseDate);
                  hourEnd.setHours(hour + 1, 0, 0, 0);
                  
                  // Проверяем конфликты
                  const rowConflictSlots = conflictMap?.get(row.id) ?? [];
                  const hasConflict = rowConflictSlots.some(
                    (conflict) => conflict.start < hourEnd && conflict.end > hourStart
                  );

                  return (
                    <div
                      key={hour}
                      className={`flex-1 border-r border-slate-100 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-200 border-blue-400"
                          : isBusy || hasConflict
                            ? "bg-slate-300 border-slate-400 cursor-not-allowed"
                            : "bg-white hover:bg-slate-50"
                      }`}
                      style={{ minWidth: `${HOUR_HEIGHT * 2}px`, height: `${HOUR_HEIGHT}px` }}
                      onClick={() => {
                        if (!isBusy && !hasConflict && onTimeRangeSelect) {
                          handleHourClick(hour);
                        }
                      }}
                      title={
                        isSelected
                          ? `Выбрано: ${hour}:00 - ${hour + 1}:00`
                          : isBusy || hasConflict
                            ? `Занято: ${hour}:00 - ${hour + 1}:00`
                            : `Доступно: ${hour}:00 - ${hour + 1}:00`
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {errorMessage}
        </div>
      )}
    </div>
  );
}

