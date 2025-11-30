"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/context/AuthContext";


type ViewMode = "week" | "month";
type CalendarRole = "owner" | "editor" | "viewer";

type Calendar = {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
  current_user_role: CalendarRole | null;
};

type CalendarMember = {
  calendar_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  added_at: string;
};

type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
};

type Room = {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  location: string | null;
  equipment: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type EventParticipant = {
  user_id: string;
  email: string;
  full_name: string | null;
  response_status: string;
};

type Notification = {
  id: string;
  user_id: string;
  event_id: string | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
};

type TimelineRowData = {
  id: string;
  label: string;
  meta?: string | null;
  availability: EventRecord[];
  loading: boolean;
  type: "room" | "participant";
};

type ParticipantProfile = {
  user_id: string;
  label: string;
  email: string;
  membership?: CalendarMember;
};

type PendingMoveContext = {
  event: EventRecord;
  newStart: Date;
  newEnd: Date;
};

type RecurrenceRule = {
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  count?: number;
  until?: string;
};

type EventRecord = {
  id: string;
  calendar_id: string;
  room_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  timezone: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  participants?: EventParticipant[];
  recurrence_rule?: RecurrenceRule | null;
  recurrence_parent_id?: string | null;
};

type ConflictEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  room_id: string | null;
};

type ConflictEntry = {
  type: "room" | "participant";
  resource_id: string | null;
  resource_label: string;
  slot_start: string;
  slot_end: string;
  events: ConflictEvent[];
};

type CalendarDraft = {
  name: string;
  description: string;
  timezone: string;
  color: string;
};

type EventDraft = {
  title: string;
  description: string;
  location: string;
  room_id: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  participant_ids: string[];
  recurrence_enabled: boolean;
  recurrence_frequency: "daily" | "weekly" | "monthly";
  recurrence_interval: number;
  recurrence_count?: number;
  recurrence_until: string;
};

const DEFAULT_FORM_STATE: CalendarDraft = {
  name: "",
  description: "",
  timezone: "Europe/Moscow",
  color: "#2563eb",
};

const DEFAULT_EVENT_FORM: EventDraft = {
  title: "",
  description: "",
  location: "",
  room_id: null,
  starts_at: "",
  ends_at: "",
  all_day: false,
  participant_ids: [],
  recurrence_enabled: false,
  recurrence_frequency: "weekly",
  recurrence_interval: 1,
  recurrence_count: undefined,
  recurrence_until: "",
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

const CALENDAR_ENDPOINT = `${API_BASE_URL}/calendars/`;
const EVENT_ENDPOINT = `${API_BASE_URL}/events/`;
const NOTIFICATION_ENDPOINT = `${API_BASE_URL}/notifications`;
const ROOM_ENDPOINT = `${API_BASE_URL}/rooms/`;
const USERS_ENDPOINT = `${API_BASE_URL}/users/`;
const MINUTES_IN_DAY = 24 * 60;
const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const ROLE_LABELS: Record<CalendarRole, string> = {
  owner: "Владелец",
  editor: "Редактор",
  viewer: "Наблюдатель",
};
const WORKDAY_START_HOUR = 8;
const WORKDAY_END_HOUR = 20;
const SLOT_DURATION_MINUTES = 30;

type AuthenticatedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const startOfWeek = (date: Date) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // начинаем с понедельника
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const addDays = (date: Date, amount: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
};

const startOfMonth = (date: Date) => {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
};

const addMonths = (date: Date, amount: number) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + amount);
  return result;
};

const getMonthGridDays = (date: Date) => {
  const firstDay = startOfMonth(date);
  const gridStart = startOfWeek(firstDay);
  return Array.from({ length: 42 }, (_, idx) => addDays(gridStart, idx));
};

