import { useCallback, useState, useEffect } from "react";
import type { Calendar, CalendarDraft, CalendarMember } from "@/types/calendar.types";
import { calendarApi } from "@/lib/api/calendarApi";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";

export function useCalendars() {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authFetch = useAuthenticatedFetch();

  const loadCalendars = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await calendarApi.list(authFetch);
      setCalendars(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      setCalendars([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadCalendars();
  }, [loadCalendars]);

  const createCalendar = useCallback(
    async (data: CalendarDraft) => {
      try {
        const newCalendar = await calendarApi.create(authFetch, data);
        await loadCalendars();
        return newCalendar;
      } catch (err) {
        throw err instanceof Error ? err : new Error("Не удалось создать календарь");
      }
    },
    [authFetch, loadCalendars],
  );

  const deleteCalendar = useCallback(
    async (calendarId: string) => {
      try {
        await calendarApi.delete(authFetch, calendarId);
        await loadCalendars();
      } catch (err) {
        throw err instanceof Error ? err : new Error("Не удалось удалить календарь");
      }
    },
    [authFetch, loadCalendars],
  );

  const getMembers = useCallback(
    async (calendarId: string): Promise<CalendarMember[]> => {
      try {
        return await calendarApi.getMembers(authFetch, calendarId);
      } catch (err) {
        throw err instanceof Error
          ? err
          : new Error("Не удалось загрузить участников календаря");
      }
    },
    [authFetch],
  );

  const addMember = useCallback(
    async (calendarId: string, userId: string, role: string = "viewer") => {
      try {
        return await calendarApi.addMember(authFetch, calendarId, userId, role);
      } catch (err) {
        throw err instanceof Error ? err : new Error("Не удалось добавить участника");
      }
    },
    [authFetch],
  );

  return {
    calendars,
    loading,
    error,
    createCalendar,
    deleteCalendar,
    getMembers,
    addMember,
    refresh: loadCalendars,
  };
}
