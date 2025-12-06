"use client";

import type { PendingMoveContext } from "@/types/common.types";
import { parseUTC } from "@/lib/utils/dateUtils";

interface MoveSeriesDialogProps {
  context: PendingMoveContext;
  scope: "single" | "series";
  onScopeChange: (next: "single" | "series") => void;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | null;
}

export function MoveSeriesDialog({
  context,
  scope,
  onScopeChange,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: MoveSeriesDialogProps) {
  const oldStart = parseUTC(context.event.starts_at);
  const oldEnd = parseUTC(context.event.ends_at);
  const formatDateTime = (date: Date) =>
    new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Переместить серию</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          «{context.event.title}»
        </p>

        <div className="mt-4 grid gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Было
            </p>
            <p className="font-semibold text-slate-700">
              {formatDateTime(oldStart)} – {formatDateTime(oldEnd)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Станет
            </p>
            <p className="font-semibold text-lime-600">
              {formatDateTime(context.newStart)} – {formatDateTime(context.newEnd)}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition hover:border-lime-400">
            <input
              type="radio"
              className="mt-1 h-4 w-4 text-lime-500 focus:ring-lime-500"
              checked={scope === "single"}
              onChange={() => onScopeChange("single")}
            />
            <div>
              <p className="font-semibold text-slate-900">Только это событие</p>
              <p className="text-sm text-slate-500">
                Остальные в серии останутся на прежнем месте.
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition hover:border-lime-400">
            <input
              type="radio"
              className="mt-1 h-4 w-4 text-lime-500 focus:ring-lime-500"
              checked={scope === "series"}
              onChange={() => onScopeChange("series")}
            />
            <div>
              <p className="font-semibold text-slate-900">Вся серия</p>
              <p className="text-sm text-slate-500">
                Все повторения будут сдвинуты на ту же дельту.
              </p>
            </div>
          </label>
        </div>

        {error && (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="flex-1 rounded-2xl bg-lime-500 px-4 py-2 font-semibold text-white transition hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Перемещаем…" : "Переместить"}
          </button>
        </div>
      </div>
    </div>
  );
}


