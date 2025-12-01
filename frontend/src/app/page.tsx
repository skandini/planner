"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/context/AuthContext";
import type { Calendar, CalendarMember, CalendarDraft, CalendarRole } from "@/types/calendar.types";
import type { EventRecord, EventDraft, ConflictEntry } from "@/types/event.types";
import type { UserProfile } from "@/types/user.types";
import type { Room } from "@/types/room.types";
import type { ViewMode, PendingMoveContext, RecurrenceRule } from "@/types/common.types";
import { WeekView } from "@/components/calendar/WeekView";
import { MonthView } from "@/components/calendar/MonthView";
import { ParticipantStatusItem } from "@/components/participants/ParticipantStatusItem";
import { ResourcePanel } from "@/components/rooms/ResourcePanel";
import { EventModal } from "@/components/events/EventModal";
import { MoveSeriesDialog } from "@/components/events/MoveSeriesDialog";
import { UserAvailabilityView } from "@/components/availability/UserAvailabilityView";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { CalendarMembersManager } from "@/components/calendar/CalendarMembersManager";
import { useNotifications } from "@/hooks/useNotifications";
import {
  startOfWeek,
  addDays,
  addMonths,
  getMonthGridDays,
  formatDate,
  parseUTC,
  toLocalString,
  toUTCString,
  toUTCDateISO,
} from "@/lib/utils/dateUtils";
import {
  API_BASE_URL,
  CALENDAR_ENDPOINT,
  EVENT_ENDPOINT,
  NOTIFICATION_ENDPOINT,
  ROOM_ENDPOINT,
  USERS_ENDPOINT,
  ROLE_LABELS,
  WORKDAY_START_HOUR,
  WORKDAY_END_HOUR,
  SLOT_DURATION_MINUTES,
  DEFAULT_FORM_STATE,
  DEFAULT_EVENT_FORM,
} from "@/lib/constants";

type AuthenticatedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export default function Home() {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [form, setForm] = useState<CalendarDraft>(DEFAULT_FORM_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [isMembersManagerOpen, setIsMembersManagerOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState<EventDraft>(DEFAULT_EVENT_FORM);
  const [isEventSubmitting, setIsEventSubmitting] = useState(false);
  const [eventFormError, setEventFormError] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingRecurrenceInfo, setEditingRecurrenceInfo] = useState<{
    isSeriesParent: boolean;
    isSeriesChild: boolean;
  } | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [members, setMembers] = useState<CalendarMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const { accessToken, userEmail, logout, refreshAccessToken } = useAuth();
  const isAuthenticated = Boolean(accessToken);
  const router = useRouter();
  
  // Добавляем CSS для анимации подпрыгивания один раз при загрузке
  useEffect(() => {
    if (typeof document === "undefined") return;
    
    const styleId = "event-bounce-animation";
    if (document.getElementById(styleId)) return; // Уже добавлено
    
    const styleSheet = document.createElement("style");
    styleSheet.id = styleId;
    styleSheet.textContent = `
      @keyframes bounce-alert {
        0%, 100% { transform: translateY(0); }
        25% { transform: translateY(-4px); }
        50% { transform: translateY(0); }
        75% { transform: translateY(-2px); }
      }
      .event-vibrating {
        animation: bounce-alert 0.6s ease-in-out infinite;
      }
    `;
    document.head.appendChild(styleSheet);
  }, []);
  const [moveDialog, setMoveDialog] = useState<PendingMoveContext | null>(null);
  const [moveScope, setMoveScope] = useState<"single" | "series">("single");
  const [moveSubmitting, setMoveSubmitting] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [selectedUserForView, setSelectedUserForView] = useState<string | null>(null);
  const [userAvailability, setUserAvailability] = useState<EventRecord[]>([]);
  const [userAvailabilityLoading, setUserAvailabilityLoading] = useState(false);
  const [userAvailabilityError, setUserAvailabilityError] = useState<string | null>(null);
  const [addToCalendarError, setAddToCalendarError] = useState<string | null>(null);
  const [addToCalendarLoading, setAddToCalendarLoading] = useState(false);

  const resetAuthState = useCallback(
    (message?: string) => {
      logout();
      setCalendars([]);
      setEvents([]);
      setRooms([]);
      setMembers([]);
      setUsers([]);
      setSelectedCalendarId(null);
      if (message) {
        setError(message);
      }
      router.push("/login");
    },
    [logout, router],
  );

  const handleUnauthorized = useCallback(() => {
    resetAuthState("Сессия истекла — войдите снова");
  }, [resetAuthState]);

  const handleManualLogout = useCallback(() => {
    resetAuthState();
  }, [resetAuthState]);

  const authFetch: AuthenticatedFetch = useCallback(
    async (input, init = {}) => {
      const execute = async (token: string) => {
        const headers = new Headers(init.headers as HeadersInit | undefined);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      };

      if (!accessToken) {
        throw new Error("Необходима авторизация");
      }

      let response = await execute(accessToken);
      if (response.status !== 401) {
        return response;
      }

      const newToken = await refreshAccessToken().catch(() => null);
      if (!newToken) {
        handleUnauthorized();
        throw new Error("Сессия истекла");
      }

      response = await execute(newToken);
      if (response.status === 401) {
        handleUnauthorized();
        throw new Error("Сессия истекла");
      }

      return response;
    },
    [accessToken, handleUnauthorized, refreshAccessToken],
  );

  const loadUsers = useCallback(async () => {
    if (!accessToken) {
      setUsers([]);
      return;
    }
    setUsersLoading(true);
    setUsersError(null);
    try {
      const response = await authFetch(USERS_ENDPOINT, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Не удалось загрузить пользователей");
      }
      const data: UserProfile[] = await response.json();
      setUsers(data);
    } catch (err) {
      setUsers([]);
      setUsersError(
        err instanceof Error ? err.message : "Ошибка загрузки пользователей",
      );
    } finally {
      setUsersLoading(false);
    }
  }, [accessToken, authFetch]);


  const loadCalendars = useCallback(async () => {
    if (!accessToken) {
      setCalendars([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await authFetch(CALENDAR_ENDPOINT, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Не удалось загрузить календари");
      }
      const data: Calendar[] = await response.json();
      setCalendars(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  }, [accessToken, authFetch]);

  const loadRooms = useCallback(async () => {
    if (!accessToken) {
      setRooms([]);
      return;
    }
    setRoomsLoading(true);
    try {
      const response = await authFetch(ROOM_ENDPOINT, { cache: "no-store" });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to load rooms:", response.status, errorText);
        throw new Error(`Не удалось загрузить переговорки: ${response.status}`);
      }
      const data: Room[] = await response.json();
      console.log("Loaded rooms:", data.length);
      setRooms(data);
    } catch (err) {
      console.error("Failed to load rooms:", err);
      setRooms([]);
    } finally {
      setRoomsLoading(false);
    }
  }, [accessToken, authFetch]);

  useEffect(() => {
    loadCalendars();
    loadRooms();
  }, [loadCalendars, loadRooms]);

useEffect(() => {
  loadUsers();
}, [loadUsers]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) {
      setError("Войдите, чтобы создать календарь");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await authFetch(CALENDAR_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          description: form.description || null,
        }),
      });
      if (!response.ok) {
        throw new Error("Не удалось создать календарь");
      }

      setForm(DEFAULT_FORM_STATE);
      await loadCalendars();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (calendars.length > 0 && !selectedCalendarId) {
      setSelectedCalendarId(calendars[0].id);
    }
    if (calendars.length === 0) {
      setSelectedCalendarId(null);
    }
  }, [calendars, selectedCalendarId]);

  const selectedCalendar = calendars.find(
    (calendar) => calendar.id === selectedCalendarId,
  );
  const selectedRole = selectedCalendar?.current_user_role ?? null;
  const canManageEvents =
    selectedRole === "owner" || selectedRole === "editor";

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx)),
    [weekStart],
  );

  const monthGridDays = useMemo(
    () => getMonthGridDays(selectedDate),
    [selectedDate],
  );
  const monthGridStart = useMemo(() => monthGridDays[0], [monthGridDays]);
  const monthGridEnd = useMemo(
    () => addDays(monthGridDays[0], monthGridDays.length),
    [monthGridDays],
  );

  const rangeStart = viewMode === "week" ? weekStart : monthGridStart;
  const rangeEnd = viewMode === "week" ? weekEnd : monthGridEnd;


  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) {
      return users;
    }
    const query = userSearchQuery.toLowerCase().trim();
    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(query) ||
        (user.full_name && user.full_name.toLowerCase().includes(query)),
    );
  }, [users, userSearchQuery]);

  const loadEvents = useCallback(async () => {
    if (!accessToken) {
      setEvents([]);
      return;
    }
    setEventsLoading(true);
    try {
      const url = new URL(EVENT_ENDPOINT);
      // Не фильтруем по calendar_id, чтобы получить все доступные события
      // (включая события, где пользователь является участником, но не имеет доступа к календарю)
      // Backend уже правильно фильтрует события
      url.searchParams.set("from", rangeStart.toISOString());
      url.searchParams.set("to", rangeEnd.toISOString());
      const response = await authFetch(url.toString(), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Не удалось получить события");
      }
      const data: EventRecord[] = await response.json();
      // Если выбран календарь, показываем события из этого календаря
      // ИЛИ события, где пользователь является участником (даже если они в другом календаре)
      const filteredEvents = selectedCalendarId
        ? data.filter((e) => {
            // События из выбранного календаря
            if (e.calendar_id === selectedCalendarId) return true;
            // События, где пользователь является участником (даже из другого календаря)
            if (e.participants && userEmail) {
              return e.participants.some((p) => p.email === userEmail);
            }
            return false;
          })
        : data;
      setEvents(filteredEvents);
      setEventsError(null);
    } catch (err) {
      setEventsError(
        err instanceof Error ? err.message : "Ошибка получения событий",
      );
    } finally {
      setEventsLoading(false);
    }
  }, [selectedCalendarId, rangeStart, rangeEnd, accessToken, authFetch]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);


  const loadCalendarMembers = useCallback(async () => {
    if (!selectedCalendarId || !accessToken) {
      setMembers([]);
      setMembersError(null);
      return;
    }
    setMembersLoading(true);
    setMembersError(null);
    try {
      const response = await authFetch(
        `${CALENDAR_ENDPOINT}${selectedCalendarId}/members`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error("Не удалось загрузить участников");
      }
      const data: CalendarMember[] = await response.json();
      setMembers(data);
    } catch (err) {
      setMembers([]);
      setMembersError(
        err instanceof Error
          ? err.message
          : "Ошибка загрузки списка участников",
      );
    } finally {
      setMembersLoading(false);
    }
  }, [selectedCalendarId, accessToken, authFetch]);

  useEffect(() => {
    loadCalendarMembers();
  }, [loadCalendarMembers]);

  const loadUserAvailability = useCallback(
    async (userId: string) => {
      if (!selectedCalendarId || !accessToken) {
        setUserAvailability([]);
        setUserAvailabilityError(null);
        return;
      }
      setUserAvailabilityLoading(true);
      setUserAvailabilityError(null);
      try {
        // Создаем диапазон для дня (00:00 - 23:59:59)
        const dayStart = new Date(selectedDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(selectedDate);
        dayEnd.setHours(23, 59, 59, 999);
        
        const fromStr = dayStart.toISOString();
        const toStr = dayEnd.toISOString();
        const url = `${CALENDAR_ENDPOINT}${selectedCalendarId}/members/${userId}/availability?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`;
        const response = await authFetch(url, { cache: "no-store" });
        if (response.ok) {
          const data: EventRecord[] = await response.json();
          setUserAvailability(data);
          setUserAvailabilityError(null);
        } else {
          setUserAvailability([]);
          const errorData = await response.json().catch(() => ({}));
          const errorText = errorData.detail || "Не удалось загрузить доступность";
          setUserAvailabilityError(errorText);
        }
      } catch (err) {
        console.error("Failed to load user availability:", err);
        setUserAvailability([]);
        setUserAvailabilityError(
          err instanceof Error ? err.message : "Не удалось загрузить доступность",
        );
      } finally {
        setUserAvailabilityLoading(false);
      }
    },
    [selectedCalendarId, selectedDate, accessToken, authFetch],
  );

  useEffect(() => {
    if (selectedUserForView) {
      const isMember = members.some((m) => m.user_id === selectedUserForView);
      if (isMember) {
        loadUserAvailability(selectedUserForView);
      } else {
        setUserAvailability([]);
        setUserAvailabilityError(null);
        setUserAvailabilityLoading(false);
      }
    } else {
      setUserAvailability([]);
      setUserAvailabilityError(null);
    }
  }, [selectedUserForView, members, loadUserAvailability]);

  const ensureMembership = useCallback(
    async (userId: string) => {
      if (!selectedCalendarId) {
        throw new Error("Сначала выберите календарь");
      }
      if (selectedRole !== "owner") {
        throw new Error("Только владелец календаря может добавлять участников");
      }
      const membershipMap = new Map<string, CalendarMember>();
      members.forEach((member) => membershipMap.set(member.user_id, member));
      if (membershipMap.has(userId)) {
        return;
      }
      try {
        const response = await authFetch(
          `${CALENDAR_ENDPOINT}${selectedCalendarId}/members`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, role: "viewer" }),
          },
        );
        if (!response.ok) {
          let detail = "Не удалось выдать доступ пользователю";
          try {
            const data = await response.json();
            if (typeof data?.detail === "string") {
              detail = data.detail;
            } else if (typeof data === "string") {
              detail = data;
            }
          } catch {
            // ignore
          }
          throw new Error(detail);
        }
        await loadCalendarMembers();
      } catch (err) {
        console.error("Failed to add user to calendar:", err);
        throw err;
      }
    },
    [authFetch, members, selectedCalendarId, selectedRole, loadCalendarMembers],
  );

  const handleNavigate = (direction: "prev" | "next" | "today") => {
    if (direction === "today") {
      setSelectedDate(new Date());
      return;
    }

    if (viewMode === "week") {
      setSelectedDate((prev) =>
        addDays(prev, direction === "prev" ? -7 : 7),
      );
    } else {
      setSelectedDate((prev) => addMonths(prev, direction === "prev" ? -1 : 1));
    }
  };

  const openEventModal = (
    initialDate?: Date,
    event?: EventRecord,
    startTime?: Date,
    endTime?: Date,
  ) => {
    if (!canManageEvents && !event) {
      return;
    }
    if (event) {
      const start = parseUTC(event.starts_at);
      const end = parseUTC(event.ends_at);
      const startsAtLocal = event.all_day
        ? start.toISOString().split("T")[0]
        : toLocalString(start);
      const endsAtLocal = event.all_day
        ? end.toISOString().split("T")[0]
        : toLocalString(end);
      const recurrenceRule = event.recurrence_rule || null;
      const recurrenceUntil = recurrenceRule?.until
        ? new Date(recurrenceRule.until).toISOString().split("T")[0]
        : "";
      
      setEventForm({
        title: event.title,
        description: event.description || "",
        location: event.location || "",
        room_id: event.room_id,
        starts_at: startsAtLocal,
        ends_at: endsAtLocal,
        all_day: event.all_day,
        participant_ids: event.participants?.map((p) => p.user_id) || [],
        recurrence_enabled: Boolean(recurrenceRule),
        recurrence_frequency:
          recurrenceRule?.frequency ?? DEFAULT_EVENT_FORM.recurrence_frequency,
        recurrence_interval:
          recurrenceRule?.interval ?? DEFAULT_EVENT_FORM.recurrence_interval,
        recurrence_count: recurrenceRule?.count ?? undefined,
        recurrence_until: recurrenceUntil,
      });
      setEditingEventId(event.id);
      setEditingRecurrenceInfo({
        isSeriesParent: Boolean(recurrenceRule),
        isSeriesChild: Boolean(event.recurrence_parent_id && !recurrenceRule),
      });
    } else {
      const date = initialDate || selectedDate;
      const start = startTime || (() => {
        const s = new Date(date);
        s.setHours(9, 0, 0, 0);
        return s;
      })();
      const end = endTime || (() => {
        const e = new Date(start);
        e.setHours(10, 0, 0, 0);
        return e;
      })();

      setEventForm({
        title: "",
        description: "",
        location: "",
        room_id: null,
        starts_at: toLocalString(start),
        ends_at: toLocalString(end),
        all_day: false,
        participant_ids: [],
        recurrence_enabled: false,
        recurrence_frequency: "weekly",
        recurrence_interval: 1,
        recurrence_count: undefined,
        recurrence_until: "",
      });
      setEditingEventId(null);
      setEditingRecurrenceInfo(null);
    }
    setIsEventModalOpen(true);
    setEventFormError(null);
    loadRooms(); // Перезагружаем переговорки при открытии модального окна
  };

  const handleEventSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCalendarId) {
      setEventFormError("Выберите календарь");
      return;
    }
    if (!accessToken) {
      setEventFormError("Войдите, чтобы управлять событиями");
      return;
    }
    if (!canManageEvents) {
      setEventFormError("Недостаточно прав для изменения событий");
      return;
    }

    setIsEventSubmitting(true);
    setEventFormError(null);

    try {
      const isEditingSeriesParent =
        Boolean(editingEventId) && Boolean(editingRecurrenceInfo?.isSeriesParent);

      // Конвертируем локальное время в UTC для отправки на сервер
      let startsAtUTC: string;
      let endsAtUTC: string;
      
      if (eventForm.all_day) {
        // Для all_day создаём локальное время и конвертируем в UTC
        startsAtUTC = new Date(eventForm.starts_at + "T00:00:00").toISOString();
        endsAtUTC = new Date(eventForm.ends_at + "T23:59:59").toISOString();
      } else {
        // Для обычных событий используем простую функцию конвертации
        startsAtUTC = toUTCString(eventForm.starts_at);
        endsAtUTC = toUTCString(eventForm.ends_at);
      }

      let recurrenceRulePayload: RecurrenceRule | undefined;
      if (eventForm.recurrence_enabled && !isEditingSeriesParent) {
        if (!eventForm.recurrence_count && !eventForm.recurrence_until) {
          throw new Error(
            "Укажите количество повторов или дату завершения повторяющегося события",
          );
        }
        recurrenceRulePayload = {
          frequency: eventForm.recurrence_frequency,
          interval: Math.max(1, eventForm.recurrence_interval),
        };
        if (eventForm.recurrence_count) {
          recurrenceRulePayload.count = eventForm.recurrence_count;
        }
        if (eventForm.recurrence_until) {
          const untilDate = new Date(`${eventForm.recurrence_until}T23:59:59`);
          recurrenceRulePayload.until = untilDate.toISOString();
        }
      }

      const payload: Record<string, unknown> = {
        calendar_id: selectedCalendarId,
        title: eventForm.title,
        description: eventForm.description || null,
        location: eventForm.location || null,
        room_id: eventForm.room_id || null,
        starts_at: startsAtUTC,
        ends_at: endsAtUTC,
        all_day: eventForm.all_day,
        participant_ids:
          eventForm.participant_ids.length > 0 ? eventForm.participant_ids : null,
      };
      if (recurrenceRulePayload) {
        payload.recurrence_rule = recurrenceRulePayload;
      }

      const url = editingEventId
        ? `${EVENT_ENDPOINT}${editingEventId}`
        : EVENT_ENDPOINT;
      const method = editingEventId ? "PUT" : "POST";

      const response = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail ||
            (editingEventId
              ? "Не удалось обновить событие"
              : "Не удалось создать событие"),
        );
      }

      setEventForm(DEFAULT_EVENT_FORM);
      setEditingEventId(null);
      setEditingRecurrenceInfo(null);
      setIsEventModalOpen(false);
      await loadEvents();
    } catch (err) {
      setEventFormError(
        err instanceof Error ? err.message : "Произошла ошибка",
      );
    } finally {
      setIsEventSubmitting(false);
    }
  };

  const performEventMove = useCallback(
    async (
      eventRecord: EventRecord,
      newStart: Date,
      newEnd: Date,
      scope: "single" | "series",
    ) => {
      const response = await authFetch(
        `${EVENT_ENDPOINT}${eventRecord.id}${
          scope === "series" ? "?scope=series" : ""
        }`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            starts_at: newStart.toISOString(),
            ends_at: newEnd.toISOString(),
          }),
        },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Не удалось переместить событие");
      }
      await loadEvents();
    },
    [authFetch, loadEvents],
  );

  const handleEventMove = useCallback(
    async (eventRecord: EventRecord, newStart: Date) => {
      const originalStart = parseUTC(eventRecord.starts_at);
      const originalEnd = parseUTC(eventRecord.ends_at);
      const durationMs = originalEnd.getTime() - originalStart.getTime();
      const newEnd = new Date(newStart.getTime() + durationMs);
      const isSeries =
        Boolean(eventRecord.recurrence_parent_id) ||
        Boolean(eventRecord.recurrence_rule);
      if (!isSeries) {
        try {
          await performEventMove(eventRecord, newStart, newEnd, "single");
        } catch (err) {
          setEventsError(
            err instanceof Error
              ? err.message
              : "Не удалось переместить событие",
          );
        }
        return;
      }
      setMoveScope("single");
      setMoveError(null);
      setMoveDialog({
        event: eventRecord,
        newStart,
        newEnd,
      });
    },
    [performEventMove],
  );

  const handleDeleteEvent = async (scope: "single" | "series" = "single") => {
    if (!editingEventId) return;
    if (!canManageEvents) {
      setEventFormError("Недостаточно прав для удаления событий");
      return;
    }

    const confirmationMessage =
      scope === "series"
        ? "Удалить всю серию событий? Это действие нельзя отменить."
        : "Вы уверены, что хотите удалить это событие?";
    if (!confirm(confirmationMessage)) {
      return;
    }

    setIsEventSubmitting(true);
    setEventFormError(null);

    try {
      const response = await authFetch(
        `${EVENT_ENDPOINT}${editingEventId}${
          scope === "series" ? "?scope=series" : ""
        }`,
        {
        method: "DELETE",
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Не удалось удалить событие");
      }

      setEventForm(DEFAULT_EVENT_FORM);
      setEditingEventId(null);
      setEditingRecurrenceInfo(null);
      setIsEventModalOpen(false);
      await loadEvents();
    } catch (err) {
      setEventFormError(
        err instanceof Error ? err.message : "Произошла ошибка",
      );
    } finally {
      setIsEventSubmitting(false);
    }
  };

  const closeMoveDialog = () => {
    setMoveDialog(null);
    setMoveError(null);
    setMoveScope("single");
  };

  const submitMoveDialog = async () => {
    if (!moveDialog) return;
    setMoveSubmitting(true);
    setMoveError(null);
    try {
      await performEventMove(
        moveDialog.event,
        moveDialog.newStart,
        moveDialog.newEnd,
        moveScope,
      );
      closeMoveDialog();
    } catch (err) {
      setMoveError(
        err instanceof Error ? err.message : "Не удалось переместить серию",
      );
    } finally {
      setMoveSubmitting(false);
    }
  };

  const handleDeleteCalendar = useCallback(
    async (calendarId: string) => {
      const calendar = calendars.find((c) => c.id === calendarId);
      if (!calendar) {
        return;
      }
      if (calendar.current_user_role !== "owner") {
        setError("Удалять календарь может только владелец");
        return;
      }
      const confirmed = window.confirm(
        `Удалить календарь «${calendar.name}»? Все события будут потеряны.`,
      );
      if (!confirmed) {
        return;
      }
      try {
        const response = await authFetch(`${CALENDAR_ENDPOINT}${calendarId}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.detail || "Не удалось удалить календарь полностью",
          );
        }
        if (selectedCalendarId === calendarId) {
          setSelectedCalendarId(null);
          setEvents([]);
        }
        await loadCalendars();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Не удалось удалить календарь",
        );
      }
    },
    [
      authFetch,
      calendars,
      loadCalendars,
      selectedCalendarId,
      setEvents,
      setError,
      setSelectedCalendarId,
    ],
  );

  const viewModes: ViewMode[] = ["week", "month"];

  if (!isAuthenticated) {
  return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 p-6 text-slate-900">
        <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
            Требуется авторизация
          </p>
          <h1 className="text-3xl font-semibold">Войдите, чтобы увидеть календари</h1>
          <p className="text-sm text-slate-500">
            Используйте корпоративный аккаунт, чтобы просматривать календари и управлять событиями.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="flex-1 rounded-2xl bg-lime-500 px-4 py-3 text-center font-semibold text-white transition hover:bg-lime-400"
            >
              Войти
            </Link>
            <Link
              href="/register"
              className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-center font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Создать аккаунт
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900 overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-3 px-4 py-3">
        <header className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_20px_70px_rgba(15,23,42,0.12)] flex-shrink-0">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Корпоративный календарь
          </p>
          <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Командные календари</h1>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-500">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-center">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  API
                </p>
                <p className="font-semibold text-lime-600">
                  {API_BASE_URL.replace(/https?:\/\//, "")}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-center">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Календарей
                </p>
                <p className="font-semibold">
                  {loading ? "…" : calendars.length}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-center">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Пользователь
                </p>
                <p className="font-semibold">
                  {userEmail ?? "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleManualLogout}
                className="rounded-2xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Выйти
              </button>
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-3 lg:flex-row overflow-hidden min-h-0">
          <aside className="order-2 flex w-full flex-col gap-3 lg:order-1 lg:w-[340px] lg:flex-shrink-0 overflow-y-auto">
            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Календари
              </p>
            </div>
            <h2 className="mt-1 text-lg font-semibold">
              {loading ? "Загружаем…" : "Календари"}
            </h2>

            {error && (
              <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {error}
              </p>
            )}

            {!loading && !error && calendars.length === 0 && (
              <p className="mt-3 text-xs text-slate-400">
                Календарей пока нет
              </p>
            )}

            <ul className="mt-3 space-y-1.5 max-h-[calc(100vh-400px)] overflow-y-auto">
              {calendars.map((calendar) => (
                <li
                  key={calendar.id}
                  className={`rounded-lg border p-2 transition ${
                    selectedCalendarId === calendar.id
                      ? "border-lime-500 bg-lime-50"
                      : "border-slate-200 bg-slate-50 hover:bg-white"
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCalendarId(calendar.id)}
                  onKeyUp={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setSelectedCalendarId(calendar.id);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                        className="h-4 w-4 rounded-full border border-slate-200 flex-shrink-0"
                      style={{ background: calendar.color }}
                      aria-label="calendar color"
                    />
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {calendar.name}
                      </p>
                    </div>
                    {calendar.current_user_role === "owner" && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[0.65rem] font-semibold text-slate-600 transition hover:bg-slate-50"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedCalendarId(calendar.id);
                            setIsMembersManagerOpen(true);
                          }}
                          title="Управление участниками"
                        >
                          👥
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-200 bg-white px-2 py-0.5 text-[0.65rem] font-semibold text-red-600 transition hover:bg-red-50"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteCalendar(calendar.id);
                          }}
                          title="Удалить календарь"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg flex-shrink-0"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Создать календарь
              </p>
              <h2 className="mt-1 text-base font-semibold">
                Новый календарь
              </h2>

              <label className="mt-2 block text-xs font-medium text-slate-700">
                Название
                <input
                  required
                  name="name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-lime-500"
                  placeholder="Название календаря"
                />
              </label>

              <label className="mt-2 block text-xs font-medium text-slate-700">
                Цвет
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    name="color"
                    value={form.color}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        color: event.target.value,
                      }))
                    }
                    className="h-8 w-8 cursor-pointer rounded-full border border-slate-200 bg-white p-0.5"
                  />
                  <span className="text-xs text-slate-500">{form.color}</span>
                </div>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-3 w-full rounded-lg bg-lime-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Создаём…" : "Создать"}
              </button>
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg flex-shrink-0">
              <div className="flex items-center justify-between gap-3">
            <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Поиск
                  </p>
                  <h2 className="mt-1 text-base font-semibold">Найти пользователя</h2>
                </div>
              </div>

              <div className="mt-3">
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Имя или email..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-lime-500"
                />
              </div>

              {userSearchQuery.trim() && (
                <div className="mt-3 max-h-[300px] overflow-y-auto space-y-1.5">
                  {usersLoading ? (
                    <p className="text-xs text-slate-500">Загружаем...</p>
                  ) : filteredUsers.length === 0 ? (
                    <p className="text-xs text-slate-500">Пользователи не найдены</p>
                  ) : (
                    filteredUsers.map((user) => {
                      const isMember = members.some((m) => m.user_id === user.id);
                      return (
                        <div
                          key={user.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 hover:bg-white transition cursor-pointer"
                          onClick={() => setSelectedUserForView(user.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {user.full_name || user.email}
                            </p>
                            <p className="text-[0.65rem] text-slate-500 truncate">
                              {user.email}
                            </p>
                          </div>
                          {isMember && (
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[0.65rem] text-slate-500 flex-shrink-0">
                              В календаре
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg flex-shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Участники
                  </p>
                  <h2 className="mt-1 text-base font-semibold">Доступ к календарю</h2>
                </div>
                {selectedRole && selectedCalendar && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                    {ROLE_LABELS[selectedRole]}
                  </span>
                )}
              </div>

              {!selectedCalendar && (
                <p className="mt-3 text-xs text-slate-400">
                  Выберите календарь, чтобы увидеть участников.
                </p>
              )}

              {selectedCalendar && membersError && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {membersError}
                </p>
              )}

              {selectedCalendar && membersLoading && (
                <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-2 text-xs text-slate-500">
                  Загружаем…
                </p>
              )}

              {selectedCalendar && !membersLoading && members.length === 0 && !membersError && (
                <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-2 text-xs text-slate-500">
                  Пока никто не присоединён.
                </p>
              )}

              {selectedCalendar && !membersLoading && members.length > 0 && (
                <ul className="mt-3 space-y-1.5 max-h-[200px] overflow-y-auto">
                  {members.map((member) => {
                    const roleKey = ["owner", "editor", "viewer"].includes(
                      member.role,
                    )
                      ? (member.role as CalendarRole)
                      : null;
                    const role = roleKey ? ROLE_LABELS[roleKey] : member.role;
                    return (
                      <li
                        key={`${member.calendar_id}-${member.user_id}`}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {member.full_name || member.email}
                            </p>
                            <p className="text-[0.65rem] text-slate-500 truncate">{member.email}</p>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 flex-shrink-0">
                            {role}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          <section className="order-1 flex flex-1 flex-col gap-3 lg:order-2 lg:min-w-0 overflow-hidden">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg flex-shrink-0">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">
                {selectedCalendar ? selectedCalendar.name : "Календарь не выбран"}
              </h2>
                    {selectedRole && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                        {ROLE_LABELS[selectedRole]}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">
                {viewMode === "week"
                        ? `${formatDate(weekStart, { day: "numeric", month: "short" })} – ${formatDate(addDays(weekStart, 6), { day: "numeric", month: "short" })}`
                        : formatDate(selectedDate, { month: "short", year: "numeric" })}
                    </span>
        </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsNotificationCenterOpen(true)}
                    className="relative rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                  >
                    🔔 Уведомления
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[0.6rem] font-bold text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </button>
                  {selectedCalendar && canManageEvents && (
                <button
                  type="button"
                  onClick={() => openEventModal()}
                      className="rounded-lg bg-lime-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-lime-400"
                >
                      + Событие
                </button>
              )}
              {viewModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs capitalize ${
                    viewMode === mode
                          ? "bg-lime-500 text-white"
                          : "border border-slate-200 text-slate-600"
                  }`}
                >
                  {mode === "week" ? "Неделя" : "Месяц"}
                </button>
              ))}
                  <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => handleNavigate("prev")}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate("today")}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                >
                  Сегодня
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate("next")}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                >
                  →
                </button>
              </div>
            </div>
          </div>

          {eventsError && (
                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {eventsError}
            </p>
          )}

          {!selectedCalendar && (
                <p className="mt-3 text-xs text-slate-400">
                  Выберите календарь слева
            </p>
          )}
            </div>

          {selectedCalendar && viewMode === "week" && (
              <div className="rounded-2xl bg-slate-100/50 p-3 shadow-[0_8px_30px_rgba(15,23,42,0.08)] flex-1 overflow-hidden min-h-0">
            <WeekView
              days={weekDays}
              events={events}
              loading={eventsLoading}
              accent={selectedCalendar.color}
              onEventClick={(event) => openEventModal(undefined, event)}
              rooms={rooms}
              onEventMove={canManageEvents ? handleEventMove : undefined}
              onTimeSlotClick={canManageEvents ? (date: Date, startTime: Date, endTime: Date) => {
                openEventModal(date, undefined, startTime, endTime);
              } : undefined}
              onUpdateParticipantStatus={async (eventId: string, userId: string, status: string) => {
                try {
                  const { eventApi } = await import("@/lib/api/eventApi");
                  await eventApi.updateParticipantStatus(authFetch, eventId, userId, status);
                  await loadEvents();
                } catch (err) {
                  console.error("Failed to update participant status:", err);
                }
              }}
              currentUserEmail={userEmail || undefined}
            />
              </div>
          )}

          {selectedCalendar && viewMode === "month" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg flex-1 overflow-auto">
            <MonthView
              days={monthGridDays}
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setViewMode("week");
              }}
              events={events}
              loading={eventsLoading}
              accent={selectedCalendar.color}
              onEventClick={(event) => openEventModal(undefined, event)}
              rooms={rooms}
            />
              </div>
          )}
        </section>
        </main>

        {isEventModalOpen && (
          <EventModal
            form={eventForm}
            setForm={setEventForm}
            onSubmit={handleEventSubmit}
            onDelete={editingEventId ? () => handleDeleteEvent() : undefined}
            onDeleteSeries={
              editingEventId &&
              editingRecurrenceInfo &&
              (editingRecurrenceInfo.isSeriesParent ||
                editingRecurrenceInfo.isSeriesChild)
                ? () => handleDeleteEvent("series")
                : undefined
            }
            onClose={() => {
              setIsEventModalOpen(false);
              setEventForm(DEFAULT_EVENT_FORM);
              setEditingEventId(null);
              setEventFormError(null);
              setEditingRecurrenceInfo(null);
            }}
            isSubmitting={isEventSubmitting}
            error={eventFormError}
            calendarName={selectedCalendar?.name || ""}
            isEditing={!!editingEventId}
            rooms={rooms}
            roomsLoading={roomsLoading}
            authFetch={authFetch}
            canManageEvents={canManageEvents}
            members={members}
            membersLoading={membersLoading}
            users={users}
            usersLoading={usersLoading}
            usersError={usersError}
            selectedCalendarId={selectedCalendarId}
            onRefreshMembers={loadCalendarMembers}
            recurrenceInfo={editingRecurrenceInfo}
            editingEvent={editingEventId ? events.find((e) => e.id === editingEventId) : undefined}
            onUpdateParticipantStatus={canManageEvents ? async (eventId: string, userId: string, status: string) => {
              try {
                const response = await authFetch(
                  `${EVENT_ENDPOINT}${eventId}/participants/${userId}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ response_status: status }),
                  },
                );
                if (!response.ok) {
                  throw new Error("Не удалось обновить статус");
                }
                await loadEvents();
              } catch (err) {
                setEventFormError(
                  err instanceof Error ? err.message : "Не удалось обновить статус",
                );
              }
            } : undefined}
          />
        )}
        {moveDialog && (
          <MoveSeriesDialog
            context={moveDialog}
            scope={moveScope}
            onScopeChange={setMoveScope}
            onClose={closeMoveDialog}
            onSubmit={submitMoveDialog}
            isSubmitting={moveSubmitting}
            error={moveError}
          />
        )}
        {isNotificationCenterOpen && (
          <NotificationCenter
            notifications={notifications}
            loading={notificationsLoading}
            unreadCount={unreadCount}
            onClose={() => setIsNotificationCenterOpen(false)}
            onMarkAsRead={markAsRead}
            onMarkAllAsRead={markAllAsRead}
            onDelete={deleteNotification}
            onUpdateParticipantStatus={async (eventId: string, status: string) => {
              try {
                const { eventApi } = await import("@/lib/api/eventApi");
                // Получаем ID текущего пользователя из события
                const event = events.find((e) => e.id === eventId);
                let currentParticipant;
                if (!event || !event.participants) {
                  // Если событие не найдено, загружаем его
                  const loadedEvent = await eventApi.get(authFetch, eventId);
                  if (!loadedEvent.participants) {
                    throw new Error("Не удалось найти участников события");
                  }
                  // Находим текущего пользователя по email
                  currentParticipant = loadedEvent.participants.find(
                    (p) => p.email === userEmail
                  );
                } else {
                  // Находим текущего пользователя по email
                  currentParticipant = event.participants.find(
                    (p) => p.email === userEmail
                  );
                }
                if (!currentParticipant) {
                  throw new Error("Вы не являетесь участником этого события");
                }
                await eventApi.updateParticipantStatus(authFetch, eventId, currentParticipant.user_id, status);
                await loadEvents();
              } catch (err) {
                console.error("Failed to update participant status:", err);
                throw err;
              }
            }}
            onEventClick={async (eventId: string) => {
              // Сначала ищем событие в загруженных событиях
              let event = events.find((e) => e.id === eventId);
              
              // Если не найдено, загружаем событие по ID
              if (!event) {
                try {
                  const { eventApi } = await import("@/lib/api/eventApi");
                  event = await eventApi.get(authFetch, eventId);
                } catch (err) {
                  console.error("Failed to load event:", err);
                  const errorMessage = err instanceof Error 
                    ? err.message 
                    : "Не удалось загрузить событие";
                  alert(`Ошибка: ${errorMessage}`);
                  return;
                }
              }
              
              if (event) {
                openEventModal(undefined, event);
                setIsNotificationCenterOpen(false);
              }
            }}
          />
        )}
        {isMembersManagerOpen && selectedCalendar && (
          <CalendarMembersManager
            calendar={selectedCalendar}
            authFetch={authFetch}
            onClose={() => setIsMembersManagerOpen(false)}
            onUpdate={() => {
              loadCalendarMembers();
              loadCalendars();
            }}
          />
        )}
        {selectedUserForView && (
          <UserAvailabilityView
            userId={selectedUserForView}
            user={users.find((u) => u.id === selectedUserForView) || null}
            availability={userAvailability}
            loading={userAvailabilityLoading}
            error={userAvailabilityError}
            selectedDate={selectedDate}
            onClose={() => {
              setSelectedUserForView(null);
              setAddToCalendarError(null);
            }}
            onAddToCalendar={async () => {
              if (selectedCalendarId && selectedUserForView) {
                setAddToCalendarLoading(true);
                setAddToCalendarError(null);
                try {
                  await ensureMembership(selectedUserForView);
                  await loadCalendarMembers();
                  // Перезагружаем доступность после добавления
                  setTimeout(() => {
                    loadUserAvailability(selectedUserForView);
                  }, 500);
                } catch (err) {
                  setAddToCalendarError(
                    err instanceof Error ? err.message : "Не удалось добавить пользователя",
                  );
                } finally {
                  setAddToCalendarLoading(false);
                }
              }
            }}
            addToCalendarError={addToCalendarError}
            addToCalendarLoading={addToCalendarLoading}
            isMember={members.some((m) => m.user_id === selectedUserForView)}
          />
        )}
      </div>
    </div>
  );
}







