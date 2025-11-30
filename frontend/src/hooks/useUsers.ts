import { useCallback, useState, useEffect, useMemo } from "react";
import type { UserProfile } from "@/types/user.types";
import { userApi } from "@/lib/api/userApi";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";

export function useUsers(searchQuery: string = "") {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authFetch = useAuthenticatedFetch();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userApi.list(authFetch);
      setUsers(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка загрузки пользователей",
      );
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) {
      return users;
    }
    const query = searchQuery.toLowerCase().trim();
    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(query) ||
        (user.full_name && user.full_name.toLowerCase().includes(query)),
    );
  }, [users, searchQuery]);

  return {
    users: filteredUsers,
    allUsers: users,
    loading,
    error,
    refresh: loadUsers,
  };
}
