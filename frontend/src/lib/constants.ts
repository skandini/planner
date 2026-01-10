import type { CalendarRole, CalendarDraft, EventDraft } from "@/types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const CALENDAR_ENDPOINT = `${API_BASE_URL}/calendars/`;
export const EVENT_ENDPOINT = `${API_BASE_URL}/events/`;
export const NOTIFICATION_ENDPOINT = `${API_BASE_URL}/notifications`;
export const ROOM_ENDPOINT = `${API_BASE_URL}/rooms/`;
export const USERS_ENDPOINT = `${API_BASE_URL}/users/`;
export const ORGANIZATIONS_ENDPOINT = `${API_BASE_URL}/organizations`;
export const DEPARTMENTS_ENDPOINT = `${API_BASE_URL}/departments/`;
export const EVENT_COMMENTS_ENDPOINT = (eventId: string) => `${API_BASE_URL}/events/${eventId}/comments`;
export const TICKETS_ENDPOINT = `${API_BASE_URL}/tickets/`;
export const TICKET_COMMENTS_ENDPOINT = (ticketId: string) => `${API_BASE_URL}/tickets/${ticketId}/comments`;
export const ADMIN_NOTIFICATIONS_ENDPOINT = `${API_BASE_URL}/admin-notifications/`;
export const STATISTICS_ENDPOINT = `${API_BASE_URL}/statistics/`;

export const MINUTES_IN_DAY = 24 * 60;
export const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const ROLE_LABELS: Record<CalendarRole, string> = {
  owner: "Владелец",
  editor: "Редактор",
  viewer: "Наблюдатель",
};
export const WORKDAY_START_HOUR = 8;
export const WORKDAY_END_HOUR = 20;
export const SLOT_DURATION_MINUTES = 30;

export const DEFAULT_FORM_STATE: CalendarDraft = {
  name: "",
  description: "",
  timezone: "Europe/Moscow",
  color: "#2563eb",
};

export const DEFAULT_EVENT_FORM: EventDraft = {
  title: "",
  description: "",
  location: "",
  room_id: null,
  starts_at: "",
  ends_at: "",
  participant_ids: [],
  recurrence_enabled: false,
  recurrence_frequency: "weekly",
  recurrence_interval: 1,
  recurrence_count: undefined,
  recurrence_until: "",
};

