/**
 * Централизованные ключи для React Query
 * Помогает избежать дублирования и обеспечивает консистентность
 */

export const queryKeys = {
  // События
  events: {
    all: ["events"] as const,
    lists: () => [...queryKeys.events.all, "list"] as const,
    list: (calendarId: string | null, from: string, to: string) =>
      [...queryKeys.events.lists(), calendarId, from, to] as const,
    details: () => [...queryKeys.events.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.events.details(), id] as const,
  },

  // Пользователи
  users: {
    all: ["users"] as const,
    lists: () => [...queryKeys.users.all, "list"] as const,
    list: () => [...queryKeys.users.lists()] as const,
    details: () => [...queryKeys.users.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.users.details(), id] as const,
    me: () => [...queryKeys.users.details(), "me"] as const,
  },

  // Календари
  calendars: {
    all: ["calendars"] as const,
    lists: () => [...queryKeys.calendars.all, "list"] as const,
    list: () => [...queryKeys.calendars.lists()] as const,
    details: () => [...queryKeys.calendars.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.calendars.details(), id] as const,
    members: (id: string) =>
      [...queryKeys.calendars.detail(id), "members"] as const,
  },

  // Комнаты
  rooms: {
    all: ["rooms"] as const,
    lists: () => [...queryKeys.rooms.all, "list"] as const,
    list: () => [...queryKeys.rooms.lists()] as const,
    details: () => [...queryKeys.rooms.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.rooms.details(), id] as const,
  },

  // Уведомления
  notifications: {
    all: ["notifications"] as const,
    lists: () => [...queryKeys.notifications.all, "list"] as const,
    list: () => [...queryKeys.notifications.lists()] as const,
  },
};

