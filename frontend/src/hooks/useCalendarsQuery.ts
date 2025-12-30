import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Calendar, CalendarDraft, CalendarMember } from "@/types/calendar.types";
import { calendarApi } from "@/lib/api/calendarApi";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";
import { queryKeys } from "@/lib/react-query/queryKeys";
import { performanceMonitor } from "@/lib/performance/monitor";

export function useCalendarsQuery() {
  const authFetch = useAuthenticatedFetch();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.calendars.list(),
    queryFn: async () => {
      return performanceMonitor.measure("fetchCalendars", () =>
        calendarApi.list(authFetch)
      );
    },
    staleTime: 5 * 60 * 1000, // 5 минут для календарей
  });

  const createMutation = useMutation({
    mutationFn: async (data: CalendarDraft) => {
      return performanceMonitor.measure("createCalendar", () =>
        calendarApi.create(authFetch, data)
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (calendarId: string) => {
      return performanceMonitor.measure("deleteCalendar", () =>
        calendarApi.delete(authFetch, calendarId)
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars.all });
    },
  });

  const getMembersQuery = (calendarId: string) => {
    return useQuery({
      queryKey: queryKeys.calendars.members(calendarId),
      queryFn: async () => {
        return performanceMonitor.measure(
          "fetchCalendarMembers",
          () => calendarApi.getMembers(authFetch, calendarId),
          { calendarId }
        );
      },
      enabled: !!calendarId,
      staleTime: 2 * 60 * 1000, // 2 минуты для участников
    });
  };

  const addMemberMutation = useMutation({
    mutationFn: async ({
      calendarId,
      userId,
      role = "viewer",
    }: {
      calendarId: string;
      userId: string;
      role?: string;
    }) => {
      return performanceMonitor.measure(
        "addCalendarMember",
        () => calendarApi.addMember(authFetch, calendarId, userId, role),
        { calendarId, userId, role }
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.calendars.members(variables.calendarId),
      });
    },
  });

  return {
    calendars: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    createCalendar: createMutation.mutateAsync,
    deleteCalendar: deleteMutation.mutateAsync,
    getMembers: getMembersQuery,
    addMember: addMemberMutation.mutateAsync,
    refresh: query.refetch,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

