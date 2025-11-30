"use client";

import { useMemo } from "react";
import type { EventRecord } from "@/types/event.types";
import type { UserProfile } from "@/types/user.types";
import { parseUTC, formatDate } from "@/lib/utils/dateUtils";
import { WORKDAY_START_HOUR, WORKDAY_END_HOUR, SLOT_DURATION_MINUTES } from "@/lib/constants";

interface UserAvailabilityViewProps {
  userId: string; // Используется для идентификации, но не используется в теле функции
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
}

export function UserAvailabilityView({
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
}: UserAvailabilityViewProps) {
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

  const buildSlotTimes = (slotIndex: number) => {
    const slot = timeSlots[slotIndex];
    const slotStart = new Date(selectedDate);
    slotStart.setHours(slot.hour, slot.minute, 0, 0);
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + SLOT_DURATION_MINUTES);
    return { slotStart, slotEnd };
  };

  const rowHasBusyEvent = (slotStart: Date, slotEnd: Date) => {
    return availability.some((event) => {
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      // Сравниваем даты правильно: событие пересекается со слотом, если
      // eventStart < slotEnd && eventEnd > slotStart
      return eventStart < slotEnd && eventEnd > slotStart;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold">
              {user?.full_name || user?.email || "Пользователь"}
            </h3>
            <p className="text-sm text-slate-500">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {!isMember && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800 mb-2">
              Пользователь не имеет доступа к выбранному календарю
            </p>
            {addToCalendarError && (
              <p className="mb-2 text-xs text-red-600">{addToCalendarError}</p>
            )}
            <button
              type="button"
              onClick={onAddToCalendar}
              disabled={addToCalendarLoading}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {addToCalendarLoading ? "Добавляем..." : "Добавить в календарь"}
            </button>
          </div>
        )}

        <div className="mb-4">
          <p className="text-sm font-semibold text-slate-700 mb-2">
            Доступность на {formatDate(selectedDate, { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {error && !error.includes("not a member") && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!isMember && !error && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">
              Чтобы увидеть доступность пользователя, добавьте его в календарь
            </p>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Загружаем доступность...</p>
        ) : (error && error.includes("not a member")) || (!isMember && !loading) ? (
          <p className="text-sm text-slate-500">Доступность недоступна</p>
        ) : error ? (
          <p className="text-sm text-slate-500">Не удалось загрузить доступность</p>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4 overflow-x-auto">
            <div
              className="grid gap-1 text-xs"
              style={{
                gridTemplateColumns: `120px repeat(${timeSlots.length}, minmax(8px, 1fr))`,
              }}
            >
              <div className="text-[0.65rem] uppercase tracking-wide text-slate-400">
                Время
              </div>
              {timeSlots.map((slot) =>
                slot.minute === 0 ? (
                  <div key={slot.index} className="text-[0.65rem] text-slate-500 text-center">
                    {slot.label}
                  </div>
                ) : (
                  <div key={slot.index} />
                ),
              )}
            </div>
            <div
              className="grid gap-1 mt-2"
              style={{
                gridTemplateColumns: `120px repeat(${timeSlots.length}, minmax(8px, 1fr))`,
              }}
            >
              <div className="text-xs text-slate-600">Доступность</div>
              {timeSlots.map((slot) => {
                const { slotStart, slotEnd } = buildSlotTimes(slot.index);
                const busy = rowHasBusyEvent(slotStart, slotEnd);
                return (
                  <div
                    key={slot.index}
                    className={`h-6 rounded border ${
                      busy
                        ? "border-red-200 bg-red-50"
                        : "border-lime-200 bg-lime-50"
                    }`}
                    title={
                      busy
                        ? "Занято"
                        : "Свободно"
                    }
                  />
                );
              })}
            </div>
          </div>
        )}

        {availability.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-700 mb-2">
              События ({availability.length})
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {availability.map((event) => {
                const start = parseUTC(event.starts_at);
                const end = parseUTC(event.ends_at);
                return (
                  <div
                    key={event.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {event.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {start.toLocaleString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      –{" "}
                      {end.toLocaleString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

