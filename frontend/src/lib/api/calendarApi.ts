import type { Calendar, CalendarMember, CalendarDraft } from "@/types/calendar.types";
import type { ConflictEntry, EventRecord } from "@/types/event.types";
import type { AuthenticatedFetch } from "./baseApi";
import { CALENDAR_ENDPOINT } from "@/lib/constants";

export const calendarApi = {
  async list(authFetch: AuthenticatedFetch): Promise<Calendar[]> {
    const response = await authFetch(CALENDAR_ENDPOINT, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Не удалось загрузить календари");
    }
    return response.json();
  },

  async create(authFetch: AuthenticatedFetch, data: CalendarDraft): Promise<Calendar> {
    const response = await authFetch(CALENDAR_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        description: data.description || null,
      }),
    });
    if (!response.ok) {
      throw new Error("Не удалось создать календарь");
    }
    return response.json();
  },

  async delete(authFetch: AuthenticatedFetch, calendarId: string): Promise<void> {
    const response = await authFetch(`${CALENDAR_ENDPOINT}${calendarId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error("Не удалось удалить календарь");
    }
  },

  async getMembers(
    authFetch: AuthenticatedFetch,
    calendarId: string,
  ): Promise<CalendarMember[]> {
    const response = await authFetch(
      `${CALENDAR_ENDPOINT}${calendarId}/members`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error("Не удалось загрузить участников календаря");
    }
    return response.json();
  },

  async addMember(
    authFetch: AuthenticatedFetch,
    calendarId: string,
    userId: string,
    role: string = "viewer",
  ): Promise<CalendarMember> {
    const response = await authFetch(
      `${CALENDAR_ENDPOINT}${calendarId}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role }),
      },
    );
    if (!response.ok) {
      throw new Error("Не удалось добавить участника");
    }
    return response.json();
  },

  async getConflicts(
    authFetch: AuthenticatedFetch,
    calendarId: string,
    from: string,
    to: string,
  ): Promise<ConflictEntry[]> {
    const url = new URL(`${CALENDAR_ENDPOINT}${calendarId}/conflicts`);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    const response = await authFetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Не удалось загрузить конфликты");
    }
    return response.json();
  },

  async getUserAvailability(
    authFetch: AuthenticatedFetch,
    calendarId: string,
    userId: string,
    from: string,
    to: string,
  ): Promise<EventRecord[]> {
    const url = `${CALENDAR_ENDPOINT}${calendarId}/members/${userId}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const response = await authFetch(url, { cache: "no-store" });
    if (!response.ok) {
      return [];
    }
    return response.json();
  },
};

