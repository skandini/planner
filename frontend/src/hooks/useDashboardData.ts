import { useCallback, useState, useEffect } from "react";
import type { Calendar, CalendarDraft } from "@/types/calendar.types";
import type { UserProfile } from "@/types/user.types";
import type { Room } from "@/types/room.types";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";
import { logger } from "@/lib/utils/logger";
import {
  CALENDAR_ENDPOINT,
  USERS_ENDPOINT,
  ROOM_ENDPOINT,
  ORGANIZATIONS_ENDPOINT,
  DEPARTMENTS_ENDPOINT,
} from "@/lib/constants";

export function useDashboardData() {
  const authFetch = useAuthenticatedFetch();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [organizations, setOrganizations] = useState<
    Array<{ id: string; name: string; slug: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [userOrganization, setUserOrganization] = useState<{
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    name: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCalendars = useCallback(async () => {
    try {
      const response = await authFetch(CALENDAR_ENDPOINT, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Не удалось загрузить календари");
      }
      const data: Calendar[] = await response.json();
      setCalendars(data);
    } catch (err) {
      logger.error("Failed to load calendars:", err);
      setCalendars([]);
    }
  }, [authFetch]);

  const loadUsers = useCallback(async () => {
    try {
      const response = await authFetch(USERS_ENDPOINT, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Не удалось загрузить пользователей");
      }
      const data: UserProfile[] = await response.json();
      setUsers(data);
    } catch (err) {
      logger.error("Failed to load users:", err);
      setUsers([]);
    }
  }, [authFetch]);

  const loadRooms = useCallback(async () => {
    try {
      const response = await authFetch(ROOM_ENDPOINT, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Не удалось загрузить переговорки");
      }
      const data: Room[] = await response.json();
      setRooms(data);
    } catch (err) {
      logger.error("Failed to load rooms:", err);
      setRooms([]);
    }
  }, [authFetch]);

  const loadOrganizations = useCallback(async () => {
    try {
      const response = await authFetch(ORGANIZATIONS_ENDPOINT, {
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        setOrganizations(data);
        logger.debug("Загружено организаций:", data.length);
      } else {
        logger.error(
          "Ошибка загрузки организаций:",
          response.status,
          response.statusText
        );
      }
    } catch (err) {
      logger.error("Failed to load organizations:", err);
    }
  }, [authFetch]);

  const loadDepartments = useCallback(
    async (currentUser: UserProfile | null) => {
      if (
        !currentUser ||
        (!currentUser.access_org_structure &&
          currentUser.role !== "admin" &&
          currentUser.role !== "it")
      ) {
        setDepartments([]);
        return;
      }

      try {
        const response = await authFetch(DEPARTMENTS_ENDPOINT, {
          cache: "no-store",
        });
        if (response.ok) {
          const data = await response.json();
          setDepartments(data);
        } else {
          logger.error(
            "Ошибка загрузки отделов:",
            response.status,
            response.statusText
          );
        }
      } catch (err) {
        logger.error("Failed to load departments:", err);
      }
    },
    [authFetch]
  );

  const loadCurrentUser = useCallback(async () => {
    try {
      const response = await authFetch(`${USERS_ENDPOINT}me`, {
        cache: "no-store",
      });
      if (response.ok) {
        const data: UserProfile = await response.json();
        logger.debug("Loaded user profile:", data);
        setCurrentUser(data);

        if (data.organization_id) {
          try {
            const orgResponse = await authFetch(
              `${ORGANIZATIONS_ENDPOINT}/${data.organization_id}`,
              { cache: "no-store" }
            );
            if (orgResponse.ok) {
              const orgData = await orgResponse.json();
              setUserOrganization(orgData);
            }
          } catch (err) {
            logger.error("Failed to load organization:", err);
          }
        } else {
          setUserOrganization(null);
        }
      }
    } catch (err) {
      logger.error("Failed to load current user:", err);
    }
  }, [authFetch]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        await Promise.all([
          loadCalendars(),
          loadUsers(),
          loadRooms(),
          loadOrganizations(),
          loadCurrentUser(),
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [loadCalendars, loadUsers, loadRooms, loadOrganizations, loadCurrentUser]);

  useEffect(() => {
    if (currentUser) {
      loadDepartments(currentUser);
    }
  }, [currentUser, loadDepartments]);

  return {
    calendars,
    users,
    rooms,
    organizations,
    departments,
    currentUser,
    userOrganization,
    loading,
    error,
    refresh: {
      calendars: loadCalendars,
      users: loadUsers,
      rooms: loadRooms,
      organizations: loadOrganizations,
      departments: () => loadDepartments(currentUser),
      currentUser: loadCurrentUser,
    },
  };
}

