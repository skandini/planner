"use client";

import { parseUTC } from "@/lib/utils/dateUtils";
import type { ConflictEntry } from "@/types/event.types";

interface ConflictSummaryProps {
  conflicts: ConflictEntry[];
  loading: boolean;
  error: string | null;
}

export function ConflictSummary({
  conflicts,
  loading,
  error,
}: ConflictSummaryProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Конфликты
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Пересечения участников и переговорок
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Анализируем расписание…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : conflicts.length === 0 ? (
        <p className="text-sm text-slate-500">Конфликтов не обнаружено.</p>
      ) : (
        <div className="space-y-3">
          {conflicts.map((conflict, index) => {
            const slotStart = new Date(conflict.slot_start);
            const slotEnd = new Date(conflict.slot_end);
            return (
              <div
                key={`${conflict.type}-${conflict.resource_id ?? "none"}-${index}`}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      {conflict.type === "room" ? "Переговорка" : "Участник"} ·{" "}
                      {conflict.resource_label}
                    </p>
                    <p className="text-xs text-amber-700">
                      {slotStart.toLocaleString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      –{" "}
                      {slotEnd.toLocaleString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-amber-700">
                    {conflict.events.length} событ.
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {conflict.events.map((event) => {
                    const start = parseUTC(event.starts_at);
                    const end = parseUTC(event.ends_at);
                    return (
                      <div
                        key={event.id}
                        className="rounded-xl border border-white bg-white/70 px-3 py-2 text-sm text-slate-800"
                      >
                        <p className="font-medium">{event.title}</p>
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
            );
          })}
        </div>
      )}
    </div>
  );
}

