import type { EventRecord, EventDraft } from "@/types/event.types";
import type { AuthenticatedFetch } from "./baseApi";
import { EVENT_ENDPOINT } from "@/lib/constants";

export const eventApi = {
  async list(
    authFetch: AuthenticatedFetch,
    calendarId: string | null,
    from: string,
    to: string,
  ): Promise<EventRecord[]> {
    const url = new URL(EVENT_ENDPOINT);
    if (calendarId) {
      url.searchParams.set("calendar_id", calendarId);
    }
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    const response = await authFetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Не удалось получить события");
    }
    return response.json();
  },

  async get(
    authFetch: AuthenticatedFetch,
    eventId: string,
  ): Promise<EventRecord> {
    const response = await authFetch(`${EVENT_ENDPOINT}${eventId}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Событие не найдено. Возможно, оно было удалено.");
      }
      if (response.status === 403) {
        throw new Error("Нет доступа к календарю, в котором находится это событие.");
      }
      const errorText = await response.text().catch(() => "Неизвестная ошибка");
      throw new Error(`Не удалось получить событие: ${errorText}`);
    }
    return response.json();
  },

  async create(
    authFetch: AuthenticatedFetch,
    data: EventDraft,
    calendarId: string,
  ): Promise<EventRecord> {
    const payload: Record<string, unknown> = {
      calendar_id: calendarId,
      title: data.title,
      description: data.description || null,
      location: data.location || null,
      room_id: data.room_id,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      all_day: data.all_day,
      participant_ids: data.participant_ids,
    };

    if (data.recurrence_enabled) {
      payload.recurrence_rule = {
        frequency: data.recurrence_frequency,
        interval: data.recurrence_interval,
        ...(data.recurrence_count !== undefined && { count: data.recurrence_count }),
        ...(data.recurrence_until && { until: data.recurrence_until }),
      };
    }

    const response = await authFetch(EVENT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Не удалось создать событие: ${errorText}`);
    }
    return response.json();
  },

  async update(
    authFetch: AuthenticatedFetch,
    eventId: string,
    data: Partial<EventDraft>,
    scope: "single" | "series" = "single",
  ): Promise<EventRecord> {
    const payload: Record<string, unknown> = {};
    if (data.title !== undefined) payload.title = data.title;
    if (data.description !== undefined) payload.description = data.description || null;
    if (data.location !== undefined) payload.location = data.location || null;
    if (data.room_id !== undefined) payload.room_id = data.room_id;
    if (data.starts_at !== undefined) payload.starts_at = data.starts_at;
    if (data.ends_at !== undefined) payload.ends_at = data.ends_at;
    if (data.all_day !== undefined) payload.all_day = data.all_day;
    if (data.participant_ids !== undefined) payload.participant_ids = data.participant_ids;

    if (data.recurrence_enabled !== undefined && data.recurrence_enabled) {
      payload.recurrence_rule = {
        frequency: data.recurrence_frequency,
        interval: data.recurrence_interval,
        ...(data.recurrence_count !== undefined && { count: data.recurrence_count }),
        ...(data.recurrence_until && { until: data.recurrence_until }),
      };
    }

    const response = await authFetch(
      `${EVENT_ENDPOINT}${eventId}${scope === "series" ? "?scope=series" : ""}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Не удалось обновить событие: ${errorText}`);
    }
    return response.json();
  },

  async move(
    authFetch: AuthenticatedFetch,
    eventId: string,
    newStart: string,
    newEnd: string,
    scope: "single" | "series" = "single",
  ): Promise<EventRecord> {
    const response = await authFetch(
      `${EVENT_ENDPOINT}${eventId}${scope === "series" ? "?scope=series" : ""}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starts_at: newStart,
          ends_at: newEnd,
        }),
      },
    );
    if (!response.ok) {
      throw new Error("Не удалось переместить событие");
    }
    return response.json();
  },

  async delete(
    authFetch: AuthenticatedFetch,
    eventId: string,
    scope: "single" | "series" = "single",
  ): Promise<void> {
    const response = await authFetch(
      `${EVENT_ENDPOINT}${eventId}${scope === "series" ? "?scope=series" : ""}`,
      {
        method: "DELETE",
      },
    );
    if (!response.ok) {
      throw new Error("Не удалось удалить событие");
    }
  },

  async updateParticipantStatus(
    authFetch: AuthenticatedFetch,
    eventId: string,
    userId: string,
    status: string,
  ): Promise<void> {
    const response = await authFetch(
      `${EVENT_ENDPOINT}${eventId}/participants/${userId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_status: status }),
      },
    );
    if (!response.ok) {
      let errorMessage = "Не удалось обновить статус участника";
      try {
        const errorData = await response.json();
        if (errorData?.detail) {
          errorMessage = errorData.detail;
        }
      } catch {
        // Игнорируем ошибку парсинга
      }
      throw new Error(errorMessage);
    }
  },
};

