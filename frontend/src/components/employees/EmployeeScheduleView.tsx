"use client";

import { useState } from "react";
import type { EventRecord } from "@/types/event.types";
import type { UserProfile } from "@/types/user.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";

interface EmployeeScheduleViewProps {
  users: UserProfile[];
  usersLoading: boolean;
  authFetch: AuthenticatedFetch;
  onEventClick?: (event: EventRecord) => void;
  onUserSelect?: (user: UserProfile) => void;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  apiBaseUrl?: string;
}

export function EmployeeScheduleView({
  users,
  usersLoading,
  authFetch,
  onEventClick,
  onUserSelect,
  getUserOrganizationAbbreviation,
  apiBaseUrl = "",
}: EmployeeScheduleViewProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Защита: убеждаемся, что users является массивом
  const usersArray = Array.isArray(users) ? users : [];

  // Фильтрация пользователей по поисковому запросу
  const filteredUsers = usersArray.filter((user) => {
    if (!searchQuery.trim()) return false;
    const query = searchQuery.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query) ||
      user.position?.toLowerCase().includes(query)
    );
  });

  const handleUserSelect = (user: UserProfile) => {
    onUserSelect?.(user);
    setSearchQuery("");
  };

  return (
    <div className="space-y-3">
      {/* Поиск сотрудника */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск сотрудника..."
          className="w-full rounded-lg border border-slate-200/60 bg-white/80 backdrop-blur-sm px-3 py-2 text-xs text-slate-900 placeholder-slate-400 transition-all focus:border-lime-400 focus:ring-1 focus:ring-lime-400/20"
        />
      </div>

      {/* Список найденных сотрудников */}
      {searchQuery.trim() && (
        <div className="max-h-[200px] overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
          {usersLoading ? (
            <div className="py-4 text-center text-xs text-slate-500">
              Загрузка...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-500">
              Сотрудники не найдены
            </div>
          ) : (
            filteredUsers.map((user) => {
              const orgAbbr = getUserOrganizationAbbreviation
                ? getUserOrganizationAbbreviation(user.id)
                : "";

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleUserSelect(user)}
                  className="w-full text-left rounded-lg border border-slate-200/60 bg-white/60 p-2 transition-all hover:bg-white/80 hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    {user.avatar_url ? (
                      <img
                        src={
                          apiBaseUrl && !user.avatar_url.startsWith("http")
                            ? `${apiBaseUrl}${user.avatar_url}`
                            : user.avatar_url
                        }
                        alt={user.full_name || user.email}
                        className="h-6 w-6 rounded-full object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center">
                        <span className="text-[0.65rem] font-semibold text-white">
                          {(user.full_name || user.email || "U")[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-700 truncate">
                          {user.full_name || user.email}
                        </span>
                        {orgAbbr && (
                          <span className="inline-flex items-center px-1 py-0.5 rounded text-[0.65rem] font-semibold bg-slate-50 text-slate-600 border border-slate-200/60 flex-shrink-0">
                            {orgAbbr}
                          </span>
                        )}
                      </div>
                      {user.position && (
                        <p className="text-[0.65rem] text-slate-500 truncate">
                          {user.position}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

