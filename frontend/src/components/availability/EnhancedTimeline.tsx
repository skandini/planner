"use client";

import { useMemo } from "react";
import type { TimelineRowData } from "@/types/common.types";
import type { EventRecord } from "@/types/event.types";
import { inputToDate, parseUTC } from "@/lib/utils/dateUtils";
import { WORKDAY_START_HOUR, WORKDAY_END_HOUR, SLOT_DURATION_MINUTES } from "@/lib/constants";

interface EnhancedTimelineProps {
  rows: TimelineRowData[];
  referenceDate: Date;
  selectedStart: string;
  selectedEnd: string;
  isAllDay: boolean;
  errorMessage: string | null;
  conflictMap?: Map<string, Array<{ start: Date; end: Date }>>;
}

export function EnhancedTimeline({
  rows,
  referenceDate,
  selectedStart,
  selectedEnd,
  isAllDay,
  errorMessage,
  conflictMap,
}: EnhancedTimelineProps) {
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

  const timeSlots = useMemo(() => {
    const totalSlots =
      ((WORKDAY_END_HOUR - WORKDAY_START_HOUR) * 60) / SLOT_DURATION_MINUTES;
    return Array.from({ length: totalSlots }, (_, index) => {
      const totalMinutes =
        WORKDAY_START_HOUR * 60 + index * SLOT_DURATION_MINUTES;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      const label = `${String(hour).padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}`;
      return { index, hour, minute, label };
    });
  }, []);

  const resourceRows = useMemo(
    () => rows.filter((row) => row.id !== "placeholder"),
    [rows],
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-600">Добавьте участников или переговорку</p>
        <p className="mt-1 text-xs text-slate-500">чтобы увидеть таймлайн занятости</p>
      </div>
    );
  }

  const buildSlotTimes = (slotIndex: number) => {
    const slot = timeSlots[slotIndex];
    const slotStart = new Date(baseDate);
    slotStart.setHours(slot.hour, slot.minute, 0, 0);
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + SLOT_DURATION_MINUTES);
    return { slotStart, slotEnd };
  };

  const getSlotState = (
    row: TimelineRowData,
    slotIndex: number,
  ): "free" | "busy" | "selected" | "conflict" => {
    const { slotStart, slotEnd } = buildSlotTimes(slotIndex);
    const rowConflictSlots = conflictMap?.get(row.id) ?? [];
    
    // Проверяем конфликт
    const conflicting = rowConflictSlots.some(
      (conflict) => conflict.start < slotEnd && conflict.end > slotStart,
    );

    // Проверяем занятость
    const eventInSlot = row.availability.find((event) => {
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      return eventStart < slotEnd && eventEnd > slotStart;
    });

    // Проверяем выбранный интервал
    const selected =
      selectionRange.start &&
      selectionRange.end &&
      selectionRange.start < slotEnd &&
      selectionRange.end > slotStart;

    if (conflicting && !selected) return "conflict";
    if (eventInSlot) return "busy";
    if (selected) return "selected";
    return "free";
  };

  return (
    <div className="space-y-4">
      {/* Легенда */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-gradient-to-r from-red-400 to-red-500 shadow-sm" />
          <span className="text-xs font-medium text-slate-700">Занято</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded border-2 border-lime-400 bg-lime-50" />
          <span className="text-xs font-medium text-slate-700">Выбранное время</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-gradient-to-r from-amber-300 to-amber-400 shadow-sm" />
          <span className="text-xs font-medium text-slate-700">Конфликт</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-gradient-to-r from-slate-100 to-slate-200" />
          <span className="text-xs font-medium text-slate-700">Свободно</span>
        </div>
      </div>

      {/* Таймлайн */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <div className="space-y-3">
          {/* Заголовок времени */}
          <div className="grid gap-2" style={{ gridTemplateColumns: `200px repeat(${timeSlots.length}, minmax(8px, 1fr))` }}>
            <div />
            {timeSlots.map((slot) =>
              slot.minute === 0 ? (
                <div key={slot.index} className="text-center text-[0.65rem] font-semibold text-slate-500">
                  {slot.label}
                </div>
              ) : (
                <div key={slot.index} />
              ),
            )}
          </div>

          {/* Строки ресурсов */}
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid gap-2"
              style={{ gridTemplateColumns: `200px repeat(${timeSlots.length}, minmax(8px, 1fr))` }}
            >
              {/* Название ресурса */}
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3 py-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-bold text-slate-700">
                  {row.label[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{row.label}</p>
                  {row.meta && (
                    <p className="text-xs text-slate-500 truncate">{row.meta}</p>
                  )}
                </div>
              </div>

              {/* Слоты времени */}
              {timeSlots.map((slot) => {
                const state = getSlotState(row, slot.index);
                const { slotStart, slotEnd } = buildSlotTimes(slot.index);
                const eventInSlot = row.availability.find((event) => {
                  const eventStart = parseUTC(event.starts_at);
                  const eventEnd = parseUTC(event.ends_at);
                  return eventStart < slotEnd && eventEnd > slotStart;
                });

                return (
                  <div
                    key={`${row.id}-${slot.index}`}
                    className={`h-8 rounded-md transition-all ${
                      state === "conflict"
                        ? "bg-gradient-to-r from-amber-200 to-amber-300 border border-amber-400 shadow-sm"
                        : state === "busy"
                          ? "bg-gradient-to-r from-red-300 to-red-400 border border-red-500 shadow-sm"
                          : state === "selected"
                            ? "bg-gradient-to-r from-lime-100 to-lime-200 border-2 border-lime-400 shadow-md"
                            : "bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200"
                    }`}
                    title={
                      eventInSlot
                        ? `${eventInSlot.title} (${parseUTC(eventInSlot.starts_at).toLocaleTimeString("ru-RU", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })} - ${parseUTC(eventInSlot.ends_at).toLocaleTimeString("ru-RU", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })})`
                        : undefined
                    }
                  />
                );
              })}
            </div>
          ))}

          {/* Строка "Все свободны" */}
          {resourceRows.length > 0 && (
            <div
              className="grid gap-2 rounded-lg border-2 border-lime-200 bg-gradient-to-r from-lime-50 to-emerald-50 p-2"
              style={{ gridTemplateColumns: `200px repeat(${timeSlots.length}, minmax(8px, 1fr))` }}
            >
              <div className="flex items-center gap-2 rounded-lg bg-white/80 px-3 py-2">
                <svg className="h-5 w-5 text-lime-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-xs font-bold text-lime-800">Все свободны</p>
                  <p className="text-[0.65rem] text-lime-700">Переговорка и участники доступны</p>
                </div>
              </div>
              {timeSlots.map((slot) => {
                const { slotStart, slotEnd } = buildSlotTimes(slot.index);
                const slotBusy = resourceRows.some((row) =>
                  row.availability.some((event) => {
                    const eventStart = parseUTC(event.starts_at);
                    const eventEnd = parseUTC(event.ends_at);
                    return eventStart < slotEnd && eventEnd > slotStart;
                  }),
                );
                const selected =
                  selectionRange.start &&
                  selectionRange.end &&
                  selectionRange.start < slotEnd &&
                  selectionRange.end > slotStart;

                return (
                  <div
                    key={`combined-${slot.index}`}
                    className={`h-8 rounded-md transition-all ${
                      slotBusy
                        ? "bg-gradient-to-r from-slate-200 to-slate-300 border border-slate-400"
                        : selected
                          ? "bg-gradient-to-r from-lime-300 to-emerald-400 border-2 border-lime-500 shadow-lg"
                          : "bg-gradient-to-r from-lime-200 to-emerald-300 border border-lime-400"
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {errorMessage}
        </div>
      )}
    </div>
  );
}

