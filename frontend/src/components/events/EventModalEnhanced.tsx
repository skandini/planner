"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { EventDraft, EventRecord, ConflictEntry } from "@/types/event.types";
import type { CalendarMember } from "@/types/calendar.types";
import type { UserProfile } from "@/types/user.types";
import type { Room } from "@/types/room.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { ParticipantStatusItem } from "@/components/participants/ParticipantStatusItem";
import { ResourcePanel } from "@/components/rooms/ResourcePanel";
import { toUTCDateISO } from "@/lib/utils/dateUtils";
import { CALENDAR_ENDPOINT, ROOM_ENDPOINT } from "@/lib/constants";

interface EventModalEnhancedProps {
  form: EventDraft;
  setForm: (form: EventDraft | ((prev: EventDraft) => EventDraft)) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete?: () => void;
  onDeleteSeries?: () => void;
  onClose: () => void;
  isSubmitting: boolean;
  error: string | null;
  calendarName: string;
  isEditing: boolean;
  rooms: Room[];
  roomsLoading: boolean;
  authFetch: AuthenticatedFetch;
  canManageEvents: boolean;
  members: CalendarMember[];
  membersLoading: boolean;
  users: UserProfile[];
  usersLoading: boolean;
  usersError: string | null;
  selectedCalendarId: string | null;
  onRefreshMembers: () => Promise<void> | void;
  recurrenceInfo?: {
    isSeriesParent: boolean;
    isSeriesChild: boolean;
  } | null;
  editingEvent?: EventRecord;
  onUpdateParticipantStatus?: (eventId: string, userId: string, status: string) => Promise<void>;
  currentUserEmail?: string;
}

type TabType = "basic" | "participants" | "resources" | "recurrence" | "availability";

const QUICK_DURATIONS = [
  { label: "15 мин", minutes: 15 },
  { label: "30 мин", minutes: 30 },
  { label: "1 час", minutes: 60 },
  { label: "1.5 часа", minutes: 90 },
  { label: "2 часа", minutes: 120 },
];