const formatDate = (date: Date, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ru-RU", options).format(date);

// Простая функция: парсит UTC строку в Date
// Простая функция: парсит UTC строку в Date (явно указываем UTC)
const parseUTC = (utcStr: string): Date => {
  const utcString = utcStr.endsWith("Z") ? utcStr : utcStr + "Z";
  return new Date(utcString);
};

const inputToDate = (
  value: string,
  {
    allDay,
    endOfDay = false,
  }: {
    allDay: boolean;
    endOfDay?: boolean;
  },
) => {
  if (!value) {
    return null;
  }
  const hasTime = value.includes("T");
  const normalized =
    allDay && !hasTime
      ? `${value}${endOfDay ? "T23:59:59" : "T00:00:00"}`
      : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

// Простая функция: конвертирует UTC Date в строку для datetime-local (локальное время)
const toLocalString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
};

// Простая функция: конвертирует локальное время из datetime-local в UTC ISO
const toUTCString = (localStr: string): string => {
  // datetime-local input возвращает строку в формате "YYYY-MM-DDTHH:mm"
  // Когда мы создаём new Date() из такой строки БЕЗ указания timezone,
  // браузер интерпретирует её как локальное время
  
  // Простое решение: создаём Date из строки напрямую
  // Браузер автоматически интерпретирует "YYYY-MM-DDTHH:mm" как локальное время
  const localDate = new Date(localStr);
  
  if (isNaN(localDate.getTime())) {
    throw new Error(`Invalid date: ${localStr}`);
  }
  
  // toISOString() автоматически конвертирует локальное время в UTC
  return localDate.toISOString();
};

const toUTCDateISO = (date: Date) =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString();

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
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

  const dashboardStats = useMemo(() => {
    const weekCount = events.filter((event) => {
      const start = parseUTC(event.starts_at);
      return start >= weekStart && start < weekEnd;
    }).length;
    const recurringCount = events.filter(
      (event) => Boolean(event.recurrence_rule || event.recurrence_parent_id),
    ).length;
    const roomsInUse = new Set<string>();
    const peopleInvolved = new Set<string>();
    events.forEach((event) => {
      if (event.room_id) {
        roomsInUse.add(event.room_id);
      }
      event.participants?.forEach((participant) =>
        peopleInvolved.add(participant.user_id),
      );
    });

    return {
      weekCount,
      recurringCount,
      roomsInUse: roomsInUse.size,
      peopleInvolved: peopleInvolved.size,
    };
  }, [events, weekEnd, weekStart]);

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
    if (!selectedCalendarId || !accessToken) {
      setEvents([]);
      return;
    }
    setEventsLoading(true);
    try {
      const url = new URL(EVENT_ENDPOINT);
      url.searchParams.set("calendar_id", selectedCalendarId);
      url.searchParams.set("from", rangeStart.toISOString());
      url.searchParams.set("to", rangeEnd.toISOString());
      const response = await authFetch(url.toString(), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Не удалось получить события");
      }
      const data: EventRecord[] = await response.json();
      setEvents(data);
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

  const loadNotifications = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setNotificationsLoading(true);
    try {
      const response = await authFetch(`${NOTIFICATION_ENDPOINT}/`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Не удалось загрузить уведомления");
      }
      const data: Notification[] = await response.json();
      setNotifications(data);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setNotificationsLoading(false);
    }
  }, [accessToken, authFetch]);

  const loadUnreadCount = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    try {
      const response = await authFetch(`${NOTIFICATION_ENDPOINT}/unread-count`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const data: { count: number } = await response.json();
      setUnreadCount(data.count);
    } catch (err) {
      console.error("Failed to load unread count:", err);
    }
  }, [accessToken, authFetch]);

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications();
      loadUnreadCount();
      // Обновляем уведомления каждые 30 секунд
      const interval = setInterval(() => {
        loadNotifications();
        loadUnreadCount();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, loadNotifications, loadUnreadCount]);

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
        ...DEFAULT_EVENT_FORM,
        room_id: null,
        starts_at: toLocalString(start),
        ends_at: toLocalString(end),
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
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 bg-white px-2 py-0.5 text-[0.65rem] font-semibold text-red-600 transition hover:bg-red-50 flex-shrink-0"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteCalendar(calendar.id);
                        }}
                      >
                        ✕
                      </button>
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
            onMarkAsRead={async (notificationId: string) => {
              try {
                const response = await authFetch(
                  `${NOTIFICATION_ENDPOINT}/${notificationId}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_read: true }),
                  },
                );
                if (response.ok) {
                  await loadNotifications();
                  await loadUnreadCount();
                }
              } catch (err) {
                console.error("Failed to mark notification as read:", err);
              }
            }}
            onMarkAllAsRead={async () => {
              try {
                const response = await authFetch(
                  `${NOTIFICATION_ENDPOINT}/mark-all-read`,
                  {
                    method: "PATCH",
                  },
                );
                if (response.ok) {
                  await loadNotifications();
                  await loadUnreadCount();
                }
              } catch (err) {
                console.error("Failed to mark all as read:", err);
              }
            }}
            onDelete={async (notificationId: string) => {
              try {
                const response = await authFetch(
                  `${NOTIFICATION_ENDPOINT}/${notificationId}`,
                  {
                    method: "DELETE",
                  },
                );
                if (response.ok) {
                  await loadNotifications();
                  await loadUnreadCount();
                }
              } catch (err) {
                console.error("Failed to delete notification:", err);
              }
            }}
            onEventClick={(eventId: string) => {
              const event = events.find((e) => e.id === eventId);
              if (event) {
                openEventModal(undefined, event);
                setIsNotificationCenterOpen(false);
              }
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

function WeekView({
  days,
  events,
  loading,
  accent,
  onEventClick,
  rooms,
  onEventMove,
  onTimeSlotClick,
}: {
  days: Date[];
  events: EventRecord[];
  loading: boolean;
  accent: string;
  onEventClick: (event: EventRecord) => void;
  rooms: Room[];
  onEventMove?: (event: EventRecord, newStart: Date) => void;
  onTimeSlotClick?: (date: Date, startTime: Date, endTime: Date) => void;
}) {
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const HOUR_HEIGHT = 40; // Высота одного часа в пикселях
  const DAY_HEIGHT = 24 * HOUR_HEIGHT; // 960px
  const todayKey = new Date().toDateString();
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragInfo = useRef<{ event: EventRecord; offsetMinutes: number } | null>(null);
  const draggingRef = useRef(false);
  
  // Состояние для отслеживания текущего времени (обновляется каждую секунду)
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const lastSoundMinuteRef = useRef<number | null>(null);
  
  // Состояние для всплывающего окна с участниками
  const [hoveredEvent, setHoveredEvent] = useState<{
    event: EventRecord;
    position: { top: number; left: number };
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  const handleEventMouseEnter = useCallback((event: EventRecord, element: HTMLDivElement) => {
    // Проверяем, не показывается ли уже окно для этого события
    if (hoveredEvent?.event.id === event.id) {
      return;
    }
    
    // Показываем окно даже если нет участников, если есть описание или переговорка
    const hasContent = (event.participants && event.participants.length > 0) ||
                       (event.description && event.description.trim().length > 0) ||
                       event.room_id;
    
    if (!hasContent) {
      return;
    }
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    hoverTimeoutRef.current = setTimeout(() => {
      // Еще раз проверяем, не изменилось ли состояние
      const rect = element.getBoundingClientRect();
      const scrollContainer = element.closest('[class*="overflow"]');
      const containerRect = scrollContainer?.getBoundingClientRect() || 
                           element.closest('[class*="grid"]')?.getBoundingClientRect();
      
      if (!containerRect) return;
      
      // Увеличиваем ширину окна для дополнительной информации
      const tooltipWidth = 320;
      // Вычисляем примерную высоту окна с учетом всех секций
      const hasDescription = event.description && event.description.trim().length > 0;
      const hasRoom = event.room_id;
      const participantsCount = event.participants?.length || 0;
      const baseHeight = 120; // Заголовок и отступы
      const descriptionHeight = hasDescription ? 60 : 0;
      const roomHeight = hasRoom ? 40 : 0;
      const participantsHeight = participantsCount > 0 ? Math.min(participantsCount * 50 + 40, 200) : 0;
      const tooltipHeight = baseHeight + descriptionHeight + roomHeight + participantsHeight;
      
      // Позиционируем справа от события, если есть место, иначе слева
      const spaceOnRight = window.innerWidth - rect.right;
      const spaceOnLeft = rect.left;
      
      let left: number;
      if (spaceOnRight >= tooltipWidth + 10) {
        left = rect.right - containerRect.left + 10;
      } else if (spaceOnLeft >= tooltipWidth + 10) {
        left = rect.left - containerRect.left - tooltipWidth - 10;
      } else {
        // По центру, если нет места сбоку
        left = rect.left - containerRect.left + (rect.width / 2) - (tooltipWidth / 2);
      }
      
      // Вертикальное позиционирование - выравниваем по верху события
      const top = rect.top - containerRect.top;
      
      setHoveredEvent({
        event,
        position: { top, left },
      });
    }, 300); // Задержка 300мс перед показом
  }, [hoveredEvent]);
  
  const handleEventMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    // Небольшая задержка перед скрытием, чтобы можно было навести на само окно
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredEvent(null);
    }, 100);
  }, []);
  
  const handleTooltipMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  }, []);
  
  const handleTooltipMouseLeave = useCallback(() => {
    setHoveredEvent(null);
  }, []);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Обновляем каждую секунду
    
    return () => clearInterval(interval);
  }, []);
  
  // Функция проверки, начинается ли событие в ближайшие 5 минут
  const isEventStartingSoon = useCallback((event: EventRecord) => {
    const eventStart = parseUTC(event.starts_at);
    const now = currentTime;
    const diffMs = eventStart.getTime() - now.getTime();
    const diffMinutes = diffMs / (1000 * 60);
    // Событие начинается в ближайшие 5 минут и еще не началось
    return diffMinutes >= 0 && diffMinutes <= 5;
  }, [currentTime]);
  
  // Воспроизведение звукового сигнала каждую минуту для событий, начинающихся в ближайшие 5 минут
  useEffect(() => {
    const now = currentTime;
    const currentMinute = now.getMinutes();
    
    // Проверяем, есть ли события, начинающиеся в ближайшие 5 минут
    const upcomingEvents = events.filter((event) => {
      const eventStart = parseUTC(event.starts_at);
      const diffMs = eventStart.getTime() - now.getTime();
      const diffMinutes = diffMs / (1000 * 60);
      return diffMinutes >= 0 && diffMinutes <= 5;
    });
    
    // Воспроизводим звук каждую минуту, если есть предстоящие события
    if (upcomingEvents.length > 0 && lastSoundMinuteRef.current !== currentMinute) {
      lastSoundMinuteRef.current = currentMinute;
      
      // Создаем звуковой сигнал (короткий бип)
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800; // Частота звука (Гц)
        oscillator.type = "sine";
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime); // Громкость
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2); // Длительность 200мс
        
        // Очистка после завершения
        setTimeout(() => {
          audioContext.close();
        }, 300);
      } catch (err) {
        // Игнорируем ошибки, если браузер не поддерживает Web Audio API
        console.debug("Audio notification not available:", err);
      }
    }
  }, [currentTime, events]);
  
  // Состояние для выделения диапазона времени
  const [selection, setSelection] = useState<{
    columnIndex: number;
    startY: number;
    endY: number;
    isActive: boolean;
  } | null>(null);

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    eventRecord: EventRecord,
  ) => {
    if (!onEventMove || eventRecord.all_day) {
      e.preventDefault();
      return;
    }
    draggingRef.current = true;
    const bounds = e.currentTarget.getBoundingClientRect();
    const offsetPx = e.clientY - bounds.top;
    const offsetMinutes = Math.min(
      Math.max((offsetPx / DAY_HEIGHT) * MINUTES_IN_DAY, 0),
      MINUTES_IN_DAY,
    );
    dragInfo.current = { event: eventRecord, offsetMinutes };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", eventRecord.id);
  };

  const handleDragEnd = () => {
    dragInfo.current = null;
    setTimeout(() => {
      draggingRef.current = false;
    }, 0);
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    dayStart: Date,
    columnIndex: number,
  ) => {
    if (!dragInfo.current || !onEventMove) {
      return;
    }
    e.preventDefault();
    const columnEl = columnRefs.current[columnIndex];
    if (!columnEl) {
      return;
    }
    const rect = columnEl.getBoundingClientRect();
    let minutes = ((e.clientY - rect.top) / rect.height) * MINUTES_IN_DAY;
    minutes = Math.max(0, Math.min(MINUTES_IN_DAY, minutes));
    let newStartMinutes = minutes - dragInfo.current.offsetMinutes;
    newStartMinutes = Math.max(0, Math.min(MINUTES_IN_DAY, newStartMinutes));
    const newStart = new Date(dayStart.getTime() + newStartMinutes * 60000);
    onEventMove(dragInfo.current.event, newStart);
    dragInfo.current = null;
    draggingRef.current = false;
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (dragInfo.current) {
      e.preventDefault();
    }
  };

  const handleCardClick = (eventRecord: EventRecord) => {
    if (draggingRef.current) {
      return;
    }
    onEventClick(eventRecord);
  };

  const handleMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    columnIndex: number,
    dayStart: Date,
  ) => {
    if (!onTimeSlotClick || draggingRef.current || e.button !== 0) {
      return;
    }
    // Проверяем, что клик не на событии
    const target = e.target as HTMLElement;
    if (target.closest('[data-event-card]')) {
      return;
    }

    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const startY = e.clientY - rect.top;
    
    setSelection({
      columnIndex,
      startY,
      endY: startY,
      isActive: true,
    });
  };

  const dayColumns = useMemo(
    () =>
      days.map((date) => {
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = addDays(dayStart, 1);
        const dayEvents = events.filter((event) => {
          const start = parseUTC(event.starts_at);
          const end = parseUTC(event.ends_at);
          return start < dayEnd && end > dayStart;
        });

        return {
          date,
          dayStart,
          dayEnd,
          events: dayEvents,
          isToday: date.toDateString() === todayKey,
        };
      }),
    [days, events, todayKey],
  );

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!selection?.isActive || !onTimeSlotClick) {
      return;
    }

    const columnEl = columnRefs.current[selection.columnIndex];
    if (!columnEl) {
      return;
    }

    const rect = columnEl.getBoundingClientRect();
    const currentY = e.clientY - rect.top;
    const clampedY = Math.max(0, Math.min(DAY_HEIGHT, currentY));

    setSelection((prev) => {
      if (!prev) return null;
      return { ...prev, endY: clampedY };
    });
  }, [selection, DAY_HEIGHT, onTimeSlotClick]);

  const handleMouseUp = useCallback(() => {
    if (!selection?.isActive || !onTimeSlotClick) {
      return;
    }

    const columnIndex = selection.columnIndex;
    const dayColumn = dayColumns[columnIndex];
    if (!dayColumn) {
      setSelection(null);
      return;
    }

    const startY = Math.min(selection.startY, selection.endY);
    const endY = Math.max(selection.startY, selection.endY);
    
    // Минимальная высота выделения - 30 минут
    const minHeight = (30 / MINUTES_IN_DAY) * DAY_HEIGHT;
    const actualHeight = Math.max(minHeight, endY - startY);

    const startMinutes = (startY / DAY_HEIGHT) * MINUTES_IN_DAY;
    const endMinutes = startMinutes + (actualHeight / DAY_HEIGHT) * MINUTES_IN_DAY;

    const roundedStartMinutes = Math.floor(startMinutes / 15) * 15; // Округляем до 15 минут
    const roundedEndMinutes = Math.ceil(endMinutes / 15) * 15;

    const startTime = new Date(dayColumn.dayStart);
    startTime.setHours(
      Math.floor(roundedStartMinutes / 60),
      roundedStartMinutes % 60,
      0,
      0,
    );

    const endTime = new Date(dayColumn.dayStart);
    endTime.setHours(
      Math.floor(roundedEndMinutes / 60),
      roundedEndMinutes % 60,
      0,
      0,
    );

    onTimeSlotClick(dayColumn.dayStart, startTime, endTime);
    setSelection(null);
  }, [selection, dayColumns, onTimeSlotClick, DAY_HEIGHT]);

  // Глобальные обработчики мыши для выделения
  useEffect(() => {
    if (selection?.isActive) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [selection?.isActive, handleMouseMove, handleMouseUp]);

  return (
    <div className="h-full flex flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.12)] overflow-hidden">
      <div className="sticky top-0 z-10 grid grid-cols-[80px_repeat(7,minmax(0,1fr))] border-b border-slate-200 bg-slate-50 text-sm flex-shrink-0">
        <div className="p-2 text-right text-[0.65rem] uppercase tracking-[0.3em] text-slate-500 bg-slate-50">
          Время
        </div>
        {dayColumns.map(({ date, isToday }) => (
          <div
            key={`head-${date.toISOString()}`}
            className={`border-l border-slate-200 p-2 bg-slate-50 ${isToday ? "bg-lime-50" : ""}`}
          >
            <p className="uppercase text-[0.65rem] tracking-[0.3em] text-slate-400">
              {formatDate(date, { weekday: "short" })}
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <p className="text-base font-semibold">
                    {new Intl.DateTimeFormat("ru-RU", {
                      day: "numeric",
                      month: "short",
                }).format(date)}
                  </p>
              {isToday && (
                <span className="rounded-full bg-lime-100 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase text-lime-600">
                    сегодня
                  </span>
                )}
              </div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[80px_repeat(7,minmax(0,1fr))]">
          <div
            className="border-r border-slate-200 bg-white"
                style={{ height: `${DAY_HEIGHT}px` }}
              >
            <div className="flex h-full flex-col justify-between text-right text-xs text-slate-500">
                {hours.map((hour) => (
                  <div
                  key={`label-${hour}`}
                  className="pr-1.5 text-[0.6rem] uppercase tracking-wide"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  {hour.toString().padStart(2, "0")}:00
                </div>
              ))}
            </div>
          </div>

          {dayColumns.map(({ date, dayStart, dayEnd, events: dayEvents, isToday }, idx) => {
            const isSelecting = selection?.columnIndex === idx && selection.isActive;
            const selectionStartY = isSelecting ? Math.min(selection.startY, selection.endY) : 0;
            const selectionEndY = isSelecting ? Math.max(selection.startY, selection.endY) : 0;
            const selectionHeight = isSelecting ? selectionEndY - selectionStartY : 0;
            
            return (
            <div
              key={`grid-${date.toISOString()}`}
              className={`relative border-l border-slate-200 ${idx === dayColumns.length - 1 ? "border-r border-slate-200" : ""} ${
                isToday ? "bg-lime-50" : "bg-white"
              } ${onTimeSlotClick ? "cursor-crosshair" : ""}`}
              style={{ height: `${DAY_HEIGHT}px` }}
              ref={(el) => {
                columnRefs.current[idx] = el;
              }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, dayStart, idx)}
              onMouseDown={(e) => handleMouseDown(e, idx, dayStart)}
            >
              {hours.map((hour) => (
                <div
                  key={`line-${date.toISOString()}-${hour}`}
                  className="absolute left-0 right-0 border-b border-slate-100"
                    style={{ top: `${hour * HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Визуальное выделение диапазона времени */}
                {isSelecting && selectionHeight > 0 && (
                  <div
                    className="absolute left-0 right-0 rounded-lg border-2 border-lime-500 bg-lime-100/30 pointer-events-none z-20"
                    style={{
                      top: `${selectionStartY}px`,
                      height: `${selectionHeight}px`,
                    }}
                  />
                )}

                {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-slate-500">
                    Загружаем события…
                  </div>
                )}

                {dayEvents.map((event) => {
                const eventStart = parseUTC(event.starts_at);
                const eventEnd = parseUTC(event.ends_at);
                const displayStart = eventStart < dayStart ? dayStart : eventStart;
                const displayEnd = eventEnd > dayEnd ? dayEnd : eventEnd;
                const minutesFromStart =
                  (displayStart.getTime() - dayStart.getTime()) / 60000;
                  const durationMinutes = Math.max(
                  (displayEnd.getTime() - displayStart.getTime()) / 60000,
                    30,
                  );
                  const topPx = (minutesFromStart / MINUTES_IN_DAY) * DAY_HEIGHT;
                  const heightPx = (durationMinutes / MINUTES_IN_DAY) * DAY_HEIGHT;
                  const isStartingSoon = isEventStartingSoon(event);

                  return (
                    <div
                      key={event.id}
                      data-event-card
                      ref={(el) => {
                        if (el) {
                          eventCardRefs.current.set(event.id, el);
                        } else {
                          eventCardRefs.current.delete(event.id);
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCardClick(event);
                      }}
                      onMouseEnter={(e) => {
                        const hasContent = (event.participants && event.participants.length > 0) ||
                                         (event.description && event.description.trim().length > 0) ||
                                         event.room_id;
                        if (hasContent) {
                          handleEventMouseEnter(event, e.currentTarget);
                        }
                      }}
                      onMouseLeave={handleEventMouseLeave}
                      draggable={Boolean(onEventMove) && !event.all_day}
                      onDragStart={(dragEvent) => handleDragStart(dragEvent, event)}
                      onDragEnd={handleDragEnd}
                      className={`absolute left-0.5 right-0.5 cursor-pointer rounded-lg border border-slate-200 bg-white p-1.5 text-xs text-slate-900 shadow-md transition hover:shadow-lg z-10 ${
                        isStartingSoon ? "event-vibrating border-lime-500 border-2" : ""
                      }`}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        background: isStartingSoon ? `${accent}40` : `${accent}20`,
                      }}
                    >
                    <p className="text-xs font-semibold leading-tight truncate">{event.title}</p>
                    <p className="text-[0.65rem] text-slate-600 leading-tight">
                        {new Intl.DateTimeFormat("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                      }).format(eventStart)}{" "}
                        —{" "}
                        {new Intl.DateTimeFormat("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                      }).format(eventEnd)}
                      </p>
                      {event.room_id && (
                      <p className="mt-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate-500 truncate">
                          🏢 {rooms.find((r) => r.id === event.room_id)?.name || "Переговорка"}
                        </p>
                      )}
                      {event.location && !event.room_id && (
                      <p className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-slate-500 truncate">
                          {event.location}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
            </div>
      </div>
      
      {/* Всплывающее окно с деталями события - вынесено за пределы цикла по дням, чтобы показывалось только один раз */}
      {hoveredEvent && (
        <div
          className="absolute z-50 rounded-xl border border-slate-200 bg-white shadow-[0_10px_40px_rgba(15,23,42,0.2)] p-4 pointer-events-auto"
          style={{
            top: `${hoveredEvent.position.top}px`,
            left: `${hoveredEvent.position.left}px`,
            width: "320px",
            maxHeight: "500px",
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          {/* Заголовок события */}
          <div className="mb-3 border-b border-slate-100 pb-3">
            <p className="text-sm font-semibold text-slate-900 mb-1">{hoveredEvent.event.title}</p>
            <p className="text-xs text-slate-500">
              {new Intl.DateTimeFormat("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(parseUTC(hoveredEvent.event.starts_at))}{" "}
              —{" "}
              {new Intl.DateTimeFormat("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(parseUTC(hoveredEvent.event.ends_at))}
            </p>
          </div>
          
          {/* Описание события */}
          {hoveredEvent.event.description && hoveredEvent.event.description.trim().length > 0 && (
            <div className="mb-3 border-b border-slate-100 pb-3">
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Описание</p>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
                {hoveredEvent.event.description}
              </p>
            </div>
          )}
          
          {/* Переговорка */}
          {hoveredEvent.event.room_id && (
            <div className="mb-3 border-b border-slate-100 pb-3">
              <p className="text-xs font-semibold text-slate-700 mb-1.5">Переговорка</p>
              <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
                <span className="text-lg">🏢</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900">
                    {rooms.find((r) => r.id === hoveredEvent.event.room_id)?.name || "Переговорка"}
                  </p>
                  {rooms.find((r) => r.id === hoveredEvent.event.room_id)?.location && (
                    <p className="text-[0.65rem] text-slate-500 mt-0.5">
                      {rooms.find((r) => r.id === hoveredEvent.event.room_id)?.location}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Участники */}
          {hoveredEvent.event.participants && hoveredEvent.event.participants.length > 0 && (
            <div>
              <div className="mb-2">
                <p className="text-xs font-semibold text-slate-700">Участники</p>
                <p className="text-[0.65rem] text-slate-500 mt-0.5">
                  {hoveredEvent.event.participants.length}{" "}
                  {hoveredEvent.event.participants.length === 1 ? "участник" : 
                   hoveredEvent.event.participants.length < 5 ? "участника" : "участников"}
                </p>
              </div>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {hoveredEvent.event.participants.map((participant) => {
                  const statusLabels: Record<string, string> = {
                    accepted: "Принял",
                    declined: "Отклонил",
                    tentative: "Возможно",
                    pending: "Нет ответа",
                    needs_action: "Нет ответа",
                  };
                  const statusColors: Record<string, string> = {
                    accepted: "bg-lime-100 text-lime-700 border-lime-300",
                    declined: "bg-red-100 text-red-700 border-red-300",
                    tentative: "bg-amber-100 text-amber-700 border-amber-300",
                    pending: "bg-slate-100 text-slate-600 border-slate-300",
                    needs_action: "bg-slate-100 text-slate-600 border-slate-300",
                  };
                  const status = participant.response_status || "pending";
                  
                  return (
                    <div
                      key={participant.user_id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {participant.full_name || participant.email}
                        </p>
                        {participant.full_name && (
                          <p className="text-[0.65rem] text-slate-500 truncate">
                            {participant.email}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold flex-shrink-0 ${
                          statusColors[status] || statusColors.pending
                        }`}
                      >
                        {statusLabels[status] || statusLabels.pending}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MonthView({
  days,
  selectedDate,
  onSelectDate,
  events,
  loading,
  accent,
  onEventClick,
  rooms,
}: {
  days: Date[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  events: EventRecord[];
  loading: boolean;
  accent: string;
  onEventClick: (event: EventRecord) => void;
  rooms: Room[];
}) {
  const currentMonth = selectedDate.getMonth();

  const eventsByDay = useMemo(() => {
    const record = new Map<string, EventRecord[]>();
    days.forEach((day) => {
      const key = day.toDateString();
      record.set(key, []);
    });
    events.forEach((event) => {
      const start = parseUTC(event.starts_at);
      const end = parseUTC(event.ends_at);
      days.forEach((day) => {
        // Создаём границы дня в локальном времени
        const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
        const dayEnd = addDays(dayStart, 1);
        // События уже в локальном времени (parseUTC конвертирует UTC в локальное)
        if (start < dayEnd && end > dayStart) {
          const key = dayStart.toDateString();
          const list = record.get(key);
          if (list) {
            list.push(event);
          } else {
            record.set(key, [event]);
          }
        }
      });
    });
    return record;
  }, [days, events]);

  return (
    <div className="mt-6">
      {loading && (
        <p className="mb-4 text-sm text-slate-400">Загружаем события…</p>
      )}
      <div className="grid grid-cols-7 gap-3 text-xs uppercase tracking-[0.3em] text-slate-500">
        {WEEKDAY_LABELS.map((label) => (
          <p key={label}>{label}</p>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-3">
        {days.map((day) => {
          const key = day.toDateString();
          const dayEvents = eventsByDay.get(key) ?? [];
          const isCurrentMonth = day.getMonth() === currentMonth;
          const isToday = new Date().toDateString() === key;

          return (
            <button
              type="button"
              key={key}
              onClick={() => onSelectDate(new Date(day))}
              className={`rounded-2xl border p-3 text-left transition ${
                isCurrentMonth
                  ? "border-slate-200 bg-white"
                  : "border-slate-100 bg-slate-50 text-slate-500"
              } ${isToday ? "ring-2 ring-lime-400" : ""}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold text-slate-900">
                  {day.getDate().toString().padStart(2, "0")}
                </p>
                {isToday && (
                  <span className="rounded-full bg-lime-100 px-2 py-1 text-[0.65rem] text-lime-600">
                    сегодня
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-xl bg-slate-100 px-2 py-1 text-[0.65rem] transition hover:bg-slate-200"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: accent }}
                    />
                    <span className="truncate text-slate-700">
                      {event.title}
                    </span>
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-[0.65rem] text-slate-500">
                    + {dayEvents.length - 3} ещё
                  </p>
                )}
                {dayEvents.length === 0 && (
                  <p className="text-[0.65rem] text-slate-400">—</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventModal({
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
}: {
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
}) {
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

function MoveSeriesDialog({
  context,
  scope,
  onScopeChange,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  context: PendingMoveContext;
  scope: "single" | "series";
  onScopeChange: (next: "single" | "series") => void;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
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

function ParticipantsSection({
  form,
  setForm,
  users,
  usersLoading,
  usersError,
  calendarMembers,
  membersLoading,
  readOnly,
  onEnsureMembership,
}: {
  form: EventDraft;
  setForm: (form: EventDraft | ((prev: EventDraft) => EventDraft)) => void;
  users: UserProfile[];
  usersLoading: boolean;
  usersError: string | null;
  calendarMembers: CalendarMember[];
  membersLoading: boolean;
  readOnly: boolean;
  onEnsureMembership: (userId: string) => Promise<void>;
}) {
  const selectedCount = form.participant_ids.length;
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const membershipMap = useMemo(() => {
    const map = new Map<string, CalendarMember>();
    calendarMembers.forEach((member) => {
      map.set(member.user_id, member);
    });
    return map;
  }, [calendarMembers]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const nameA = a.full_name || a.email;
      const nameB = b.full_name || b.email;
      return nameA.localeCompare(nameB, "ru");
    });
  }, [users]);

  const toggleParticipant = (userId: string) => {
    setForm((prev) => ({
      ...prev,
      participant_ids: prev.participant_ids.includes(userId)
        ? prev.participant_ids.filter((id) => id !== userId)
        : [...prev.participant_ids, userId],
    }));
  };

  const handleToggle = async (userId: string) => {
    if (readOnly) return;
    const alreadySelected = form.participant_ids.includes(userId);
    if (!alreadySelected) {
      try {
        await onEnsureMembership(userId);
        setMembershipError(null);
      } catch (err) {
        setMembershipError(
          err instanceof Error
            ? err.message
            : "Не удалось выдать доступ пользователю",
        );
        return;
      }
    }
    toggleParticipant(userId);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Участники
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Команда события
          </p>
        </div>
        {selectedCount > 0 && (
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
            {selectedCount}
          </span>
        )}
      </div>

      {usersLoading || membersLoading ? (
        <p className="mt-3 text-xs text-slate-500">Загружаем пользователей…</p>
      ) : sortedUsers.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          Пользователи ещё не добавлены.
        </p>
      ) : (
        <>
          {(usersError || membershipError) && (
            <p className="mt-3 text-xs text-red-600">
              {membershipError || usersError}
            </p>
          )}
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            {sortedUsers.map((user) => {
              const membership = membershipMap.get(user.id);
              const isSelected = form.participant_ids.includes(user.id);
              const badge =
                membership?.role === "owner"
                  ? "Владелец"
                  : membership?.role === "editor"
                    ? "Редактор"
                    : membership?.role === "viewer"
                      ? "Наблюдатель"
                      : "Нет доступа";
              return (
                <div
                  key={user.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                    isSelected
                      ? "border-lime-500 bg-lime-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={readOnly}
                    onChange={() => handleToggle(user.id)}
                    className="h-4 w-4 rounded border-lime-500 text-lime-500 focus:ring-lime-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {user.full_name || user.email}
                    </p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[0.65rem] ${
                      membership
                        ? "border border-slate-200 text-slate-500"
                        : "border border-amber-200 bg-amber-50 text-amber-600"
                    }`}
                  >
                    {badge}
                  </span>
                </div>
              );
            })}
          </div>

          {selectedCount === 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Отметьте участников, чтобы видеть их занятость ниже.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ResourcePanel({
  rooms,
  roomsLoading,
  form,
  setForm,
  selectedRoom,
  selectedDate,
  roomAvailability,
  loadingAvailability,
  readOnly,
  members,
  membersLoading,
  users,
  usersLoading,
  usersError,
  authFetch,
  selectedCalendarId,
  isAllDay,
  onRefreshMembers,
  conflicts,
  conflictsLoading,
  conflictsError,
}: {
  rooms: Room[];
  roomsLoading: boolean;
  form: EventDraft;
  setForm: (form: EventDraft | ((prev: EventDraft) => EventDraft)) => void;
  selectedRoom: Room | null;
  selectedDate: Date;
  roomAvailability: EventRecord[];
  loadingAvailability: boolean;
  readOnly: boolean;
  members: CalendarMember[];
  membersLoading: boolean;
  users: UserProfile[];
  usersLoading: boolean;
  usersError: string | null;
  authFetch: AuthenticatedFetch;
  selectedCalendarId: string | null;
  isAllDay: boolean;
  onRefreshMembers: () => Promise<void> | void;
  conflicts: ConflictEntry[];
  conflictsLoading: boolean;
  conflictsError: string | null;
}) {
  const [participantAvailability, setParticipantAvailability] = useState<
    Record<string, EventRecord[]>
  >({});
  const [participantAvailabilityLoading, setParticipantAvailabilityLoading] =
    useState(false);
  const [participantAvailabilityError, setParticipantAvailabilityError] =
    useState<string | null>(null);

  const membershipMap = useMemo(() => {
    const map = new Map<string, CalendarMember>();
    members.forEach((member) => map.set(member.user_id, member));
    return map;
  }, [members]);

  const selectedParticipantProfiles = useMemo(() => {
    return form.participant_ids
      .map<ParticipantProfile | null>((userId) => {
        const profile = users.find((user) => user.id === userId);
        if (!profile) {
          return null;
        }
        return {
          user_id: userId,
          label: profile.full_name || profile.email,
          email: profile.email,
          membership: membershipMap.get(userId),
        };
      })
      .filter((item): item is ParticipantProfile => item !== null);
  }, [form.participant_ids, users, membershipMap]);

  const accessibleParticipants = useMemo(
    () =>
      selectedParticipantProfiles.filter((participant) =>
        membershipMap.has(participant.user_id),
      ),
    [selectedParticipantProfiles, membershipMap],
  );

  const ensureMembership = useCallback(
    async (userId: string) => {
      if (!selectedCalendarId) {
        throw new Error("Сначала выберите календарь");
      }
      if (membershipMap.has(userId)) {
        return;
      }
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
          }
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      await onRefreshMembers();
    },
    [authFetch, membershipMap, onRefreshMembers, selectedCalendarId],
  );

  useEffect(() => {
    if (!selectedCalendarId || !form.starts_at || !form.ends_at) {
      setParticipantAvailability({});
      setParticipantAvailabilityError(null);
      setParticipantAvailabilityLoading(false);
      return;
    }

    const rangeStart = inputToDate(form.starts_at, { allDay: form.all_day });
    const rangeEnd = inputToDate(form.ends_at, {
      allDay: form.all_day,
      endOfDay: true,
    });
    if (!rangeStart || !rangeEnd) {
      setParticipantAvailability({});
      setParticipantAvailabilityError(null);
      setParticipantAvailabilityLoading(false);
      return;
    }

    const missingAccess = selectedParticipantProfiles.filter(
      (participant) => !membershipMap.has(participant.user_id),
    );
    if (missingAccess.length > 0) {
      if (readOnly) {
        setParticipantAvailabilityError(
          "Некоторым участникам недоступен этот календарь",
        );
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          await Promise.all(
            missingAccess.map((participant) =>
              ensureMembership(participant.user_id),
            ),
          );
        } catch (err) {
          if (!cancelled) {
            setParticipantAvailabilityError(
              err instanceof Error
                ? err.message
                : "Не удалось выдать доступ участнику",
            );
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (accessibleParticipants.length === 0) {
      setParticipantAvailability({});
      setParticipantAvailabilityError(null);
      setParticipantAvailabilityLoading(false);
      return;
    }

    let cancelled = false;
    const fetchAvailability = async () => {
      setParticipantAvailabilityLoading(true);
      setParticipantAvailabilityError(null);
      try {
        const entries = await Promise.all(
          accessibleParticipants.map(async (participant) => {
            const url = `${CALENDAR_ENDPOINT}${selectedCalendarId}/members/${participant.user_id}/availability?from=${encodeURIComponent(rangeStart.toISOString())}&to=${encodeURIComponent(rangeEnd.toISOString())}`;
            try {
              const response = await authFetch(url, { cache: "no-store" });
              if (!response.ok) {
                return [participant.user_id, []] as const;
              }
              const data: EventRecord[] = await response.json();
              return [participant.user_id, data] as const;
            } catch {
              return [participant.user_id, []] as const;
            }
          }),
        );

        if (!cancelled) {
          setParticipantAvailability(Object.fromEntries(entries));
        }
      } catch {
        if (!cancelled) {
          setParticipantAvailabilityError(
            "Не удалось загрузить занятость участников",
          );
        }
      } finally {
        if (!cancelled) {
          setParticipantAvailabilityLoading(false);
        }
      }
    };

    fetchAvailability();
    return () => {
      cancelled = true;
    };
  }, [
    accessibleParticipants,
    authFetch,
    ensureMembership,
    form.all_day,
    form.ends_at,
    form.starts_at,
    membershipMap,
    readOnly,
    selectedCalendarId,
    selectedParticipantProfiles,
  ]);

  const timelineRows = useMemo(() => {
    const rows: TimelineRowData[] = [];
    if (selectedRoom) {
      rows.push({
        id: `room-${selectedRoom.id}`,
        label: selectedRoom.name,
        meta: selectedRoom.location,
        availability: roomAvailability,
        loading: loadingAvailability,
        type: "room",
      });
    }
    selectedParticipantProfiles.forEach((participant) => {
      rows.push({
        id: `participant-${participant.user_id}`,
        label: participant.label,
        meta: participant.email,
        availability: participantAvailability[participant.user_id] ?? [],
        loading:
          participantAvailabilityLoading ||
          !membershipMap.has(participant.user_id),
        type: "participant",
      });
    });
    if (rows.length === 0) {
      rows.push({
        id: "placeholder",
        label: "Временная сетка",
        meta: "Выберите ресурсы",
        availability: [],
        loading: false,
        type: "participant",
      });
    }
    return rows;
  }, [
    loadingAvailability,
    participantAvailability,
    participantAvailabilityLoading,
    roomAvailability,
    selectedParticipantProfiles,
    selectedRoom,
  ]);

  const conflictMap = useMemo(() => {
    const map = new Map<string, Array<{ start: Date; end: Date }>>();
    conflicts.forEach((conflict) => {
      if (!conflict.resource_id) {
        return;
      }
      const key =
        conflict.type === "room"
          ? `room-${conflict.resource_id}`
          : `participant-${conflict.resource_id}`;
      const entry = map.get(key) ?? [];
      entry.push({
        start: new Date(conflict.slot_start),
        end: new Date(conflict.slot_end),
      });
      map.set(key, entry);
    });
    return map;
  }, [conflicts]);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
            Ресурсы
          </p>
          <h3 className="mt-1 text-lg font-semibold">
            Переговорки и участники
          </h3>
        </div>
        {form.room_id && (
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
            {selectedRoom?.name ?? "Переговорка"}
          </span>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <p className="font-medium text-slate-700">Переговорка</p>
        {roomsLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
            Загружаем переговорки…
          </div>
        ) : (
          <select
            value={form.room_id || ""}
            disabled={readOnly}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                room_id: e.target.value || null,
              }))
            }
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-lime-500"
          >
            <option value="" className="bg-white text-slate-900">
              Без переговорки
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

      <ParticipantsSection
        form={form}
        setForm={setForm}
        users={users}
        usersLoading={usersLoading}
        usersError={usersError}
        calendarMembers={members}
        membersLoading={membersLoading}
        onEnsureMembership={ensureMembership}
        readOnly={readOnly}
      />

      <UnifiedAvailabilityTimeline
        rows={timelineRows}
        referenceDate={selectedDate}
        selectedStart={form.starts_at}
        selectedEnd={form.ends_at}
        isAllDay={isAllDay}
        errorMessage={participantAvailabilityError}
        conflictMap={conflictMap}
      />

      <ConflictSummary
        conflicts={conflicts}
        loading={conflictsLoading}
        error={conflictsError}
      />
    </div>
  );
}

function UnifiedAvailabilityTimeline({
  rows,
  referenceDate,
  selectedStart,
  selectedEnd,
  isAllDay,
  errorMessage,
  conflictMap,
}: {
  rows: TimelineRowData[];
  referenceDate: Date;
  selectedStart: string;
  selectedEnd: string;
  isAllDay: boolean;
  errorMessage: string | null;
  conflictMap?: Map<string, Array<{ start: Date; end: Date }>>;
}) {
  const selectionRange = useMemo(() => {
    const start = inputToDate(selectedStart, { allDay: isAllDay });
    const end = inputToDate(selectedEnd, { allDay: isAllDay, endOfDay: true });
    return { start, end };
  }, [selectedEnd, selectedStart, isAllDay]);

  const baseDate = useMemo(() => {
    if (selectionRange.start) {
      const normalized = new Date(selectionRange.start);
      normalized.setHours(0, 0, 0, 0);
      return normalized;
    }
    const fallback = new Date(referenceDate);
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }, [referenceDate, selectionRange.start]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Добавьте переговорку или выберите участников, чтобы увидеть таймлайн
        занятости.
      </div>
    );
  }

  const timeSlots = useMemo(() => {
    const totalSlots =
      ((WORKDAY_END_HOUR - WORKDAY_START_HOUR) * 60) / SLOT_DURATION_MINUTES;
    return Array.from({ length: totalSlots }, (_, index) => {
      const totalMinutes =
        WORKDAY_START_HOUR * 60 + index * SLOT_DURATION_MINUTES;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      const label = `${String(hour).padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}`;
      return { index, hour, minute, label };
    });
  }, []);

  const templateColumns = useMemo(
    () => `minmax(160px, 1fr) repeat(${timeSlots.length}, minmax(12px, 1fr))`,
    [timeSlots.length],
  );

  const resourceRows = useMemo(
    () => rows.filter((row) => row.id !== "placeholder"),
    [rows],
  );

  const buildSlotTimes = (slotIndex: number) => {
    const slot = timeSlots[slotIndex];
    const slotStart = new Date(baseDate);
    slotStart.setHours(slot.hour, slot.minute, 0, 0);
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + SLOT_DURATION_MINUTES);
    return { slotStart, slotEnd };
  };

  const rowHasBusyEvent = (
    rowAvailability: EventRecord[],
    slotStart: Date,
    slotEnd: Date,
  ) =>
    rowAvailability.some((event) => {
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      return eventStart < slotEnd && eventEnd > slotStart;
    });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-red-400" />
          <span>Занято</span>
          </div>
          <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-lime-400 bg-lime-100" />
          <span>Выбранный интервал</span>
          </div>
          <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-slate-200" />
          <span>Свободно</span>
          </div>
        {errorMessage && (
          <span className="text-red-500">{errorMessage}</span>
        )}
        </div>

      <div className="overflow-x-auto">
        <div className="min-w-full space-y-3">
          <div
            className="grid items-center gap-1 text-[0.6rem] uppercase tracking-wide text-slate-400"
            style={{ gridTemplateColumns: templateColumns }}
          >
            <div />
            {timeSlots.map((slot) =>
              slot.minute === 0 ? <div key={slot.index}>{slot.label}</div> : <div key={slot.index} />,
            )}
      </div>

          {rows.map((row) => {
            const rowConflictSlots = conflictMap?.get(row.id) ?? [];
            return (
              <div
                key={row.id}
                className="grid items-stretch gap-1"
                style={{ gridTemplateColumns: templateColumns }}
              >
                <div className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {row.label}
                  </p>
                  {row.meta && (
                    <p className="text-xs text-slate-500">{row.meta}</p>
                  )}
                  <span className="mt-1 text-[0.65rem] text-slate-400">
                    {row.type === "room" ? "Переговорка" : "Участник"}
                  </span>
                </div>

                {timeSlots.map((slot) => {
                  const { slotStart, slotEnd } = buildSlotTimes(slot.index);
                  const eventInSlot = row.availability.find((event) => {
                    const eventStart = parseUTC(event.starts_at);
                    const eventEnd = parseUTC(event.ends_at);
                    return eventStart < slotEnd && eventEnd > slotStart;
                  });
                  const busy = Boolean(eventInSlot);
                  const selected =
                    selectionRange.start &&
                    selectionRange.end &&
                    selectionRange.start < slotEnd &&
                    selectionRange.end > slotStart;
                  const conflicting =
                    rowConflictSlots.some(
                      (conflict) =>
                        conflict.start < slotEnd && conflict.end > slotStart,
                    ) && !selected;

                    return (
                      <div
                      key={`${row.id}-${slot.index}`}
                      className={`rounded-lg border p-1.5 text-[0.6rem] ${
                        conflicting
                          ? "border-amber-400 bg-amber-100 text-amber-700"
                          : busy
                            ? "border-red-200 bg-red-50 text-red-600"
                            : selected
                              ? "border-lime-300 bg-lime-50 text-lime-600"
                              : "border-slate-200 bg-white text-slate-500"
                        }`}
                        title={
                        eventInSlot
                          ? `${eventInSlot.title} (${parseUTC(eventInSlot.starts_at).toLocaleTimeString("ru-RU", {
                                hour: "2-digit",
                                minute: "2-digit",
                            })} - ${parseUTC(eventInSlot.ends_at).toLocaleTimeString("ru-RU", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })})`
                          : undefined
                      }
                    >
                      {conflicting ? "конфл." : busy ? "занято" : ""}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {resourceRows.length > 0 && (
            <div
              className="grid items-center gap-1"
              style={{ gridTemplateColumns: templateColumns }}
            >
              <div className="flex flex-col justify-center rounded-2xl border border-lime-200 bg-lime-50 px-3 py-2">
                <p className="text-sm font-semibold text-lime-800">
                  Свободно всем
                </p>
                <p className="text-xs text-lime-700">
                  Переговорка и все выбранные участники доступны одновременно
                </p>
                        </div>
              {timeSlots.map((slot) => {
                const { slotStart, slotEnd } = buildSlotTimes(slot.index);
                const slotBusy = resourceRows.some((row) =>
                  rowHasBusyEvent(row.availability, slotStart, slotEnd),
                );
                const selected =
                  selectionRange.start &&
                  selectionRange.end &&
                  selectionRange.start < slotEnd &&
                  selectionRange.end > slotStart;
                return (
                  <div
                    key={`combined-${slot.index}`}
                    className={`rounded-lg border p-2 text-center text-[0.65rem] font-medium ${
                      slotBusy
                        ? "border-slate-200 bg-slate-100 text-slate-400"
                        : "border-lime-400 bg-lime-100 text-lime-700"
                    } ${selected ? "ring-1 ring-lime-400" : ""}`}
                  >
                    {slotBusy ? "—" : "OK"}
                  </div>
                );
              })}
                          </div>
                        )}
        </div>
      </div>
                      </div>
                    );
}

function ConflictSummary({
  conflicts,
  loading,
  error,
}: {
  conflicts: ConflictEntry[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Конфликты
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Пересечения участников и переговорок
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Анализируем расписание…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : conflicts.length === 0 ? (
        <p className="text-sm text-slate-500">Конфликтов не обнаружено.</p>
      ) : (
        <div className="space-y-3">
          {conflicts.map((conflict, index) => {
            const slotStart = new Date(conflict.slot_start);
            const slotEnd = new Date(conflict.slot_end);
            return (
              <div
                key={`${conflict.type}-${conflict.resource_id ?? "none"}-${index}`}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      {conflict.type === "room" ? "Переговорка" : "Участник"} ·{" "}
                      {conflict.resource_label}
                    </p>
                    <p className="text-xs text-amber-700">
                      {slotStart.toLocaleString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      –{" "}
                      {slotEnd.toLocaleString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                </div>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-amber-700">
                    {conflict.events.length} событ.
                  </span>
              </div>

                <div className="mt-3 space-y-2">
                  {conflict.events.map((event) => {
                    const start = parseUTC(event.starts_at);
                    const end = parseUTC(event.ends_at);
                    return (
                      <div
                        key={event.id}
                        className="rounded-xl border border-white bg-white/70 px-3 py-2 text-sm text-slate-800"
                      >
                        <p className="font-medium">{event.title}</p>
                        <p className="text-xs text-slate-500">
                          {start.toLocaleString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          –{" "}
                          {end.toLocaleString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
          </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserAvailabilityView({
  userId,
  user,
  availability,
  loading,
  error,
  selectedDate,
  onClose,
  onAddToCalendar,
  isMember,
  addToCalendarError,
  addToCalendarLoading,
}: {
  userId: string;
  user: UserProfile | null;
  availability: EventRecord[];
  loading: boolean;
  error: string | null;
  selectedDate: Date;
  onClose: () => void;
  onAddToCalendar: () => void;
  isMember: boolean;
  addToCalendarError: string | null;
  addToCalendarLoading: boolean;
}) {
  const timeSlots = useMemo(() => {
    const totalSlots =
      ((WORKDAY_END_HOUR - WORKDAY_START_HOUR) * 60) / SLOT_DURATION_MINUTES;
    return Array.from({ length: totalSlots }, (_, index) => {
      const totalMinutes =
        WORKDAY_START_HOUR * 60 + index * SLOT_DURATION_MINUTES;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      const label = `${String(hour).padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}`;
      return { index, hour, minute, label };
    });
  }, []);

  const buildSlotTimes = (slotIndex: number) => {
    const slot = timeSlots[slotIndex];
    const slotStart = new Date(selectedDate);
    slotStart.setHours(slot.hour, slot.minute, 0, 0);
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + SLOT_DURATION_MINUTES);
    return { slotStart, slotEnd };
  };

  const rowHasBusyEvent = (slotStart: Date, slotEnd: Date) => {
    return availability.some((event) => {
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      // Сравниваем даты правильно: событие пересекается со слотом, если
      // eventStart < slotEnd && eventEnd > slotStart
      return eventStart < slotEnd && eventEnd > slotStart;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold">
              {user?.full_name || user?.email || "Пользователь"}
            </h3>
            <p className="text-sm text-slate-500">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {!isMember && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800 mb-2">
              Пользователь не имеет доступа к выбранному календарю
            </p>
            {addToCalendarError && (
              <p className="mb-2 text-xs text-red-600">{addToCalendarError}</p>
            )}
            <button
              type="button"
              onClick={onAddToCalendar}
              disabled={addToCalendarLoading}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {addToCalendarLoading ? "Добавляем..." : "Добавить в календарь"}
            </button>
          </div>
        )}

        <div className="mb-4">
          <p className="text-sm font-semibold text-slate-700 mb-2">
            Доступность на {formatDate(selectedDate, { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {error && !error.includes("not a member") && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!isMember && !error && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">
              Чтобы увидеть доступность пользователя, добавьте его в календарь
            </p>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Загружаем доступность...</p>
        ) : (error && error.includes("not a member")) || (!isMember && !loading) ? (
          <p className="text-sm text-slate-500">Доступность недоступна</p>
        ) : error ? (
          <p className="text-sm text-slate-500">Не удалось загрузить доступность</p>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4 overflow-x-auto">
            <div
              className="grid gap-1 text-xs"
              style={{
                gridTemplateColumns: `120px repeat(${timeSlots.length}, minmax(8px, 1fr))`,
              }}
            >
              <div className="text-[0.65rem] uppercase tracking-wide text-slate-400">
                Время
              </div>
              {timeSlots.map((slot) =>
                slot.minute === 0 ? (
                  <div key={slot.index} className="text-[0.65rem] text-slate-500 text-center">
                    {slot.label}
                  </div>
                ) : (
                  <div key={slot.index} />
                ),
              )}
            </div>
            <div
              className="grid gap-1 mt-2"
              style={{
                gridTemplateColumns: `120px repeat(${timeSlots.length}, minmax(8px, 1fr))`,
              }}
            >
              <div className="text-xs text-slate-600">Доступность</div>
              {timeSlots.map((slot) => {
                const { slotStart, slotEnd } = buildSlotTimes(slot.index);
                const busy = rowHasBusyEvent(slotStart, slotEnd);
                return (
                  <div
                    key={slot.index}
                    className={`h-6 rounded border ${
                      busy
                        ? "border-red-200 bg-red-50"
                        : "border-lime-200 bg-lime-50"
                    }`}
                    title={
                      busy
                        ? "Занято"
                        : "Свободно"
                    }
                  />
                );
              })}
            </div>
        </div>
      )}

      {availability.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-700 mb-2">
              События ({availability.length})
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {availability.map((event) => {
                const start = parseUTC(event.starts_at);
                const end = parseUTC(event.ends_at);
                return (
            <div
              key={event.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {event.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {start.toLocaleString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                      –{" "}
                      {end.toLocaleString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
                );
              })}
            </div>
        </div>
      )}
      </div>
    </div>
  );
}

function NotificationCenter({
  notifications,
  loading,
  unreadCount,
  onClose,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onEventClick,
}: {
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  onClose: () => void;
  onMarkAsRead: (notificationId: string) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
  onDelete: (notificationId: string) => Promise<void>;
  onEventClick: (eventId: string) => void;
}) {
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "event_invited":
        return "📨";
      case "event_updated":
        return "✏️";
      case "event_cancelled":
        return "❌";
      case "event_reminder":
        return "⏰";
      default:
        return "🔔";
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "event_invited":
        return "bg-blue-50 border-blue-200";
      case "event_updated":
        return "bg-amber-50 border-amber-200";
      case "event_cancelled":
        return "bg-red-50 border-red-200";
      case "event_reminder":
        return "bg-lime-50 border-lime-200";
      default:
        return "bg-slate-50 border-slate-200";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "только что";
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    if (diffDays < 7) return `${diffDays} дн назад`;
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-[0_20px_80px_rgba(15,23,42,0.35)] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 p-6 flex-shrink-0">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
              Уведомления
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              {unreadCount > 0 ? `${unreadCount} непрочитанных` : "Все прочитано"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllAsRead}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Отметить все прочитанными
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-slate-500">Загружаем уведомления...</p>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-4xl mb-4">🔔</p>
              <p className="text-sm font-semibold text-slate-900">
                Нет уведомлений
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Новые уведомления появятся здесь
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-lg border p-4 transition ${
                    notification.is_read
                      ? "bg-white border-slate-200"
                      : `${getNotificationColor(notification.type)} font-semibold`
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">
                      {getNotificationIcon(notification.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {notification.title}
                          </p>
                          <p className="text-xs text-slate-600 mt-1">
                            {notification.message}
                          </p>
                          <p className="text-[0.65rem] text-slate-400 mt-2">
                            {formatDate(notification.created_at)}
                          </p>
                        </div>
                        {!notification.is_read && (
                          <div className="h-2 w-2 rounded-full bg-lime-500 flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        {notification.event_id && (
                          <button
                            type="button"
                            onClick={() => onEventClick(notification.event_id!)}
                            className="text-xs text-lime-600 hover:text-lime-700 font-semibold"
                          >
                            Открыть событие →
                          </button>
                        )}
                        {!notification.is_read && (
                          <button
                            type="button"
                            onClick={() => onMarkAsRead(notification.id)}
                            className="text-xs text-slate-500 hover:text-slate-700"
                          >
                            Отметить прочитанным
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDelete(notification.id)}
                          className="text-xs text-red-500 hover:text-red-700 ml-auto"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ParticipantStatusItem({
  participant,
  eventId,
  onUpdateStatus,
  canManage,
}: {
  participant: EventParticipant;
  eventId: string;
  onUpdateStatus?: (eventId: string, userId: string, status: string) => Promise<void>;
  canManage: boolean;
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const statusLabels: Record<string, string> = {
    accepted: "Принял",
    declined: "Отклонил",
    tentative: "Возможно",
    needs_action: "Нет ответа",
  };

  const statusColors: Record<string, string> = {
    accepted: "bg-lime-100 text-lime-700 border-lime-300",
    declined: "bg-red-100 text-red-700 border-red-300",
    tentative: "bg-amber-100 text-amber-700 border-amber-300",
    needs_action: "bg-slate-100 text-slate-600 border-slate-300",
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!onUpdateStatus || isUpdating) return;
    setIsUpdating(true);
    try {
      await onUpdateStatus(eventId, participant.user_id, newStatus);
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const currentStatus = participant.response_status || "needs_action";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">
          {participant.full_name || participant.email}
        </p>
        <p className="text-xs text-slate-500 truncate">{participant.email}</p>
      </div>
      {canManage ? (
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={currentStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={isUpdating}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold outline-none transition ${
              statusColors[currentStatus]
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <span
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold flex-shrink-0 ${
            statusColors[currentStatus]
          }`}
        >
          {statusLabels[currentStatus]}
        </span>
      )}
    </div>
  );
}