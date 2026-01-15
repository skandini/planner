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
import { toUTCDateISO, getTimeInTimeZone, parseUTC, MOSCOW_TIMEZONE, addDaysInMoscow } from "@/lib/utils/dateUtils";
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
  accentColor?: string; // Цвет календаря для занятого времени
  events?: EventRecord[]; // События из основного массива для отображения в таймлайне
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
  accentColor = "#6366f1", // По умолчанию indigo-500
  events = [], // События из основного массива
}: EventModalEnhancedProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [roomAvailability, setRoomAvailability] = useState<EventRecord[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  const titleId = useId();
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  
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
  
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);
  
  const isReadOnly = !canManageEvents;
  const isSeriesParent = Boolean(recurrenceInfo?.isSeriesParent);
  const isSeriesChild = Boolean(recurrenceInfo?.isSeriesChild);
  const recurrenceControlsDisabled = isReadOnly || isSeriesParent || isSeriesChild;

  const selectedRoom = rooms.find((r) => r.id === form.room_id);

  const calendarLabel = useMemo(() => calendarName || "Календарь", [calendarName]);
  
  // Получаем дату из формы, интерпретируя её как московское время
  // form.starts_at в формате "YYYY-MM-DDTHH:mm" содержит дату и время в московском времени
  // Создаем Date объект правильно, используя строку с явным указанием московского времени
  const getDateFromForm = useCallback((dateStr: string | null): Date => {
    if (!dateStr) {
      // Если нет даты, создаем текущую дату в московском времени
      const now = new Date();
      const nowMoscow = getTimeInTimeZone(now, MOSCOW_TIMEZONE);
      // Создаем дату в московском времени (UTC+3) - полдень для избежания проблем
      const moscowDateStr = `${nowMoscow.year}-${String(nowMoscow.month + 1).padStart(2, '0')}-${String(nowMoscow.day).padStart(2, '0')}T12:00:00+03:00`;
      return new Date(moscowDateStr);
    }
    
    // Парсим дату из строки "YYYY-MM-DDTHH:mm" - это московское время
    const [datePart, timePart] = dateStr.split('T');
    if (!datePart) {
      const now = new Date();
      const nowMoscow = getTimeInTimeZone(now, MOSCOW_TIMEZONE);
      const moscowDateStr = `${nowMoscow.year}-${String(nowMoscow.month + 1).padStart(2, '0')}-${String(nowMoscow.day).padStart(2, '0')}T12:00:00+03:00`;
      return new Date(moscowDateStr);
    }
    
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour = 12, minute = 0] = timePart ? timePart.split(':').map(Number) : [12, 0];
    
    // Создаем дату с явным указанием московского времени (UTC+3)
    // Используем полдень для даты, чтобы избежать проблем с переходом дня
    // Это важно: мы создаем дату именно для дня, а не для конкретного времени
    const pad = (n: number) => String(n).padStart(2, '0');
    const moscowDateStr = `${year}-${pad(month)}-${pad(day)}T12:00:00+03:00`;
    const date = new Date(moscowDateStr);
    
    // Проверяем, что дата создана правильно - компоненты должны совпадать
    const checkMoscow = getTimeInTimeZone(date, MOSCOW_TIMEZONE);
    if (checkMoscow.year === year && checkMoscow.month === month - 1 && checkMoscow.day === day) {
      return date;
    }
    
    // Если не совпало (маловероятно), создаем через UTC напрямую
    // hour - 3 может быть отрицательным, поэтому используем полдень
    return new Date(Date.UTC(year, month - 1, day, 9, 0, 0)); // 12:00 МСК = 09:00 UTC
  }, []);
  
  // Дата для просмотра в таймлайне - инициализируем из editingEvent или формы
  // Используем editingEvent.starts_at напрямую для правильной инициализации
  const [viewDate, setViewDate] = useState<Date>(() => {
    // Если есть editingEvent, используем его starts_at напрямую (UTC) и конвертируем в московское время
    if (editingEvent?.starts_at) {
      const startUTC = parseUTC(editingEvent.starts_at);
      const moscow = getTimeInTimeZone(startUTC, MOSCOW_TIMEZONE);
      // Создаем Date в московском времени для дня события
      const pad = (n: number) => String(n).padStart(2, '0');
      const moscowDateStr = `${moscow.year}-${pad(moscow.month + 1)}-${pad(moscow.day)}T12:00:00+03:00`;
      const date = new Date(moscowDateStr);
      // Проверяем, что дата правильная
      const checkMoscow = getTimeInTimeZone(date, MOSCOW_TIMEZONE);
      if (checkMoscow.year === moscow.year && checkMoscow.month === moscow.month && checkMoscow.day === moscow.day) {
        return date;
      }
      // Если не совпало, создаем через UTC
      return new Date(Date.UTC(moscow.year, moscow.month, moscow.day, 9, 0, 0));
    }
    // Если нет editingEvent, но есть form.starts_at, используем его
    if (form.starts_at) {
      return getDateFromForm(form.starts_at);
    }
    // Иначе - текущая дата
    const now = new Date();
    const nowMoscow = getTimeInTimeZone(now, MOSCOW_TIMEZONE);
    const pad = (n: number) => String(n).padStart(2, '0');
    const moscowDateStr = `${nowMoscow.year}-${pad(nowMoscow.month + 1)}-${pad(nowMoscow.day)}T12:00:00+03:00`;
    const date = new Date(moscowDateStr);
    const checkMoscow = getTimeInTimeZone(date, MOSCOW_TIMEZONE);
    if (checkMoscow.year === nowMoscow.year && checkMoscow.month === nowMoscow.month && checkMoscow.day === nowMoscow.day) {
      return date;
    }
    return new Date(Date.UTC(nowMoscow.year, nowMoscow.month, nowMoscow.day, 9, 0, 0));
  });
  
  // selectedDate для ResourcePanel - используем viewDate, который уже правильно инициализирован
  const selectedDate = viewDate;
  
  // Навигация по дням в московском времени
  const navigateDays = useCallback((days: number) => {
    setViewDate((prev) => {
      // Используем addDaysInMoscow для правильного перехода к следующему дню в московском времени
      return addDaysInMoscow(prev, days);
    });
  }, []);
  
  // Флаг для отслеживания навигации (чтобы не обновлять форму при программном изменении viewDate)
  const [isNavigating, setIsNavigating] = useState(false);
  // Отслеживаем editingEventId для определения смены события
  const prevEditingEventIdRef = useRef<string | null>(editingEvent?.id || null);
  
  // Синхронизируем viewDate при открытии нового события
  useEffect(() => {
    // Если изменился editingEvent, обновляем viewDate из него
    if (editingEvent?.starts_at && editingEvent.id !== prevEditingEventIdRef.current && !isNavigating) {
      const startUTC = parseUTC(editingEvent.starts_at);
      const moscow = getTimeInTimeZone(startUTC, MOSCOW_TIMEZONE);
      const pad = (n: number) => String(n).padStart(2, '0');
      const moscowDateStr = `${moscow.year}-${pad(moscow.month + 1)}-${pad(moscow.day)}T12:00:00+03:00`;
      const newViewDate = new Date(moscowDateStr);
      // Проверяем, что дата правильная
      const checkMoscow = getTimeInTimeZone(newViewDate, MOSCOW_TIMEZONE);
      if (checkMoscow.year === moscow.year && checkMoscow.month === moscow.month && checkMoscow.day === moscow.day) {
        setViewDate(newViewDate);
      } else {
        // Если не совпало, создаем через UTC
        setViewDate(new Date(Date.UTC(moscow.year, moscow.month, moscow.day, 9, 0, 0)));
      }
      prevEditingEventIdRef.current = editingEvent.id;
    } else if (!editingEvent && form.starts_at && !isNavigating) {
      // Если нет editingEvent (новое событие), используем form.starts_at
      const dateFromForm = getDateFromForm(form.starts_at);
      setViewDate(dateFromForm);
      prevEditingEventIdRef.current = null;
    }
  }, [editingEvent, form.starts_at, isNavigating, getDateFromForm]);
  
  // Обновляем даты в форме при изменении viewDate (после навигации)
  useEffect(() => {
    if (isNavigating && form.starts_at && form.ends_at) {
      // Получаем компоненты viewDate в московском времени
      const viewDateMoscow = getTimeInTimeZone(viewDate, MOSCOW_TIMEZONE);
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateStr = `${viewDateMoscow.year}-${pad(viewDateMoscow.month + 1)}-${pad(viewDateMoscow.day)}`;
      
      // Сохраняем время из формы
      const startTime = form.starts_at.split("T")[1] || "09:00";
      const endTime = form.ends_at.split("T")[1] || "10:00";
      
      setForm((prev) => ({
        ...prev,
        starts_at: `${dateStr}T${startTime}`,
        ends_at: `${dateStr}T${endTime}`,
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

  // UX: блокируем скролл страницы под модалкой, фокусируем первое поле, закрываем по Escape
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Фокус после монтирования (нужно немного времени, чтобы инпут появился в DOM)
    const focusTimer = window.setTimeout(() => {
      titleInputRef.current?.focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocusedRef.current?.focus?.();
    };
  }, [handleClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 backdrop-blur-sm sm:items-center sm:p-4"
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
        className="w-full max-w-6xl h-[92vh] sm:h-[85vh] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Компактный заголовок */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white flex-shrink-0">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className="h-3.5 w-3.5 rounded-full ring-4 ring-slate-100"
                style={{ backgroundColor: accentColor }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h2 id={titleId} className="text-xl font-bold text-slate-900 leading-tight">
                  {isEditing ? "Редактировать событие" : "Новое событие"}
                </h2>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  <span className="truncate">{calendarLabel}</span>
                  <span aria-hidden="true">•</span>
                  <span className="whitespace-nowrap">МСК</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canManageEvents && onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isSubmitting}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                >
                  Удалить
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg p-2 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600"
                aria-label="Закрыть"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
            
        </div>

        {/* Контент - двухколоночный layout */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <form id="event-form" onSubmit={onSubmit} className="flex-1 min-h-0 flex flex-col">
            {(error || isReadOnly) && (
              <div className="px-6 pt-4 space-y-2">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span>{error}</span>
                    </div>
                  </div>
                )}

                {isReadOnly && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <span>У вас нет прав редактировать события в этом календаре</span>
                  </div>
                )}
              </div>
            )}

            {/* Двухколоночный layout */}
            <div className="flex-1 min-h-0 grid grid-cols-1 gap-6 p-6 lg:grid-cols-[420px,1fr]">
              {/* Левая колонка - основная информация */}
              <div className="space-y-4 min-h-0 overflow-y-auto pr-1">
                  {/* Название и даты */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                    <div>
                      <label className="block mb-1.5 text-xs font-semibold text-slate-700">
                        Название <span className="text-red-500">*</span>
                      </label>
                      <input
                        ref={titleInputRef}
                        required
                        type="text"
                        disabled={isReadOnly}
                        value={form.title}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, title: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="Название события"
                      />
                    </div>

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
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
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
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block mb-1.5 text-xs font-semibold text-slate-700">Описание</label>
                      <textarea
                        value={form.description}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, description: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                        rows={3}
                        placeholder="Описание события..."
                      />
                    </div>
                  </div>

                  {/* Участники */}
                  <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/50 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                          <svg className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          Участники
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {editingEvent?.participants?.length || form.participant_ids.length > 0
                            ? `${editingEvent?.participants?.length || form.participant_ids.length} ${(editingEvent?.participants?.length || form.participant_ids.length) === 1 ? "участник" : "участников"}`
                            : "Добавьте участников события"}
                        </p>
                      </div>
                      {(editingEvent?.participants?.length || form.participant_ids.length) > 0 && (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                          {editingEvent?.participants?.length || form.participant_ids.length}
                        </span>
                      )}
                    </div>

                    {/* Добавление участников */}
                    {!isReadOnly && (
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
                    )}

                    {/* Список участников с статусами */}
                    {editingEvent && editingEvent.participants && editingEvent.participants.length > 0 ? (
                      <div className="space-y-2.5">
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
                              apiBaseUrl={apiBaseUrl}
                            />
                          );
                        })}
                      </div>
                    ) : form.participant_ids.length > 0 && !editingEvent ? (
                      // Показываем выбранных участников при создании нового события
                      <div className="space-y-2.5">
                        {users
                          .filter((user) => form.participant_ids.includes(user.id))
                          .map((user) => {
                            const participant: EventParticipant = {
                              user_id: user.id,
                              email: user.email,
                              full_name: user.full_name || null,
                              response_status: "needs_action",
                              avatar_url: user.avatar_url || null,
                            };
                            const isCurrentUser = user.email === currentUserEmail;
                            return (
                              <div
                                key={user.id}
                                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
                              >
                                {user.avatar_url ? (
                                  <img
                                    src={user.avatar_url.startsWith("http") ? user.avatar_url : `${apiBaseUrl}${user.avatar_url}`}
                                    alt={user.full_name || user.email}
                                    className="h-10 w-10 rounded-full object-cover border-2 border-slate-200 flex-shrink-0"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-sm font-semibold text-white border-2 border-slate-200 flex-shrink-0">
                                    {(user.full_name || user.email)[0].toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold text-slate-900 truncate">
                                      {user.full_name || user.email}
                                    </p>
                                    {getUserOrganizationAbbreviation && (
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-700 flex-shrink-0">
                                        {getUserOrganizationAbbreviation(user.id)}
                                      </span>
                                    )}
                                  </div>
                                  {user.full_name && (
                                    <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 rounded-lg border-2 border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                                  <span>○</span>
                                  <span>Будет приглашен</span>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-sm text-slate-500">
                        {isReadOnly ? "Нет участников" : "Добавьте участников, используя поле выше"}
                      </div>
                    )}
                  </div>

                  {/* Вложения */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Вложения</h3>
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
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
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

                  {/* Повторения */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <button
                      type="button"
                      onClick={() => setShowRecurrence(!showRecurrence)}
                      disabled={recurrenceControlsDisabled}
                      className={`w-full flex items-center justify-between text-left transition ${
                        recurrenceControlsDisabled ? "opacity-60 cursor-not-allowed" : "hover:opacity-80"
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
                          className="h-4 w-4 rounded border-indigo-500 text-indigo-500 focus:ring-indigo-500"
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

                    {showRecurrence && form.recurrence_enabled && (
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
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
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
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
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
              </div>

              {/* Правая колонка - Таймлайн и переговорки */}
              <div className="flex flex-col space-y-3 min-h-0 overflow-y-auto pl-0 lg:pl-1">
                  {/* Навигация по дням */}
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2">
                    <button
                      type="button"
                      onClick={() => handleNavigateDays(-1)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                      title="День назад"
                    >
                      ←
                    </button>
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-900 min-w-[180px] text-center bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
                      {new Intl.DateTimeFormat('ru-RU', { 
                        weekday: 'short', 
                        day: 'numeric', 
                        month: 'short',
                        timeZone: MOSCOW_TIMEZONE 
                      }).format(viewDate)}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleNavigateDays(1)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                      title="День вперед"
                    >
                      →
                    </button>
                  </div>

                  {/* Таймлайн и переговорки - основной инструмент */}
                  <div className="flex-1 rounded-lg border border-slate-200 bg-white p-3 min-h-0">
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
                      accentColor={accentColor}
                      events={events}
                      currentUserEmail={currentUserEmail}
                      variant="modal"
                    />
                  </div>
              </div>
            </div>
          </form>

          {/* Footer с кнопками */}
          <div className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Отмена
            </button>
            {canManageEvents && (
              <button
                type="submit"
                form="event-form"
                disabled={isSubmitting}
                className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-600 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
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
    </div>
    </>
  );
}
