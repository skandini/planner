"use client";

import { useState, useEffect } from "react";
import type { Calendar, CalendarMember, CalendarRole } from "@/types/calendar.types";
import type { UserProfile } from "@/types/user.types";
import { calendarApi } from "@/lib/api/calendarApi";
import { userApi } from "@/lib/api/userApi";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { ROLE_LABELS } from "@/lib/constants";

interface CalendarMembersManagerProps {
  calendar: Calendar;
  authFetch: AuthenticatedFetch;
  onClose: () => void;
  onUpdate: () => void;
}

export function CalendarMembersManager({
  calendar,
  authFetch,
  onClose,
  onUpdate,
}: CalendarMembersManagerProps) {
  const [members, setMembers] = useState<CalendarMember[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingMember, setAddingMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<CalendarRole>("viewer");
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [calendar.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersData, usersData] = await Promise.all([
        calendarApi.getMembers(authFetch, calendar.id),
        userApi.list(authFetch),
      ]);
      setMembers(membersData);
      // Исключаем уже добавленных участников и владельца
      const ownerId = calendar.owner_id;
      const memberIds = new Set(membersData.map((m) => m.user_id));
      setUsers(
        usersData.filter(
          (u) => u.id !== ownerId && !memberIds.has(u.id),
        ),
      );
    } catch (err) {
      console.error("Failed to load data:", err);
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить данные",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) {
      setError("Выберите пользователя");
      return;
    }
    setAddingMember(true);
    setError(null);
    try {
      await calendarApi.addMember(authFetch, calendar.id, selectedUserId, selectedRole);
      await loadData();
      onUpdate();
      setSelectedUserId("");
      setSelectedRole("viewer");
    } catch (err) {
      console.error("Failed to add member:", err);
      setError(
        err instanceof Error ? err.message : "Не удалось добавить участника",
      );
    } finally {
      setAddingMember(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: CalendarRole) => {
    setUpdatingMemberId(userId);
    setError(null);
    try {
      await calendarApi.updateMemberRole(authFetch, calendar.id, userId, newRole);
      await loadData();
      onUpdate();
    } catch (err) {
      console.error("Failed to update role:", err);
      setError(
        err instanceof Error ? err.message : "Не удалось изменить роль",
      );
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm("Вы уверены, что хотите удалить этого участника из календаря?")) {
      return;
    }
    setRemovingMemberId(userId);
    setError(null);
    try {
      await calendarApi.removeMember(authFetch, calendar.id, userId);
      await loadData();
      onUpdate();
    } catch (err) {
      console.error("Failed to remove member:", err);
      setError(
        err instanceof Error ? err.message : "Не удалось удалить участника",
      );
    } finally {
      setRemovingMemberId(null);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur"
      style={{ animation: 'fadeIn 0.2s ease-out forwards' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-[0_20px_80px_rgba(15,23,42,0.35)] flex flex-col"
        style={{ animation: 'fadeInUp 0.3s ease-out forwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-6 flex-shrink-0">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
              Управление участниками
            </p>
            <h2 className="mt-1 text-2xl font-semibold">{calendar.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Добавление нового участника */}
          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Добавить участника
            </h3>
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-lime-500"
                disabled={addingMember || users.length === 0}
              >
                <option value="">Выберите пользователя</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email} ({user.email})
                  </option>
                ))}
              </select>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as CalendarRole)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-lime-500"
                disabled={addingMember}
              >
                <option value="viewer">Наблюдатель</option>
                <option value="editor">Редактор</option>
              </select>
              <button
                type="button"
                onClick={handleAddMember}
                disabled={addingMember || !selectedUserId || users.length === 0}
                className="rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-lime-400 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {addingMember ? "Добавление..." : "Добавить"}
              </button>
            </div>
            {users.length === 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Все пользователи уже добавлены в календарь
              </p>
            )}
          </div>

          {/* Список участников */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Участники календаря
            </h3>
            {loading ? (
              <p className="text-sm text-slate-500">Загружаем участников...</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-slate-500">
                В календаре пока нет участников
              </p>
            ) : (
              <div className="space-y-2">
                {members.map((member) => {
                  const isOwner = member.user_id === calendar.owner_id;
                  return (
                    <div
                      key={member.user_id}
                      className={`flex items-center justify-between rounded-lg border p-3 ${
                        isOwner
                          ? "border-lime-300 bg-lime-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">
                            {member.full_name || member.email}
                          </p>
                          {isOwner && (
                            <span className="rounded-full bg-lime-500 px-2 py-0.5 text-[0.65rem] font-semibold text-white">
                              Владелец
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">{member.email}</p>
                      </div>
                      {!isOwner && (
                        <div className="flex items-center gap-2">
                          <select
                            value={member.role}
                            onChange={(e) =>
                              handleUpdateRole(
                                member.user_id,
                                e.target.value as CalendarRole,
                              )
                            }
                            disabled={updatingMemberId === member.user_id}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-lime-500 disabled:opacity-60"
                          >
                            <option value="viewer">Наблюдатель</option>
                            <option value="editor">Редактор</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.user_id)}
                            disabled={removingMemberId === member.user_id}
                            className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {removingMemberId === member.user_id
                              ? "Удаление..."
                              : "Удалить"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

