"use client";

import { useEffect, useState } from "react";
import type { AuthenticatedFetch } from "@/types/common.types";
import { USERS_ENDPOINT } from "@/lib/constants";

interface TimeSlot {
  start: string;
  end: string;
  label?: string;
}

interface AvailabilitySchedule {
  monday: TimeSlot[];
  tuesday: TimeSlot[];
  wednesday: TimeSlot[];
  thursday: TimeSlot[];
  friday: TimeSlot[];
  saturday: TimeSlot[];
  sunday: TimeSlot[];
}

interface AvailabilityScheduleSettingsProps {
  authFetch: AuthenticatedFetch;
  onUpdate?: () => void;
}

const DAYS_OF_WEEK = [
  { key: "monday", label: "Понедельник" },
  { key: "tuesday", label: "Вторник" },
  { key: "wednesday", label: "Среда" },
  { key: "thursday", label: "Четверг" },
  { key: "friday", label: "Пятница" },
  { key: "saturday", label: "Суббота" },
  { key: "sunday", label: "Воскресенье" },
] as const;

export function AvailabilityScheduleSettings({
  authFetch,
  onUpdate,
}: AvailabilityScheduleSettingsProps) {
  const [schedule, setSchedule] = useState<AvailabilitySchedule>({
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  });
  const [timezone, setTimezone] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSchedule();
  }, []);

  const loadSchedule = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(`${USERS_ENDPOINT}me/availability`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить расписание доступности");
      }
      const data = await response.json();
      // Ensure schedule has all days, even if empty
      const loadedSchedule = data.schedule || {};
      setSchedule({
        monday: loadedSchedule.monday || [],
        tuesday: loadedSchedule.tuesday || [],
        wednesday: loadedSchedule.wednesday || [],
        thursday: loadedSchedule.thursday || [],
        friday: loadedSchedule.friday || [],
        saturday: loadedSchedule.saturday || [],
        sunday: loadedSchedule.sunday || [],
      });
      setTimezone(data.timezone || "UTC");
    } catch (err) {
      console.error("Failed to load availability schedule:", err);
      setError(err instanceof Error ? err.message : "Ошибка загрузки расписания");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await authFetch(`${USERS_ENDPOINT}me/availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule,
          timezone,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Не удалось сохранить расписание");
      }

      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения расписания");
    } finally {
      setSaving(false);
    }
  };

  const addTimeSlot = (day: keyof AvailabilitySchedule) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: [...prev[day], { start: "09:00", end: "18:00", label: "" }],
    }));
  };

  const removeTimeSlot = (day: keyof AvailabilitySchedule, index: number) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== index),
    }));
  };

  const updateTimeSlot = (
    day: keyof AvailabilitySchedule,
    index: number,
    field: "start" | "end" | "label",
    value: string
  ) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: prev[day].map((slot, i) =>
        i === index ? { ...slot, [field]: value } : slot
      ),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Часовой пояс
        </label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
        >
          <option value="UTC">UTC</option>
          <option value="Europe/Moscow">Москва (MSK)</option>
          <option value="Europe/Kiev">Киев (EET)</option>
          <option value="Asia/Almaty">Алматы (ALMT)</option>
        </select>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
          Расписание доступности по дням недели
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Укажите время, когда вам можно назначать встречи. Если день не указан, встречи в этот день назначать нельзя.
        </p>

        {DAYS_OF_WEEK.map((day) => (
          <div
            key={day.key}
            className="rounded-lg border border-slate-200 bg-slate-50/50 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-slate-900 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={schedule[day.key].length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      addTimeSlot(day.key);
                    } else {
                      setSchedule((prev) => ({
                        ...prev,
                        [day.key]: [],
                      }));
                    }
                  }}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/20"
                />
                {day.label}
              </label>
              {schedule[day.key].length > 0 && (
                <button
                  type="button"
                  onClick={() => addTimeSlot(day.key)}
                  className="text-xs px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
                >
                  + Добавить интервал
                </button>
              )}
            </div>

            {schedule[day.key].length > 0 && (
              <div className="space-y-2 mt-3">
                {schedule[day.key].map((slot, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-lg border border-slate-200 p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <label className="text-xs text-slate-600">С</label>
                        <input
                          type="time"
                          value={slot.start}
                          onChange={(e) =>
                            updateTimeSlot(day.key, index, "start", e.target.value)
                          }
                          className="flex-1 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none"
                        />
                        <label className="text-xs text-slate-600">До</label>
                        <input
                          type="time"
                          value={slot.end}
                          onChange={(e) =>
                            updateTimeSlot(day.key, index, "end", e.target.value)
                          }
                          className="flex-1 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTimeSlot(day.key, index)}
                        className="text-red-600 hover:text-red-700 transition p-1"
                        title="Удалить интервал"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Описание доступности (видно коллегам)
                      </label>
                      <input
                        type="text"
                        value={slot.label || ""}
                        onChange={(e) =>
                          updateTimeSlot(day.key, index, "label", e.target.value)
                        }
                        placeholder="Например: Доступен по задачам отдела продаж"
                        className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Это описание будет видно коллегам при создании встречи
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 transition hover:from-indigo-600 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Сохранение…" : "Сохранить расписание"}
        </button>
      </div>
    </div>
  );
}

