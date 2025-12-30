import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { UserProfile } from "@/types/user.types";
import type { PaginatedResponse } from "@/types/pagination.types";
import { userApi } from "@/lib/api/userApi";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";
import { queryKeys } from "@/lib/react-query/queryKeys";
import { performanceMonitor } from "@/lib/performance/monitor";

export function useUsersQuery(
  searchQuery: string = "",
  usePagination: boolean = false,
  pageSize: number = 50
) {
  const authFetch = useAuthenticatedFetch();
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: async () => {
      const result = await performanceMonitor.measure("fetchUsers", () =>
        userApi.list(authFetch, usePagination ? { page, page_size: pageSize } : undefined)
      );
      return result;
    },
    staleTime: 5 * 60 * 1000, // 5 минут для пользователей
    enabled: true,
  });

  // Определяем, является ли ответ пагинированным
  const isPaginated = useMemo(() => {
    return query.data && typeof query.data === "object" && "items" in query.data;
  }, [query.data]);

  const paginatedData = isPaginated
    ? (query.data as PaginatedResponse<UserProfile>)
    : null;
  const allUsers = isPaginated
    ? paginatedData!.items
    : (query.data as UserProfile[] | undefined) ?? [];

  const filteredUsers = useMemo(() => {
    if (!allUsers.length) return [];
    if (!searchQuery.trim()) return allUsers;
    const queryLower = searchQuery.toLowerCase().trim();
    return allUsers.filter(
      (user) =>
        user.email.toLowerCase().includes(queryLower) ||
        (user.full_name && user.full_name.toLowerCase().includes(queryLower))
    );
  }, [allUsers, searchQuery]);

  return {
    users: filteredUsers,
    allUsers,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refresh: query.refetch,
    // Пагинация
    pagination: isPaginated
      ? {
          page: paginatedData!.page,
          pageSize: paginatedData!.page_size,
          total: paginatedData!.total,
          totalPages: paginatedData!.total_pages,
          setPage,
        }
      : null,
  };
}

