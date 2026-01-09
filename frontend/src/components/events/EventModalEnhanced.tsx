"use client";

import { FormEvent, useCallback, useEffect, useState, useRef } from "react";
import type { EventDraft, EventRecord, ConflictEntry } from "@/types/event.types";
import type { CalendarMember } from "@/types/calendar.types";
import type { UserProfile } from "@/types/user.types";
import type { Room } from "@/types/room.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { ParticipantStatusItem } from "@/components/participants/ParticipantStatusItem";
import { ParticipantSearch } from "@/components/participants/ParticipantSearch";
import { ResourcePanel } from "@/components/rooms/ResourcePanel";
import { EventAttachments } from "@/components/events/EventAttachments";
import { CommentsSection } from "@/components/events/CommentsSection";
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
  onEventUpdated?: () => void | Promise<void>;
  onPendingFilesReady?: (files: File[]) => void;
  organizations?: Array<{id: string; name: string; slug: string}>;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  apiBaseUrl?: string;
}

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
  onEventUpdated,
  onPendingFilesReady,
  organizations = [],
  getUserOrganizationAbbreviation,
  apiBaseUrl,
}: EventModalEnhancedProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [roomAvailability, setRoomAvailability] = useState<EventRecord[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  
  useEffect(() => {
    if (onPendingFilesReady) {
      onPendingFilesReady(pendingFiles);
    }
  }, [pendingFiles, onPendingFilesReady]);
  
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [conflictsError, setConflictsError] = useState<string | null>(null);
  const [showRecurrence, setShowRecurrence] = useState(false);
  
  // Упрощенная функция закрытия - просто закрываем модальное окно
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);
  
  const isReadOnly = !canManageEvents;
  const isSeriesParent = Boolean(recurrenceInfo?.isSeriesParent);
  const isSeriesChild = Boolean(recurrenceInfo?.isSeriesChild);
  const recurrenceControlsDisabled = isReadOnly || isSeriesParent || isSeriesChild;

  const selectedRoom = rooms.find((r) => r.id === form.room_id);
  
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (form.starts_at) {
      return new Date(form.starts_at.split("T")[0]);
    }
    return new Date();
  });
  
  const navigateDays = useCallback((days: number) => {
    setViewDate((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + days);
      return newDate;
    });
  }, []);
  
  const prevStartsAtDateRef = useRef<string | null>(null);
  const viewDateRef = useRef<Date>(viewDate);
  
  useEffect(() => {
    viewDateRef.current = viewDate;
  }, [viewDate]);
  
  useEffect(() => {
    if (form.starts_at) {
      const dateStr = form.starts_at.split("T")[0];
      if (prevStartsAtDateRef.current === dateStr) {
        return;
      }
      prevStartsAtDateRef.current = dateStr;
      const currentViewDate = viewDateRef.current;
      const currentViewDateStr = `${currentViewDate.getFullYear()}-${String(currentViewDate.getMonth() + 1).padStart(2, "0")}-${String(currentViewDate.getDate()).padStart(2, "0")}`;
      if (dateStr !== currentViewDateStr) {
        const formDate = new Date(dateStr + "T00:00:00");
        setViewDate(formDate);
      }
    }
  }, [form.starts_at]);
  
  const handleNavigateDays = useCallback((days: number) => {
    const currentViewDate = new Date(viewDate);
    const newViewDate = new Date(currentViewDate);
    newViewDate.setDate(newViewDate.getDate() + days);
    setViewDate(newViewDate);
    if (form.starts_at && form.ends_at) {
      const startTime = form.starts_at.split("T")[1];
      const endTime = form.ends_at.split("T")[1];
      const newStart = `${newViewDate.toISOString().split("T")[0]}T${startTime}`;
      const newEnd = `${newViewDate.toISOString().split("T")[0]}T${endTime}`;
      setForm((prevForm) => ({
        ...prevForm,
        starts_at: newStart,
        ends_at: newEnd,
      }));
    }
  }, [viewDate, form.starts_at, form.ends_at, setForm]);

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
      const date = new Date(viewDate);
      date.setHours(0, 0, 0, 0);
      loadRoomAvailability(form.room_id, date);
    } else {
      setRoomAvailability([]);
    }
  }, [form.room_id, viewDate, loadRoomAvailability]);

  const conflictsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!selectedCalendarId) {
      setConflicts([]);
      setConflictsError(null);
      return;
    }
    
    if (conflictsTimeoutRef.current) {
      clearTimeout(conflictsTimeoutRef.current);
    }
    
    conflictsTimeoutRef.current = setTimeout(() => {
      let targetDate: Date;
      if (viewDate) {
        targetDate = viewDate;
      } else if (form.starts_at) {
        const dateStr = form.starts_at.split("T")[0];
        const [year, month, day] = dateStr.split("-").map(Number);
        targetDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      } else {
        const now = new Date();
        targetDate = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          0, 0, 0, 0
        ));
      }
      const fromDate = new Date(Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
        0, 0, 0, 0
      ));
      const toDate = new Date(Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
        23, 59, 59, 999
      ));

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
    }, 500);

    return () => {
      if (conflictsTimeoutRef.current) {
        clearTimeout(conflictsTimeoutRef.current);
      }
    };
  }, [
    authFetch,
    form.participant_ids,
    form.room_id,
    selectedCalendarId,
    viewDate,
  ]);

  return (
    <>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
      >
        <div 
          className="w-full max-w-5xl max-h-[95vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Компактный заголовок */}
          <div className="border-b border-slate-200 bg-white px-5 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="text-lg font-semibold text-slate-900 truncate">
                {isEditing ? "Редактировать событие" : "Новое событие"}
              </h2>
              {calendarName && (
                <span className="text-xs text-slate-500 truncate">• {calendarName}</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canManageEvents && (
                <button
                  type="submit"
                  form="event-form"
                  disabled={isSubmitting}
                  className="rounded-lg bg-lime-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-lime-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (isEditing ? "Сохранение..." : "Создание...") : (isEditing ? "Сохранить" : "Создать")}
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Закрыть"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Контент с таймлайном как основным элементом */}
          <div className="flex-1 overflow-y-auto">
            <form id="event-form" onSubmit={onSubmit} className="p-5 space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {isReadOnly && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  У вас нет прав редактировать события в этом календаре
                </div>
              )}

              {/* Компактная форма - название и время */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block mb-1">
                    <span className="text-xs font-medium text-slate-700">
                      Название <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <input
                    required
                    type="text"
                    disabled={isReadOnly}
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition focus:border-lime-500 focus:ring-1 focus:ring-lime-500/20"
                    placeholder="Название события"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block mb-1">
                      <span className="text-xs font-medium text-slate-700">Начало</span>
                    </label>
                    <input
                      required
                      type="datetime-local"
                      disabled={isReadOnly}
                      value={form.starts_at}
                      onChange={(e) => setForm((prev) => ({ ...prev, starts_at: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 transition focus:border-lime-500 focus:ring-1 focus:ring-lime-500/20"
                    />
                  </div>
                  <div>
                    <label className="block mb-1">
                      <span className="text-xs font-medium text-slate-700">Конец</span>
                    </label>
                    <input
                      required
                      type="datetime-local"
                      disabled={isReadOnly}
                      value={form.ends_at}
                      onChange={(e) => setForm((prev) => ({ ...prev, ends_at: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 transition focus:border-lime-500 focus:ring-1 focus:ring-lime-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Описание - компактно */}
              <div>
                <label className="block mb-1">
                  <span className="text-xs font-medium text-slate-700">Описание</span>
                </label>
                <textarea
                  value={form.description}
                  disabled={isReadOnly}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition focus:border-lime-500 focus:ring-1 focus:ring-lime-500/20 resize-none"
                  rows={2}
                  placeholder="Дополнительная информация..."
                />
              </div>

              {/* Таймлайн с занятостью - основной элемент */}
              <div className="border-t border-slate-200 pt-4">
                {/* Навигация по дням - компактно */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleNavigateDays(-1)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                    >
                      ←
                    </button>
                    <div className="px-4 py-1.5 text-sm font-medium text-slate-900 bg-slate-50 rounded-lg border border-slate-200 min-w-[200px] text-center">
                      {viewDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleNavigateDays(1)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                    >
                      →
                    </button>
                  </div>
                </div>

                {/* Участники - компактно */}
                <div className="mb-4">
                  <ParticipantSearch
                    form={form}
                    setForm={setForm}
                    users={users}
                    usersLoading={usersLoading}
                    usersError={usersError}
                    calendarMembers={members}
                    membersLoading={membersLoading}
                    readOnly={isReadOnly}
                    organizations={organizations}
                    getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
                    apiBaseUrl={apiBaseUrl}
                    currentUserEmail={currentUserEmail}
                    compact={true}
                  />
                </div>

                {/* Таймлайн */}
                <ResourcePanel
                  rooms={rooms}
                  roomsLoading={roomsLoading}
                  form={form}
                  setForm={setForm}
                  selectedRoom={selectedRoom || null}
                  selectedDate={viewDate}
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
                  isAllDay={false}
                  onRefreshMembers={onRefreshMembers}
                  conflicts={conflicts}
                  getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
                  organizations={organizations}
                  apiBaseUrl={apiBaseUrl}
                  currentUserEmail={currentUserEmail}
                />
              </div>

              {/* Статусы участников (только при редактировании) */}
              {editingEvent && editingEvent.participants && editingEvent.participants.length > 0 && (
                <div className="border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-medium text-slate-900 mb-3">Ответы участников</h3>
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
                          getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Вложения - компактно */}
              <div className="border-t border-slate-200 pt-4">
                <EventAttachments
                  eventId={editingEvent?.id || null}
                  attachments={editingEvent?.attachments || []}
                  authFetch={authFetch}
                  canManage={canManageEvents}
                  onAttachmentsChange={onEventUpdated}
                  pendingFiles={pendingFiles}
                  onPendingFilesChange={setPendingFiles}
                />
              </div>

              {/* Комментарии */}
              {editingEvent?.id && (
                <div className="border-t border-slate-200 pt-4">
                  <CommentsSection
                    eventId={editingEvent.id}
                    authFetch={authFetch}
                    currentUserId={editingEvent.participants?.find(p => p.email === currentUserEmail)?.user_id || undefined}
                    currentUserEmail={currentUserEmail}
                    users={users}
                    getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
                    organizations={organizations}
                    apiBaseUrl={apiBaseUrl}
                  />
                </div>
              )}

              {/* Повторения - компактно */}
              <div className="border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRecurrence(!showRecurrence)}
                  disabled={recurrenceControlsDisabled}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 transition ${
                    recurrenceControlsDisabled ? "opacity-60 cursor-not-allowed bg-slate-50" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.recurrence_enabled}
                      disabled={recurrenceControlsDisabled}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, recurrence_enabled: e.target.checked }));
                        if (e.target.checked) setShowRecurrence(true);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-slate-300 text-lime-500 focus:ring-lime-500"
                    />
                    <span className="text-sm font-medium text-slate-900">Повторять событие</span>
                  </div>
                  <svg
                    className={`h-4 w-4 text-slate-400 transition-transform ${showRecurrence ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {(isSeriesParent || isSeriesChild) && (
                  <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                    {isSeriesParent
                      ? "Это родительская встреча серии. Чтобы изменить правило повторения, удалите серию и создайте новую."
                      : "Это отдельное вхождение серии. Изменения применяются только к выбранному дню."}
                  </div>
                )}

                {showRecurrence && form.recurrence_enabled && (
                  <div className="mt-3 space-y-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-700">Как часто</span>
                        <select
                          disabled={recurrenceControlsDisabled}
                          value={form.recurrence_frequency}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              recurrence_frequency: e.target.value as EventDraft["recurrence_frequency"],
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-lime-500 focus:ring-1 focus:ring-lime-500/20"
                        >
                          <option value="daily">Каждый день</option>
                          <option value="weekly">Каждую неделю</option>
                          <option value="monthly">Каждый месяц</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-700">Интервал</span>
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
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-lime-500 focus:ring-1 focus:ring-lime-500/20"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-700">Количество повторов</span>
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
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-lime-500 focus:ring-1 focus:ring-lime-500/20"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-700">До даты</span>
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
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-lime-500 focus:ring-1 focus:ring-lime-500/20"
                        />
                      </label>
                    </div>
                    <p className="text-xs text-slate-500">Максимум — 180 повторений</p>
                  </div>
                )}
              </div>

              {/* Кнопки действий внизу */}
              <div className="flex gap-2 pt-4 border-t border-slate-200">
                {canManageEvents && onDeleteSeries && (
                  <button
                    type="button"
                    onClick={onDeleteSeries}
                    disabled={isSubmitting}
                    className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Удалить серию
                  </button>
                )}
                {canManageEvents && onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={isSubmitting}
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Удалить
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="ml-auto rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
