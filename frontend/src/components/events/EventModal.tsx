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

interface EventModalProps {
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
}

export function EventModal({
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
}: EventModalProps) {
  const [roomAvailability, setRoomAvailability] = useState<EventRecord[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [conflictsError, setConflictsError] = useState<string | null>(null);
  const isReadOnly = !canManageEvents;
  const isSeriesParent = Boolean(recurrenceInfo?.isSeriesParent);
  const isSeriesChild = Boolean(recurrenceInfo?.isSeriesChild);
  const recurrenceControlsDisabled = isReadOnly || isSeriesParent || isSeriesChild;

  const selectedRoom = rooms.find((r) => r.id === form.room_id);
  const selectedDate = form.starts_at
    ? new Date(form.starts_at.split("T")[0])
    : new Date();

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
      // Используем дату из starts_at, если есть, иначе текущую дату
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
          throw new Error("Не удалось загрузить конфликты");
        }
        return response.json() as Promise<ConflictEntry[]>;
      })
      .then((data) => {
        if (!cancelled) {
          setConflicts(data);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setConflicts([]);
          setConflictsError(
            error instanceof Error
              ? error.message
              : "Не удалось загрузить конфликты",
          );
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white/95 p-8 text-slate-900 shadow-[0_20px_80px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
              {isEditing ? "Редактировать событие" : "Новое событие"}
            </p>
            <h2 className="mt-1 text-3xl font-semibold">
              {calendarName || "Новый календарь"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {isReadOnly && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            У вас нет прав редактировать события в этом календаре. Информация доступна только для просмотра.
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-6">
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <label className="block text-sm font-medium text-slate-700">
              Название *
              <input
                required
                type="text"
                disabled={isReadOnly}
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 outline-none focus:border-lime-500"
                placeholder="Например, Стендап команды"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Начало *
                <input
                  required
                  type={form.all_day ? "date" : "datetime-local"}
                  disabled={isReadOnly}
                  value={form.starts_at}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, starts_at: e.target.value }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 outline-none focus:border-lime-500"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Конец *
                <input
                  required
                  type={form.all_day ? "date" : "datetime-local"}
                  disabled={isReadOnly}
                  value={form.ends_at}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, ends_at: e.target.value }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 outline-none focus:border-lime-500"
                />
              </label>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
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
                <p className="text-sm font-semibold">Весь день</p>
                <p className="text-xs text-slate-500">
                  Конвертируем в UTC автоматически
                </p>
              </div>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Локация
              <input
                type="text"
                disabled={isReadOnly}
                value={form.location}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, location: e.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 outline-none focus:border-lime-500"
                placeholder="Например, Переговорка 301"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Описание
              <textarea
                value={form.description}
                disabled={isReadOnly}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 outline-none focus:border-lime-500"
                rows={3}
                placeholder="Дополнительная информация о событии"
              />
            </label>

            <div
              className={`space-y-4 rounded-2xl border border-dashed border-slate-200 p-4 ${
                recurrenceControlsDisabled ? "opacity-60" : ""
              }`}
            >
              <label className="flex items-center gap-3">
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
                  <p className="text-sm font-semibold text-slate-900">
                    Повторять событие
                  </p>
                  <p className="text-xs text-slate-500">
                    Базовые правила: каждый N день, неделю или месяц
                  </p>
                </div>
              </label>

              {(isSeriesParent || isSeriesChild) && (
                <p className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                  {isSeriesParent
                    ? "Это родительская встреча серии. Чтобы изменить правило повторения, удалите серию и создайте новую."
                    : "Это отдельное вхождение серии. Изменения применяются только к выбранному дню."}
                </p>
              )}

              {form.recurrence_enabled && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Как часто
                      <select
                        disabled={recurrenceControlsDisabled}
                        value={form.recurrence_frequency}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            recurrence_frequency: e.target
                              .value as EventDraft["recurrence_frequency"],
                          }))
                        }
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 outline-none focus:border-lime-500"
                      >
                        <option value="daily">Каждый день</option>
                        <option value="weekly">Каждую неделю</option>
                        <option value="monthly">Каждый месяц</option>
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Интервал
                      <input
                        type="number"
                        min={1}
                        value={form.recurrence_interval}
                        disabled={recurrenceControlsDisabled}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            recurrence_interval: Math.max(
                              1,
                              Number(e.target.value),
                            ),
                          }))
                        }
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 outline-none focus:border-lime-500"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Количество повторов
                      <input
                        type="number"
                        min={1}
                        disabled={recurrenceControlsDisabled}
                        value={form.recurrence_count ?? ""}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            recurrence_count: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          }))
                        }
                        placeholder="Например, 10"
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 outline-none focus:border-lime-500"
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      До даты
                      <input
                        type="date"
                        disabled={recurrenceControlsDisabled}
                        value={form.recurrence_until}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            recurrence_until: e.target.value,
                            recurrence_count: e.target.value
                              ? undefined
                              : prev.recurrence_count,
                          }))
                        }
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 outline-none focus:border-lime-500"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">
                    Серия завершится при достижении лимита по количеству или указанной
                    дате (что наступит раньше). Максимум — 180 повторений.
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-3 pt-4">
              {canManageEvents && onDeleteSeries && (
                <button
                  type="button"
                  onClick={onDeleteSeries}
                  disabled={isSubmitting}
                  className="flex-1 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Удалить серию
                </button>
              )}
              {canManageEvents && onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isSubmitting}
                  className="flex-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Удалить
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Отмена
              </button>
              {canManageEvents && (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-2xl bg-lime-500 px-4 py-3 font-semibold text-white transition hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-60"
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
          </form>

          {isEditing && editingEvent && editingEvent.participants && editingEvent.participants.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Статусы участников
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  Ответы на приглашение
                </h3>
              </div>
              <div className="space-y-2">
                {editingEvent.participants.map((participant) => (
                  <ParticipantStatusItem
                    key={participant.user_id}
                    participant={participant}
                    eventId={editingEvent.id}
                    onUpdateStatus={onUpdateParticipantStatus}
                    canManage={canManageEvents}
                  />
                ))}
              </div>
            </div>
          )}

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
      </div>
    </div>
  );
}

