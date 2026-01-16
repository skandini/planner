"use client";

import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { EventDraft, EventRecord, ConflictEntry } from "@/types/event.types";
import type { CalendarMember } from "@/types/calendar.types";
import type { UserProfile, EventParticipant } from "@/types/user.types";
import type { Room } from "@/types/room.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { ParticipantStatusItem } from "@/components/participants/ParticipantStatusItem";
import { ParticipantSearch } from "@/components/participants/ParticipantSearch";
import { ResourcePanel } from "@/components/rooms/ResourcePanel";
import { EventAttachments } from "@/components/events/EventAttachments";
import { CommentsSection } from "@/components/events/CommentsSection";
import { getTimeInTimeZone, MOSCOW_TIMEZONE, addDaysInMoscow } from "@/lib/utils/dateUtils";

interface EventModalModernProps {
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
  departments?: Array<{id: string; name: string; description?: string | null; parent_id?: string | null}>;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  apiBaseUrl?: string;
  accentColor?: string;
  events?: EventRecord[];
}

export function EventModalModern({
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
  departments = [],
  getUserOrganizationAbbreviation,
  apiBaseUrl,
  accentColor = "#6366f1",
  events = [],
}: EventModalModernProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [showDescription, setShowDescription] = useState(!!form.description);
  
  const titleId = useId();
  
  useEffect(() => {
    if (onPendingFilesReady) {
      onPendingFilesReady(pendingFiles);
    }
  }, [pendingFiles, onPendingFilesReady]);
  
  const isReadOnly = !canManageEvents;
  const isSeriesParent = Boolean(recurrenceInfo?.isSeriesParent);
  const isSeriesChild = Boolean(recurrenceInfo?.isSeriesChild);
  const recurrenceControlsDisabled = isReadOnly || isSeriesParent || isSeriesChild;

  // Мемоизируем selectedRoom чтобы избежать пересчета на каждом рендере
  const selectedRoom = useMemo(() => rooms.find((r) => r.id === form.room_id), [rooms, form.room_id]);
  const calendarLabel = useMemo(() => calendarName || "Календарь", [calendarName]);
  
  // Дата для таймлайна
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (form.starts_at) {
      const [datePart] = form.starts_at.split("T");
      return new Date(`${datePart}T12:00:00+03:00`);
    }
    const now = new Date();
    const nowMoscow = getTimeInTimeZone(now, MOSCOW_TIMEZONE);
    const pad = (n: number) => String(n).padStart(2, '0');
    return new Date(`${nowMoscow.year}-${pad(nowMoscow.month + 1)}-${pad(nowMoscow.day)}T12:00:00+03:00`);
  });
  
  const [isNavigating, setIsNavigating] = useState(false);
  
  const navigateDays = useCallback((days: number) => {
    setIsNavigating(true);
    setViewDate((prev) => addDaysInMoscow(prev, days));
  }, []);
  
  // Обновляем даты в форме при навигации
  useEffect(() => {
    if (isNavigating) {
      const viewDateMoscow = getTimeInTimeZone(viewDate, MOSCOW_TIMEZONE);
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateStr = `${viewDateMoscow.year}-${pad(viewDateMoscow.month + 1)}-${pad(viewDateMoscow.day)}`;
      
      // Сохраняем текущий фокус перед обновлением
      const activeEl = document.activeElement as HTMLElement;
      
      setForm((prev) => {
        const startTime = prev.starts_at?.split("T")[1] || "09:00";
        const endTime = prev.ends_at?.split("T")[1] || "10:00";
        return {
          ...prev,
          starts_at: `${dateStr}T${startTime}`,
          ends_at: `${dateStr}T${endTime}`,
        };
      });
      setIsNavigating(false);
      
      // Восстанавливаем фокус после обновления состояния
      requestAnimationFrame(() => {
        if (activeEl && activeEl !== document.body && document.body.contains(activeEl)) {
          activeEl.focus();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate, isNavigating]);
  
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // UX: блокируем скролл, закрытие по Escape
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [handleClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-gradient-to-br from-black/60 via-slate-900/50 to-black/60 p-0 backdrop-blur-md sm:items-center sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
        aria-hidden="true"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="w-full max-w-7xl max-h-[96vh] sm:max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ========== HEADER (Компактный) ========== */}
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white">
            <div className="px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="h-8 w-8 rounded-lg flex-shrink-0"
                  style={{ 
                    background: accentColor,
                  }}
                />
                <div className="min-w-0">
                  <h2 id={titleId} className="text-lg font-bold text-slate-900 truncate">
                    {isEditing ? "Редактировать событие" : "Новое событие"}
                  </h2>
                  <div className="flex items-center gap-1.5 text-[0.7rem] text-slate-500">
                    <span className="truncate">{calendarLabel}</span>
                    <span aria-hidden="true">•</span>
                    <span className="whitespace-nowrap">МСК</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {canManageEvents && onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={isSubmitting}
                    className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[0.7rem] font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                  >
                    Удалить
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Закрыть"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* ========== CONTENT (Основная информация и участники наверху) ========== */}
          <div className="p-3">
            {(error || isReadOnly) && (
              <div className="mb-4 space-y-2">
                {error && (
                  <div className="rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-red-100/30 p-3.5 text-sm text-red-700 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span className="font-medium">{error}</span>
                    </div>
                  </div>
                )}

                {isReadOnly && (
                  <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/30 p-3.5 text-sm text-amber-800 shadow-sm">
                    <span className="font-medium">У вас нет прав редактировать события в этом календаре</span>
                  </div>
                )}
              </div>
            )}

            <form id="event-form" onSubmit={onSubmit} autoComplete="off">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {/* ========== ЛЕВАЯ КОЛОНКА ========== */}
                <div className="space-y-3">
                  {/* Название, время и повторяемость */}
                  <div className="space-y-3">
                    {/* Название события */}
                    <div>
                      <label className="block mb-1.5 text-xs font-medium text-slate-600">
                        Название события <span className="text-red-500">*</span>
                      </label>
                      <input
                        required
                        type="text"
                        disabled={isReadOnly}
                        value={form.title}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, title: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30"
                        placeholder="Введите название события..."
                      />
                    </div>

                    {/* Время */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block mb-1.5 text-xs font-medium text-slate-600">
                          Начало <span className="text-red-500">*</span>
                        </label>
                        <input
                          required
                          type="datetime-local"
                          disabled={isReadOnly}
                          value={form.starts_at}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, starts_at: e.target.value }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30"
                        />
                      </div>
                      <div>
                        <label className="block mb-1.5 text-xs font-medium text-slate-600">
                          Конец <span className="text-red-500">*</span>
                        </label>
                        <input
                          required
                          type="datetime-local"
                          disabled={isReadOnly}
                          value={form.ends_at}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, ends_at: e.target.value }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30"
                        />
                      </div>
                    </div>

                    {/* Повторяемость встреч */}
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowRecurrence(!showRecurrence)}
                        disabled={recurrenceControlsDisabled}
                        className="w-full flex items-center justify-between text-left transition-opacity disabled:opacity-60 py-1"
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
                            className="h-4 w-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
                          />
                          <span className="text-xs font-medium text-slate-700">Повторять событие</span>
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

                      {showRecurrence && form.recurrence_enabled && (
                        <div className="mt-3 space-y-2.5">
                          <div className="grid grid-cols-2 gap-2.5">
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-slate-600">Как часто</span>
                              <select
                                disabled={recurrenceControlsDisabled}
                                value={form.recurrence_frequency}
                                onChange={(e) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    recurrence_frequency: e.target.value as EventDraft["recurrence_frequency"],
                                  }))
                                }
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30"
                              >
                                <option value="daily">Каждый день</option>
                                <option value="weekly">Каждую неделю</option>
                                <option value="monthly">Каждый месяц</option>
                              </select>
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-slate-600">Интервал</span>
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
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30"
                              />
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-2.5">
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-slate-600">Повторов</span>
                              <input
                                type="number"
                                min={1}
                                disabled={recurrenceControlsDisabled}
                                value={form.recurrence_count ?? ""}
                                onChange={(e) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    recurrence_count: e.target.value ? Number(e.target.value) : undefined,
                                    recurrence_until: e.target.value ? "" : prev.recurrence_until,
                                  }))
                                }
                                placeholder="10"
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-slate-600">До даты</span>
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
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30"
                              />
                            </label>
                          </div>
                          <p className="text-[0.65rem] text-slate-500">
                            Завершится при достижении лимита или даты
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Описание (опционально, с раскрытием) */}
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowDescription(!showDescription)}
                        className="w-full flex items-center justify-between text-left text-xs font-medium text-slate-700 hover:text-indigo-600 transition-colors py-1"
                      >
                        <span>Описание (опционально)</span>
                        <svg
                          className={`h-4 w-4 transition-transform ${showDescription ? "rotate-180" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {showDescription && (
                        <textarea
                          value={form.description}
                          disabled={isReadOnly}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, description: e.target.value }))
                          }
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 resize-none"
                          rows={3}
                          placeholder="Описание события..."
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* ========== ПРАВАЯ КОЛОНКА - Участники ========== */}
                <div className="space-y-3">
                  {/* Участники (статусы) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Участники</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {form.participant_ids.length > 0
                            ? `${form.participant_ids.length} чел.`
                            : "Добавьте участников"}
                        </p>
                      </div>
                      {form.participant_ids.length > 0 && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                          {form.participant_ids.length}
                        </span>
                      )}
                    </div>

                    {!isReadOnly && (
                      <div className="mb-3">
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
                          departments={departments}
                          getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
                          apiBaseUrl={apiBaseUrl}
                          currentUserEmail={currentUserEmail}
                          compact={true}
                        />
                      </div>
                    )}

                    {/* Список участников */}
                    {editingEvent?.participants && editingEvent.participants.length > 0 ? (
                      <div className="space-y-2">
                        {editingEvent.participants.map((participant) => (
                          <ParticipantStatusItem
                            key={participant.user_id}
                            participant={participant}
                            eventId={editingEvent.id}
                            onUpdateStatus={onUpdateParticipantStatus}
                            canManage={canManageEvents}
                            isCurrentUser={participant.email === currentUserEmail}
                            currentUserEmail={currentUserEmail}
                            getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
                            apiBaseUrl={apiBaseUrl}
                            isRecurring={recurrenceInfo?.isSeriesChild || recurrenceInfo?.isSeriesParent || false}
                            onUpdateStatusSeries={async (eventId, userId, status, applyTo) => {
                              if (!onUpdateParticipantStatus) return;
                              
                              if (applyTo === "this") {
                                // Обновляем только текущее событие
                                await onUpdateParticipantStatus(eventId, userId, status);
                              } else if (applyTo === "all") {
                                // Находим все события серии
                                const currentEvent = editingEvent || events.find(e => e.id === eventId);
                                if (!currentEvent) {
                                  await onUpdateParticipantStatus(eventId, userId, status);
                                  return;
                                }
                                
                                // Определяем ID родительского события
                                const parentId = currentEvent.recurrence_parent_id || currentEvent.id;
                                
                                // Находим все события серии (включая родительское и все дочерние)
                                const seriesEvents = events.filter(e => 
                                  e.id === parentId || e.recurrence_parent_id === parentId
                                );
                                
                                // Обновляем статус для всех событий серии
                                for (const event of seriesEvents) {
                                  try {
                                    await onUpdateParticipantStatus(event.id, userId, status);
                                  } catch (err) {
                                    console.error(`Failed to update status for event ${event.id}:`, err);
                                  }
                                }
                              }
                            }}
                          />
                        ))}
                      </div>
                    ) : form.participant_ids.length > 0 ? (
                      <div className="space-y-2">
                        {users
                          .filter((user) => form.participant_ids.includes(user.id))
                          .map((user) => (
                            <div
                              key={user.id}
                              className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm"
                            >
                              {user.avatar_url ? (
                                <img
                                  src={user.avatar_url.startsWith("http") ? user.avatar_url : `${apiBaseUrl}${user.avatar_url}`}
                                  alt={user.full_name || user.email}
                                  className="h-8 w-8 rounded-full object-cover border-2 border-slate-200 flex-shrink-0"
                                />
                              ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-xs font-semibold text-white flex-shrink-0">
                                  {(user.full_name || user.email)[0].toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-slate-900 truncate">
                                  {user.full_name || user.email}
                                </p>
                                {user.full_name && (
                                  <p className="text-[0.65rem] text-slate-500 truncate">{user.email}</p>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-xs text-slate-500">
                        {isReadOnly ? "Нет участников" : "Добавьте участников"}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ========== TIMELINE SECTION - Ресурсы и занятость ========== */}
              <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <ResourcePanel
                  rooms={rooms}
                  roomsLoading={roomsLoading}
                  form={form}
                  setForm={setForm}
                  selectedRoom={selectedRoom || null}
                  selectedDate={viewDate}
                  roomAvailability={[]}
                  loadingAvailability={false}
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
                  conflicts={[]}
                  getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
                  organizations={organizations}
                  apiBaseUrl={apiBaseUrl}
                  accentColor={accentColor}
                  events={events}
                  currentUserEmail={currentUserEmail}
                  editingEventId={editingEvent?.id}
                  onNavigateDays={navigateDays}
                  variant="modal"
                />
              </div>

              {/* ========== Переговорная комната ========== */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">
                  Переговорная комната
                </label>
                
                {roomsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-3 text-sm text-slate-500 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
                    Загрузка...
                  </div>
                ) : (
                  <select
                    value={form.room_id || ""}
                    disabled={isReadOnly}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        room_id: e.target.value || null,
                      }))
                    }
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 hover:border-slate-300 disabled:bg-slate-50"
                  >
                    <option value="" className="bg-white text-slate-900">
                      Без переговорной
                    </option>
                    {rooms.length === 0 ? (
                      <option disabled className="bg-white text-slate-400">
                        Нет доступных переговорок
                      </option>
                    ) : (
                      rooms.map((room) => (
                        <option
                          key={room.id}
                          value={room.id}
                          className="bg-white text-slate-900"
                        >
                          {room.name}
                          {room.capacity > 1 ? ` (до ${room.capacity} чел.)` : ""}
                          {room.location ? ` — ${room.location}` : ""}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>

              {/* ========== Вложения ========== */}
              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-xs font-medium text-slate-600 mb-2.5">Вложения</h3>
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

              {/* ========== Комментарии ========== */}
              {editingEvent?.id && (
                <div className="pt-4 border-t border-slate-100">
                  <CommentsSection
                    eventId={editingEvent.id}
                    authFetch={authFetch}
                    currentUserId={editingEvent.participants?.find(p => p.email === currentUserEmail)?.user_id}
                    currentUserEmail={currentUserEmail}
                    users={users}
                    getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
                    organizations={organizations}
                    apiBaseUrl={apiBaseUrl}
                  />
                </div>
              )}

              {/* ========== FOOTER (Кнопки) ========== */}
              <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-2.5 flex items-center justify-end gap-2 -mx-3 -mb-3 mt-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Отмена
                </button>
                {canManageEvents && (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded bg-indigo-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting
                      ? isEditing
                        ? "Сохраняем…"
                        : "Создаём…"
                      : isEditing
                        ? "Сохранить"
                        : "Создать"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

