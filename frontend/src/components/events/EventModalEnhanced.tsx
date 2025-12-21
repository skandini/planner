"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
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
  
  // Передаем временные файлы в родительский компонент
  useEffect(() => {
    if (onPendingFilesReady) {
      onPendingFilesReady(pendingFiles);
    }
  }, [pendingFiles, onPendingFilesReady]);
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [conflictsError, setConflictsError] = useState<string | null>(null);
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  
  // Проверяем, есть ли несохраненные изменения
  const hasUnsavedChanges = useCallback(() => {
    // При создании проверяем, заполнена ли форма
    if (!isEditing) {
      return form.title.trim() !== "" || 
             (form.description && form.description.trim() !== "") || 
             (form.location && form.location.trim() !== "") ||
             form.room_id !== null ||
             (form.participant_ids && form.participant_ids.length > 0) ||
             form.recurrence_enabled ||
             pendingFiles.length > 0;
    }
    
    // При редактировании всегда считаем, что есть изменения (для безопасности)
    // Можно улучшить, сравнивая с исходными данными
    return true;
  }, [form, isEditing, pendingFiles.length]);
  
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);
  
  const handleConfirmClose = useCallback(() => {
    setShowCloseConfirm(false);
    onClose();
  }, [onClose]);
  
  const isReadOnly = !canManageEvents;
  const isSeriesParent = Boolean(recurrenceInfo?.isSeriesParent);
  const isSeriesChild = Boolean(recurrenceInfo?.isSeriesChild);
  const recurrenceControlsDisabled = isReadOnly || isSeriesParent || isSeriesChild;

  const selectedRoom = rooms.find((r) => r.id === form.room_id);
  const selectedDate = form.starts_at
    ? new Date(form.starts_at.split("T")[0])
    : new Date();
  
  // Дата для просмотра в таймлайне (может отличаться от selectedDate)
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (form.starts_at) {
      return new Date(form.starts_at.split("T")[0]);
    }
    return new Date();
  });
  
  // Навигация по дням
  const navigateDays = useCallback((days: number) => {
    setViewDate((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + days);
      return newDate;
    });
  }, []);
  
  // Синхронизируем viewDate с selectedDate только при первой загрузке
  const [initialDateSet, setInitialDateSet] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  
  useEffect(() => {
    if (form.starts_at && !initialDateSet) {
      const newDate = new Date(form.starts_at.split("T")[0]);
      setViewDate(newDate);
      setInitialDateSet(true);
    }
  }, [form.starts_at, initialDateSet]);
  
  // Обновляем даты в форме при изменении viewDate (после навигации)
  useEffect(() => {
    if (isNavigating && form.starts_at && form.ends_at) {
      const startTime = form.starts_at.split("T")[1];
      const endTime = form.ends_at.split("T")[1];
      const newStart = `${viewDate.toISOString().split("T")[0]}T${startTime}`;
      const newEnd = `${viewDate.toISOString().split("T")[0]}T${endTime}`;
      setForm((prev) => ({
        ...prev,
        starts_at: newStart,
        ends_at: newEnd,
      }));
      setIsNavigating(false);
    }
  }, [viewDate, isNavigating, form.starts_at, form.ends_at, setForm]);
  
  // Обновленная навигация с флагом
  const handleNavigateDays = useCallback((days: number) => {
    setIsNavigating(true);
    navigateDays(days);
  }, [navigateDays]);

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
    if (!selectedCalendarId) {
      setConflicts([]);
      setConflictsError(null);
      return;
    }
    
    // Загружаем конфликты для всего дня, чтобы видеть их в таймлайне
    // Используем viewDate для определения дня, а не выбранное время события
    const targetDate = viewDate || (form.starts_at ? new Date(form.starts_at.split("T")[0]) : new Date());
    const fromDate = new Date(targetDate);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(targetDate);
    toDate.setHours(23, 59, 59, 999);

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
    form.participant_ids,
    form.room_id,
    selectedCalendarId,
    viewDate,  // Загружаем конфликты при изменении дня просмотра
  ]);

  return (
    <>
      {/* Диалог подтверждения закрытия */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Вы уверены?</h3>
            <p className="text-sm text-slate-600 mb-6">
              Все несохраненные изменения будут потеряны. Вы действительно хотите закрыть модальное окно?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmClose}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
              >
                Закрыть без сохранения
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        style={{ animation: 'fadeIn 0.2s ease-out forwards' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
      >
      <div 
        className="w-full max-w-6xl max-h-[96vh] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl"
        style={{ animation: 'fadeInUp 0.3s ease-out forwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Современный заголовок с кнопками */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50">
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 shadow-lg shadow-lime-500/30">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {isEditing ? "Редактировать событие" : "Новое событие"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">{calendarName || "Новый календарь"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
              aria-label="Закрыть"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            </div>
            
            {/* Кнопка для перехода по ссылке на онлайн встречу */}
            {editingEvent?.room_online_meeting_url && (
              <div className="mb-4">
                <a
                  href={editingEvent.room_online_meeting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-600 hover:to-indigo-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Присоединиться к онлайн встрече
                </a>
              </div>
            )}
            
            {/* Кнопки действий - перемещены вверх */}
            <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
              {canManageEvents && onDeleteSeries && (
                <button
                  type="button"
                  onClick={onDeleteSeries}
                  disabled={isSubmitting}
                  className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Удалить серию
                </button>
              )}
              {canManageEvents && onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isSubmitting}
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Удалить
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Отмена
              </button>
              {canManageEvents && (
                <button
                  type="submit"
                  form="event-form"
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg bg-gradient-to-r from-lime-500 to-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-lime-500/30 transition hover:from-lime-600 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
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
          </div>
        </div>

        {/* Контент */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(96vh - 280px)" }}>
          <form id="event-form" onSubmit={onSubmit} className="p-6">
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {isReadOnly && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <span>У вас нет прав редактировать события в этом календаре</span>
              </div>
            )}

            <div className="space-y-6">
              {/* Основная информация - компактный дизайн */}
              <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/50 p-4">
                <div className="space-y-3">
                  {/* Название */}
                  <div>
                    <label className="block mb-1.5">
                      <span className="text-xs font-semibold text-slate-700">
                        Название <span className="text-red-500">*</span>
                      </span>
                    </label>
                    <input
                      required
                      type="text"
                      disabled={isReadOnly}
                      value={form.title}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, title: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20"
                      placeholder="Например, Стендап команды"
                    />
                  </div>

                  {/* Даты - в одну строку */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block mb-1.5">
                        <span className="text-xs font-medium text-slate-600">
                          Начало <span className="text-red-500">*</span>
                        </span>
                      </label>
                      <input
                        required
                        type="datetime-local"
                        disabled={isReadOnly}
                        value={form.starts_at}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, starts_at: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 transition-all focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20"
                      />
                    </div>
                    <div>
                      <label className="block mb-1.5">
                        <span className="text-xs font-medium text-slate-600">
                          Конец <span className="text-red-500">*</span>
                        </span>
                      </label>
                      <input
                        required
                        type="datetime-local"
                        disabled={isReadOnly}
                        value={form.ends_at}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, ends_at: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 transition-all focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20"
                      />
                    </div>
                  </div>

                  {/* Описание */}
                  <div>
                    <label className="block mb-1.5">
                      <span className="text-xs font-semibold text-slate-700">Описание</span>
                    </label>
                    <textarea
                      value={form.description}
                      disabled={isReadOnly}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 resize-none"
                      rows={2}
                      placeholder="Дополнительная информация..."
                    />
                  </div>
                </div>
              </div>

              {/* Таймлайн и переговорки */}
              <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/50 p-5">
                {/* Компактный выбор участников в одну строчку */}
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
                
                {/* Навигация по дням */}
                <div className="mb-4 flex items-center justify-center">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleNavigateDays(-1)}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm"
                      title="День назад"
                    >
                      ←
                    </button>
                    <div className="px-6 py-2 text-sm font-semibold text-slate-900 min-w-[180px] text-center bg-gradient-to-r from-slate-50 to-white rounded-lg border border-slate-200 shadow-sm">
                      {viewDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleNavigateDays(1)}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm"
                      title="День вперед"
                    >
                      →
                    </button>
                  </div>
                </div>
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
                />
              </div>

              {/* Статусы участников (только при редактировании) */}
              {editingEvent && editingEvent.participants && editingEvent.participants.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-slate-900">Ответы участников</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {editingEvent.participants.filter((p) => p.response_status === "accepted").length} приняли,{" "}
                      {editingEvent.participants.filter((p) => p.response_status === "declined").length} отклонили,{" "}
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
                          getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Вложения */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
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
              )}

              {/* Повторения */}
              <div className="rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setShowRecurrence(!showRecurrence)}
                  disabled={recurrenceControlsDisabled}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition ${
                    recurrenceControlsDisabled ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={form.recurrence_enabled}
                      disabled={recurrenceControlsDisabled}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, recurrence_enabled: e.target.checked }));
                        if (e.target.checked) setShowRecurrence(true);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-lime-500 text-lime-500 focus:ring-lime-500"
                    />
                    <span className="text-sm font-semibold text-slate-900">Повторять событие</span>
                  </div>
                  <svg
                    className={`h-5 w-5 text-slate-400 transition-transform ${showRecurrence ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {(isSeriesParent || isSeriesChild) && (
                  <div className="border-t border-slate-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    {isSeriesParent
                      ? "Это родительская встреча серии. Чтобы изменить правило повторения, удалите серию и создайте новую."
                      : "Это отдельное вхождение серии. Изменения применяются только к выбранному дню."}
                  </div>
                )}

                {showRecurrence && form.recurrence_enabled && (
                  <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-700">Как часто</span>
                        <select
                          disabled={recurrenceControlsDisabled}
                          value={form.recurrence_frequency}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              recurrence_frequency: e.target.value as EventDraft["recurrence_frequency"],
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-all focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20"
                        >
                          <option value="daily">Каждый день</option>
                          <option value="weekly">Каждую неделю</option>
                          <option value="monthly">Каждый месяц</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-700">Интервал</span>
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
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-all focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-700">Количество повторов</span>
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
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-all focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-700">До даты</span>
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
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-all focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20"
                        />
                      </label>
                    </div>
                    <p className="text-xs text-slate-500">Максимум — 180 повторений</p>
                  </div>
                )}
              </div>
            </div>

          </form>
        </div>
      </div>
    </div>
    </>
  );
}