export function EventModalEnhanced({
  form,
  setForm,
  onSubmit,
  onDelete,
  onDeleteSeries,
  onClose,
  isSubmitting,
  error,
  calendarName,
  isEditing,
  rooms,
  roomsLoading,
  authFetch,
  canManageEvents,
  members,
  membersLoading,
  users,
  usersLoading,
  usersError,
  selectedCalendarId,
  onRefreshMembers,
  recurrenceInfo,
  editingEvent,
  onUpdateParticipantStatus,
  currentUserEmail,
}: EventModalEnhancedProps) {
  const [activeTab, setActiveTab] = useState<TabType>("basic");
  const [roomAvailability, setRoomAvailability] = useState<EventRecord[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [conflictsError, setConflictsError] = useState<string | null>(null);
  const [showQuickActions, setShowQuickActions] = useState(false);
  
  const isReadOnly = !canManageEvents;
  const isSeriesParent = Boolean(recurrenceInfo?.isSeriesParent);
  const isSeriesChild = Boolean(recurrenceInfo?.isSeriesChild);
  const recurrenceControlsDisabled = isReadOnly || isSeriesParent || isSeriesChild;

  const selectedRoom = rooms.find((r) => r.id === form.room_id);
  const selectedDate = form.starts_at
    ? new Date(form.starts_at.split("T")[0])
    : new Date();

  // Подсчет конфликтов
  const conflictCount = conflicts.reduce((sum, conflict) => sum + conflict.events.length, 0);
  const hasConflicts = conflictCount > 0;

  // Быстрое изменение длительности
  const applyQuickDuration = useCallback((minutes: number) => {
    if (!form.starts_at) return;
    
    const start = new Date(form.starts_at);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + minutes);
    
    const formatDateTime = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const mins = String(date.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day}T${hours}:${mins}`;
    };
    
    setForm((prev) => ({
      ...prev,
      ends_at: formatDateTime(end),
    }));
    setShowQuickActions(false);
  }, [form.starts_at, setForm]);

  // Быстрый выбор времени (сегодня, завтра, через неделю)
  const setQuickDate = useCallback((daysOffset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    date.setHours(9, 0, 0, 0);
    
    const formatDateTime = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const mins = String(date.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day}T${hours}:${mins}`;
    };
    
    const endDate = new Date(date);
    endDate.setHours(10, 0, 0, 0);
    
    setForm((prev) => ({
      ...prev,
      starts_at: formatDateTime(date),
      ends_at: formatDateTime(endDate),
    }));
  }, [setForm]);

  const loadRoomAvailability = useCallback(
    async (roomId: string, date: Date) => {
      setLoadingAvailability(true);
      try {
        const dateStr = toUTCDateISO(date);
        const url = `${ROOM_ENDPOINT}${roomId}/availability?date=${encodeURIComponent(dateStr)}`;
        const response = await authFetch(url, { cache: "no-store" });
        if (response.ok) {
          const data: EventRecord[] = await response.json();
          setRoomAvailability(data);
        } else {
          setRoomAvailability([]);
        }
      } catch (err) {
        console.error("Failed to load room availability:", err);
        setRoomAvailability([]);
      } finally {
        setLoadingAvailability(false);
      }
    },
    [authFetch],
  );

  useEffect(() => {
    if (form.room_id) {
      let date: Date;
      if (form.starts_at) {
        const dateStr = form.starts_at.split("T")[0];
        date = new Date(dateStr + "T00:00:00");
      } else {
        date = new Date();
        date.setHours(0, 0, 0, 0);
      }
      loadRoomAvailability(form.room_id, date);
    } else {
      setRoomAvailability([]);
    }
  }, [form.room_id, form.starts_at, loadRoomAvailability]);

  useEffect(() => {
    if (!selectedCalendarId || !form.starts_at || !form.ends_at) {
      setConflicts([]);
      setConflictsError(null);
      return;
    }
    const fromDate = form.all_day
      ? new Date(`${form.starts_at}T00:00:00`)
      : new Date(form.starts_at);
    const toDate = form.all_day
      ? new Date(`${form.ends_at}T23:59:59`)
      : new Date(form.ends_at);

    let cancelled = false;
    setConflictsLoading(true);
    setConflictsError(null);

    const url = `${CALENDAR_ENDPOINT}${selectedCalendarId}/conflicts?from=${encodeURIComponent(
      fromDate.toISOString(),
    )}&to=${encodeURIComponent(toDate.toISOString())}`;

    authFetch(url, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          if (response.status === 403 || response.status === 404) {
            console.warn("Cannot load conflicts, returning empty list");
            return [] as ConflictEntry[];
          }
          return response.json().then((data) => {
            throw new Error(data.detail || "Не удалось загрузить конфликты");
          }).catch(() => {
            throw new Error("Не удалось загрузить конфликты");
          });
        }
        return response.json() as Promise<ConflictEntry[]>;
      })
      .then((data) => {
        if (!cancelled) {
          setConflicts(data);
          setConflictsError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setConflicts([]);
          console.warn("Failed to load conflicts:", error);
          setConflictsError(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setConflictsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    authFetch,
    form.all_day,
    form.ends_at,
    form.participant_ids,
    form.room_id,
    form.starts_at,
    selectedCalendarId,
  ]);

  const tabs: { id: TabType; label: string; icon: string; badge?: number }[] = [
    { id: "basic", label: "Основное", icon: "📝" },
    { id: "participants", label: "Участники", icon: "👥", badge: form.participant_ids.length },
    { id: "resources", label: "Ресурсы", icon: "🏢", badge: form.room_id ? 1 : 0 },
    { id: "recurrence", label: "Повторения", icon: "🔄", badge: form.recurrence_enabled ? 1 : 0 },
    { id: "availability", label: "Занятость", icon: "📊", badge: hasConflicts ? conflictCount : undefined },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-6xl max-h-[95vh] overflow-hidden rounded-3xl border border-slate-200/50 bg-gradient-to-br from-white via-white to-slate-50/50 shadow-2xl">
        {/* Header */}
        <div className="border-b border-slate-200/50 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {isEditing ? "Редактировать событие" : "Новое событие"}
              </p>
              <h2 className="mt-1 text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                {form.title || "Без названия"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {calendarName || "Новый календарь"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-4 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-400 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
              aria-label="Закрыть"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`group relative flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-gradient-to-r from-lime-500 to-emerald-500 text-white shadow-lg shadow-lime-500/30"
                    : "bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="text-base">{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs font-bold ${
                    activeTab === tab.id
                      ? "bg-white/20 text-white"
                      : "bg-lime-100 text-lime-700"
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(95vh - 200px)" }}>
          <div className="p-6">
            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {isReadOnly && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>У вас нет прав редактировать события в этом календаре</span>
                </div>
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-6">
              {/* Tab: Basic */}
              {activeTab === "basic" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="mb-4 text-lg font-semibold text-slate-900">Основная информация</h3>
                    
                    <div className="space-y-4">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">
                          Название события <span className="text-red-500">*</span>
                        </span>
                        <input
                          required
                          type="text"
                          disabled={isReadOnly}
                          value={form.title}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, title: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 transition-all focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-500/20"
                          placeholder="Например, Стендап команды"
                        />
                      </label>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            Начало <span className="text-red-500">*</span>
                          </label>
                          <div className="space-y-2">
                            <input
                              required
                              type={form.all_day ? "date" : "datetime-local"}
                              disabled={isReadOnly}
                              value={form.starts_at}
                              onChange={(e) =>
                                setForm((prev) => ({ ...prev, starts_at: e.target.value }))
                              }
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 transition-all focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-500/20"
                            />
                            {!form.all_day && (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setQuickDate(0)}
                                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                                >
                                  Сегодня 9:00
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setQuickDate(1)}
                                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                                >
                                  Завтра 9:00
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            Конец <span className="text-red-500">*</span>
                          </label>
                          <div className="space-y-2">
                            <input
                              required
                              type={form.all_day ? "date" : "datetime-local"}
                              disabled={isReadOnly}
                              value={form.ends_at}
                              onChange={(e) =>
                                setForm((prev) => ({ ...prev, ends_at: e.target.value }))
                              }
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 transition-all focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-500/20"
                            />
                            {!form.all_day && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setShowQuickActions(!showQuickActions)}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                                >
                                  ⚡ Быстрая длительность
                                </button>
                                {showQuickActions && (
                                  <div className="absolute top-full z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                                    {QUICK_DURATIONS.map((duration) => (
                                      <button
                                        key={duration.minutes}
                                        type="button"
                                        onClick={() => applyQuickDuration(duration.minutes)}
                                        className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                                      >
                                        {duration.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-slate-100">
                        <input
                          type="checkbox"
                          disabled={isReadOnly}
                          checked={form.all_day}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, all_day: e.target.checked }))
                          }
                          className="h-5 w-5 rounded border-lime-500 text-lime-500 focus:ring-lime-500"
                        />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Весь день</p>
                          <p className="text-xs text-slate-500">Событие на весь день</p>
                        </div>
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">Локация</span>
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={form.location}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, location: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 transition-all focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-500/20"
                          placeholder="Например, Переговорка 301 или Онлайн"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">Описание</span>
                        <textarea
                          value={form.description}
                          disabled={isReadOnly}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, description: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 transition-all focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-500/20"
                          rows={4}
                          placeholder="Дополнительная информация о событии..."
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Participants */}
              {activeTab === "participants" && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <ResourcePanel
                    rooms={rooms}
                    roomsLoading={roomsLoading}
                    form={form}
                    setForm={setForm}
                    selectedRoom={selectedRoom || null}
                    selectedDate={selectedDate}
                    roomAvailability={roomAvailability}
                    loadingAvailability={loadingAvailability}
                    readOnly={isReadOnly}
                    members={members}
                    membersLoading={membersLoading}
                    users={users}
                    usersLoading={usersLoading}
                    usersError={usersError}
                    authFetch={authFetch}
                    selectedCalendarId={selectedCalendarId}
                    isAllDay={form.all_day}
                    onRefreshMembers={onRefreshMembers}
                    conflicts={conflicts}
                    conflictsLoading={conflictsLoading}
                    conflictsError={conflictsError}
                  />
                </div>
              )}

              {/* Tab: Resources */}
              {activeTab === "resources" && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <ResourcePanel
                    rooms={rooms}
                    roomsLoading={roomsLoading}
                    form={form}
                    setForm={setForm}
                    selectedRoom={selectedRoom || null}
                    selectedDate={selectedDate}
                    roomAvailability={roomAvailability}
                    loadingAvailability={loadingAvailability}
                    readOnly={isReadOnly}
                    members={members}
                    membersLoading={membersLoading}
                    users={users}
                    usersLoading={usersLoading}
                    usersError={usersError}
                    authFetch={authFetch}
                    selectedCalendarId={selectedCalendarId}
                    isAllDay={form.all_day}
                    onRefreshMembers={onRefreshMembers}
                    conflicts={conflicts}
                    conflictsLoading={conflictsLoading}
                    conflictsError={conflictsError}
                  />
                </div>
              )}

              {/* Tab: Recurrence */}
              {activeTab === "recurrence" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className={`rounded-2xl border border-dashed border-slate-200 bg-white p-6 shadow-sm ${
                    recurrenceControlsDisabled ? "opacity-60" : ""
                  }`}>
                    <label className="flex items-center gap-3 mb-6">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-lime-500 text-lime-500 focus:ring-lime-500"
                        checked={form.recurrence_enabled}
                        disabled={recurrenceControlsDisabled}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            recurrence_enabled: e.target.checked,
                          }))
                        }
                      />
                      <div>
                        <p className="text-base font-semibold text-slate-900">Повторять событие</p>
                        <p className="text-xs text-slate-500">Создать серию повторяющихся событий</p>
                      </div>
                    </label>

                    {(isSeriesParent || isSeriesChild) && (
                      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        {isSeriesParent
                          ? "Это родительская встреча серии. Чтобы изменить правило повторения, удалите серию и создайте новую."
                          : "Это отдельное вхождение серии. Изменения применяются только к выбранному дню."}
                      </div>
                    )}

                    {form.recurrence_enabled && (
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-slate-700">Как часто</span>
                            <select
                              disabled={recurrenceControlsDisabled}
                              value={form.recurrence_frequency}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  recurrence_frequency: e.target.value as EventDraft["recurrence_frequency"],
                                }))
                              }
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 transition-all focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-500/20"
                            >
                              <option value="daily">Каждый день</option>
                              <option value="weekly">Каждую неделю</option>
                              <option value="monthly">Каждый месяц</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-slate-700">Интервал</span>
                            <input
                              type="number"
                              min={1}
                              value={form.recurrence_interval}
                              disabled={recurrenceControlsDisabled}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  recurrence_interval: Math.max(1, Number(e.target.value)),
                                }))
                              }
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 transition-all focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-500/20"
                            />
                          </label>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-slate-700">Количество повторов</span>
                            <input
                              type="number"
                              min={1}
                              disabled={recurrenceControlsDisabled}
                              value={form.recurrence_count ?? ""}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  recurrence_count: e.target.value ? Number(e.target.value) : undefined,
                                }))
                              }
                              placeholder="Например, 10"
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 transition-all focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-500/20"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-slate-700">До даты</span>
                            <input
                              type="date"
                              disabled={recurrenceControlsDisabled}
                              value={form.recurrence_until}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  recurrence_until: e.target.value,
                                  recurrence_count: e.target.value ? undefined : prev.recurrence_count,
                                }))
                              }
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 transition-all focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-500/20"
                            />
                          </label>
                        </div>
                        <p className="text-xs text-slate-500">
                          Серия завершится при достижении лимита по количеству или указанной дате (что наступит раньше). Максимум — 180 повторений.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: Availability */}
              {activeTab === "availability" && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <ResourcePanel
                    rooms={rooms}
                    roomsLoading={roomsLoading}
                    form={form}
                    setForm={setForm}
                    selectedRoom={selectedRoom || null}
                    selectedDate={selectedDate}
                    roomAvailability={roomAvailability}
                    loadingAvailability={loadingAvailability}
                    readOnly={isReadOnly}
                    members={members}
                    membersLoading={membersLoading}
                    users={users}
                    usersLoading={usersLoading}
                    usersError={usersError}
                    authFetch={authFetch}
                    selectedCalendarId={selectedCalendarId}
                    isAllDay={form.all_day}
                    onRefreshMembers={onRefreshMembers}
                    conflicts={conflicts}
                    conflictsLoading={conflictsLoading}
                    conflictsError={conflictsError}
                  />
                </div>
              )}

              {/* Participant Status (only when editing) */}
              {activeTab === "participants" && editingEvent && editingEvent.participants && editingEvent.participants.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4">
                    <p className="text-xs uppercase tracking-wider text-slate-400">Статусы участников</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">Ответы на приглашение</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {editingEvent.participants.filter((p) => p.response_status === "accepted").length} приняли,{" "}
                      {editingEvent.participants.filter((p) => p.response_status === "declined").length} отклонили,{" "}
                      {editingEvent.participants.filter((p) => p.response_status === "tentative").length} под вопросом,{" "}
                      {editingEvent.participants.filter((p) => p.response_status === "needs_action" || !p.response_status || p.response_status === "pending").length} не ответили
                    </p>
                  </div>
                  <div className="space-y-2">
                    {editingEvent.participants.map((participant) => {
                      const isCurrentUser = participant.email === currentUserEmail;
                      return (
                        <ParticipantStatusItem
                          key={participant.user_id}
                          participant={participant}
                          eventId={editingEvent.id}
                          onUpdateStatus={onUpdateParticipantStatus}
                          canManage={canManageEvents}
                          isCurrentUser={isCurrentUser}
                          currentUserEmail={currentUserEmail}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur-sm px-6 py-4 -mx-6 -mb-6">
                <div className="flex flex-wrap gap-3">
                  {canManageEvents && onDeleteSeries && (
                    <button
                      type="button"
                      onClick={onDeleteSeries}
                      disabled={isSubmitting}
                      className="rounded-xl border border-red-300 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Удалить серию
                    </button>
                  )}
                  {canManageEvents && onDelete && (
                    <button
                      type="button"
                      onClick={onDelete}
                      disabled={isSubmitting}
                      className="rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Удалить
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                  {canManageEvents && (
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 rounded-xl bg-gradient-to-r from-lime-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-lime-500/30 transition hover:from-lime-600 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting
                        ? isEditing
                          ? "Сохраняем…"
                          : "Создаём…"
                        : isEditing
                          ? "Сохранить изменения"
                          : "Создать событие"}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

