"use client";

import { useMemo } from "react";
import type { TimelineRowData } from "@/types/common.types";
import type { EventRecord } from "@/types/event.types";
import { inputToDate, parseUTC } from "@/lib/utils/dateUtils";
import { WORKDAY_START_HOUR, WORKDAY_END_HOUR, SLOT_DURATION_MINUTES } from "@/lib/constants";

interface UnifiedAvailabilityTimelineProps {
  rows: TimelineRowData[];
  referenceDate: Date;
  selectedStart: string;
  selectedEnd: string;
  isAllDay: boolean;
  errorMessage: string | null;
  conflictMap?: Map<string, Array<{ start: Date; end: Date }>>;
}

export function UnifiedAvailabilityTimeline({
  rows,
  referenceDate,
  selectedStart,
  selectedEnd,
  isAllDay,
  errorMessage,
  conflictMap,
}: UnifiedAvailabilityTimelineProps) {
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

  const templateColumns = useMemo(
    () => `minmax(160px, 1fr) repeat(${timeSlots.length}, minmax(12px, 1fr))`,
    [timeSlots.length],
  );

  const resourceRows = useMemo(
    () => rows.filter((row) => row.id !== "placeholder"),
    [rows],
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Добавьте переговорку или выберите участников, чтобы увидеть таймлайн
        занятости.
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

  const rowHasBusyEvent = (
    rowAvailability: EventRecord[],
    slotStart: Date,
    slotEnd: Date,
  ) =>
    rowAvailability.some((event) => {
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      return eventStart < slotEnd && eventEnd > slotStart;
    });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-red-400" />
          <span>Занято</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-lime-400 bg-lime-100" />
          <span>Выбранный интервал</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-slate-200" />
          <span>Свободно</span>
        </div>
        {errorMessage && (
          <span className="text-red-500">{errorMessage}</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-full space-y-3">
          <div
            className="grid items-center gap-1 text-[0.6rem] uppercase tracking-wide text-slate-400"
            style={{ gridTemplateColumns: templateColumns }}
          >
            <div />
            {timeSlots.map((slot) =>
              slot.minute === 0 ? <div key={slot.index}>{slot.label}</div> : <div key={slot.index} />,
            )}
          </div>

          {rows.map((row) => {
            const rowConflictSlots = conflictMap?.get(row.id) ?? [];
            return (
              <div
                key={row.id}
                className="grid items-stretch gap-1"
                style={{ gridTemplateColumns: templateColumns }}
              >
                <div className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {row.label}
                  </p>
                  {row.meta && (
                    <p className="text-xs text-slate-500">{row.meta}</p>
                  )}
                  <span className="mt-1 text-[0.65rem] text-slate-400">
                    {row.type === "room" ? "Переговорка" : "Участник"}
                  </span>
                </div>

                {timeSlots.map((slot) => {
                  const { slotStart, slotEnd } = buildSlotTimes(slot.index);
                  const eventInSlot = row.availability.find((event) => {
                    const eventStart = parseUTC(event.starts_at);
                    const eventEnd = parseUTC(event.ends_at);
                    return eventStart < slotEnd && eventEnd > slotStart;
                  });
                  const busy = Boolean(eventInSlot);
                  const selected =
                    selectionRange.start &&
                    selectionRange.end &&
                    selectionRange.start < slotEnd &&
                    selectionRange.end > slotStart;
                  const conflicting =
                    rowConflictSlots.some(
                      (conflict) =>
                        conflict.start < slotEnd && conflict.end > slotStart,
                    ) && !selected;

                  return (
                    <div
                      key={`${row.id}-${slot.index}`}
                      className={`rounded-lg border p-1.5 text-[0.6rem] ${
                        conflicting
                          ? "border-amber-400 bg-amber-100 text-amber-700"
                          : busy
                            ? "border-red-200 bg-red-50 text-red-600"
                            : selected
                              ? "border-lime-300 bg-lime-50 text-lime-600"
                              : "border-slate-200 bg-white text-slate-500"
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
                    >
                      {conflicting ? "конфл." : busy ? "занято" : ""}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {resourceRows.length > 0 && (
            <div
              className="grid items-center gap-1"
              style={{ gridTemplateColumns: templateColumns }}
            >
              <div className="flex flex-col justify-center rounded-2xl border border-lime-200 bg-lime-50 px-3 py-2">
                <p className="text-sm font-semibold text-lime-800">
                  Свободно всем
                </p>
                <p className="text-xs text-lime-700">
                  Переговорка и все выбранные участники доступны одновременно
                </p>
              </div>
              {timeSlots.map((slot) => {
                const { slotStart, slotEnd } = buildSlotTimes(slot.index);
                const slotBusy = resourceRows.some((row) =>
                  rowHasBusyEvent(row.availability, slotStart, slotEnd),
                );
                const selected =
                  selectionRange.start &&
                  selectionRange.end &&
                  selectionRange.start < slotEnd &&
                  selectionRange.end > slotStart;
                return (
                  <div
                    key={`combined-${slot.index}`}
                    className={`rounded-lg border p-2 text-center text-[0.65rem] font-medium ${
                      slotBusy
                        ? "border-slate-200 bg-slate-100 text-slate-400"
                        : "border-lime-400 bg-lime-100 text-lime-700"
                    } ${selected ? "ring-1 ring-lime-400" : ""}`}
                  >
                    {slotBusy ? "—" : "OK"}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


