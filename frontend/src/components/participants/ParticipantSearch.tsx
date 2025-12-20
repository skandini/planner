"use client";

import { useMemo, useState } from "react";
import type { EventDraft } from "@/types/event.types";
import type { CalendarMember } from "@/types/calendar.types";
import type { UserProfile } from "@/types/user.types";

interface ParticipantSearchProps {
  form: EventDraft;
  setForm: (form: EventDraft | ((prev: EventDraft) => EventDraft)) => void;
  users: UserProfile[];
  usersLoading: boolean;
  usersError: string | null;
  calendarMembers: CalendarMember[];
  membersLoading: boolean;
  readOnly: boolean;
  organizations?: Array<{id: string; name: string; slug: string}>;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  apiBaseUrl?: string;
  currentUserEmail?: string;
  compact?: boolean;
}

export function ParticipantSearch({
  form,
  setForm,
  users,
  usersLoading,
  usersError,
  calendarMembers,
  membersLoading,
  readOnly,
  organizations = [],
  getUserOrganizationAbbreviation,
  apiBaseUrl = "http://localhost:8000",
  currentUserEmail,
  compact = false,
}: ParticipantSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const membershipMap = useMemo(() => {
    const map = new Map<string, CalendarMember>();
    calendarMembers.forEach((member) => {
      map.set(member.user_id, member);
    });
    return map;
  }, [calendarMembers]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) {
      return users;
    }
    const query = searchQuery.toLowerCase();
    return users.filter(
      (user) =>
        (user.full_name?.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)) &&
        !form.participant_ids.includes(user.id),
    );
  }, [users, searchQuery, form.participant_ids]);

  const selectedUsers = useMemo(() => {
    return users.filter((user) => form.participant_ids.includes(user.id));
  }, [users, form.participant_ids]);

  const getAvatarUrl = (user: UserProfile) => {
    if (!user.avatar_url) return null;
    if (user.avatar_url.startsWith("http")) return user.avatar_url;
    const base = apiBaseUrl.replace(/\/$/, "");
    const path = user.avatar_url.startsWith("/") ? user.avatar_url : `/${user.avatar_url}`;
    return `${base}${path}`;
  };

  const toggleParticipant = (userId: string) => {
    if (readOnly) return;
    setForm((prev) => ({
      ...prev,
      participant_ids: prev.participant_ids.includes(userId)
        ? prev.participant_ids.filter((id) => id !== userId)
        : [...prev.participant_ids, userId],
    }));
    // Закрываем список поиска после выбора участника
    setSearchQuery("");
    setIsExpanded(false);
  };

  const removeParticipant = (userId: string) => {
    if (readOnly) return;
    setForm((prev) => ({
      ...prev,
      participant_ids: prev.participant_ids.filter((id) => id !== userId),
    }));
  };

  const isCurrentUser = (user: UserProfile) => {
    return currentUserEmail && user.email === currentUserEmail;
  };

  if (compact) {
    // Компактный режим - в одну строчку
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-slate-700">Участники:</span>
        
        {/* Выбранные участники - компактные чипсы */}
        {selectedUsers.map((user) => {
          const orgAbbr = getUserOrganizationAbbreviation ? getUserOrganizationAbbreviation(user.id) : "";
          const avatarUrl = getAvatarUrl(user);
          const isCurrent = isCurrentUser(user);
          return (
            <div
              key={user.id}
              className="group flex items-center gap-1.5 rounded-full border border-lime-200 bg-lime-50 px-2 py-1 pr-1.5 transition hover:border-lime-300 hover:bg-lime-100"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={user.full_name || user.email}
                  className="h-5 w-5 rounded-full object-cover border border-white shadow-sm"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-lime-400 to-emerald-500 text-[0.6rem] font-semibold text-white">
                  {(user.full_name || user.email)[0].toUpperCase()}
                </div>
              )}
              <span className="text-xs font-medium text-slate-900 max-w-[120px] truncate">
                {user.full_name || user.email.split("@")[0]}
              </span>
              {orgAbbr && (
                <span className="rounded-full bg-slate-200 px-1 py-0.5 text-[0.55rem] font-semibold text-slate-700">
                  {orgAbbr}
                </span>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeParticipant(user.id)}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:bg-lime-200 hover:text-slate-600"
                  title={isCurrent ? "Удалить себя из участников" : "Удалить участника"}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}

        {/* Кнопка добавления участника */}
        {!readOnly && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-lime-400 hover:bg-lime-50 hover:text-lime-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Добавить</span>
            </button>

            {/* Результаты поиска */}
            {isExpanded && (
              <div className="absolute z-20 mt-2 left-0 max-h-64 w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                <div className="p-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                    }}
                    onFocus={() => setIsExpanded(true)}
                    placeholder="Поиск участников..."
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 mb-2"
                    autoFocus
                  />
                  {usersLoading || membersLoading ? (
                    <div className="p-4 text-center text-sm text-slate-500">Загрузка...</div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="p-4 text-center text-sm text-slate-500">
                      {searchQuery ? "Ничего не найдено" : "Все участники уже добавлены"}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredUsers.map((user) => {
                        const orgAbbr = getUserOrganizationAbbreviation ? getUserOrganizationAbbreviation(user.id) : "";
                        const avatarUrl = getAvatarUrl(user);
                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => {
                              toggleParticipant(user.id);
                            }}
                            className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50"
                          >
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={user.full_name || user.email}
                                className="flex h-6 w-6 items-center justify-center rounded-full border border-white shadow-sm object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-semibold text-slate-700">
                                {(user.full_name || user.email)[0].toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-900 truncate">
                                {user.full_name || user.email}
                              </p>
                              {user.full_name && (
                                <p className="text-[0.65rem] text-slate-500 truncate">{user.email}</p>
                              )}
                            </div>
                            {orgAbbr && (
                              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[0.6rem] font-semibold text-slate-700 flex-shrink-0">
                                {orgAbbr}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Полный режим (старый UI)
  return (
    <div className="space-y-4">
      {/* Заголовок и счетчик */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Участники</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {selectedUsers.length > 0
              ? `${selectedUsers.length} ${selectedUsers.length === 1 ? "участник" : "участников"}`
              : "Добавьте участников события"}
          </p>
        </div>
        {selectedUsers.length > 0 && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lime-100 text-xs font-semibold text-lime-700">
            {selectedUsers.length}
          </span>
        )}
      </div>

      {/* Выбранные участники - чипсы */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedUsers.map((user) => {
            const membership = membershipMap.get(user.id);
            const badge = membership
              ? membership.role === "owner"
                ? "Владелец"
                : membership.role === "editor"
                  ? "Редактор"
                  : null
              : null;
            const orgAbbr = getUserOrganizationAbbreviation ? getUserOrganizationAbbreviation(user.id) : "";
            const avatarUrl = getAvatarUrl(user);
            const isCurrent = isCurrentUser(user);
            return (
              <div
                key={user.id}
                className="group flex items-center gap-2 rounded-full border border-lime-200 bg-lime-50 px-3 py-1.5 pr-2 transition hover:border-lime-300 hover:bg-lime-100"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={user.full_name || user.email}
                    className="h-6 w-6 rounded-full object-cover border border-white shadow"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-lime-400 to-emerald-500 text-xs font-semibold text-white">
                    {(user.full_name || user.email)[0].toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-medium text-slate-900">
                  {user.full_name || user.email}
                </span>
                {orgAbbr && (
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[0.65rem] font-semibold text-slate-700">
                    {orgAbbr}
                  </span>
                )}
                {badge && (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[0.65rem] font-medium text-slate-600">
                    {badge}
                  </span>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeParticipant(user.id)}
                    className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-lime-200 hover:text-slate-600"
                    title={isCurrent ? "Удалить себя из участников" : "Удалить участника"}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Поиск */}
      {!readOnly && (
        <div className="relative">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsExpanded(true);
              }}
              onFocus={() => setIsExpanded(true)}
              placeholder="Поиск участников..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setIsExpanded(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Результаты поиска */}
          {isExpanded && (searchQuery || filteredUsers.length > 0) && (
            <div className="absolute z-10 mt-2 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {usersLoading || membersLoading ? (
                <div className="p-4 text-center text-sm text-slate-500">Загрузка...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">
                  {searchQuery ? "Ничего не найдено" : "Все участники уже добавлены"}
                </div>
              ) : (
                <div className="p-2">
                  {filteredUsers.map((user) => {
                    const membership = membershipMap.get(user.id);
                    const badge = membership
                      ? membership.role === "owner"
                        ? "Владелец"
                        : membership.role === "editor"
                          ? "Редактор"
                          : null
                      : null;
                    const orgAbbr = getUserOrganizationAbbreviation ? getUserOrganizationAbbreviation(user.id) : "";
                    const avatarUrl = getAvatarUrl(user);
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          toggleParticipant(user.id);
                        }}
                        className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-50"
                      >
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={user.full_name || user.email}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white shadow-sm object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-semibold text-slate-700">
                            {(user.full_name || user.email)[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {user.full_name || user.email}
                            </p>
                            {orgAbbr && (
                              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[0.65rem] font-semibold text-slate-700 flex-shrink-0">
                                {orgAbbr}
                              </span>
                            )}
                          </div>
                          {user.full_name && (
                            <p className="text-xs text-slate-500 truncate">{user.email}</p>
                          )}
                        </div>
                        {badge && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-medium text-slate-600">
                            {badge}
                          </span>
                        )}
                        <svg
                          className="h-5 w-5 text-lime-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {usersError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {usersError}
        </div>
      )}
    </div>
  );
}

