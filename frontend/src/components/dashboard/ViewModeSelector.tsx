"use client";

import type { ViewMode } from "@/types/common.types";

interface ViewModeSelectorProps {
  viewMode: ViewMode;
  availableModes: ViewMode[];
  onViewModeChange: (mode: ViewMode) => void;
}

const viewModeLabels: Record<ViewMode, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
  "availability-slots": "Слоты",
  org: "Оргструктура",
  support: "Поддержка",
  admin: "Админ",
};

export function ViewModeSelector({
  viewMode,
  availableModes,
  onViewModeChange,
}: ViewModeSelectorProps) {
  return (
    <div className="flex gap-2 rounded-lg border border-slate-200 bg-white p-1">
      {availableModes.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onViewModeChange(mode)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            viewMode === mode
              ? "bg-lime-600 text-white"
              : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          {viewModeLabels[mode]}
        </button>
      ))}
    </div>
  );
}

