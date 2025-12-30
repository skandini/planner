import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EventRecord, EventDraft } from "@/types/event.types";
import { eventApi } from "@/lib/api/eventApi";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";
import { queryKeys } from "@/lib/react-query/queryKeys";
import { performanceMonitor } from "@/lib/performance/monitor";

export function useEventsQuery(
  calendarId: string | null,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const authFetch = useAuthenticatedFetch();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.events.list(
      calendarId,
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
    ),
    queryFn: async () => {
      if (!calendarId) return [];
      return performanceMonitor.measure(
        "fetchEvents",
        () =>
          eventApi.list(
            authFetch,
            calendarId,
            rangeStart.toISOString(),
            rangeEnd.toISOString(),
          ),
        { calendarId, rangeStart, rangeEnd }
      );
    },
    enabled: !!calendarId,
    staleTime: 2 * 60 * 1000, // 2 минуты для событий
  });

  const createMutation = useMutation({
    mutationFn: async ({
      data,
      calendarId: calId,
    }: {
      data: EventDraft;
      calendarId: string;
    }) => {
      return performanceMonitor.measure(
        "createEvent",
        () => eventApi.create(authFetch, data, calId),
        { calendarId: calId }
      );
    },
    onSuccess: () => {
      // Инвалидируем кеш событий
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      eventId,
      data,
      scope = "single",
    }: {
      eventId: string;
      data: Partial<EventDraft>;
      scope?: "single" | "series";
    }) => {
      return performanceMonitor.measure(
        "updateEvent",
        () => eventApi.update(authFetch, eventId, data, scope),
        { eventId, scope }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({
      eventId,
      newStart,
      newEnd,
      scope = "single",
    }: {
      eventId: string;
      newStart: string;
      newEnd: string;
      scope?: "single" | "series";
    }) => {
      return performanceMonitor.measure(
        "moveEvent",
        () => eventApi.move(authFetch, eventId, newStart, newEnd, scope),
        { eventId, scope }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({
      eventId,
      scope = "single",
    }: {
      eventId: string;
      scope?: "single" | "series";
    }) => {
      return performanceMonitor.measure(
        "deleteEvent",
        () => eventApi.delete(authFetch, eventId, scope),
        { eventId, scope }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });

  const updateParticipantStatusMutation = useMutation({
    mutationFn: async ({
      eventId,
      userId,
      status,
    }: {
      eventId: string;
      userId: string;
      status: string;
    }) => {
      return performanceMonitor.measure(
        "updateParticipantStatus",
        () =>
          eventApi.updateParticipantStatus(authFetch, eventId, userId, status),
        { eventId, userId, status }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });

  return {
    events: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    createEvent: createMutation.mutateAsync,
    updateEvent: updateMutation.mutateAsync,
    moveEvent: moveMutation.mutateAsync,
    deleteEvent: deleteMutation.mutateAsync,
    updateParticipantStatus: updateParticipantStatusMutation.mutateAsync,
    refresh: query.refetch,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

