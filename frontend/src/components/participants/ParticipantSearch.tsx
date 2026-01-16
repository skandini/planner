"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EventDraft } from "@/types/event.types";
import type { CalendarMember } from "@/types/calendar.types";
import type { UserProfile } from "@/types/user.types";

interface Department {
  id: string;
  name: string;
  description?: string | null;
  parent_id?: string | null;
}

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
  departments?: Department[];
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
  departments = [],
  getUserOrganizationAbbreviation,
  apiBaseUrl = "http://localhost:8000",
  currentUserEmail,
  compact = false,
}: ParticipantSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "departments" | "organizations">("users");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Закрываем dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
        setSearchQuery("");
      }
    };

    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isExpanded]);

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

  const addDepartment = (departmentId: string) => {
    if (readOnly) return;
    
    // Добавляем отдел как группового участника
    setForm((prev) => {
      const existingGroups = prev.group_participants || [];
      // Проверяем, не добавлен ли уже этот отдел
      const alreadyAdded = existingGroups.some(
        g => g.group_type === "department" && g.group_id === departmentId
      );
      
      if (alreadyAdded) {
        return prev;
      }
      
      return {
        ...prev,
        group_participants: [
          ...existingGroups,
          { group_type: "department" as const, group_id: departmentId }
        ],
      };
    });
    
    setSearchQuery("");
    setIsExpanded(false);
  };

  const addOrganization = (organizationId: string) => {
    if (readOnly) return;
    
    // Добавляем организацию как группового участника
    setForm((prev) => {
      const existingGroups = prev.group_participants || [];
      // Проверяем, не добавлена ли уже эта организация
      const alreadyAdded = existingGroups.some(
        g => g.group_type === "organization" && g.group_id === organizationId
      );
      
      if (alreadyAdded) {
        return prev;
      }
      
      return {
        ...prev,
        group_participants: [
          ...existingGroups,
          { group_type: "organization" as const, group_id: organizationId }
        ],
      };
    });
    
    setSearchQuery("");
    setIsExpanded(false);
  };

  const removeGroupParticipant = (groupType: "department" | "organization", groupId: string) => {
    if (readOnly) return;
    setForm((prev) => ({
      ...prev,
      group_participants: (prev.group_participants || []).filter(
        g => !(g.group_type === groupType && g.group_id === groupId)
      ),
    }));
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

  // Фильтрация отделов и организаций по поисковому запросу
  const filteredDepartments = useMemo(() => {
    if (!searchQuery.trim()) return departments;
    const query = searchQuery.toLowerCase();
    return departments.filter(dept => 
      dept.name.toLowerCase().includes(query) ||
      dept.description?.toLowerCase().includes(query)
    );
  }, [departments, searchQuery]);

  const filteredOrganizations = useMemo(() => {
    if (!searchQuery.trim()) return organizations;
    const query = searchQuery.toLowerCase();
    return organizations.filter(org => 
      org.name.toLowerCase().includes(query) ||
      org.slug.toLowerCase().includes(query)
    );
  }, [organizations, searchQuery]);

  // Групповые участники
  const selectedGroupParticipants = form.group_participants || [];
  
  const getGroupInfo = (groupType: "department" | "organization", groupId: string) => {
    if (groupType === "department") {
      const dept = departments.find(d => d.id === groupId);
      const memberCount = users.filter(u => 
        u.department_ids?.includes(groupId) || u.department_id === groupId
      ).length;
      return { name: dept?.name || "Unknown Department", memberCount };
    } else {
      const org = organizations.find(o => o.id === groupId);
      const memberCount = users.filter(u => 
        u.organization_ids?.includes(groupId) || u.organization_id === groupId
      ).length;
      return { name: org?.name || "Unknown Organization", memberCount };
    }
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
        
        {/* Групповые участники - компактные чипсы */}
        {selectedGroupParticipants.map((group) => {
          const groupInfo = getGroupInfo(group.group_type, group.group_id);
          const icon = group.group_type === "department" ? "👥" : "🏛️";
          
          return (
            <div
              key={`${group.group_type}-${group.group_id}`}
              className="group flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 pr-1.5 transition hover:border-indigo-300 hover:bg-indigo-100"
            >
              <span className="text-xs">{icon}</span>
              <span className="text-xs font-medium text-slate-900 max-w-[120px] truncate">
                {groupInfo.name}
              </span>
              <span className="rounded-full bg-indigo-200 px-1 py-0.5 text-[0.55rem] font-semibold text-indigo-700">
                {groupInfo.memberCount}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeGroupParticipant(group.group_type, group.group_id)}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:bg-indigo-200 hover:text-slate-600"
                  title="Удалить группу"
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
          <div className="relative" ref={dropdownRef}>
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
              <div className="absolute z-50 mt-2 left-0 max-h-96 w-96 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                {/* Вкладки */}
                <div className="flex border-b border-slate-200 bg-slate-50 px-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("users")}
                    className={`flex-1 px-3 py-2 text-xs font-medium transition ${
                      activeTab === "users"
                        ? "border-b-2 border-indigo-500 text-indigo-600 bg-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <svg className="w-4 h-4 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Участники
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("departments")}
                    className={`flex-1 px-3 py-2 text-xs font-medium transition ${
                      activeTab === "departments"
                        ? "border-b-2 border-indigo-500 text-indigo-600 bg-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <svg className="w-4 h-4 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Отделы
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("organizations")}
                    className={`flex-1 px-3 py-2 text-xs font-medium transition ${
                      activeTab === "organizations"
                        ? "border-b-2 border-indigo-500 text-indigo-600 bg-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <svg className="w-4 h-4 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    Организации
                  </button>
                </div>

                <div className="p-2 max-h-80 overflow-y-auto">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                    }}
                    onFocus={() => setIsExpanded(true)}
                    placeholder={
                      activeTab === "users" ? "Поиск участников..." :
                      activeTab === "departments" ? "Поиск отделов..." :
                      "Поиск организаций..."
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 mb-2"
                  />
                  
                  {/* Список участников */}
                  {activeTab === "users" && (
                    usersLoading || membersLoading ? (
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
                    )
                  )}
                  
                  {/* Список отделов */}
                  {activeTab === "departments" && (
                    filteredDepartments.length === 0 ? (
                      <div className="p-4 text-center text-sm text-slate-500">
                        {searchQuery ? "Отделы не найдены" : "Нет доступных отделов"}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {filteredDepartments.map((dept) => {
                          const deptUserCount = users.filter(u => 
                            u.department_ids?.includes(dept.id) || u.department_id === dept.id
                          ).length;
                          
                          return (
                            <button
                              key={dept.id}
                              type="button"
                              onClick={() => addDepartment(dept.id)}
                              className="w-full flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                            >
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 flex-shrink-0">
                                <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-900 truncate">{dept.name}</p>
                                {dept.description && (
                                  <p className="text-[0.65rem] text-slate-500 truncate">{dept.description}</p>
                                )}
                                <p className="text-[0.65rem] text-indigo-600 font-medium mt-0.5">
                                  {deptUserCount} {deptUserCount === 1 ? "участник" : deptUserCount < 5 ? "участника" : "участников"}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )
                  )}
                  
                  {/* Список организаций */}
                  {activeTab === "organizations" && (
                    filteredOrganizations.length === 0 ? (
                      <div className="p-4 text-center text-sm text-slate-500">
                        {searchQuery ? "Организации не найдены" : "Нет доступных организаций"}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {filteredOrganizations.map((org) => {
                          const orgUserCount = users.filter(u => 
                            u.organization_ids?.includes(org.id) || u.organization_id === org.id
                          ).length;
                          
                          return (
                            <button
                              key={org.id}
                              type="button"
                              onClick={() => addOrganization(org.id)}
                              className="w-full flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                            >
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 flex-shrink-0">
                                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-900 truncate">{org.name}</p>
                                <p className="text-[0.65rem] text-indigo-600 font-medium mt-0.5">
                                  {orgUserCount} {orgUserCount === 1 ? "участник" : orgUserCount < 5 ? "участника" : "участников"}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )
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
      
      {/* Групповые участники */}
      {selectedGroupParticipants.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700">Группы:</h4>
          <div className="flex flex-wrap gap-2">
            {selectedGroupParticipants.map((group) => {
              const groupInfo = getGroupInfo(group.group_type, group.group_id);
              const icon = group.group_type === "department" ? "👥" : "🏛️";
              
              return (
                <div
                  key={`${group.group_type}-${group.group_id}`}
                  className="group flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 pr-2 transition hover:border-indigo-300 hover:bg-indigo-100"
                >
                  <span className="text-sm">{icon}</span>
                  <span className="text-sm font-medium text-slate-900">
                    {groupInfo.name}
                  </span>
                  <span className="rounded-full bg-indigo-200 px-2 py-0.5 text-[0.65rem] font-semibold text-indigo-700">
                    {groupInfo.memberCount} {groupInfo.memberCount === 1 ? "участник" : groupInfo.memberCount < 5 ? "участника" : "участников"}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeGroupParticipant(group.group_type, group.group_id)}
                      className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-indigo-200 hover:text-slate-600"
                      title="Удалить группу"
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
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ Группы: уведомления будут отправлены всем участникам, без проверки занятости
          </p>
        </div>
      )}

      {/* Поиск */}
      {!readOnly && (
        <div className="relative" ref={dropdownRef}>
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
            <div className="absolute z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
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

