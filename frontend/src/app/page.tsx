"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

// Утилита для debounce
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

import { useAuth } from "@/context/AuthContext";
import type { Calendar, CalendarMember, CalendarDraft, CalendarRole } from "@/types/calendar.types";
import type { EventRecord, EventDraft, ConflictEntry } from "@/types/event.types";
import type { UserProfile } from "@/types/user.types";
import type { Room } from "@/types/room.types";
import type { ViewMode, PendingMoveContext, RecurrenceRule } from "@/types/common.types";
import { WeekView } from "@/components/calendar/WeekView";
import { MonthView } from "@/components/calendar/MonthView";
import { DayView } from "@/components/calendar/DayView";
import { UpcomingEvents } from "@/components/calendar/UpcomingEvents";
import { ParticipantStatusItem } from "@/components/participants/ParticipantStatusItem";
import { ResourcePanel } from "@/components/rooms/ResourcePanel";
import { EventModalEnhanced as EventModal } from "@/components/events/EventModalEnhanced";
import { MoveSeriesDialog } from "@/components/events/MoveSeriesDialog";
import { UserAvailabilityView } from "@/components/availability/UserAvailabilityView";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { CalendarMembersManager } from "@/components/calendar/CalendarMembersManager";
import { ProfileSettings } from "@/components/profile/ProfileSettings";
import { OrgStructure } from "@/components/organization/OrgStructure";
import { BirthdayReminder } from "@/components/birthdays/BirthdayReminder";
import { TicketTracker } from "@/components/support/TicketTracker";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { AdminNotifications } from "@/components/admin/AdminNotifications";
import { AvailabilitySlotsManager } from "@/components/availability/AvailabilitySlotsManager";
import { useNotifications } from "@/hooks/useNotifications";
import {
  startOfWeek,
  addDays,
  addDaysInMoscow,
  addMonths,
  getMonthGridDays,
  formatDate,
  parseUTC,
  toLocalString,
  toTimeZoneString,
  MOSCOW_TIMEZONE,
  toUTCString,
  toUTCDateISO,
  getTimeInTimeZone,
} from "@/lib/utils/dateUtils";
import {
  API_BASE_URL,
  CALENDAR_ENDPOINT,
  EVENT_ENDPOINT,
  NOTIFICATION_ENDPOINT,
  ROOM_ENDPOINT,
  USERS_ENDPOINT,
  ORGANIZATIONS_ENDPOINT,
  DEPARTMENTS_ENDPOINT,
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
  const [miniCalendarMonth, setMiniCalendarMonth] = useState<Date>(() => {
    const date = new Date();
    date.setDate(1);
    return date;
  });
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
    refresh: notificationsRefresh,
  } = useNotifications();
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [isMembersManagerOpen, setIsMembersManagerOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState<EventDraft>(DEFAULT_EVENT_FORM);
  const [isEventSubmitting, setIsEventSubmitting] = useState(false);
  const [eventFormError, setEventFormError] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [editingRecurrenceInfo, setEditingRecurrenceInfo] = useState<{
    isSeriesParent: boolean;
    isSeriesChild: boolean;
  } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [members, setMembers] = useState<CalendarMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Array<{id: string; name: string; slug: string}>>([]);
  const [departments, setDepartments] = useState<Array<{id: string; name: string}>>([]);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [userOrganization, setUserOrganization] = useState<{logo_url: string | null; primary_color: string | null; secondary_color: string | null; name: string} | null>(null);
  const [currentTime, setCurrentTime] = useState<{local: string; moscow: string}>({local: '', moscow: ''});
  const [showCreateCalendarForm, setShowCreateCalendarForm] = useState(false);

  // Обновление времени каждую секунду
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const localTime = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const moscowTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' })).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setCurrentTime({ local: localTime, moscow: moscowTime });
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);
  const { accessToken, userEmail, logout, refreshAccessToken } = useAuth();
  const isAuthenticated = Boolean(accessToken);
  const router = useRouter();
  
  const [moveDialog, setMoveDialog] = useState<PendingMoveContext | null>(null);
  const [moveScope, setMoveScope] = useState<"single" | "series">("single");
  const [moveSubmitting, setMoveSubmitting] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [selectedUserForView, setSelectedUserForView] = useState<string | null>(null);
  const [userAvailability, setUserAvailability] = useState<EventRecord[]>([]);
  const [userAvailabilityLoading, setUserAvailabilityLoading] = useState(false);
  const [userAvailabilityError, setUserAvailabilityError] = useState<string | null>(null);
  const [showMyAvailability, setShowMyAvailability] = useState(false);
  const [myAvailabilitySchedule, setMyAvailabilitySchedule] = useState<EventRecord[]>([]);
  const [myAvailabilityLoading, setMyAvailabilityLoading] = useState(false);
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
        
        // Если body это FormData, не устанавливаем Content-Type вручную
        // Браузер должен установить его автоматически с правильным boundary
        const isFormData = init.body instanceof FormData;
        if (isFormData) {
          // Удаляем Content-Type если он был установлен, чтобы браузер установил его автоматически
          headers.delete("Content-Type");
        }
        
        try {
          const url = typeof input === "string" ? input : input.toString();
          
          // Используем signal из init, если он передан, иначе делаем обычный запрос без таймаута
          // Таймаут применяется только к конкретным запросам, которые могут быть долгими
          const response = await fetch(input, { 
            ...init, 
            headers,
            mode: "cors",
            credentials: "omit",
          });
          
          return response;
        } catch (error) {
          // Обработка сетевых ошибок (CORS, сеть недоступна и т.д.)
          const url = typeof input === "string" ? input : input.toString();
          
          // Проверяем, является ли это ошибкой сети
          if (error instanceof TypeError) {
            if (error.message === "Failed to fetch" || error.message.includes("fetch")) {
              // Это может быть CORS ошибка или сервер недоступен
              console.error(
                `[API Error] Network error when fetching:\n` +
                `  URL: ${url}\n` +
                `  Error: ${error.message}\n` +
                `  Possible causes:\n` +
                `    1. Backend server is not running on http://localhost:8000\n` +
                `    2. CORS configuration issue\n` +
                `    3. Network connectivity problem\n` +
                `  To fix:\n` +
                `    1. Check if backend is running: http://localhost:8000/api/v1/health\n` +
                `    2. Check browser console for CORS errors\n` +
                `    3. Verify CORS settings in backend/app/core/config.py`
              );
              throw new Error(
                `Не удалось подключиться к серверу. Проверьте:\n` +
                `1. Запущен ли бэкенд на http://localhost:8000\n` +
                `2. Настройки CORS в backend/app/core/config.py\n` +
                `3. Консоль браузера на наличие ошибок CORS\n` +
                `URL: ${url}`
              );
            }
            throw new Error(`Ошибка сети: ${error.message}`);
          }
          
          // Обработка ошибки отмены запроса (может быть из-за таймаута браузера или явной отмены)
          if (error instanceof Error && error.name === "AbortError") {
            console.error(`[API Error] Request aborted for: ${url}`);
            throw new Error(`Запрос был прерван. URL: ${url}`);
          }
          
          if (error instanceof Error) {
            throw error;
          }
          
          throw new Error(`Неизвестная ошибка: ${String(error)}`);
        }
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

  const loadCurrentUser = useCallback(async () => {
    if (!accessToken) {
      setCurrentUser(null);
      setUserOrganization(null);
      return;
    }
    try {
      const response = await authFetch(`${USERS_ENDPOINT}me`, { cache: "no-store" });
      if (response.ok) {
        const data: UserProfile = await response.json();
        setCurrentUser(data);
        
        // Загружаем информацию об организации если есть
        if (data.organization_id) {
          try {
            const orgResponse = await authFetch(`${ORGANIZATIONS_ENDPOINT}/${data.organization_id}`, { cache: "no-store" });
            if (orgResponse.ok) {
              const orgData = await orgResponse.json();
              setUserOrganization(orgData);
            }
          } catch (err) {
            console.error("Failed to load organization:", err);
          }
        } else {
          setUserOrganization(null);
        }
      }
    } catch (err) {
      console.error("Failed to load current user:", err);
    }
  }, [accessToken, authFetch]);

  const loadOrganizations = useCallback(async () => {
    if (!accessToken) {
      setOrganizations([]);
      return;
    }
    try {
      const response = await authFetch(ORGANIZATIONS_ENDPOINT, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setOrganizations(data);
      } else {
        console.error("Ошибка загрузки организаций:", response.status, response.statusText);
        const errorData = await response.json().catch(() => ({}));
        console.error("Детали ошибки:", errorData);
      }
    } catch (err) {
      console.error("Failed to load organizations:", err);
    }
  }, [accessToken, authFetch]);

  const loadDepartments = useCallback(async () => {
    if (!accessToken) {
      setDepartments([]);
      return;
    }
    
    // Загружаем отделы только если у пользователя есть доступ к оргструктуре
    // или если это админ/ИТ (для проверки принадлежности к ИТ отделу)
    if (currentUser && !currentUser.access_org_structure && currentUser.role !== "admin" && currentUser.role !== "it") {
      setDepartments([]);
      return;
    }
    
    try {
      const response = await authFetch(DEPARTMENTS_ENDPOINT, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        // Функция для рекурсивного извлечения всех отделов из дерева
        const flatten = (depts: any[]): Array<{id: string; name: string}> => {
          const result: Array<{id: string; name: string}> = [];
          depts.forEach((d) => {
            result.push({ id: d.id, name: d.name });
            if (d.children?.length) {
              result.push(...flatten(d.children));
            }
          });
          return result;
        };
        setDepartments(flatten(data));
      } else if (response.status === 403) {
        // 403 - нормальная ситуация, если у пользователя нет прав доступа
        setDepartments([]);
      } else {
        console.error("Ошибка загрузки отделов:", response.status, response.statusText);
      }
    } catch (err) {
      // Игнорируем ошибки загрузки отделов, если у пользователя нет прав
      if (currentUser && !currentUser.access_org_structure) {
        setDepartments([]);
        return;
      }
      console.error("Failed to load departments:", err);
    }
  }, [accessToken, authFetch, currentUser]);

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

  // Функция для получения сокращения организации по slug
  const getOrganizationAbbreviation = useCallback((slug: string | null | undefined): string => {
    if (!slug) return "";
    const slugLower = slug.toLowerCase();
    if (slugLower.includes("корстоун") || slugLower.includes("corstone")) return "CS";
    if (slugLower.includes("электрон") || slugLower.includes("electron")) return "EX";
    if (slugLower.includes("ктб") || slugLower.includes("ktb")) return "KTB";
    return "";
  }, []);

  // Функция для получения сокращения организации пользователя по его organization_id
  const getUserOrganizationAbbreviation = useCallback((userId: string | null | undefined): string => {
    if (!userId) return "";
    const user = users.find(u => u.id === userId);
    if (!user || !user.organization_id) return "";
    const org = organizations.find(o => o.id === user.organization_id);
    if (!org) return "";
    return getOrganizationAbbreviation(org.slug);
  }, [users, organizations, getOrganizationAbbreviation]);

  useEffect(() => {
    if (isAuthenticated) {
      loadUsers();
      loadCurrentUser();
      loadOrganizations();
    }
  }, [isAuthenticated, loadUsers, loadCurrentUser, loadOrganizations]);

  // Загружаем отделы только если у пользователя есть права доступа
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      // Загружаем отделы только если есть доступ к оргструктуре или это админ/ИТ
      if (currentUser.access_org_structure || currentUser.role === "admin" || currentUser.role === "it") {
        loadDepartments();
      } else {
        // Если нет прав, просто очищаем список отделов
        setDepartments([]);
      }
    }
  }, [isAuthenticated, currentUser, loadDepartments]);

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
    // Проверяем, что выбранный календарь все еще доступен
    if (selectedCalendarId && calendars.length > 0) {
      const calendarExists = calendars.some((c) => c.id === selectedCalendarId);
      if (!calendarExists) {
        // Если выбранный календарь больше не доступен, выбираем первый доступный
        setSelectedCalendarId(calendars[0].id);
      }
    }
  }, [calendars, selectedCalendarId]);

  const selectedCalendar = calendars.find(
    (calendar) => calendar.id === selectedCalendarId,
  );
  const selectedRole = selectedCalendar?.current_user_role ?? null;
  // Все участники календаря (viewer, editor, owner) могут создавать события
  const canManageEvents = selectedRole !== null; // Любая роль позволяет создавать события

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekEnd = useMemo(() => addDaysInMoscow(weekStart, 7), [weekStart]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, idx) => addDaysInMoscow(weekStart, idx)),
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

  const dayStart = useMemo(() => {
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [selectedDate]);
  
  const dayEnd = useMemo(() => {
    const d = new Date(selectedDate);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [selectedDate]);
  
  const rangeStart = viewMode === "day" ? dayStart : viewMode === "week" ? weekStart : monthGridStart;
  const rangeEnd = viewMode === "day" ? dayEnd : viewMode === "week" ? weekEnd : monthGridEnd;


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
      console.log("[Events] No access token, skipping load");
      setEvents([]);
      return;
    }
    console.log("[Events] Loading events...", {
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      selectedCalendarId,
      viewMode,
    });
    setEventsLoading(true);
    setEventsError(null);
    try {
      const url = new URL(EVENT_ENDPOINT);
      // Не фильтруем по calendar_id, чтобы получить все доступные события
      // (включая события, где пользователь является участником, но не имеет доступа к календарю)
      // Backend уже правильно фильтрует события
      url.searchParams.set("from", rangeStart.toISOString());
      url.searchParams.set("to", rangeEnd.toISOString());
      
      console.log("[Events] Fetching from:", url.toString());
      const response = await authFetch(url.toString(), { 
        cache: "no-store",
      });
      
      console.log("[Events] Response status:", response.status, response.ok);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        console.error("[Events] Error response:", response.status, errorText);
        throw new Error(`Не удалось получить события: ${response.status} ${errorText}`);
      }
      const data: EventRecord[] = await response.json();
      console.log("[Events] Loaded events:", data.length, data);
      // Если выбран календарь, показываем события из этого календаря
      // ИЛИ события, где пользователь является участником (даже если они в другом календаре)
      let filteredEvents = selectedCalendarId
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
      
      // Фильтруем отклоненные события для текущего пользователя
      // Если пользователь отклонил событие, оно не должно отображаться в его календаре
      if (userEmail) {
        filteredEvents = filteredEvents.filter((e) => {
          // Если пользователь является участником события
          if (e.participants) {
            const userParticipant = e.participants.find((p) => p.email === userEmail);
            // Если пользователь отклонил событие, скрываем его
            if (userParticipant && userParticipant.response_status === "declined") {
              return false;
            }
          }
          return true;
        });
      }
      
      console.log("[Events] Filtered events:", filteredEvents.length, filteredEvents);
      setEvents(filteredEvents);
      setEventsError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Ошибка получения событий";
      console.error("[Events] Load error:", err);
      setEventsError(errorMessage);
    } finally {
      setEventsLoading(false);
      console.log("[Events] Loading finished");
    }
  }, [selectedCalendarId, rangeStart, rangeEnd, accessToken, authFetch, userEmail]);

  // Debounced refresh для событий при получении уведомлений
  const debouncedLoadEventsRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedLoadEvents = useCallback(() => {
    if (debouncedLoadEventsRef.current) {
      clearTimeout(debouncedLoadEventsRef.current);
    }
    debouncedLoadEventsRef.current = setTimeout(() => {
      if (accessToken) {
        loadEvents();
      }
    }, 800); // 800ms задержка для группировки множественных обновлений
  }, [accessToken, loadEvents]);

  // Отслеживаем уведомления о событиях и обновляем календарь
  useEffect(() => {
    if (!accessToken || !notifications.length) {
      return;
    }
    
    // Проверяем, есть ли новые уведомления о событиях
    const eventNotifications = notifications.filter(
      (n) => n.type === "event_invited" || n.type === "event_updated" || n.type === "event_cancelled"
    );
    
    if (eventNotifications.length > 0) {
      // Debounced refresh - обновляем события через 800ms после получения уведомления
      debouncedLoadEvents();
    }
  }, [notifications, debouncedLoadEvents, accessToken]);

  // Polling для событий - надежный механизм для 300+ пользователей
  useEffect(() => {
    if (!accessToken) {
      return;
    }
    
    // Загружаем события сразу
    loadEvents();
    
    // Polling каждые 12 секунд - оптимально для 300 пользователей
    // Это обеспечивает быструю синхронизацию без перегрузки сервера
    // При 300 пользователях: 300 запросов / 12 сек = 25 запросов/сек (вполне приемлемо)
    const interval = setInterval(() => {
      if (accessToken) {
        loadEvents();
      }
    }, 12000); // 12 секунд - оптимальный баланс между скоростью и нагрузкой
    
    return () => {
      clearInterval(interval);
      if (debouncedLoadEventsRef.current) {
        clearTimeout(debouncedLoadEventsRef.current);
      }
    };
  }, [accessToken, loadEvents]);


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
        // Если ошибка доступа (403), просто возвращаем пустой список
        // Это нормально, если пользователь не имеет доступа к списку участников
        if (response.status === 403 || response.status === 404) {
          console.warn("User doesn't have access to calendar members list, skipping");
          setMembers([]);
          return;
        }
        throw new Error("Не удалось загрузить участников");
      }
      const data: CalendarMember[] = await response.json();
      setMembers(data);
    } catch (err) {
      setMembers([]);
      // Не показываем ошибку, если это проблема доступа
      if (err instanceof Error && err.message.includes("403")) {
        console.warn("User doesn't have access to calendar members list, skipping");
        setMembersError(null);
      } else {
        setMembersError(
          err instanceof Error
            ? err.message
            : "Ошибка загрузки списка участников",
        );
      }
    } finally {
      setMembersLoading(false);
    }
  }, [selectedCalendarId, accessToken, authFetch]);

  useEffect(() => {
    loadCalendarMembers();
  }, [loadCalendarMembers]);

  // Синхронизируем месяц мини-календаря с выбранной датой
  useEffect(() => {
    const newMonth = new Date(selectedDate);
    newMonth.setDate(1);
    setMiniCalendarMonth(newMonth);
  }, [selectedDate]);

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
      // Загружаем доступность для любого пользователя, не только для членов календаря
      // Backend позволяет проверять доступность любого пользователя
      loadUserAvailability(selectedUserForView);
    } else {
      setUserAvailability([]);
      setUserAvailabilityError(null);
    }
  }, [selectedUserForView, loadUserAvailability]);

  // Загружаем расписание доступности текущего пользователя для отображения в календаре
  const loadMyAvailabilitySchedule = useCallback(async () => {
    if (!selectedCalendarId || !currentUser?.id || !showMyAvailability) {
      setMyAvailabilitySchedule([]);
      return;
    }
    
    setMyAvailabilityLoading(true);
    try {
      // Определяем диапазон в зависимости от режима просмотра
      let rangeStart: Date;
      let rangeEnd: Date;
      
      if (viewMode === "month") {
        // Для месяца - весь месяц
        rangeStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        rangeStart.setHours(0, 0, 0, 0);
        rangeEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
        rangeEnd.setHours(23, 59, 59, 999);
      } else {
        // Для недели - неделя
        rangeStart = new Date(weekStart);
        rangeStart.setHours(0, 0, 0, 0);
        rangeEnd = new Date(weekStart);
        rangeEnd.setDate(rangeEnd.getDate() + 6);
        rangeEnd.setHours(23, 59, 59, 999);
      }
      
      const fromStr = rangeStart.toISOString();
      const toStr = rangeEnd.toISOString();
      
      // Загружаем расписание доступности
      const availabilityUrl = `${CALENDAR_ENDPOINT}${selectedCalendarId}/members/${currentUser.id}/availability?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`;
      const availabilityResponse = await authFetch(availabilityUrl, { 
        cache: "no-store",
      });
      
      let unavailableEvents: EventRecord[] = [];
      if (availabilityResponse.ok) {
        const data: EventRecord[] = await availabilityResponse.json();
        // Фильтруем только события с status="unavailable" (расписание доступности)
        unavailableEvents = data.filter(event => event.status === "unavailable");
      } else {
        console.error("Failed to load availability schedule:", availabilityResponse.status);
      }
      
      // Загружаем забронированные availability slots
      let bookedSlotsEvents: EventRecord[] = [];
      try {
        const { AVAILABILITY_SLOTS_ENDPOINT } = await import("@/lib/constants");
        const slotsUrl = `${AVAILABILITY_SLOTS_ENDPOINT}?my_slots_only=true&status=booked&from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`;
        const slotsResponse = await authFetch(slotsUrl, { cache: "no-store" });
        
        if (slotsResponse.ok) {
          interface AvailabilitySlot {
            id: string;
            user_id: string;
            process_name: string;
            starts_at: string;
            ends_at: string;
            description?: string;
            status: "available" | "booked" | "cancelled";
            booked_by_user_name?: string;
            booked_by_user_email?: string;
          }
          
          const slots: AvailabilitySlot[] = await slotsResponse.json();
          
          // Преобразуем забронированные слоты в формат EventRecord
          bookedSlotsEvents = slots.map(slot => ({
            id: slot.id,
            calendar_id: selectedCalendarId,
            room_id: null,
            title: `Забронирован слот: ${slot.process_name}${slot.booked_by_user_name ? ` (${slot.booked_by_user_name})` : ''}`,
            description: slot.description || `Забронированный слот для процесса "${slot.process_name}"${slot.booked_by_user_name ? ` пользователем ${slot.booked_by_user_name}` : ''}`,
            location: null,
            timezone: "Europe/Moscow",
            starts_at: slot.starts_at,
            ends_at: slot.ends_at,
            all_day: false,
            status: "booked_slot", // Специальный статус для забронированных слотов
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            participants: [],
            recurrence_rule: null,
            recurrence_parent_id: null,
            attachments: [],
            department_color: null,
            room_online_meeting_url: null,
          }));
        }
      } catch (slotsErr) {
        console.error("Failed to load booked availability slots:", slotsErr);
        // Не критично, продолжаем без них
      }
      
      // Объединяем расписание доступности и забронированные слоты
      setMyAvailabilitySchedule([...unavailableEvents, ...bookedSlotsEvents]);
    } catch (err) {
      console.error("Failed to load my availability schedule:", err);
      setMyAvailabilitySchedule([]);
    } finally {
      setMyAvailabilityLoading(false);
    }
  }, [selectedCalendarId, currentUser?.id, showMyAvailability, selectedDate, viewMode, weekStart, authFetch]);

  // Debounce для загрузки расписания доступности, чтобы не делать запросы слишком часто
  const debouncedLoadMyAvailabilityScheduleRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Очищаем предыдущий таймаут
    if (debouncedLoadMyAvailabilityScheduleRef.current) {
      clearTimeout(debouncedLoadMyAvailabilityScheduleRef.current);
    }
    
    if (showMyAvailability && selectedCalendarId && currentUser?.id) {
      // Debounce загрузку на 500ms
      debouncedLoadMyAvailabilityScheduleRef.current = setTimeout(() => {
        loadMyAvailabilitySchedule();
      }, 500);
    } else {
      setMyAvailabilitySchedule([]);
    }
    
    return () => {
      if (debouncedLoadMyAvailabilityScheduleRef.current) {
        clearTimeout(debouncedLoadMyAvailabilityScheduleRef.current);
      }
    };
  }, [showMyAvailability, selectedCalendarId, currentUser?.id, selectedDate, viewMode, weekStart, loadMyAvailabilitySchedule]);

  const ensureMembership = useCallback(
    async (userId: string) => {
      if (!selectedCalendarId) {
        throw new Error("Сначала выберите календарь");
      }
      // Editor и owner могут добавлять участников в календарь
      if (selectedRole !== "owner" && selectedRole !== "editor") {
        throw new Error("Только владелец или редактор календаря может добавлять участников");
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
    startDateStr?: string,
    endDateStr?: string,
  ) => {
    if (!canManageEvents && !event) {
      return;
    }
    if (event) {
      const start = parseUTC(event.starts_at);
      const end = parseUTC(event.ends_at);
      // Конвертируем в московское время для отображения в форме
      // Используем getTimeInTimeZone для получения компонентов в московском времени
      const startMoscow = getTimeInTimeZone(start, MOSCOW_TIMEZONE);
      const endMoscow = getTimeInTimeZone(end, MOSCOW_TIMEZONE);
      const pad = (n: number) => String(n).padStart(2, '0');
      const startsAtLocal = `${startMoscow.year}-${pad(startMoscow.month + 1)}-${pad(startMoscow.day)}T${pad(startMoscow.hour)}:${pad(startMoscow.minute)}`;
      const endsAtLocal = `${endMoscow.year}-${pad(endMoscow.month + 1)}-${pad(endMoscow.day)}T${pad(endMoscow.hour)}:${pad(endMoscow.minute)}`;
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
      // startTime и endTime уже созданы в московском времени в WeekView/DayView
      // Если они не переданы, создаем их как московское время
      let startsAtLocal: string;
      let endsAtLocal: string;
      
      if (startTime && endTime) {
        // startTime и endTime уже в московском времени (созданы с +03:00)
        // Используем toISOString() и парсим его, чтобы получить компоненты в UTC,
        // затем конвертируем обратно в московское время для правильного отображения
        // Но проще - использовать getTimeInTimeZone, который правильно интерпретирует Date
        const startMoscow = getTimeInTimeZone(startTime, MOSCOW_TIMEZONE);
        const endMoscow = getTimeInTimeZone(endTime, MOSCOW_TIMEZONE);
        const pad = (n: number) => String(n).padStart(2, '0');
        // Используем компоненты напрямую из московского времени
        startsAtLocal = `${startMoscow.year}-${pad(startMoscow.month + 1)}-${pad(startMoscow.day)}T${pad(startMoscow.hour)}:${pad(startMoscow.minute)}`;
        endsAtLocal = `${endMoscow.year}-${pad(endMoscow.month + 1)}-${pad(endMoscow.day)}T${pad(endMoscow.hour)}:${pad(endMoscow.minute)}`;
      } else {
        // Создаем время по умолчанию в московском времени
        const date = initialDate || selectedDate;
        const dateMoscow = getTimeInTimeZone(date, MOSCOW_TIMEZONE);
        const pad = (n: number) => String(n).padStart(2, '0');
        startsAtLocal = `${dateMoscow.year}-${pad(dateMoscow.month + 1)}-${pad(dateMoscow.day)}T09:00`;
        endsAtLocal = `${dateMoscow.year}-${pad(dateMoscow.month + 1)}-${pad(dateMoscow.day)}T10:00`;
      }

      setEventForm({
        title: "",
        description: "",
        location: "",
        room_id: null,
        starts_at: startsAtLocal,
        ends_at: endsAtLocal,
        participant_ids: currentUser?.id ? [currentUser.id] : [], // Автор добавляется по умолчанию
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
    
    // Сохраняем текущие временные файлы перед созданием события
    const filesToUploadAfterCreation = [...pendingFiles];
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
      
      // Конвертируем локальное время в UTC
      startsAtUTC = toUTCString(eventForm.starts_at);
      endsAtUTC = toUTCString(eventForm.ends_at);

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

      // Оптимистичное обновление - сразу добавляем/обновляем событие в UI
      let optimisticEvent: EventRecord | null = null;
      if (!editingEventId) {
        // Создание нового события - создаем временный объект для оптимистичного обновления
        const tempId = `temp-${Date.now()}`;
        optimisticEvent = {
          id: tempId,
          title: payload.title as string,
          description: (payload.description as string) || "",
          location: (payload.location as string) || "",
          starts_at: payload.starts_at as string,
          ends_at: payload.ends_at as string,
          calendar_id: payload.calendar_id as string,
          room_id: (payload.room_id as string) || null,
          recurrence_rule: payload.recurrence_rule || null,
          recurrence_parent_id: null,
          participants: (payload.participant_ids as string[] | null)?.map((id) => ({
            user_id: id,
            email: users.find((u) => u.id === id)?.email || "",
            full_name: users.find((u) => u.id === id)?.full_name || null,
            response_status: "needs_action" as const,
          })) || [],
        } as EventRecord;
        
        // Добавляем событие в список оптимистично
        setEvents((prev) => {
          // Проверяем, нет ли уже такого события
          if (prev.some((e) => e.id === optimisticEvent!.id)) {
            return prev;
          }
          return [...prev, optimisticEvent!];
        });
      } else {
        // Обновление существующего события - оптимистично обновляем
        setEvents((prev) =>
          prev.map((e) => {
            if (e.id === editingEventId) {
              const recurrenceRule = payload.recurrence_rule 
                ? (payload.recurrence_rule as RecurrenceRule)
                : null;
              return {
                ...e,
                title: payload.title as string,
                description: (payload.description as string) || "",
                location: (payload.location as string) || "",
                starts_at: payload.starts_at as string,
                ends_at: payload.ends_at as string,
                room_id: (payload.room_id as string) || null,
                recurrence_rule: recurrenceRule,
              };
            }
            return e;
          }),
        );
      }

      const response = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // Откатываем оптимистичное обновление при ошибке
        if (optimisticEvent) {
          setEvents((prev) => prev.filter((e) => e.id !== optimisticEvent!.id));
        } else {
          // Перезагружаем события для отката изменений
          await loadEvents();
        }
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || 
          (editingEventId ? "Не удалось обновить событие" : "Не удалось создать событие");
        
        // Если ошибка доступа, проверяем, может ли пользователь работать с этим календарем
        if (response.status === 403) {
          // Перезагружаем календари, чтобы убедиться, что список актуален
          await loadCalendars();
          throw new Error("Нет доступа к календарю. Возможно, доступ был отозван.");
        }
        
        throw new Error(errorMessage);
      }

      const createdEvent: EventRecord = await response.json();
      
      // Если это бронирование слота, автоматически бронируем слот
      if (bookingSlotId && !editingEventId) {
        try {
          const { AVAILABILITY_SLOTS_ENDPOINT } = await import("@/lib/constants");
          await authFetch(`${AVAILABILITY_SLOTS_ENDPOINT}${bookingSlotId}/book`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              calendar_id: selectedCalendarId,
              title: payload.title as string,
              description: (payload.description as string) || undefined,
              participant_ids: (payload.participant_ids as string[]) || [],
            }),
          });
          setBookingSlotId(null);
        } catch (err) {
          console.error("Failed to book slot:", err);
          // Не прерываем создание события, если бронирование слота не удалось
        }
      }
      
      // Заменяем оптимистичное событие на реальное
      if (optimisticEvent) {
        setEvents((prev) =>
          prev.map((e) => (e.id === optimisticEvent!.id ? createdEvent : e)),
        );
      }

      // Перезагружаем события для синхронизации
      await loadEvents();
      
      // Загружаем временные файлы, если они были выбраны до создания события
      if (filesToUploadAfterCreation.length > 0 && createdEvent.id) {
        // Загружаем файлы асинхронно, не блокируя создание события
        (async () => {
          try {
            for (const file of filesToUploadAfterCreation) {
              const formData = new FormData();
              formData.append("file", file);

              const uploadResponse = await authFetch(
                `${EVENT_ENDPOINT}${createdEvent.id}/attachments`,
                {
                  method: "POST",
                  body: formData,
                }
              );

              if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json().catch(() => ({}));
                console.error(`Не удалось загрузить файл ${file.name}:`, errorData.detail || uploadResponse.statusText);
              }
            }
            // Очищаем временные файлы после загрузки
            setPendingFiles([]);
            // Перезагружаем события для отображения загруженных файлов
            await loadEvents();
          } catch (err) {
            console.error("Ошибка загрузки временных файлов:", err);
            // Не блокируем создание события из-за ошибки загрузки файлов
          }
        })();
      }
      
      // Закрываем модальное окно после создания события
      setIsEventModalOpen(false);
      setEditingEventId(null);
      setEditingRecurrenceInfo(null);
      setPendingFiles([]);
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

  // Проверка принадлежности к ИТ отделу
  const isInITDepartment = useMemo(() => {
    if (!currentUser || !departments.length) return false;
    
    const userDeptIds = currentUser.department_ids || (currentUser.department_id ? [currentUser.department_id] : []);
    if (!userDeptIds.length) return false;
    
    // Проверяем, есть ли среди отделов пользователя отдел с названием, содержащим "ИТ" или "IT"
    return userDeptIds.some(deptId => {
      const dept = departments.find(d => d.id === deptId);
      if (!dept || !dept.name) return false;
      const deptNameLower = dept.name.toLowerCase();
      return deptNameLower.includes("ит") || deptNameLower.includes("it");
    });
  }, [currentUser, departments]);

  // Фильтруем режимы просмотра на основе прав доступа пользователя
  const availableViewModes = useMemo(() => {
    const allModes: ViewMode[] = ["day", "week", "month"];
    
    // Добавляем "availability-slots" только если есть доступ
    if (currentUser?.access_availability_slots) {
      allModes.push("availability-slots");
    }
    
    // Добавляем "org" только если есть доступ к оргструктуре
    if (currentUser?.access_org_structure) {
      allModes.push("org");
    }
    
    // Добавляем "support" только если есть доступ к тикетам
    if (currentUser?.access_tickets) {
      allModes.push("support");
    }
    
    // Добавляем "admin" если пользователь админ, имеет роль "it" или находится в ИТ отделе
    if (currentUser?.role === "admin" || currentUser?.role === "it" || isInITDepartment) {
      allModes.push("admin");
    }
    
    return allModes;
  }, [currentUser, isInITDepartment]);

  // Автоматически переключаем на доступный режим, если текущий недоступен
  useEffect(() => {
    if (isAuthenticated && currentUser && !availableViewModes.includes(viewMode)) {
      // Переключаем на первый доступный режим (обычно "week")
      setViewMode(availableViewModes[0] || "week");
    }
  }, [isAuthenticated, currentUser, availableViewModes, viewMode]);

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
      {/* Админские уведомления - toast в правом верхнем углу */}
      <AdminNotifications authFetch={authFetch} />
      <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-3 px-4 py-3">
        <header 
          className="relative overflow-hidden rounded-xl border border-slate-200/50 backdrop-blur-sm px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex-shrink-0"
          style={{
            background: userOrganization?.primary_color 
              ? `linear-gradient(to right, ${userOrganization.primary_color}15, ${userOrganization.secondary_color || userOrganization.primary_color}08, ${userOrganization.primary_color}15)`
              : "linear-gradient(to right, white, rgb(248 250 252 / 0.5), white)",
          }}
        >
          {/* Декоративный градиент */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              background: userOrganization?.primary_color
                ? `linear-gradient(to right, ${userOrganization.primary_color}08, ${userOrganization.secondary_color || userOrganization.primary_color}05, ${userOrganization.primary_color}08)`
                : "linear-gradient(to right, rgb(132 204 22 / 0.05), rgb(16 185 129 / 0.05), rgb(132 204 22 / 0.05))",
            }}
          />
          
          <div className="relative flex items-center justify-between gap-3">
            {/* Левая часть - Логотип и название */}
            <div className="flex items-center gap-3 min-w-0">
              {userOrganization?.logo_url ? (
                <img
                  src={userOrganization.logo_url.startsWith('http') ? userOrganization.logo_url : `${API_BASE_URL.replace('/api/v1', '')}${userOrganization.logo_url.startsWith('/') ? '' : '/'}${userOrganization.logo_url}`}
                  alt={userOrganization.name}
                  className="h-8 w-8 rounded-lg object-cover shadow-sm"
                />
              ) : (
                <div 
                  className="flex items-center justify-center w-8 h-8 rounded-lg shadow-sm"
                  style={{
                    background: userOrganization?.primary_color
                      ? `linear-gradient(to bottom right, ${userOrganization.primary_color}, ${userOrganization.secondary_color || userOrganization.primary_color})`
                      : "linear-gradient(to bottom right, rgb(132 204 22), rgb(16 185 129))",
                  }}
                >
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <h1 
                  className="text-sm font-bold truncate"
                  style={{
                    color: userOrganization?.primary_color || "rgb(15 23 42)",
                  }}
                >
                  {userOrganization?.name || "Планировщик Corestone"}
                </h1>
              </div>
            </div>

            {/* Правая часть - Статистика и действия */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Часы времени */}
              {false && (
                <div className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/60 px-3 py-1.5 shadow-sm backdrop-blur-sm animate-fadeIn">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex flex-col">
                    <span className="text-[0.65rem] font-medium text-blue-600/70 leading-tight">Локальное</span>
                    <span className="text-xs font-bold text-blue-700 tabular-nums">{currentTime.local}</span>
                  </div>
                </div>
              )}
              {true && (
                <div className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200/60 px-3 py-1.5 shadow-sm backdrop-blur-sm animate-fadeIn">
                  <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex flex-col">
                    <span className="text-[0.65rem] font-medium text-purple-600/70 leading-tight">Москва</span>
                    <span className="text-xs font-bold text-purple-700 tabular-nums">{currentTime.moscow}</span>
                  </div>
                </div>
              )}
              {/* Блоки статистики */}
              <div className="flex items-center gap-1">
                <div className="group relative">
                  <button
                    type="button"
                    onClick={() => setIsProfileSettingsOpen(true)}
                    className="flex items-center gap-2.5 rounded-lg bg-white/60 backdrop-blur-sm border border-slate-200/60 px-4 py-1.5 hover:bg-white/80 transition-all cursor-pointer max-w-[200px]"
                  >
                    {currentUser?.avatar_url ? (
                      <img
                        src={(() => {
                          const avatarUrl = currentUser.avatar_url!;
                          if (avatarUrl.startsWith('http')) {
                            return avatarUrl;
                          }
                          const baseUrl = API_BASE_URL.replace('/api/v1', '');
                          const fullUrl = `${baseUrl}${avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`}`;
                          return fullUrl;
                        })()}
                        alt={currentUser.full_name || "Пользователь"}
                        className="w-6 h-6 rounded-full object-cover flex-shrink-0 border border-slate-200"
                        onError={(e) => {
                          const avatarUrl = currentUser.avatar_url!;
                          const baseUrl = API_BASE_URL.replace('/api/v1', '');
                          const fullUrl = `${baseUrl}${avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`}`;
                          console.error('Avatar load error:', avatarUrl, 'Full URL:', fullUrl);
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                        onLoad={() => {
                          console.log('Avatar loaded successfully');
                        }}
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center flex-shrink-0">
                        <span className="text-[0.7rem] font-semibold text-white">
                          {(currentUser?.full_name || userEmail || "U")[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <span className="text-sm font-semibold text-slate-700 truncate">
                      {currentUser?.full_name || userEmail?.split("@")[0] || "Пользователь"}
                    </span>
                    <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                  <div className="absolute top-full right-0 mt-1 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    Настройки профиля
                  </div>
                </div>
              </div>

              {/* Кнопка выхода */}
              <button
                type="button"
                onClick={handleManualLogout}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-slate-100 to-slate-50 border border-slate-200/60 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:from-slate-200 hover:to-slate-100 hover:shadow-sm active:scale-95 whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Выйти</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-3 lg:flex-row overflow-hidden min-h-0 relative">
          {/* Правая панель с иконками для переключения режимов */}
          <div className="fixed right-4 top-1/2 -translate-y-1/2 z-[100] flex flex-col gap-2">
            {availableViewModes.map((mode) => {
              const isActive = viewMode === mode;
              const getIcon = () => {
                switch (mode) {
                  case "day":
                    return (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    );
                  case "week":
                    return (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-4 4h4M6 7h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2z" />
                      </svg>
                    );
                  case "month":
                    return (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    );
                  case "org":
                    return (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    );
                  case "support":
                    return (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    );
                  case "admin":
                    return (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    );
                  case "availability-slots":
                    return (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h6m-6 4h6m-2 4h2" />
                      </svg>
                    );
                  default:
                    return null;
                }
              };
              
              const getLabel = () => {
                switch (mode) {
                  case "day": return "День";
                  case "week": return "Неделя";
                  case "month": return "Месяц";
                  case "org": return "Оргструктура";
                  case "support": return "Техподдержка";
                  case "admin": return "Админ";
                  case "availability-slots": return "Предложения слотов";
                  default: return mode;
                }
              };
              
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`
                    group relative
                    w-12 h-12 rounded-xl
                    flex items-center justify-center
                    transition-all duration-200
                    ${isActive 
                      ? "bg-lime-500 text-white shadow-lg shadow-lime-500/50 scale-105" 
                      : "bg-white/80 backdrop-blur-sm border border-slate-200 text-slate-600 hover:bg-white hover:shadow-md hover:scale-105"
                    }
                  `}
                  title={getLabel()}
                >
                  {getIcon()}
                  {/* Tooltip */}
                  <div className="absolute right-full mr-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                    {getLabel()}
                  </div>
                </button>
              );
            })}
          </div>
          
          <aside className="order-2 flex w-full flex-col gap-3 lg:order-1 lg:w-[345px] lg:flex-shrink-0 overflow-y-auto">
            {/* Мини-календарь - перемещен наверх */}
            <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <h2 className="text-sm font-bold text-slate-900">Календарь</h2>
                </div>
              </div>

              {(() => {

                const getDaysInMonth = (date: Date) => {
                  const year = date.getFullYear();
                  const month = date.getMonth();
                  const firstDay = new Date(year, month, 1);
                  const lastDay = new Date(year, month + 1, 0);
                  const daysInMonth = lastDay.getDate();
                  const startingDayOfWeek = firstDay.getDay();
                  
                  const days: Array<{ date: Date; isCurrentMonth: boolean; hasEvents: boolean; eventCount: number }> = [];
                  
                  // Функция для нормализации даты (только год, месяц, день)
                  const normalizeDate = (d: Date): string => {
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                  };
                  
                  // Добавляем дни предыдущего месяца для заполнения первой недели
                  const prevMonth = new Date(year, month - 1, 0);
                  const daysInPrevMonth = prevMonth.getDate();
                  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
                    const date = new Date(year, month - 1, daysInPrevMonth - i);
                    const dateStr = normalizeDate(date);
                    const dayEvents = events.filter(e => {
                      // Пропускаем события расписания доступности (unavailable, available)
                      if (e.status === "unavailable" || e.status === "available") {
                        return false;
                      }
                      const eventDate = new Date(e.starts_at);
                      const eventDateStr = normalizeDate(eventDate);
                      return eventDateStr === dateStr;
                    });
                    days.push({
                      date,
                      isCurrentMonth: false,
                      hasEvents: dayEvents.length > 0,
                      eventCount: dayEvents.length,
                    });
                  }
                  
                  // Добавляем дни текущего месяца
                  for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(year, month, day);
                    const dateStr = normalizeDate(date);
                    const dayEvents = events.filter(e => {
                      // Пропускаем события расписания доступности (unavailable, available)
                      if (e.status === "unavailable" || e.status === "available") {
                        return false;
                      }
                      const eventDate = new Date(e.starts_at);
                      const eventDateStr = normalizeDate(eventDate);
                      return eventDateStr === dateStr;
                    });
                    days.push({
                      date,
                      isCurrentMonth: true,
                      hasEvents: dayEvents.length > 0,
                      eventCount: dayEvents.length,
                    });
                  }
                  
                  // Добавляем дни следующего месяца для заполнения последней недели
                  const remainingDays = 42 - days.length; // 6 недель * 7 дней
                  for (let day = 1; day <= remainingDays; day++) {
                    const date = new Date(year, month + 1, day);
                    const dateStr = normalizeDate(date);
                    const dayEvents = events.filter(e => {
                      // Пропускаем события расписания доступности (unavailable, available)
                      if (e.status === "unavailable" || e.status === "available") {
                        return false;
                      }
                      const eventDate = new Date(e.starts_at);
                      const eventDateStr = normalizeDate(eventDate);
                      return eventDateStr === dateStr;
                    });
                    days.push({
                      date,
                      isCurrentMonth: false,
                      hasEvents: dayEvents.length > 0,
                      eventCount: dayEvents.length,
                    });
                  }
                  
                  return days;
                };

                const miniCalendarDays = getDaysInMonth(miniCalendarMonth);
                const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
                const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const isToday = (date: Date) => {
                  const d = new Date(date);
                  d.setHours(0, 0, 0, 0);
                  return d.getTime() === today.getTime();
                };

                const isSelected = (date: Date) => {
                  const d = new Date(date);
                  d.setHours(0, 0, 0, 0);
                  const s = new Date(selectedDate);
                  s.setHours(0, 0, 0, 0);
                  return d.getTime() === s.getTime();
                };

                const navigateMonth = (direction: number) => {
                  const newMonth = new Date(miniCalendarMonth);
                  newMonth.setMonth(newMonth.getMonth() + direction);
                  setMiniCalendarMonth(newMonth);
                };

                const handleDayClick = (date: Date) => {
                  setSelectedDate(date);
                  if (viewMode !== 'week' && viewMode !== 'month') {
                    setViewMode('week');
                  }
                };

                return (
                  <div className="space-y-2">
                    {/* Навигация по месяцам */}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => navigateMonth(-1)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                        title="Предыдущий месяц"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <span className="text-xs font-semibold text-slate-900">
                        {monthNames[miniCalendarMonth.getMonth()]} {miniCalendarMonth.getFullYear()}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigateMonth(1)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                        title="Следующий месяц"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>

                    {/* Дни недели */}
                    <div className="grid grid-cols-7 gap-1">
                      {dayNames.map((day) => (
                        <div key={day} className="text-center text-[0.6rem] font-semibold text-slate-500 py-1">
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Дни месяца */}
                    <div className="grid grid-cols-7 gap-1">
                      {miniCalendarDays.map((day, index) => {
                        const dayDate = new Date(day.date);
                        dayDate.setHours(0, 0, 0, 0);
                        const dayIsToday = isToday(dayDate);
                        const dayIsSelected = isSelected(dayDate);

                        return (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleDayClick(dayDate)}
                            className={`
                              relative h-7 w-7 rounded-md text-[0.65rem] font-medium transition-all
                              ${!day.isCurrentMonth 
                                ? 'text-slate-300' 
                                : dayIsSelected
                                  ? 'bg-lime-500 text-white shadow-md'
                                  : dayIsToday
                                    ? 'bg-lime-100 text-lime-700 border-2 border-lime-400'
                                    : 'text-slate-700 hover:bg-slate-100'
                              }
                            `}
                            title={day.hasEvents ? `${day.eventCount} ${day.eventCount === 1 ? 'событие' : 'событий'}` : 'Нет событий'}
                          >
                            {day.date.getDate()}
                            {/* Отметка о событиях */}
                            {day.hasEvents && day.isCurrentMonth && (
                              <span className={`
                                absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full
                                ${dayIsSelected ? 'bg-white' : 'bg-lime-500'}
                              `} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </section>

            {/* Компактный блок календарей */}
            <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-lime-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <h2 className="text-sm font-bold text-slate-900">
                    {loading ? "Загружаем…" : `Календари (${calendars.length})`}
                  </h2>
                </div>
                {currentUser?.organization_id && userOrganization && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100">
                    {userOrganization.logo_url && (
                      <img 
                        src={userOrganization.logo_url.startsWith('http') ? userOrganization.logo_url : `${API_BASE_URL.replace('/api/v1', '')}${userOrganization.logo_url}`}
                        alt={userOrganization.name}
                        className="w-4 h-4 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <span className="text-[0.65rem] font-semibold text-slate-700 truncate max-w-[100px]">
                      {userOrganization.name}
                    </span>
                  </div>
                )}
              </div>

              {error && (
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {error}
                </p>
              )}

              {!loading && !error && calendars.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">
                  Календарей пока нет
                </p>
              )}

              <ul className="space-y-1.5 max-h-[calc(100vh-500px)] overflow-y-auto">
              {calendars.map((calendar) => (
                <li
                  key={calendar.id}
                  className={`rounded-lg border p-2.5 transition-all cursor-pointer ${
                    selectedCalendarId === calendar.id
                      ? "border-lime-500 bg-lime-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
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
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className="h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                        style={{ background: calendar.color }}
                        aria-label="calendar color"
                      />
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {calendar.name}
                      </p>
                    </div>
                    {calendar.current_user_role === "owner" && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[0.6rem] font-semibold text-slate-600 transition hover:bg-slate-50 hover:border-slate-300"
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
                          className="rounded-md border border-red-200 bg-white px-1.5 py-0.5 text-[0.6rem] font-semibold text-red-600 transition hover:bg-red-50 hover:border-red-300"
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

          {/* Статистика */}
          <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm flex-shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h2 className="text-sm font-bold text-slate-900">Статистика</h2>
            </div>
            <div className="space-y-2">
              {(() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const todayEventsCount = events.filter(e => {
                  const eventDate = new Date(e.starts_at);
                  return eventDate >= today && eventDate < tomorrow;
                }).length;
                
                const weekStart = new Date(today);
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 7);
                const weekEventsCount = events.filter(e => {
                  const eventDate = new Date(e.starts_at);
                  return eventDate >= weekStart && eventDate < weekEnd;
                }).length;
                
                return (
                  <>
                    <div className="flex items-center justify-between rounded-lg bg-white border border-slate-200 p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-lime-500"></div>
                        <span className="text-xs font-medium text-slate-700">Сегодня</span>
                      </div>
                      <span className="text-xs font-bold text-slate-900">{todayEventsCount}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-white border border-slate-200 p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                        <span className="text-xs font-medium text-slate-700">На неделе</span>
                      </div>
                      <span className="text-xs font-bold text-slate-900">{weekEventsCount}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-white border border-slate-200 p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                        <span className="text-xs font-medium text-slate-700">Всего событий</span>
                      </div>
                      <span className="text-xs font-bold text-slate-900">{events.length}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </section>

          {/* Блок с ближайшими событиями */}
          <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm flex-shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-sm font-bold text-slate-900">Ближайшие события</h2>
            </div>
            <UpcomingEvents
              events={events}
              currentUserEmail={userEmail || undefined}
              onEventClick={(event) => openEventModal(undefined, event)}
              users={users}
              apiBaseUrl={API_BASE_URL.replace('/api/v1', '')}
              rooms={rooms}
            />
          </section>

          {/* Скрытая форма создания календаря (для сохранения функциональности) */}
          {showCreateCalendarForm && (
            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg flex-shrink-0">
              <form
                onSubmit={(e) => {
                  handleSubmit(e);
                  setShowCreateCalendarForm(false);
                }}
                className="space-y-3 animate-fadeIn"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      Создать календарь
                    </p>
                    <h2 className="mt-1 text-base font-semibold">
                      Новый календарь
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateCalendarForm(false);
                      setForm(DEFAULT_FORM_STATE);
                    }}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <label className="block text-xs font-medium text-slate-700">
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
                    autoFocus
                  />
                </label>

                <label className="block text-xs font-medium text-slate-700">
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

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 rounded-lg bg-lime-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? "Создаём…" : "Создать"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateCalendarForm(false);
                      setForm(DEFAULT_FORM_STATE);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            </section>
          )}

            <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm flex-shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <h2 className="text-sm font-bold text-slate-900">Поиск пользователя</h2>
              </div>

              <div>
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Имя или email..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500/20"
                />
              </div>

              {userSearchQuery.trim() && (
                <div className="mt-3 max-h-[250px] overflow-y-auto space-y-1.5">
                  {usersLoading ? (
                    <p className="text-xs text-slate-500 text-center py-2">Загружаем...</p>
                  ) : filteredUsers.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-2">Пользователи не найдены</p>
                  ) : (
                    filteredUsers.map((user) => {
                      const isMember = members.some((m) => m.user_id === user.id);
                      return (
                        <div
                          key={user.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer"
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
                            <span className="rounded-full border border-lime-200 bg-lime-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-lime-700 flex-shrink-0">
                              В календаре
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </section>

            {/* Участники календаря */}
            <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm flex-shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h2 className="text-sm font-bold text-slate-900">Участники</h2>
                {selectedRole && selectedCalendar && (
                  <span className="ml-auto rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-purple-700">
                    {ROLE_LABELS[selectedRole]}
                  </span>
                )}
              </div>

              {!selectedCalendar && (
                <p className="text-xs text-slate-400 text-center py-3">
                  Выберите календарь
                </p>
              )}

              {selectedCalendar && membersError && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {membersError}
                </p>
              )}

              {selectedCalendar && membersLoading && (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-2 text-xs text-slate-500 text-center">
                  Загружаем…
                </p>
              )}

              {selectedCalendar && !membersLoading && members.length === 0 && !membersError && (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-2 text-xs text-slate-500 text-center">
                  Пока никто не присоединён
                </p>
              )}

              {selectedCalendar && !membersLoading && members.length > 0 && (
                <ul className="space-y-1.5 max-h-[200px] overflow-y-auto">
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
                        className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {member.full_name || member.email}
                            </p>
                            <p className="text-[0.65rem] text-slate-500 truncate">{member.email}</p>
                          </div>
                          <span className="rounded-full border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-purple-700 flex-shrink-0">
                            {role}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
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
                        ? `${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: MOSCOW_TIMEZONE }).format(weekStart)} – ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: MOSCOW_TIMEZONE }).format(addDaysInMoscow(weekStart, 6))}`
                        : new Intl.DateTimeFormat("ru-RU", { month: "short", year: "numeric", timeZone: MOSCOW_TIMEZONE }).format(selectedDate)}
                    </span>
        </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Переключатель показа расписания доступности */}
                  {selectedCalendar && (viewMode === "month" || viewMode === "week") && (
                    <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition">
                      <input
                        type="checkbox"
                        checked={showMyAvailability}
                        onChange={(e) => setShowMyAvailability(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-lime-600 focus:ring-lime-500"
                      />
                      <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
                        Показать мою доступность
                      </span>
                    </label>
                  )}
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

          {selectedCalendar && viewMode === "day" && (
              <div 
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg flex-1 overflow-auto transition-opacity duration-300"
                style={{ animation: 'fadeIn 0.3s ease-out forwards' }}
              >
            <DayView
              day={selectedDate}
              events={showMyAvailability ? [...events, ...myAvailabilitySchedule] : events}
              loading={eventsLoading || myAvailabilityLoading}
              accent={selectedCalendar.color}
              onEventClick={(event) => {
                if (event.status === "unavailable" || event.status === "available" || event.status === "booked_slot") {
                  return;
                }
                openEventModal(undefined, event);
              }}
              rooms={rooms}
              onEventMove={canManageEvents ? handleEventMove : undefined}
              onTimeSlotClick={canManageEvents ? (date: Date, startTime: Date, endTime: Date, startDateStr?: string, endDateStr?: string) => {
                openEventModal(date, undefined, startTime, endTime, startDateStr, endDateStr);
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
              users={users}
              apiBaseUrl={API_BASE_URL.replace('/api/v1', '')}
              getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
            />
              </div>
          )}

          {selectedCalendar && viewMode === "week" && (
              <div 
                className="rounded-2xl bg-slate-100/50 p-3 shadow-[0_8px_30px_rgba(15,23,42,0.08)] flex-1 overflow-hidden min-h-0 transition-opacity duration-300"
                style={{ animation: 'fadeIn 0.3s ease-out forwards' }}
              >
            <WeekView
              days={weekDays}
              events={showMyAvailability ? [...events, ...myAvailabilitySchedule] : events}
              loading={eventsLoading || myAvailabilityLoading}
              accent={selectedCalendar.color}
              onEventClick={(event) => {
                // Не открываем модальное окно для событий расписания доступности
                if (event.status === "unavailable") {
                  return;
                }
                openEventModal(undefined, event);
              }}
              rooms={rooms}
              onEventMove={canManageEvents ? handleEventMove : undefined}
              onTimeSlotClick={canManageEvents ? (date: Date, startTime: Date, endTime: Date, startDateStr?: string, endDateStr?: string) => {
                openEventModal(date, undefined, startTime, endTime, startDateStr, endDateStr);
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
              users={users}
              apiBaseUrl={API_BASE_URL.replace('/api/v1', '')}
              getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
            />
              </div>
          )}

          {selectedCalendar && viewMode === "month" && (
              <div 
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg flex-1 overflow-auto transition-opacity duration-300"
                style={{ animation: 'fadeIn 0.3s ease-out forwards' }}
              >
            <MonthView
              days={monthGridDays}
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setViewMode("week");
              }}
              events={showMyAvailability ? [...events, ...myAvailabilitySchedule] : events}
              loading={eventsLoading || myAvailabilityLoading}
              accent={selectedCalendar.color}
              onEventClick={(event) => {
                // Не открываем модальное окно для событий расписания доступности
                if (event.status === "unavailable") {
                  return;
                }
                openEventModal(undefined, event);
              }}
              rooms={rooms}
              currentUserEmail={userEmail || undefined}
              getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
            />
              </div>
          )}

          {viewMode === "org" && (
            <OrgStructure
              authFetch={authFetch}
              users={users}
              organizations={organizations}
              apiBaseUrl={API_BASE_URL.replace('/api/v1', '')}
              onClose={() => setViewMode("week")}
              onUsersUpdate={loadUsers}
            />
          )}
          {viewMode === "support" && (
            <TicketTracker
              authFetch={authFetch}
              apiBaseUrl={API_BASE_URL.replace('/api/v1', '')}
              users={users}
              organizations={organizations}
              getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
              currentUserId={currentUser?.id}
              onClose={() => setViewMode("week")}
            />
          )}
          {viewMode === "admin" && (
            <AdminPanel 
              authFetch={authFetch} 
              currentUser={currentUser || undefined}
              onClose={() => setViewMode("week")}
            />
          )}
          {viewMode === "availability-slots" && (
            <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden">
              <AvailabilitySlotsManager
                authFetch={authFetch}
                currentUserId={currentUser?.id}
                selectedCalendarId={selectedCalendarId ?? undefined}
                onSlotBooked={() => {
                  loadEvents();
                }}
                onClose={() => setViewMode("week")}
                onOpenEventModal={(slot) => {
                  const startDate = new Date(slot.starts_at);
                  const endDate = new Date(slot.ends_at);
                  setBookingSlotId(slot.id);
                  
                  // Добавляем участников: текущий пользователь и владелец слота
                  const participantIds: string[] = [];
                  if (currentUser?.id) {
                    participantIds.push(currentUser.id);
                  }
                  if (slot.user_id && slot.user_id !== currentUser?.id) {
                    participantIds.push(slot.user_id);
                  }
                  
                  // Устанавливаем форму с правильным временем и участниками
                  setEventForm({
                    title: slot.process_name,
                    description: slot.description || "",
                    location: "",
                    room_id: null,
                    starts_at: toLocalString(startDate),
                    ends_at: toLocalString(endDate),
                    participant_ids: participantIds,
                    recurrence_enabled: false,
                    recurrence_frequency: "weekly",
                    recurrence_interval: 1,
                    recurrence_count: undefined,
                    recurrence_until: "",
                  });
                  
                  setEditingEventId(null);
                  setEditingRecurrenceInfo(null);
                  setIsEventModalOpen(true);
                  setEventFormError(null);
                  loadRooms(); // Перезагружаем переговорки для проверки доступности
                }}
                hasAccessToStatistics={currentUser?.access_availability_slots === true}
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
      setPendingFiles([]);
      setBookingSlotId(null);
            }}
            onPendingFilesReady={setPendingFiles}
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
            organizations={organizations}
            getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
            apiBaseUrl={API_BASE_URL.replace('/api/v1', '')}
            accentColor={selectedCalendar?.color || "#6366f1"}
            events={events}
            currentUserEmail={userEmail || undefined}
            onEventUpdated={async () => {
              // Перезагружаем событие после обновления вложений
              if (editingEventId) {
                await loadEvents();
              }
            }}
            onUpdateParticipantStatus={async (eventId: string, userId: string, status: string) => {
              try {
                // Оптимистичное обновление: сразу обновляем событие в списке
                setEvents((prevEvents) => {
                  return prevEvents.map((event) => {
                    if (event.id === eventId) {
                      return {
                        ...event,
                        participants: event.participants?.map((p) =>
                          p.user_id === userId ? { ...p, response_status: status } : p
                        ),
                      };
                    }
                    return event;
                  });
                });

                const response = await authFetch(
                  `${EVENT_ENDPOINT}${eventId}/participants/${userId}/status`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ response_status: status }),
                  },
                );
                if (!response.ok) {
                  let errorMessage = "Не удалось обновить статус";
                  try {
                    const errorData = await response.json();
                    if (errorData?.detail) {
                      errorMessage = errorData.detail;
                    } else if (errorData?.message) {
                      errorMessage = errorData.message;
                    }
                  } catch {
                    // Если не удалось распарсить JSON, используем текст ответа
                    const errorText = await response.text().catch(() => "");
                    if (errorText) {
                      errorMessage = errorText;
                    }
                  }
                  throw new Error(errorMessage);
                }
                
                // Очищаем ошибку при успешном обновлении
                setEventFormError(null);
                
                // Обновляем данные с сервера для синхронизации
                await loadEvents();
                
                // Обновляем уведомления, чтобы увидеть новые уведомления организатору
                if (notificationsRefresh) {
                  notificationsRefresh();
                }
              } catch (err) {
                // Откатываем оптимистичное обновление при ошибке
                await loadEvents();
                setEventFormError(
                  err instanceof Error ? err.message : "Не удалось обновить статус",
                );
              }
            }}
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
        {isProfileSettingsOpen && (
          <ProfileSettings
            isOpen={isProfileSettingsOpen}
            onClose={() => setIsProfileSettingsOpen(false)}
            authFetch={authFetch}
            onUpdate={() => {
              loadCurrentUser();
              loadUsers();
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
      
      {/* Компонент дней рождения */}
      <BirthdayReminder authFetch={authFetch} apiBaseUrl={API_BASE_URL.replace('/api/v1', '')} />
    </div>
  );
}







