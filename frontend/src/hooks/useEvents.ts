import { useCallback, useState, useEffect } from "react";
import type { EventRecord, EventDraft } from "@/types/event.types";
import { eventApi } from "@/lib/api/eventApi";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";

export function useEvents(
  calendarId: string | null,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authFetch = useAuthenticatedFetch();

  const loadEvents = useCallback(async () => {
    if (!calendarId) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await eventApi.list(
        authFetch,
        calendarId,
        rangeStart.toISOString(),
        rangeEnd.toISOString(),
      );
      setEvents(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка получения событий",
      );
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [calendarId, rangeStart, rangeEnd, authFetch]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const createEvent = useCallback(
    async (data: EventDraft, calendarId: string) => {
      try {
        const newEvent = await eventApi.create(authFetch, data, calendarId);
        await loadEvents();
        return newEvent;
      } catch (err) {
        throw err instanceof Error ? err : new Error("Не удалось создать событие");
      }
    },
    [authFetch, loadEvents],
  );

  const updateEvent = useCallback(
    async (
      eventId: string,
      data: Partial<EventDraft>,
      scope: "single" | "series" = "single",
    ) => {
      try {
        const updatedEvent = await eventApi.update(
          authFetch,
          eventId,
          data,
          scope,
        );
        await loadEvents();
        return updatedEvent;
      } catch (err) {
        throw err instanceof Error ? err : new Error("Не удалось обновить событие");
      }
    },
    [authFetch, loadEvents],
  );

  const moveEvent = useCallback(
    async (
      eventId: string,
      newStart: string,
      newEnd: string,
      scope: "single" | "series" = "single",
    ) => {
      try {
        const movedEvent = await eventApi.move(
          authFetch,
          eventId,
          newStart,
          newEnd,
          scope,
        );
        await loadEvents();
        return movedEvent;
      } catch (err) {
        throw err instanceof Error ? err : new Error("Не удалось переместить событие");
      }
    },
    [authFetch, loadEvents],
  );

  const deleteEvent = useCallback(
    async (eventId: string, scope: "single" | "series" = "single") => {
      try {
        await eventApi.delete(authFetch, eventId, scope);
        await loadEvents();
      } catch (err) {
        throw err instanceof Error ? err : new Error("Не удалось удалить событие");
      }
    },
    [authFetch, loadEvents],
  );

  const updateParticipantStatus = useCallback(
    async (eventId: string, userId: string, status: string) => {
      try {
        await eventApi.updateParticipantStatus(authFetch, eventId, userId, status);
        await loadEvents();
      } catch (err) {
        throw err instanceof Error
          ? err
          : new Error("Не удалось обновить статус участника");
      }
    },
    [authFetch, loadEvents],
  );

  return {
    events,
    loading,
    error,
    createEvent,
    updateEvent,
    moveEvent,
    deleteEvent,
    updateParticipantStatus,
    refresh: loadEvents,
  };
}
